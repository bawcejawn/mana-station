/* Mana Station helper, background. The only part that talks to the network: one read-only question to one Koinos
 * node, about one station ("would_pay"). It never sends, signs or stores transactions.
 * Audit 2026-10-21: strict input checks (addresses, entry points, base64url args, sizes), one question at a time per
 * tab and at most 20 a minute per tab, and the "covered today" count comes only from questions it answered yes. */
importScripts("client.js", "config.js");
const CFG = self.MS_CONFIG, MSC = self.ManaStation;
const B58 = /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/, B64U = /^[A-Za-z0-9_-]{0,87382}$/;   // args up to 64 KiB
const today = () => new Date().toISOString().slice(0, 10);
const busy = new Map(), recent = new Map();            // tab → in flight; tab → recent question times

function valid(m) {
  if (!B58.test(String(m.payee || ""))) return false;
  if (typeof m.rcLimit !== "string" || !/^[0-9]{1,20}$/.test(m.rcLimit) || BigInt(m.rcLimit) > BigInt(CFG.maxRc)) return false;
  if (!Array.isArray(m.operations) || m.operations.length < 1 || m.operations.length > 10) return false;
  for (const o of m.operations) {
    if (!o || typeof o !== "object" || Object.keys(o).length !== 1 || !o.call_contract) return false;
    const c = o.call_contract;
    if (!B58.test(String(c.contract_id || ""))) return false;
    if (!Number.isInteger(c.entry_point) || c.entry_point < 0 || c.entry_point > 0xffffffff) return false;
    if (c.args !== undefined && (typeof c.args !== "string" || !B64U.test(c.args))) return false;
  }
  return true;
}
function allowed(tab) {
  const t = Date.now(), list = (recent.get(tab) || []).filter((x) => t - x < 60000);
  if (busy.get(tab) || list.length >= 20) return false;
  list.push(t); recent.set(tab, list); busy.set(tab, true); return true;
}
async function count() {
  const s = await chrome.storage.local.get({ coveredDay: "", covered: 0 });
  await chrome.storage.local.set(s.coveredDay === today() ? { covered: s.covered + 1 } : { coveredDay: today(), covered: 1 });
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !m || m.type !== "would_pay") return false;
  const tab = sender.tab ? sender.tab.id : -1;
  (async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    if (!enabled || !valid(m) || !allowed(tab)) return { pay: false };
    try {
      const w = await MSC.wouldPay({ rpc: CFG.rpc, station: CFG.station, payee: m.payee, operations: m.operations, rcLimit: m.rcLimit });
      if (!w.pay) return { pay: false };
      await count();
      return { pay: true, rcLimit: m.rcLimit };
    } finally { busy.delete(tab); }
  })().then(reply, () => { busy.delete(tab); reply({ pay: false }); });
  return true;                                       // answer asynchronously
});
