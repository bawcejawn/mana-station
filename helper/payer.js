// Mana Station payer helper (shared by Knode and SwarmTales). Design of 2026-10-19 4:05 PM, tight limits Oct 20.
// DEFAULT = the user's own Mana when they have enough. The station is used when they don't, or when they choose it.
// pref: "auto" (default) | "station" (user chose free play). The station is only "available", not the default payer.
//
// Tight limits (Carl, Oct 20): the mempool holds a tx's full Mana LIMIT while it waits, and a big-upload ticket is
// charged the LIMIT, not the Mana actually used (the station approves before the tx runs). So every limit here is
// sized from real testnet costs plus a small margin, never a round "safe" number.
export const STATION = "<station address>";               // set at launch

// Measured on the Koinos testnet, Oct 20 2026: a sponsored play used 16,684,696 (0.167 Mana). Limit = 1.1x, rounded up
// to 0.01 Mana. The station's per-action cap for the entry point (set_entry) must be at least this.
export const EP_CAP = { play: 19_000_000n };              // per action, in Mana base units (1 Mana = 1e8)

export async function payerOptions({ provider, user, action, pref = "auto" }) {
  const cap = EP_CAP[action];
  if (cap === undefined) throw new Error("unknown action " + action);
  const own = BigInt(await provider.getAccountRc(user));  // chain.get_account_rc (current Mana)
  const enough = own >= cap * 13n / 10n;                  // 30% cushion: the mempool reserves the full rc_limit of pending txs
  if (pref !== "station" && enough) return { mode: "own", options: { payer: user, rcLimit: String(cap) } };
  return { mode: "station", options: { payer: STATION, payee: user, rcLimit: String(cap) } };
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

// Send with one fallback: if the station refuses (limits, floor, pause) and the user has some Mana, offer their own.
// A wallet refusal (the user cancelled in Kondor) is passed through as-is, never shown as "free play is busy".
export async function sendAction({ provider, signer, user, action, operations, pref, confirmOwn }) {
  const { Transaction } = await import("koilib");
  const first = await payerOptions({ provider, user, action, pref });
  try {
    const tx = new Transaction({ signer, provider, options: first.options });
    for (const op of operations) await tx.pushOperation(op);
    const receipt = await tx.send();
    return { mode: first.mode, receipt, wait: () => tx.wait() };
  } catch (e) {
    if (first.mode !== "station" || !/has not authorized|insufficient rc/i.test(String(e?.message || e))) throw e;
    const own = BigInt(await provider.getAccountRc(user));
    if (own >= EP_CAP[action] && (await confirmOwn?.())) { // "Free play limit reached. Use your own Mana?"
      const tx = new Transaction({ signer, provider, options: { payer: user, rcLimit: String(EP_CAP[action]) } });
      for (const op of operations) await tx.pushOperation(op);
      return { mode: "own-fallback", receipt: await tx.send(), wait: () => tx.wait() };
    }
    throw new Error("Free play is busy right now. Try again in a few minutes."); // refused txs cost nothing
  }
}
