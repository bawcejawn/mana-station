// Tests of the helper's background (input checks, rate limit, counting) and of the client encoder, in Node with a
// stand-in for the browser's extension APIs and for the Koinos node.
//   node helper/wallet-helper/build.mjs testnet && node helper/wallet-helper/test/test_background.mjs
import fs from "fs"; import path from "path"; import vm from "vm"; import { fileURLToPath } from "url";
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "testnet");
let pass = 0, fail = 0; const ok = (c, name) => { (c ? pass++ : fail++); console.log((c ? "PASS " : "FAIL ") + name); };

// --- client encoder edge cases
const client = {}; vm.runInNewContext(fs.readFileSync(path.join(dist, "client.js"), "utf8"), Object.assign(client, { globalThis: client, TextDecoder, fetch: () => { throw new Error("no"); } }));
const M = client.ManaStation;
const throws = (f) => { try { f(); return false; } catch { return true; } };
ok(throws(() => M.b58decode("2".repeat(200000))), "a 200,000-character address is refused at once (no long decode)");
ok(throws(() => M.encodeArgs("1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y", [{ call_contract: { contract_id: "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", entry_point: -1, args: "" } }], 1n)), "a negative entry point is refused");
ok(throws(() => M.encodeArgs("1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y", [{ call_contract: { contract_id: "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", entry_point: 1, args: "" } }], -5n)), "a negative limit is refused");
const a = M.encodeArgs("1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y", [{ call_contract: { contract_id: "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", entry_point: 1, args: "0xAB" } }], 1n);
ok(a.length > 0, "args are read as base64url only (a string starting with 0x is not taken as hex)");

// --- background, with stand-ins for chrome.* and the node
const store = {}; const listeners = []; let rpcCalls = 0, answer = true;
const chrome = {
  runtime: { id: "ext", onMessage: { addListener: (f) => listeners.push(f) } },
  storage: { local: { get: async (d) => Object.assign({}, d, store), set: async (o) => Object.assign(store, o) } },
};
const ctx = { chrome, console, URL, TextDecoder, setTimeout, Date, BigInt, Number, Object, Array, String, JSON, Map, Promise, Error,
  fetch: async (url, opts) => { rpcCalls++; const body = JSON.parse(opts.body);
    if (body.method !== "chain.read_contract" || body.params.entry_point !== 0xda1fd8f5 || body.params.contract_id !== "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc") throw new Error("unexpected call " + opts.body);
    return { json: async () => ({ result: { result: answer ? "CAESBHBhc3M" : "" } }) }; } };
ctx.self = ctx; ctx.globalThis = ctx;
ctx.importScripts = (...files) => { for (const f of files) vm.runInContext(fs.readFileSync(path.join(dist, f), "utf8"), ctx); };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(dist, "background.js"), "utf8"), ctx);
const ask = (m, tab = 1, id = "ext") => new Promise((res) => { const r = listeners[0](m, { id, tab: { id: tab } }, res); if (r !== true) res(undefined); });
const good = { type: "would_pay", payee: "1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y", rcLimit: "19000000", operations: [{ call_contract: { contract_id: "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", entry_point: 1, args: "ChkA" } }] };
ok((await ask(good)).pay === true, "a valid question gets the station's yes, with the limit asked");
ok(store.covered === 1, "'offered today' counts only yes answers from the station");
ok((await ask(good, 1, "another-extension")) === undefined, "messages from anything but this extension are ignored");
const bad = [
  ["an upload operation", { ...good, operations: [{ upload_contract: { contract_id: "2".repeat(200000) } }] }],
  ["an operation with extra fields", { ...good, operations: [{ call_contract: good.operations[0].call_contract, set_system_call: {} }] }],
  ["a non-string args value", { ...good, operations: [{ call_contract: { ...good.operations[0].call_contract, args: { length: 3e7 } } }] }],
  ["args that aren't base64url", { ...good, operations: [{ call_contract: { ...good.operations[0].call_contract, args: "AB+/" } }] }],
  ["a bad entry point", { ...good, operations: [{ call_contract: { ...good.operations[0].call_contract, entry_point: 2 ** 33 } }] }],
  ["a bad contract address", { ...good, operations: [{ call_contract: { ...good.operations[0].call_contract, contract_id: "x" } }] }],
  ["a limit above the station's maximum", { ...good, rcLimit: "300000000" }],
  ["11 operations", { ...good, operations: Array(11).fill(good.operations[0]) }],
];
for (const [name, m] of bad) { const before = rpcCalls; const r = await ask(m); ok(r.pay === false && rpcCalls === before, "refused without asking the node: " + name); }
store.enabled = false; { const before = rpcCalls; ok((await ask(good, 2)).pay === false && rpcCalls === before, "switched off: no question asked"); } store.enabled = true;
answer = false; ok((await ask(good, 3)).pay === false, "the station says no: no"); answer = true;
let yes = 0; for (let i = 0; i < 25; i++) if ((await ask(good, 9)).pay) yes++;
ok(yes === 20, `at most 20 questions a minute per tab (got ${yes} of 25)`);
const both = await Promise.all([ask(good, 7), ask(good, 7)]);
ok(both.filter((r) => r.pay).length === 1, "one question at a time per tab");
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
