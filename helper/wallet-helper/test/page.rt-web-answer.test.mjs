// audit-fixes-1: copied from the Audit Bot run; only the sandbox paths (/app/...) are made relative to this file.
// Red team (web attacker): page.js runs in the page's own (MAIN) world, and the bridge's answer reaches it through
// window.postMessage, so any script in the page sees the "ask" (with its id) and can post its own "answer" first.
// SAFE behaviour asserted here: a forged answer cannot set a Mana limit other than the one the helper asked about
// (the real background always echoes it, background.js:43), nor one above the station maximum (CFG.maxRc).
// The other tests are controls for the claims in page.js / AUDIT.md (requests it must leave alone, frame check,
// a genuine answer); they are expected to pass and show the harness works.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q";
const APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
const CFG = { network: "mainnet", chainId: CHAIN, station: STATION, version: "0.3.1", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://dapp.example";
// (AB-038: page.js passes answers on in a task of its own, so flush also lets short timers run.)
const flush = async (n = 30) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };
const plain = (x) => JSON.parse(JSON.stringify(x));

// audit-fixes-1 harness fix: inside a vm context `window` is the context's global, not the outer sandbox object, so
// page.js saw every call (this) and every event (ev.source) as coming from another window and never rewrote anything
// (why the controls below failed in the audit run). The fake now uses the context's own global for both, as a browser
// does. No assertion changed.
// audit-fixes-1 (AB-026) harness change: questions and answers now travel as DOM events named with the per-load secret
// (not window messages), so the fake window has a document (Node's EventTarget / CustomEvent) and bridge() plays
// bridge.js: it takes the secret from the DOM attribute and answers on that channel. asks() lists the questions it got.
// The forged answers below are delivered on that channel (a site can no longer see or answer a question at all), so
// they still test page.js's own check of the answer (AB-022). No assertion changed.
function load() {
  const listeners = [], log = [], win = {}; let self = win; const attrs = {}, channel = [];
  const doc = new EventTarget();
  doc.documentElement = { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  function nativePost(msg, targetOrigin) {
    log.push({ msg, targetOrigin });
    const ev = { data: msg, source: self, origin: ORIGIN };
    setImmediate(() => { for (const l of listeners.slice()) l(ev); });
  }
  Object.assign(win, {
    postMessage: nativePost,
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto,
    document: doc, EventTarget, CustomEvent,
  });
  win.window = win;
  const ctx = vm.createContext(win); self = vm.runInContext("globalThis", ctx);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), ctx, { filename: "page.js" });
  // bridge.js's side: take the secret (and remove it), then answer each question with answer(question) (null: no answer).
  const bridge = (answer) => {
    const token = attrs["data-ms-helper"]; delete attrs["data-ms-helper"];
    doc.addEventListener("ms-ask-" + token, (ev) => {
      const d = JSON.parse(ev.detail); channel.push(d); const a = answer(d);
      if (a) setImmediate(() => doc.dispatchEvent(new CustomEvent("ms-answer-" + token, { detail: JSON.stringify(a) })));
    });
  };
  const walletRequests = () => log.filter((e) => e.msg && e.msg.command && e.msg.to === "popup").map((e) => e.msg);
  const asks = () => channel.concat(log.filter((e) => e.msg && e.msg.__manaStation === "ask").map((e) => e.msg));
  // deliver a message event as if posted by `source` (default: this same window)
  const deliver = (data, source = self) => { for (const l of listeners.slice()) l({ data, source, origin: ORIGIN }); };
  return { win: self, log, listeners, nativePost, walletRequests, asks, deliver, bridge };
}
function request(over = {}) {
  const header = { chain_id: CHAIN, rc_limit: "20000000", ...(over.header || {}) };
  const tx = { header, operations: over.operations || [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] };
  if (over.signatures) tx.signatures = over.signatures;
  const args = { signerAddress: ME, transaction: tx };
  if (over.optsSend) args.optsSend = over.optsSend;
  return { id: "req-1", command: "signer:signTransaction", to: "popup", args };
}

