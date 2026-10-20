// Mana Station TESTNET (Harbinger) scenarios, v2 interface (escrow, 5% ticket fee, suspend, tickets, buffer, anti-spam).
// Usage: RPC=https://testnet.koinosfoundation.org node testnet/run_tests.mjs
// SAFETY: runs only against the Koinos testnet chain id (and refuses mainnet's); only uses throwaway keys from testnet/keys.testnet.json
// (in CI written from the TESTNET_KEYS secret); the stablecoin is a worthless mock token deployed by this script.
// Never prints private keys. Every check is recorded PASS/FAIL and the run continues, to keep reruns to a minimum.
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { Provider, Signer, Contract, Transaction, utils } = require("../contracts/station/node_modules/koilib");
import fs from "fs"; import crypto from "crypto";

const MAINNET_ID_PREFIX = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3e";
const TESTNET_ID = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=="; // Koinos testnet (Carl, Oct 19 10:05 PM)
const RPC = process.env.RPC || "https://testnet.koinosfoundation.org";
const K = JSON.parse(fs.readFileSync(new URL("./keys.testnet.json", import.meta.url)));
const provider = new Provider([RPC]);
const chainId = await provider.getChainId();
if (chainId.startsWith(MAINNET_ID_PREFIX)) throw new Error("MAINNET chain id: refusing");
if (chainId !== TESTNET_ID) throw new Error(`not the Koinos testnet (chain id ${chainId}): refusing`);
const M = 100_000_000n;
const fmt = (v) => (typeof v === "bigint" ? `${v} (${(Number(v) / 1e8).toFixed(5)} Mana)` : String(v));
const R = { chainId, rpc: RPC, started: new Date().toISOString(), checks: [], costs: {}, notes: [] };
const OUT = new URL("./results.json", import.meta.url);
const save = () => fs.writeFileSync(OUT, JSON.stringify(R, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
// A refusal for low wallet Mana ("insufficient pending account resources", code 104) means the station never saw the tx:
// such a "refused" check proves nothing, so it is recorded as an INCONCLUSIVE failure, never a pass.
const check = (area, name, pass, detail = "") => {
  if (pass && /"code":104|insufficient pending account resources/.test(String(detail))) { pass = false; detail = "INCONCLUSIVE (wallet low on Mana, the station never saw it): " + detail; } R.checks.push({ area, name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} [${area}] ${name} ${detail}`); save(); return !!pass; };
const cost = (k, v) => { R.costs[k] = v; console.log(`COST ${k} = ${fmt(v)}`); save(); };
const note = (s) => { R.notes.push(s); console.log("NOTE " + s); save(); };

const S = (r) => { const s = Signer.fromWif(K[r].wif); s.provider = provider; return s; };
const A = (r) => K[r].address;
const ST = A("station"), OWN = A("owner"), APP = A("app"), TOK = A("token"), FUN = A("funder");
const U1 = A("user1"), U2 = A("user2"), BUY = A("buyer"), SP1 = A("spam1"), SP2 = A("spam2");
const rc = async (a) => BigInt(await provider.getAccountRc(a));
const KOIN = process.env.KOIN_ADDR || await provider.invokeGetContractAddress("koin").then((r) => r?.value?.address || r?.address).catch(() => null); // koilib wraps the answer in { value }
if (!KOIN) throw new Error("could not resolve the testnet KOIN address (name service); set KOIN_ADDR (testnet: 1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju)");
const rd = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const abiS = rd("../contracts/station/abi/station.koilib.json"), abiA = rd("../contracts/testapp/abi/testapp.koilib.json"), abiT = rd("../contracts/mocktoken/abi/mocktoken.koilib.json");
const wasm = (p) => fs.readFileSync(new URL(p, import.meta.url));
const C = (id, abi, who) => new Contract({ id, abi, provider, signer: who ? S(who) : undefined });
const koinC = (who) => new Contract({ id: KOIN, abi: utils.tokenAbi, provider, signer: S(who) });
const ep = (abi, fn) => abi.methods[fn].entry_point;
const coSign = (role) => async (tx) => { await S(role).signTransaction(tx); };
const eventsOf = (rcpt) => (rcpt?.events || []).map((e) => e.name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One tx. opts: payer/payee/rcLimit; cosigner = role that signs as payer (when payer != signer and payer is a key account).
// The station allows one sponsored tx per user per block, so consecutive sponsored txs for the same user wait for a new block.
const lastH = new Map();
async function nextBlockFor(payer, payee) {
  if (payer !== ST || !payee) return;
  for (let i = 0; i < 40; i++) { const h = BigInt((await provider.getHeadInfo()).head_topology.height); if (!lastH.has(payee) || h > lastH.get(payee)) { lastH.set(payee, h + 1n); return; } await sleep(1500); }
}
async function send(contract, fn, args, { payer, payee, rcLimit, cosigner } = {}) {
  await nextBlockFor(payer, payee);
  try {
    const o = { sendTransaction: true, rcLimit: String(rcLimit ?? M) };
    if (payer) o.payer = payer; if (payee) o.payee = payee; if (cosigner) o.beforeSend = coSign(cosigner);
    const { transaction, receipt } = await contract.functions[fn](args, o);
    await transaction.wait("byBlock", 90000);
    return { ok: !receipt.reverted, reverted: !!receipt.reverted, rc: BigInt(receipt.rc_used), events: eventsOf(receipt), receipt, logs: receipt.logs };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
async function sendOps(signer, ops, { payer, payee, rcLimit, cosigner } = {}) {
  await nextBlockFor(payer, payee);
  try {
    const options = { rcLimit: String(rcLimit ?? M) }; if (payer) options.payer = payer; if (payee) options.payee = payee; if (cosigner) options.beforeSend = coSign(cosigner);
    const tx = new Transaction({ signer: S(signer), provider, options });
    for (const [c, fn, a] of ops) await tx.pushOperation(c.functions[fn], a);
    const receipt = await tx.send(); await tx.wait("byBlock", 90000);
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used), events: eventsOf(receipt), receipt, logs: receipt.logs };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
const sponsored = (who, rcLimit) => ({ payer: ST, payee: who, rcLimit });
const read = async (c, fn, a = {}) => (await c.functions[fn](a)).result || {};
const sta = (who) => C(ST, abiS, who), app = (who) => C(APP, abiA, who), tok = (who) => C(TOK, abiT, who);
// Owner admin: try the station-sponsored owner path (kill-switch route) first, else owner self-paid.
async function admin(fn, args, rcLimit = 2n * M) {
  let r = await send(sta("owner"), fn, args, sponsored(OWN, rcLimit));
  if (!r.ok && !r.reverted) { const r2 = await send(sta("owner"), fn, args, { rcLimit: 3n * M }); r2.viaSelf = true; r2.firstError = r.error; r = r2; }
  return r;
}
const tbal = async (a) => BigInt((await read(C(TOK, abiT), "balance_of", { owner: a })).value || 0);

// ---------------------------------------------------------------- 0. preflight
console.log(`chain ${chainId}  rpc ${RPC.replace(/apikey=[^&]+/, "apikey=***")}  KOIN ${KOIN}`); // never print the API key
const kbal = async (a) => BigInt((await new Contract({ id: KOIN, abi: utils.tokenAbi, provider }).functions.balanceOf({ owner: a })).result?.value || 0);
note("wallets (public addresses): " + ["funder", "station", "owner", "buyer", "user1", "user2", "spam1", "spam2", "token", "app"].map((r) => `${r} ${A(r)}`).join(", "));
const fb = await kbal(FUN);
check("preflight", "funder 1N6yd5… holds tKOIN", fb > 0n, `${Number(fb) / 1e8} tKOIN, Mana ${Number(await rc(FUN)) / 1e8}`);
const meta = await provider.invokeGetContractMetadata(ST).catch(() => null);
if (meta?.value?.hash) note(`station account already has a contract (hash ${meta.value.hash}): a prior run (ours or another assistant's, e.g. Clover) touched it`);

// ---------------------------------------------------------------- 1. deploys (paid by the funder, before it sends KOIN out)
// Upload rc limit sized from the chain's real resource prices (bytes × (disk + network) cost, + 1 Mana for compute), × 1.5.
// A flat 30 Mana was refused ("insufficient pending account resources") once the funder had sent KOIN out.
const LIM = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
const rcFor = (bytes) => (BigInt(bytes) * (BigInt(LIM.disk_storage_cost) + BigInt(LIM.network_bandwidth_cost)) + M) * 3n / 2n;
note(`resource prices: disk ${LIM.disk_storage_cost}/B, network ${LIM.network_bandwidth_cost}/B, compute ${LIM.compute_bandwidth_cost}/tick; funder Mana now ${Number(await rc(FUN)) / 1e8}`);
async function deploy(role, path, abi, extra = {}) {
  // Skip when the chain already has exactly this bytecode (hash = 0x1220 + sha256), so reruns don't spend Mana again.
  const want = "0x1220" + crypto.createHash("sha256").update(wasm(path)).digest("hex");
  const have = (await provider.invokeGetContractMetadata(A(role)).catch(() => null))?.value?.hash;
  if (have === want) return { ok: true, rc: 0n, skipped: true };
  const c = new Contract({ id: A(role), abi, provider, signer: S(role), bytecode: wasm(path) });
  // The funder pays every upload (an uninitialized station refuses to pay for anything, by design).
  // For the station the funder is also the payee (its nonce): a station contract already on chain decides whether the
  // station's own txs are approved, and the pre-fix version refused them before init (testnet find, Oct 20).
  const pay = { payer: FUN, payee: role === "station" ? FUN : A(role), beforeSend: coSign("funder") };
  try {
    const { transaction, receipt } = await c.deploy({ ...pay, rcLimit: String(rcFor(wasm(path).length)), ...extra });
    await transaction.wait("byBlock", 120000); return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used) };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
for (const [role, path, abi, extra] of [["token", "../contracts/mocktoken/build/release/contract.wasm", abiT, {}],
  ["app", "../contracts/testapp/build/release/contract.wasm", abiA, {}],
  ["station", "../contracts/station/build/testnet/contract.wasm", abiS, { authorizesTransactionApplication: true }]]) {
  const r = await deploy(role, path, abi, extra);
  check("deploy", `${role} (${wasm(path).length} B)`, r.ok, r.skipped ? "already on chain (same bytecode)" : (r.error || "")); if (r.ok && !r.skipped) cost(`upload ${role} (${wasm(path).length} bytes)`, r.rc);
}
const stMeta = await provider.invokeGetContractMetadata(ST).catch(() => null);
check("deploy", "station: only authorizes_transaction_application", stMeta?.value?.authorizes_transaction_application && !stMeta?.value?.authorizes_call_contract && !stMeta?.value?.authorizes_upload_contract, JSON.stringify(stMeta?.value || {}).slice(0, 200));
if (!stMeta?.value?.hash) { note("station contract is not on chain, so nothing after the deploy step can run: stopping"); save(); process.exit(1); }

// ---------------------------------------------------------------- 2b. funding (after the uploads, while the funder still has its full Mana)
const want = { [ST]: 21n, [BUY]: 5n, [U1]: 4n, [A("user2")]: 3n, [OWN]: 3n, [SP1]: 2n, [SP2]: 2n }; // station >= its koin_amount (20)
const RESERVE = 5n * M;                                    // the funder keeps this much Mana for the uploads and mints it pays
for (const [to, amt] of Object.entries(want)) {
  const have = await kbal(to); const need = amt * M - have;
  if (need > M / 10n && (await rc(FUN)) - need < RESERVE) { note(`skip funding ${to.slice(0, 6)}…: funder Mana ${Number(await rc(FUN)) / 1e8} would drop below the ${Number(RESERVE) / 1e8} reserve (top it up from the faucet)`); continue; }
  if (need > M / 10n) check("fund", `fund ${to.slice(0, 6)}… to ${amt} tKOIN`, (await send(koinC("funder"), "transfer", { from: FUN, to, value: String(need) }, { rcLimit: 2n * M })).ok, `${Number(need) / 1e8}`);
}
await sleep(4000);


// ---------------------------------------------------------------- 3. init (provisional config for the measurements)
const koinAmt = 20n * M;                 // configured capacity → daily budget 4 Mana (20%)
const base = { owner: OWN, paused: false, koin_amount: String(koinAmt), refill_bp: 2000, admin_min: String(M / 2n), hard_max: String(2n * M),
  per_min: 10, cooldown_ms: "60000", day_actions: 50, day_mana: String(40n * M), new_actions: 50, new_mana: String(40n * M), new_pct: 100, max_ops: 2,
  big_max: String(5n * M), big_cooldown_ms: "86400000", big_week_cap: String(15n * M), big_max_debt: String(10n * M), big_ticket_ms: "0",
  max_allowances: 4, max_days: "30", buffer_bp: 0, alert_mana: "0", ticket_fee_bp: 0 };
const st0 = await read(sta(), "get_status").catch(() => ({}));
if (st0.config?.owner) note(`station already initialized (owner ${st0.config.owner}); reconfiguring with set_config`);
else { const x = await send(sta("station"), "init", { config: base }, { payer: FUN, payee: FUN, cosigner: "funder", rcLimit: 3n * M }); /* station key signs the call; funder pays and is the payee */ check("init", "init (station key, funder pays)", x.ok, x.error || (x.reverted ? "reverted" : "")); }
if (st0.config?.owner) { const x = await admin("set_config", { config: base }); check("init", "set_config provisional", x.ok, x.error || (x.reverted ? "reverted" : "")); }
const errOf = (x) => x.error || (x.reverted ? "reverted" : "") || (x.firstError ? `sponsored path: ${x.firstError}` : "");
let r;
r = await admin("set_app", { app: 1, value: { reserved_mana: String(3n * M), active: true } }); check("init", "set_app 1 (measurement app)", r.ok, (r.viaSelf ? "owner self-paid " : "station-sponsored owner path ") + errOf(r));
r = await admin("set_app", { app: 2, value: { reserved_mana: String(M / 2n), active: true } }); check("init", "set_app 2 (Stories)", r.ok, errOf(r));
check("init", "set_exempt testapp → app 1, strict", (await admin("set_exempt", { contract_id: APP, value: { app: 1, strict: true } })).ok);
for (const fn of ["play", "heavy", "boom"]) check("init", `set_entry ${fn}`, (await admin("set_entry", { contract_id: APP, entry_point: ep(abiA, fn), value: { app: 1, cap: String(2n * M), max_args: 64 } })).ok);
check("init", "set_price mock stablecoin (testnet VUSDT)", (await admin("set_price", { token: TOK, value: { active: true, max_per_purchase: String(1000n * M), price_1d: "3000000", price_7d: "20000000", price_30d: "75000000", big_per_1000: "5000000", big_min_mana: String(M / 10n) } })).ok);
r = await admin("set_price", { token: KOIN, value: { active: true, max_per_purchase: "1", price_1d: "1", price_7d: "1", price_30d: "1", big_per_1000: "1", big_min_mana: "1" } });
check("money", "set_price(KOIN) refused (only vUSDT/vUSDC)", !r.ok, r.error || (r.reverted ? "reverted" : ""));
const st1 = await read(sta(), "get_status"); note(`status after init: mana ${st1.mana}, daily_budget ${st1.daily_budget}, sold_capacity ${st1.sold_capacity}`);

// ---------------------------------------------------------------- 4. measurements (user1; Kondor-style margin)
const selfPlay = await send(app("user1"), "play", { user: U1 }, { rcLimit: 2n * M });
check("measure", "self-paid play", selfPlay.ok, selfPlay.error || ""); if (selfPlay.ok) cost("play, self-paid", selfPlay.rc);
const sp = await send(app("user1"), "play", { user: U1 }, sponsored(U1, 1n * M));
check("measure", "sponsored play accepted (authorize)", sp.ok, sp.error || ""); if (sp.ok) cost("play, sponsored", sp.rc);
if (sp.ok && selfPlay.ok) cost("authorize overhead (play)", sp.rc - selfPlay.rc);
const selfHeavy = await send(app("user1"), "heavy", { user: U1, items: 5 }, { rcLimit: 2n * M }); if (selfHeavy.ok) cost("heavy(5), self-paid", selfHeavy.rc);
const sh = await send(app("user1"), "heavy", { user: U1, items: 5 }, sponsored(U1, 2n * M)); if (sh.ok) cost("heavy(5), sponsored", sh.rc);
if (sh.ok && selfHeavy.ok) cost("authorize overhead (heavy 5)", sh.rc - selfHeavy.rc);
const ceil11 = (x) => (x * 11n + 9n) / 10n;
const L = sp.ok ? ((ceil11(sp.rc) + 999_999n) / 1_000_000n) * 1_000_000n : 50_000_000n; // Kondor-style 1.1x, rounded up to 0.01 Mana
cost("L = rc_limit used for every Stories play (1.1x sponsored play, rounded up)", L);
const kon = await send(app("user1"), "play", { user: U1 }, sponsored(U1, ceil11(sp.rc || 1n)));
check("measure", "sponsored play at exactly 1.1x measured rc (Kondor margin) is accepted and fits", kon.ok, kon.ok ? `used ${kon.rc} of limit ${ceil11(sp.rc || 1n)} (${(Number(kon.rc) / Number(ceil11(sp.rc || 1n)) * 100).toFixed(1)}%)` : kon.error);
const bm = await send(app("user1"), "boom", {}, sponsored(U1, L));
check("measure", "allowlisted entry that reverts is included and charged to the station", bm.reverted === true || (!bm.ok && !bm.error), bm.error || `rc ${bm.rc}`); if (bm.rc) cost("boom (reverted, charged)", bm.rc);

// ---------------------------------------------------------------- 5. Stories app (app 2): spam, new-user pool, buffer
const H = sh.ok ? ceil11(sh.rc) : 2n * M;
const stKoin = await kbal(ST); let koin2 = 60n * L > koinAmt ? 60n * L : koinAmt; if (koin2 > stKoin) koin2 = stKoin; const B = koin2 * 2000n / 10000n; // budget ≥ 12L, never above the station's real KOIN
if (B < 7n * L) note(`budget ${B} < 7L (${7n * L}): the Stories reservation checks below will fail; fund the station with more tKOIN`);
const cfg2 = { ...base, koin_amount: String(koin2), hard_max: String(2n * M > H ? 2n * M : H), per_min: 3, cooldown_ms: "600000", new_actions: 10, new_mana: String(30n * L), new_pct: 50, buffer_bp: 5000 };
check("stories", "set_config: per_min 3, 10 min cooldown, new-user pool 50%, buffer 50%", (await admin("set_config", { config: cfg2 })).ok);
check("stories", "set_app 2 (Stories) reserved 4L", (await admin("set_app", { app: 2, value: { reserved_mana: String(4n * L), active: true } })).ok);
check("stories", "set_app 1 reserved so that sellable = 3L", (await admin("set_app", { app: 1, value: { reserved_mana: String(B - 7n * L), active: true } })).ok);
check("stories", "set_exempt testapp → app 2 (Stories), strict", (await admin("set_exempt", { contract_id: APP, value: { app: 2, strict: true } })).ok);
check("stories", "set_entry play cap = L", (await admin("set_entry", { contract_id: APP, entry_point: ep(abiA, "play"), value: { app: 2, cap: String(L), max_args: 64 } })).ok);
const appInfo = await read(sta(), "get_app", { app: 2 }); note(`Stories allowance ${appInfo.allowance} used ${appInfo.used_24h} (limit with 50% buffer = 6L = ${6n * L}; new-user pool 50% = 3L)`);
const s1 = []; for (let i = 0; i < 4; i++) s1.push(await send(app("spam1"), "play", { user: SP1 }, sponsored(SP1, L)));
check("stories", "spam1 (new user): 3 plays/min accepted, 4th refused (rate limit → cooldown)", s1.slice(0, 3).every((x) => x.ok) && !s1[3].ok, s1.map((x) => (x.ok ? "ok" : "refused")).join(","));
const s2a = await send(app("spam2"), "play", { user: SP2 }, sponsored(SP2, L));
check("stories", "spam2 (another new user) refused: new users together capped at 50% of the Stories limit", !s2a.ok, s2a.error || "");
const capOver = await send(app("user2"), "play", { user: U2 }, sponsored(U2, L + 1n));
check("stories", "rc_limit above the entry cap refused", !capOver.ok, capOver.error || "");
const twice = await Promise.all([0, 1].map(() => app("user2").functions.play({ user: U2 }, { sendTransaction: true, payer: ST, payee: U2, rcLimit: String(L) }).then(() => "ok").catch((e) => "refused")));
note(`user2 two plays submitted together: ${twice.join(",")} (second in the same block / same nonce should be refused)`);
await sleep(4000);
check("stories", "raise new-user pool to 100% (phase 2: buffer)", (await admin("set_config", { config: { ...cfg2, new_pct: 100 } })).ok);
const s2 = []; for (let i = 0; i < 3; i++) s2.push(await send(app("spam2"), "play", { user: SP2 }, sponsored(SP2, L)));
const bufEv = s2.filter((x) => x.events?.includes("station.buffer_used")).length;
check("stories", "spam2 plays accepted until the 50% buffer; buffer_used events emitted", s2.some((x) => x.ok) && bufEv >= 1, `${s2.map((x) => (x.ok ? "ok" : "refused")).join(",")}; buffer_used events ${bufEv}; events ${JSON.stringify(s2.map((x) => x.events || []))}`);
const appAfter = await read(sta(), "get_app", { app: 2 }); note(`Stories used_24h ${appAfter.used_24h} / allowance ${appAfter.allowance}`);
const over = await send(app("user1"), "play", { user: U1 }, sponsored(U1, L));
check("stories", "Stories past allowance + buffer refused", !over.ok || BigInt(appAfter.used_24h || 0) + L <= 6n * L, over.error || "accepted (still within limit)");

// ---------------------------------------------------------------- 6. only designated apps
const m0 = await rc(ST);
const nd = [
  ["testapp.nope (not allowlisted, strict app)", () => send(app("user2"), "nope", {}, sponsored(U2, L))],
  ["mock token transfer (non-designated contract)", () => send(tok("user2"), "transfer", { from: U2, to: U1, value: "0" }, sponsored(U2, L))],
  ["KOIN transfer (non-designated contract)", () => send(koinC("user2"), "transfer", { from: U2, to: U1, value: "1" }, sponsored(U2, L))],
  ["2 ops: Stories play + token transfer (mixed targets)", () => sendOps("user2", [[app("user2"), "play", { user: U2 }], [tok("user2"), "transfer", { from: U2, to: U1, value: "0" }]], sponsored(U2, L))],
  ["upload_contract with no ticket", async () => { try { const c = new Contract({ id: U2, abi: abiA, provider, signer: S("user2"), bytecode: wasm("../contracts/testapp/build/release/contract.wasm") }); const { transaction } = await c.deploy({ payer: ST, payee: U2, rcLimit: String(L) }); await transaction.wait("byBlock", 60000); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; } }],
];
for (const [name, fn] of nd) { const x = await fn(); check("designated", `refused: ${name}`, !x.ok, x.error || (x.reverted ? "included+reverted" : "ACCEPTED")); }
check("designated", "refusals cost the station 0 Mana (Mana did not drop)", (await rc(ST)) >= m0, `${m0} → ${await rc(ST)}`);

const koinSt0 = await kbal(ST);
// paying app for route B: the testapp bytecode uploaded to spam2's address by spam2 itself (funder pays). Not exempt.
const PAYAPP = SP2;
{ const c = new Contract({ id: SP2, abi: abiA, provider, signer: S("spam2"), bytecode: wasm("../contracts/testapp/build/release/contract.wasm") });
  try { const { transaction } = await c.deploy({ payer: FUN, payee: SP2, rcLimit: String(rcFor(wasm("../contracts/testapp/build/release/contract.wasm").length)), beforeSend: coSign("funder") }); await transaction.wait("byBlock", 120000); check("escrow", "deploy paying app (non-exempt testapp copy)", true); }
  catch (e) { check("escrow", "deploy paying app (non-exempt testapp copy)", false, String(e.message).slice(0, 200)); } }
const unpaid = await send(C(PAYAPP, abiA, "user1"), "play", { user: U1 }, sponsored(U1, L));
check("designated", "app without a paid allowance refused", !unpaid.ok, unpaid.error || "");
// ---------------------------------------------------------------- 7. escrow: allowance purchase / reservation refusal / suspend / cancel
for (const to of [BUY, U1]) { const x = await send(tok("token"), "mint", { to, value: String(1000n * M) }, { payer: FUN, payee: TOK, cosigner: "funder" }); check("escrow", `mint 1,000 tUSDT to ${to.slice(0, 6)}…`, x.ok, x.error || (x.reverted ? "reverted: " + JSON.stringify(x.logs || []) : "")); }
const stE = await read(sta(), "get_status"); note(`sold_capacity ${stE.sold_capacity} (expected 3L = ${3n * L})`);
const qBig = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(4n * L), days: "7" });
check("escrow", "quote above the sellable slice: not available (reservations protected)", !qBig.available, qBig.reason || JSON.stringify(qBig));
const q = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(2n * L), days: "7" });
check("escrow", "quote 2L/day × 7 d available, refundable, no auto-renew", q.available && q.refundable && !q.auto_renew, `price ${q.price}`);
const price = BigInt(q.price || 0);
const buyA = (mpd, appSigns = true) => sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: PAYAPP, mana_per_day: String(mpd), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: 3n * M, cosigner: appSigns ? "spam2" : undefined }); // audit #3: the app co-signs
const bigBuy = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 4n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: PAYAPP, mana_per_day: String(4n * L), days: "7", token: TOK, max_price: String(price * 4n) }]], { rcLimit: 3n * M, cosigner: "spam2" });
check("escrow", "buy_allowance above the sellable slice refused", !bigBuy.ok, bigBuy.error || "");
const noSig = await buyA(2n * L, false);
check("escrow", "audit #3: buy_allowance without the target app's signature refused (no squatting someone else's app)", !noSig.ok, noSig.error || "");
const ba = await buyA(2n * L);
check("escrow", "buy_allowance 2L/day × 7 d (approve + pull in one tx), allowance_bought event", ba.ok && ba.events.includes("station.allowance_bought"), ba.error || `rc ${ba.rc} events ${ba.events}`); if (ba.ok) cost("buy_allowance tx (approve + buy)", ba.rc);
const aid = 1;
const xfer = () => send(C(PAYAPP, abiA, "user1"), "play", { user: U1 }, sponsored(U1, L));
const b1 = await xfer(); check("escrow", "paying app (app allowance): its users' txs sponsored from its allowance", b1.ok, b1.error || `rc ${b1.rc}`); if (b1.ok) cost("play on paying app, sponsored by its allowance", b1.rc);
const acc = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 2, target: U1, mana_per_day: String(2n * L), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: 3n * M });
check("designated", "account allowance (kind 2) refused (Carl, 9:09 PM)", !acc.ok, acc.error || "");
const tokT = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: TOK, mana_per_day: String(L), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: 3n * M });
check("designated", "allowance targeting a token contract refused", !tokT.ok, tokT.error || "");
const tr = await send(tok("user1"), "transfer", { from: U1, to: U2, value: "1" }, sponsored(U1, L));
check("designated", "token transfer by a paying app's user still refused", !tr.ok, tr.error || "");
const su = await admin("suspend_allowance", { buyer: BUY, reason: 1 });
check("suspend", "owner suspends buyer (reason 1 abuse), buyer_suspended event", su.ok && su.events.includes("station.buyer_suspended"), su.error || su.events);
const b2 = await xfer(); check("suspend", "suspended buyer's allowance no longer sponsors", !b2.ok, b2.error || "");
const mix = await sendOps("user1", [[C(PAYAPP, abiA, "user1"), "play", { user: U1 }], [app("user1"), "play", { user: U1 }]], sponsored(U1, L));
check("designated", "mixed targets (paying app + Carl's Stories) refused", !mix.ok, mix.error || "");
const sc = await send(sta("buyer"), "cancel_allowance", { buyer: BUY, id: aid }, { rcLimit: 3n * M }); check("suspend", "suspended buyer cannot self-cancel", !sc.ok, sc.error || "");
const us = await admin("unsuspend_allowance", { buyer: BUY, reason: 0 });
check("suspend", "unsuspend, buyer_unsuspended event", us.ok && us.events.includes("station.buyer_unsuspended"), us.error || us.events);
const b3 = await xfer(); check("suspend", "after unsuspend: sponsored again", b3.ok, b3.error || "");
const preRel = await send(sta("user1"), "release", { purchase_id: 1 }, { rcLimit: 2n * M });
check("escrow", "release before the term ends refused", !preRel.ok, preRel.error || "");
const bb0 = await tbal(BUY);
const ca = await send(sta("buyer"), "cancel_allowance", { buyer: BUY, id: aid }, { rcLimit: 3n * M });
const refundA = (await tbal(BUY)) - bb0, expA = price * 6n / 7n;
check("escrow", "cancel day 0 of 7: refund = floor(paid × 6/7) (current day used), escrow_refunded event", ca.ok && refundA === expA && ca.events.includes("station.escrow_refunded"), `paid ${price} refund ${refundA} expected ${expA} ${ca.error || ""}`);
const b4 = await xfer(); note(`after cancel, same day: allowance ${b4.ok ? "still sponsors (current day was paid)" : "no longer sponsors"}`);

