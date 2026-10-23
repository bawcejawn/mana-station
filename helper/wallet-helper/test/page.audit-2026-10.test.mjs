// audit-2026-10 (W1-01, W1-09, W1-10): the real page.js and bridge.js on one shared fake document, in both load orders.
//   W1-01  a page that pre-sets data-ms-helper in its HTML, or talks the handshake's events after load, learns nothing
//          and can't forge the channel; the helper still works.
//   W1-09  a payer in `options` is respected even when `optsSend` is an empty object.
//   W1-10  switched off, the helper leaves every request alone on every site (not just the Mana Station site).
// No network: the extension's background is a stand-in that says "pay".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const BRIDGE = fs.readFileSync(new URL("../src/bridge.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const CFG = { network: "mainnet", chainId: CHAIN, station: STATION, version: "0.4.0", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://unrelated-dapp.example";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q", APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", OTHER = "1N6yd5SzAQaHe484vkV7pFhmYiGfQh2Cuy";
const flush = async (n = 40) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };
const plain = (x) => JSON.parse(JSON.stringify(x));

function page({ bridgeFirst = false, enabled = true, presetAttr = null } = {}) {
  const attrs = {}, listeners = [], log = [], asked = [];
  if (presetAttr) attrs["data-ms-helper"] = presetAttr;                  // the site's own HTML: <html data-ms-helper="…">
  const doc = new EventTarget();
  doc.documentElement = { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  const main = { setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto, document: doc, EventTarget, CustomEvent,
    addEventListener(t, fn) { if (t === "message") listeners.push(fn); } };
  let self = main;
  main.postMessage = function (msg) { log.push(msg); const ev = { data: msg, source: self, origin: ORIGIN }; setImmediate(() => { for (const l of listeners.slice()) l(ev); }); };
  main.window = main;
  const mctx = vm.createContext(main); self = vm.runInContext("globalThis", mctx);
  const iso = { document: doc, CustomEvent, JSON, crypto: globalThis.crypto, Uint8Array, Array,
    chrome: { storage: { local: { get: async (d) => ({ ...d, enabled }) }, onChanged: { addListener() {} } },
      runtime: { sendMessage: async (m) => { asked.push(m); return { pay: true, rcLimit: m.rcLimit }; } } } };
  const runPage = () => vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), mctx, { filename: "page.js" });
  const runBridge = () => vm.runInNewContext(BRIDGE, iso, { filename: "bridge.js" });
  if (bridgeFirst) { runBridge(); runPage(); } else { runPage(); runBridge(); }
  return { self, ctx: mctx, doc, attrs, listeners, log, asked };
}
const request = (args) => ({ id: "req-" + Math.random(), command: "signer:signTransaction", to: "popup",
  args: { signerAddress: ME, transaction: { header: { chain_id: CHAIN, rc_limit: "20000000" }, operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] }, ...(args || {}) } });
const sentHeader = (p) => plain(p.log.filter((m) => m && m.command && m.to === "popup").pop()).args.transaction.header;

for (const bridgeFirst of [false, true]) {
  const order = bridgeFirst ? "bridge.js first" : "page.js first";
  test(`W1-01 ${order}: a pre-set data-ms-helper attribute is never used; the helper still works`, async () => {
    const p = page({ bridgeFirst, presetAttr: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    const seen = [];
    p.doc.addEventListener("ms-ask-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", () => seen.push("ask on the site's chosen secret"));
    p.self.postMessage(request(), "*"); await flush();
    assert.deepEqual(seen, [], "page.js used the secret the site chose");
    assert.equal(p.asked.length, 1); assert.equal(sentHeader(p).payer, STATION);
  });
  test(`W1-01 ${order}: after load, the handshake events give a site nothing and can't replace the secret`, async () => {
    const p = page({ bridgeFirst });
    const got = [];
    p.doc.addEventListener("ms-hello-b", (ev) => got.push(ev.detail));
    p.doc.dispatchEvent(new CustomEvent("ms-hello-p"));                 // ask for the secret
    assert.deepEqual(got, [], "a listener was left that hands out the secret");
    p.doc.dispatchEvent(new CustomEvent("ms-hello-b", { detail: "b".repeat(32) }));   // offer a secret of its own
    const forged = []; p.doc.addEventListener("ms-ask-" + "b".repeat(32), () => forged.push(1));
    p.self.postMessage(request(), "*"); await flush();
    assert.deepEqual(forged, [], "page.js switched to the site's secret");
    assert.equal(p.asked.length, 1); assert.equal(sentHeader(p).payer, STATION);
  });
}

test("W1-09: a payer in `options` is respected even when `optsSend` is an empty object", async () => {
  const p = page();
  p.self.postMessage(request({ optsSend: {}, options: { payer: OTHER } }), "*"); await flush();
  assert.equal(p.asked.length, 0, "the helper asked about a request whose payer the site chose");
  assert.equal(sentHeader(p).payer, undefined);
  p.self.postMessage(request({ optsSend: { rcLimit: "5" }, options: {} }), "*"); await flush();
  assert.equal(p.asked.length, 0);
});

test("W1-10: switched off, the helper leaves requests alone on any site", async () => {
  const p = page({ enabled: false }); await flush();
  p.self.postMessage(request(), "*"); await flush();
  assert.equal(p.asked.length, 0, "a switched-off helper still asked");
  assert.equal(sentHeader(p).payer, undefined, "a switched-off helper changed the payer");
});
