// Audit Bot stateful fuzz (escrow), mana-station commit 4343f83, seed 11, 120 steps. Random valid sequences of buys, renewals,
// cancels, owner refunds, releases, big-upload tickets (buy/use/cancel/close), pause/unpause and time jumps; after EVERY
// step the escrow money must add up. Helpers below are copied unchanged from assembly/__tests__/Station.spec.ts (lines 1-117).
/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
import { station } from "../proto/station";

const STATION = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqe");
const OWNER = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqG");
const KNODE = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqK");
const STORIES = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqP");
const OTHER = Base58.decode("12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq");
const SOLDAPP = Base58.decode("159myq5YUhhoVWu3wsHKHiJYKPKGUrGiyv");
const KOIN = Base58.decode("19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK");
const USDT = Base58.decode(VUSDT);
const USDC = Base58.decode(VUSDC);
const LEGACY = Base58.decode("19WrWze3XAoMa3Mwqys4rJMP6emZX2wfpH");
const U1 = Base58.decode("1PWeFG4pPtjZZoYvcmGb6mYhMYJjnkHrmz");
const U2 = Base58.decode("1HGh4rQvYYcm4fGiU1C7vQoSxnUiGa9Ah7");
const BUYER = Base58.decode("128NayuVt5K2r2C2upFG5rzkL1KcsFKsT8");
const M: u64 = 100_000_000;        // 1 Mana = 1 KOIN = 1e8
const USD: u64 = 100_000_000;      // vUSDT / vUSDC: 8 decimals
const EP_PLAY: u32 = 0x11111111, EP_HEAVY: u32 = 0x22222222, EP_NOPE: u32 = 0x33333333, EP_TRANSFER: u32 = 0x27f576ca;
const T0: u64 = 1_800_000_000_000;
const DAYMS: u64 = 86_400_000, HOUR: u64 = 3_600_000;

