// Mana Station TESTNET run (Harbinger only). NOT YET RUN: the testnet RPC was down and the faucet is Discord-only.
// Usage: RPC=<harbinger json-rpc url> node run_tests.mjs [deploy|measure|all]
// Safety: refuses any chain whose id is mainnet's; uses only keys from ./keys.testnet.json.
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { Provider, Signer, Contract, Transaction } = require("../contracts/station/node_modules/koilib");
import fs from "fs";
const MAINNET_ID = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3e8vTn5"; // first chars are enough to refuse mainnet
const K = JSON.parse(fs.readFileSync(new URL("./keys.testnet.json", import.meta.url)));
const OUT = new URL("./results.json", import.meta.url);
const R = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { runs: [] };
const save = () => fs.writeFileSync(OUT, JSON.stringify(R, null, 2));
const M = 100_000_000n;
if (!process.env.RPC) throw new Error("set RPC to a Harbinger endpoint");
const provider = new Provider([process.env.RPC]);
const chainId = await provider.getChainId();
if (chainId.startsWith(MAINNET_ID.slice(0, 20))) throw new Error("MAINNET chain id — refusing");
if (!process.env.KOIN_ADDR) throw new Error("set KOIN_ADDR to the Harbinger KOIN contract (from the testnet docs/explorer)");
const KOIN_ADDR = process.env.KOIN_ADDR;
const S = (r) => { const s = Signer.fromWif(K[r].wif); s.provider = provider; return s; };
const rc = async (a) => BigInt(await provider.getAccountRc(a));
const ST = K.station.address, OWN = K.owner.address, APP = K.app.address, U1 = K.user1.address, U2 = K.user2.address;
const abiS = JSON.parse(fs.readFileSync(new URL("../contracts/station/abi/station.koilib.json", import.meta.url)));
const abiA = JSON.parse(fs.readFileSync(new URL("../contracts/testapp/abi/testapp.koilib.json", import.meta.url)));
const app = (signer) => new Contract({ id: APP, abi: abiA, provider, signer });
const sta = (signer) => new Contract({ id: ST, abi: abiS, provider, signer });
const log = (k, v) => { console.log(k, v); R.runs.push({ t: new Date().toISOString(), k, v: String(v) }); save(); };

async function send(contract, fn, args, opts) {
  try {
    const { transaction, receipt } = await contract.functions[fn](args, { ...opts, sendTransaction: true });
    await transaction.wait("byBlock", 60000);
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used), receipt };
  } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 200) }; }
}
const sponsored = (who, rcLimit) => ({ payer: ST, payee: who, rcLimit: String(rcLimit) });
const self = (rcLimit) => ({ rcLimit: String(rcLimit) });

async function deploy() {
  // 1) fund from the funder (Carl sent 50 tKOIN): station 30 (≈17 Mana upload EST + test spend), app 10 (≈8 Mana upload EST), owner 3, users 1 each; funder keeps ≈5 for fees
  const kc = new Contract({ id: KOIN_ADDR, abi: require("../contracts/station/node_modules/koilib").utils.tokenAbi, provider, signer: S("funder") });
  for (const [to, amt] of [[ST, 30n], [APP, 10n], [OWN, 3n], [U1, 1n], [U2, 1n]]) log("fund " + to, (await send(kc, "transfer", { from: K.funder.address, to, value: String(amt * M) }, self(5n * M))).ok);
  // 2) uploads. Station: ONLY authorizes_transaction_application.
  const a = new Contract({ id: APP, abi: abiA, provider, signer: S("app"), bytecode: fs.readFileSync(new URL("../contracts/testapp/build/release/contract.wasm", import.meta.url)) });
  log("deploy testapp", (await a.deploy({ rcLimit: String(25n * M) }).then(r => r.transaction.wait()).then(() => true).catch(e => e.message)));
  const s = new Contract({ id: ST, abi: abiS, provider, signer: S("station"), bytecode: fs.readFileSync(new URL("../contracts/station/build/release/contract.wasm", import.meta.url)) });
  log("deploy station", (await s.deploy({ authorizesTransactionApplication: true, authorizesCallContract: false, authorizesUploadContract: false, rcLimit: String(40n * M) }).then(r => r.transaction.wait()).then(() => true).catch(e => e.message)));
  // 3) init (station key), apps 50/50, entries. TEST-ONLY sizing for 50 tKOIN: floor 3 Mana. Mainnet values stay floor 6,000, hard_max 3, etc.
  const cfg = { owner: OWN, paused: false, floor: String(3n * M), hard_max: String(3n * M), per_min: 5, cooldown_ms: "600000", day_actions: 25, day_mana: String(60n * M), new_actions: 10, new_mana: String(25n * M), new_pct: 25, max_ops: 2, refill_pct: 20, budget_base: "0" };
  log("init", (await send(sta(S("station")), "init", { config: cfg }, self(5n * M))).ok);
  const o = sta(S("owner"));
  log("app1", (await send(o, "set_app", { app: 1, value: { share_pct: 50, active: true } }, self(3n * M))).ok);
  log("app2", (await send(o, "set_app", { app: 2, value: { share_pct: 50, active: true } }, self(3n * M))).ok);
  for (const fn of ["play", "heavy", "boom"]) log("entry " + fn, (await send(o, "set_entry", { contract_id: APP, entry_point: abiA.methods[fn].entry_point, value: { app: 1, cap: String(3n * M), max_args: 64 } }, self(3n * M))).ok);
}

