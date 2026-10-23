// What a council proposal does, in full, in plain words (audit-2026-10 M-9 / O1-05): the owner page and the admin
// command-line tool both show this before a member approves, vetoes or carries out a proposal, so nobody approves a
// bare label. Works as a browser script (window.MSProposalText) and as a Node module (require).
(function (root) {
  const KIND = { 1: "Upgrade the station's code", 2: "Withdraw KOIN", 3: "Rescue a token sent by mistake", 4: "Replace the council",
    5: "Change the waiting period", 6: "Change the treasury", 7: "Change the big-upload ticket fee", 8: "Change the owner",
    9: "Settle a purchase frozen by sanctions" };
  const amt = (v) => {                                     // 8-decimal base units, exact
    const n = BigInt(v || 0), w = n / 100000000n, f = (n % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");
    return w.toLocaleString("en-US") + (f ? "." + f : "");
  };
  const hours = (ms) => { const h = Number(BigInt(ms || 0) / 3600000n); return h % 24 === 0 ? `${h / 24} days` : `${h} hours`; };
  const pct = (bp) => (Number(bp || 0) / 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  const hashHex = (h) => String(h || "").toLowerCase().replace(/^0x1220/, "").replace(/^0x/, "");
  /** lines: what the proposal would do. `ctx`: { config (get_status().config), purchase (get_escrow of kind 9), expectedHash } */
  function describe(a, ctx) {
    a = a || {}; ctx = ctx || {}; const c = ctx.config || {}; const out = [KIND[a.kind] || `Unknown kind ${a.kind}`];
    switch (Number(a.kind)) {
      case 1: {
        const h = hashHex(a.hash); out.push(`New code sha256: ${h}`);
        if (ctx.expectedHash) out.push(h === hashHex(ctx.expectedHash) ? "Matches the published release fingerprint." : `DOES NOT MATCH the published release fingerprint ${hashHex(ctx.expectedHash)}. Don't approve.`);
        else out.push("Compare it, character by character, with the sha256 published for the release (docs/LAUNCH.md).");
        break;
      }
      case 2: out.push(`Send ${amt(a.amount)} KOIN from the station to ${a.to}.`); out.push("If less KOIN than koin_amount would stay, koin_amount is lowered to what stays (never below what is already sold)."); break;
      case 3: out.push(`Send ${amt(a.amount)} of token ${a.token} to ${a.to} (only tokens above what escrow holds and owes).`); break;
      case 4: {
        const now = c.council || [], next = a.council || [];
        out.push(`New council (${next.length} members, ${a.threshold} approvals needed): ${next.join(", ")}.`);
        const added = next.filter((x) => !now.includes(x)), removed = now.filter((x) => !next.includes(x));
        if (added.length) out.push("Added: " + added.join(", ")); if (removed.length) out.push("Removed: " + removed.join(", "));
        if (c.threshold !== undefined) out.push(`Now: ${now.length} members, ${c.threshold} approvals needed.`);
        break;
      }
      case 5: out.push(`New waiting period: ${hours(a.delay_ms)}${c.guard_delay_ms ? ` (now ${hours(c.guard_delay_ms)})` : ""}.`); break;
      case 6: out.push(`New treasury: ${a.to}${c.treasury ? ` (now ${c.treasury})` : " (now the owner wallet)"}.`); break;
      case 7: out.push(`New ticket fee: ${pct(a.fee_bp)}${c.ticket_fee_bp !== undefined ? ` (now ${pct(c.ticket_fee_bp || 500)})` : ""}. Tickets already sold keep their fee.`); break;
      case 8: out.push(`New owner: ${a.to}${c.owner ? ` (now ${c.owner})` : ""}.`); break;
      case 9: {
        const e = ctx.purchase || {}; const held = BigInt(e.amount || 0) - BigInt(e.refunded || 0) - BigInt(e.released || 0);
        out.push(`Purchase #${a.purchase_id}${e.buyer ? `, paid by ${e.buyer}` : ""}${e.amount ? `, holding ${amt(held)} of ${e.token}` : ""}.`);
        out.push(`Give back ${amt(a.amount)} to the wallet that paid it (owed; it can collect once it is no longer suspended for sanctions); release ${e.amount ? amt(held - BigInt(a.amount || 0)) : "the rest"} to the treasury.`);
        break;
      }
      default: out.push("This station doesn't know this kind of proposal. Don't approve it.");
    }
    return out;
  }
  const api = { KIND, describe, amt };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MSProposalText = api;
})(typeof window !== "undefined" ? window : globalThis);
