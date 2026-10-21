/* Mana Station helper, background. The only part that talks to the network: one read-only question to one Koinos
 * node, about one station ("would_pay"). It never sends, signs or stores transactions. */
importScripts("client.js", "config.js");
const CFG = self.MS_CONFIG, MSC = self.ManaStation;
const B58 = /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/;
const today = () => new Date().toISOString().slice(0, 10);

async function settings() {
  const s = await chrome.storage.local.get({ enabled: true, coveredDay: "", covered: 0 });
  if (s.coveredDay !== today()) { s.coveredDay = today(); s.covered = 0; }
  return s;
}
function valid(m) {
  if (!B58.test(String(m.payee || ""))) return false;
  if (!Array.isArray(m.operations) || m.operations.length < 1 || m.operations.length > 10) return false;
  if (!/^[0-9]{1,20}$/.test(String(m.rcLimit || ""))) return false;
  return m.operations.every((o) => o && typeof o === "object" && (!o.call_contract || (B58.test(String(o.call_contract.contract_id || "")) && String(o.call_contract.args || "").length < 65536)));
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (m && m.type === "covered") { settings().then((s) => chrome.storage.local.set({ coveredDay: s.coveredDay, covered: s.covered + 1 })); return false; }
  if (!m || m.type !== "would_pay") return false;
  (async () => {
    const s = await settings();
    if (!s.enabled || !valid(m)) return { pay: false };
    const pick = await MSC.choosePayer({ rpc: CFG.rpc, station: CFG.station, payee: m.payee, operations: m.operations, rcLimit: m.rcLimit, maxRc: CFG.maxRc });
    return pick.payer === CFG.station ? { pay: true, rcLimit: pick.rcLimit } : { pay: false };
  })().then(reply, () => reply({ pay: false }));
  return true;                                      // answer asynchronously
});
