// Mana Station PLAYGROUND on the Koinos testnet (Carl, Oct 20): a long-lived station to click around in.
//
//   node testnet/playground.mjs deploy                         set up the station + demo app (once; safe to re-run)
//   node testnet/playground.mjs status                         addresses, budget, connected apps, proposals
//   node testnet/playground.mjs handover <owner> <c1> <c2> <c3>  make these wallets the owner and the council
//   node testnet/playground.mjs traffic [n]                    n sponsored plays from fresh players (default 6)
//   node testnet/playground.mjs mint <address> [amount]        test stablecoin (tUSDT) to try paid allowances
//   node testnet/playground.mjs fund <koin> <usdt> <address…>   test KOIN (for Mana) and tUSDT to each address
//
// Keys: the playground's own accounts are DERIVED from the funder key in TESTNET_KEYS (sha256 of a label + the key),
// so every run gets the same accounts with nothing new to store. They are never printed. Testnet only: the script
// refuses any chain but the Koinos testnet.
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { Provider, Signer, Contract, Transaction, utils } = require("../contracts/station/node_modules/koilib");
import fs from "fs"; import crypto from "crypto";

const TESTNET_ID = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==";
const RPC = process.env.RPC || "https://testnet.koinosfoundation.org";
const provider = new Provider([RPC]);
if ((await provider.getChainId()) !== TESTNET_ID) throw new Error("not the Koinos testnet: refusing");
const K = JSON.parse(fs.readFileSync(new URL("./keys.testnet.json", import.meta.url)));
const M = 100_000_000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const derive = (label) => { const s = new Signer({ privateKey: crypto.createHash("sha256").update("mana-station-playground/" + label + "/" + K.funder.wif).digest("hex") }); s.provider = provider; return s; };
// Station generation: a new label = a brand-new station address (v2, Oct 20: wallet Mana passes). The owner and council
// labels stay the same, so the same handover command works on every generation.
const GEN = "-v2";
const KEY = { funder: Signer.fromWif(K.funder.wif), station: derive("station" + GEN), owner: derive("owner"), c1: derive("council1"), c2: derive("council2"), c3: derive("council3"), demo: derive("demoapp") };
KEY.funder.provider = provider;
const A = (r) => KEY[r].getAddress();
const ST = A("station"), FUN = A("funder"), DEMO = A("demo"), TOK = K.token.address;
const KOIN = (await provider.invokeGetContractAddress("koin")).value.address;
const rd = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const abiS = rd("../contracts/station/abi/station.koilib.json"), abiA = rd("../contracts/testapp/abi/testapp.koilib.json"), abiT = rd("../contracts/mocktoken/abi/mocktoken.koilib.json");
const wasm = (p) => fs.readFileSync(new URL(p, import.meta.url));
const out = []; const log = (s) => { out.push(s); console.log(s); };
const LIM = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
const rcFor = (bytes) => (BigInt(bytes) * (BigInt(LIM.disk_storage_cost) + BigInt(LIM.network_bandwidth_cost)) + M) * 3n / 2n;
const coSign = (role) => async (tx) => { await KEY[role].signTransaction(tx); };
const kbal = async (a) => BigInt((await new Contract({ id: KOIN, abi: utils.tokenAbi, provider }).functions.balanceOf({ owner: a })).result?.value || 0);
const sta = (role) => new Contract({ id: ST, abi: abiS, provider, signer: role ? KEY[role] : undefined });
const read = async (fn, a = {}) => (await sta().functions[fn](a)).result || {};
async function send(contract, fn, args, opts = {}) {
  try {
    const o = { rcLimit: String(opts.rcLimit ?? M) }; if (opts.payer) o.payer = opts.payer; if (opts.payee) o.payee = opts.payee; if (opts.cosigner) o.beforeSend = coSign(opts.cosigner);
    const { transaction, receipt } = await contract.functions[fn](args, o); await transaction.wait("byBlock", 90000);
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used || 0) };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 240) }; }
}
// Owner/council actions: station-sponsored when its limits allow, else paid by the funder.
const asRole = async (role, fn, args) => { let x = await send(sta(role), fn, args, { payer: ST, payee: A(role) }); if (!x.ok) x = await send(sta(role), fn, args, { payer: FUN, payee: FUN, cosigner: "funder" }); return x; };
const ok = (label, x) => { log(`${x.ok ? "OK  " : "FAIL"} ${label}${x.ok ? "" : ": " + (x.error || "reverted")}`); return x.ok; };

