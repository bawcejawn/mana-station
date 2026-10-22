/**
 * RED TEAM (THIEF): refund bounds, double refunds and other people's escrow.
 * Attacks (each expected to be BLOCKED):
 *  1. Third party U1 prepays a renewal of BUYER's allowance; BUYER cancels hoping the renewal refund comes to BUYER,
 *     or U1 tries to cancel/release; release of a future term before it starts.
 *  2. Cancel -> renew -> cancel -> cancel loop: refunds never exceed what was paid, escrow invariant holds.
 *  3. Big-upload ticket: cancel at once (fee kept), then cancel / close_ticket / owner_refund-like second settle.
 *     Use all ticket Mana in one tx, then cancel: refund 0.
 *  4. Pause: cancel during a pause (frozen clock), unpause, cancel again: no second refund.
 *  5. A stranger's buy sweeps someone else's expired ticket: nothing goes to the stranger.
 * This file asserts the SAFE behaviour: it fails if the bug exists.
 */
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

let gX: Uint8Array | null = null;
describe("THIEF: refunds never exceed payment, never go to the wrong wallet, never twice", () => {
  it("1. a renewal paid by someone else is refunded to that payer, not to the allowance buyer", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 1);                                    // BUYER pays 30,000
    signedBy([U1]); s.renew(new station.renew_arguments(U1, r.id, 7, USDT, 1000 * USD)); signedBy([]); // U1 pays 200,000 (future term)
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(2)); }).toThrow("SAFE: future term can't be released before it ends");
    signedBy([U1]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(U1, 1)); }).toThrow("SAFE: renewal payer is not the allowance buyer"); signedBy([]);
    at(T + 2 * HOUR);
    cancelBy(s, BUYER, r.id);
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - 30_000, "SAFE: BUYER gets none of U1's money");
    expect(testGetToken(USDT, U1)).toBe(1000 * USD, "SAFE: U1's unstarted renewal goes back to U1");
    inv(s, USDT);
  });
  it("2. cancel / renew / cancel / cancel never refunds more than paid", () => {
    const s = setup(); const T = NOW;
    const b0 = testGetToken(USDT, U1);
    signedBy([U1]); const r = s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 10 * M, 30, USDT, 1000 * USD)); signedBy([]);
    at(T + HOUR); cancelBy(s, U1, r.id);
    signedBy([U1]); s.renew(new station.renew_arguments(U1, r.id, 30, USDT, 1000 * USD)); signedBy([]); // future term from end of day 1
    at(T + 2 * HOUR); cancelBy(s, U1, r.id);
    const again = cancelBy(s, U1, r.id).refund;
    expect(again).toBe(0, "SAFE: third cancel refunds nothing");
    const paid: u64 = 750_000 * 2;
    const refunded = testGetToken(USDT, U1) + paid - b0;
    expect(refunded).toBeLessThanOrEqual(paid, "SAFE: refunds <= payments");
    expect(testGetToken(USDT, U1)).toBeLessThan(b0, "SAFE: the thief is never ahead");
    inv(s, USDT);
    at(T + DAYMS);
    s.release(new station.release_arguments(1));
    inv(s, USDT);
    expect(testGetToken(USDT, U1) + testGetToken(USDT, OWNER)).toBe(b0, "SAFE: no value created");
  });
  it("3. ticket: one refund only, fee kept; all Mana used -> no refund", () => {
    const s = setup(); gS = s;
    signedBy([BUYER]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); // 500,000
    expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(475_000, "SAFE: immediate cancel keeps the 5% fee");
    MockVM.commitTransaction(); expect(() => { gS!.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)); }).toThrow("SAFE: no second cancel");
    signedBy([]);
    MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(U1)); }).toThrow("SAFE: no settle after cancel");
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - 25_000, "SAFE: exactly the fee lost");
    inv(s, USDT);
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(NOW + 3000); tx(U2, 100 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true, "ticket spends all 100 Mana in one tx");
    signedBy([B2]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(B2, U2)).refund).toBe(0, "SAFE: used-up ticket refunds nothing"); signedBy([]);
    expect(testGetToken(USDT, B2)).toBe(10 * USD - 500_000);
    inv(s, USDT);
  });
  it("4. cancel during a pause, unpause, cancel again: one refund", () => {
    const s = setup(); const T = NOW;
    signedBy([U1]); const r = s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 10 * M, 7, USDT, 1000 * USD)); signedBy([]);
    at(T + HOUR); signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    at(T + 3 * DAYMS);
    const r1 = cancelBy(s, U1, r.id).refund;
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    at(NOW + HOUR);
    const r2 = cancelBy(s, U1, r.id).refund;
    expect(r1 + r2).toBeLessThanOrEqual(171_428, "SAFE: at most 6 of 7 days back once");
    inv(s, USDT);
  });
  it("5. a stranger's buy sweeps an expired ticket: buyer gets 0, treasury gets the price, stranger gets nothing", () => {
    const s = setup(); const T = NOW;
    signedBy([BUYER]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(T + 3 * DAYMS + 1000);
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD); gX = B2;
    signedBy([B2]); const p = s.buy_allowance(new station.buy_allowance_arguments(B2, 2, B2, 5 * M, 1, USDT, 1000 * USD)); signedBy([]);
    expect(testGetToken(USDT, B2)).toBe(10 * USD - p.paid, "SAFE: stranger pays its own price, receives nothing");
    expect(testGetToken(USDT, OWNER)).toBe(500_000, "full lock released to the treasury");
    expect(s.get_ticket(new station.get_ticket_arguments(U1)).ticket).toBeNull();
    inv(s, USDT);
  });
});
