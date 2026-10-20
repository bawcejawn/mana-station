// Mana Station TESTNET (Harbinger) scenarios, v2 interface (escrow, 5% ticket fee, suspend, tickets, buffer, anti-spam).
// Usage: RPC=https://testnet.koinosfoundation.org node testnet/run_tests.mjs
// SAFETY: runs only against the Koinos testnet chain id (and refuses mainnet's); only uses throwaway keys from testnet/keys.testnet.json
// (in CI written from the TESTNET_KEYS secret); the stablecoin is a worthless mock token deployed by this script.
// Never prints private keys. Every check is recorded PASS/FAIL and the run continues, to keep reruns to a minimum.
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { Provider, Signer, Contract, Transaction, utils } = require("../contracts/station/node_modules/koilib");
import { estimateUploadRc } from "../helper/payer.js";
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
  if (pass && /"code":104|insufficient pending account resources|insufficient rc/.test(String(detail))) { pass = false; detail = "INCONCLUSIVE (Mana or rc limit too low, the station never decided): " + detail; } R.checks.push({ area, name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} [${area}] ${name} ${detail}`); save(); return !!pass; };
const cost = (k, v) => { R.costs[k] = v; console.log(`COST ${k} = ${fmt(v)}`); save(); };
const note = (s) => { R.notes.push(s); console.log("NOTE " + s); save(); };

// Fresh throwaway accounts every run (in memory only, never printed or saved): the station and the players start
// clean, so 24 h windows, cooldowns and new-user status from earlier runs can't skew the checks. The funder, owner,
// mock token and test app stay the same (their keys come from TESTNET_KEYS). Set FRESH=0 to reuse the stored keys.
const FRESH = process.env.FRESH === "0" ? [] : ["station", "user1", "user2", "buyer", "spam1", "spam2", "council1", "council2", "council3", "app3", "player3"];
// Oct 20: derived from the run id + the funder key (never random), so a run that stops early can always be swept back
// with `playground.mjs sweep <run id>`. Still fresh every run: a new run id gives new accounts.
const RUN = process.env.GITHUB_RUN_ID || String(Date.now());
for (const r of FRESH) { const k = new Signer({ privateKey: crypto.createHash("sha256").update("mana-station-run/" + RUN + "/" + r + "/" + K.funder.wif).digest("hex") }); K[r] = { address: k.getAddress(), wif: k.getPrivateKey("wif") }; }
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
  for (let i = 0; i < 40; i++) { const h = BigInt((await provider.getHeadInfo()).head_topology.height); if (!lastH.has(payee) || h > lastH.get(payee)) return; await sleep(1500); }
}
// Remember the block a sponsored tx actually landed in; the next one for that user waits until the head is past it.
const landed = (payer, payee, w) => { if (payer === ST && payee && w?.blockNumber) lastH.set(payee, BigInt(w.blockNumber)); };
async function send(contract, fn, args, { payer, payee, rcLimit, cosigner } = {}) {
  await nextBlockFor(payer, payee);
  try {
    const o = { sendTransaction: true, rcLimit: String(rcLimit ?? M) };
    if (payer) o.payer = payer; if (payee) o.payee = payee; if (cosigner) o.beforeSend = coSign(cosigner);
    const { transaction, receipt } = await contract.functions[fn](args, o);
    landed(payer, payee, await transaction.wait("byBlock", 90000));
    return { ok: !receipt.reverted, reverted: !!receipt.reverted, rc: BigInt(receipt.rc_used), events: eventsOf(receipt), receipt, logs: receipt.logs };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
async function sendOps(signer, ops, { payer, payee, rcLimit, cosigner } = {}) {
  await nextBlockFor(payer, payee);
  try {
    const options = { rcLimit: String(rcLimit ?? M) }; if (payer) options.payer = payer; if (payee) options.payee = payee; if (cosigner) options.beforeSend = coSign(cosigner);
    const tx = new Transaction({ signer: S(signer), provider, options });
    for (const [c, fn, a] of ops) await tx.pushOperation(c.functions[fn], a);
    const receipt = await tx.send(); landed(payer, payee, await tx.wait("byBlock", 90000));
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used), events: eventsOf(receipt), receipt, logs: receipt.logs };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
const sponsored = (who, rcLimit) => ({ payer: ST, payee: who, rcLimit });
const read = async (c, fn, a = {}) => (await c.functions[fn](a)).result || {};
const sta = (who) => C(ST, abiS, who), app = (who) => C(APP, abiA, who), tok = (who) => C(TOK, abiT, who);
// Owner admin: try the station-sponsored owner path (kill-switch route) first, else owner self-paid.
async function admin(fn, args, rcLimit = 2n * M) {
  let r = await send(sta("owner"), fn, args, sponsored(OWN, rcLimit));
  if (!r.ok && !r.reverted) { const r2 = await send(sta("owner"), fn, args, { rcLimit: M / 2n }); r2.viaSelf = true; r2.firstError = r.error; r = r2; }
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

// ---------------------------------------------------------------- 0b. funding (first: init checks the station's KOIN balance)
const want = { [ST]: 70n, [BUY]: 20n, [U1]: 8n, [U2]: 8n, [OWN]: 10n, [SP1]: 3n, [SP2]: 3n }; // station >= its koin_amount (60)
// The funder keeps enough Mana for what it pays after funding: the station upload (the biggest), app uploads, mints.
const LIM0 = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
const upRc = (bytes) => (BigInt(bytes) * (BigInt(LIM0.disk_storage_cost) + BigInt(LIM0.network_bandwidth_cost)) + M) * 3n / 2n;
// Station-size uploads paid by the funder: the deploy and the approved upgrade (spent), plus refused attempts that
// still need the full limit available (the C1 replay puts two station-size uploads in one transaction).
const stUp = upRc(fs.statSync(new URL("../contracts/station/build/testnet/contract.wasm", import.meta.url)).size);
const RESERVE = 3n * stUp + 2n * upRc(14000) + 10n * M;
note(`run id ${RUN} (sweep leftovers with: playground.mjs sweep ${RUN}); funder must keep ${Number(RESERVE) / 1e8} Mana for uploads`);
// Preflight (Oct 20): fund nobody unless the funder can fund everyone. A run that stops halfway leaves tKOIN in fresh
// throwaway accounts whose keys are gone.
{ let total = 0n; for (const [to, amt] of Object.entries(want)) { const n = amt * M - (await kbal(to)); if (n > M / 10n) total += n; }
  const have = await rc(FUN);
  if (have - total < RESERVE) { check("preflight", `funder can fund the run: needs ${Number(total) / 1e8} tKOIN of Mana, has ${Number(have) / 1e8}`, false, "top up the funder from the testnet faucet"); save(); console.log("PREFLIGHT FAIL: funder needs " + Number(total) / 1e8 + " tKOIN of Mana, has " + Number(have) / 1e8); process.exit(1); } }
for (const [to, amt] of Object.entries(want)) {
  const have = await kbal(to); const need = amt * M - have;
  if (need > M / 10n && (await rc(FUN)) - need < RESERVE) { note(`skip funding ${to.slice(0, 6)}…: funder Mana ${Number(await rc(FUN)) / 1e8} would drop below the ${Number(RESERVE) / 1e8} reserve (top it up from the faucet)`); continue; }
  if (need > M / 10n) check("fund", `fund ${to.slice(0, 6)}… to ${amt} tKOIN`, (await send(koinC("funder"), "transfer", { from: FUN, to, value: String(need) }, { rcLimit: 2n * M })).ok, `${Number(need) / 1e8}`);
}
await sleep(4000);



// ---------------------------------------------------------------- 3. init (provisional config for the measurements)
const koinAmt = 60n * M;                 // configured capacity → daily budget 12 Mana (20%); each run has its own station
const base = { owner: OWN, paused: false, koin_amount: String(koinAmt), refill_bp: 2000, admin_min: String(M / 2n), hard_max: String(2n * M),
  per_min: 10, cooldown_ms: "60000", day_actions: 50, day_mana: String(40n * M), new_actions: 50, new_mana: String(40n * M), new_pct: 100, max_ops: 2,
  big_max: String(5n * M), big_cooldown_ms: "86400000", big_week_cap: String(15n * M), big_max_debt: String(10n * M), big_ticket_ms: "0",
  max_allowances: 4, max_days: "30", buffer_bp: 0, alert_mana: "0", ticket_fee_bp: 0,
  council: [A("council1"), A("council2"), A("council3")], threshold: 2, guard_delay_ms: "70000" }; // audit #1: 2 of 3, 70 s (testnet floor 60 s)
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
  ["app", "../contracts/testapp/build/release/contract.wasm", abiA, {}]]) {
  const r = await deploy(role, path, abi, extra);
  check("deploy", `${role} (${wasm(path).length} B)`, r.ok, r.skipped ? "already on chain (same bytecode)" : (r.error || "")); if (r.ok && !r.skipped) cost(`upload ${role} (${wasm(path).length} bytes)`, r.rc);
}
// Audit #1: the station is uploaded with ALL three permissions taken over, and init runs in the same transaction.
const stCode = wasm("../contracts/station/build/testnet/contract.wasm");
const STHASH = "0x1220" + crypto.createHash("sha256").update(stCode).digest("hex");
async function deployStation() {
  try {
    const c = new Contract({ id: ST, abi: abiS, provider, signer: S("station"), bytecode: stCode });
    const { operation } = await c.deploy({ onlyOperation: true, authorizesCallContract: true, authorizesTransactionApplication: true, authorizesUploadContract: true });
    const tx = new Transaction({ signer: S("station"), provider, options: { payer: FUN, payee: FUN, rcLimit: String(rcFor(stCode.length) + 2n * M), beforeSend: coSign("funder") } });
    await tx.pushOperation(operation);
    await tx.pushOperation(sta("station").functions.init, { config: base });
    const receipt = await tx.send(); await tx.wait("byBlock", 120000);
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used) };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
{ const r = await deployStation(); check("deploy", `station (${stCode.length} B) uploaded and initialized in one transaction`, r.ok, r.error || ""); if (r.ok) cost(`upload + init station (${stCode.length} bytes)`, r.rc); }
const stMeta = await provider.invokeGetContractMetadata(ST).catch(() => null);
check("lockdown", "station overrides all three permissions (contract_call, transaction_application, contract_upload)", stMeta?.value?.authorizes_transaction_application && stMeta?.value?.authorizes_call_contract && stMeta?.value?.authorizes_upload_contract && stMeta?.value?.hash === STHASH, JSON.stringify(stMeta?.value || {}).slice(0, 200));
if (!stMeta?.value?.hash) { note("station contract is not on chain, so nothing after the deploy step can run: stopping"); save(); process.exit(1); }

const st0 = await read(sta(), "get_status").catch(() => ({}));
check("init", "initialized by the deploy transaction (owner and council set)", st0.config?.owner === OWN && (st0.config?.council || []).length === 3, JSON.stringify({ owner: st0.config?.owner, council: st0.config?.council, threshold: st0.config?.threshold }));
const errOf = (x) => x.error || (x.reverted ? "reverted" : "") || (x.firstError ? `sponsored path: ${x.firstError}` : "");
// ---------------------------------------------------------------- 3b. audit #1 lockdown: the key alone can't move or replace anything
const refusedNot104 = (x) => !x.ok && !/"code":104|insufficient pending account resources|insufficient rc/.test(x.error || "");
{ const x = await send(sta("station"), "init", { config: base }, { payer: FUN, payee: FUN, cosigner: "funder", rcLimit: M });
  check("lockdown", "init again (station key) refused", refusedNot104(x), x.error || (x.reverted ? "reverted" : "ACCEPTED")); }
{ const x = await send(koinC("station"), "transfer", { from: ST, to: FUN, value: String(M) }, { payer: FUN, payee: FUN, cosigner: "funder", rcLimit: M });
  check("lockdown", "station key moving the station's KOIN refused", refusedNot104(x), x.error || (x.reverted ? "reverted" : "ACCEPTED")); }
async function uploadTo(signerRole, bytes, flags = true) {
  try {
    const c = new Contract({ id: ST, abi: abiS, provider, signer: S(signerRole), bytecode: bytes });
    const opts = { payer: FUN, payee: FUN, rcLimit: String(rcFor(bytes.length) + 2n * M), authorizesCallContract: flags, authorizesTransactionApplication: flags, authorizesUploadContract: flags };
    if (signerRole !== "funder") opts.beforeSend = coSign("funder");
    const { transaction, receipt } = await c.deploy(opts); await transaction.wait("byBlock", 120000);
    return { ok: !receipt.reverted, rc: BigInt(receipt.rc_used) };
  } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
{ const x = await uploadTo("station", wasm("../contracts/testapp/build/release/contract.wasm"));
  check("lockdown", "station key replacing the station's code refused", refusedNot104(x), x.error || "ACCEPTED"); }
const council = (i) => `council${i}`;
const cmSend = (i, fn, args) => send(sta(council(i)), fn, args, sponsored(A(council(i)), M)); // council votes, station-sponsored
const UP = await cmSend(1, "propose", { signer: A(council(1)), action: { kind: 1, hash: STHASH } });
check("council", "council1 proposes an upgrade (hash of the reviewed build)", UP.ok, UP.error || "");
const upId = Number((await read(sta(), "list_proposals")).proposals?.slice(-1)[0]?.id || 0);
{ const x = await cmSend(2, "approve", { signer: A(council(2)), id: upId }); check("council", "council2 approves: 2 of 3, the 70 s wait starts", x.ok && (x.events || []).includes("station.proposal_ready"), x.error || x.events); }
const VETO = await cmSend(1, "propose", { signer: A(council(1)), action: { kind: 2, to: FUN, amount: String(M) } });
const vetoId = Number((await read(sta(), "list_proposals")).proposals?.slice(-1)[0]?.id || 0);
await cmSend(2, "approve", { signer: A(council(2)), id: vetoId });
{ const x = await cmSend(3, "cancel_proposal", { signer: A(council(3)), id: vetoId }); check("council", "council3 alone vetoes an approved withdrawal", VETO.ok && x.ok, x.error || VETO.error || ""); }
{ const x = await send(sta("user1"), "propose", { signer: U1, action: { kind: 2, to: U1, amount: String(M) } }, { rcLimit: M / 2n });
  check("council", "a non-member can't propose", refusedNot104(x), x.error || "ACCEPTED"); }
{ const a = await cmSend(3, "set_paused", { paused: true }); const b = await cmSend(3, "set_paused", { paused: false });
  check("operators", "a council member can pull the emergency brake (pause), but not resume", a.ok && refusedNot104(b), a.error || b.error || "RESUMED"); }
{ const x = await admin("set_paused", { paused: false }); check("operators", "the owner resumes", x.ok, errOf(x)); }
{ const x = await cmSend(3, "connect_app", { contract_id: APP, mana_per_day: String(M), strict: false }); check("operators", "a council member can't run everyday operations (owner only)", refusedNot104(x), x.error || "ACCEPTED"); }
{ const x = await send(sta("user1"), "set_paused", { paused: true }, { rcLimit: M / 2n }); check("operators", "a stranger can't pause", refusedNot104(x), x.error || "ACCEPTED"); }
{ const x = await admin("set_config", { config: { ...base, treasury: U1 } }); check("council", "owner alone can't change the treasury (council only)", !x.ok, errOf(x) || "ACCEPTED"); }

let r;
r = await admin("set_app", { app: 1, value: { reserved_mana: String(koinAmt * 2000n / 10000n - M), active: true } }); // the daily budget minus Stories' 0.5 and a margin check("init", "set_app 1 (measurement app)", r.ok, (r.viaSelf ? "owner self-paid " : "station-sponsored owner path ") + errOf(r));
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
const ctl = await send(app("user1"), "play", { user: U1 }, sponsored(U1, L)); // control: same user, same limit, a call that succeeds
note(`boom control: a normal sponsored play right after boom was ${ctl.ok ? "ACCEPTED (so a boom refusal is specific to the reverting call)" : "refused too: " + (ctl.error || "")}`);
check("measure", "a sponsored call that reverts: either included and charged, or rejected at submission (station pays nothing)", bm.reverted === true || /transaction reverted/.test(bm.error || ""), bm.reverted ? `included and charged, rc ${bm.rc}` : `${bm.error || ""} (rejected at submission: the station paid nothing)`); if (bm.rc) cost("boom (reverted, charged)", bm.rc);

// ---------------------------------------------------------------- 5. Stories app (app 2): spam, new-user pool, buffer
const H = sh.ok ? ceil11(sh.rc) : 2n * M;
const stKoin = await kbal(ST); let koin2 = 60n * L > koinAmt ? 60n * L : koinAmt; if (koin2 > stKoin) koin2 = stKoin; const B = koin2 * 2000n / 10000n; // budget ≥ 12L, never above the station's real KOIN
if (B < 7n * L) note(`budget ${B} < 7L (${7n * L}): the Stories reservation checks below will fail; fund the station with more tKOIN`);
const cfg2 = { ...base, koin_amount: String(koin2), hard_max: String(2n * M > H ? 2n * M : H), per_min: 3, cooldown_ms: "600000", new_actions: 10, new_mana: String(30n * L), new_pct: 50, buffer_bp: 5000 };
check("stories", "set_config: per_min 3, 10 min cooldown, new-user pool 50%, buffer 50%", (await admin("set_config", { config: cfg2 })).ok);
{ const x = await admin("set_app", { app: 2, value: { reserved_mana: String(4n * L), active: true } }); check("stories", "set_app 2 (Stories) reserved 4L", x.ok, errOf(x)); }
const AU = M;                            // allowance unit: the contract sells at least 1 Mana/day, so test allowances are sized in whole Mana
{ const x = await admin("set_app", { app: 1, value: { reserved_mana: String(B - 4n * L - 3n * AU), active: true } }); check("stories", "set_app 1 reserved so that sellable = 3 Mana", x.ok, errOf(x)); }
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
  ["upload_contract with no ticket", async () => { try { const c = new Contract({ id: U2, abi: abiA, provider, signer: S("user2"), bytecode: wasm("../contracts/testapp/build/release/contract.wasm") }); const { transaction } = await c.deploy({ payer: ST, payee: U2, rcLimit: String(rcFor(wasm("../contracts/testapp/build/release/contract.wasm").length)) }); await transaction.wait("byBlock", 60000); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; } }],
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
for (const to of [BUY, U1]) { let x = await send(tok("token"), "mint", { to, value: String(1000n * M) }, { payer: FUN, payee: TOK, cosigner: "funder" }); if (!x.ok && /not mined/.test(x.error || "")) x = await send(tok("token"), "mint", { to, value: String(1000n * M) }, { payer: FUN, payee: TOK, cosigner: "funder" }); check("escrow", `mint 1,000 tUSDT to ${to.slice(0, 6)}…`, x.ok, x.error || (x.reverted ? "reverted: " + JSON.stringify(x.logs || []) : "")); }
const stE = await read(sta(), "get_status"); note(`sold_capacity ${stE.sold_capacity} (expected 3 Mana = ${3n * AU})`);
const qBig = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(4n * AU), days: "7" });
check("escrow", "quote above the sellable slice: not available (reservations protected)", !qBig.available, qBig.reason || JSON.stringify(qBig));
const q = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(2n * AU), days: "7" });
check("escrow", "quote 2 Mana/day × 7 d available, refundable, no auto-renew", q.available && q.refundable && !q.auto_renew, `price ${q.price}`);
const price = BigInt(q.price || 0);
const buyA = (mpd, appSigns = true) => sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: PAYAPP, mana_per_day: String(mpd), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: M / 2n, cosigner: appSigns ? "spam2" : undefined }); // audit #3: the app co-signs
const bigBuy = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 4n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: PAYAPP, mana_per_day: String(4n * AU), days: "7", token: TOK, max_price: String(price * 4n) }]], { rcLimit: M / 2n, cosigner: "spam2" });
check("escrow", "buy_allowance above the sellable slice refused", !bigBuy.ok, bigBuy.error || "");
const noSig = await buyA(2n * AU, false);
check("escrow", "audit #3: buy_allowance without the target app's signature refused (no squatting someone else's app)", !noSig.ok, noSig.error || "");
const ba = await buyA(2n * AU);
check("escrow", "buy_allowance 2 Mana/day × 7 d (approve + pull in one tx), allowance_bought event", ba.ok && ba.events.includes("station.allowance_bought"), ba.error || `rc ${ba.rc} events ${ba.events}`); if (ba.ok) cost("buy_allowance tx (approve + buy)", ba.rc);
const aid = 1;
const xfer = () => send(C(PAYAPP, abiA, "user2"), "play", { user: U2 }, sponsored(U2, L)); // user2: user1 is in its 10-min cooldown from the measurements
const b1 = await xfer(); check("escrow", "paying app (app allowance): its users' txs sponsored from its allowance", b1.ok, b1.error || `rc ${b1.rc}`); if (b1.ok) cost("play on paying app, sponsored by its allowance", b1.rc);
const acc = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 2, target: U1, mana_per_day: String(2n * AU), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: M / 2n });
check("designated", "wallet Mana pass without the wallet's own signature refused", !acc.ok, acc.error || "");
const tokT = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(price * 2n) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 1, target: TOK, mana_per_day: String(AU), days: "7", token: TOK, max_price: String(price * 2n) }]], { rcLimit: M / 2n });
check("designated", "allowance targeting a token contract refused", !tokT.ok, tokT.error || "");
const tr = await send(tok("user1"), "transfer", { from: U1, to: U2, value: "1" }, sponsored(U1, L));
check("designated", "token transfer by a paying app's user still refused", !tr.ok, tr.error || "");
const su = await admin("suspend_allowance", { buyer: BUY, reason: 1 });
check("suspend", "owner suspends buyer (reason 1 abuse), buyer_suspended event", su.ok && su.events.includes("station.buyer_suspended"), su.error || su.events);
const b2 = await xfer(); check("suspend", "suspended buyer's allowance no longer sponsors", !b2.ok, b2.error || "");
const mix = await sendOps("user1", [[C(PAYAPP, abiA, "user1"), "play", { user: U1 }], [app("user1"), "play", { user: U1 }]], sponsored(U1, L));
check("designated", "mixed targets (paying app + Carl's Stories) refused", !mix.ok, mix.error || "");
const sc = await send(sta("buyer"), "cancel_allowance", { buyer: BUY, id: aid }, { rcLimit: M / 2n }); check("suspend", "suspended buyer cannot self-cancel", !sc.ok, sc.error || "");
const us = await admin("unsuspend_allowance", { buyer: BUY, reason: 0 });
check("suspend", "unsuspend, buyer_unsuspended event", us.ok && us.events.includes("station.buyer_unsuspended"), us.error || us.events);
const b3 = await xfer(); check("suspend", "after unsuspend: sponsored again", b3.ok, b3.error || "");
const preRel = await send(sta("user1"), "release", { purchase_id: 1 }, { rcLimit: 2n * M });
check("escrow", "release before the term ends refused", !preRel.ok, preRel.error || "");
const bb0 = await tbal(BUY);
const ca = await send(sta("buyer"), "cancel_allowance", { buyer: BUY, id: aid }, { rcLimit: M / 2n });
const refundA = (await tbal(BUY)) - bb0, expA = price * 6n / 7n;
check("escrow", "cancel day 0 of 7: refund = floor(paid × 6/7) (current day used), escrow_refunded event", ca.ok && refundA === expA && ca.events.includes("station.escrow_refunded"), `paid ${price} refund ${refundA} expected ${expA} ${ca.error || ""}`);
const b4 = await xfer(); note(`after cancel, same day: allowance ${b4.ok ? "still sponsors (current day was paid)" : "no longer sponsors"}`);

// ---------------------------------------------------------------- 8. big-upload tickets: buffer, fee, anti-spam
const stT = await read(sta(), "get_status"); const mana = BigInt(stT.mana), bigFloor = BigInt(stT.big_floor);
let T = 5n * M; if (mana - bigFloor - M < T) T = mana - bigFloor - M; T = T / 1_000_000n * 1_000_000n;
note(`ticket size T = ${fmt(T)} (station mana ${fmt(mana)}, big floor ${fmt(bigFloor)})`);
const qb = await read(sta(), "quote_big_upload", { token: TOK, mana: String(T) }); const tprice = BigInt(qb.price || 0);
check("ticket", "quote_big_upload available, refundable; terms describe the 24 h lock, the 5% fee and stablecoin-only refunds", qb.available && /24-hour/.test(qb.terms || "") && /5%/.test(qb.terms || "") && /never in Mana or KOIN/.test(qb.terms || ""), `price ${tprice} reason ${qb.reason || ""}`);
const buyT = (who, payee) => sendOps(who, [[tok(who), "approve", { owner: A(who), spender: ST, value: String(tprice) }], [sta(who), "buy_big_upload", { buyer: A(who), payee, mana: String(T), token: TOK, max_price: String(tprice), allow_upload: true }]], { rcLimit: M / 2n });
const t1 = await buyT("buyer", U2);
check("ticket", "buyer buys a ticket for user2 (big_upload_bought event)", t1.ok && t1.events.includes("station.big_upload_bought"), t1.error || t1.events); if (t1.ok) cost("buy_big_upload tx (approve + buy)", t1.rc);
const code = wasm("../contracts/testapp/build/release/contract.wasm");
let up = { ok: false };
const upLimit = await estimateUploadRc(provider, code.length); note(`helper upload limit for ${code.length} B: ${upLimit} (${Number(upLimit) / 1e8} Mana)`);
try { const c = new Contract({ id: U2, abi: abiA, provider, signer: S("user2"), bytecode: code }); const { transaction, receipt } = await c.deploy({ payer: ST, payee: U2, rcLimit: String(upLimit) }); await transaction.wait("byBlock", 120000); up = { ok: !receipt.reverted, rc: BigInt(receipt.rc_used) }; } catch (e) { up = { ok: false, error: String(e.message).slice(0, 300) }; }
check("ticket", `big tx (${code.length} B contract upload) sponsored via ticket with the helper's tight limit`, up.ok, up.error || `rc ${up.rc} of limit ${upLimit} (${(Number(up.rc) / Number(upLimit) * 100).toFixed(1)}% used)`); if (up.ok) cost(`ticket upload of ${code.length} B contract`, up.rc);
const tk = await read(sta(), "get_ticket", { payee: U2 }); const used = BigInt(tk.ticket?.mana || 0) - BigInt(tk.ticket?.remaining || 0);
note(`ticket after upload: mana ${tk.ticket?.mana} remaining ${tk.ticket?.remaining} (charged = rc_used)`);
const ob0 = await tbal(OWN), bb1 = await tbal(BUY);
const ct = await send(sta("buyer"), "cancel_big_upload", { buyer: BUY, payee: U2 }, { rcLimit: M / 2n });
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
const ct3 = await send(sta("user1"), "cancel_big_upload", { buyer: U1, payee: SP1 }, { rcLimit: M / 2n });
const ref3 = (await tbal(U1)) - ub0;
check("ticket", "0 used, cancelled at once: the 5% fee floor applies (refund exactly 95%)", ct3.ok && ref3 === tprice * 9500n / 10000n, `refund ${ref3} of ${tprice}`);
const fee = await admin("set_config", { config: { ...cfg2, new_pct: 100, ticket_fee_bp: 2001 } });
check("ticket", "raising the ticket fee via set_config refused (council only, max 20%)", !fee.ok, errOf(fee));


// ---------------------------------------------------------------- 8b. connected apps: one-step connect / list / disconnect
{ const c = new Contract({ id: A("app3"), abi: abiA, provider, signer: S("app3"), bytecode: wasm("../contracts/testapp/build/release/contract.wasm") });
  try { const { transaction } = await c.deploy({ payer: FUN, payee: A("app3"), rcLimit: String(rcFor(wasm("../contracts/testapp/build/release/contract.wasm").length)), beforeSend: coSign("funder") }); await transaction.wait("byBlock", 120000); } catch (e) { note("deploy app3: " + String(e.message).slice(0, 150)); } }
const APP3 = A("app3");
{ const x = await admin("connect_app", { contract_id: APP3, mana_per_day: String(M), strict: false }); check("connect", "connect_app: a new app gets 1 Mana/day in one step", x.ok, errOf(x)); }
{ const L = await read(sta(), "list_connected"); const f = (L.free_apps || []).find((a) => a.contract_id === APP3);
  check("connect", "list_connected shows it with its daily Mana", !!f && BigInt(f.mana_per_day || 0) === M, JSON.stringify({ free: (L.free_apps || []).length, paid: (L.paid || []).length, sellable: L.sellable, sold: L.sold }));
  note(`list_connected: ${(L.free_apps || []).length} free apps, ${(L.paid || []).length} paid allowances, daily budget ${L.daily_budget}, reserved ${L.reserved}, sellable ${L.sellable}, sold ${L.sold}`); }
{ const x = await send(C(APP3, abiA, "player3"), "play", { user: A("player3") }, sponsored(A("player3"), L)); check("connect", "its users play free right away", x.ok, x.error || `rc ${x.rc}`); }
{ const x = await admin("disconnect_app", { contract_id: APP3 }); check("connect", "disconnect_app in one step", x.ok, errOf(x)); }
{ const x = await send(C(APP3, abiA, "player3"), "play", { user: A("player3") }, sponsored(A("player3"), L)); check("connect", "after disconnect its users are no longer sponsored", refusedNot104(x), x.error || "ACCEPTED"); }
// ---------------------------------------------------------------- 8b2. wallet Mana pass (kind 2, Carl Oct 20: any app, no token moves)
{ const qp = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(AU), days: "1" });
  if (!qp.available) note(`pass quote unavailable: ${qp.reason || ""}`);
  const pp = BigInt(qp.price || 0);
  const bp = await sendOps("buyer", [[tok("buyer"), "approve", { owner: BUY, spender: ST, value: String(pp) }], [sta("buyer"), "buy_allowance", { buyer: BUY, kind: 2, target: U1, mana_per_day: String(AU), days: "1", token: TOK, max_price: String(pp) }]], { rcLimit: M / 2n, cosigner: "user1" });
  check("pass", "buy a 1 Mana/day pass for user1 (user1 co-signs)", bp.ok && bp.events.includes("station.allowance_bought"), bp.error || bp.events);
  const own = await send(C(APP3, abiA, "user1"), "play", { user: U1 }, sponsored(U1, L));
  check("pass", "user1's call to an app nobody pays for is sponsored by the pass", own.ok, own.error || `rc ${own.rc}`);
  const other = await send(C(APP3, abiA, "player3"), "play", { user: A("player3") }, sponsored(A("player3"), L));
  check("pass", "another wallet (no pass) calling the same app is refused", !other.ok, other.error || "ACCEPTED");
  const mv = await send(tok("user1"), "transfer", { from: U1, to: BUY, value: "1" }, sponsored(U1, L));
  check("pass", "the pass never pays a token transfer", !mv.ok, mv.error || "ACCEPTED");
  const mvk = await send(koinC("user1"), "transfer", { from: U1, to: BUY, value: "1" }, sponsored(U1, L));
  check("pass", "the pass never pays a KOIN transfer", !mvk.ok, mvk.error || "ACCEPTED");
  const Lc = await read(sta(), "list_connected"); const mine = (Lc.paid || []).find((p) => p.target === U1);
  check("pass", "list_connected shows the pass (kind 2) with today's use", !!mine && mine.kind === 2 && BigInt(mine.used_24h || 0) > 0n, JSON.stringify(mine || {}));
  if (mine) { const x = await send(sta("buyer"), "cancel_allowance", { buyer: BUY, id: mine.id }, { rcLimit: M / 2n }); check("pass", "buyer cancels the pass (refund of unused whole days)", x.ok, x.error || ""); }
}
// ---------------------------------------------------------------- 8b3. free checkout: a wallet with NO Mana buys and cancels its own pass
{ const P3 = A("player3");
  // the passes above still hold today's sold capacity (a cancel runs to the end of the day): make room for 1 more Mana
  { const x = await admin("set_app", { app: 1, value: { reserved_mana: String(B - 4n * L - 5n * AU), active: true } }); check("checkout", "owner frees 2 Mana a day of capacity for the next sale", x.ok, errOf(x)); }
  let x = await send(tok("token"), "mint", { to: P3, value: String(10n * M) }, { payer: FUN, payee: TOK, cosigner: "funder" });
  check("checkout", "mint 10 tUSDT to player3 (a wallet with no KOIN and no Mana)", x.ok, x.error || "");
  note(`player3 own Mana: ${await rc(P3)}`);
  const qp = await read(sta(), "quote_allowance", { token: TOK, mana_per_day: String(AU), days: "1" }); const pp = BigInt(qp.price || 0);
  const buy = await sendOps("player3", [[tok("player3"), "approve", { owner: P3, spender: ST, value: String(pp) }], [sta("player3"), "buy_allowance", { buyer: P3, kind: 2, target: P3, mana_per_day: String(AU), days: "1", token: TOK, max_price: String(pp) }]], { payer: ST, payee: P3, rcLimit: M / 2n });
  check("checkout", "player3 buys a pass with the station paying the Mana (approve + buy)", buy.ok && buy.events.includes("station.allowance_bought"), buy.error || buy.events);
  const use = await send(C(APP3, abiA, "player3"), "play", { user: P3 }, sponsored(P3, L));
  check("checkout", "player3's new pass pays its call to an unconnected app", use.ok, use.error || "");
  const sneaky = await sendOps("player3", [[tok("player3"), "approve", { owner: P3, spender: BUY, value: "1" }], [sta("player3"), "buy_allowance", { buyer: P3, kind: 2, target: P3, mana_per_day: String(AU), days: "1", token: TOK, max_price: String(pp) }]], { payer: ST, payee: P3, rcLimit: M / 2n });
  check("checkout", "an approve to anyone but the station is never paid", !sneaky.ok, sneaky.error || "ACCEPTED");
  const Lc = await read(sta(), "list_connected"); const mine = (Lc.paid || []).find((p) => p.target === P3);
  if (mine) { const c = await send(sta("player3"), "cancel_allowance", { buyer: P3, id: mine.id }, { payer: ST, payee: P3, rcLimit: M / 2n }); check("checkout", "player3 cancels with the station paying the Mana", c.ok, c.error || ""); }
  else check("checkout", "player3's pass is listed", false, JSON.stringify(Lc.paid || []));
}

