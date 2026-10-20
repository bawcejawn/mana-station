/**
 * Mana Station v2 (Carl's model, 2026-10-19 4:13 PM). LOCAL PROTOTYPE: not deployed anywhere.
 *  - Daily budget = koin_amount × refill_bp (20% = one day's refill). Rolling 24 h. The rest (80%) is the reserve.
 *  - Carl's apps have hard allowances (bp of koin_amount); only the owner can exceed them (explicit, expiring boost).
 *  - A sold slice (bp of koin_amount) for prepaid allowances bought in stablecoins; it never touches Carl's apps.
 *  - Paid big uploads draw from the reserve with: big floor (admin_min + one day's budget), per-request max,
 *    cooldown, rolling 7-day cap, and a debt that the sold slice repays (the slice pauses while repaying), so total
 *    spend over time never exceeds the refill and the reserve always reloads.
 * Upload with ONLY authorizes_transaction_application = true.
 * Audit fixes (2026-10-19, branch fix/squat-freeze-stall): #2 debt never pauses paid allowances, per-buyer ticket
 * wait, tickets lock Mana for 24 h at full price with a straight-line time refund (Carl, 8:19 PM); #3 target app must sign, minimum charge, per-buyer cap; #4 finished purchases are
 * swept on buy/renew; #7 no-oversell guard. KNOWN OPEN (#1): the station key still holds every permission except
 * transaction_application, so it can move funds and re-upload code. Fix designed separately before any mainnet.
 */
import { System, Storage, Protobuf, Arrays, Token, Base58, authority, value, protocol } from "@koinos/sdk-as";
import { station } from "./proto/station";

const S_CONFIG: u32 = 0, S_APPS: u32 = 1, S_ENTRIES: u32 = 2, S_USERS: u32 = 3, S_APPWIN: u32 = 4,
  S_PRICES: u32 = 5, S_ALLOW: u32 = 6, S_TARGET: u32 = 7, S_TICKETS: u32 = 8, S_BIG: u32 = 9, S_REVENUE: u32 = 10, S_EXEMPT: u32 = 11, S_REGISTRY: u32 = 12, S_GLOBALWIN: u32 = 13, S_OVERFLOWWIN: u32 = 14, S_BUFFERWIN: u32 = 15, S_SUSPEND: u32 = 16, S_ESCROW: u32 = 17, S_ESCROWTOT: u32 = 18, S_TICKETCD: u32 = 19,
  S_TESTLEDGER: u32 = 90;
const DAY: u64 = 86_400_000;
const MANA: u64 = 100_000_000;
const USER_SLOT: u64 = 21_600_000; const USER_N: i32 = 4;   // 4 × 6 h
const APP_SLOT: u64 = 3_600_000; const APP_N: i32 = 24;     // 24 × 1 h
const WEEK_N: i32 = 7;                                       // 7 × 1 day
const GLOBAL_KEY: u32 = 0xffffffff;
// Stablecoins (stablecoins.md, 2026-10-19). Prices are set per token by the owner; these are the defaults to set.
import { VUSDT, VUSDC } from "./net";
export { VUSDT, VUSDC };
const LEGACY_CHAINGE_USDT = "19WrWze3XAoMa3Mwqys4rJMP6emZX2wfpH"; // rejected

// Test build only.
export let TEST_MANA: u64 = 0;
export let TEST_BALANCE: u64 = 0;
export function testSetMana(m: u64): void { TEST_MANA = m; }
export function testSetBalance(b: u64): void { TEST_BALANCE = b; }
function ledger(): Storage.Map<Uint8Array, station.revenue_object> {
  return new Storage.Map(System.getContractId(), S_TESTLEDGER, station.revenue_object.decode, station.revenue_object.encode, () => new station.revenue_object());
}
function lk(token: Uint8Array, who: Uint8Array): Uint8Array { const k = new Uint8Array(token.length + who.length); k.set(token, 0); k.set(who, token.length); return k; }
export function testSetToken(token: Uint8Array, who: Uint8Array, amount: u64): void { ledger().put(lk(token, who), new station.revenue_object(amount)); }
export function testGetToken(token: Uint8Array, who: Uint8Array): u64 { return ledger().get(lk(token, who))!.total; }

function isAddress(a: Uint8Array | null): bool { return a != null && a.length == 25; }
function u32Key(n: u32): Uint8Array { const k = new Uint8Array(4); k[0] = u8(n >> 24); k[1] = u8(n >> 16); k[2] = u8(n >> 8); k[3] = u8(n); return k; }
function entryKey(contract: Uint8Array, ep: u32): Uint8Array { const k = new Uint8Array(contract.length + 4); k.set(contract, 0); k.set(u32Key(ep), contract.length); return k; }
function pct(amount: u64, bp: u32): u64 { return amount / 10_000 * u64(bp); }
function wholeManaUp(m: u64): u64 { return (m + MANA - 1) / MANA; }
// DRAFT terms (audit #1/#6, 2026-10-19): rewritten to promise only what the code does. Pending legal review.
export const ALLOWANCE_TERMS = "DRAFT, pending legal review. Prepaid Mana for one app contract. The station sponsors a transaction only when every top-level operation in it calls that app; what the app does internally when called is up to the app. The app's own key must approve the purchase. Per-user anti-spam limits apply to each of the app's users. Each wallet may hold a limited number of open allowances and tickets at once. Payment is held at the station's address until the term ends, then released to the operator. Until the station's planned permission upgrade, that address is controlled by the operator's key: this is operator custody, not trustless escrow. If the operator sets a minimum charge, it is shown in the quote and kept if you cancel. Cancel any time: unused whole days are refunded (the current day counts as used, so 1 day is the minimum charge). If the operator pauses the station, paused time is credited: your term is extended by the pause. No auto-renew: service stops at expiry unless you renew, at the price current then. 1-, 7- and 30-day terms only. Non-transferable; not redeemable for crypto or cash except these refunds. Introductory prices may increase for new purchases. A buyer may be suspended for abuse, sanctions or AUP reasons; suspended time is not extended, and the operator may refund unused days (never to a sanctioned party).";
export const BIG_TERMS = "DRAFT, pending legal review. Prepaid big upload: the station reserves the Mana you buy for you for one full 24-hour period, at the full price, whether you use it or not. Reserved Mana is not sold again or spent by the station's other services. Paid in vUSDT or vUSDC and held at the station's address (operator custody until the planned permission upgrade, not trustless escrow). If the lock runs its full period, nothing is refunded. If you end it early, you get back the value of the Mana you have not used, reduced in a straight line by the time already passed (for example, half the Mana left with three quarters of the time left returns 37.5% of the price), always keeping a fee (currently 5%). If the operator sets a minimum charge, it is shown in the quote and kept if you cancel. Refunds are only in the stablecoin you paid, never in Mana or KOIN. Each buyer can buy one ticket per cooldown period (default 24 hours). Tickets only sponsor uploading or calling the payee's own contract. In rare cases (for example if the station's Mana falls below its safety floor) a transaction can still be refused; tell the operator, who may refund the unexpired share. Paused time extends the lock. No auto-renew. Non-transferable; not redeemable for crypto or cash except these refunds. Each wallet may hold a limited number of open allowances and tickets at once. A buyer may be suspended for abuse, sanctions or AUP reasons; the operator may refund the unexpired share (never to a sanctioned party).";
const MAX_OPEN_PURCHASES: i32 = 128;                 // bounded loops (pause credit)
const MAX_TERMS: i32 = 8;
const DEFAULT_TICKET_FEE_BP: u32 = 500;             // 5% (Carl, 8:10 PM)
const DEFAULT_TICKET_MS: u64 = 86_400_000;          // ticket lifetime when big_ticket_ms = 0 (Carl, 8:02 PM: 24 h)
const DEFAULT_MAX_PER_BUYER: u32 = 5;               // audit #3: open allowances per buyer when max_per_buyer = 0
const SWEEP_MAX: i32 = 8;                           // audit #4: finished purchases closed per buy / renew
const TX_BUFFER: u32 = 64 * 1024;                   // normal sponsored txs
const BIG_TX_BUFFER: u32 = 1024 * 1024;             // big-upload ticket txs (contract bytecode)                            // open escrow terms per allowance
const DEFAULT_ALERT_MANA: u64 = 15_000 * MANA;     // Carl: alert below 15k by default
const MAX_WHOLE_MANA: u64 = 100_000_000;            // quote bound (no u64 overflow with prices <= MAX_UNIT_PRICE)
const MAX_UNIT_PRICE: u64 = 10_000_000_000;         // 100 tokens per 1,000 Mana(/day)
/** Tier price per 1,000 Mana/day for a whole term; 0 = this duration is not offered. Only 1, 7 and 30 days exist. */
function tierPrice(p: station.price_object, days: u64): u64 {
  if (days == 1) return p.price_1d;
  if (days == 7) return p.price_7d;
  if (days == 30) return p.price_30d;
  return 0;
}
/** ceil(whole Mana × unit / 1,000). */
function per1000(manaUnits: u64, unit: u64): u64 { return (wholeManaUp(manaUnits) * unit + 999) / 1000; }

