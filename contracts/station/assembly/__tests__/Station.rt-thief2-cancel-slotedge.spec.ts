/**
 * RED TEAM (THIEF, round 2), mana-station branch audit-fixes-1 commit dd5148d.
 * Attack "cancel-slotedge": Mana sponsored beyond what was paid, by combining the 6 h slot edge of the per-allowance
 * daily window (4 x 6 h slots aligned to absolute time, Station.ts passOk/decide) with a buyer cancel.
 *   1. buy_allowance(buyer=U1 signs, kind 2, target=U1, 10 Mana/day, 30 days) 60 s before a 6 h slot boundary
 *      (paid 85,000,000 = pass minimum 25,000,000 + 30 x 2,000,000 slot fee).
 *   2. authorize x6 (payee U1, rc 2 Mana, call OTHER): 10 Mana (the daily amount).
 *   3. 18 h later (still day 1 of the term) the first slot has left the window: authorize x6 again: 10 more Mana.
 *      AB-006's cap_total (300 Mana for the whole term) does not stop it.
 *   4. cancel_allowance(U1): the term is cut to the 1 day used; cap_total drops to 10 Mana but used_total is 20.
 *      U1 is charged one day (27,000,000 kept: 1-day price/minimum 25,000,000 + 1 slot fee), i.e. what an honest
 *      1-day 10-Mana pass costs, but got 20 Mana. Same with a kind-1 app plan (second test).
 * Claim attacked (ALLOWANCE_TERMS / LAUNCH.md AB-006): "Over a whole term the station never sponsors more than the daily
 * amount times the days paid."
 * This file asserts the SAFE behaviour: it FAILS while the attack works.
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
  expect(testGetToken(token, STATION)).toBe(t.held + t.owed);   // audit-2026-10 M-5: balance = held + owed
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


// ───── RED TEAM THIEF round 2: cancel after a slot-edge double burst ─────
const SLOT6H: u64 = 21_600_000;
function slotFeeAndPassMin(s: Station): void {
  const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);                  // proposed mainnet slot fee
  const p = PRICE(); p.pass_min_purchase = 25_000_000;                               // proposed mainnet pass minimum
  signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
}
function burstPass(s: Station, w: Uint8Array, n: i32): u64 {
  let used: u64 = 0;
  for (let i = 0; i < n; i++) { at(NOW + 3000); if (play(s, w, 2 * M, OTHER)) used += 2 * M; }
  return used;
}
let nextPlayer: i32 = 500;
function burstPlan(s: Station, app: Uint8Array, n: i32): u64 {
  let used: u64 = 0;
  for (let i = 0; i < n; i++) { at(NOW + 3000); const p = user(nextPlayer); nextPlayer++; if (play(s, p, 2 * M, app)) used += 2 * M; }
  return used;
}
describe("THIEF2 cancel-slotedge: a cancel after a slot-edge double burst keeps 2 days of Mana for 1 day's charge", () => {
  it("Mana pass: after a buyer cancel, sponsored Mana <= mana_per_day x days charged", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H;                                         // next 6 h boundary
    at(edge - 60_000);
    const r = buyPass(s, U1, U1, 10 * M, 30);
    expect(r.paid).toBe(85_000_000, "setup: 25,000,000 pass minimum + 30 x 2,000,000 slot fee");
    let used = burstPass(s, U1, 6);
    expect(used).toBe(10 * M, "setup: first burst = the daily amount");
    at(edge + 3 * SLOT6H + 1000);                                                    // 18 h + 61 s after purchase
    used += burstPass(s, U1, 6);
    const b0 = bal(U1);
    cancelBy(s, U1, r.id);
    const back = bal(U1) - b0;
    used += burstPass(s, U1, 3);                                                     // rest of the paid day
    const a = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!;
    const e = s.get_escrow(new station.get_escrow_arguments(a.purchase_ids[0])).purchase!;
    log<string>("pass: paid " + r.paid.toString() + ", refunded " + back.toString() + ", kept " + (r.paid - back).toString() + ", sponsored " + used.toString());
    expect(used).toBeLessThanOrEqual(10 * M * e.days, "THIEF2-CS: a cancelled 10 Mana/day pass charged for 1 day sponsored " + used.toString() + " Mana units (> 1,000,000,000)");
    expect(a.used_total <= a.cap_total).toBe(true, "THIEF2-CS: used_total " + a.used_total.toString() + " above cap_total " + a.cap_total.toString() + " after the cancel");
    // audit-fixes-1 (AB-028): was a setup check (toBe(1), the old 1-day charge, which is the bug this test proves). With 20
    // Mana used before the cancel the fix charges 2 days; checked here, after the attack assertions, so those fail first.
    expect(e.days).toBe(2, "the cancel charged the 2 days of Mana used (term cut to 2 days)");
    inv(s, USDT);
  });
  it("App plan: after a buyer cancel, sponsored Mana <= mana_per_day x days charged", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H;
    at(edge - 60_000);
    const r = buyAccount(s, SOLDAPP, 10 * M, 30);
    expect(r.paid).toBe(60_750_000, "setup: 750,000 Mana price + 30 x 2,000,000 slot fee");
    let used = burstPlan(s, SOLDAPP, 6);
    expect(used).toBe(10 * M, "setup: first burst = the daily amount");
    at(edge + 3 * SLOT6H + 1000);
    used += burstPlan(s, SOLDAPP, 6);
    const b0 = bal(BUYER);
    cancelBy(s, BUYER, r.id);
    const back = bal(BUYER) - b0;
    used += burstPlan(s, SOLDAPP, 3);
    const a = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!;
    const e = s.get_escrow(new station.get_escrow_arguments(a.purchase_ids[0])).purchase!;
    log<string>("plan: paid " + r.paid.toString() + ", refunded " + back.toString() + ", kept " + (r.paid - back).toString() + ", sponsored " + used.toString());
    expect(used).toBeLessThanOrEqual(10 * M * e.days, "THIEF2-CS: a cancelled 10 Mana/day app plan charged for 1 day sponsored " + used.toString() + " Mana units (> 1,000,000,000)");
    expect(e.days).toBe(2, "the 2 days of Mana used are charged (audit-fixes-1, AB-028; was a setup check toBe(1))");
    inv(s, USDT);
  });
});
