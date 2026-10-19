// Mana Station payer helper (shared by Knode and SwarmTales). Design of 2026-10-19 4:05 PM:
// DEFAULT = the user's own Mana when they have enough. The station is used when they don't, or when they choose it.
// pref: "auto" (default) | "station" (user chose free play). The station is only "available", not the default payer.
export const STATION = "<station address>";               // set at launch
export const EP_CAP = { play: 300000000n };               // per-action cap in Mana satoshis (engineering.md §6)

export async function payerOptions({ provider, user, action, pref = "auto" }) {
  const cap = EP_CAP[action];
  if (cap === undefined) throw new Error("unknown action " + action);
  const own = BigInt(await provider.getAccountRc(user));  // chain.get_account_rc (current Mana)
  const enough = own >= cap * 13n / 10n;                  // 30% cushion: the mempool reserves the full rc_limit of pending txs
  if (pref !== "station" && enough) return { mode: "own", options: { payer: user, rcLimit: String(cap) } };
  return { mode: "station", options: { payer: STATION, payee: user, rcLimit: String(cap) } }; // exactly ep_cap
}

// Send with one fallback: if the station refuses (limits, floor, pause) and the user has some Mana, offer their own.
export async function sendAction({ provider, signer, user, action, operations, pref, confirmOwn }) {
  const { Transaction } = await import("koilib");
  const first = await payerOptions({ provider, user, action, pref });
  try {
    const tx = new Transaction({ signer, provider, options: first.options });
    for (const op of operations) await tx.pushOperation(op);
    const receipt = await tx.send();
    return { mode: first.mode, receipt, wait: () => tx.wait() };
  } catch (e) {
    if (first.mode !== "station") throw e;                 // own-Mana failures are shown as-is
    const own = BigInt(await provider.getAccountRc(user));
    if (own >= EP_CAP[action] && (await confirmOwn?.())) { // "Free play limit reached. Use your own Mana?"
      const tx = new Transaction({ signer, provider, options: { payer: user, rcLimit: String(EP_CAP[action]) } });
      for (const op of operations) await tx.pushOperation(op);
      return { mode: "own-fallback", receipt: await tx.send(), wait: () => tx.wait() };
    }
    throw new Error("Free play is busy right now. Try again in a few minutes."); // refused txs cost nothing
  }
}
