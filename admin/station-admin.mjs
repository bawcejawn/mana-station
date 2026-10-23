#!/usr/bin/env node
// Mana Station owner / council tool. The same actions as the site's Owner page, from a terminal.
//
//   NETWORK=mainnet|testnet STATION=<station address> [RPC=<node>] node admin/station-admin.mjs <command> [args]
//
// Read (no key needed):
//   list                                  free apps, paid allowances, today's budget
//   proposals                             open council proposals, each in full
//   check                                 low Mana and open allowances vs open_cap; exits 2 if either needs attention
//                                         (run it daily, e.g. from cron: it is the reserve_low monitor, audit-2026-10 M-7)
//   owed <wallet> [token]                 what the station owes a wallet (refunds, releases), ready to claim
// Owner:
//   connect <app contract> <Mana/day> [strict]   connect or update a free app
//   disconnect <app contract>
//   resume
// Owner or council member:
//   pause
// Council member (each proposal, approval and veto shows the proposal in full first):
//   propose-withdraw <to> <KOIN>          KOIN out of the station
//   propose-upgrade <sha256 of the release wasm>
//   propose-settle <purchase #> <amount back to its payer>   a purchase frozen by sanctions (kind 9)
//   approve <id> | unapprove <id> | veto <id>
// Anyone:
//   execute <id>                          carry out an approved proposal after its waiting period
//   claim <wallet> [token]                pay out what the station owes that wallet (it only ever goes to that wallet)
//
// audit-2026-10 (M-13, O1-05): no npm packages (see admin/lib.mjs); pinned to one network; every transaction is shown
// in full and must be confirmed by typing a word before it is signed. The signing key is read from ADMIN_WIF or a
// hidden prompt, never printed or saved. Owner and council transactions are paid by the station when its limits
// allow, otherwise by the signer's own Mana.
import fs from "fs";
import { koilib, network, station, abi, proposalText, amount, show, isAddress, signer, confirmSigning, fail } from "./lib.mjs";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 31).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
const K = await koilib(); const NET = await network(K); const { provider } = NET;
const ST = station(), ABI = abi(), PT = proposalText();
const M = 100_000_000n;
const reader = new K.Contract({ id: ST, abi: ABI, provider });
const read = async (fn, a = {}) => (await reader.functions[fn](a)).result || {};
const mana = (v) => (Number(BigInt(v || 0)) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 });
const status = await read("get_status");
const TOKENS = { mainnet: { vUSDT: "12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh", vUSDC: "1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj" } };
const tokenArg = (t) => (t ? (TOKENS[NET.name]?.[t] || t) : (TOKENS[NET.name]?.vUSDT || fail("token required")));

async function write(fn, a, { anyone = false, about = [] } = {}) {
  const s = await signer(K, provider); const me = s.getAddress();
  const argsNow = typeof a === "function" ? a(me) : a;
  await confirmSigning([`Network: ${NET.name} (${NET.chainId})`, `Station: ${ST}`, `Signer: ${me}`, `Call: ${fn}`,
    `Arguments: ${JSON.stringify(argsNow, null, 2).split("\n").join("\n  ")}`, ...about]);
  const c = new K.Contract({ id: ST, abi: ABI, provider, signer: s });
  const tries = anyone ? [{ rcLimit: String(M / 2n) }] : [{ payer: ST, payee: me, rcLimit: String(M) }, { rcLimit: String(M) }];
  for (const opts of tries) {
    try {
      const { transaction, receipt } = await c.functions[fn](argsNow, opts);
      await transaction.wait("byBlock", 60000);
      console.log(`${fn}: done (${opts.payer ? "paid by the station" : "paid by you"}, ${mana(receipt.rc_used)} Mana)`); return;
    } catch (e) {
      if (opts.payer && /has not authorized|insufficient/i.test(String(e.message))) continue;   // station declined: pay ourselves
      fail(`${fn}: not done: ${e.message}`);
    }
  }
}
async function proposalLines(id) {
  const p = (await read("get_proposal", { id: Number(id) })).proposal;
  if (!p || !p.action) fail(`no proposal #${id}`);
  if (p.executed || p.cancelled) fail(`proposal #${id} is already ${p.executed ? "carried out" : "closed"}`);
  const purchase = p.action.kind === 9 ? (await read("get_escrow", { purchase_id: p.action.purchase_id })).purchase : undefined;
  const lines = PT.describe(p.action, { config: status.config, purchase, expectedHash: process.env.EXPECTED_SHA256 || "" });
  return { p, lines: [`Proposal #${p.id} by ${p.proposer}: ${lines[0]}`, ...lines.slice(1).map((l) => "  " + l),
    `Approvals ${(p.approvals || []).length} of ${status.config?.threshold}: ${(p.approvals || []).join(", ")}`] };
}
const propose = (action) => write("propose", (me) => ({ signer: me, action }), { about: ["", "This proposal:", ...PT.describe(action, { config: status.config }).map((l) => "  " + l)] });