// ---- forged answers ----
async function forged(rcLimit) {
  const p = load();
  // The attacking script answers every ask itself, before the extension's bridge can (it no longer sees any: AB-026).
  p.listeners.push((ev) => {
    const d = ev.data;
    if (d && d.__manaStation === "ask") p.nativePost({ __manaStation: "answer", id: d.id, pay: true, rcLimit }, ORIGIN);
  });
  p.bridge((d) => ({ id: d.id, pay: true, rcLimit }));                 // the forged limit, on the private channel
  p.win.postMessage(request(), "*");
  await flush();
  const out = p.walletRequests();
  assert.equal(out.length, 1, "the request was forwarded once");
  return { asked: p.asks()[0].rcLimit, sent: plain(out[0]).args.transaction.header };
}

test("a forged answer cannot push the Mana limit above the station maximum", async () => {
  const { sent } = await forged("99999999999999999999");
  assert.ok(BigInt(sent.rc_limit) <= BigInt(CFG.maxRc),
    `page.js:69-70 accepts any 1-20 digit rcLimit from the answer; forwarded rc_limit = ${sent.rc_limit}`);
});

test("a forged answer cannot change the Mana limit the helper asked about", async () => {
  const { asked, sent } = await forged("300000000");
  assert.equal(asked, "20000000");
  assert.equal(sent.rc_limit, asked,
    "page.js:69-70 does not check that the answer's rcLimit equals the asked one (the real background always echoes it)");
});

// ---- controls (expected to pass) ----
test("control: a genuine answer sets payer=station, payee=me, keeps the asked limit and the operations", async () => {
  const p = load();
  p.bridge((d) => ({ id: d.id, pay: true, rcLimit: d.rcLimit }));
  const req = request();
  p.win.postMessage(req, "*");
  await flush();
  const h = plain(p.walletRequests()[0]).args.transaction;
  assert.equal(h.header.payer, STATION); assert.equal(h.header.payee, ME); assert.equal(h.header.rc_limit, "20000000");
  assert.deepEqual(h.operations, plain(req.args.transaction.operations));
});

test("control: an answer posted from another frame is ignored", async () => {
  const p = load();
  p.listeners.push((ev) => { const d = ev.data; if (d && d.__manaStation === "ask") p.deliver({ __manaStation: "answer", id: d.id, pay: true, rcLimit: d.rcLimit }, { other: "frame" }); });
  p.bridge(() => null);                                                 // the extension doesn't answer either
  p.win.postMessage(request(), "*");
  await flush();
  assert.equal(p.walletRequests().length, 0, "still waiting for a same-window answer (falls back after 3 s)");
  await new Promise((r) => setTimeout(r, 3300));
  const out = p.walletRequests();
  assert.equal(out.length, 1, "after 3 s the original request goes to the wallet");
  assert.equal(plain(out[0]).args.transaction.header.payer, undefined, "unchanged: no station payer");
});

const leftAlone = {
  "another network": { header: { chain_id: "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==" } },
  "another payer": { header: { payer: APP } },
  "another payee": { header: { payee: APP } },
  "already signed": { signatures: ["abc"] },
  "an upload": { operations: [{ upload_contract: { contract_id: ME, bytecode: "AA" } }] },
  "payer chosen in send options": { optsSend: { payer: ME } },
  "limit chosen in send options": { optsSend: { rcLimit: "1000" } },
};
for (const [what, over] of Object.entries(leftAlone)) {
  test(`control: ${what} is passed on at once, unchanged`, () => {
    const p = load();
    const req = request(over);
    p.win.postMessage(req, "*");
    const out = p.walletRequests();
    assert.equal(out.length, 1, "forwarded synchronously"); assert.equal(out[0], req, "the very same object");
    assert.equal(p.asks().length, 0, "nothing asked");
  });
}