/** floor(a × b / c) exactly, with a 128-bit intermediate (no overflow for any u64 inputs; requires c > 0). */
export function mulDiv(a: u64, b: u64, c: u64): u64 {
  const aL = a & 0xffffffff, aH = a >> 32, bL = b & 0xffffffff, bH = b >> 32;
  const ll = aL * bL, lh = aL * bH, hl = aH * bL, hh = aH * bH;
  const mid = (ll >> 32) + (lh & 0xffffffff) + (hl & 0xffffffff);
  let lo = (ll & 0xffffffff) | (mid << 32);
  let hi = hh + (lh >> 32) + (hl >> 32) + (mid >> 32);
  let q: u64 = 0, r: u64 = 0;
  for (let i = 127; i >= 0; i--) {                     // binary long division of (hi:lo) by c
    const top = r >> 63;
    r = (r << 1) | (i >= 64 ? (hi >> u64(i - 64)) & 1 : (lo >> u64(i)) & 1);
    if (top != 0 || r >= c) { r -= c; if (i < 64) q |= (u64(1) << u64(i)); }
  }
  return q;                                            // callers keep a×b/c < 2^64 (refund ≤ amount)
}

function txOps(): protocol.operation[] {
  if (BUILD_FOR_TESTING) return System.getTransaction().operations;
  const list = Protobuf.decode<value.list_type>(System.getTransactionField("operations")!.message_value!.value!, value.list_type.decode);
  const out = new Array<protocol.operation>();
  for (let i = 0; i < list.values.length; i++) out.push(Protobuf.decode<protocol.operation>(list.values[i].message_value!.value!, protocol.operation.decode));
  return out;
}

function roll(w: station.window_object, slot: u64, n: i32, withNew: bool): void {
  if (w.n.length != n) {
    w.n = new Array<u32>(n); w.mana = new Array<u64>(n); w.new_mana = withNew ? new Array<u64>(n) : new Array<u64>(0);
    for (let i = 0; i < n; i++) { w.n[i] = 0; w.mana[i] = 0; if (withNew) w.new_mana[i] = 0; }
    w.base = slot; return;
  }
  if (slot <= w.base) return;
  const steps = slot - w.base;
  const clear = steps >= u64(n) ? n : i32(steps);
  for (let k = 1; k <= clear; k++) {
    const i = i32((w.base + u64(k)) % u64(n));
    w.n[i] = 0; w.mana[i] = 0; if (withNew) w.new_mana[i] = 0;
  }
  w.base = slot;
}
function add(w: station.window_object, slot: u64, n: i32, rc: u64, isNew: bool): void {
  const i = i32(slot % u64(n)); w.n[i] += 1; w.mana[i] += rc; if (isNew && w.new_mana.length == n) w.new_mana[i] += rc;
}
function sumN(w: station.window_object): u32 { let s: u32 = 0; for (let i = 0; i < w.n.length; i++) s += w.n[i]; return s; }
function sumMana(w: station.window_object): u64 { let s: u64 = 0; for (let i = 0; i < w.mana.length; i++) s += w.mana[i]; return s; }
function sumNew(w: station.window_object): u64 { let s: u64 = 0; for (let i = 0; i < w.new_mana.length; i++) s += w.new_mana[i]; return s; }

export class Station {
  contractId: Uint8Array = System.getContractId();
  config: Storage.Obj<station.config_object> = new Storage.Obj(System.getContractId(), S_CONFIG, station.config_object.decode, station.config_object.encode, () => new station.config_object());
  apps: Storage.Map<Uint8Array, station.app_object> = new Storage.Map(System.getContractId(), S_APPS, station.app_object.decode, station.app_object.encode, null);
  entries: Storage.Map<Uint8Array, station.entry_object> = new Storage.Map(System.getContractId(), S_ENTRIES, station.entry_object.decode, station.entry_object.encode, null);
  users: Storage.Map<Uint8Array, station.user_object> = new Storage.Map(System.getContractId(), S_USERS, station.user_object.decode, station.user_object.encode, null);
  appWin: Storage.Map<Uint8Array, station.window_object> = new Storage.Map(System.getContractId(), S_APPWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());
  prices: Storage.Map<Uint8Array, station.price_object> = new Storage.Map(System.getContractId(), S_PRICES, station.price_object.decode, station.price_object.encode, null);
  allowances: Storage.Map<Uint8Array, station.allowance_object> = new Storage.Map(System.getContractId(), S_ALLOW, station.allowance_object.decode, station.allowance_object.encode, null);
  targets: Storage.Map<Uint8Array, station.revenue_object> = new Storage.Map(System.getContractId(), S_TARGET, station.revenue_object.decode, station.revenue_object.encode, null);
  tickets: Storage.Map<Uint8Array, station.ticket_object> = new Storage.Map(System.getContractId(), S_TICKETS, station.ticket_object.decode, station.ticket_object.encode, null);
  big: Storage.Obj<station.big_object> = new Storage.Obj(System.getContractId(), S_BIG, station.big_object.decode, station.big_object.encode, () => new station.big_object());
  escrow: Storage.Map<Uint8Array, station.escrow_object> = new Storage.Map(System.getContractId(), S_ESCROW, station.escrow_object.decode, station.escrow_object.encode, null);
  ticketCd: Storage.Map<Uint8Array, station.revenue_object> = new Storage.Map(System.getContractId(), S_TICKETCD, station.revenue_object.decode, station.revenue_object.encode, null);
  escrowTot: Storage.Map<Uint8Array, station.escrow_totals_object> = new Storage.Map(System.getContractId(), S_ESCROWTOT, station.escrow_totals_object.decode, station.escrow_totals_object.encode, () => new station.escrow_totals_object());
  exempt: Storage.Map<Uint8Array, station.exempt_object> = new Storage.Map(System.getContractId(), S_EXEMPT, station.exempt_object.decode, station.exempt_object.encode, null);
  registry: Storage.Obj<station.registry_object> = new Storage.Obj(System.getContractId(), S_REGISTRY, station.registry_object.decode, station.registry_object.encode, () => new station.registry_object());
  globalWin: Storage.Obj<station.window_object> = new Storage.Obj(System.getContractId(), S_GLOBALWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());
  suspended: Storage.Map<Uint8Array, station.suspend_object> = new Storage.Map(System.getContractId(), S_SUSPEND, station.suspend_object.decode, station.suspend_object.encode, null);
  bufferWin: Storage.Obj<station.window_object> = new Storage.Obj(System.getContractId(), S_BUFFERWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());
  overflowWin: Storage.Obj<station.window_object> = new Storage.Obj(System.getContractId(), S_OVERFLOWWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());
  lastNew: bool = false;