// ---------------------------------------------------------------- 8. big-upload tickets: buffer, fee, anti-spam
const stT = await read(sta(), "get_status"); const mana = BigInt(stT.mana), bigFloor = BigInt(stT.big_floor);
let T = 5n * M; if (mana - bigFloor - M < T) T = mana - bigFloor - M; T = T / 1_000_000n * 1_000_000n;
note(`ticket size T = ${fmt(T)} (station mana ${fmt(mana)}, big floor ${fmt(bigFloor)})`);
const qb = await read(sta(), "quote_big_upload", { token: TOK, mana: String(T) }); const tprice = BigInt(qb.price || 0);
check("ticket", "quote_big_upload available, refundable; terms describe the 24 h lock, the 5% fee and stablecoin-only refunds", qb.available && /24-hour/.test(qb.terms || "") && /5%/.test(qb.terms || "") && /never in Mana or KOIN/.test(qb.terms || ""), `price ${tprice} reason ${qb.reason || ""}`);
const buyT = (who, payee) => sendOps(who, [[tok(who), "approve", { owner: A(who), spender: ST, value: String(tprice) }], [sta(who), "buy_big_upload", { buyer: A(who), payee, mana: String(T), token: TOK, max_price: String(tprice), allow_upload: true }]], { rcLimit: 3n * M });
const t1 = await buyT("buyer", U2);
check("ticket", "buyer buys a ticket for user2 (big_upload_bought event)", t1.ok && t1.events.includes("station.big_upload_bought"), t1.error || t1.events); if (t1.ok) cost("buy_big_upload tx (approve + buy)", t1.rc);
const code = wasm("../contracts/testapp/build/release/contract.wasm");
let up = { ok: false };
try { const c = new Contract({ id: U2, abi: abiA, provider, signer: S("user2"), bytecode: code }); const { transaction, receipt } = await c.deploy({ payer: ST, payee: U2, rcLimit: String(T) }); await transaction.wait("byBlock", 120000); up = { ok: !receipt.reverted, rc: BigInt(receipt.rc_used) }; } catch (e) { up = { ok: false, error: String(e.message).slice(0, 300) }; }
check("ticket", `big tx (${code.length} B contract upload, > 1 KiB) sponsored via ticket: authorize read the tx with the enlarged buffer`, up.ok, up.error || `rc ${up.rc}`); if (up.ok) cost(`ticket upload of ${code.length} B contract`, up.rc);
const tk = await read(sta(), "get_ticket", { payee: U2 }); const used = BigInt(tk.ticket?.mana || 0) - BigInt(tk.ticket?.remaining || 0);
note(`ticket after upload: mana ${tk.ticket?.mana} remaining ${tk.ticket?.remaining} (charged = rc_used)`);
const ob0 = await tbal(OWN), bb1 = await tbal(BUY);
const ct = await send(sta("buyer"), "cancel_big_upload", { buyer: BUY, payee: U2 }, { rcLimit: 3n * M });
const ref1 = (await tbal(BUY)) - bb1, rel1 = (await tbal(OWN)) - ob0;
// Refund (Carl, 8:43 PM) = floor(floor(paid × time left / lock) × unused / ticket Mana), keeping >= 5%. The exact
// "time left" depends on block times, so accept the formula for anywhere from 0 to 10 minutes elapsed of the 24 h lock.
const LOCK = 86_400_000n, fee95 = tprice * 9500n / 10000n;
const refAt = (elapsed) => { const r = (tprice * (LOCK - elapsed) / LOCK) * (T - used) / (T > 0n ? T : 1n); return r < fee95 ? r : fee95; };
const expHi = refAt(0n), expLo = refAt(600_000n);
check("ticket", "cancel minutes into the 24 h lock: refund = unused share × time left (≤ 95%), rest released to the owner wallet, refund in tUSDT only", ct.ok && ref1 >= expLo && ref1 <= expHi && ref1 + rel1 === tprice, `paid ${tprice} used ${used}/${T} refund ${ref1} (expected ${expLo}..${expHi}) released ${rel1} events ${ct.events} ${ct.error || ""}`);
const debt = BigInt((await read(sta(), "get_status")).big_debt || 0);
check("ticket", "unused ticket Mana returned to the pool (only used Mana stays as debt)", debt <= used, `big_debt ${debt}, used ${used}`);
const t2 = await buyT("buyer", SP1);
check("ticket", "anti-spam: one ticket per buyer per 24 h (counted from the purchase)", !t2.ok, t2.error || "");
const t3 = await buyT("user1", SP1);
check("ticket", "audit #2: another buyer can buy at once (the wait is per buyer, never station-wide)", t3.ok, t3.error || "");
const ub0 = await tbal(U1);
const ct3 = await send(sta("user1"), "cancel_big_upload", { buyer: U1, payee: SP1 }, { rcLimit: 3n * M });
const ref3 = (await tbal(U1)) - ub0;
check("ticket", "0 used, cancelled at once: the 5% fee floor applies (refund exactly 95%)", ct3.ok && ref3 === tprice * 9500n / 10000n, `refund ${ref3} of ${tprice}`);
const fee = await admin("set_config", { config: { ...cfg2, new_pct: 100, ticket_fee_bp: 2001 } });
check("ticket", "ticket_fee_bp 2001 (> 20%) refused", !fee.ok, fee.error || (fee.reverted ? "reverted" : ""));

