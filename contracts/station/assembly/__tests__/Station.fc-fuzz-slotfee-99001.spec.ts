/**
 * RED TEAM (THIEF, round 2), mana-station branch audit-fixes-1 commit dd5148d. Model-based escrow fuzz WITH the slot fee
 * (2,000,000 a day) and the pass minimum (25,000,000) on. Seed 20261022, 120 steps. Only actions the model predicts to
 * be valid are sent (same guards as the contract), mixing: buy pass / app plan (4 buyers), renew by a RANDOM payer
 * (usually not the allowance buyer), buyer cancel, owner_refund, suspend (reasons 1-4, incl. 2 -> 4 reclassification),
 * unsuspend, pause / unpause (pause credit), release, sponsored use (authorize) and time jumps.
 * After EVERY step (fails if any is broken):
 *   - per token: station balance == held == collected - refunded - released (escrow totals agree with the purchases);
 *   - per purchase: refunded + released <= amount; closed => fully settled;
 *   - per allowance term: refunded + slot_fee_per_day x days still charged <= amount (no slot fee back for days held);
 *   - money goes to the right wallet: each wallet's balance == start - what it paid + refunds on its own purchases, and
 *     the sum of amounts recorded per payer == what the model saw that payer pay (no buyer's money refunded to another);
 *   - the treasury (owner wallet) received exactly the released total.
 * Helpers below are copied unchanged from assembly/__tests__/Station.audit-fixes-1.spec.ts lines 1-170.
 */
// audit-fixes-1 regression tests (Mana Station, 2026-10-22): the owner's decisions on the first Audit Bot audit, the
// AB-017 boundary tests for the non-equivalent mutation survivors, and the authorize-cost probe at the new caps.
// Helpers below are copied unchanged from assembly/__tests__/Station.spec.ts (lines 1-117), as in the other audit specs.
/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, testSetContract, testRealSlotFee, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
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

// ───── audit-fixes-1 (2026-10-22): regression tests for the owner's decisions on AB-001…AB-022, AB-017 boundary tests,
// and the authorize cost at the new open-allowance cap (AB-002). Helpers above are copied from Station.spec.ts. ─────
@external("env", "ms_cost_begin") declare function costBegin(): void;
@external("env", "ms_cost_end") declare function costEnd(tag: i32): void;

let gS1: Station | null = null;
let gC1: station.config_object | null = null;
let gB1: station.buy_allowance_arguments | null = null;
let gT1: station.buy_big_upload_arguments | null = null;
let gA1: station.guarded_action | null = null;
let gP1: station.price_object | null = null;
let gId1: u32 = 0;
const EVIL = user(77);
function viaContract(): void { MockVM.setCaller(new chain.caller_data(EVIL, chain.privilege.user_mode)); }
function callerIs(w: Uint8Array): void { MockVM.setCaller(new chain.caller_data(w, chain.privilege.user_mode)); }
function direct(): void { MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode)); }
function bal(w: Uint8Array): u64 { return testGetToken(USDT, w); }
function setConfig(s: Station, c: station.config_object): void { signedBy([OWNER]); s.set_config(new station.set_config_arguments(c)); signedBy([]); }
function refusedConfig(s: Station, c: station.config_object, why: string): void {
  gS1 = s; gC1 = c; signedBy([OWNER]); MockVM.commitTransaction();
  expect(() => { gS1!.set_config(new station.set_config_arguments(gC1)); }).toThrow(why); signedBy([]);
}
/** Reservations 10 + 10 of the 200-Mana budget: 180 Mana a day sellable. */
function setupWide(): Station {
  const s = setup(); signedBy([OWNER]);
  s.set_app(new station.set_app_arguments(1, new station.app_object(10 * M, true)));
  s.set_app(new station.set_app_arguments(2, new station.app_object(10 * M, true)));
  signedBy([]); return s;
}
function buyPass(s: Station, buyer: Uint8Array, target: Uint8Array, mpd: u64, days: u64): station.buy_allowance_result {
  signedBy([buyer, target]); const r = s.buy_allowance(new station.buy_allowance_arguments(buyer, 2, target, mpd, days, USDT, 1000 * USD)); signedBy([]); return r;
}
function apOp(owner: Uint8Array): protocol.operation {
  const o = new protocol.operation();
  o.call_contract = new protocol.call_contract_operation(USDT, 0x74e21680, Protobuf.encode(new station.kcs_approve_args(owner, STATION, 1000 * USD), station.kcs_approve_args.encode));
  return o;
}
function buyPassOp(buyer: Uint8Array): protocol.operation {
  const o = new protocol.operation();
  o.call_contract = new protocol.call_contract_operation(STATION, 0x60422f5f, Protobuf.encode(new station.buy_allowance_arguments(buyer, 2, buyer, 1 * M, 1, USDT, 1000 * USD), station.buy_allowance_arguments.encode));
  return o;
}
function propose(s: Station, who: Uint8Array, a: station.guarded_action): u32 { signedBy([who]); const id = s.propose(new station.propose_arguments(who, a)).id; signedBy([]); return id; }
function refusedPropose(s: Station, who: Uint8Array, a: station.guarded_action, why: string): void {
  gS1 = s; gA1 = a; signedBy([who]); MockVM.commitTransaction();
  expect(() => { gS1!.propose(new station.propose_arguments(C1, gA1)); }).toThrow(why); signedBy([]);
}