  // ───── environment ─────
  mana(): u64 { return BUILD_FOR_TESTING ? TEST_MANA : System.getAccountRC(this.contractId); }
  koinBalance(): u64 { return BUILD_FOR_TESTING ? TEST_BALANCE : new Token(System.getContractAddress("koin")).balanceOf(this.contractId); }
  now(): u64 { return System.getBlockField("header.timestamp")!.uint64_value; }
  height(): u64 { return System.getBlockField("header.height")!.uint64_value; }
  /** Payment, pattern A from stablecoins.md §5.1: the buyer approves the station for exactly `amount` (same tx,
   *  earlier operation) and the station PULLS with KCS-4 transfer(from = buyer, to = the station's own escrow). */
  collect(token: Uint8Array, from: Uint8Array, amount: u64): void {
    const tot = this.escrowTot.get(token)!; tot.held += amount; tot.collected += amount; this.escrowTot.put(token, tot);
    if (BUILD_FOR_TESTING) {
      const f = testGetToken(token, from); System.require(f >= amount, "insufficient token balance");
      testSetToken(token, from, f - amount); testSetToken(token, this.contractId, testGetToken(token, this.contractId) + amount);
    } else {
      System.require(new Token(token).transfer(from, this.contractId, amount), "payment failed (approve the station for the price first)");
    }
  }
  /** Escrow payout (refund to the buyer or release to Carl). State is updated BEFORE the token call. */
  send(token: Uint8Array, to: Uint8Array, amount: u64): void {
    if (amount == 0) return;
    if (BUILD_FOR_TESTING) {
      const f = testGetToken(token, this.contractId); System.require(f >= amount, "escrow short");
      testSetToken(token, this.contractId, f - amount); testSetToken(token, to, testGetToken(token, to) + amount);
    } else {
      System.require(new Token(token).transfer(this.contractId, to, amount), "escrow payout failed");
    }
  }
  /** Where releases go: the treasury if set (never the station), else Carl's owner wallet. */
  treasury(c: station.config_object): Uint8Array { return isAddress(c.treasury) ? c.treasury! : (isAddress(c.owner) ? c.owner! : new Uint8Array(0)); } // empty before init (get_status no longer traps)
  /** The escrow clock: frozen at paused_at while the station is paused. */
  clock(c: station.config_object, now: u64): u64 { const b = this.big.get()!; return c.paused && b.paused_at > 0 ? b.paused_at : now; }
  newPurchase(kind: u32, buyer: Uint8Array, token: Uint8Array, amount: u64, start: u64, end: u64): station.escrow_object {
    const reg = this.registry.get()!;
    System.require(reg.open_purchases.length < MAX_OPEN_PURCHASES, "too many open purchases");
    const b = this.big.get()!; b.next_purchase += 1; this.big.put(b);
    const e = new station.escrow_object(); e.id = b.next_purchase; e.kind = kind; e.buyer = buyer; e.token = token;
    e.amount = amount; e.start = start; e.end = end;
    reg.open_purchases.push(e.id); this.registry.put(reg);
    return e;
  }
  held(e: station.escrow_object): u64 { return e.amount - e.refunded - e.released; }
  /** Unused whole days of an allowance term at time t: the current (started) day counts as used. */
  unusedDays(e: station.escrow_object, t: u64): u64 {
    if (e.closed || t >= e.end) return 0;
    if (t < e.start) return e.days;                                   // future (renewed) term: all unused
    const used = (t - e.start) / DAY + 1;
    return used >= e.days ? 0 : e.days - used;
  }
  /** Refund = floor(amount × unused / days): rounds down by < 1 base unit (in Carl's favour); never creates value. */
  termRefund(e: station.escrow_object, t: u64, keepMin: bool = true): u64 {
    const u = this.unusedDays(e, t); if (u == 0) return 0;
    let r = mulDiv(e.amount, u, e.days);
    if (keepMin) { const cap = e.amount > e.min_keep ? e.amount - e.min_keep : 0; if (r > cap) r = cap; } // review M3: the minimum charge stays
    const h = this.held(e); return r > h ? h : r;
  }
  /** Ticket refund (Carl, Oct 19 8:19 PM + 8:43 PM): a ticket LOCKS its Mana for one full period at the full price.
   *  Ending it early returns the value of the Mana still left, decayed by the time already passed:
   *    refund = floor(floor(paid × time left / lock length) × unused Mana / ticket Mana)
   *  e.g. 50% Mana left with 75% of the time left → 37.5% back. Never more than paid − fee (ticket_fee_bp, default 5%,
   *  rounded up), so even an immediate cancel keeps the fee. Expiry or used-up Mana returns nothing. `clock` is the
   *  escrow clock (frozen while paused; the pause credit shifts start and end together, so the lock length stays). */
  ticketRefund(e: station.escrow_object, t: station.ticket_object, clock: u64, feeBp: u32): u64 {
    if (e.closed || e.end <= e.start || clock >= e.end) return 0;
    const lock = e.end - e.start;
    const left = clock <= e.start ? lock : e.end - clock;
    let r = mulDiv(e.amount, left, lock);                                // straight-line time decay of the price…
    if (t.mana > 0) r = mulDiv(r, t.remaining, t.mana);                  // …applied to the share of Mana still unused
    if (feeBp > 0) {                                                     // always keep at least the fee (rounded up)
      const keep = e.amount - mulDiv(e.amount, u64(10_000 - feeBp), 10_000);
      const cap = e.amount - keep; if (r > cap) r = cap;
    }
    if (feeBp > 0) { const cap = e.amount > e.min_keep ? e.amount - e.min_keep : 0; if (r > cap) r = cap; } // review M3
    const h = this.held(e); return r > h ? h : r;
  }
  /** KOIN or any priced / rejected stablecoin: never a sponsorable app (no sponsored token transfers). */
  isMoneyContract(t: Uint8Array): bool {
    if (this.prices.has(t) || Arrays.equal(t, Base58.decode(VUSDT)) || Arrays.equal(t, Base58.decode(VUSDC)) || Arrays.equal(t, Base58.decode(LEGACY_CHAINGE_USDT))) return true;
    return !BUILD_FOR_TESTING && Arrays.equal(t, System.getContractAddress("koin"));
  }
  /** Audit #4: close up to SWEEP_MAX finished purchases so the open list (capped at 128) can't fill up and stop sales.
   *  Same outcome as release() / close_ticket(): earned money to the treasury, refunds to buyers. Purchases of any
   *  suspended buyer are skipped (the owner decides those, and sanctions freeze them). Bounded: <= 128 reads. */
  sweep(c: station.config_object, now: u64, token: Uint8Array): void {
    const ids = this.registry.get()!.open_purchases.slice(0);
    let done = 0;
    for (let i = 0; i < ids.length && done < SWEEP_MAX; i++) {
      const e = this.escrow.get(u32Key(ids[i]));
      if (e == null || e.closed || !Arrays.equal(e.token, token) || this.frozenOwner(e)) continue; // review M1/L5
      if (e.kind == 1) {
        if (now < e.end) continue;                                       // term still running
        this.doRelease(c, e, "auto_release"); done++;
      } else {
        const t = this.tickets.get(e.payee!);
        if (t == null || t.purchase_id != e.id || !this.ticketEnded(t, now)) continue;
        this.settleTicket(c, e.payee!, t, true, "auto_settle", now); done++;
      }
    }
  }
  /** Review L5: skip a purchase if its payer OR (for a renewal paid by someone else) the allowance owner is suspended. */
  frozenOwner(e: station.escrow_object): bool {
    if (this.suspended.has(e.buyer!)) return true;
    if (e.kind != 1) return false;
    const a = this.allowances.get(u32Key(e.allowance_id));
    return a != null && this.suspended.has(a.buyer!);
  }
  /** Audit #7: an owner change may never leave less sellable capacity than is already sold to paying customers. */
  noOversell(c: station.config_object, now: u64, oldCap: u64): void {
    if (this.soldCap(c) >= oldCap) return;                              // review L3: never block a change that doesn't shrink capacity
    System.require(this.committed(c, now, false)[0] <= this.soldCap(c), "change would oversell: sold allowances exceed the new sellable capacity");
  }
  /** Review M3: the minimum charge kept on a buyer cancel = min(price's min_purchase at purchase time, amount paid). */
  minKeep(token: Uint8Array, amount: u64): u64 { const p = this.prices.get(token); const m = p != null ? p.min_purchase : 0; return m < amount ? m : amount; }
  maxPerBuyer(c: station.config_object): u32 { return c.max_per_buyer > 0 ? c.max_per_buyer : DEFAULT_MAX_PER_BUYER; }
  /** Audit #3 (Carl, 8:43 PM): what one wallet has open = its unexpired allowances + its open big-upload tickets.
   *  Bounded: max_allowances allowance reads + <= 128 purchase reads. */
  openFor(buyer: Uint8Array, now: u64): u32 {
    const reg = this.registry.get()!; let n: u32 = 0;
    for (let i = 0; i < reg.open_ids.length; i++) { const a = this.allowances.get(u32Key(reg.open_ids[i])); if (a != null && a.expiry > now && Arrays.equal(a.buyer, buyer)) n++; }
    for (let i = 0; i < reg.open_purchases.length; i++) {
      const e = this.escrow.get(u32Key(reg.open_purchases[i]));
      if (e == null || e.closed || e.kind != 2 || !Arrays.equal(e.buyer, buyer)) continue;
      const t = this.tickets.get(e.payee!); if (t != null && t.purchase_id == e.id && !this.ticketEnded(t, now)) n++;
    }
    return n;
  }
  /** A ticket is over when its 24 h lock has expired or its Mana is used up. */
  ticketEnded(t: station.ticket_object, clock: u64): bool { return clock >= t.expiry || t.remaining == 0; }
  ticketFeeBp(c: station.config_object): u32 { return c.ticket_fee_bp > 0 ? c.ticket_fee_bp : DEFAULT_TICKET_FEE_BP; }
  doRefund(e: station.escrow_object, amount: u64, action: string): void {
    if (amount == 0) return;
    System.require(amount <= this.held(e), "refund above held");
    e.refunded += amount; this.escrow.put(u32Key(e.id), e);
    const tot = this.escrowTot.get(e.token!)!; tot.held -= amount; tot.refunded += amount; this.escrowTot.put(e.token!, tot);
    System.event("station.escrow_refunded", Protobuf.encode(new station.escrow_event(e, amount, e.buyer, action), station.escrow_event.encode), [e.buyer!]);
    this.send(e.token!, e.buyer!, amount);
  }
  /** Close a purchase: whatever is still held is released to Carl. Exactly once. */
  doRelease(c: station.config_object, e: station.escrow_object, action: string): u64 {
    System.require(!e.closed, "already closed");
    const amount = this.held(e);
    e.released += amount; e.closed = true; this.escrow.put(u32Key(e.id), e);
    const tot = this.escrowTot.get(e.token!)!; tot.held -= amount; tot.released += amount; this.escrowTot.put(e.token!, tot);
    const reg = this.registry.get()!; const keep = new Array<u32>();
    for (let i = 0; i < reg.open_purchases.length; i++) if (reg.open_purchases[i] != e.id) keep.push(reg.open_purchases[i]);
    reg.open_purchases = keep; this.registry.put(reg);
    const to = this.treasury(c);
    System.event("station.escrow_released", Protobuf.encode(new station.escrow_event(e, amount, to, action), station.escrow_event.encode), [to]);
    this.send(e.token!, to, amount);
    return amount;
  }
  alertLevel(c: station.config_object): u64 { return c.alert_mana > 0 ? c.alert_mana : DEFAULT_ALERT_MANA; }
  /** One station.reserve_low event per dip below the alert level; re-armed once Mana is back at or above it. */
  watchReserve(c: station.config_object, after: u64): void {
    const lvl = this.alertLevel(c); const b = this.big.get()!;
    if (after < lvl && !b.low_alerted) {
      b.low_alerted = true; this.big.put(b);
      System.event("station.reserve_low", Protobuf.encode(new station.reserve_alert_event(after, lvl, this.bigFloor(c)), station.reserve_alert_event.encode), [c.owner!]);
    } else if (after >= lvl && b.low_alerted) { b.low_alerted = false; this.big.put(b); }
  }


