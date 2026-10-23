/**
 * Mana Station v2 (Carl's model, 2026-10-19 4:13 PM). LOCAL PROTOTYPE: not deployed anywhere.
 *  - Daily budget = koin_amount × refill_bp (20% = one day's refill). Rolling 24 h. The rest (80%) is the reserve.
 *  - Carl's apps have hard allowances (bp of koin_amount); only the owner can exceed them (explicit, expiring boost).
 *  - A sold slice (bp of koin_amount) for prepaid allowances bought in stablecoins; it never touches Carl's apps.
 *  - Paid big uploads draw from the reserve with: big floor (admin_min + one day's budget), per-request max,
 *    cooldown, rolling 7-day cap, and a debt that the sold slice repays (the slice pauses while repaying), so total
 *    spend over time never exceeds the refill and the reserve always reloads.
 * Upload with all three overrides on (authorizes_call_contract, authorizes_transaction_application and
 * authorizes_upload_contract = true) and call init in that same upload transaction (init refuses anything else).
 * Audit fixes (2026-10-19, branch fix/squat-freeze-stall): #2 debt never pauses paid allowances, per-buyer ticket
 * wait, tickets lock Mana for 24 h at full price with a straight-line time refund (Carl, 8:19 PM); #3 target app must sign, minimum charge, per-buyer cap; #4 finished purchases are
 * swept on buy/renew; #7 no-oversell guard. #1 (Oct 20): the station overrides all three authorities, so its key alone
 * moves nothing; money moves and upgrades need 2+ council approvals, a delay (48 h on mainnet) and no veto.
 * Audit Bot fixes (2026-10-22, branch audit-fixes-1): AB-001 … AB-022, each marked in place.
 */
import { System, Storage, Protobuf, Arrays, Token, Base58, Crypto, authority, value, protocol } from "@koinos/sdk-as";
import { station } from "./proto/station";

const S_CONFIG: u32 = 0, S_APPS: u32 = 1, S_ENTRIES: u32 = 2, S_USERS: u32 = 3, S_APPWIN: u32 = 4,
  S_PRICES: u32 = 5, S_ALLOW: u32 = 6, S_TARGET: u32 = 7, S_TICKETS: u32 = 8, S_BIG: u32 = 9, S_REVENUE: u32 = 10, S_EXEMPT: u32 = 11, S_REGISTRY: u32 = 12, S_GLOBALWIN: u32 = 13, S_OVERFLOWWIN: u32 = 14, S_BUFFERWIN: u32 = 15, S_SUSPEND: u32 = 16, S_ESCROW: u32 = 17, S_ESCROWTOT: u32 = 18, S_TICKETCD: u32 = 19,
  S_PROPOSALS: u32 = 20, S_VETOED: u32 = 21, S_TESTLEDGER: u32 = 90, S_TESTCONTRACTS: u32 = 91;
const DAY: u64 = 86_400_000;
const MANA: u64 = 100_000_000;
const USER_SLOT: u64 = 21_600_000; const USER_N: i32 = 4;   // 4 × 6 h
const APP_SLOT: u64 = 3_600_000; const APP_N: i32 = 24;     // 24 × 1 h
const WEEK_N: i32 = 7;                                       // 7 × 1 day
const GLOBAL_KEY: u32 = 0xffffffff;
// Stablecoins (stablecoins.md, 2026-10-19). Prices are set per token by the owner; these are the defaults to set.
import { VUSDT, VUSDC, NETWORK } from "./net";
// Audit #1: council delay floor. 48 h on mainnet so everyone can see a money move or upgrade coming; 1 min on testnet.
const MIN_GUARD_DELAY_MS: u64 = NETWORK == "mainnet" ? 172_800_000 : 60_000;
const UPGRADE_WINDOW_MS: u64 = 7 * 86_400_000;      // an approved upgrade must be uploaded within 7 days of being ready
const MAX_COUNCIL: i32 = 7;
const MAX_OPEN_PROPOSALS: i32 = 16;
const MAX_PER_PROPOSER: i32 = 3;                   // review M2: one member can't fill the list
const MAX_GUARD_DELAY_MS: u64 = 30 * 86_400_000;   // review M3: bounded delay (no overflow, no permanent freeze)
const MAX_EXEMPT: i32 = 64;                         // connected free apps (bounded list)
// AB-002: open allowances are limited by Mana sold (soldCap); this fixed cap only bounds the loops over them. The owner's
// config.open_cap (1 to this) sets the working limit, so a launch can start low until the cost is measured on a node.
const MAX_OPEN_ALLOWANCES: i32 = 256;
const DEFAULT_OPEN_CAP: u32 = 50;                  // open_cap 0 (stored before the field existed) reads as 50
// Owner decision (Oct 22), against slot squatting: every allowance pays a slot fee per day of its term, and the last
// app_reserved slots below open_cap are kept for app plans on deployed contracts.
const DEFAULT_SLOT_FEE: u64 = 2_000_000;           // slot_fee_per_day 0 reads as $0.02 a day (8-decimal stablecoins)
const MAX_SLOT_FEE: u64 = 100_000_000;              // at most $1 a day
const DEFAULT_APP_RESERVED: u32 = 10;              // app_reserved 0 reads as 10
// AB-001: the owner can set the ticket lifetime only within these bounds (0 = the 24 h default).
const MIN_TICKET_MS: u64 = 3_600_000, MAX_TICKET_MS: u64 = 7 * 86_400_000;
// AB-024: the longest per-user cooldown the owner can set (a longer one would stop running paid plans without a pause).
const MAX_COOLDOWN_MS: u64 = 3_600_000;
// AB-011 / AB-025: after a veto, no action of that kind (and target) can be proposed or carried out for this long (also
// after a council change).
const VETO_BLOCK_MS: u64 = 14 * 86_400_000;
const TEST_KOIN = "19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK"; // test build only: stands in for the KOIN contract
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
// MockVM's get_contract_metadata ignores the id it is asked about (one value for every address), so the test build
// reads "is this a deployed contract?" from this list instead. The real build asks the chain (isContract).
function testContracts(): Storage.Map<Uint8Array, station.revenue_object> {
  return new Storage.Map(System.getContractId(), S_TESTCONTRACTS, station.revenue_object.decode, station.revenue_object.encode, null);
}
export function testSetContract(id: Uint8Array, deployed: bool): void { if (deployed) testContracts().put(id, new station.revenue_object(1)); else testContracts().remove(id); }
// The test build allows slot_fee_per_day 0 (no fee); this applies the real-build rule instead (0 refused, 0 reads as $0.02).
export let TEST_REAL_SLOT_FEE: bool = false;
export function testRealSlotFee(on: bool): void { TEST_REAL_SLOT_FEE = on; }
/** slot_fee_per_day 0 means "no fee" only in a testing build. */
function zeroSlotFeeOk(): bool { return BUILD_FOR_TESTING && !TEST_REAL_SLOT_FEE; }

function isAddress(a: Uint8Array | null): bool { return a != null && a.length == 25; }
/** AB-004: `who` is calling the station itself (a top-level operation, or its own contract code), not through some
 *  other contract it happened to sign a transaction for. */