const cmd = process.argv[2] || "status";
const CONFIG = {
  owner: A("owner"), paused: false, koin_amount: String(100n * M), refill_bp: 2000, admin_min: String(M), hard_max: String(2n * M),
  per_min: 10, cooldown_ms: "60000", day_actions: 200, day_mana: String(20n * M), new_actions: 100, new_mana: String(10n * M), new_pct: 100, max_ops: 2,
  big_max: String(10n * M), big_cooldown_ms: "3600000", big_week_cap: String(30n * M), big_max_debt: String(10n * M), big_ticket_ms: "0",
  max_allowances: 10, max_days: "30", buffer_bp: 2000, alert_mana: String(20n * M), ticket_fee_bp: 0, max_per_buyer: 5,
  council: [A("c1"), A("c2"), A("c3")], threshold: 2, guard_delay_ms: "120000",               // 2 of 3, 2-minute wait (testnet)
};

if (cmd === "deploy") {
  // 1. fund the station (init checks its KOIN balance)
  const have = await kbal(ST);
  if (have < 110n * M) ok(`fund station ${ST} to 110 tKOIN`, await send(new Contract({ id: KOIN, abi: utils.tokenAbi, provider, signer: KEY.funder }), "transfer", { from: FUN, to: ST, value: String(110n * M - have) }, { rcLimit: M }));
  // 2. upload + init in ONE transaction, all three permissions taken over
  const meta = await provider.invokeGetContractMetadata(ST).catch(() => null);
  if (!meta?.value?.hash) {
    const code = wasm("../contracts/station/build/testnet/contract.wasm");
    try {
      const c = new Contract({ id: ST, abi: abiS, provider, signer: KEY.station, bytecode: code });
      const { operation } = await c.deploy({ onlyOperation: true, authorizesCallContract: true, authorizesTransactionApplication: true, authorizesUploadContract: true });
      const tx = new Transaction({ signer: KEY.station, provider, options: { payer: FUN, payee: FUN, rcLimit: String(rcFor(code.length) + 2n * M), beforeSend: coSign("funder") } });
      await tx.pushOperation(operation); await tx.pushOperation(sta("station").functions.init, { config: CONFIG });
      const r = await tx.send(); await tx.wait("byBlock", 120000); ok("upload + init the playground station", { ok: !r.reverted });
    } catch (e) { ok("upload + init the playground station", { ok: false, error: String(e.message).slice(0, 240) }); }
  } else log(`station already deployed (code ${meta.value.hash.slice(0, 18)}…)`);
  // 3. the demo app: a copy of the test app ("tap counter"), connected with 8 Mana a day
  const dm = await provider.invokeGetContractMetadata(DEMO).catch(() => null);
  if (!dm?.value?.hash) {
    const code = wasm("../contracts/testapp/build/release/contract.wasm");
    try { const c = new Contract({ id: DEMO, abi: abiA, provider, signer: KEY.demo, bytecode: code }); const { transaction } = await c.deploy({ payer: FUN, payee: DEMO, rcLimit: String(rcFor(code.length)), beforeSend: coSign("funder") }); await transaction.wait("byBlock", 120000); ok(`deploy demo app ${DEMO}`, { ok: true }); }
    catch (e) { ok("deploy demo app", { ok: false, error: String(e.message).slice(0, 240) }); }
  }
  const L = await read("list_connected");
  if (!(L.free_apps || []).some((a) => a.contract_id === DEMO)) ok("connect the demo app (8 Mana/day)", await asRole("owner", "connect_app", { contract_id: DEMO, mana_per_day: String(8n * M), strict: false }));
  ok("price the test stablecoin (tUSDT) for paid allowances", await asRole("owner", "set_price", { token: TOK, value: { active: true, max_per_purchase: String(1000n * M), price_1d: "3000000", price_7d: "20000000", price_30d: "75000000", big_per_1000: "5000000", big_min_mana: String(M), min_purchase: "0" } }));
}