let H: u64 = 1000; let NOW: u64 = T0;
function at(t: u64): void { NOW = t; H += 1; MockVM.setBlock(new protocol.block(new Uint8Array(0), new protocol.block_header(new Uint8Array(0), H, t))); System.resetCache(); }
function signedBy(accts: Uint8Array[]): void {
  const a = new Array<MockVM.MockAuthority>();
  for (let i = 0; i < accts.length; i++) a.push(new MockVM.MockAuthority(authority.authorization_type.contract_call, accts[i], true));
  MockVM.setAuthorities(a);
}
// Bytes kept below 0x80: the MockVM key store conflates keys that differ only in bytes >= 0x80 (seen in testing).
// Council members (audit #1): distinct low-byte addresses.
function cm(i: i32): Uint8Array { const u = new Uint8Array(25); u[1] = 50; u[2] = u8(i); u[24] = 9; return u; }
const C1 = cm(1), C2 = cm(2), C3 = cm(3);
/** The deploy transaction: uploads the station with all three permissions taken over (init is only valid inside it). */
function deployTx(call: bool = true, txapp: bool = true, upl: bool = true): void {
  const t = new protocol.transaction(); const up = new protocol.operation();
  up.upload_contract = new protocol.upload_contract_operation(STATION, new Uint8Array(8), "", call, txapp, upl);
  t.operations = [up]; MockVM.setTransaction(t); System.resetCache();
}
function user(i: i32): Uint8Array { const u = new Uint8Array(25); u[1] = u8(i / 100); u[2] = u8(i % 100); u[24] = 7; return u; }
// Small test station: 1,000 KOIN → daily budget 200 Mana (20%). Reservations Knode 80, Stories 80 → sellable 40 (derived).
function cfg(): station.config_object {
  const c = new station.config_object();
  c.owner = OWNER; c.koin_amount = 1000 * M; c.refill_bp = 2000; c.admin_min = 5 * M; c.hard_max = 3 * M;
  c.per_min = 5; c.cooldown_ms = 600_000; c.day_actions = 25; c.day_mana = 60 * M;
  c.new_actions = 10; c.new_mana = 25 * M; c.new_pct = 100; c.max_ops = 2;
  c.big_max = 300 * M; c.big_cooldown_ms = DAYMS; c.big_week_cap = 500 * M; c.big_max_debt = 400 * M; c.big_ticket_ms = 3 * DAYMS;
  c.max_allowances = 8; c.max_days = 90; c.buffer_bp = 2000; c.alert_mana = 600 * M;
  c.open_cap = 50;                                                         // audit-fixes-1: required, 1 to 256
  c.council = [C1, C2, C3]; c.threshold = 2; c.guard_delay_ms = 2 * DAYMS;   // audit #1: 2 of 3, 48 h
  return c;
}
function setup(): Station {
  MockVM.reset(); System.setSystemBufferSize(256 * 1024);   // the 1 KiB default can't hold larger event lists
  MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); MockVM.setEntryPoint(0);
  MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
  MockVM.setContractMetadata(new chain.contract_metadata_object(new Uint8Array(0), false, false, false, true));
  MockVM.setHeadInfo(new chain.head_info(null, 0, 1));
  at(T0);
  testSetMana(1000 * M); testSetBalance(1000 * M);
  const s = new Station();
  signedBy([STATION]); deployTx(); s.init(new station.init_arguments(cfg()));
  signedBy([OWNER]);
  s.set_app(new station.set_app_arguments(1, new station.app_object(80 * M, true)));   // reservations 80 + 80
  s.set_app(new station.set_app_arguments(2, new station.app_object(80 * M, true)));   // → sellable 200 − 160 = 40
  s.set_exempt(new station.set_exempt_arguments(KNODE, new station.exempt_object(1, true), false));
  s.set_exempt(new station.set_exempt_arguments(STORIES, new station.exempt_object(2, true), false));
  s.set_entry(new station.set_entry_arguments(KNODE, EP_PLAY, new station.entry_object(1, 3 * M, 256), false));
  s.set_entry(new station.set_entry_arguments(KNODE, EP_HEAVY, new station.entry_object(1, 2 * M, 256), false));
  s.set_entry(new station.set_entry_arguments(STORIES, EP_PLAY, new station.entry_object(2, 3 * M, 256), false));
  s.set_price(new station.set_price_arguments(USDT, PRICE()));
  signedBy([]);
  testSetToken(USDT, BUYER, 1000 * USD); testSetToken(USDT, U1, 1000 * USD);
  return s;
}
function op(contract: Uint8Array, ep: u32, argLen: i32 = 8): protocol.operation {
  const o = new protocol.operation(); o.call_contract = new protocol.call_contract_operation(contract, ep, new Uint8Array(argLen)); return o;
}
function tx(payee: Uint8Array | null, rc: u64, ops: protocol.operation[]): void {
  const t = new protocol.transaction(); t.header = new protocol.transaction_header();
  t.header!.rc_limit = rc; t.header!.payer = STATION; if (payee != null) t.header!.payee = payee;
  t.operations = ops; MockVM.setTransaction(t); System.resetCache();
}
function ok(s: Station): bool { return s.authorize(new authority.authorize_arguments(authority.authorization_type.transaction_application)).value; }
function play(s: Station, who: Uint8Array, rc: u64 = 2 * M, app: Uint8Array = KNODE): bool { tx(who, rc, [op(app, EP_PLAY)]); return ok(s); }
function buyAccount(s: Station, target: Uint8Array, manaPerDay: u64, days: u64): station.buy_allowance_result {
  signedBy([BUYER, target]);                             // audit #3: the target app signs too
  const r = s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, target, manaPerDay, days, USDT, 1000 * USD));
  signedBy([]); return r;
}
function inv(s: Station, token: Uint8Array): void {     // escrow invariants
  const t = s.get_escrow_totals(new station.get_escrow_totals_arguments(token)).totals!;
  expect(testGetToken(token, STATION)).toBe(t.held);
  expect(t.collected).toBe(t.held + t.refunded + t.released);
}
function cancelBy(s: Station, who: Uint8Array, id: u32): station.cancel_allowance_result {
  signedBy([who]); const r = s.cancel_allowance(new station.cancel_allowance_arguments(who, id)); signedBy([]); return r;
}
let gS: Station | null = null;
/** Council path (audit #1): C1 proposes, C2 approves, the 48 h delay passes, anyone executes. */
function councilDo(s: Station, a: station.guarded_action): void {
  signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, a)).id;
  signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
  at(NOW + 2 * DAYMS); s.execute(new station.execute_arguments(id));
}
function act(kind: u32): station.guarded_action { const a = new station.guarded_action(); a.kind = kind; return a; }
/** Carl's approved introductory prices (8 decimals): per 1,000 Mana/day 1 d 3,000,000 / 7 d 20,000,000 / 30 d 75,000,000;
 *  big upload 5,000,000 per 1,000 Mana. Big minimum 50 Mana at test scale (5,000 on mainnet). Max per purchase 100 vUSDT. */