// ---------------------------------------------------------------- 9. invariants, KOIN untouched, events summary
const tot = (await read(sta(), "get_escrow_totals", { token: TOK })).totals || {};
const held = BigInt(tot.held || 0), stTok = await tbal(ST);
check("money", "escrow held == station tUSDT balance; collected == held + refunded + released", held === stTok && BigInt(tot.collected || 0) === held + BigInt(tot.refunded || 0) + BigInt(tot.released || 0), JSON.stringify(tot) + ` station balance ${stTok}`);
const koinSt1 = await kbal(ST);
check("money", "station KOIN balance unchanged through all escrow/refund flows (no KOIN refund path)", koinSt1 === koinSt0, `${koinSt0} → ${koinSt1}`);
cost("station Mana at end", await rc(ST));
R.finished = new Date().toISOString(); save();

// ---------------------------------------------------------------- report
const pass = R.checks.filter((c) => c.pass).length, total = R.checks.length;
let md = `## Mana Station testnet run\nchain ${chainId}\n\n| area | check | result | detail |\n|---|---|---|---|\n`;
for (const c of R.checks) md += `| ${c.area} | ${c.name} | ${c.pass ? "PASS" : "**FAIL**"} | ${c.detail.replace(/\|/g, "/").slice(0, 160)} |\n`;
md += `\n**${pass}/${total} checks passed**\n\n| cost | rc (base units) | Mana |\n|---|---|---|\n`;
for (const [k, v] of Object.entries(R.costs)) md += `| ${k} | ${v} | ${(Number(v) / 1e8).toFixed(5)} |\n`;
md += `\nNotes:\n` + R.notes.map((n) => `- ${n}`).join("\n") + "\n";
console.log("\n" + md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
fs.writeFileSync(new URL("./results.md", import.meta.url), md);
process.exit(pass === total ? 0 : 1);
