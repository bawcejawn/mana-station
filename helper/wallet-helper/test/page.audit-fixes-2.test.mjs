// audit-fixes-1, second round (AB-026): page.js and bridge.js talk over DOM events named with the per-load secret, not
// window messages, so a site whose visitor signs a transaction sees neither the question nor the secret.
// Unlike page.fc-AB014-ask-leak.test.mjs (whose fake document has no events, so page.js asks nothing there), this runs
// the real page.js and bridge.js together on one shared fake document, in both load orders, and checks the helper
// still works. No network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const BRIDGE = fs.readFileSync(new URL("../src/bridge.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const CFG = { network: "mainnet", chainId: CHAIN, station: STATION, version: "0.3.1", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://unrelated-dapp.example";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q", APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
// (AB-038: page.js passes answers on in a task of its own, so flush also lets short timers run.)
const flush = async (n = 40) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };
const plain = (x) => JSON.parse(JSON.stringify(x));

/** One page: a document both worlds share, the page's world (page.js, then the site's script) and the extension's
 *  isolated world (bridge.js, with a stand-in background that says "pay"). */
function page(bridgeFirst, standIn = false) {
  const attrs = {}, listeners = [], log = [], asked = [];
  const doc = new EventTarget();
  doc.documentElement = { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  const main = { setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto, document: doc, EventTarget, CustomEvent,
    addEventListener(t, fn) { if (t === "message") listeners.push(fn); } };
  let self = main;
  main.postMessage = function (msg) { log.push(msg); const ev = { data: msg, source: self, origin: ORIGIN }; setImmediate(() => { for (const l of listeners.slice()) l(ev); }); };
  main.window = main;
  const mctx = vm.createContext(main); self = vm.runInContext("globalThis", mctx);
  const iso = { document: doc, CustomEvent, JSON, crypto: globalThis.crypto, Uint8Array, Array,
    window: { location: { origin: ORIGIN }, postMessage: main.postMessage, addEventListener: main.addEventListener },
    chrome: { storage: { local: { get: async (d) => d }, onChanged: { addListener() {} } },
      runtime: { sendMessage: async (m) => { asked.push(m); return { pay: true, rcLimit: m.rcLimit }; } } } };
  const runPage = () => vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), mctx, { filename: "page.js" });
  const runBridge = () => vm.runInNewContext(BRIDGE, iso, { filename: "bridge.js" });
  // standIn: instead of bridge.js, a bridge that reads events through the native getter saved now. (In this fake both
  // worlds share one CustomEvent class; in a browser the extension's world has its own, which page scripts can't patch.)
  const nativeDetail = Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail").get;
  const runStandIn = () => {
    const t = attrs["data-ms-helper"]; delete attrs["data-ms-helper"];
    doc.addEventListener("ms-ask-" + t, (ev) => { const d = JSON.parse(nativeDetail.call(ev)); asked.push(d);
      setImmediate(() => doc.dispatchEvent(new CustomEvent("ms-answer-" + t, { detail: JSON.stringify({ id: d.id, pay: true, rcLimit: d.rcLimit }) }))); });
  };
  if (standIn) { runPage(); runStandIn(); }
  else if (bridgeFirst) { runBridge(); runPage(); } else { runPage(); runBridge(); }
  return { self, ctx: mctx, doc, attrs, listeners, log, asked };
}
const request = () => ({ id: "req-1", command: "signer:signTransaction", to: "popup",
  args: { signerAddress: ME, transaction: { header: { chain_id: CHAIN, rc_limit: "20000000" }, operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] } } });

for (const bridgeFirst of [false, true]) {
  const order = bridgeFirst ? "bridge.js first" : "page.js first";
  test(`${order}: the site sees no question, answer or secret, and the station still becomes the payer`, async () => {
    const p = page(bridgeFirst);
    assert.equal(Object.keys(p.attrs).length, 0, "the secret is gone from the DOM before any site script runs");
    // The site's script: every window message, and the event names it could guess.
    const seen = [];
    p.listeners.push((ev) => { const d = ev.data; if (d && typeof d === "object" && !d.command && !("result" in d)) seen.push(plain(d)); });
    for (const t of ["ms-ask", "ms-answer", "ms-ask-", "ms-answer-", "message", "__manaStation"]) p.doc.addEventListener(t, (ev) => seen.push(t));
    p.self.postMessage(request(), "*");
    await flush();
    assert.deepEqual(seen, [], "the site saw " + JSON.stringify(seen));
    assert.equal(p.asked.length, 1, "the extension got the question");
    const out = p.log.filter((m) => m && m.command && m.to === "popup");
    assert.equal(out.length, 1, "one request to the wallet");
    const h = plain(out[0]).args.transaction.header;
    assert.equal(h.payer, STATION); assert.equal(h.payee, ME); assert.equal(h.rc_limit, "20000000");
  });
}

test("a site that replaces CustomEvent.prototype.detail after load reads nothing of the answer", async () => {
  const p = page(false, true);
  const peeked = [];
  vm.runInContext("(" + function (out) {
    const d = Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail");
    Object.defineProperty(CustomEvent.prototype, "detail", { configurable: true, get() { out.push(this.type); return d.get.call(this); } });
  } + ")", p.ctx)(peeked);
  p.self.postMessage(request(), "*");
  await flush();
  assert.deepEqual(peeked.filter((t) => /^ms-/.test(t)), [], "page.js read the answer through the site's getter");
  assert.equal(plain(p.log.filter((m) => m && m.command)[0]).args.transaction.header.payer, STATION);
});

test("an answer posted to the window is ignored, even with the right id (only the private channel is read)", async () => {
  // The test (not the site) takes the secret, as bridge.js would, to learn the question's id; it never answers on the
  // channel, only on the window.
  const attrs = {}, listeners = [], log = [];
  const doc = new EventTarget(); const add = doc.addEventListener.bind(doc);
  doc.documentElement = { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  const main = { setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto, document: doc, EventTarget, CustomEvent,
    addEventListener(t, fn) { if (t === "message") listeners.push(fn); } };
  let self = main;
  main.postMessage = function (msg) { log.push(msg); const ev = { data: msg, source: self, origin: ORIGIN }; setImmediate(() => { for (const l of listeners.slice()) l(ev); }); };
  main.window = main;
  const ctx = vm.createContext(main); self = vm.runInContext("globalThis", ctx);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), ctx, { filename: "page.js" });
  const token = attrs["data-ms-helper"]; delete attrs["data-ms-helper"];
  const seen = [];
  add("ms-ask-" + token, (ev) => { const d = JSON.parse(ev.detail); seen.push(d.id); self.postMessage({ __manaStation: "answer", id: d.id, pay: true, rcLimit: d.rcLimit }); });
  self.postMessage(request(), "*");
  await flush();
  assert.equal(seen.length, 1, "the question went out on the private channel");
  assert.equal(log.filter((m) => m && m.command).length, 0, "still waiting: the window answer didn't count");
  await new Promise((r) => setTimeout(r, 3300));
  const out = log.filter((m) => m && m.command);
  assert.equal(out.length, 1, "after 3 s the request goes to the wallet");
  assert.equal(plain(out[0]).args.transaction.header.payer, undefined, "unchanged");
});