  // ───── derived budgets ─────
  dailyBudget(c: station.config_object): u64 { return pct(c.koin_amount, c.refill_bp); }
  bigFloor(c: station.config_object): u64 { return c.admin_min + this.dailyBudget(c); }
  reservedTotal(): u64 {
    let s: u64 = 0; const list = this.allApps();
    for (let i = 0; i < list.length; i++) if (list[i].active) s += list[i].reserved_mana;
    return s;
  }
  /** Sellable slice, derived: daily budget − reservations (0 at 30k with 3,000 + 3,000). */
  soldCap(c: station.config_object): u64 { const b = this.dailyBudget(c), r = this.reservedTotal(); return b > r ? b - r : 0; }
  appAllowance(c: station.config_object, a: station.app_object, now: u64): u64 {
    return a.reserved_mana + (now < a.boost_until ? a.boost_mana : 0);
  }
  allApps(): station.app_object[] {
    const ids = this.registry.get()!.app_ids; const out = new Array<station.app_object>();
    for (let i = 0; i < ids.length; i++) { const a = this.apps.get(u32Key(ids[i])); if (a != null) out.push(a); }
    return out;
  }
  globalLimit(c: station.config_object, now: u64): u64 {
    let s = this.dailyBudget(c); const list = this.allApps();
    for (let i = 0; i < list.length; i++) if (now < list[i].boost_until) s += list[i].boost_mana;
    return s;
  }
  debtNow(c: station.config_object, b: station.big_object, now: u64): u64 {
    if (b.debt == 0 || now <= b.debt_ts) return b.debt;
    const repaid = this.soldCap(c) / 86_400 * ((now - b.debt_ts) / 1000);
    return repaid >= b.debt ? 0 : b.debt - repaid;
  }
  /** Active sold commitments (Mana/day) and count, from the open-id index; drops expired ones when `clean`. */
  committed(c: station.config_object, now: u64, clean: bool): u64[] {
    const reg = this.registry.get()!; const keep = new Array<u32>();
    let sum: u64 = 0, n: u64 = 0;
    for (let i = 0; i < reg.open_ids.length; i++) {
      const a = this.allowances.get(u32Key(reg.open_ids[i]));
      if (a == null) continue;
      if (a.expiry > now) { sum += a.mana_per_day; n++; keep.push(a.id); }
      else if (clean) {
        this.allowances.remove(u32Key(a.id));
        const t = this.targets.get(a.target!);
        if (t != null && u32(t.total) == a.id) this.targets.remove(a.target!);
      } else keep.push(a.id);
    }
    if (clean) { reg.open_ids = keep; this.registry.put(reg); }
    return [sum, n];
  }
  /** Reservations must fit in the daily budget (with `a` replacing app `appId`, if given). */
  validateReservations(c: station.config_object, appId: u32, a: station.app_object | null): void {
    let s: u64 = 0;
    const ids = this.registry.get()!.app_ids;
    for (let i = 0; i < ids.length; i++) {
      if (a != null && ids[i] == appId) continue;
      const v = this.apps.get(u32Key(ids[i])); if (v != null && v.active) s += v.reserved_mana;
    }
    if (a != null && a.active) s += a.reserved_mana;
    System.require(s <= this.dailyBudget(c), "app reservations exceed the daily budget");
  }

  // ═══════ authorize ═══════
  authorize(args: authority.authorize_arguments): authority.authorize_result {
    if (args.type == authority.authorization_type.transaction_application) return new authority.authorize_result(this.sponsorOk());
    return new authority.authorize_result(false);
  }

  /** Per-user anti-spam. Returns the updated record to store on acceptance, or null to refuse. */
  userCheck(c: station.config_object, payee: Uint8Array, now: u64, h: u64, rc: u64): station.user_object | null {
    let u = this.users.get(payee);
    if (u == null) { u = new station.user_object(); u.first_seen = now; u.last_block = u64.MAX_VALUE; }
    if (u.day == null) u.day = new station.window_object();
    if (u.cooldown_until > now || u.last_block == h) return null;
    const minute = now / 60_000;
    if (u.minute != minute) { u.minute = minute; u.n_min = 0; }
    if (u.n_min >= c.per_min) return null;
    const isNew = now - u.first_seen < DAY;
    roll(u.day!, now / USER_SLOT, USER_N, false);
    if (sumN(u.day!) + 1 > (isNew ? c.new_actions : c.day_actions)) return null;
    if (sumMana(u.day!) + rc > (isNew ? c.new_mana : c.day_mana)) return null;
    u.n_min += 1;
    if (u.n_min >= c.per_min) u.cooldown_until = now + c.cooldown_ms; // stored by an ACCEPTED tx, so it survives
    u.last_block = h;
    add(u.day!, now / USER_SLOT, USER_N, rc, false);
    this.lastNew = isNew;
    return u;
  }