if (cmd === "list") {
  const L = await read("list_connected");
  console.log(`Station ${ST} on ${NET.name}${status.config?.paused ? "  [PAUSED]" : ""}`);
  console.log(`Mana ${mana(L.mana)}   daily budget ${mana(L.daily_budget)}   reserved ${mana(L.reserved)}   sellable ${mana(L.sellable)}   sold ${mana(L.sold)}`);
  console.log(`Free checkout window ${mana(status.checkout_used_24h)} of ${mana(status.checkout_cap)} Mana in 24 h\n`);
  console.log("Free apps:");
  for (const a of L.free_apps || []) console.log(`  ${(a.contract_id || `(slot ${a.app}, no contract)`).padEnd(36)} ${mana(a.mana_per_day).padStart(10)} Mana/day   used ${mana(a.used_24h)}${a.strict ? "   listed functions only" : ""}`);
  if (!(L.free_apps || []).length) console.log("  none");
  console.log("\nPaid allowances:");
  for (const p of L.paid || []) console.log(`  #${p.id} ${p.target}  ${mana(p.mana_per_day)} Mana/day  used ${mana(p.used_24h)}  ends ${new Date(Number(p.expiry)).toISOString()}${p.suspended ? "  SUSPENDED" : ""}`);
  if (!(L.paid || []).length) console.log("  none");
} else if (cmd === "proposals") {
  const P = (await read("list_proposals")).proposals || [];
  for (const p of P) { const { lines } = await proposalLines(p.id); console.log(lines.join("\n") + `\n  ${p.ready_at && p.ready_at !== "0" ? "ready " + new Date(Number(p.ready_at)).toISOString() : "needs approvals"}\n`); }
  if (!P.length) console.log("No open proposals.");
} else if (cmd === "check") {
  const open = Number(status.open_allowances || 0), cap = Number(status.open_cap || 0);
  const slots = cap > 0 && open * 5 >= cap * 4, low = !!status.reserve_low;
  console.log(`Mana ${mana(status.mana)} (alert below ${mana(status.alert_level)})${low ? "  WARNING: below the alert level" : ""}`);
  console.log(`Open allowances ${open} of open_cap ${cap}${slots ? "  WARNING: 80% or more of open_cap" : ""}`);
  process.exit(low || slots ? 2 : 0);
} else if (cmd === "owed") {
  if (!isAddress(args[0])) fail("usage: owed <wallet> [token]");
  console.log(`${show((await read("get_owed", { token: tokenArg(args[1]), who: args[0] })).amount || 0)} owed to ${args[0]}`);
} else if (cmd === "connect") {
  const [contract, perDay, strict] = args; if (!isAddress(contract)) fail("usage: connect <app contract> <Mana per day, at least 1> [strict]");
  await write("connect_app", { contract_id: contract, mana_per_day: String(amount(perDay, "Mana per day")), strict: strict === "strict" });
} else if (cmd === "disconnect") {
  if (!isAddress(args[0])) fail("usage: disconnect <app contract>");
  await write("disconnect_app", { contract_id: args[0] });
} else if (cmd === "pause" || cmd === "resume") {
  await write("set_paused", { paused: cmd === "pause" });
} else if (cmd === "propose-withdraw") {
  const [to, koin] = args; if (!isAddress(to)) fail("usage: propose-withdraw <to> <KOIN>");
  await propose({ kind: 2, to, amount: String(amount(koin, "KOIN")) });
} else if (cmd === "propose-upgrade") {
  const h = String(args[0] || "").toLowerCase().replace(/^0x1220/, ""); if (!/^[0-9a-f]{64}$/.test(h)) fail("usage: propose-upgrade <sha256 of the release wasm, 64 hex characters>");
  await propose({ kind: 1, hash: "0x1220" + h });
} else if (cmd === "propose-settle") {
  const [id, back] = args; const e = (await read("get_escrow", { purchase_id: Number(id) })).purchase;
  if (!e || !e.frozen || e.closed) fail(`purchase #${id} isn't frozen by sanctions`);
  await write("propose", (me) => ({ signer: me, action: { kind: 9, purchase_id: Number(id), amount: String(amount(back)) } }),
    { about: ["", ...PT.describe({ kind: 9, purchase_id: Number(id), amount: String(amount(back)) }, { purchase: e }).map((l) => "  " + l)] });
} else if (cmd === "approve" || cmd === "unapprove" || cmd === "veto") {
  const { lines } = await proposalLines(args[0]);
  const fn = cmd === "veto" ? "cancel_proposal" : cmd;
  await write(fn, (me) => ({ signer: me, id: Number(args[0]) }), { about: ["", `You are about to ${cmd.toUpperCase()}:`, ...lines] });
} else if (cmd === "execute") {
  const { lines } = await proposalLines(args[0]);
  await write("execute", { id: Number(args[0]) }, { anyone: true, about: ["", "You are about to CARRY OUT:", ...lines] });
} else if (cmd === "claim") {
  if (!isAddress(args[0])) fail("usage: claim <wallet> [token]");
  const token = tokenArg(args[1]); const owed = (await read("get_owed", { token, who: args[0] })).amount || 0;
  await write("claim", { token, to: args[0] }, { anyone: true, about: [`Pays ${show(owed)} to ${args[0]}.`] });
} else fail(`unknown command ${cmd}`);