async function measure() {
  const u1 = app(S("user1"));
  // Baseline (self-paid) vs sponsored: authorize overhead = difference.
  const a = await send(u1, "play", { user: U1 }, self(3n * M)); log("self play rc", a.rc);
  const b = await send(u1, "play", { user: U1 }, sponsored(U1, 3n * M)); log("sponsored play rc", b.rc); log("authorize overhead (play)", b.rc - a.rc);
  const c = await send(u1, "heavy", { user: U1, items: 5 }, self(3n * M)); log("self heavy(5) rc", c.rc);
  const d = await send(u1, "heavy", { user: U1, items: 5 }, sponsored(U1, 3n * M)); log("sponsored heavy(5) rc", d.rc);
  // Refusals cost the station nothing.
  const before = await rc(ST); // regen only adds, so "after >= before" proves 0 charged
  log("refuse unapproved ep", (await send(u1, "nope", {}, sponsored(U1, 3n * M))).ok === false);
  log("refuse over cap", (await send(u1, "play", { user: U1 }, sponsored(U1, 3n * M + 1n))).ok === false);
  const kc = new Contract({ id: KOIN_ADDR, abi: require("../contracts/station/node_modules/koilib").utils.tokenAbi, provider, signer: S("user1") });
  log("refuse token transfer", (await send(kc, "transfer", { from: U1, to: U2, value: "1" }, sponsored(U1, 3n * M))).ok === false);
  log("station Mana not reduced by refusals", (await rc(ST)) >= before);
  // Reverted but included: charged, counters persist.
  log("boom (included, reverted)", JSON.stringify(await send(u1, "boom", {}, sponsored(U1, 3n * M))));
  // Per-minute + cooldown (user2), one per block.
  const u2 = app(S("user2")); const res = [];
  for (let i = 0; i < 6; i++) res.push((await send(u2, "play", { user: U2 }, sponsored(U2, 3n * M))).ok);
  log("user2 6 quick plays", res.join(","));
  log("user2 record", JSON.stringify((await sta(null).functions.get_user({ user: U2 })).result));
  // Floor: raise floor to current Mana → refused.
  const o = sta(S("owner")); const st = (await sta(null).functions.get_status({})).result;
  const cfg = { ...st.config, floor: String(BigInt(st.mana)) };
  await send(o, "set_config", { config: cfg }, self(3n * M));
  log("refuse below floor", (await send(u1, "play", { user: U1 }, sponsored(U1, 3n * M))).ok === false);
  // Kill switch paid by the station (owner as payee), below the floor.
  log("pause via station-paid owner tx", (await send(o, "set_paused", { paused: true }, sponsored(OWN, 3n * M))).ok);
  log("refuse while paused", (await send(u1, "play", { user: U1 }, sponsored(U1, 3n * M))).ok === false);
  log("unpause", (await send(o, "set_paused", { paused: false }, sponsored(OWN, 3n * M))).ok);
  await send(o, "set_config", { config: { ...cfg, floor: String(3n * M) } }, self(3n * M));
}
const step = process.argv[2] || "all";
if (step === "balance") { console.log("funder Mana (≈ liquid tKOIN)", String(await rc(K.funder.address))); process.exit(0); }
if (step === "deploy" || step === "all") await deploy();
if (step === "measure" || step === "all") await measure();

// Read-only first step: funder balance (no signing).
export async function balance() { console.log("funder Mana", await rc(K.funder.address)); }