function PRICE(): station.price_object { return new station.price_object(true, 100 * USD, 3_000_000, 20_000_000, 75_000_000, 5_000_000, 50 * M); }
/** Carl's option A at test scale: reservations use the whole budget (100 + 100 of 200) → sellable 0. */
function setupA(): Station {
  const s = setup(); signedBy([OWNER]);
  s.set_app(new station.set_app_arguments(1, new station.app_object(100 * M, true)));
  s.set_app(new station.set_app_arguments(2, new station.app_object(100 * M, true)));
  signedBy([]); return s;
}
const SEED: u32 = 11;
const STEPS: i32 = 120;
let rs: u32 = SEED;
function rnd(): u32 { let x = rs; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rs = x; return x; }
function pick(n: u32): u32 { return rnd() % n; }
const NB: i32 = 4;
let buyers: Uint8Array[] = [];
let allowIds: u32[] = []; let allowBuyer: i32[] = [];
let tPayees: Uint8Array[] = []; let tBuyer: i32[] = [];
let lastTicketBuy: u64[] = [0, 0, 0, 0];
let nPurch: u32 = 0; let nextTarget: i32 = 0; let nextPayee: i32 = 0;
let paused = false; let pausedAt: u64 = 0;
let total0: u64 = 0;
function clock(): u64 { return paused ? pausedAt : NOW; }
function holders(): Uint8Array[] { const h = new Array<Uint8Array>(); for (let i = 0; i < NB; i++) h.push(buyers[i]); h.push(STATION); h.push(OWNER); h.push(BUYER); h.push(U1); return h; }
function totalTokens(): u64 { const h = holders(); let s: u64 = 0; for (let i = 0; i < h.length; i++) s += testGetToken(USDT, h[i]); return s; }
function check(s: Station, step: i32, what: string): void {
  const where = "seed " + SEED.toString() + " step " + step.toString() + " (" + what + ")";
  const t = s.get_escrow_totals(new station.get_escrow_totals_arguments(USDT)).totals!;
  expect(testGetToken(USDT, STATION)).toBe(t.held, "balance != held at " + where);
  expect(t.collected).toBe(t.held + t.refunded + t.released, "collected != held+refunded+released at " + where);
  expect(totalTokens()).toBe(total0, "tokens created or lost at " + where);
  for (let id: u32 = 1; id <= nPurch; id++) {
    const e = s.get_escrow(new station.get_escrow_arguments(id)).purchase;
    if (e == null) continue;
    expect(e.refunded + e.released <= e.amount).toBe(true, "purchase " + id.toString() + " paid out more than paid at " + where);
    if (e.closed) expect(e.refunded + e.released).toBe(e.amount, "closed purchase " + id.toString() + " not fully settled at " + where);
  }
}
function openFor(s: Station, b: i32): i32 {
  let n = 0;
  for (let i = 0; i < allowIds.length; i++) { if (allowBuyer[i] != b) continue; const a = s.get_allowance(new station.get_allowance_arguments(allowIds[i])).allowance; if (a != null && a.expiry > NOW) n++; }
  for (let i = 0; i < tPayees.length; i++) { if (tBuyer[i] != b) continue; const t = s.get_ticket(new station.get_ticket_arguments(tPayees[i])).ticket; if (t != null && NOW < t.expiry && t.remaining > 0) n++; }
  return n;
}
function daysOf(k: u32): u64 { return k == 0 ? 1 : (k == 1 ? 7 : 30); }
describe("AUDIT fuzz: escrow money always adds up", () => {
  it("seed 11", () => {
    const s = setup();
    for (let i = 0; i < NB; i++) { buyers.push(user(700 + i)); testSetToken(USDT, buyers[i], 50 * USD); }
    total0 = totalTokens();
    let done = 0;
    for (let step = 0; step < STEPS; step++) {
      const k = pick(11); const b = i32(pick(u32(NB))); const B = buyers[b]; let what = "skip";
      if (k == 0 || k == 1) {
        const days = daysOf(pick(3)); const mpd = u64(1 + pick(4)) * M;
        const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, mpd, days));
        if (!paused && q.available && openFor(s, b) < 5) {
          const target = user(100 + nextTarget); nextTarget++;
          signedBy([B, target]);
          const r = s.buy_allowance(new station.buy_allowance_arguments(B, k == 0 ? 2 : 1, target, mpd, days, USDT, q.price));
          signedBy([]); allowIds.push(r.id); allowBuyer.push(b); nPurch++; what = "buy";
        }
      } else if (k == 2 && allowIds.length > 0) {
        const i = i32(pick(u32(allowIds.length))); const a = s.get_allowance(new station.get_allowance_arguments(allowIds[i])).allowance;
        const days = daysOf(pick(2));
        if (!paused && a != null && a.expiry > NOW && a.expiry + days * DAYMS <= NOW + 90 * DAYMS && a.purchase_ids.length < 5) {
          const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, a.mana_per_day, days));
          const pay = buyers[allowBuyer[i]];
          if (q.available) { signedBy([pay]); s.renew(new station.renew_arguments(pay, a.id, days, USDT, 1000 * USD)); signedBy([]); nPurch++; what = "renew"; }
        }
      } else if (k == 3 && allowIds.length > 0) {
        const i = i32(pick(u32(allowIds.length))); const a = s.get_allowance(new station.get_allowance_arguments(allowIds[i])).allowance;
        if (a != null && a.expiry > clock()) { cancelBy(s, buyers[allowBuyer[i]], a.id); what = "cancel"; }
      } else if (k == 4 && allowIds.length > 0) {
        const i = i32(pick(u32(allowIds.length))); const a = s.get_allowance(new station.get_allowance_arguments(allowIds[i])).allowance;
        if (a != null) { signedBy([OWNER]); s.owner_refund(new station.owner_refund_arguments(a.id, null)); signedBy([]); what = "owner_refund"; }
      } else if (k == 5 && nPurch > 0) {
        const id = 1 + pick(nPurch); const g = s.get_escrow(new station.get_escrow_arguments(id));
        if (g.purchase != null && g.releasable && g.purchase!.kind == 1) { s.release(new station.release_arguments(id)); what = "release"; }
      } else if (k == 6) {
        const mana = u64(50 + pick(100)) * M; const q = s.quote_big_upload(new station.quote_big_upload_arguments(USDT, mana));
        if (!paused && q.available && openFor(s, b) < 5 && (lastTicketBuy[b] == 0 || NOW >= lastTicketBuy[b] + DAYMS)) {
          const payee = user(300 + nextPayee); nextPayee++;
          signedBy([B, payee]); s.buy_big_upload(new station.buy_big_upload_arguments(B, payee, mana, USDT, q.price, true)); signedBy([]);
          tPayees.push(payee); tBuyer.push(b); lastTicketBuy[b] = NOW; nPurch++; what = "buy_big";
        }
      } else if (k == 7 && tPayees.length > 0) {
        const i = i32(pick(u32(tPayees.length))); const t = s.get_ticket(new station.get_ticket_arguments(tPayees[i])).ticket;
        if (t != null && !paused) {
          const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(tPayees[i], new Uint8Array(16));
          const rc = u64(1 + pick(60)) * M; tx(tPayees[i], rc, [up]); ok(s); what = "use_ticket";
        }
      } else if (k == 8 && tPayees.length > 0) {
        const i = i32(pick(u32(tPayees.length))); const t = s.get_ticket(new station.get_ticket_arguments(tPayees[i])).ticket;
        if (t != null) {
          if (clock() >= t.expiry || t.remaining == 0) { s.close_ticket(new station.close_ticket_arguments(tPayees[i])); what = "close_ticket"; }
          else { signedBy([buyers[tBuyer[i]]]); s.cancel_big_upload(new station.cancel_big_upload_arguments(buyers[tBuyer[i]], tPayees[i])); signedBy([]); what = "cancel_big"; }
        }
      } else if (k == 9) {
        signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(!paused)); signedBy([]);
        if (!paused) pausedAt = NOW; paused = !paused; what = paused ? "pause" : "unpause";
      } else {
        const j = pick(4); at(NOW + (j == 0 ? 60_000 : (j == 1 ? HOUR : (j == 2 ? 13 * HOUR : 3 * DAYMS)))); what = "time";
      }
      if (what != "skip") done++;
      check(s, step, what);
    }
    log<string>("seed " + SEED.toString() + ": " + done.toString() + " actions, " + nPurch.toString() + " purchases");
  });
});
