#!/usr/bin/env node
// Mana Station admin CLI (Oct 20). The same actions as site/console.html, from a terminal.
//
//   STATION=<station address> [RPC=https://testnet.koinosfoundation.org] node admin/station-admin.mjs <command> [args]
//
// Read (no key needed):
//   list                              free apps, paid allowances, today's budget
//   proposals                         open council proposals
// Owner:
//   connect <app contract> <Mana/day> [strict]   connect or update a free app
//   disconnect <app contract>
//   resume
// Owner or council member:
//   pause
// Council member:
//   propose-withdraw <to> <KOIN>       KOIN out of the station (needs approvals + the waiting period)
//   approve <id> | veto <id>
// Anyone:
//   execute <id>                       carry out an approved proposal after its waiting period
//
// The signing key is read from ADMIN_WIF, or asked for with a hidden prompt. It is never printed or saved.
// Owner and council transactions are paid by the station when its limits allow, otherwise by the signer's own Mana.
import { createRequire } from "module"; import fs from "fs"; import readline from "readline";
const require = createRequire(import.meta.url);
const { Provider, Signer, Contract } = require("../contracts/station/node_modules/koilib");

const RPC = process.env.RPC || "https://testnet.koinosfoundation.org";
const STATION = process.env.STATION;
const M = 100_000_000n;
const KIND = { 1: "upgrade", 2: "withdraw KOIN", 3: "rescue token", 4: "change council", 5: "change delay", 6: "change treasury", 7: "change ticket fee", 8: "change owner" };
const [cmd, ...args] = process.argv.slice(2);
if (!cmd || !STATION) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 22).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(cmd ? 1 : 0); }

const provider = new Provider([RPC]);
const abi = JSON.parse(fs.readFileSync(new URL("../contracts/station/abi/station.koilib.json", import.meta.url)));
const reader = new Contract({ id: STATION, abi, provider });
const mana = (v) => (Number(BigInt(v || 0)) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 });
const read = async (fn, a = {}) => (await reader.functions[fn](a)).result || {};

function hiddenPrompt(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a.trim()); });
  });
}
async function signer() {
  const wif = process.env.ADMIN_WIF || (await hiddenPrompt("Signing key (WIF, hidden): "));
  const s = Signer.fromWif(wif); s.provider = provider; return s;
}
async function write(fn, a, { anyone = false } = {}) {
  const s = await signer(); const me = s.getAddress();
  const c = new Contract({ id: STATION, abi, provider, signer: s });
  const tries = anyone ? [{ rcLimit: String(M / 2n) }] : [{ payer: STATION, payee: me, rcLimit: String(M) }, { rcLimit: String(M) }];
  for (const opts of tries) {
    try {
      const { transaction, receipt } = await c.functions[fn](typeof a === "function" ? a(me) : a, opts);
      await transaction.wait("byBlock", 60000);
      console.log(`${fn}: done (${opts.payer ? "paid by the station" : "paid by you"}, ${mana(receipt.rc_used)} Mana)`); return;
    } catch (e) {
      if (opts.payer && /has not authorized|insufficient/i.test(String(e.message))) continue; // station declined: pay ourselves
      console.error(`${fn}: not done: ${e.message}`); process.exit(1);
    }
  }
}

if (cmd === "list") {
  const L = await read("list_connected"); const st = await read("get_status");
  console.log(`Station ${STATION} on ${RPC}${st.config?.paused ? "  [PAUSED]" : ""}`);
  console.log(`Mana ${mana(L.mana)}   daily budget ${mana(L.daily_budget)}   reserved ${mana(L.reserved)}   sellable ${mana(L.sellable)}   sold ${mana(L.sold)}\n`);
  console.log("Free apps:");
  for (const a of L.free_apps || []) console.log(`  ${(a.contract_id || `(slot ${a.app}, no contract)`).padEnd(36)} ${mana(a.mana_per_day).padStart(10)} Mana/day   used ${mana(a.used_24h)}${a.strict ? "   listed functions only" : ""}`);
  if (!(L.free_apps || []).length) console.log("  none");
  console.log("\nPaid allowances:");
  for (const p of L.paid || []) console.log(`  #${p.id} ${p.target}  ${mana(p.mana_per_day)} Mana/day  used ${mana(p.used_24h)}  ends ${new Date(Number(p.expiry)).toISOString()}${p.suspended ? "  SUSPENDED" : ""}`);
  if (!(L.paid || []).length) console.log("  none");
} else if (cmd === "proposals") {
  const st = await read("get_status"); const P = (await read("list_proposals")).proposals || [];
  for (const p of P) {
    const a = p.action || {};
    console.log(`#${p.id} ${KIND[a.kind] || a.kind}${a.kind === 2 ? ` ${mana(a.amount)} KOIN to ${a.to}` : ""}${a.kind === 1 ? ` ${a.hash}` : ""}  approvals ${(p.approvals || []).length}/${st.config?.threshold}  ${p.ready_at && p.ready_at !== "0" ? "ready " + new Date(Number(p.ready_at)).toISOString() : "needs approvals"}`);
  }
  if (!P.length) console.log("No open proposals.");
} else if (cmd === "connect") {
  const [contract, perDay, strict] = args; if (!contract || !(Number(perDay) >= 1)) { console.error("usage: connect <app contract> <Mana per day, at least 1> [strict]"); process.exit(1); }
  await write("connect_app", { contract_id: contract, mana_per_day: String(BigInt(Math.round(Number(perDay) * 1e8))), strict: strict === "strict" });
} else if (cmd === "disconnect") {
  await write("disconnect_app", { contract_id: args[0] });
} else if (cmd === "pause" || cmd === "resume") {
  await write("set_paused", { paused: cmd === "pause" });
} else if (cmd === "propose-withdraw") {
  const [to, koin] = args; await write("propose", (me) => ({ signer: me, action: { kind: 2, to, amount: String(BigInt(Math.round(Number(koin) * 1e8))) } }));
} else if (cmd === "approve" || cmd === "veto") {
  await write(cmd === "approve" ? "approve" : "cancel_proposal", (me) => ({ signer: me, id: Number(args[0]) }));
} else if (cmd === "execute") {
  await write("execute", { id: Number(args[0]) }, { anyone: true });
} else { console.error(`unknown command ${cmd}`); process.exit(1); }
