// Mana Station payer helper for apps (Knode, SwarmTales, any Koinos dApp using koilib).
// Oct 21 (Carl): try the station first; if it can't or won't pay, the user's own Mana pays, as if the station weren't
// there. The app never has to change this code when its plan ends: the station simply answers "no" and the user pays.
// One signature per action: the station is asked first (would_pay, read-only), then the payer is chosen.
//
// Tight limits (Carl, Oct 20): the mempool holds a tx's full Mana LIMIT while it waits, and the station counts the
// LIMIT against plans and passes, not the Mana actually used. So limits are sized from real testnet costs plus a small
// margin, never a round "safe" number.
import "./mana-station-client.js";
const MSC = globalThis.ManaStation;
export const STATION = "<station address>";               // set at launch

// Measured on the Koinos testnet, Oct 20 2026: a sponsored play used 16,684,696 (0.167 Mana). Limit = 1.1x, rounded up
// to 0.01 Mana. The station's per-action cap for the entry point (set_entry) must be at least this.
export const EP_CAP = { play: 19_000_000n };              // per action, in Mana base units (1 Mana = 1e8)

/** Choose who pays: { payer, payee?, rcLimit, route }. route "" = the user's own Mana. */
export async function payerOptions({ provider, user, operations, rcLimit, station = STATION }) {
  return MSC.choosePayer({ rpc: provider, station, payee: user, operations, rcLimit });
}

/** Send with the station when it agrees, else the user's own Mana. A refusal on landing (rare: the answer was a
 *  snapshot) is retried once with the user's own Mana; a refusal by the user in their wallet is passed through. */
export async function sendWithStation({ provider, signer, user, operations, rcLimit, station = STATION, Transaction }) {
  if (!Transaction) ({ Transaction } = await import("koilib"));
  const pick = await payerOptions({ provider, user, operations, rcLimit, station });
  const build = async (opts) => { const tx = new Transaction({ signer, provider, options: opts }); for (const op of operations) await tx.pushOperation(op); return tx; };
  const first = pick.payer === station ? { payer: station, payee: user, rcLimit: pick.rcLimit } : { payer: user, rcLimit: String(rcLimit) };
  try { const tx = await build(first); const receipt = await tx.send(); return { paidBy: pick.route ? "station" : "user", route: pick.route, receipt, wait: () => tx.wait() }; }
  catch (e) {
    if (first.payer !== station || !/has not authorized/i.test(String(e?.message || e))) throw e;
    const tx = await build({ payer: user, rcLimit: String(rcLimit) });
    return { paidBy: "user", route: "", receipt: await tx.send(), wait: () => tx.wait() };
  }
}

// Big uploads paid by a ticket. The ticket is charged the rc LIMIT, so estimate it from the chain's live resource prices:
//   bytes × (disk + network cost)            storing and sending the code
// + bytes × TICKS_PER_BYTE × compute cost    the station reading the whole transaction in authorize
// + BASE_TICKS × compute cost                everything else
// then a 15% margin. Calibrated on the testnet (10,580-byte upload used 200,584,946); re-check with `npm run testnet`.
export const UPLOAD_TICKS_PER_BYTE = 1_700n;
export const UPLOAD_BASE_TICKS = 3_000_000n;
export const UPLOAD_MARGIN_PCT = 115n;

export async function estimateUploadRc(provider, bytecodeLength, abiLength = 0) {
  const lim = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
  const bytes = BigInt(bytecodeLength + abiLength + 600);   // + transaction header, signatures, encoding
  const disk = BigInt(lim.disk_storage_cost), net = BigInt(lim.network_bandwidth_cost), cpu = BigInt(lim.compute_bandwidth_cost);
  const raw = bytes * (disk + net) + bytes * UPLOAD_TICKS_PER_BYTE * cpu + UPLOAD_BASE_TICKS * cpu;
  return (raw * UPLOAD_MARGIN_PCT + 99n) / 100n;
}

// Options for uploading the user's own contract with their big-upload ticket (the ticket's payee is the user).
export async function uploadOptions({ provider, user, bytecode, abi = "" }) {
  const rcLimit = await estimateUploadRc(provider, bytecode.length, abi.length);
  return { payer: STATION, payee: user, rcLimit: String(rcLimit) };
}

