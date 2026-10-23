// Audit Bot fix check of mana-station d982a24 (2026-10-22): AB-026's private channel.
// page.js resolves the waiting question's Promise with the parsed answer object INSIDE the answer event's listener.
// Resolving a Promise with an object reads its `then` property, so a site getter on Object.prototype.then runs during
// that dispatch, where `window.event` is the answer event and its `type` is "ms-answer-" + the per-load secret.
// Harness: the repo's page.audit-fixes-2 fake (one shared document, page.js in the page's world) plus the one browser
// behaviour the fake lacked: while a listener registered from the page's world runs, window.event is the current event
// (DOM "inner invoke", Chrome sets it per world). The stand-in bridge answers "no" for every question.
// Each test asserts the SAFE behaviour: it fails while the finding exists. Run: node --test <this file> (placed in
// helper/wallet-helper/test/).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const CFG = { network: "mainnet", chainId: CHAIN, station: STATION, version: "0.3.1", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://unrelated-dapp.example";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q", APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
// (AB-038: page.js passes answers on in a task of its own, so flush also lets short timers run.)
const flush = async (n = 40) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };
const plain = (x) => JSON.parse(JSON.stringify(x));
const nativeAdd = EventTarget.prototype.addEventListener;

function page() {
  const attrs = {}, listeners = [], log = [], asked = [];
  const main = {};
  // The page world's EventTarget: listeners added from this world see window.event = the event while they run.
  class MainET extends EventTarget {
    addEventListener(type, fn, opts) {
      const wrapped = function (ev) { const prev = main.event; main.event = ev; try { return fn.call(this, ev); } finally { main.event = prev; } };
      return nativeAdd.call(this, type, wrapped, opts);
    }
  }
  const doc = new MainET();
  doc.documentElement = { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  Object.assign(main, { setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto, document: doc,
    EventTarget: MainET, CustomEvent, event: undefined, addEventListener(t, fn) { if (t === "message") listeners.push(fn); } });
  let self = main;
  main.postMessage = function (msg) { log.push(msg); const ev = { data: msg, source: self, origin: ORIGIN }; setImmediate(() => { for (const l of listeners.slice()) l(ev); }); };
  main.window = main;
  const ctx = vm.createContext(main); self = vm.runInContext("globalThis", ctx);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), ctx, { filename: "page.js" });
  // Stand-in bridge (the extension's world: registered with the plain EventTarget, so no window.event): always "no".
  const t = attrs["data-ms-helper"]; delete attrs["data-ms-helper"];
  const nativeDetail = Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail").get;
  nativeAdd.call(doc, "ms-ask-" + t, (ev) => { const d = JSON.parse(nativeDetail.call(ev)); asked.push(d);
    setImmediate(() => doc.dispatchEvent(new CustomEvent("ms-answer-" + t, { detail: JSON.stringify({ id: d.id, pay: false, rcLimit: d.rcLimit }) }))); });
  return { self, ctx, doc, log, asked, token: t };
}
const request = (id) => ({ id, command: "signer:signTransaction", to: "popup",
  args: { signerAddress: ME, transaction: { header: { chain_id: CHAIN, rc_limit: "20000000" }, operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] } } });
// The site's script: a getter on Object.prototype.then that looks at window.event while it runs.
const SITE = "(" + function (out) {
  Object.defineProperty(Object.prototype, "then", { configurable: true, get() {
    const e = window.event; if (e && typeof e.type === "string" && e.type.indexOf("ms-") === 0) out.push(e.type);
    return undefined; } });
} + ")";

test("a site whose visitor signs a transaction doesn't learn the helper's per-load secret", async () => {
  const p = page(); const leaked = [];
  vm.runInContext(SITE, p.ctx)(leaked);
  p.self.postMessage(request("req-1"), "*");
  await flush();
  assert.equal(p.asked.length, 1, "setup: the extension got the question");
  assert.deepEqual(leaked, [], "FINDING: the site read the private event name " + JSON.stringify(leaked) + " (secret " + p.token + ")");
});

test("with the leaked secret, a site can't make page.js set the station as payer after the extension said no", async () => {
  const p = page(); const leaked = [];
  vm.runInContext(SITE, p.ctx)(leaked);
  p.self.postMessage(request("req-1"), "*");
  await flush();
  const name = leaked[0] || "";
  if (name) {                                    // the site answers first, on the private channel, with "yes"
    const tok = name.slice("ms-answer-".length);
    vm.runInContext("(" + function (tok) {
      document.addEventListener("ms-ask-" + tok, (ev) => { const d = JSON.parse(ev.detail);
        document.dispatchEvent(new CustomEvent("ms-answer-" + tok, { detail: JSON.stringify({ id: d.id, pay: true, rcLimit: d.rcLimit }) })); });
    } + ")", p.ctx)(tok);
  }
  p.self.postMessage(request("req-2"), "*");
  await flush();
  const out = p.log.filter((m) => m && m.command && m.to === "popup" && m.id === "req-2");
  assert.equal(out.length, 1, "setup: one request to the wallet");
  assert.equal(p.asked.length, 2, "setup: the extension was asked too (and said no)");
  assert.equal(plain(out[0]).args.transaction.header.payer, undefined, "FINDING: the station was set as payer on the site's forged yes");
});