  sponsorOk(): bool {
    const c = this.config.get()!;
    const rc = System.getTransactionField("header.rc_limit")!.uint64_value;
    const pf = System.getTransactionField("header.payee");
    const payee = pf == null ? new Uint8Array(0) : pf.bytes_value;
    const mana = this.mana();
    if (rc > mana) return false;
    // The station's OWN transactions (payee = the station) need only the station key, and must work BEFORE init:
    // found on testnet 2026-10-20 that checking "initialized?" first refused every station tx after upload, so init
    // itself could never be approved and a fresh station was stuck.
    if (payee.length == 0 || Arrays.equal(payee, this.contractId)) {
      return System.checkAuthority(authority.authorization_type.contract_call, this.contractId); // station key only
    }
    if (!isAddress(c.owner)) return false;                              // everything else needs an initialized station
    // The SDK's system-call buffer is 1 KiB by default: reading the operations of a bigger tx (a contract upload, long
    // args) would fail. Enlarge it; a big-upload ticket holder may send a whole contract (UNVERIFIED max tx size:
    // measure on testnet).
    System.setSystemBufferSize(this.tickets.has(payee) ? BIG_TX_BUFFER : TX_BUFFER);
    const ops = txOps();
    if (ops.length < 1 || ops.length > i32(c.max_ops)) return false;
    let allSelf = true, hasUpload = false, allCalls = true;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i].call_contract;
      if (o == null) { allCalls = false; allSelf = false; if (ops[i].upload_contract != null) hasUpload = true; continue; }
      if (!Arrays.equal(o.contract_id, this.contractId)) allSelf = false;
    }
    if (allSelf) { // owner admin (kill switch etc.): works while paused, down to rc <= mana
      return rc <= c.hard_max && Arrays.equal(payee, c.owner) && System.checkAuthority(authority.authorization_type.contract_call, c.owner!);
    }
    if (c.paused) return false;
    const now = this.now(), h = this.height();
    // Big upload ticket.
    const t = this.tickets.get(payee);
    if (t != null && (rc > c.hard_max || hasUpload)) return this.bigOk(c, t, ops, rc, mana, now, payee);
    if (!allCalls || rc > c.hard_max) return false;
    if (mana - rc < c.admin_min) return false;
    // Station-wide rolling 24 h cap: 20% of koin_amount (+ explicit owner boosts). App buffers are outside it (below).
    const gw = this.globalWin.get()!;
    roll(gw, now / APP_SLOT, APP_N, false);
    const globalRoom = sumMana(gw) + rc <= this.globalLimit(c, now);
    // Route A: fee-exempt contracts (Carl's projects). Fee-free, not limit-free.
    const target0 = ops[0].call_contract!.contract_id;
    let oneTarget = true;
    for (let i = 1; i < ops.length; i++) if (!Arrays.equal(ops[i].call_contract!.contract_id, target0)) { oneTarget = false; break; }
    const ex = oneTarget ? this.exempt.get(target0) : null;
    if (ex != null) {
      let cap: u64 = 0;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i].call_contract!;
        const e = this.entries.get(entryKey(o.contract_id, o.entry_point));
        if (e != null) { if (u32(o.args.length) > e.max_args) return false; cap += e.cap; }
        else if (ex.strict) return false;                              // strict: allowlisted entry points only
        else cap += c.hard_max;
      }
      if (rc > cap) return false;
      const u = this.userCheck(c, payee, now, h, rc); if (u == null) return false;
      const isNew = this.lastNew;
      if (ex.app > 0) {
        // Reserved app: its allowance, then up to buffer_bp more straight from the reserve (Carl, 5:22 PM).
        const a = this.apps.get(u32Key(ex.app));
        if (a == null || !a.active) return false;
        const allow = this.appAllowance(c, a, now);
        const aw = this.appWin.get(u32Key(ex.app))!;
        roll(aw, now / APP_SLOT, APP_N, true);
        const limit = allow + pct(allow, c.buffer_bp);
        if (isNew && sumNew(aw) + rc > limit / 100 * u64(c.new_pct)) return false;  // new-user pool: new_pct of the buffered limit
        const used = sumMana(aw) + rc;
        if (used <= allow) {
          if (!globalRoom) return false;
          add(gw, now / APP_SLOT, APP_N, rc, false); this.globalWin.put(gw);
        } else {
          if (used > limit) return false;
          if (mana - rc < this.bigFloor(c) + this.big.get()!.ticket_open) return false; // hard floor + tickets' locked Mana untouchable (H1)
          const bw = this.bufferWin.get()!; roll(bw, now / APP_SLOT, APP_N, false);
          add(bw, now / APP_SLOT, APP_N, rc, false); this.bufferWin.put(bw);
          System.event("station.buffer_used", Protobuf.encode(new station.buffer_event(ex.app, payee, rc, used, allow, limit, mana - rc), station.buffer_event.encode), [payee]);
        }
        add(aw, now / APP_SLOT, APP_N, rc, isNew); this.appWin.put(u32Key(ex.app), aw);
      } else {
        // Exempt project without a reservation: only the unsold part of the sellable slice (unchanged rule).
        if (!globalRoom) return false;
        if (this.debtNow(c, this.big.get()!, now) > 0) return false;
        const sell = this.soldCap(c); const com = this.committed(c, now, false)[0];
        const free = sell > com ? sell - com : 0;
        const ow = this.overflowWin.get()!;
        roll(ow, now / APP_SLOT, APP_N, false);
        if (sumMana(ow) + rc > free) return false;
        add(ow, now / APP_SLOT, APP_N, rc, false); this.overflowWin.put(ow);
        add(gw, now / APP_SLOT, APP_N, rc, false); this.globalWin.put(gw);
      }
      this.users.put(payee, u);
      this.watchReserve(c, mana - rc);
      return true;
    }
    // Route B: sold APP allowances only (Carl, 9:09 PM: "only usable through the apps that are paying for the Mana
    // usage"). Every op must call the one paying app contract; Mana is drawn from that app's allowance. No account
    // allowances: a payee address never unlocks sponsorship of arbitrary contracts.
    if (!oneTarget) return false;
    const id = this.targets.get(target0); const kind: u32 = 1;
    if (id == null) return false;
    const s = this.allowances.get(u32Key(u32(id.total)));
    if (s == null || s.kind != kind || s.expiry <= now) return false;    // expired: cut off automatically
    if (this.suspended.has(s.buyer!)) return false;                    // buyer suspended by the owner
    if (!globalRoom) return false;                                     // paid: hard cap, no buffer
    // Audit #2: big-upload debt no longer pauses paid allowances (one unused ticket could freeze every paying customer).
    // The reserve stays safe because big uploads and buffers can never take Mana below the big floor (bigOk, Route A).
    if (s.day == null) s.day = new station.window_object();
    roll(s.day!, now / USER_SLOT, USER_N, false);
    if (sumMana(s.day!) + rc > s.mana_per_day) return false;
    let u: station.user_object | null = null;
    if (kind == 1) { u = this.userCheck(c, payee, now, h, rc); if (u == null) return false; }
    add(s.day!, now / USER_SLOT, USER_N, rc, false); add(gw, now / APP_SLOT, APP_N, rc, false);
    this.allowances.put(u32Key(s.id), s); this.globalWin.put(gw);
    if (u != null) this.users.put(payee, u);
    this.watchReserve(c, mana - rc);
    return true;
  }

  bigOk(c: station.config_object, t: station.ticket_object, ops: protocol.operation[], rc: u64, mana: u64, now: u64, payee: Uint8Array): bool {
    if (this.ticketEnded(t, now) || rc > t.remaining) return false;    // lock expired or Mana used up
    if (this.suspended.has(t.buyer!)) return false;                    // buyer suspended by the owner
    const b = this.big.get()!; const others = b.ticket_open > t.remaining ? b.ticket_open - t.remaining : 0;
    if (mana - rc < this.bigFloor(c) + others) return false;            // never below the floor, nor into other tickets' locks
    for (let i = 0; i < ops.length; i++) {
      const up = ops[i].upload_contract;
      if (ops[i].call_contract != null) { if (!Arrays.equal(ops[i].call_contract!.contract_id, payee)) return false; continue; } // the payee's own app only (9:09 PM)
      if (up != null && t.allow_upload && Arrays.equal(up.contract_id, payee)) continue; // payee's own contract only
      return false;                                                     // set_system_* never
    }
    t.remaining -= rc;
    this.tickets.put(payee, t);
    b.ticket_open = b.ticket_open > rc ? b.ticket_open - rc : 0; this.big.put(b); // used: no longer locked
    this.watchReserve(c, mana - rc);
    return true;
  }

  // ═══════ read-only ═══════
  get_status(args: station.get_status_arguments): station.get_status_result {
    const c = this.config.get()!; const now = this.now();
    const r = new station.get_status_result();
    const gw = this.globalWin.get()!; roll(gw, now / APP_SLOT, APP_N, false);
    const cm = this.committed(c, now, false);
    r.config = c; r.mana = this.mana(); r.daily_budget = this.dailyBudget(c);
    r.reserve_floor = c.koin_amount - r.daily_budget; r.big_floor = this.bigFloor(c);
    r.used_24h = sumMana(gw); r.sold_capacity = this.soldCap(c); r.sold_committed = cm[0];
    r.big_debt = this.debtNow(c, this.big.get()!, now);
    const bw = this.bufferWin.get()!; roll(bw, now / APP_SLOT, APP_N, false);
    r.buffer_used_24h = sumMana(bw); r.alert_level = this.alertLevel(c); r.treasury = this.treasury(c);
    return r;
  }
  get_user(args: station.get_user_arguments): station.get_user_result {
    const r = new station.get_user_result(); const u = this.users.get(args.user!);
    if (u == null) return r;
    if (u.day != null) { roll(u.day!, this.now() / USER_SLOT, USER_N, false); r.actions_24h = sumN(u.day!); r.mana_24h = sumMana(u.day!); }
    r.user = u; return r;
  }
  get_app(args: station.get_app_arguments): station.get_app_result {
    const r = new station.get_app_result(); const a = this.apps.get(u32Key(args.app));
    if (a == null) return r;
    const now = this.now(); const aw = this.appWin.get(u32Key(args.app))!; roll(aw, now / APP_SLOT, APP_N, true);
    r.app = a; r.allowance = this.appAllowance(this.config.get()!, a, now); r.used_24h = sumMana(aw); r.new_used_24h = sumNew(aw);
    return r;
  }
  get_entry(args: station.get_entry_arguments): station.get_entry_result {
    const r = new station.get_entry_result(); r.entry = this.entries.get(entryKey(args.contract_id!, args.entry_point)); return r;
  }
  allowanceQuote(c: station.config_object, token: Uint8Array, manaPerDay: u64, days: u64, now: u64, ignoreId: u32): station.quote_allowance_result {
    const r = new station.quote_allowance_result(); r.terms = ALLOWANCE_TERMS; r.refundable = true;
    const p = this.prices.get(token);
    if (p == null || !p.active) { r.reason = "token not accepted"; return r; }
    const unit = tierPrice(p, days);
    if (unit == 0) { r.reason = "days must be 1, 7 or 30"; return r; }
    if (manaPerDay < MANA) { r.reason = "at least 1 Mana per day"; return r; }
    if (wholeManaUp(manaPerDay) > MAX_WHOLE_MANA) { r.reason = "too large"; return r; }
    r.price = per1000(manaPerDay, unit); r.unit_price = unit;
    if (r.price < p.min_purchase) r.price = p.min_purchase;           // audit #3: minimum charge per purchase
    if (r.price > p.max_per_purchase) { r.reason = "above the per-purchase maximum"; return r; }
    const cm = this.committed(c, now, false);
    let held: u64 = 0;
    if (ignoreId > 0) { const a = this.allowances.get(u32Key(ignoreId)); if (a != null && a.expiry > now) held = a.mana_per_day; }
    if (cm[0] - held + manaPerDay > this.soldCap(c)) { r.reason = "sold capacity full"; return r; }
    if (held == 0 && cm[1] >= u64(c.max_allowances)) { r.reason = "too many open allowances"; return r; }
    r.available = true; return r;
  }
  quote_allowance(args: station.quote_allowance_arguments): station.quote_allowance_result {
    return this.allowanceQuote(this.config.get()!, args.token!, args.mana_per_day, args.days, this.now(), 0);
  }
  bigQuote(c: station.config_object, token: Uint8Array, mana: u64, now: u64): station.quote_allowance_result {
    const r = new station.quote_allowance_result(); r.terms = BIG_TERMS; r.refundable = true; const p = this.prices.get(token);
    if (p == null || !p.active) { r.reason = "token not accepted"; return r; }
    const b = this.big.get()!;
    if (p.big_per_1000 == 0) { r.reason = "big uploads not priced for this token"; return r; }
    if (mana < p.big_min_mana || mana < MANA) { r.reason = "below the big-upload minimum"; return r; }
    if (mana > c.big_max) { r.reason = "above the per-request maximum"; return r; }
    r.price = per1000(mana, p.big_per_1000); r.unit_price = p.big_per_1000;
    if (r.price < p.min_purchase) r.price = p.min_purchase;           // audit #3: minimum charge per purchase
    if (r.price > p.max_per_purchase) { r.reason = "above the per-purchase maximum"; return r; }
    if (this.soldCap(c) == 0) { r.reason = "no repayment capacity (sellable slice is 0)"; return r; }
    // Audit #2: the wait between purchases is per buyer now (checked in buy_big_upload), not station-wide.
    const w = b.week != null ? b.week! : new station.window_object(); roll(w, now / DAY, WEEK_N, false);
    if (sumMana(w) + mana > c.big_week_cap) { r.reason = "weekly big-upload cap reached"; return r; }
    if (this.debtNow(c, b, now) + mana > c.big_max_debt) { r.reason = "reserve still repaying"; return r; }
    const m = this.mana();
    // Review H1: Mana already locked by other open tickets is not for sale again.
    if (m < mana || m - mana < this.bigFloor(c) + b.ticket_open) { r.reason = "reserve too low right now"; return r; }
    r.available = true; return r;
  }
  quote_big_upload(args: station.quote_big_upload_arguments): station.quote_big_upload_result {
    const q = this.bigQuote(this.config.get()!, args.token!, args.mana, this.now());
    const r = new station.quote_big_upload_result(); r.price = q.price; r.available = q.available; r.reason = q.reason; r.unit_price = q.unit_price; r.terms = q.terms; r.refundable = q.refundable;
    return r;
  }
  get_allowance(args: station.get_allowance_arguments): station.get_allowance_result {
    const r = new station.get_allowance_result(); const a = this.allowances.get(u32Key(args.id));
    if (a == null) return r;
    if (a.day != null) { roll(a.day!, this.now() / USER_SLOT, USER_N, false); r.used_24h = sumMana(a.day!); }
    r.allowance = a; return r;
  }
  get_ticket(args: station.get_ticket_arguments): station.get_ticket_result {
    const r = new station.get_ticket_result(); r.ticket = this.tickets.get(args.payee!); return r;
  }

  // ═══════ buy (anyone, prepaid) ═══════
  buy_allowance(args: station.buy_allowance_arguments): station.buy_allowance_result {
    const c = this.config.get()!; const now = this.now();
    System.require(!c.paused, "paused");
    System.require(isAddress(args.buyer) && System.checkAuthority(authority.authorization_type.contract_call, args.buyer!), "buyer must sign");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended");
    System.require(args.kind == 1 && isAddress(args.target), "kind 1 (paying app contract) only; account allowances were removed (Carl, 9:09 PM)");
    System.require(!Arrays.equal(args.target!, this.contractId), "not the station");
    System.require(!this.isMoneyContract(args.target!), "token contracts (KOIN, stablecoins) cannot be sponsored");
    // Audit #3: the app itself must approve being sponsored (its key, or its own authorize, signs this purchase), so
    // nobody can claim another developer's contract and lock them out.
    System.require(System.checkAuthority(authority.authorization_type.contract_call, args.target!), "the target app must approve (sign) this purchase");
    this.sweep(c, now, args.token!);                                    // audit #4: close finished purchases first (same token: M1)
    this.committed(c, now, true);                                       // clean expired entries
    System.require(this.openFor(args.buyer!, now) < this.maxPerBuyer(c), "this wallet already has the most open allowances and tickets allowed");
    const existing = this.targets.get(args.target!);
    if (existing != null) { const e = this.allowances.get(u32Key(u32(existing.total))); System.require(e == null || e.expiry <= now, "target already has an allowance; renew it"); }
    const q = this.allowanceQuote(c, args.token!, args.mana_per_day, args.days, now, 0);
    System.require(q.available, q.reason != null ? q.reason! : "unavailable");
    System.require(q.price <= args.max_price, "price above the accepted quote");
    const b = this.big.get()!; b.next_id += 1; this.big.put(b);
    const a = new station.allowance_object(b.next_id, args.buyer, args.kind, args.target, args.mana_per_day, now + args.days * DAY, new station.window_object());
    a.token = args.token; a.term_days = args.days; a.unit_price = q.unit_price; a.paid = q.price; a.term_start = now; a.total_paid = q.price;
    const e = this.newPurchase(1, args.buyer!, args.token!, q.price, now, a.expiry);
    e.days = args.days; e.per_day = q.price / args.days; e.allowance_id = a.id; e.min_keep = this.minKeep(args.token!, q.price); this.escrow.put(u32Key(e.id), e);
    a.purchase_ids.push(e.id);
    this.allowances.put(u32Key(a.id), a);
    const reg = this.registry.get()!; reg.open_ids.push(a.id); this.registry.put(reg);
    this.targets.put(args.target!, new station.revenue_object(u64(a.id)));
    System.event("station.allowance_bought", Protobuf.encode(new station.purchase_event(a, null, args.token, q.price, true, false, ALLOWANCE_TERMS), station.purchase_event.encode), [args.buyer!, args.target!]);
    this.collect(args.token!, args.buyer!, q.price);                    // into escrow (last: effects before interaction)
    return new station.buy_allowance_result(a.id, a.expiry, q.price);
  }
  renew(args: station.renew_arguments): station.renew_result {
    const c = this.config.get()!; const now = this.now();
    System.require(!c.paused, "paused");
    System.require(isAddress(args.payer) && System.checkAuthority(authority.authorization_type.contract_call, args.payer!), "payer must sign");
    const a = this.allowances.get(u32Key(args.id)); System.require(a != null, "no such allowance");
    System.require(!this.suspended.has(args.payer!) && !this.suspended.has(a!.buyer!), "buyer suspended");
    this.sweep(c, now, args.token!);                                    // audit #4
    const t = this.targets.get(a!.target!); System.require(t != null, "target was taken by another allowance");
    System.require(u32(t!.total) == a!.id, "target was taken by another allowance");
    const q = this.allowanceQuote(c, args.token!, a!.mana_per_day, args.days, now, a!.id);
    System.require(q.available, q.reason != null ? q.reason! : "unavailable");
    const start = a!.expiry > now ? a!.expiry : now;
    System.require(start + args.days * DAY <= now + c.max_days * DAY, "prepaid period too long");
    System.require(q.price <= args.max_price, "price above the accepted quote");
    // The running term keeps what it paid; the new term is priced at the CURRENT price and starts when the old one ends.
    a!.expiry = start + args.days * DAY;
    a!.token = args.token; a!.term_days = args.days; a!.unit_price = q.unit_price; a!.paid = q.price; a!.term_start = start;
    a!.total_paid += q.price;
    const keep = new Array<u32>();                                     // prune closed terms
    for (let i = 0; i < a!.purchase_ids.length; i++) { const x = this.escrow.get(u32Key(a!.purchase_ids[i])); if (x != null && !x.closed) keep.push(x.id); }
    System.require(keep.length < MAX_TERMS, "too many open terms on this allowance");
    const e = this.newPurchase(1, args.payer!, args.token!, q.price, start, a!.expiry);
    e.days = args.days; e.per_day = q.price / args.days; e.allowance_id = a!.id; e.min_keep = this.minKeep(args.token!, q.price); this.escrow.put(u32Key(e.id), e);
    keep.push(e.id); a!.purchase_ids = keep;
    this.allowances.put(u32Key(a!.id), a!);
    System.event("station.allowance_renewed", Protobuf.encode(new station.purchase_event(a!, null, args.token, q.price, true, false, ALLOWANCE_TERMS), station.purchase_event.encode), [args.payer!, a!.target!]);
    this.collect(args.token!, args.payer!, q.price);
    return new station.renew_result(a!.expiry, q.price, q.unit_price);
  }
  buy_big_upload(args: station.buy_big_upload_arguments): station.buy_big_upload_result {
    const c = this.config.get()!; const now = this.now();
    System.require(!c.paused, "paused");
    System.require(isAddress(args.buyer) && System.checkAuthority(authority.authorization_type.contract_call, args.buyer!), "buyer must sign");
    System.require(isAddress(args.payee) && !Arrays.equal(args.payee!, this.contractId), "payee required");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended");
    this.sweep(c, now, args.token!);                                    // audit #4 (may also settle an expired ticket here)
    const old = this.tickets.get(args.payee!); System.require(old == null, "payee already has a ticket");
    System.require(this.openFor(args.buyer!, now) < this.maxPerBuyer(c), "this wallet already has the most open allowances and tickets allowed"); // Carl, 8:43 PM
    const cd = this.ticketCd.get(args.buyer!);
    System.require(cd == null || now >= cd.total, "buyer cooldown: one ticket per buyer per cooldown period");
    const q = this.bigQuote(c, args.token!, args.mana, now);
    System.require(q.available, q.reason != null ? q.reason! : "unavailable");
    System.require(q.price <= args.max_price, "price above the accepted quote");
    const b = this.big.get()!;
    b.debt = this.debtNow(c, b, now) + args.mana; b.debt_ts = now;
    b.ticket_open += args.mana;                                          // review H1: this Mana is now locked for the buyer
    if (b.week == null) b.week = new station.window_object();
    roll(b.week!, now / DAY, WEEK_N, false); add(b.week!, now / DAY, WEEK_N, args.mana, false);
    this.big.put(b);
    const t = new station.ticket_object(args.buyer, args.mana, args.mana, now + (c.big_ticket_ms > 0 ? c.big_ticket_ms : DEFAULT_TICKET_MS), args.allow_upload, args.token, q.price);
    t.bought = now;
    // Audit #2: per-buyer wait, counted from the purchase. One buyer can't block others, and buy-cancel loops still
    // can't repeat faster than once per cooldown (so no separate refund-triggered cooldown is needed).
    if (c.big_cooldown_ms > 0) this.ticketCd.put(args.buyer!, new station.revenue_object(now + c.big_cooldown_ms));
    const e = this.newPurchase(2, args.buyer!, args.token!, q.price, now, t.expiry);
    e.payee = args.payee; e.mana = args.mana; e.min_keep = this.minKeep(args.token!, q.price); this.escrow.put(u32Key(e.id), e); t.purchase_id = e.id;
    this.tickets.put(args.payee!, t);
    System.event("station.big_upload_bought", Protobuf.encode(new station.purchase_event(null, t, args.token, q.price, true, false, BIG_TERMS), station.purchase_event.encode), [args.buyer!, args.payee!]);
    this.collect(args.token!, args.buyer!, q.price);
    return new station.buy_big_upload_result(t.expiry, q.price);
  }

  // ═══════ admin ═══════
  requireOwner(): station.config_object {
    const c = this.config.get()!;
    System.require(isAddress(c.owner), "not initialized");
    System.require(System.checkAuthority(authority.authorization_type.contract_call, c.owner!), "owner only");
    return c;
  }
  checkConfig(c: station.config_object): void {
    System.require(isAddress(c.owner), "owner required");
    System.require(c.refill_bp <= 2000, "daily budget above one day's refill (20%)");
    System.require(c.buffer_bp <= 5000, "buffer above 50%");
    System.require(c.ticket_fee_bp <= 2000, "ticket fee above 20%");
    System.require(!isAddress(c.treasury) || !Arrays.equal(c.treasury!, this.contractId), "treasury must be an external wallet (escrow lives in the station)");
    System.require(c.koin_amount <= this.koinBalance(), "koin_amount above the station's KOIN balance");
    this.validateReservations(c, 0, null);
  }
  init(args: station.init_arguments): station.init_result {
    System.require(!isAddress(this.config.get()!.owner), "already initialized");
    System.require(System.checkAuthority(authority.authorization_type.contract_call, this.contractId), "station key only");
    System.require(args.config != null, "config required");
    this.checkConfig(args.config!);
    this.config.put(args.config!);
    return new station.init_result();
  }
  set_config(args: station.set_config_arguments): station.set_config_result {
    this.requireOwner(); System.require(args.config != null, "config required");
    const oldCap = this.soldCap(this.config.get()!);
    args.config!.paused = this.config.get()!.paused;                     // pause only via set_paused (escrow clock)
    this.checkConfig(args.config!); this.config.put(args.config!);
    this.noOversell(args.config!, this.now(), oldCap);                  // audit #7
    return new station.set_config_result();
  }
  set_paused(args: station.set_paused_arguments): station.set_paused_result {
    const c = this.requireOwner(); const now = this.now(); const b = this.big.get()!;
    if (args.paused && !c.paused) { b.paused_at = now; this.big.put(b); }
    else if (!args.paused && c.paused) {
      // Fair option (Carl, 7:47 PM): paused time is CREDITED. Every open purchase, allowance and ticket that was
      // running or still ahead at the pause moves forward by the pause length (the escrow clock was stopped).
      const pa = b.paused_at; const P = now > pa ? now - pa : 0;
      const reg = this.registry.get()!;
      for (let i = 0; i < reg.open_purchases.length; i++) {
        const e = this.escrow.get(u32Key(reg.open_purchases[i]));
        if (e == null || e.closed || e.end <= pa) continue;
        e.start += P; e.end += P; this.escrow.put(u32Key(e.id), e);
        if (e.kind == 2) { const t = this.tickets.get(e.payee!); if (t != null && t.expiry > pa) { t.expiry += P; this.tickets.put(e.payee!, t); } }
      }
      for (let i = 0; i < reg.open_ids.length; i++) {
        const a = this.allowances.get(u32Key(reg.open_ids[i]));
        if (a != null && a.expiry > pa) { a.expiry += P; this.allowances.put(u32Key(a.id), a); }
      }
      b.paused_at = 0; this.big.put(b);
    }
    c.paused = args.paused; this.config.put(c);
    System.event("station.paused", Protobuf.encode(args, station.set_paused_arguments.encode), []);
    return new station.set_paused_result();
  }
  set_app(args: station.set_app_arguments): station.set_app_result {
    const c = this.requireOwner();
    System.require(args.value != null && args.app != GLOBAL_KEY, "app value required");
    this.validateReservations(c, args.app, args.value);                 // boosts are explicit owner permission
    const oldCap = this.soldCap(c);
    this.apps.put(u32Key(args.app), args.value!);
    const reg = this.registry.get()!;
    if (!reg.app_ids.includes(args.app)) { System.require(reg.app_ids.length < 32, "too many apps"); reg.app_ids.push(args.app); this.registry.put(reg); }
    this.noOversell(c, this.now(), oldCap);                             // audit #7
    return new station.set_app_result();
  }
  set_entry(args: station.set_entry_arguments): station.set_entry_result {
    const c = this.requireOwner(); const k = entryKey(args.contract_id!, args.entry_point);
    if (args.remove) { this.entries.remove(k); return new station.set_entry_result(); }
    System.require(args.value != null && args.value!.cap <= c.hard_max, "cap above hard_max");
    this.entries.put(k, args.value!);
    return new station.set_entry_result();
  }
  // Per-buyer suspend switch (Carl, 7:37 PM): owner only, no money movement, no refund, no extension of expiry.
  suspend_allowance(args: station.suspend_allowance_arguments): station.suspend_allowance_result {
    this.requireOwner();
    System.require(isAddress(args.buyer), "buyer required");
    System.require(args.reason >= 1 && args.reason <= 4, "reason 1 abuse, 2 sanctions, 3 AUP, 4 legal/other");
    const now = this.now();
    this.suspended.put(args.buyer!, new station.suspend_object(args.reason, now));
    System.event("station.buyer_suspended", Protobuf.encode(new station.suspend_event(args.buyer, args.reason, true, now), station.suspend_event.encode), [args.buyer!]);
    return new station.suspend_allowance_result();
  }
  unsuspend_allowance(args: station.unsuspend_allowance_arguments): station.unsuspend_allowance_result {
    this.requireOwner();
    System.require(isAddress(args.buyer) && this.suspended.has(args.buyer!), "buyer not suspended");
    this.suspended.remove(args.buyer!);
    System.event("station.buyer_unsuspended", Protobuf.encode(new station.suspend_event(args.buyer, args.reason, false, this.now()), station.suspend_event.encode), [args.buyer!]);
    return new station.unsuspend_allowance_result();
  }
  get_suspension(args: station.get_suspension_arguments): station.get_suspension_result {
    const r = new station.get_suspension_result(); if (isAddress(args.buyer)) r.suspension = this.suspended.get(args.buyer!); return r;
  }
  set_exempt(args: station.set_exempt_arguments): station.set_exempt_result {
    this.requireOwner();                                                // owner key only
    System.require(isAddress(args.contract_id) && !Arrays.equal(args.contract_id!, this.contractId), "contract id required");
    const ev = new station.exempt_event(args.contract_id, args.value, args.remove);
    if (args.remove) this.exempt.remove(args.contract_id!);
    else { System.require(args.value != null, "value required"); this.exempt.put(args.contract_id!, args.value!); }
    System.event("station.exempt_changed", Protobuf.encode(ev, station.exempt_event.encode), [args.contract_id!]);
    return new station.set_exempt_result();
  }
  get_exempt(args: station.get_exempt_arguments): station.get_exempt_result {
    const r = new station.get_exempt_result(); r.exempt = this.exempt.get(args.contract_id!); return r;
  }
  set_price(args: station.set_price_arguments): station.set_price_result {
    this.requireOwner(); System.require(args.value != null && args.token != null, "token and price required");
    System.require(!Arrays.equal(args.token!, Base58.decode(LEGACY_CHAINGE_USDT)), "legacy Chainge USDT is not accepted");
    // Only the two stablecoins can ever be priced, so escrow (payments, refunds, releases) is only ever vUSDT/vUSDC:
    // never KOIN or any other token (Carl, 8:10 PM). Mana itself can't be transferred at all.
    System.require(Arrays.equal(args.token!, Base58.decode(VUSDT)) || Arrays.equal(args.token!, Base58.decode(VUSDC)), "only vUSDT or vUSDC");
    const v = args.value!;
    System.require(v.min_purchase <= v.max_per_purchase, "minimum charge above the per-purchase maximum"); // review L4
    System.require(v.price_1d <= MAX_UNIT_PRICE && v.price_7d <= MAX_UNIT_PRICE && v.price_30d <= MAX_UNIT_PRICE && v.big_per_1000 <= MAX_UNIT_PRICE, "price too large");
    // Affects new purchases and renewals only: existing allowances and tickets keep their stored snapshot and expiry.
    this.prices.put(args.token!, args.value!);
    return new station.set_price_result();
  }
  // ═══════ escrow: cancel, settle, release, owner refund (Carl, 7:47 PM) ═══════
  /** End an allowance's terms at time t: refund unused whole days; return the new expiry (end of the paid current day). */
  endTerms(a: station.allowance_object, t: u64, action: string, keepMin: bool = true): u64[] {
    let refund: u64 = 0; let newExpiry: u64 = t;
    for (let i = 0; i < a.purchase_ids.length; i++) {
      const e = this.escrow.get(u32Key(a.purchase_ids[i]));
      if (e == null || e.closed || t >= e.end) continue;                // finished terms: releasable as they are
      const r = this.termRefund(e!, t, keepMin);
      // Shorten the term to what was used, so nothing can be refunded twice (later refunds compute 0 unused days).
      const used = e!.days - this.unusedDays(e!, t);
      if (t < e!.start) e!.end = e!.start;                               // future term: nothing used
      else e!.end = e!.start + used * DAY;                               // paid through the current day
      e!.days = t < e!.start ? 0 : used;
      this.escrow.put(u32Key(e!.id), e!);
      this.doRefund(e!, r, action);
      refund += r;
      if (t < e!.start) {
        // Review C1 (critical, pre-existing): a future (renewed) term that is refunded must NOT keep the service alive.
        // It used to set end = start and then extend the expiry to that start, so a buyer got ~86% back and kept the
        // service. Now it never counts toward the expiry and is closed at once (anything kept goes to the treasury).
        this.doRelease(this.config.get()!, this.escrow.get(u32Key(e!.id))!, "term_cancelled");
        continue;
      }
      if (e!.end > newExpiry) newExpiry = e!.end;
    }
    a.expiry = newExpiry; this.allowances.put(u32Key(a.id), a);
    return [refund, newExpiry];
  }
  refundSum(a: station.allowance_object, t: u64, keepMin: bool = true): u64 {
    let r: u64 = 0;
    for (let i = 0; i < a.purchase_ids.length; i++) { const e = this.escrow.get(u32Key(a.purchase_ids[i])); if (e != null && !e.closed && t < e.end) r += this.termRefund(e, t, keepMin); }
    return r;
  }
  cancel_allowance(args: station.cancel_allowance_arguments): station.cancel_allowance_result {
    const c = this.config.get()!; const t = this.clock(c, this.now());
    System.require(isAddress(args.buyer) && System.checkAuthority(authority.authorization_type.contract_call, args.buyer!), "buyer must sign");
    const a = this.allowances.get(u32Key(args.id)); System.require(a != null, "no such allowance");
    System.require(Arrays.equal(a!.buyer!, args.buyer!), "not your allowance");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended: the owner decides on refunds");
    System.require(a!.expiry > t, "already ended");
    const r = this.refundSum(a!, t);
    const x = this.endTerms(a!, t, "cancel");
    System.event("station.allowance_cancelled", Protobuf.encode(a!, station.allowance_object.encode), [args.buyer!]);
    return new station.cancel_allowance_result(r, x[1]);
  }
  /** Settle a ticket: refund unused Mana, release the rest to Carl, free its debt. */
  settleTicket(c: station.config_object, payee: Uint8Array, t: station.ticket_object, withFee: bool, action: string, now: u64, noRefund: bool = false): u64[] {
    const e = this.escrow.get(u32Key(t.purchase_id));
    let r: u64 = 0, rel: u64 = 0;
    // Fee-free hold fix (Carl, 8:02 PM): unused Mana is released from every counter, once (the ticket is removed here,
    // so a ticket can't be settled twice), and no counter can go below 0.
    const b = this.big.get()!; const d = this.debtNow(c, b, now);
    const unused = t.remaining;
    b.debt = unused >= d ? 0 : d - unused; b.debt_ts = now;                 // outstanding
    b.ticket_open = b.ticket_open > unused ? b.ticket_open - unused : 0;     // review H1: the lock ends here
    if (unused > 0 && b.week != null) {                                       // weekly cap: only used Mana counts
      roll(b.week!, now / DAY, WEEK_N, false);
      const slot = t.bought / DAY;
      if (slot + u64(WEEK_N) > b.week!.base && slot <= b.week!.base) {        // purchase day still in the 7-day window
        const i = i32(slot % u64(WEEK_N));
        b.week!.mana[i] = b.week!.mana[i] > unused ? b.week!.mana[i] - unused : 0;
      }
    }
    this.big.put(b);
    this.tickets.remove(payee);
    if (e != null && !e.closed) {
      r = noRefund ? 0 : this.ticketRefund(e!, t, this.clock(c, now), withFee ? this.ticketFeeBp(c) : 0); // owner refund: no fee
      // Audit #2/#8: no cooldown is started here any more. The per-buyer wait runs from the purchase, so a stranger
      // closing an expired ticket late can't extend the buyer's wait.
      e!.end = now; this.escrow.put(u32Key(e!.id), e!);
      this.doRefund(e!, r, action);
      rel = this.doRelease(c, this.escrow.get(u32Key(e!.id))!, "ticket_settle");
    }
    return [r, rel];
  }
  close_ticket(args: station.close_ticket_arguments): station.close_ticket_result {
    const c = this.config.get()!; const now = this.now(); const t0 = this.clock(c, now);
    const t = this.tickets.get(args.payee!); System.require(t != null, "no ticket");
    System.require(this.ticketEnded(t!, t0), "ticket still valid");     // lock expired or Mana used up
    // Suspended buyer: only the owner settles, and this path refunds nothing (forfeit, never early: the ticket has
    // ended). To refund a buyer who wasn't at fault the owner uses owner_refund instead.
    const sus = this.suspended.get(t!.buyer!);
    if (sus != null) {
      System.require(System.checkAuthority(authority.authorization_type.contract_call, c.owner!), "buyer suspended: owner only");
      System.require(sus.reason != 2, "sanctions: funds frozen in escrow pending legal review");
    }
    const x = this.settleTicket(c, args.payee!, t!, true, "ticket_settle", now, sus != null);
    return new station.close_ticket_result(x[0], x[1]);
  }
  cancel_big_upload(args: station.cancel_big_upload_arguments): station.cancel_big_upload_result {
    const c = this.config.get()!; const now = this.now();
    System.require(isAddress(args.buyer) && System.checkAuthority(authority.authorization_type.contract_call, args.buyer!), "buyer must sign");
    const t = this.tickets.get(args.payee!); System.require(t != null, "no ticket");
    System.require(Arrays.equal(t!.buyer!, args.buyer!), "not your ticket");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended: the owner decides on refunds");
    const x = this.settleTicket(c, args.payee!, t!, true, "cancel", now);
    return new station.cancel_big_upload_result(x[0]);
  }
  /** Anyone, after a term ends (default: funds clear at the end of the period). Never twice. */
  release(args: station.release_arguments): station.release_result {
    const c = this.config.get()!; const t = this.clock(c, this.now());
    const e = this.escrow.get(u32Key(args.purchase_id)); System.require(e != null, "no such purchase");
    System.require(e!.kind == 1, "tickets settle with close_ticket / cancel_big_upload");
    System.require(!e!.closed, "already released");
    System.require(t >= e!.end, "term not ended: funds stay in escrow");
    const sus = this.suspended.get(e!.buyer!);
    System.require(sus == null || sus.reason != 2, "sanctions: funds frozen in escrow pending legal review");
    const al = this.allowances.get(u32Key(e!.allowance_id));
    if (al != null) { const so = this.suspended.get(al.buyer!); System.require(so == null || so.reason != 2, "sanctions: funds frozen in escrow pending legal review"); } // review L5
    return new station.release_result(this.doRelease(c, e!, "release"));
  }
  owner_refund(args: station.owner_refund_arguments): station.owner_refund_result {
    const c = this.requireOwner(); const now = this.now(); const t = this.clock(c, now);
    if (args.allowance_id > 0) {
      const a = this.allowances.get(u32Key(args.allowance_id)); System.require(a != null, "no such allowance");
      this.noSanctionedRefund(a!.buyer!);
      const r = this.refundSum(a!, t, false);                            // buyer not at fault: no minimum kept
      this.endTerms(a!, t, "owner_refund", false);
      return new station.owner_refund_result(r);
    }
    System.require(isAddress(args.ticket_payee), "allowance_id or ticket_payee");
    const tk = this.tickets.get(args.ticket_payee!); System.require(tk != null, "no ticket");
    this.noSanctionedRefund(tk!.buyer!);
    if (this.ticketCd.has(tk!.buyer!)) this.ticketCd.remove(tk!.buyer!);  // buyer not at fault: lift their wait too
    const x = this.settleTicket(c, args.ticket_payee!, tk!, false, "owner_refund", now);
    return new station.owner_refund_result(x[0]);
  }
  noSanctionedRefund(buyer: Uint8Array): void {
    const s = this.suspended.get(buyer);
    System.require(s == null || s.reason != 2, "buyer suspended for sanctions: no refund (reclassify a false match as reason 4)");
  }
  get_escrow(args: station.get_escrow_arguments): station.get_escrow_result {
    const r = new station.get_escrow_result(); const e = this.escrow.get(u32Key(args.purchase_id));
    if (e == null) return r;
    const c = this.config.get()!; const t = this.clock(c, this.now());
    r.purchase = e;
    if (e.kind == 1) { r.refundable_now = this.termRefund(e, t); r.releasable = !e.closed && t >= e.end; }
    else { const tk = this.tickets.get(e.payee!); if (tk != null) r.refundable_now = this.ticketRefund(e, tk, t, this.ticketFeeBp(c)); }
    return r;
  }
  get_escrow_totals(args: station.get_escrow_totals_arguments): station.get_escrow_totals_result {
    const r = new station.get_escrow_totals_result(); r.totals = this.escrowTot.get(args.token!); return r;
  }
}