// ---------------------------------------------------------------- 8c. audit #1: approved upgrade, then council withdrawal (also returns the test KOIN)
{ const x = await uploadTo("funder", wasm("../contracts/testapp/build/release/contract.wasm")); check("upgrade", "uploading code the council did not approve is refused", refusedNot104(x), x.error || "ACCEPTED"); }
{ const x = await uploadTo("funder", stCode, false); check("upgrade", "the approved code without the three overrides is refused", refusedNot104(x), x.error || "ACCEPTED"); }
// Review C1 replayed on chain: attacker code and the approved code in ONE transaction must be refused.
{ let x;
  try {
    const evil = new Contract({ id: ST, abi: abiS, provider, signer: S("funder"), bytecode: wasm("../contracts/testapp/build/release/contract.wasm") });
    const good = new Contract({ id: ST, abi: abiS, provider, signer: S("funder"), bytecode: stCode });
    const f = { onlyOperation: true, authorizesCallContract: true, authorizesTransactionApplication: true, authorizesUploadContract: true };
    const tx = new Transaction({ signer: S("funder"), provider, options: { rcLimit: String(rcFor(stCode.length) * 2n + 2n * M) } });
    await tx.pushOperation((await evil.deploy(f)).operation); await tx.pushOperation((await good.deploy(f)).operation);
    const receipt = await tx.send(); await tx.wait("byBlock", 120000); x = { ok: !receipt.reverted };
  } catch (e) { x = { ok: false, error: String(e?.message || e).slice(0, 300) }; }
  check("upgrade", "attacker code + approved code in one transaction is refused (review C1)", refusedNot104(x), x.error || "ACCEPTED"); }
{ const m0 = await provider.invokeGetContractMetadata(ST).catch(() => null); check("upgrade", "…and the station's code is unchanged", m0?.value?.hash === STHASH, m0?.value?.hash || ""); }
{ const x = await uploadTo("funder", stCode); check("upgrade", "the approved code, alone, after the wait, uploads WITHOUT the station key", x.ok, x.error || ""); }
{ const x = await uploadTo("funder", stCode); check("upgrade", "…and only once", refusedNot104(x), x.error || "ACCEPTED"); }
// Cleanup doubles as the withdrawal test: free the budget, lower koin_amount, then 2 of 3 + 70 s to take KOIN out.
await admin("set_app", { app: 1, value: { reserved_mana: "0", active: false } });
await admin("set_app", { app: 2, value: { reserved_mana: "0", active: false } });
// koin_amount must keep backing what is still sold today (cancelled terms run to the end of the day): 5x sold, min 10.
const soldNow = BigInt((await read(sta(), "list_connected")).sold || 0); const keepK = soldNow * 5n + M > 10n * M ? soldNow * 5n + M : 10n * M;
{ const x = await admin("set_config", { config: { ...cfg2, koin_amount: String(keepK) } }); check("withdraw", `operator lowers koin_amount to ${Number(keepK) / 1e8} (allowed: it still backs what is sold)`, x.ok, errOf(x)); }
const stBal = await kbal(ST), stMana = await rc(ST);
let wAmt = stBal - keepK - M; if (stMana - M < wAmt) wAmt = stMana - M;
const W = await cmSend(2, "propose", { signer: A(council(2)), action: { kind: 2, to: FUN, amount: String(wAmt) } });
const wId = Number((await read(sta(), "list_proposals")).proposals?.slice(-1)[0]?.id || 0);
{ const x = await send(sta("player3"), "execute", { id: wId }, { payer: FUN, payee: FUN, cosigner: "funder", rcLimit: M }); check("withdraw", "1 of 2 approvals: execute refused", W.ok && refusedNot104(x), x.error || W.error || "ACCEPTED"); }
await cmSend(3, "approve", { signer: A(council(3)), id: wId });
{ const x = await send(sta("player3"), "execute", { id: wId }, { payer: FUN, payee: FUN, cosigner: "funder", rcLimit: M }); check("withdraw", "2 of 2 but inside the 70 s wait: refused", refusedNot104(x), x.error || "ACCEPTED"); }
await sleep(75_000);
{ const f0 = await kbal(FUN);
  const e = await send(new Contract({ id: ST, abi: abiS, provider, signer: S("funder") }), "execute", { id: wId }, { rcLimit: M });
  const f1 = await kbal(FUN);
  check("withdraw", "after the wait anyone executes: KOIN goes to the approved address", e.ok && f1 >= f0 + wAmt - M, e.error || `${Number(wAmt) / 1e8} tKOIN back to the funder`); }