function direct(who: Uint8Array): bool { const c = System.getCaller().caller; return c.length == 0 || Arrays.equal(c, who); }
function u32Key(n: u32): Uint8Array { const k = new Uint8Array(4); k[0] = u8(n >> 24); k[1] = u8(n >> 16); k[2] = u8(n >> 8); k[3] = u8(n); return k; }
function entryKey(contract: Uint8Array, ep: u32): Uint8Array { const k = new Uint8Array(contract.length + 4); k.set(contract, 0); k.set(u32Key(ep), contract.length); return k; }
function pct(amount: u64, bp: u32): u64 { return amount / 10_000 * u64(bp); }
function wholeManaUp(m: u64): u64 { return (m + MANA - 1) / MANA; }
// DRAFT terms (audit #1/#6, 2026-10-19; Audit Bot AB-001/010/011, 2026-10-22): promise only what the code does. Pending legal review.
export const ALLOWANCE_TERMS = "DRAFT, pending legal review. Prepaid daily Mana, either for one app contract (app plan) or for one wallet (Mana pass). App plan: the station sponsors a transaction only when every top-level operation in it calls that app, and never a token transfer, approval or burn; what the app does internally when called is up to the app. The app's own key must approve the purchase. Per-user anti-spam limits apply to each of the app's users. Mana pass: the station sponsors the pass wallet's own transactions (the wallet is the payee and signs), calling any contract except the station and token contracts, never token transfers, approvals or burns, and never contract uploads, up to the daily amount. The wallet itself must approve the purchase. Over a whole term the station never sponsors more than the daily amount times the days paid. Each wallet may hold a limited number of open allowances and tickets at once (those it bought and those for it). Payment is held by the station contract until the term ends, then released to the operator. Its key alone can't move it: funds leave only through these rules (refunds, releases) or a council decision that needs at least two of its members' approvals, a public waiting period (48 hours) and no veto from any member during that wait. After a veto, no action of the same kind for the same target (for upgrades: no upgrade at all) can be proposed or carried out for 14 days, whatever its exact contents and whoever sits on the council; a member withdrawing their own proposal is not a veto. A majority of the council can replace a member (a member can't veto their own removal), so a change one member vetoed can still pass after at least 14 days plus the waiting period. This is council custody, not fully trustless escrow. If the operator sets a minimum charge (Mana passes may have a higher one), it is shown in the quote and kept if you cancel. Every allowance also pays a slot fee for each day of its term, shown in the quote and included in the price; if you cancel, the slot fee is kept for the days already held and refunded for the rest. Cancel any time: unused whole days are refunded, but the days used (the current day counts as used, so 1 day is the minimum) are charged at the 1-day price for the same Mana per day as at purchase: you get back what you paid minus that charge, never more than the unused days' share of what you paid. If more Mana was sponsored than the days used cover (the daily amount is a rolling 24-hour window, so the first day can draw on the next), the days that Mana covers are charged instead. A renewed term that hasn't started yet is refunded in full, minimum charge included, to whoever paid for it. If the operator pauses the station, paused time is credited: your term is extended by the pause. No auto-renew: service stops at expiry unless you renew, at the price current then. 1-, 7- and 30-day terms only. Non-transferable; not redeemable for crypto or cash except these refunds. Without the council the operator can only: pause the station; change prices and minimum charges for new purchases and renewals; change per-user limits, which apply at once but can't stop paid service (limits that would are refused; for example a per-user cooldown is at most 1 hour); connect free apps (never a contract with a live paid allowance); and suspend a buyer for abuse, sanctions, AUP or legal reasons. A suspended buyer's allowances are no longer sponsored. For abuse, AUP or legal reasons the unused share is refunded automatically when the suspension starts (whole unused days, pro rata of what was paid, no minimum charge kept): the operator keeps only what was served. This can return more than your own cancel would (no 1-day charge or minimum is kept), because a suspension the operator decides must never cost you more than what was served. For sanctions the funds stay frozen in escrow, neither refunded nor released, pending legal review.";
export const BIG_TERMS = "DRAFT, pending legal review. Prepaid big upload: the station reserves the Mana you buy for you for the ticket's lifetime, at the full price, whether you use it or not. The lifetime is shown in the quote (one 24-hour period by default; the operator can set 1 hour to 7 days) and you can refuse a shorter one when buying; a ticket already bought keeps its lifetime. Reserved Mana is not sold again or spent by the station's other services. The payee wallet must approve (sign) the purchase. Paid in vUSDT or vUSDC and held by the station contract (council custody: its key alone can't move funds; money moves need two or more council approvals, a 48-hour public wait and no veto). If the lock runs its full period, nothing is refunded. If you end it early, you get back the value of the Mana you have not used, reduced in a straight line by the time already passed (for example, half the Mana left with three quarters of the time left returns 37.5% of the price), always keeping a fee (currently 5%). If the operator sets a minimum charge, it is shown in the quote and kept if you cancel. Refunds are only in the stablecoin you paid, never in Mana or KOIN. Each buyer can buy one ticket per cooldown period (default 24 hours). Tickets only sponsor uploading or calling the payee's own contract. In rare cases (for example if the station's Mana falls below its safety floor) a transaction can still be refused; tell the operator, who may refund the unexpired share. Paused time extends the lock. No auto-renew. Non-transferable; not redeemable for crypto or cash except these refunds. Each wallet may hold a limited number of open allowances and tickets at once. A buyer may be suspended for abuse, sanctions, AUP or legal reasons. For abuse, AUP or legal reasons the unexpired, unused share is refunded automatically when the suspension starts (no fee): the operator keeps only what was served. For sanctions the funds stay frozen in escrow pending legal review.";
// Bounded loops (pause credit, sweep, suspension refunds). AB-002: 512, so that the 256 open allowances (each holds at
// least one open purchase) plus renewals and tickets fit and Mana sold, not this count, decides what a buyer gets.
const MAX_OPEN_PURCHASES: i32 = 512;
const MAX_TERMS: i32 = 8;
const DEFAULT_TICKET_FEE_BP: u32 = 500;             // 5% (Carl, 8:10 PM)
// KCS-1/KCS-4 money-moving entry points: a Mana pass never pays for these on any contract.
const EP_KCS_TRANSFER: u32 = 0x27f576ca;
const EP_KCS_APPROVE: u32 = 0x74e21680;
const EP_KCS_BURN: u32 = 0x859facc5;
// The station's own buy / renew / cancel entry points (free checkout).
const EP_BUY_ALLOWANCE: u32 = 0x60422f5f, EP_RENEW: u32 = 0xa36a2ce1, EP_BUY_BIG: u32 = 0x1c1d9f26;
const EP_CANCEL_ALLOWANCE: u32 = 0xc7643cce, EP_CANCEL_BIG: u32 = 0xc2985745;
// AB-012: the only station calls paid below admin_min (emergency brake and council votes / vetoes).
const EP_SET_PAUSED: u32 = 0x35fbb717, EP_APPROVE: u32 = 0x74e21680, EP_CANCEL_PROPOSAL: u32 = 0x062f1ed9;
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
  proposals: Storage.Map<Uint8Array, station.proposal_object> = new Storage.Map(System.getContractId(), S_PROPOSALS, station.proposal_object.decode, station.proposal_object.encode, null);
  overflowWin: Storage.Obj<station.window_object> = new Storage.Obj(System.getContractId(), S_OVERFLOWWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());
  // AB-011 / AB-025: action key (kind, plus the target wallet for kinds 2, 3, 6, 8) → when it was last vetoed.
  vetoed: Storage.Map<Uint8Array, station.revenue_object> = new Storage.Map(System.getContractId(), S_VETOED, station.revenue_object.decode, station.revenue_object.encode, null);
  lastNew: bool = false;
  // would_pay (Oct 21): run the sponsorship rules as a dry run. Nothing is written and no event is emitted; `route`
  // says which rule would pay ("checkout", "operator", "ticket", "free_app", "app_plan", "pass").
  dry: bool = false;
  route: string = "";

  // ───── environment ─────
  mana(): u64 { return BUILD_FOR_TESTING ? TEST_MANA : System.getAccountRC(this.contractId); }
  koinBalance(): u64 { return BUILD_FOR_TESTING ? TEST_BALANCE : new Token(System.getContractAddress("koin")).balanceOf(this.contractId); }
  koinId(): Uint8Array { return BUILD_FOR_TESTING ? Base58.decode(TEST_KOIN) : System.getContractAddress("koin"); }
  /** KOIN out of the station: only from a council-approved withdrawal (execute). */
  koinSend(to: Uint8Array, amount: u64): void {
    if (BUILD_FOR_TESTING) {
      System.require(TEST_BALANCE >= amount, "insufficient KOIN"); TEST_BALANCE -= amount;
      testSetToken(this.koinId(), to, testGetToken(this.koinId(), to) + amount);
    } else {
      System.require(new Token(this.koinId()).transfer(this.contractId, to, amount), "KOIN transfer failed");
    }
  }
  tokenBalance(token: Uint8Array): u64 { return BUILD_FOR_TESTING ? testGetToken(token, this.contractId) : new Token(token).balanceOf(this.contractId); }
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
  /** Refund = floor(amount × unused / days): rounds down by < 1 base unit (in Carl's favour); never creates value.
   *  AB-010: a buyer cancel (keepMin) also charges the days used at the 1-day price for this size at purchase:
   *  refund = min(that, amount − min(amount, used × day_price)), so a long term cancelled early never costs less than
   *  1-day terms would have. Owner and suspension refunds (buyer not at fault) stay plain pro rata.
   *  Slot fee (Oct 22): on a buyer cancel these rules apply to the Mana price only; the slot fee is kept for the days
   *  held and refunded for unused days (so the total stays within the unused days' share of what was paid).
   *  AB-028: `extra` more of the unused days are charged as used (Mana sponsored beyond the days used, see endTerms).
   *  AB-029: a term that hasn't started and has nothing charged comes back whole, minimum included, to whoever paid it. */
  termRefund(e: station.escrow_object, t: u64, keepMin: bool = true, extra: u64 = 0): u64 {
    const u0 = this.unusedDays(e, t); const u = u0 > extra ? u0 - extra : 0; if (u == 0) return 0;
    if (t < e.start && extra == 0) keepMin = false;
    const slot = e.slot_fee_per_day * e.days;                         // e.days is still the whole term while u > 0
    const m = keepMin && e.amount > slot ? e.amount - slot : e.amount; // buyer cancel: the Mana price alone
    let r = mulDiv(m, u, e.days);
    if (keepMin && e.day_price > 0) {
      const used = e.days - u;                                       // u > 0 here, so used < days (no overflow below)
      const charge = used > 0 && e.day_price > m / used ? m : used * e.day_price;
      const r2 = m - charge; if (r2 < r) r = r2;
    }
    if (keepMin) { const cap = m > e.min_keep ? m - e.min_keep : 0; if (r > cap) r = cap; } // review M3: the minimum charge stays
    if (keepMin && e.amount > slot) r += e.slot_fee_per_day * u;      // unused days' slot fee back
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
  /** Audit #4: close up to SWEEP_MAX finished purchases so the open list (capped at 512) can't fill up and stop sales.
   *  Same outcome as release() / close_ticket(): earned money to the treasury, refunds to buyers. Purchases of any
   *  sanctioned buyer are skipped (frozen). Bounded: <= 512 reads. */
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
  /** Review L5: skip a purchase if its payer OR (for a renewal paid by someone else) the allowance owner is frozen.
   *  AB-001: only sanctions (reason 2) freeze funds now; other suspensions are refunded at once (suspend_allowance). */
  sanctioned(w: Uint8Array): bool { const s = this.suspended.get(w); return s != null && s.reason == 2; }
  frozenOwner(e: station.escrow_object): bool {
    if (this.sanctioned(e.buyer!)) return true;
    if (e.kind != 1) return false;
    const a = this.allowances.get(u32Key(e.allowance_id));
    return a != null && this.sanctioned(a.buyer!);
  }
  /** Audit #7: an owner change may never leave less sellable capacity than is already sold to paying customers. */
  noOversell(c: station.config_object, now: u64, oldCap: u64): void {
    if (this.soldCap(c) >= oldCap) return;                              // review L3: never block a change that doesn't shrink capacity
    System.require(this.committed(c, now, false)[0] <= this.soldCap(c), "change would oversell: sold allowances exceed the new sellable capacity");
  }
  /** AB-002: the minimum charge for a purchase of this kind (1 plan, 2 pass, 0 = either: the higher one). */
  minCharge(p: station.price_object, kind: u32): u64 { return kind != 1 && p.pass_min_purchase > p.min_purchase ? p.pass_min_purchase : p.min_purchase; }
  /** Review M3: the minimum charge kept on a buyer cancel = min(the minimum charge at purchase time, amount paid). */
  minKeep(token: Uint8Array, amount: u64, kind: u32): u64 { const p = this.prices.get(token); const m = p != null ? this.minCharge(p, kind) : 0; return m < amount ? m : amount; }
  /** AB-010: the 1-day price for this size at purchase (what one 1-day term would have cost), 0 if 1 day isn't offered. */
  dayPrice(token: Uint8Array, manaPerDay: u64, kind: u32): u64 {
    const p = this.prices.get(token); if (p == null || p.price_1d == 0) return 0;
    const d = per1000(manaPerDay, p.price_1d); const m = this.minCharge(p, kind); return d < m ? m : d;
  }
  maxPerBuyer(c: station.config_object): u32 { return c.max_per_buyer > 0 ? c.max_per_buyer : DEFAULT_MAX_PER_BUYER; }
  openCap(c: station.config_object): u32 { return c.open_cap > 0 ? c.open_cap : DEFAULT_OPEN_CAP; }
  appReserved(c: station.config_object): u32 { return c.app_reserved > 0 ? c.app_reserved : DEFAULT_APP_RESERVED; }
  /** Slots any allowance may take; the app_reserved above it are for app plans on deployed contracts only. */
  publicCap(c: station.config_object): u32 { const cap = this.openCap(c), r = this.appReserved(c); return cap > r ? cap - r : 0; }
  slotFee(c: station.config_object): u64 { return c.slot_fee_per_day > 0 ? c.slot_fee_per_day : (zeroSlotFeeOk() ? 0 : DEFAULT_SLOT_FEE); }
  /** A deployed contract: the chain has contract metadata (code) for it. Nothing back = a plain wallet. */
  isContract(id: Uint8Array): bool {
    if (BUILD_FOR_TESTING) return testContracts().has(id);
    const m = System.getContractMetadata(id);
    return m != null && m.hash.length > 0;
  }
  /** Audit #3 (Carl, 8:43 PM): what one wallet has open = its unexpired allowances + its open big-upload tickets.
   *  AB-002: allowances FOR the wallet (it is the target) count too, so one buyer's wallets can't each add a full quota.
   *  Counts two wallets in one pass (the buyer and the target of a purchase). Bounded: <= 256 + 512 reads. */
  openFor2(w1: Uint8Array, w2: Uint8Array, now: u64): u32[] {
    const reg = this.registry.get()!; let n1: u32 = 0, n2: u32 = 0;
    for (let i = 0; i < reg.open_ids.length; i++) {
      const a = this.allowances.get(u32Key(reg.open_ids[i]));
      if (a == null || a.expiry <= now) continue;
      if (Arrays.equal(a.buyer, w1) || Arrays.equal(a.target, w1)) n1++;
      if (Arrays.equal(a.buyer, w2) || Arrays.equal(a.target, w2)) n2++;
    }
    for (let i = 0; i < reg.open_purchases.length; i++) {
      const e = this.escrow.get(u32Key(reg.open_purchases[i]));
      if (e == null || e.closed || e.kind != 2) continue;
      const b1 = Arrays.equal(e.buyer, w1), b2 = Arrays.equal(e.buyer, w2); if (!b1 && !b2) continue;
      const t = this.tickets.get(e.payee!); if (t == null || t.purchase_id != e.id || this.ticketEnded(t, now)) continue;
      if (b1) n1++; if (b2) n2++;
    }
    return [n1, n2];
  }
  openFor(w: Uint8Array, now: u64): u32 { return this.openFor2(w, w, now)[0]; }
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
    if (this.dry) return;
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
  /** AB-003: owner boosts together may add at most buffer_bp of the daily budget. */
  boostCap(c: station.config_object): u64 { return pct(this.dailyBudget(c), c.buffer_bp); }
  activeBoosts(now: u64, appId: u32, a: station.app_object | null): u64 {
    let s: u64 = 0; const ids = this.registry.get()!.app_ids;
    for (let i = 0; i < ids.length; i++) {
      if (a != null && ids[i] == appId) continue;
      const v = this.apps.get(u32Key(ids[i])); if (v != null && now < v.boost_until) s += v.boost_mana;
    }
    if (a != null && now < a.boost_until) s += a.boost_mana;
    return s;
  }
  globalLimit(c: station.config_object, now: u64): u64 {
    const b = this.activeBoosts(now, 0, null), cap = this.boostCap(c);
    return this.dailyBudget(c) + (b < cap ? b : cap);                   // AB-003: never more than the boost cap
  }
  /** AB-003: Mana every paying route must leave: admin_min plus what open tickets have locked. */
  payFloor(c: station.config_object): u64 { return c.admin_min + this.big.get()!.ticket_open; }
  /** AB-001: true when `target` has an unexpired paid allowance (the owner may not reroute it as a free app). */
  livePaid(target: Uint8Array, now: u64): bool {
    const id = this.targets.get(target); if (id == null) return false;
    const a = this.allowances.get(u32Key(u32(id.total))); return a != null && a.expiry > now;
  }
  /** AB-004 / AB-020: `who` (a buyer, payer or payee) signed and calls directly, and isn't the station itself. */
  signs(who: Uint8Array | null): bool {
    return isAddress(who) && !Arrays.equal(who!, this.contractId) && direct(who!) && System.checkAuthority(authority.authorization_type.contract_call, who!);
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
    // Audit #1 (permission takeover). The station overrides ALL three authorities, so its private key alone can't move
    // anything. contract_call: a token asks "may the station's funds move?". Yes only when the station's OWN code is
    // the caller (escrow refunds/releases, council-approved withdrawals); a tx signed with the key gets no.
    if (args.type == authority.authorization_type.contract_call) {
      return new authority.authorize_result(args.call != null && Arrays.equal(args.call!.caller, this.contractId));
    }
    // contract_upload: only bytecode the council approved (hash), after the delay, keeping all three overrides.
    if (args.type == authority.authorization_type.contract_upload) return new authority.authorize_result(this.upgradeOk());
    return new authority.authorize_result(false);
  }

  /** Per-user anti-spam. Returns the updated record to store on acceptance, or null to refuse. */
  userCheck(c: station.config_object, payee: Uint8Array, now: u64, h: u64, rc: u64): station.user_object | null {
    let u = this.users.get(payee);
    if (u == null) { u = new station.user_object(); u.first_seen = now; u.last_block = u64.MAX_VALUE; }
    if (u.day == null) u.day = new station.window_object();
    // AB-024: the cooldown is read from the current config (at most 1 hour), never a stored end time.
    if ((u.cooldown_from > 0 && now < u.cooldown_from + c.cooldown_ms) || u.last_block == h) return null;
    const minute = now / 60_000;
    if (u.minute != minute) { u.minute = minute; u.n_min = 0; }
    if (u.n_min >= c.per_min) return null;
    const isNew = now - u.first_seen < DAY;
    roll(u.day!, now / USER_SLOT, USER_N, false);
    if (sumN(u.day!) + 1 > (isNew ? c.new_actions : c.day_actions)) return null;
    if (sumMana(u.day!) + rc > (isNew ? c.new_mana : c.day_mana)) return null;
    u.n_min += 1;
    if (u.n_min >= c.per_min) u.cooldown_from = now;                  // stored by an ACCEPTED tx, so it survives
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
    if (payee.length == 0) return false;
    // The SDK's system-call buffer is 1 KiB by default: reading the operations of a bigger tx (a contract upload, long
    // args) would fail. Enlarge it; a big-upload ticket holder may send a whole contract (UNVERIFIED max tx size:
    // measure on testnet).
    System.setSystemBufferSize(this.tickets.has(payee) ? BIG_TX_BUFFER : TX_BUFFER);
    return this.decide(c, payee, rc, txOps());
  }

  /** The sponsorship rules, shared by authorize (real: records use) and would_pay (dry: records nothing). */
  decide(c: station.config_object, payee: Uint8Array, rc: u64, ops: protocol.operation[]): bool {
    this.route = "";
    const mana = this.mana();
    if (rc > mana) return false;
    // Audit #1: the station never pays for its OWN transactions (payee = the station). There is no station-key path:
    // setup happens in the upload transaction itself (see init), which the chain authorizes before this code exists.
    if (payee.length == 0 || Arrays.equal(payee, this.contractId)) return false;
    if (!isAddress(c.owner)) return false;                              // everything else needs an initialized station
    if (ops.length < 1 || ops.length > i32(c.max_ops)) return false;
    // Free checkout (Oct 20): a wallet with no Mana can still buy, renew or cancel its own purchases.
    if (this.checkoutOk(c, ops, payee, rc, mana)) { this.route = "checkout"; return true; }
    let allSelf = true, hasUpload = false, allCalls = true, brakeOrVote = true;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i].call_contract;
      if (o == null) { allCalls = false; allSelf = false; if (ops[i].upload_contract != null) hasUpload = true; continue; }
      if (!Arrays.equal(o.contract_id, this.contractId)) allSelf = false;
      if (o.entry_point != EP_SET_PAUSED && o.entry_point != EP_APPROVE && o.entry_point != EP_CANCEL_PROPOSAL) brakeOrVote = false;
    }
    if (allSelf) { // owner admin and council votes (kill switch etc.): work while paused
      // (dry run: the payee's signature can't be checked yet; the real transaction still needs it)
      if (rc > c.hard_max || !this.isOperator(c, payee) || (!this.dry && !System.checkAuthority(authority.authorization_type.contract_call, payee))) return false;
      // AB-012: only the emergency brake and council votes / vetoes may go below the floor (down to rc <= mana);
      // every other admin transaction keeps admin_min and the tickets' locked Mana, like all paying routes.
      if (!brakeOrVote && mana - rc < this.payFloor(c)) return false;
      // Review M1: the same per-user limits as players (per minute, per day), so no operator can drain the station.
      const u = this.userCheck(c, payee, this.now(), this.height(), rc); if (u == null) return false;
      if (!this.dry) this.users.put(payee, u);
      this.route = "operator"; return true;
    }
    if (c.paused) return false;
    const now = this.now(), h = this.height();
    // Big upload ticket.
    const t = this.tickets.get(payee);
    if (t != null && (rc > c.hard_max || hasUpload)) { const ok = this.bigOk(c, t, ops, rc, mana, now, payee); if (ok) this.route = "ticket"; return ok; }
    if (!allCalls || rc > c.hard_max) return false;
    if (mana - rc < this.payFloor(c)) return false;                   // AB-003: admin_min + tickets' locked Mana
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
          add(gw, now / APP_SLOT, APP_N, rc, false); if (!this.dry) this.globalWin.put(gw);
        } else {
          if (used > limit) return false;
          if (mana - rc < this.bigFloor(c) + this.big.get()!.ticket_open) return false; // hard floor + tickets' locked Mana untouchable (H1)
          const bw = this.bufferWin.get()!; roll(bw, now / APP_SLOT, APP_N, false);
          add(bw, now / APP_SLOT, APP_N, rc, false); if (!this.dry) this.bufferWin.put(bw);
          if (!this.dry) System.event("station.buffer_used", Protobuf.encode(new station.buffer_event(ex.app, payee, rc, used, allow, limit, mana - rc), station.buffer_event.encode), [payee]);
        }
        add(aw, now / APP_SLOT, APP_N, rc, isNew); if (!this.dry) this.appWin.put(u32Key(ex.app), aw);
      } else {
        // Exempt project without a reservation: only the unsold part of the sellable slice (unchanged rule).
        if (!globalRoom) return false;
        if (this.debtNow(c, this.big.get()!, now) > 0) return false;
        const sell = this.soldCap(c); const com = this.committed(c, now, false)[0];
        const free = sell > com ? sell - com : 0;
        const ow = this.overflowWin.get()!;
        roll(ow, now / APP_SLOT, APP_N, false);
        if (sumMana(ow) + rc > free) return false;
        add(ow, now / APP_SLOT, APP_N, rc, false); if (!this.dry) this.overflowWin.put(ow);
        add(gw, now / APP_SLOT, APP_N, rc, false); if (!this.dry) this.globalWin.put(gw);
      }
      if (!this.dry) this.users.put(payee, u);
      this.watchReserve(c, mana - rc);
      this.route = "free_app"; return true;
    }
    // Route B: sold APP allowances only (Carl, 9:09 PM: "only usable through the apps that are paying for the Mana
    // usage"). Every op must call the one paying app contract; Mana is drawn from that app's allowance. No account
    // allowances: a payee address never unlocks sponsorship of arbitrary contracts.
    // Route C (Oct 20): the payee's own Mana pass covers what no app pays for (other contracts, mixed calls).
    if (!oneTarget) return this.passOk(c, ops, payee, rc, now, gw, globalRoom, mana);
    // AB-008: no route pays for a token transfer, approval or burn (an app plan on a token contract included).
    for (let i = 0; i < ops.length; i++) { const ep = ops[i].call_contract!.entry_point; if (ep == EP_KCS_TRANSFER || ep == EP_KCS_APPROVE || ep == EP_KCS_BURN) return false; }
    const id = this.targets.get(target0); const kind: u32 = 1;
    if (id == null) return this.passOk(c, ops, payee, rc, now, gw, globalRoom, mana);
    const s = this.allowances.get(u32Key(u32(id.total)));
    if (s == null || s.kind != kind || s.expiry <= now) return this.passOk(c, ops, payee, rc, now, gw, globalRoom, mana); // expired: cut off
    if (this.suspended.has(s.buyer!)) return false;                    // buyer suspended by the owner
    if (!globalRoom) return false;                                     // paid: hard cap, no buffer
    // Audit #2: big-upload debt no longer pauses paid allowances (one unused ticket could freeze every paying customer).
    // The reserve stays safe because big uploads and buffers can never take Mana below the big floor (bigOk, Route A).
    if (s.day == null) s.day = new station.window_object();
    roll(s.day!, now / USER_SLOT, USER_N, false);
    if (sumMana(s.day!) + rc > s.mana_per_day) return false;
    if (s.cap_total > 0 && s.used_total + rc > s.cap_total) return false;  // AB-006: never more than the days paid
    let u: station.user_object | null = null;
    if (kind == 1) { u = this.userCheck(c, payee, now, h, rc); if (u == null) return false; }
    add(s.day!, now / USER_SLOT, USER_N, rc, false); add(gw, now / APP_SLOT, APP_N, rc, false); s.used_total += rc;
    if (!this.dry) { this.allowances.put(u32Key(s.id), s); this.globalWin.put(gw); if (u != null) this.users.put(payee, u); }
    this.watchReserve(c, mana - rc);
    this.route = "app_plan"; return true;
  }

  /** Free checkout: [token.approve(owner = payee, spender = the station), station.buy_allowance | buy_big_upload | renew
   *  with the payee as buyer / payer, paying in that same priced token], or a single station.cancel_allowance |
   *  cancel_big_upload by the payee as buyer. Per-user limits apply (like players), within hard_max and above admin_min.
   *  The buy itself still checks every signature (buyer, and the app for app plans), price and capacity. */
  checkoutOk(c: station.config_object, ops: protocol.operation[], payee: Uint8Array, rc: u64, mana: u64): bool {
    if (ops.length < 1 || ops.length > 2 || rc > c.hard_max || mana - rc < this.payFloor(c)) return false; // AB-003
    const last = ops[ops.length - 1].call_contract;
    if (last == null || !Arrays.equal(last.contract_id, this.contractId)) return false;
    const ep = last.entry_point;
    if (ops.length == 1) {
      if (ep == EP_CANCEL_ALLOWANCE) {
        const a = Protobuf.decode<station.cancel_allowance_arguments>(last.args, station.cancel_allowance_arguments.decode);
        if (!isAddress(a.buyer) || !Arrays.equal(a.buyer!, payee)) return false;
      } else if (ep == EP_CANCEL_BIG) {
        const a = Protobuf.decode<station.cancel_big_upload_arguments>(last.args, station.cancel_big_upload_arguments.decode);
        if (!isAddress(a.buyer) || !Arrays.equal(a.buyer!, payee)) return false;
      } else return false;
    } else {
      if (c.paused) return false;
      const ap = ops[0].call_contract;
      if (ap == null || ap.entry_point != EP_KCS_APPROVE || !this.prices.has(ap.contract_id)) return false;
      const x = Protobuf.decode<station.kcs_approve_args>(ap.args, station.kcs_approve_args.decode);
      if (!isAddress(x.owner) || !Arrays.equal(x.owner!, payee) || !isAddress(x.spender) || !Arrays.equal(x.spender!, this.contractId)) return false;
      let who: Uint8Array | null = null, tok: Uint8Array | null = null;
      if (ep == EP_BUY_ALLOWANCE) { const a = Protobuf.decode<station.buy_allowance_arguments>(last.args, station.buy_allowance_arguments.decode); who = a.buyer; tok = a.token; }
      else if (ep == EP_BUY_BIG) { const a = Protobuf.decode<station.buy_big_upload_arguments>(last.args, station.buy_big_upload_arguments.decode); who = a.buyer; tok = a.token; }
      else if (ep == EP_RENEW) { const a = Protobuf.decode<station.renew_arguments>(last.args, station.renew_arguments.decode); who = a.payer; tok = a.token; }
      else return false;
      if (!isAddress(who) || !Arrays.equal(who!, payee) || tok == null || !Arrays.equal(tok!, ap.contract_id)) return false;
    }
    const u = this.userCheck(c, payee, this.now(), this.height(), rc); if (u == null) return false;
    if (!this.dry) this.users.put(payee, u);
    return true;
  }

  /** Route C: a wallet's Mana pass (kind 2). Only the pass wallet's own txs (payee = the wallet, who signs as payee),
   *  calls only (no uploads: checked before), never the station, KOIN or stablecoins, and never a KCS transfer, approve
   *  or burn on any contract (no money moves). Bounded by the pass's daily Mana and the station-wide 24 h cap. */
  passOk(c: station.config_object, ops: protocol.operation[], payee: Uint8Array, rc: u64, now: u64, gw: station.window_object, globalRoom: bool, mana: u64): bool {
    const id = this.targets.get(payee); if (id == null) return false;
    const s = this.allowances.get(u32Key(u32(id.total)));
    if (s == null || s.kind != 2 || s.expiry <= now || !Arrays.equal(s.target!, payee)) return false;
    if (this.suspended.has(s.buyer!) || this.suspended.has(payee)) return false;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i].call_contract; if (o == null) return false;
      if (Arrays.equal(o.contract_id, this.contractId) || this.isMoneyContract(o.contract_id)) return false;
      if (o.entry_point == EP_KCS_TRANSFER || o.entry_point == EP_KCS_APPROVE || o.entry_point == EP_KCS_BURN) return false;
    }
    if (!globalRoom) return false;
    if (s.day == null) s.day = new station.window_object();
    roll(s.day!, now / USER_SLOT, USER_N, false);
    if (sumMana(s.day!) + rc > s.mana_per_day) return false;
    if (s.cap_total > 0 && s.used_total + rc > s.cap_total) return false;  // AB-006: never more than the days paid
    add(s.day!, now / USER_SLOT, USER_N, rc, false); add(gw, now / APP_SLOT, APP_N, rc, false); s.used_total += rc;
    if (!this.dry) { this.allowances.put(u32Key(s.id), s); this.globalWin.put(gw); }
    this.watchReserve(c, mana - rc);
    this.route = "pass"; return true;
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
    b.ticket_open = b.ticket_open > rc ? b.ticket_open - rc : 0;  // used: no longer locked
    if (!this.dry) { this.tickets.put(payee, t); this.big.put(b); }
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
    r.open_allowances = u32(cm[1]); r.open_cap = this.openCap(c); r.app_reserved = this.appReserved(c); // warn at 80% of open_cap
    r.slot_fee_per_day = this.slotFee(c);
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
  allowanceQuote(c: station.config_object, token: Uint8Array, manaPerDay: u64, days: u64, now: u64, ignoreId: u32, kind: u32, target: Uint8Array | null, sold: u64[] | null = null): station.quote_allowance_result {
    const r = new station.quote_allowance_result(); r.terms = ALLOWANCE_TERMS; r.refundable = true;
    const p = this.prices.get(token);
    if (p == null || !p.active) { r.reason = "token not accepted"; return r; }
    const unit = tierPrice(p, days);
    if (unit == 0) { r.reason = "days must be 1, 7 or 30"; return r; }
    if (manaPerDay < MANA) { r.reason = "at least 1 Mana per day"; return r; }
    if (wholeManaUp(manaPerDay) > MAX_WHOLE_MANA) { r.reason = "too large"; return r; }
    r.price = per1000(manaPerDay, unit); r.unit_price = unit; r.min_charge = this.minCharge(p, kind);
    if (r.price < r.min_charge) r.price = r.min_charge;               // audit #3 / AB-002: minimum charge per purchase
    r.slot_fee = this.slotFee(c) * days; r.price += r.slot_fee;        // slot fee: shown on its own and in the total
    if (r.price > p.max_per_purchase) { r.reason = "above the per-purchase maximum"; return r; }
    const cm = sold != null ? sold! : this.committed(c, now, false);   // buy passes in the count it just made
    let held: u64 = 0;
    if (ignoreId > 0) { const a = this.allowances.get(u32Key(ignoreId)); if (a != null && a.expiry > now) held = a.mana_per_day; }
    if (cm[0] - held + manaPerDay > this.soldCap(c)) { r.reason = "sold capacity full"; return r; }
    // AB-002: Mana sold (above) decides whether a new allowance fits, up to the owner's open_cap (renewals: held > 0).
    if (held == 0 && cm[1] >= u64(this.openCap(c))) { r.reason = "too many open allowances"; return r; }
    // Owner decision (Oct 22): the last app_reserved slots go only to app plans for deployed contracts.
    if (held == 0 && cm[1] >= u64(this.publicCap(c)) && !(kind == 1 && target != null && this.isContract(target!))) {
      r.reason = "the last open slots are kept for app plans on deployed contracts"; return r;
    }
    if (this.registry.get()!.open_purchases.length >= MAX_OPEN_PURCHASES) { r.reason = "too many open purchases"; return r; }
    r.available = true; return r;
  }
  quote_allowance(args: station.quote_allowance_arguments): station.quote_allowance_result {
    return this.allowanceQuote(this.config.get()!, args.token!, args.mana_per_day, args.days, this.now(), 0, args.kind, isAddress(args.target) ? args.target : null);
  }
  bigQuote(c: station.config_object, token: Uint8Array, mana: u64, now: u64): station.quote_allowance_result {
    const r = new station.quote_allowance_result(); r.terms = BIG_TERMS; r.refundable = true; const p = this.prices.get(token);
    if (p == null || !p.active) { r.reason = "token not accepted"; return r; }
    const b = this.big.get()!;
    if (p.big_per_1000 == 0) { r.reason = "big uploads not priced for this token"; return r; }
    if (mana < p.big_min_mana || mana < MANA) { r.reason = "below the big-upload minimum"; return r; }
    if (mana > c.big_max) { r.reason = "above the per-request maximum"; return r; }
    r.price = per1000(mana, p.big_per_1000); r.unit_price = p.big_per_1000; r.min_charge = p.min_purchase;
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
    if (this.registry.get()!.open_purchases.length >= MAX_OPEN_PURCHASES) { r.reason = "too many open purchases"; return r; }
    r.available = true; return r;
  }
  quote_big_upload(args: station.quote_big_upload_arguments): station.quote_big_upload_result {
    const q = this.bigQuote(this.config.get()!, args.token!, args.mana, this.now());
    const r = new station.quote_big_upload_result(); r.price = q.price; r.available = q.available; r.reason = q.reason; r.unit_price = q.unit_price; r.terms = q.terms; r.refundable = q.refundable;
    r.min_charge = q.min_charge; r.lifetime_ms = this.ticketMs(this.config.get()!);  // AB-001: the site sends this back
    return r;
  }
  ticketMs(c: station.config_object): u64 { return c.big_ticket_ms > 0 ? c.big_ticket_ms : DEFAULT_TICKET_MS; }
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
    System.require(this.signs(args.buyer), "buyer must sign");          // AB-004 / AB-020: directly, never the station
    System.require(!this.suspended.has(args.buyer!), "buyer suspended");
    // kind 1 = app plan (target = the app contract); kind 2 = Mana pass (target = a wallet; its own txs, any contract
    // except money moves; Carl, Oct 20 10:58, reversing 9:09 PM with "no token moves").
    System.require((args.kind == 1 || args.kind == 2) && isAddress(args.target), "kind 1 (app plan) or kind 2 (wallet Mana pass)");
    System.require(!Arrays.equal(args.target!, this.contractId), "not the station");
    System.require(!this.isMoneyContract(args.target!), "token contracts (KOIN, stablecoins) cannot be sponsored");
    // Audit #3: the app itself must approve being sponsored (its key, or its own authorize, signs this purchase), so
    // nobody can claim another developer's contract and lock them out. AB-027: directly, like the buyer (AB-004), so a
    // contract the target merely signed a transaction for can't approve in its name.
    System.require(direct(args.target!) && System.checkAuthority(authority.authorization_type.contract_call, args.target!), "the target app must approve (sign) this purchase");
    this.sweep(c, now, args.token!);                                    // audit #4: close finished purchases first (same token: M1)
    const sold = this.committed(c, now, true);                          // clean expired entries
    const open = this.openFor2(args.buyer!, args.target!, now);
    System.require(open[0] < this.maxPerBuyer(c), "this wallet already has the most open allowances and tickets allowed");
    // AB-002: the target's own open allowances and tickets count too (a buyer can't spread passes over its wallets).
    System.require(Arrays.equal(args.target!, args.buyer!) || open[1] < this.maxPerBuyer(c), "the target already has the most open allowances and tickets allowed");
    const existing = this.targets.get(args.target!);
    if (existing != null) { const e = this.allowances.get(u32Key(u32(existing.total))); System.require(e == null || e.expiry <= now, "target already has an allowance; renew it"); }
    const q = this.allowanceQuote(c, args.token!, args.mana_per_day, args.days, now, 0, args.kind, args.target, sold);
    System.require(q.available, q.reason != null ? q.reason! : "unavailable");
    System.require(q.price <= args.max_price, "price above the accepted quote");
    const b = this.big.get()!; b.next_id += 1; this.big.put(b);
    const a = new station.allowance_object(b.next_id, args.buyer, args.kind, args.target, args.mana_per_day, now + args.days * DAY, new station.window_object());
    a.token = args.token; a.term_days = args.days; a.unit_price = q.unit_price; a.paid = q.price; a.term_start = now; a.total_paid = q.price;
    a.cap_total = args.mana_per_day * args.days;                          // AB-006 (quote bounds it: <= 1e16 × 30)
    const e = this.newPurchase(1, args.buyer!, args.token!, q.price, now, a.expiry);
    e.days = args.days; e.per_day = q.price / args.days; e.allowance_id = a.id; e.min_keep = this.minKeep(args.token!, q.price - q.slot_fee, args.kind);
    e.slot_fee_per_day = q.slot_fee / args.days;                         // slot fee: kept for days held on a cancel
    e.day_price = this.dayPrice(args.token!, args.mana_per_day, args.kind); this.escrow.put(u32Key(e.id), e); // AB-010
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
    System.require(this.signs(args.payer), "payer must sign");          // AB-004 / AB-020
    const a = this.allowances.get(u32Key(args.id)); System.require(a != null, "no such allowance");
    System.require(!this.suspended.has(args.payer!) && !this.suspended.has(a!.buyer!), "buyer suspended");
    this.sweep(c, now, args.token!);                                    // audit #4
    const t = this.targets.get(a!.target!); System.require(t != null, "target was taken by another allowance");
    System.require(u32(t!.total) == a!.id, "target was taken by another allowance");
    const q = this.allowanceQuote(c, args.token!, a!.mana_per_day, args.days, now, a!.id, a!.kind, a!.target);
    System.require(q.available, q.reason != null ? q.reason! : "unavailable");
    const start = a!.expiry > now ? a!.expiry : now;
    System.require(start + args.days * DAY <= now + c.max_days * DAY, "prepaid period too long");
    System.require(q.price <= args.max_price, "price above the accepted quote");
    // The running term keeps what it paid; the new term is priced at the CURRENT price and starts when the old one ends.
    a!.expiry = start + args.days * DAY;
    a!.token = args.token; a!.term_days = args.days; a!.unit_price = q.unit_price; a!.paid = q.price; a!.term_start = start;
    a!.total_paid += q.price;
    if (a!.cap_total > 0) a!.cap_total += a!.mana_per_day * args.days;  // AB-006
    const keep = new Array<u32>();                                     // prune closed terms
    for (let i = 0; i < a!.purchase_ids.length; i++) { const x = this.escrow.get(u32Key(a!.purchase_ids[i])); if (x != null && !x.closed) keep.push(x.id); }
    System.require(keep.length < MAX_TERMS, "too many open terms on this allowance");
    const e = this.newPurchase(1, args.payer!, args.token!, q.price, start, a!.expiry);
    e.days = args.days; e.per_day = q.price / args.days; e.allowance_id = a!.id; e.min_keep = this.minKeep(args.token!, q.price - q.slot_fee, a!.kind);
    e.slot_fee_per_day = q.slot_fee / args.days;                         // a renewal pays the slot fee for its own term
    e.day_price = this.dayPrice(args.token!, a!.mana_per_day, a!.kind); this.escrow.put(u32Key(e.id), e); // AB-010
    keep.push(e.id); a!.purchase_ids = keep;
    this.allowances.put(u32Key(a!.id), a!);
    System.event("station.allowance_renewed", Protobuf.encode(new station.purchase_event(a!, null, args.token, q.price, true, false, ALLOWANCE_TERMS), station.purchase_event.encode), [args.payer!, a!.target!]);
    this.collect(args.token!, args.payer!, q.price);
    return new station.renew_result(a!.expiry, q.price, q.unit_price);
  }
  buy_big_upload(args: station.buy_big_upload_arguments): station.buy_big_upload_result {
    const c = this.config.get()!; const now = this.now();
    System.require(!c.paused, "paused");
    System.require(this.signs(args.buyer), "buyer must sign");          // AB-004 / AB-020
    System.require(isAddress(args.payee) && !Arrays.equal(args.payee!, this.contractId), "payee required");
    // AB-005: the payee approves its own ticket, so nobody can lock a wallet or app out of tickets. AB-027: directly.
    System.require(direct(args.payee!) && System.checkAuthority(authority.authorization_type.contract_call, args.payee!), "the payee must approve (sign) this ticket");
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
    const life = this.ticketMs(c);                                       // bounded by checkConfig (AB-001): no wrap
    System.require(life >= args.min_lifetime_ms, "ticket lifetime below what the buyer accepted");   // AB-001
    const t = new station.ticket_object(args.buyer, args.mana, args.mana, now + life, args.allow_upload, args.token, q.price);
    t.bought = now;
    // Audit #2: per-buyer wait, counted from the purchase. One buyer can't block others, and buy-cancel loops still
    // can't repeat faster than once per cooldown (so no separate refund-triggered cooldown is needed).
    if (c.big_cooldown_ms > 0) this.ticketCd.put(args.buyer!, new station.revenue_object(now + c.big_cooldown_ms));
    const e = this.newPurchase(2, args.buyer!, args.token!, q.price, now, t.expiry);
    e.payee = args.payee; e.mana = args.mana; e.min_keep = this.minKeep(args.token!, q.price, 1); this.escrow.put(u32Key(e.id), e); t.purchase_id = e.id;
    this.tickets.put(args.payee!, t);
    System.event("station.big_upload_bought", Protobuf.encode(new station.purchase_event(null, t, args.token, q.price, true, false, BIG_TERMS), station.purchase_event.encode), [args.buyer!, args.payee!]);
    this.collect(args.token!, args.buyer!, q.price);
    return new station.buy_big_upload_result(t.expiry, q.price);
  }

  // ═══════ admin ═══════
  isCouncil(c: station.config_object, a: Uint8Array): bool {
    for (let i = 0; i < c.council.length; i++) if (Arrays.equal(c.council[i], a)) return true;
    return false;
  }
  isOperator(c: station.config_object, a: Uint8Array): bool { return (isAddress(c.owner) && Arrays.equal(c.owner, a)) || this.isCouncil(c, a); }
  /** Everyday actions: the owner (review H1: one council member can't disrupt operations; the council can replace the
   *  owner with a kind-8 proposal). Council members can only PAUSE (emergency brake), vote and veto. */
  requireOwner(): station.config_object {
    const c = this.config.get()!;
    System.require(isAddress(c.owner), "not initialized");
    System.require(this.ownerSigned(c), "owner only");
    return c;
  }
  /** AB-004: the owner signed AND calls the station directly (not through a contract it signed a transaction for). */
  ownerSigned(c: station.config_object): bool { return isAddress(c.owner) && direct(c.owner!) && System.checkAuthority(authority.authorization_type.contract_call, c.owner!); }
  signedCouncil(c: station.config_object): bool {
    for (let i = 0; i < c.council.length; i++) if (direct(c.council[i]) && System.checkAuthority(authority.authorization_type.contract_call, c.council[i])) return true;
    return false;
  }
  checkCouncil(council: Uint8Array[], threshold: u32, delay: u64, owner: Uint8Array | null): void {
    System.require(council.length >= 2 && council.length <= MAX_COUNCIL, "council: 2 to 7 members");
    for (let i = 0; i < council.length; i++) {
      System.require(isAddress(council[i]) && !Arrays.equal(council[i], this.contractId), "council: wallet addresses only");
      System.require(owner == null || !Arrays.equal(council[i], owner!), "the owner can't be a council member");   // AB-013
      for (let j = 0; j < i; j++) System.require(!Arrays.equal(council[i], council[j]), "council: duplicate member");
    }
    System.require(threshold >= 2 && threshold <= u32(council.length), "threshold: at least 2, at most the council size");
    System.require(delay >= MIN_GUARD_DELAY_MS && delay <= MAX_GUARD_DELAY_MS, "guard delay: 48 h (mainnet) to 30 days");
  }
  checkConfig(c: station.config_object): void {
    System.require(isAddress(c.owner) && !Arrays.equal(c.owner!, this.contractId), "owner required (an external wallet)");
    System.require(c.refill_bp <= 2000, "daily budget above one day's refill (20%)");
    System.require(c.buffer_bp <= 5000, "buffer above 50%");
    System.require(c.ticket_fee_bp <= 2000, "ticket fee above 20%");
    System.require(!isAddress(c.treasury) || !Arrays.equal(c.treasury!, this.contractId), "treasury must be an external wallet (escrow lives in the station)");
    System.require(c.koin_amount <= this.koinBalance(), "koin_amount above the station's KOIN balance");
    // AB-001: no setting may make paid service unservable or a ticket die on arrival (no pause credit would apply).
    System.require(c.big_ticket_ms == 0 || (c.big_ticket_ms >= MIN_TICKET_MS && c.big_ticket_ms <= MAX_TICKET_MS), "ticket lifetime: 1 hour to 7 days (0 = 24 h)");
    System.require(c.hard_max >= MANA, "hard_max below 1 Mana would stop paid service");
    System.require(c.admin_min <= c.koin_amount / 10, "admin_min above 10% of koin_amount would stop paid service");
    System.require(c.max_ops >= 2 && c.per_min >= 1 && c.day_actions >= 1 && c.new_actions >= 1, "per-user limits would stop paid service");
    // AB-024: a user gets per_min actions, then waits cooldown_ms. At most 1 hour, and never fewer than 1 action an hour.
    System.require(c.cooldown_ms <= MAX_COOLDOWN_MS, "cooldown above 1 hour would stop paid service");
    System.require(u64(c.per_min) * MAX_COOLDOWN_MS >= c.cooldown_ms, "per_min and cooldown_ms allow fewer than 1 action an hour");
    System.require(c.open_cap >= 1 && c.open_cap <= u32(MAX_OPEN_ALLOWANCES), "open_cap: 1 to 256 open allowances");
    System.require(this.appReserved(c) < c.open_cap, "app_reserved (0 = 10) must be below open_cap");
    System.require(c.slot_fee_per_day <= MAX_SLOT_FEE, "slot fee above $1 a day");
    System.require(c.slot_fee_per_day > 0 || zeroSlotFeeOk(), "slot_fee_per_day must be above 0 (0 only in a testing build)");
    System.require(c.day_mana >= c.hard_max && c.new_mana >= c.hard_max, "per-user daily Mana below hard_max would stop paid service");
    this.checkCouncil(c.council, c.threshold, c.guard_delay_ms, c.owner);
    this.validateReservations(c, 0, null);
  }
  init(args: station.init_arguments): station.init_result {
    System.require(!isAddress(this.config.get()!.owner), "already initialized");
    // Audit #1: setup is only valid inside the transaction that uploads this station, with all three permissions taken
    // over. Only the key holder can make that first upload, so nobody can front-run init, and a deploy that forgot the
    // lockdown can't be set up at all.
    // The upload tx carries the whole bytecode: read it with the big buffer. (Not in the test build: its test runner
    // never frees memory, so a 1 MiB buffer per test runs it out; each real call gets fresh memory.)
    if (!BUILD_FOR_TESTING) System.setSystemBufferSize(BIG_TX_BUFFER);
    const ops = txOps(); let ok = false;
    for (let i = 0; i < ops.length; i++) {
      const up = ops[i].upload_contract;
      if (up != null && Arrays.equal(up.contract_id, this.contractId) && up.authorizes_call_contract && up.authorizes_transaction_application && up.authorizes_upload_contract) ok = true;
    }
    System.require(ok, "init only in the station's own upload transaction, with all three permissions taken over");
    System.require(args.config != null, "config required");
    this.checkConfig(args.config!);
    this.config.put(args.config!);
    return new station.init_result();
  }
  set_config(args: station.set_config_arguments): station.set_config_result {
    this.requireOwner(); System.require(args.config != null, "config required");
    const old = this.config.get()!; const n = args.config!;
    const oldCap = this.soldCap(old);
    n.paused = old.paused;                                               // pause only via set_paused (escrow clock)
    // Audit #1: these change only through a council proposal (delay + veto).
    let same = Arrays.equal(n.owner, old.owner) && Arrays.equal(n.treasury, old.treasury) && n.threshold == old.threshold
      && n.guard_delay_ms == old.guard_delay_ms && n.council.length == old.council.length && this.ticketFeeBp(n) <= this.ticketFeeBp(old);
    for (let i = 0; same && i < n.council.length; i++) same = Arrays.equal(n.council[i], old.council[i]);
    System.require(same, "owner, treasury, council, threshold, delay and a higher ticket fee change only through a council proposal");
    this.checkConfig(args.config!); this.config.put(args.config!);
    this.noOversell(args.config!, this.now(), oldCap);                  // audit #7
    return new station.set_config_result();
  }
  set_paused(args: station.set_paused_arguments): station.set_paused_result {
    // Pause: the owner or any council member (emergency brake). Resume: the owner only.
    let c = this.config.get()!;
    if (args.paused && isAddress(c.owner) && !this.ownerSigned(c)) System.require(this.signedCouncil(c), "owner or council only");
    else c = this.requireOwner();
    const now = this.now(); const b = this.big.get()!;
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
    // AB-003: boosts together stay within buffer_bp of the daily budget (they can't eat the tickets' locked Mana).
    System.require(this.activeBoosts(this.now(), args.app, args.value) <= this.boostCap(c), "boosts above buffer_bp of the daily budget");
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
  // Per-buyer suspend switch (Carl, 7:37 PM): owner only, no extension of expiry.
  // AB-001 (Carl, Oct 22): for reasons 1, 3 and 4 the buyer's unused share is refunded at once, pro rata of what was
  // paid and never more than is held, so the owner keeps only what was served. Sanctions (2) still freeze the funds.
  // Suspending again with another reason (e.g. a false sanctions match reclassified as 4) refunds then.
  suspend_allowance(args: station.suspend_allowance_arguments): station.suspend_allowance_result {
    const c = this.requireOwner();
    System.require(isAddress(args.buyer), "buyer required");
    System.require(args.reason >= 1 && args.reason <= 4, "reason 1 abuse, 2 sanctions, 3 AUP, 4 legal/other");
    const now = this.now();
    this.suspended.put(args.buyer!, new station.suspend_object(args.reason, now));
    System.event("station.buyer_suspended", Protobuf.encode(new station.suspend_event(args.buyer, args.reason, true, now), station.suspend_event.encode), [args.buyer!]);
    if (args.reason != 2) this.refundSuspended(c, args.buyer!, now);
    return new station.suspend_allowance_result();
  }
  /** AB-001: end every open allowance this buyer owns (unused whole days back to whoever paid each term, no minimum
   *  kept) and settle every open ticket it bought (unexpired, unused share back, no fee). Bounded: <= 256 + 512 reads. */
  refundSuspended(c: station.config_object, buyer: Uint8Array, now: u64): void {
    const t = this.clock(c, now); const reg = this.registry.get()!;
    const ids = reg.open_ids.slice(0);
    for (let i = 0; i < ids.length; i++) {
      const a = this.allowances.get(u32Key(ids[i]));
      if (a != null && a.expiry > t && Arrays.equal(a.buyer, buyer)) this.endTerms(a, t, "suspend_refund", false);
    }
    const ps = reg.open_purchases.slice(0);
    for (let i = 0; i < ps.length; i++) {
      const e = this.escrow.get(u32Key(ps[i]));
      if (e == null || e.closed || e.kind != 2 || !Arrays.equal(e.buyer, buyer)) continue;
      const tk = this.tickets.get(e.payee!);
      if (tk != null && tk.purchase_id == e.id) this.settleTicket(c, e.payee!, tk, false, "suspend_refund", now);
    }
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
    if (args.remove) { this.exempt.remove(args.contract_id!); this.unindexExempt(args.contract_id!); }
    else {
      System.require(args.value != null, "value required");
      System.require(!this.isMoneyContract(args.contract_id!), "token contracts (KOIN, stablecoins) cannot be sponsored"); // AB-009
      System.require(!this.livePaid(args.contract_id!, this.now()), "this contract has a live paid allowance");       // AB-001
      System.require(args.value!.app == 0 || this.apps.has(u32Key(args.value!.app)), "no such app slot (create it with set_app first)"); // review L2
      this.exempt.put(args.contract_id!, args.value!); this.indexExempt(args.contract_id!);
    }
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
  /** AB-028: on a buyer cancel, the whole days of Mana sponsored beyond what the kept days allow (a burst across a 6 h
   *  slot edge can use two days' Mana on the first day). These extra days are charged too (see endTerms). Whatever
   *  can't be charged (at most about one day's Mana, only when another wallet paid the next term) isn't sponsored any
   *  more: the cap stays below what was used, so the allowance serves nothing further. */
  extraDays(a: station.allowance_object, t: u64): u64 {
    if (a.cap_total == 0 || a.mana_per_day == 0) return 0;              // not tracked (bought before AB-006)
    let cut: u64 = 0;
    for (let i = 0; i < a.purchase_ids.length; i++) {
      const e = this.escrow.get(u32Key(a.purchase_ids[i]));
      if (e != null && !e.closed && t < e.end) cut += a.mana_per_day * this.unusedDays(e, t);
    }
    const left = a.cap_total > cut ? a.cap_total - cut : 0;
    return a.used_total > left ? (a.used_total - left + a.mana_per_day - 1) / a.mana_per_day : 0;
  }
  /** End an allowance's terms at time t: refund unused whole days; return the new expiry (end of the paid current day).
   *  Returns [total refunded, new expiry]. */
  endTerms(a: station.allowance_object, t: u64, action: string, keepMin: bool = true): u64[] {
    let refund: u64 = 0; let newExpiry: u64 = t;
    let extra = keepMin ? this.extraDays(a, t) : 0;                     // AB-028: buyer cancels only
    for (let i = 0; i < a.purchase_ids.length; i++) {
      const e = this.escrow.get(u32Key(a.purchase_ids[i]));
      if (e == null || e.closed || t >= e.end) continue;                // finished terms: releasable as they are
      // AB-028 extra days go to the running term (the Mana was drawn during it), then only to future terms the canceller
      // paid: a term another wallet paid comes back whole (AB-029), so a burst can't cost that wallet anything.
      const u0 = this.unusedDays(e!, t);
      const x = t >= e!.start || Arrays.equal(e!.buyer, a.buyer) ? (extra < u0 ? extra : u0) : 0; extra -= x;
      const r = this.termRefund(e!, t, keepMin, x);
      // Shorten the term to what was used, so nothing can be refunded twice (later refunds compute 0 unused days).
      const unused = u0 - x; const used = e!.days - unused;
      const cut = a.mana_per_day * unused;                               // AB-006: refunded days no longer count
      if (a.cap_total > 0) a.cap_total = a.cap_total > cut ? a.cap_total - cut : 1;   // 1, not 0 (0 = untracked)
      if (t < e!.start) e!.end = e!.start;                               // future term: nothing left to serve
      else e!.end = e!.start + used * DAY;                               // paid through the days charged
      e!.days = used;                                                    // a future term: 0, or the days AB-028 charged
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
  cancel_allowance(args: station.cancel_allowance_arguments): station.cancel_allowance_result {
    const c = this.config.get()!; const t = this.clock(c, this.now());
    System.require(this.signs(args.buyer), "buyer must sign");          // AB-004
    const a = this.allowances.get(u32Key(args.id)); System.require(a != null, "no such allowance");
    System.require(Arrays.equal(a!.buyer!, args.buyer!), "not your allowance");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended: the unused share was refunded at suspension (sanctions: frozen)");
    System.require(a!.expiry > t, "already ended");
    const x = this.endTerms(a!, t, "cancel");
    System.event("station.allowance_cancelled", Protobuf.encode(a!, station.allowance_object.encode), [args.buyer!]);
    return new station.cancel_allowance_result(x[0], x[1]);
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
    // AB-001: sanctions freeze the ticket's funds. Other suspensions were already settled (refunded) when they started.
    System.require(!this.sanctioned(t!.buyer!), "sanctions: funds frozen in escrow pending legal review");
    const x = this.settleTicket(c, args.payee!, t!, true, "ticket_settle", now);
    return new station.close_ticket_result(x[0], x[1]);
  }
  cancel_big_upload(args: station.cancel_big_upload_arguments): station.cancel_big_upload_result {
    const c = this.config.get()!; const now = this.now();
    System.require(this.signs(args.buyer), "buyer must sign");          // AB-004
    const t = this.tickets.get(args.payee!); System.require(t != null, "no ticket");
    System.require(Arrays.equal(t!.buyer!, args.buyer!), "not your ticket");
    System.require(!this.suspended.has(args.buyer!), "buyer suspended: the unused share was refunded at suspension (sanctions: frozen)");
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
    const who = args.allowance_id > 0 ? (this.allowances.get(u32Key(args.allowance_id)) != null ? this.allowances.get(u32Key(args.allowance_id))!.buyer : null)
      : (isAddress(args.ticket_payee) && this.tickets.get(args.ticket_payee!) != null ? this.tickets.get(args.ticket_payee!)!.buyer : null);
    System.require(who == null || !this.isOperator(c, who!), "the owner can't refund purchases made by the owner or a council member"); // review L4
    if (args.allowance_id > 0) {
      const a = this.allowances.get(u32Key(args.allowance_id)); System.require(a != null, "no such allowance");
      this.noSanctionedRefund(a!.buyer!);
      const x = this.endTerms(a!, t, "owner_refund", false);            // buyer not at fault: no minimum kept
      return new station.owner_refund_result(x[0]);
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
  /** Oct 21: the sponsorship decision as a dry run (nothing written, no events). A snapshot: the real transaction can
   *  still be refused if something changes before it lands, so callers keep the own-Mana fallback for that case. */
  would_pay(args: station.would_pay_arguments): station.would_pay_result {
    const r = new station.would_pay_result();
    const c = this.config.get()!;
    if (!isAddress(args.payee)) return r;
    const ops = new Array<protocol.operation>();
    for (let i = 0; i < args.operations.length; i++) {
      const x = args.operations[i]; const o = new protocol.operation();
      const cid = x.contract_id != null ? x.contract_id! : new Uint8Array(0); const xa = x.args != null ? x.args! : new Uint8Array(0);
      if (x.upload) o.upload_contract = new protocol.upload_contract_operation(cid, new Uint8Array(0));
      else if (!x.other) o.call_contract = new protocol.call_contract_operation(cid, x.entry_point, xa);
      ops.push(o);
    }
    this.dry = true;
    r.pay = this.decide(c, args.payee!, args.rc_limit, ops);
    this.dry = false;
    r.route = r.pay ? this.route : "";
    return r;
  }

  // ═══════ connected apps (Carl, Oct 20): one list, one-step connect / disconnect ═══════
  indexExempt(id: Uint8Array): void {
    const reg = this.registry.get()!;
    for (let i = 0; i < reg.exempt_ids.length; i++) if (Arrays.equal(reg.exempt_ids[i], id)) return;
    System.require(reg.exempt_ids.length < MAX_EXEMPT, "too many connected apps (64)");
    reg.exempt_ids.push(id); this.registry.put(reg);
  }
  unindexExempt(id: Uint8Array): void {
    const reg = this.registry.get()!; const keep = new Array<Uint8Array>();
    for (let i = 0; i < reg.exempt_ids.length; i++) if (!Arrays.equal(reg.exempt_ids[i], id)) keep.push(reg.exempt_ids[i]);
    reg.exempt_ids = keep; this.registry.put(reg);
  }
  connect_app(args: station.connect_app_arguments): station.connect_app_result {
    const c = this.requireOwner(); const now = this.now();
    System.require(isAddress(args.contract_id) && !Arrays.equal(args.contract_id!, this.contractId), "contract id required");
    System.require(!this.isMoneyContract(args.contract_id!), "token contracts (KOIN, stablecoins) cannot be sponsored");
    System.require(args.mana_per_day >= MANA, "at least 1 Mana per day (use disconnect_app to remove)");
    System.require(!this.livePaid(args.contract_id!, now), "this contract has a live paid allowance");   // AB-001
    const oldCap = this.soldCap(c);
    const ex = this.exempt.get(args.contract_id!);
    let id: u32 = 0;
    if (ex != null && ex.app > 0 && !this.slotShared(ex.app, args.contract_id!)) id = ex.app;
    else { id = 1; while (this.apps.has(u32Key(id))) id++; this.appWin.remove(u32Key(id)); } // review L2: own, clean slot
    let a = this.apps.get(u32Key(id)); if (a == null) a = new station.app_object();
    a.reserved_mana = args.mana_per_day; a.active = true;
    this.validateReservations(c, id, a);
    this.apps.put(u32Key(id), a);
    const reg = this.registry.get()!;
    if (!reg.app_ids.includes(id)) { System.require(reg.app_ids.length < 32, "too many apps"); reg.app_ids.push(id); this.registry.put(reg); }
    const v = new station.exempt_object(id, args.strict);
    this.exempt.put(args.contract_id!, v); this.indexExempt(args.contract_id!);
    this.noOversell(c, now, oldCap);
    System.event("station.exempt_changed", Protobuf.encode(new station.exempt_event(args.contract_id, v, false), station.exempt_event.encode), [args.contract_id!]);
    return new station.connect_app_result(id);
  }
  /** True when another connected contract also points at slot `app`. */
  slotShared(app: u32, except: Uint8Array): bool {
    const reg = this.registry.get()!;
    for (let i = 0; i < reg.exempt_ids.length; i++) { if (Arrays.equal(reg.exempt_ids[i], except)) continue; const o = this.exempt.get(reg.exempt_ids[i]); if (o != null && o.app == app) return true; }
    return false;
  }
  disconnect_app(args: station.disconnect_app_arguments): station.disconnect_app_result {
    this.requireOwner();
    const ex = this.exempt.get(args.contract_id!); System.require(ex != null, "not connected");
    this.exempt.remove(args.contract_id!); this.unindexExempt(args.contract_id!);
    if (ex!.app > 0) {                                                  // free its slot unless another contract shares it
      const reg = this.registry.get()!; let shared = false;
      for (let i = 0; i < reg.exempt_ids.length; i++) { const o = this.exempt.get(reg.exempt_ids[i]); if (o != null && o.app == ex!.app) shared = true; }
      if (!shared) {
        this.apps.remove(u32Key(ex!.app));
        const keep = new Array<u32>(); for (let i = 0; i < reg.app_ids.length; i++) if (reg.app_ids[i] != ex!.app) keep.push(reg.app_ids[i]);
        reg.app_ids = keep; this.registry.put(reg);
      }
    }
    System.event("station.exempt_changed", Protobuf.encode(new station.exempt_event(args.contract_id, ex, true), station.exempt_event.encode), [args.contract_id!]);
    return new station.disconnect_app_result();
  }
  list_connected(args: station.list_connected_arguments): station.list_connected_result {
    const c = this.config.get()!; const now = this.now(); const reg = this.registry.get()!;
    const r = new station.list_connected_result(); const seen = new Array<u32>();
    for (let i = 0; i < reg.exempt_ids.length; i++) {
      const ex = this.exempt.get(reg.exempt_ids[i]); if (ex == null) continue;
      const x = new station.connected_app(); x.contract_id = reg.exempt_ids[i]; x.app = ex.app; x.strict = ex.strict;
      if (ex.app > 0) {
        seen.push(ex.app); const a = this.apps.get(u32Key(ex.app));
        if (a != null) { x.mana_per_day = a.reserved_mana; x.boost_mana = a.boost_mana; x.boost_until = a.boost_until; x.active = a.active; }
        const w = this.appWin.get(u32Key(ex.app))!; roll(w, now / APP_SLOT, APP_N, true); x.used_24h = sumMana(w);
      }
      r.free_apps.push(x);
    }
    for (let i = 0; i < reg.app_ids.length; i++) {                     // reserved slots with no contract linked yet
      if (seen.includes(reg.app_ids[i])) continue;
      const a = this.apps.get(u32Key(reg.app_ids[i])); if (a == null) continue;
      const x = new station.connected_app(); x.app = reg.app_ids[i]; x.mana_per_day = a.reserved_mana; x.active = a.active;
      const w = this.appWin.get(u32Key(reg.app_ids[i]))!; roll(w, now / APP_SLOT, APP_N, true); x.used_24h = sumMana(w);
      r.free_apps.push(x);
    }
    for (let i = 0; i < reg.open_ids.length; i++) {
      const a = this.allowances.get(u32Key(reg.open_ids[i])); if (a == null) continue;
      const x = new station.paid_app(); x.id = a.id; x.buyer = a.buyer; x.target = a.target; x.mana_per_day = a.mana_per_day; x.expiry = a.expiry; x.kind = a.kind;
      if (a.day != null) { roll(a.day!, now / USER_SLOT, USER_N, false); x.used_24h = sumMana(a.day!); }
      x.suspended = this.suspended.has(a.buyer!);
      r.paid.push(x);
    }
    r.daily_budget = this.dailyBudget(c); r.reserved = this.reservedTotal(); r.sellable = this.soldCap(c);
    r.sold = this.committed(c, now, false)[0]; r.mana = this.mana();
    return r;
  }

  // ═══════ council (audit #1): M-of-N approval + delay for money moves and upgrades; any one member can veto ═══════
  validCount(c: station.config_object, p: station.proposal_object): u32 {
    let n: u32 = 0;
    for (let i = 0; i < p.approvals.length; i++) if (this.isCouncil(c, p.approvals[i])) n++;
    return n;
  }
  propEvent(p: station.proposal_object, by: Uint8Array, what: string): void {
    System.event("station.proposal_" + what, Protobuf.encode(new station.proposal_event(p, by, what), station.proposal_event.encode), [by]);
  }
  maybeReady(c: station.config_object, p: station.proposal_object, now: u64, by: Uint8Array): void {
    if (p.ready_at == 0 && this.validCount(c, p) >= c.threshold) { p.ready_at = now + c.guard_delay_ms; this.propEvent(p, by, "ready"); }
  }
  /** Review L1: after a council change every open proposal restarts its wait, counted from now with current members. */
  rearm(c: station.config_object, now: u64): void {
    const reg = this.registry.get()!;
    for (let i = 0; i < reg.open_proposals.length; i++) {
      const q = this.proposals.get(u32Key(reg.open_proposals[i])); if (q == null) continue;
      q.ready_at = 0; this.maybeReady(c, q, now, new Uint8Array(0)); this.proposals.put(u32Key(q.id), q);
    }
  }
  closeProposal(p: station.proposal_object): void {
    this.proposals.put(u32Key(p.id), p);
    const reg = this.registry.get()!; const keep = new Array<u32>();
    for (let i = 0; i < reg.open_proposals.length; i++) if (reg.open_proposals[i] != p.id) keep.push(reg.open_proposals[i]);
    reg.open_proposals = keep; this.registry.put(reg);
  }
  requireCouncil(c: station.config_object, signer: Uint8Array | null): void {
    System.require(isAddress(signer) && this.isCouncil(c, signer!), "council members only");
    System.require(direct(signer!) && System.checkAuthority(authority.authorization_type.contract_call, signer!), "signer must sign"); // AB-004
  }
  openProposal(id: u32): station.proposal_object {
    const p = this.proposals.get(u32Key(id)); System.require(p != null, "no such proposal");
    System.require(!p!.executed && !p!.cancelled, "proposal already closed");
    return p!;
  }
  checkAction(a: station.guarded_action): void {
    System.require(a.kind >= 1 && a.kind <= 8, "kind 1-8");
    if (a.kind == 1) { const h = a.hash; System.require(h != null && h.length == 34 && h[0] == 0x12 && h[1] == 0x20, "upgrade: sha2-256 multihash (0x1220…) of the new bytecode"); }
    if (a.kind == 2 || a.kind == 3 || a.kind == 6 || a.kind == 8) System.require(isAddress(a.to) && !Arrays.equal(a.to, this.contractId), "a wallet address is required");
    if (a.kind == 2 || a.kind == 3) System.require(a.amount > 0, "amount required");
    if (a.kind == 3) System.require(isAddress(a.token) && !Arrays.equal(a.token, this.koinId()), "token required (use kind 2 for KOIN)");
    if (a.kind == 4) { const c = this.config.get()!; this.checkCouncil(a.council, a.threshold, c.guard_delay_ms, c.owner); } // AB-013
    if (a.kind == 8) System.require(!this.isCouncil(this.config.get()!, a.to!), "the owner can't be a council member");   // AB-013
    if (a.kind == 5) System.require(a.delay_ms >= MIN_GUARD_DELAY_MS && a.delay_ms <= MAX_GUARD_DELAY_MS, "guard delay: 48 h (mainnet) to 30 days");
    if (a.kind == 7) System.require(a.fee_bp <= 2000, "ticket fee above 20%");
  }
  propose(args: station.propose_arguments): station.propose_result {
    const c = this.config.get()!; System.require(isAddress(c.owner), "not initialized");
    this.requireCouncil(c, args.signer); System.require(args.action != null, "action required");
    this.checkAction(args.action!);
    // AB-011 / AB-025: 14 days after a veto, whoever sits on the council, for any action of that kind and target.
    System.require(!this.vetoBlocked(args.action!, this.now()), "an action of this kind for this target was vetoed less than 14 days ago");
    const reg = this.registry.get()!;
    System.require(reg.open_proposals.length < MAX_OPEN_PROPOSALS, "too many open proposals (16)");
    let mine = 0;
    for (let i = 0; i < reg.open_proposals.length; i++) { const q = this.proposals.get(u32Key(reg.open_proposals[i])); if (q != null && Arrays.equal(q.proposer, args.signer!)) mine++; }
    System.require(mine < MAX_PER_PROPOSER, "this member already has 3 open proposals");
    reg.next_proposal += 1; const id = reg.next_proposal; reg.open_proposals.push(id); this.registry.put(reg);
    const now = this.now();
    const p = new station.proposal_object(id, args.action, args.signer, [args.signer!], now);
    this.propEvent(p, args.signer!, "created");
    this.maybeReady(c, p, now, args.signer!);
    this.proposals.put(u32Key(id), p);
    return new station.propose_result(id);
  }
  approve(args: station.approve_arguments): station.approve_result {
    const c = this.config.get()!; this.requireCouncil(c, args.signer);
    const p = this.openProposal(args.id);
    for (let i = 0; i < p.approvals.length; i++) System.require(!Arrays.equal(p.approvals[i], args.signer!), "already approved");
    p.approvals.push(args.signer!);
    this.propEvent(p, args.signer!, "approved");
    this.maybeReady(c, p, this.now(), args.signer!);
    this.proposals.put(u32Key(p.id), p);
    return new station.approve_result(p.ready_at);
  }
  cancel_proposal(args: station.cancel_proposal_arguments): station.cancel_proposal_result {
    const c = this.config.get()!; this.requireCouncil(c, args.signer);
    const p = this.openProposal(args.id);
    // Review H1: a member can't veto a council change that removes them (or they could never be removed).
    if (p.action != null && p.action!.kind == 4) {
      let stays = false; for (let i = 0; i < p.action!.council.length; i++) if (Arrays.equal(p.action!.council[i], args.signer!)) stays = true;
      System.require(stays, "a member can't veto their own removal");
    }
    p.cancelled = true; p.cancelled_by = args.signer; this.closeProposal(p);
    // AB-011 / AB-025: a veto blocks the action's kind and target. A proposer withdrawing their own proposal is not a
    // veto (so one member can't block, say, every upgrade alone by proposing one and cancelling it).
    if (p.action != null && !Arrays.equal(p.proposer, args.signer!)) this.vetoed.put(this.actionKey(p.action!), new station.revenue_object(this.now()));
    this.propEvent(p, args.signer!, "cancelled");
    return new station.cancel_proposal_result();
  }
  /** AB-025: what a veto blocks, whatever the exact bytes: the action's kind, plus the wallet `to` for kinds 2, 3, 6 and
   *  8. So kind 1 blocks every upgrade of this contract, and kinds 4, 5 and 7 every change of that setting. Keys are 1 or
   *  26 bytes, never the 34-byte hashes stored before AB-025 (those records are no longer consulted). */
  actionKey(a: station.guarded_action): Uint8Array {
    const to = (a.kind == 2 || a.kind == 3 || a.kind == 6 || a.kind == 8) && isAddress(a.to) ? a.to! : new Uint8Array(0);
    const k = new Uint8Array(1 + to.length); k[0] = u8(a.kind); k.set(to, 1); return k;
  }
  vetoBlocked(a: station.guarded_action, now: u64): bool { const v = this.vetoed.get(this.actionKey(a)); return v != null && now < v.total + VETO_BLOCK_MS; }
  /** Ready = threshold reached, delay passed, and still enough approvals from CURRENT council members. */
  isReady(c: station.config_object, p: station.proposal_object, now: u64): bool {
    return p.ready_at > 0 && now >= p.ready_at && this.validCount(c, p) >= c.threshold;
  }
  execute(args: station.execute_arguments): station.execute_result {
    const c = this.config.get()!; const now = this.now();
    const p = this.openProposal(args.id); const a = p.action!;
    System.require(a.kind != 1, "upgrades run by uploading the approved bytecode to the station");
    System.require(p.ready_at > 0, "not enough approvals yet");
    System.require(now >= p.ready_at, "waiting period not over");
    System.require(this.validCount(c, p) >= c.threshold, "not enough approvals from current council members");
    System.require(!this.vetoBlocked(a, now), "an action of this kind for this target was vetoed less than 14 days ago"); // AB-025
    p.executed = true; this.closeProposal(p);                            // state first, then any transfer
    if (a.kind == 2) {
      const bal = this.koinBalance();
      System.require(bal >= a.amount && bal - a.amount >= c.koin_amount, "would leave less KOIN than koin_amount (lower koin_amount first)");
      this.koinSend(a.to!, a.amount);
    } else if (a.kind == 3) {
      const held = this.escrowTot.get(a.token!)!.held; const bal = this.tokenBalance(a.token!);
      System.require(bal >= held && a.amount <= bal - held, "only tokens above what escrow holds can be rescued");
      this.send(a.token!, a.to!, a.amount);
    } else {
      if (a.kind == 4) { this.checkCouncil(a.council, a.threshold, c.guard_delay_ms, c.owner); c.council = a.council; c.threshold = a.threshold; this.rearm(c, now); }
      else if (a.kind == 5) c.guard_delay_ms = a.delay_ms;
      else if (a.kind == 6) c.treasury = a.to;
      else if (a.kind == 7) c.ticket_fee_bp = a.fee_bp;
      else if (a.kind == 8) { System.require(!this.isCouncil(c, a.to!), "the owner can't be a council member"); c.owner = a.to; } // AB-013
      this.config.put(c);
    }
    this.propEvent(p, new Uint8Array(0), "executed");
    return new station.execute_result();
  }
  /** authorize(contract_upload): only the exact bytecode of a ready upgrade proposal, keeping all three overrides. */
  upgradeOk(): bool {
    const c = this.config.get()!;
    if (!isAddress(c.owner)) return false;
    if (!BUILD_FOR_TESTING) System.setSystemBufferSize(BIG_TX_BUFFER);  // the tx carries the new bytecode (see init)
    // Review C1 (critical): the chain asks once per upload op, and this code can't tell WHICH op is being applied. So an
    // approved upgrade must be the only operation in its transaction; otherwise an attacker could upload their own code
    // first and the approved code later in the same tx, and drain the station through their code in between.
    const ops = txOps();
    if (ops.length != 1) return false;
    const up = ops[0].upload_contract;
    if (up == null || !Arrays.equal(up.contract_id, this.contractId)) return false;
    if (!up.authorizes_call_contract || !up.authorizes_transaction_application || !up.authorizes_upload_contract) return false;
    const h = System.hash(Crypto.multicodec.sha2_256, up.bytecode); if (h == null) return false;
    const now = this.now(); const reg = this.registry.get()!;
    for (let i = 0; i < reg.open_proposals.length; i++) {
      const p = this.proposals.get(u32Key(reg.open_proposals[i]));
      if (p == null || p.action == null || p.action!.kind != 1 || !Arrays.equal(p.action!.hash, h)) continue;
      if (!this.isReady(c, p, now) || now >= p.ready_at + UPGRADE_WINDOW_MS) continue;
      if (this.vetoBlocked(p.action!, now)) continue;                    // AB-025: no upgrade within 14 days of a vetoed one
      p.executed = true; this.closeProposal(p);
      this.propEvent(p, new Uint8Array(0), "executed");
      return true;
    }
    return false;
  }
  get_proposal(args: station.get_proposal_arguments): station.get_proposal_result {
    const r = new station.get_proposal_result(); r.proposal = this.proposals.get(u32Key(args.id)); return r;
  }
  list_proposals(args: station.list_proposals_arguments): station.list_proposals_result {
    const r = new station.list_proposals_result(); const reg = this.registry.get()!;
    for (let i = 0; i < reg.open_proposals.length; i++) { const p = this.proposals.get(u32Key(reg.open_proposals[i])); if (p != null) r.proposals.push(p); }
    return r;
  }
}
