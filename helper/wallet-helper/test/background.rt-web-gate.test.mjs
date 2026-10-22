// audit-fixes-1: copied from the Audit Bot run; only the sandbox paths (/app/...) are made relative to this file.
// Red team (web attacker) against the extension's background (the only part with network access). A page reaches it
// only through bridge.js -> chrome.runtime.sendMessage. These tests check AUDIT.md M2 / L1 claims: only this
// extension's own scripts are answered, inputs are strictly checked before any RPC call, one question at a time per
// tab, and the answer only echoes the checked limit. Mostly controls (expected to pass), plus one robustness check:
// a hung RPC call must not lock a tab out for good.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SRC = fs.readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
const STATION = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q";
const APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
const CFG = { network: "mainnet", rpc: "https://api.koinos.io", chainId: "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==",
  station: STATION, maxRc: "300000000", site: "https://bawcejawn.github.io/mana-station/", version: "0.3.1",
  targets: ["popup"], defaultRc: "50000000", minRc: "1000000" };

function load({ wouldPay } = {}) {
  let onMsg = null; const calls = [], store = { enabled: true };
  const g = {
    setTimeout, clearTimeout,          // audit-fixes-1 harness fix: an MV3 service worker has timers; the fake global lacked them
    importScripts() {},
    chrome: {
      runtime: { id: "our-extension-id", onMessage: { addListener(f) { onMsg = f; } } },
      storage: { local: { get: async (d) => ({ ...d, ...store }), set: async (o) => { Object.assign(store, o); } } },
    },
    MS_CONFIG: CFG,
    ManaStation: { wouldPay: wouldPay || (async (a) => { calls.push(a); return { pay: true, route: "pass" }; }) },
  };
  g.self = g;
  vm.runInContext(SRC, vm.createContext(g), { filename: "background.js" });
  const ask = (m, sender = { id: "our-extension-id", tab: { id: 7 } }, ms = 500) => new Promise((resolve) => {
    const async_ = onMsg(m, sender, (a) => resolve(JSON.parse(JSON.stringify(a))));
    if (async_ !== true) resolve("ignored");
    else setTimeout(() => resolve("no answer"), ms);
  });
  return { ask, calls, store };
}
const msg = (over = {}) => ({ type: "would_pay", payee: ME, rcLimit: "20000000",
  operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }], ...over });

test("control: messages from another extension are ignored", async () => {
  const b = load();
  assert.equal(await b.ask(msg(), { id: "someone-else", tab: { id: 7 } }), "ignored");
  assert.equal(b.calls.length, 0);
});

test("control: a valid question is answered with the same (checked) limit", async () => {
  const b = load();
  assert.deepEqual(await b.ask(msg()), { pay: true, rcLimit: "20000000" });
  assert.equal(b.calls[0].station, STATION); assert.equal(b.calls[0].rpc, CFG.rpc);
});

const bad = {
  "limit above the station maximum": { rcLimit: "300000001" },
  "limit as a number": { rcLimit: 20000000 },
  "an upload operation": { operations: [{ upload_contract: { contract_id: APP } }] },
  "an extra key in an operation": { operations: [{ call_contract: { contract_id: APP, entry_point: 1 }, upload_contract: {} }] },
  "11 operations": { operations: Array.from({ length: 11 }, () => ({ call_contract: { contract_id: APP, entry_point: 1 } })) },
  "a non-base58 payee": { payee: "0xdeadbeef" },
  "a negative entry point": { operations: [{ call_contract: { contract_id: APP, entry_point: -1 } }] },
  "standard base64 args": { operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "ab+/" } }] },
  "args over 64 KiB": { operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "A".repeat(87383) } }] },
};
for (const [what, over] of Object.entries(bad)) {
  test(`control: ${what} is refused without any RPC call`, async () => {
    const b = load();
    assert.deepEqual(await b.ask(msg(over)), { pay: false });
    assert.equal(b.calls.length, 0);
  });
}

test("control: switched off means no RPC call", async () => {
  const b = load(); b.store.enabled = false;
  assert.deepEqual(await b.ask(msg()), { pay: false });
  assert.equal(b.calls.length, 0);
});

test("a node that never answers does not lock the tab out for good", async () => {
  let n = 0;
  const b = load({ wouldPay: () => { n++; return n === 1 ? new Promise(() => {}) : Promise.resolve({ pay: true }); } });
  b.ask(msg());                                       // first question hangs (no fetch timeout in mana-station-client.js:76)
  await new Promise((r) => setTimeout(r, 50));
  const second = await b.ask(msg(), undefined, 4000);
  assert.deepEqual(second, { pay: true, rcLimit: "20000000" },
    "background.js:26/44: busy[tab] is only cleared when wouldPay settles; with no fetch timeout one hung RPC call makes every later question from that tab answer pay:false");
});