// ---------------------------------------------------------------- 9. invariants, KOIN untouched, events summary
const tot = (await read(sta(), "get_escrow_totals", { token: TOK })).totals || {};
const held = BigInt(tot.held || 0), stTok = await tbal(ST);
check("money", "escrow held == station tUSDT balance; collected == held + refunded + released", held === stTok && BigInt(tot.collected || 0) === held + BigInt(tot.refunded || 0) + BigInt(tot.released || 0), JSON.stringify(tot) + ` station balance ${stTok}`);
check("money", "station KOIN moved only by the council withdrawal (escrow and refunds never touch KOIN)", stBal === koinSt0, `before withdrawal ${koinSt0} → ${stBal}`);
cost("station Mana at end", await rc(ST));
// Sweep the fresh accounts' leftover tKOIN back to the funder (best effort; each keeps a little Mana for the fee).
let swept = 0n;
for (const r of FRESH) {
  if (r === "station") continue;                                         // locked by design: its KOIN left via the council withdrawal
  const bal = await kbal(A(r)), mana = await rc(A(r)); let amt = (bal < mana ? bal : mana) - M; if (amt <= 0n) continue;
  const x = await send(koinC(r), "transfer", { from: A(r), to: FUN, value: String(amt) }, { rcLimit: M / 2n });
  if (x.ok) swept += amt; else note(`sweep ${r} ${A(r).slice(0, 6)}…: ${x.error || "reverted"}`);
}
note(`swept ${Number(swept) / 1e8} tKOIN back to the funder`);
R.finished = new Date().toISOString(); save();

// ---------------------------------------------------------------- report
const pass = R.checks.filter((c) => c.pass).length, total = R.checks.length;
let md = `## Mana Station testnet run\nchain ${chainId}\n\n**${pass}/${total} checks passed**\n\nNotes:\n` + R.notes.map((n) => `- ${n}`).join("\n") + `\n\n| area | check | result | detail |\n|---|---|---|---|\n`;
for (const c of R.checks) md += `| ${c.area} | ${c.name} | ${c.pass ? "PASS" : "**FAIL**"} | ${c.detail.replace(/\|/g, "/").replace(/"account":"[^"]+",/g, "").slice(0, 120)} |\n`;
md += `\n**${pass}/${total} checks passed**\n\n| cost | rc (base units) | Mana |\n|---|---|---|\n`;
for (const [k, v] of Object.entries(R.costs)) md += `| ${k} | ${v} | ${(Number(v) / 1e8).toFixed(5)} |\n`;
console.log("\n" + md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
fs.writeFileSync(new URL("./results.md", import.meta.url), md);
process.exit(pass === total ? 0 : 1);