if (cmd === "handover") {
  const [owner, ...council] = process.argv.slice(3);
  if (!owner || council.length !== 3) throw new Error("usage: handover <owner> <council1> <council2> <council3>");
  const st = await read("get_status"); const cur = st.config?.council || [];
  const mine = ["c1", "c2", "c3"].filter((r) => cur.includes(A(r)));
  if (mine.length < 2) throw new Error("the playground council is no longer ours: hand over from the console instead");
  const [p1, p2] = mine;
  const prop = async (action) => { await asRole(p1, "propose", { signer: A(p1), action }); const P = (await read("list_proposals")).proposals || []; const id = P.filter((p) => p.proposer === A(p1)).slice(-1)[0]?.id; await asRole(p2, "approve", { signer: A(p2), id }); return id; };
  const idOwner = await prop({ kind: 8, to: owner });
  const idCouncil = await prop({ kind: 4, council, threshold: 2 });
  log(`proposals #${idOwner} (owner) and #${idCouncil} (council) approved; waiting out the delay…`);
  await sleep(Number(st.config.guard_delay_ms) + 15000);
  ok(`owner → ${owner}`, await send(sta("funder"), "execute", { id: idOwner }, { rcLimit: M }));
  ok(`council → ${council.join(", ")}`, await send(sta("funder"), "execute", { id: idCouncil }, { rcLimit: M }));
}

if (cmd === "traffic") {
  const n = Number(process.argv[3] || 6);
  for (let i = 0; i < n; i++) {
    const p = new Signer({ privateKey: crypto.randomBytes(32).toString("hex") }); p.provider = provider;
    const x = await send(new Contract({ id: DEMO, abi: abiA, provider, signer: p }), "play", { user: p.getAddress() }, { payer: ST, payee: p.getAddress(), rcLimit: 19_000_000n });
    ok(`player ${p.getAddress().slice(0, 8)}… taps (free)`, x);
  }
}

if (cmd === "fund") {                       // fund <koin> <usdt> <address…>: test KOIN (for Mana) + test USDT (to buy with)
  const [koin, usdt, ...to] = process.argv.slice(3);
  const kc = new Contract({ id: KOIN, abi: utils.tokenAbi, provider, signer: KEY.funder });
  const tokKey = Signer.fromWif(K.token.wif); tokKey.provider = provider;   // a signer needs the provider to send
  const tc = new Contract({ id: TOK, abi: abiT, provider, signer: tokKey });
  for (const a of to) {
    if (Number(koin) > 0) ok(`send ${koin} tKOIN to ${a}`, await send(kc, "transfer", { from: FUN, to: a, value: String(BigInt(Math.round(Number(koin) * 1e8))) }, { rcLimit: M }));
    if (Number(usdt) > 0) ok(`mint ${usdt} tUSDT to ${a}`, await send(tc, "mint", { to: a, value: String(BigInt(Math.round(Number(usdt) * 1e8))) }, { payer: FUN, payee: TOK, cosigner: "funder", rcLimit: M }));
  }
}

if (cmd === "mint") {
  const to = process.argv[3]; const amt = BigInt(Math.round(Number(process.argv[4] || 100) * 1e8));
  ok(`mint ${Number(amt) / 1e8} tUSDT to ${to}`, await send(new Contract({ id: TOK, abi: abiT, provider, signer: Object.assign(Signer.fromWif(K.token.wif), { provider }) }), "mint", { to, value: String(amt) }, { payer: FUN, payee: TOK, cosigner: "funder", rcLimit: M }));
}

// status (always)
const st = await read("get_status"); const L = await read("list_connected"); const P = (await read("list_proposals")).proposals || [];
const info = {
  network: RPC, chain_id: TESTNET_ID, station: ST, demo_app: DEMO, test_stablecoin: TOK, koin: KOIN,
  owner: st.config?.owner, council: st.config?.council, threshold: st.config?.threshold, guard_delay_ms: st.config?.guard_delay_ms,
  station_mana: st.mana, daily_budget: L.daily_budget, reserved: L.reserved, sellable: L.sellable, sold: L.sold,
  free_apps: (L.free_apps || []).map((a) => ({ contract: a.contract_id, mana_per_day: a.mana_per_day, used_24h: a.used_24h })),
  paid: (L.paid || []).length, open_proposals: P.length, paused: !!st.config?.paused,
};
log("PLAYGROUND " + JSON.stringify(info));
fs.writeFileSync(new URL("./playground.json", import.meta.url), JSON.stringify(info, null, 2));
const md = "## Mana Station playground\n\n```\n" + out.join("\n") + "\n```\n\n```json\n" + JSON.stringify(info, null, 2) + "\n```\n";
fs.writeFileSync(new URL("./results.md", import.meta.url), md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
