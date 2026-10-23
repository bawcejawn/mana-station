// audit-fixes-1, third round (AB-038): a site that replaces built-ins and puts getters / setters on prototypes learns
// nothing of the helper's private channel. The site installs traps before it asks the wallet to sign; every trap looks
// for the per-load secret in what it can reach (`this`, its arguments, window.event). The helper must still work.
// Harness: page.audit-fixes-2's fake (one shared document, page.js in the page's world) plus the browser rule that
// window.event is the current event while a listener registered from the page's world runs. No network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const CFG = { network: "mainnet", chainId: CHAIN, station: STATION, version: "0.3.2", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://unrelated-dapp.example";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q", APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
const flush = async (n = 60) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };
const plain = (x) => JSON.parse(JSON.stringify(x));
const nativeAdd = EventTarget.prototype.addEventListener;

function page(pay, noRc = false) {
  const attrs = {}, listeners = [], log = [], asked = [];
  const main = {};
  class MainET extends EventTarget {
    addEventListener(type, fn, opts) {
      // (Reflect.apply from this realm: a browser invokes listeners natively, never through the page's Function.prototype.call.)
      const wrapped = function (ev) { const prev = main.event; main.event = ev; try { return Reflect.apply(fn, this, [ev]); } finally { main.event = prev; } };
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
  const t = (() => { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); const tok = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      const add = EventTarget.prototype.addEventListener, off = EventTarget.prototype.removeEventListener;   // audit-2026-10 W1-01: the event handshake
      const give = () => doc.dispatchEvent(new CustomEvent("ms-hello-b", { detail: tok })); const onP = () => { off.call(doc, "ms-hello-p", onP); give(); };
      add.call(doc, "ms-hello-p", onP); give(); return tok; })();
  const nativeDetail = Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail").get;
  // Stand-in bridge (the extension's world: plain EventTarget registration, so no window.event). Answers `pay`.
  nativeAdd.call(doc, "ms-ask-" + t, (ev) => { const d = JSON.parse(nativeDetail.call(ev)); asked.push(d);
    setImmediate(() => doc.dispatchEvent(new CustomEvent("ms-answer-" + t, { detail: JSON.stringify(pay ? (noRc ? { id: d.id, pay: true } : { id: d.id, pay: true, rcLimit: d.rcLimit }) : { id: d.id, pay: false }) }))); });
  return { self, ctx, log, asked, token: t };
}
const request = (id) => ({ id, command: "signer:signTransaction", to: "popup",
  args: { signerAddress: ME, transaction: { header: { chain_id: CHAIN, rc_limit: "20000000" }, operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] } } });

// The site's traps: everything a page script can put in the helper's way after the helper has loaded.
const TRAPS = "(" + function (seen) {
  const look = (x, depth) => {
    if (depth > 4 || x === null || x === undefined) return;
    if (typeof x === "string") { seen.push(x); return; }
    if (typeof x !== "object" && typeof x !== "function") return;
    let ks = []; try { ks = Object.getOwnPropertyNames(x); } catch (e) { return; }
    for (const k of ks.slice(0, 50)) { let v; try { const d = Object.getOwnPropertyDescriptor(x, k); v = d && "value" in d ? d.value : undefined; } catch (e) { continue; } look(v, depth + 1); }
  };
  let busy = false;                                       // the traps' own scanning must not trigger the traps
  const note = (self, args) => { if (busy) return; busy = true;
    try { const e = window.event; if (e) { seen.push(String(e.type)); look(e.detail, 0); } look(self, 0); for (let i = 0; i < args.length; i++) look(args[i], 0); } catch (x) {} finally { busy = false; } };
  const getter = (proto, k) => Object.defineProperty(proto, k, { configurable: true, get() { note(this, []); return undefined; }, set(v) { note(this, [v]); } });
  for (const k of ["then", "id", "pay", "rcLimit", "toJSON", "detail", "bubbles", "cancelable", "composed", "0", "1", "2", "type", "payee", "operations"]) getter(Object.prototype, k);
  for (const k of ["toJSON", "0", "1"]) getter(Array.prototype, k);
  const RA = Reflect.apply;
  const wrap = (obj, k) => { const f = obj[k]; obj[k] = function (...a) { note(this, a); return RA(f, this, a); }; };
  wrap(Promise.prototype, "then"); wrap(Promise.prototype, "catch"); wrap(Array.prototype, "concat"); wrap(Array.prototype, "push");
  wrap(Array.prototype, "slice"); wrap(Array.prototype, "join"); wrap(Array.prototype, "map"); wrap(RegExp.prototype, "exec"); wrap(RegExp.prototype, "test");
  wrap(String.prototype, "slice"); wrap(String.prototype, "padStart"); wrap(String.prototype, "charCodeAt"); wrap(String.prototype, "indexOf");
  wrap(Number.prototype, "toString"); wrap(JSON, "parse"); wrap(JSON, "stringify"); wrap(Object, "keys"); wrap(Object, "create");
  wrap(Function.prototype, "call"); wrap(Function.prototype, "apply"); wrap(Function.prototype, "bind");
  Object.defineProperty(Promise.prototype, "constructor", { configurable: true, get() { note(this, []); return Promise; } });
} + ")";

for (const pay of [true, false]) {
  test(`a site with getters and replaced built-ins never reaches the secret (station says ${pay ? "yes" : "no"}); the helper still works`, async () => {
    const p = page(pay); const seen = [];
    vm.runInContext(TRAPS, p.ctx)(seen);
    for (const id of ["req-1", "req-2"]) { p.self.postMessage(request(id), "*"); await flush(); }
    assert.equal(p.asked.length, 2, "setup: the extension was asked twice");
    const hits = seen.filter((s) => s.includes(p.token) || s.indexOf("ms-ask-") === 0 || s.indexOf("ms-answer-") === 0);
    assert.deepEqual(hits, [], "AB-038: a site trap saw the private channel");
    const out = p.log.filter((m) => m && m.command && m.to === "popup");
    assert.equal(out.length, 2, "both requests reached the wallet");
    for (const m of out) assert.equal(plain(m).args.transaction.header.payer, pay ? STATION : undefined, pay ? "station set as payer" : "unchanged");
  });
}

test("an answer missing a field never runs a getter the site put on Object.prototype", async () => {
  const p = page(true, true); const seen = [];     // a "yes" without rcLimit
  vm.runInContext("(" + function (out) {
    Object.defineProperty(Object.prototype, "rcLimit", { configurable: true, get() { out.push(window.event ? String(window.event.type) : "(no event)"); return undefined; } });
  } + ")", p.ctx)(seen);
  p.self.postMessage(request("req-1"), "*"); await flush();
  assert.deepEqual(seen, [], "the helper read an inherited rcLimit");
});