// ───── RED TEAM THIEF round 2: model-based escrow fuzz with slot fee, other payers, suspensions, pause ─────
const SEED: u32 = 99001;
const STEPS: i32 = 200;
let rs: u32 = SEED;
function rnd(): u32 { let x = rs; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rs = x; return x; }
function pick(n: u32): u32 { return rnd() % n; }
const NB: i32 = 4;
const START: u64 = 1000 * USD;
let fB: Uint8Array[] = []; let fApp: Uint8Array[] = [];
let slotId: u32[] = [0, 0, 0, 0, 0, 0, 0, 0];      // slot 2b = b's pass on itself, 2b+1 = b's plan on app b
let nPurch: u32 = 0;
let fPaused = false; let fPausedAt: u64 = 0;
let susp: u32[] = [0, 0, 0, 0];
let paidBy: u64[] = [0, 0, 0, 0];
let nextPlayerF: i32 = 600;
function clockF(): u64 { return fPaused ? fPausedAt : NOW; }
function same(a: Uint8Array | null, b: Uint8Array | null): bool {
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false;
  return true;
}
function idxOf(w: Uint8Array | null): i32 { for (let i = 0; i < NB; i++) if (same(fB[i], w)) return i; return -1; }
function daysOf(k: u32): u64 { return k == 0 ? 1 : (k == 1 ? 7 : 30); }
function allow(s: Station, j: i32): station.allowance_object | null {
  if (slotId[j] == 0) return null;
  return s.get_allowance(new station.get_allowance_arguments(slotId[j])).allowance;
}
function openTerms(s: Station, a: station.allowance_object): i32 {
  let n = 0;
  for (let i = 0; i < a.purchase_ids.length; i++) { const e = s.get_escrow(new station.get_escrow_arguments(a.purchase_ids[i])).purchase; if (e != null && !e.closed) n++; }
  return n;
}
function check(s: Station, step: i32, what: string): void {
  const where = "seed " + SEED.toString() + " step " + step.toString() + " (" + what + ")";
  const t = s.get_escrow_totals(new station.get_escrow_totals_arguments(USDT)).totals!;
  expect(testGetToken(USDT, STATION)).toBe(t.held, "THIEF2-FZ: station balance != held at " + where);
  expect(t.collected).toBe(t.held + t.refunded + t.released, "THIEF2-FZ: collected != held + refunded + released at " + where);
  const amt: u64[] = [0, 0, 0, 0]; const ref: u64[] = [0, 0, 0, 0];
  let sAmt: u64 = 0, sRef: u64 = 0, sRel: u64 = 0;
  for (let id: u32 = 1; id <= nPurch; id++) {
    const e = s.get_escrow(new station.get_escrow_arguments(id)).purchase;
    expect(e != null).toBe(true, "THIEF2-FZ: purchase " + id.toString() + " missing at " + where);
    if (e == null) continue;
    const pid = "purchase " + id.toString();
    expect(e.refunded + e.released <= e.amount).toBe(true, "THIEF2-FZ: " + pid + " paid out more than it took at " + where);
    if (e.closed) expect(e.refunded + e.released).toBe(e.amount, "THIEF2-FZ: closed " + pid + " not fully settled at " + where);
    if (e.kind == 1) expect(e.refunded + e.slot_fee_per_day * e.days <= e.amount).toBe(true, "THIEF2-FZ: " + pid + " refunded " + e.refunded.toString() + " incl. slot fee for days held (" + e.days.toString() + " d) at " + where);
    const b = idxOf(e.buyer);
    expect(b >= 0).toBe(true, "THIEF2-FZ: " + pid + " has an unknown payer at " + where);
    if (b >= 0) { amt[b] += e.amount; ref[b] += e.refunded; }
    sAmt += e.amount; sRef += e.refunded; sRel += e.released;
  }
  expect(t.collected).toBe(sAmt, "THIEF2-FZ: totals.collected != sum of purchases at " + where);
  expect(t.refunded).toBe(sRef, "THIEF2-FZ: totals.refunded != sum of refunds at " + where);
  expect(t.released).toBe(sRel, "THIEF2-FZ: totals.released != sum of releases at " + where);
  expect(bal(OWNER)).toBe(sRel, "THIEF2-FZ: treasury (owner) balance != released at " + where);
  for (let b = 0; b < NB; b++) {
    expect(amt[b]).toBe(paidBy[b], "THIEF2-FZ: purchases recorded for payer " + b.toString() + " != what it paid at " + where);
    expect(bal(fB[b])).toBe(START - paidBy[b] + ref[b], "THIEF2-FZ: wallet " + b.toString() + " balance != start - paid + its refunds at " + where);
  }
}
describe("THIEF2 fuzz: escrow with slot fee, other payers, suspensions and pause always adds up", () => {
  it("seed 99001, 120 steps", () => {
    const s = setupWide();
    const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);
    const p = PRICE(); p.pass_min_purchase = 25_000_000; signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    for (let i = 0; i < NB; i++) { fB.push(user(700 + i)); fApp.push(user(800 + i)); testSetToken(USDT, fB[i], START); }
    let done = 0;
    for (let step = 0; step < STEPS; step++) {
      MockVM.clearEvents();
      const k = pick(14); const b = i32(pick(u32(NB))); const B = fB[b]; let what = "skip";
      if (k <= 2) {                                                                  // buy: pass (0, 1) or app plan (2)
        const kind: u32 = k == 2 ? 1 : 2; const j = 2 * b + (kind == 1 ? 1 : 0);
        const target = kind == 1 ? fApp[b] : B;
        const old = allow(s, j);
        const live = old != null && old.expiry > NOW;
        const days = daysOf(pick(3)); const mpd = u64(1 + pick(10)) * M;
        const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, mpd, days, kind, target));
        if (!fPaused && susp[b] == 0 && !live && q.available) {
          signedBy([B, target]);
          const r = s.buy_allowance(new station.buy_allowance_arguments(B, kind, target, mpd, days, USDT, q.price));
          signedBy([]); slotId[j] = r.id; paidBy[b] += r.paid; nPurch++; what = kind == 1 ? "buy_plan" : "buy_pass";
        }
      } else if (k <= 4) {                                                           // renew by a random payer
        const j = i32(pick(8)); const a = allow(s, j); const owner = j / 2; const days = daysOf(pick(3));
        if (a != null && !fPaused && susp[b] == 0 && susp[owner] == 0) {
          const start = a.expiry > NOW ? a.expiry : NOW;
          const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, a.mana_per_day, days, a.kind, a.target));
          if (start + days * DAYMS <= NOW + 90 * DAYMS && openTerms(s, a) < 7 && q.available) {
            signedBy([B]); const rn = s.renew(new station.renew_arguments(B, a.id, days, USDT, 1000 * USD)); signedBy([]);
            paidBy[b] += rn.paid; nPurch++; what = b == owner ? "renew_self" : "renew_other";
          }
        }
      } else if (k <= 6) {                                                           // buyer cancel
        const j = i32(pick(8)); const a = allow(s, j); const owner = j / 2;
        if (a != null && susp[owner] == 0 && a.expiry > clockF()) { cancelBy(s, fB[owner], a.id); what = "cancel"; }
      } else if (k == 7) {                                                           // owner refund
        const j = i32(pick(8)); const a = allow(s, j); const owner = j / 2;
        if (a != null && susp[owner] != 2) { signedBy([OWNER]); s.owner_refund(new station.owner_refund_arguments(a.id, null)); signedBy([]); what = "owner_refund"; }
      } else if (k == 8) {                                                           // suspend (any reason; 2 then 4 = reclassify)
        const reason: u32 = susp[b] == 2 && pick(2) == 0 ? <u32>4 : 1 + pick(4);
        signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(B, reason)); signedBy([]);
        susp[b] = reason; what = "suspend_" + reason.toString();
      } else if (k == 9) {
        if (susp[b] != 0) { signedBy([OWNER]); s.unsuspend_allowance(new station.unsuspend_allowance_arguments(B, 0)); signedBy([]); susp[b] = 0; what = "unsuspend"; }
      } else if (k == 10) {
        signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(!fPaused)); signedBy([]);
        if (!fPaused) fPausedAt = NOW;
        fPaused = !fPaused; what = fPaused ? "pause" : "unpause";
      } else if (k == 11 && nPurch > 0) {                                            // release
        const id = 1 + pick(nPurch); const g = s.get_escrow(new station.get_escrow_arguments(id));
        if (g.purchase != null && g.releasable && g.purchase!.kind == 1) {
          const pb = idxOf(g.purchase!.buyer);
          const al = s.get_allowance(new station.get_allowance_arguments(g.purchase!.allowance_id)).allowance;
          const ab = al != null ? idxOf(al.buyer) : -1;
          if ((pb < 0 || susp[pb] != 2) && (ab < 0 || susp[ab] != 2)) { s.release(new station.release_arguments(id)); what = "release"; }
        }
      } else if (k == 12) {                                                          // sponsored use (bool, never throws)
        const rc = u64(1 + pick(3)) * M;
        if (pick(2) == 0) { tx(B, rc, [op(OTHER, EP_PLAY)]); ok(s); what = "use_pass"; }
        else { const pl = user(nextPlayerF); nextPlayerF++; tx(pl, rc, [op(fApp[b], EP_PLAY)]); ok(s); what = "use_plan"; }
      } else {
        const t = pick(4); at(NOW + (t == 0 ? 60_000 : (t == 1 ? HOUR : (t == 2 ? 13 * HOUR : 3 * DAYMS)))); what = "time";
      }
      if (what != "skip") done++;
      check(s, step, what);
    }
    log<string>("seed " + SEED.toString() + ": " + done.toString() + " actions, " + nPurch.toString() + " purchases");
  });
});
