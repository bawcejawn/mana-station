#!/usr/bin/env node
// Measure what the station's own code costs on a real chain (audit-2026-10 M-8, test plan D1-D3): MockVM doesn't meter
// wasm, so hard_max and the site's / helper's Mana limits must come from a node. Testnet or a local node only.
//
//   NETWORK=testnet STATION=<a station you may fill> TOKEN=<its accepted test stablecoin> node admin/measure.mjs [--to 49] [--points 0,10,25,40,49]
//
// It fills the station with Mana passes from fresh wallets derived from the funder key (FUNDER_WIF or a hidden prompt),
// up to `--to` open allowances, and at each point records, from the receipts:
//   - buy_allowance (approve + buy, the heaviest purchase path), paid by the buyer's own Mana;
//   - a pass holder's call, sponsored by the station, and the same call paid by the wallet itself; the difference is
//     what authorize costs at that many open allowances (it grows with them: D-03).
// The funder pays: per wallet 2 test KOIN for Mana (swept back at the end) and the pass price in TOKEN (funder must hold
// enough; mint it first). Output: a table in Mana at the chain's current prices, and the hard_max it supports.
import crypto from "crypto";
import { koilib, network, station, abi, signer, fail } from "./lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const K = await koilib(); const NET = await network(K); const { provider } = NET;
if (NET.name === "mainnet") fail("measure.mjs fills a station with test purchases: testnet or a local node only.");
const ST = station(), TOK = process.env.TOKEN || fail("Set TOKEN=<the station's accepted test stablecoin>.");
const TO = Number(arg("to", "49")), POINTS = String(arg("points", "0,10,25,40,49")).split(",").map(Number).filter((n) => n <= TO);
const ABI = abi(), M = 100_000_000n;
const funder = await signer(K, provider, "Testnet funder key (WIF, hidden): "); funder.provider = provider;
const FUN = funder.getAddress();
const koinId = (await provider.invokeGetContractAddress("koin")).value.address;
const koin = (s) => new K.Contract({ id: koinId, abi: K.utils.tokenAbi, provider, signer: s });
const tok = (s) => new K.Contract({ id: TOK, abi: K.utils.tokenAbi, provider, signer: s });
const sta = (s) => new K.Contract({ id: ST, abi: ABI, provider, signer: s });
const lim = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
const derive = (i) => { const s = new K.Signer({ privateKey: crypto.createHash("sha256").update("mana-station-measure/" + ST + "/" + i + "/" + funder.getPrivateKey("wif")).digest("hex") }); s.provider = provider; return s; };
const status = async () => (await sta().functions.get_status({})).result || {};
async function run(contractFn, args, opts) {
  const { transaction, receipt } = await contractFn(args, { rcLimit: String(3n * M), ...opts }); await transaction.wait("byBlock", 120000);
  return { rc: BigInt(receipt.rc_used || 0), compute: BigInt(receipt.compute_bandwidth_used || 0), reverted: !!receipt.reverted };
}
async function runOps(s, ops, opts) {
  const tx = new K.Transaction({ signer: s, provider, options: { rcLimit: String(3n * M), ...opts } });
  for (const [fn, a] of ops) await tx.pushOperation(fn, a);
  const receipt = await tx.send(); await tx.wait("byBlock", 120000);
  return { rc: BigInt(receipt.rc_used || 0), compute: BigInt(receipt.compute_bandwidth_used || 0), reverted: !!receipt.reverted };
}
const mana = (v) => (Number(v) / 1e8).toFixed(4);
const rows = []; const used = [];
const openAllowances = async () => Number((await status()).open_allowances || 0);
let n = await openAllowances(); console.log(`station ${ST}: ${n} open allowances now; filling to ${TO}`);
const OPEN_APP = process.env.OPEN_APP || "";                       // a contract nobody sponsors (the playground's open app)
for (let i = 0; n < TO || POINTS.includes(n); i++) {
  const w = derive(i), W = w.getAddress(); used.push(w);
  const q = (await sta().functions.quote_allowance({ token: TOK, mana_per_day: String(M), days: "7", kind: 2 })).result || {};
  if (!q.available) fail(`quote unavailable at ${n} open: ${q.reason}`);
  await run(koin(funder).functions.transfer, { from: FUN, to: W, value: String(2n * M) }, {});
  await run(tok(funder).functions.transfer, { from: FUN, to: W, value: String(q.price) }, {});
  const buy = await runOps(w, [[tok(w).functions.approve, { owner: W, spender: ST, value: String(q.price) }], [sta(w).functions.buy_allowance, { buyer: W, kind: 2, target: W, mana_per_day: String(M), days: "7", token: TOK, max_price: q.price }]], { payer: W });
  n = await openAllowances();
  if (POINTS.includes(n) || n >= TO) {
    let self = null, sp = null;
    if (OPEN_APP) {
      const app = new K.Contract({ id: OPEN_APP, abi: { methods: { play: { argument: "", return: "", entry_point: 1, read_only: false } } }, provider, signer: w });
      try { self = await run(app.functions.play, {}, { payer: W }); } catch (e) { self = null; }
      try { sp = await run(app.functions.play, {}, { payer: ST, payee: W }); } catch (e) { sp = null; }
    }
    rows.push({ open: n, buy, self, sp });
    console.log(`${n} open: buy ${mana(buy.rc)} Mana (${buy.compute} compute)${sp && self ? `, authorize ${mana(sp.rc - self.rc)} Mana (${sp.compute - self.compute} compute)` : ""}`);
  }
  if (n >= TO && !POINTS.some((p) => p > n)) break;
}
// Sweep the test KOIN back (each wallet keeps nothing; its pass stays until it expires).
for (const w of used) {
  try { const b = BigInt((await koin().functions.balanceOf({ owner: w.getAddress() })).result?.value || 0); if (b > M / 10n) await run(koin(w).functions.transfer, { from: w.getAddress(), to: FUN, value: String(b - M / 10n) }, { payer: w.getAddress() }); } catch {}
}
const maxBuy = rows.reduce((m, r) => (r.buy.rc > m ? r.buy.rc : m), 0n);
const maxAuth = rows.reduce((m, r) => (r.sp && r.self && r.sp.rc - r.self.rc > m ? r.sp.rc - r.self.rc : m), 0n);
console.log("\n| open allowances | buy_allowance (Mana) | buy compute | authorize overhead (Mana) | authorize compute |\n|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.open} | ${mana(r.buy.rc)} | ${r.buy.compute} | ${r.sp && r.self ? mana(r.sp.rc - r.self.rc) : "n/a"} | ${r.sp && r.self ? r.sp.compute - r.self.compute : "n/a"} |`);
console.log(`\nResource prices: compute ${lim.compute_bandwidth_cost}, disk ${lim.disk_storage_cost}, network ${lim.network_bandwidth_cost} (per unit, in Mana base units).`);
console.log(`Heaviest buy ${mana(maxBuy)} Mana: a free-checkout buy must fit hard_max with margin: hard_max >= ${mana(maxBuy * 3n / 2n)} (1.5x).`);
console.log(`Heaviest authorize overhead ${mana(maxAuth)} Mana: add it to every sponsored transaction's limit (site, helper, apps).`);
console.log("Record these in docs/LAUNCH.md and repeat on mainnet prices with admin/preflight-mainnet.mjs.");
