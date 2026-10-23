/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
import { station } from "../proto/station";
import { clearRevert, revertedWith } from "./lib/revert";   // AB-031 (audit-fixes-1)

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
let gC: station.config_object | null = null;
let gA: station.guarded_action | null = null;
let gP: station.price_object | null = null;
function countEv(name: string): i32 { let k = 0; const ev = MockVM.getEvents(); for (let i = 0; i < ev.length; i++) if (ev[i].name == name) k++; return k; }

describe("v1 rules still hold", () => {
  it("approved call sponsored; transfers, unknown contracts/entry points, uploads, over-cap refused", () => {
    const s = setup();
    expect(play(s, U1)).toBe(true);
    at(NOW + 70_000);
    tx(U1, 2 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(false);
    tx(U1, 2 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(false);
    tx(U1, 2 * M, [op(KNODE, EP_NOPE)]); expect(ok(s)).toBe(false);
    tx(U1, 3 * M + 1, [op(KNODE, EP_PLAY)]); expect(ok(s)).toBe(false);
    tx(U1, 2 * M + 1, [op(KNODE, EP_HEAVY)]); expect(ok(s)).toBe(false);
    tx(U1, 2 * M, [op(KNODE, EP_PLAY), op(STORIES, EP_PLAY)]); expect(ok(s)).toBe(false);
    const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(U1, new Uint8Array(4));
    tx(U1, 2 * M, [up]); expect(ok(s)).toBe(false);
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_call)).value).toBe(false);
    tx(U1, 2 * M, [op(KNODE, EP_HEAVY)]); expect(ok(s)).toBe(true);
  });
  it("1 per block, 5 per minute then cooldown stored by the accepted tx", () => {
    const s = setup(); at(T0 + 60_000 * 100);
    expect(play(s, U1)).toBe(true); expect(play(s, U1)).toBe(false);
    for (let i = 0; i < 4; i++) { at(NOW + 3000); expect(play(s, U1)).toBe(true); }
    const u = s.get_user(new station.get_user_arguments(U1)).user!;
    expect(u.cooldown_from).toBe(NOW);                                      // AB-024: the start; the length is the config's
    expect(u.cooldown_until).toBe(0);                                       // no longer written
    at(NOW + 120_000); expect(play(s, U1)).toBe(false);
    at(u.cooldown_from + 600_000 - 1); expect(play(s, U1)).toBe(false);
    at(u.cooldown_from + 600_000); expect(play(s, U1)).toBe(true);
  });
  it("allowance spending never goes below admin_min", () => {
    const s = setup();
    testSetMana(5 * M + 2 * M - 1); expect(play(s, U1)).toBe(false);
    testSetMana(5 * M + 2 * M); expect(play(s, U1)).toBe(true);
  });
});

describe("budget: 20% of koin_amount per rolling 24 h; hard app allowances", () => {
  it("option A: Knode stops at its reservation; Stories unaffected; frees after 24 h", () => {
    const s = setupA(); let n = 0;
    for (let i = 0; i < 70; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    expect(n).toBe(60);                                                     // 100 reserved + 20 buffer (20%) from the reserve
    expect(s.get_app(new station.get_app_arguments(1)).allowance).toBe(100 * M);
    expect(play(s, user(200), 2 * M, STORIES)).toBe(true);
    at(NOW + DAYMS + 2 * HOUR); expect(play(s, user(300))).toBe(true);
  });
  it("buffer: a reserved exempt app may go 20% over (80 → 96) from the reserve, with an event; not in the 20% cap", () => {
    const s = setup(); let n = 0;
    let found = 0;                                                          // count + clear per tx (MockVM's event list breaks past ~9 events)
    for (let i = 0; i < 60; i++) { at(NOW + 3000); MockVM.clearEvents(); if (play(s, user(i))) n++; found += countEv("station.buffer_used"); }
    expect(n).toBe(48);                                                     // 80 + 16 = 96 Mana
    expect(found).toBe(8);                                                  // one per buffer tx
    const st = s.get_status(new station.get_status_arguments());
    expect(st.used_24h).toBe(80 * M); expect(st.buffer_used_24h).toBe(16 * M);
    const r = buyAccount(s, U2, 40 * M, 7);                                  // the whole sellable slice is sold
    expect(r.id).toBe(1);
    let m = 0;                                                              // the paid allowance is untouched by the buffer
    for (let i = 0; i < 25; i++) { at(NOW + 70_000); tx(user(100 + i), 2 * M, [op(U2, EP_PLAY)]); if (ok(s)) m++; } // many users of the paying app
    expect(m).toBe(20);                                                     // 40/day exactly: paid = hard cap, no buffer
    at(NOW + DAYMS + 2 * HOUR); expect(play(s, user(300))).toBe(true);    // no debt: next day is a full allowance again
    expect(s.get_status(new station.get_status_arguments()).sold_capacity).toBe(40 * M);
  });
  it("buffer never touches the hard floor (admin_min + budget); buffer % is owner-configurable", () => {
    const s = setup(); gS = s;
    for (let i = 0; i < 40; i++) { at(NOW + 3000); play(s, user(i)); }     // reservation full (80)
    testSetMana(205 * M + 2 * M - 1);
    at(NOW + 3000); expect(play(s, user(50))).toBe(false);                 // buffer would dip below 205
    testSetMana(205 * M + 2 * M);
    at(NOW + 3000); expect(play(s, user(51))).toBe(true);
    testSetMana(1000 * M);
    signedBy([OWNER]); const c = cfg(); c.buffer_bp = 0; s.set_config(new station.set_config_arguments(c));
    const c2 = cfg(); c2.buffer_bp = 6000; gC = c2;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // > 50%
    signedBy([U1]);
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // owner only
    signedBy([]);
    at(NOW + 3000); expect(play(s, user(52))).toBe(false);                 // 0% buffer: stops at 82 > 80
  });
  it("reserve_low event once per dip below the alert level; re-armed after recovery", () => {
    const s = setup();
    expect(s.get_status(new station.get_status_arguments()).alert_level).toBe(600 * M);
    testSetMana(601 * M); expect(play(s, U1)).toBe(true); expect(countEv("station.reserve_low")).toBe(1);
    at(NOW + 3000); testSetMana(599 * M); expect(play(s, U2)).toBe(true); expect(countEv("station.reserve_low")).toBe(1);   // no repeat
    at(NOW + 3000); testSetMana(900 * M); expect(play(s, user(1))).toBe(true);                       // recovered
    at(NOW + 3000); testSetMana(600 * M); expect(play(s, user(2))).toBe(true); expect(countEv("station.reserve_low")).toBe(2);
  });
  it("only the owner can exceed it, with an explicit expiring boost", () => {
    const s = setupA();
    for (let i = 0; i < 60; i++) { at(NOW + 3000); play(s, user(i)); }        // 100 + 20 buffer
    at(NOW + 3000); expect(play(s, user(99))).toBe(false);
    signedBy([U1]);
    gS = s; MockVM.commitTransaction(); expect(() => { gS!.set_app(new station.set_app_arguments(1, new station.app_object(100 * M, true, 20 * M, NOW + HOUR))); }).toThrow();
    signedBy([OWNER]); s.set_app(new station.set_app_arguments(1, new station.app_object(100 * M, true, 20 * M, NOW + HOUR))); signedBy([]);
    at(NOW + 3000); expect(play(s, user(99))).toBe(true);
    at(NOW + 2 * HOUR); expect(play(s, user(98))).toBe(false);              // boost expired: 122 + 2 > 120
  });
  it("reservations can't exceed the 20% budget; adding KOIN creates a sellable slice, reservations unchanged", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.set_app(new station.set_app_arguments(1, new station.app_object(130 * M, true, 0, 0))); }).toThrow(); // 130 + 80 > 200
    const c = cfg(); c.koin_amount = 2000 * M; gC = c;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow();  // above the KOIN balance
    testSetBalance(2000 * M); s.set_config(new station.set_config_arguments(c));
    expect(s.get_app(new station.get_app_arguments(1)).allowance).toBe(80 * M);   // reservation unchanged
    expect(s.get_status(new station.get_status_arguments()).daily_budget).toBe(400 * M);
    expect(s.get_status(new station.get_status_arguments()).sold_capacity).toBe(240 * M); // derived: 400 − 160
    expect(s.get_status(new station.get_status_arguments()).reserve_floor).toBe(1600 * M); // 80%
    const c2 = cfg(); c2.refill_bp = 2500; gC = c2;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // above one day's refill
    signedBy([]);
  });
});

describe("sold allowances (prepaid in vUSDT)", () => {
  it("option A: reservations take the whole budget → nothing to sell, no big uploads; adding KOIN opens a slice", () => {
    const s = setupA(); gS = s;
    expect(s.get_status(new station.get_status_arguments()).sold_capacity).toBe(0);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7));
    expect(q.available).toBe(false); expect(q.reason!).toBe("sold capacity full");
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 100 * M)).reason!).toBe("no repayment capacity (sellable slice is 0)");
    signedBy([BUYER, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    // Carl adds 500 KOIN and raises koin_amount within the balance: budget 300, reservations still 100 + 100, sellable 100.
    testSetBalance(1500 * M);
    signedBy([OWNER]); const c = cfg(); c.koin_amount = 1500 * M; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    expect(s.get_status(new station.get_status_arguments()).sold_capacity).toBe(100 * M);
    expect(s.get_app(new station.get_app_arguments(1)).allowance).toBe(100 * M);
    expect(buyAccount(s, U2, 50 * M, 1).id).toBe(1);
  });
  it("account allowance: paid, sponsors the payee, capped per day, cut off at expiry, renewable", () => {
    const s = setup();
    const r = buyAccount(s, U2, 10 * M, 7);
    expect(r.paid).toBe(200_000);                                             // 10/1,000 × 0.20 vUSDT
    expect(testGetToken(USDT, STATION)).toBe(r.paid);                         // held in the station's escrow
    expect(testGetToken(USDT, OWNER)).toBe(0);
    let n = 0;
    for (let i = 0; i < 8; i++) { at(NOW + 70_000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); if (ok(s)) n++; }
    expect(n).toBe(5);                                                        // 10 Mana/day
    expect(s.get_app(new station.get_app_arguments(1)).used_24h).toBe(0);     // never touches Carl's apps
    at(r.expiry + 1); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false);  // auto cut-off
    signedBy([BUYER]); s.renew(new station.renew_arguments(BUYER, r.id, 1, USDT, 1000 * USD)); signedBy([]);
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);
  });
  it("app allowance: any user of the bought contract, with per-user limits", () => {
    const s = setup();
    signedBy([BUYER, SOLDAPP]); s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, SOLDAPP, 20 * M, 7, USDT, 1000 * USD)); signedBy([]);
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(true);
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(false);                     // same block
    at(NOW + 3000); expect(play(s, user(2), 2 * M, SOLDAPP)).toBe(true);
  });
  it("sold slice is a hard cap; quotes, per-purchase max, legacy token, signer checks", () => {
    const s = setup(); gS = s;
    buyAccount(s, U1, 30 * M, 1);
    signedBy([BUYER, U1, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 11 * M, 1, USDT, 1000 * USD)); }).toThrow(); // 30+11 > 40
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 1, USDT, 1)); }).toThrow();          // over max_price
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 1, USDC, 1000 * USD)); }).toThrow(); // USDC not priced
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U1, 5 * M, 1, USDT, 1000 * USD)); }).toThrow(); // target already has one
    signedBy([U2]);                                                          // target signs, buyer doesn't
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 5 * M, 1, USDT, 1000 * USD)); }).toThrow(); // buyer must sign
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.set_price(new station.set_price_arguments(LEGACY, new station.price_object(true, USD, 1, 1, 1, 1, 0))); }).toThrow();
    s.set_price(new station.set_price_arguments(USDT, new station.price_object(true, 500_000, 3_000_000, 20_000_000, 75_000_000, 5_000_000, 50 * M))); // $0.005 max
    signedBy([]);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 30));               // 750,000 > 500,000
    expect(q.reason!).toBe("above the per-purchase maximum");
  });
});

describe("introductory prices: tiers, snapshots, no auto-renew", () => {
  it("price snapshot on purchase; a price change leaves existing terms alone; renew uses the current price", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, U2, 10 * M, 7);
    let a = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!;
    expect(a.unit_price).toBe(20_000_000); expect(a.paid).toBe(200_000); expect(a.term_days).toBe(7);
    expect(a.total_paid).toBe(200_000); expect(a.term_start).toBe(NOW);
    const bal = testGetToken(USDT, BUYER); const exp = r.expiry;
    const p = PRICE(); p.price_7d = 40_000_000;                                 // owner doubles the 7-day price
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    a = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!;
    expect(a.unit_price).toBe(20_000_000); expect(a.paid).toBe(200_000); expect(a.expiry).toBe(exp);
    expect(testGetToken(USDT, BUYER)).toBe(bal);                                // nothing charged afterwards
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true); // term still served
    expect(buyAccount(s, U1, 10 * M, 7).paid).toBe(400_000);                    // new purchase: new price
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 7, USDT, 200_000)); }).toThrow(); // old price not honoured for a renewal
    MockVM.clearEvents();                                                       // MockVM event list breaks past ~9 events
    const rr = s.renew(new station.renew_arguments(BUYER, r.id, 7, USDT, 1000 * USD)); signedBy([]);
    expect(rr.paid).toBe(400_000); expect(rr.unit_price).toBe(40_000_000); expect(rr.expiry).toBe(exp + 7 * DAYMS);
    a = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!;
    expect(a.term_start).toBe(exp); expect(a.unit_price).toBe(40_000_000); expect(a.total_paid).toBe(600_000);
    expect(MockVM.getEvents()[MockVM.getEvents().length - 1].name).toBe("station.allowance_renewed");
  });
  it("only 1, 7 and 30 day terms; a tier priced 0 is not offered", () => {
    const s = setup(); gS = s;
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1000 * M, 1)).price).toBe(3_000_000);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1000 * M, 30)).price).toBe(75_000_000);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 2)).reason!).toBe("days must be 1, 7 or 30");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 14)).reason!).toBe("days must be 1, 7 or 30");
    signedBy([BUYER, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 3, USDT, 1000 * USD)); }).toThrow();
    const p = PRICE(); p.price_30d = 0;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 30)).reason!).toBe("days must be 1, 7 or 30");
  });
  it("big-upload minimum enforced; mainnet minimum 5,000 Mana = 25,000,000", () => {
    const s = setup(); gS = s;
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 49 * M)).reason!).toBe("below the big-upload minimum");
    signedBy([BUYER, U1]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 49 * M, USDT, 1000 * USD, false)); }).toThrow();
    const t = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 50 * M, USDT, 1000 * USD, false));
    expect(t.paid).toBe(250_000);
    expect(s.get_ticket(new station.get_ticket_arguments(U1)).ticket!.paid).toBe(250_000); // snapshot
    const p = PRICE(); p.big_min_mana = 5000 * M;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p));
    const c = cfg(); c.big_max = 6000 * M; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 4999 * M)).reason!).toBe("below the big-upload minimum");
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 5000 * M)).price).toBe(25_000_000);
  });
  it("no auto-renew: expiry just ends service, nothing is charged, only the payer can renew", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, U2, 10 * M, 1);
    const bal = testGetToken(USDT, BUYER); const rev = testGetToken(USDT, OWNER);
    at(r.expiry + 40 * DAYMS);
    tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry).toBe(r.expiry);
    expect(testGetToken(USDT, BUYER)).toBe(bal); expect(testGetToken(USDT, OWNER)).toBe(rev);
    signedBy([U1]);                                                              // someone else can't renew on the buyer's tokens
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([OWNER]);                                                           // nor the owner
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([]);
    expect(testGetToken(USDT, BUYER)).toBe(bal);
  });
});

describe("per-buyer suspend switch (Carl, 7:37 PM)", () => {
  it("suspended buyer refused (allowance + big ticket), others unaffected, unsuspend restores, no money moves, no extension", () => {
    const s = setup(); gS = s;
    const B2 = user(77), T2 = user(78);
    testSetToken(USDT, B2, 10 * USD);
    const r = buyAccount(s, U2, 10 * M, 7);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false));
    signedBy([B2, T2]); s.buy_allowance(new station.buy_allowance_arguments(B2, 1, T2, 10 * M, 7, USDT, 1000 * USD)); signedBy([]);
    at(NOW + 3000); tx(U1, 10 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);    // ticket started (audit #2: unused ones lapse after 1 h)
    at(NOW + 62 * HOUR);                                                         // big-upload debt (100 at 40/day) repaid; ticket valid 72 h
    const bal = testGetToken(USDT, BUYER), bal2 = testGetToken(USDT, B2), own = testGetToken(USDT, OWNER), sta = testGetToken(USDT, STATION);
    MockVM.clearEvents();
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 2)); signedBy([]);
    const ev = MockVM.getEvents(); expect(ev[ev.length - 1].name).toBe("station.buyer_suspended");
    const se = Protobuf.decode<station.suspend_event>(ev[ev.length - 1].data!, station.suspend_event.decode);
    expect(se.reason).toBe(2); expect(se.suspended).toBe(true);
    expect(s.get_suspension(new station.get_suspension_arguments(BUYER)).suspension!.reason).toBe(2);
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false);      // allowance refused
    at(NOW + 3000); tx(U1, 50 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(false);     // big ticket refused
    at(NOW + 3000); tx(T2, 2 * M, [op(T2, EP_PLAY)]); expect(ok(s)).toBe(true);       // other buyer unaffected
    at(NOW + 3000); expect(play(s, user(5))).toBe(true);                                 // Carl's apps unaffected
    signedBy([BUYER, user(90), user(91)]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, user(90), 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 1, USDT, 1000 * USD)); }).toThrow();
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(91), 100 * M, USDT, 1000 * USD, false)); }).toThrow();
    signedBy([]);
    expect(testGetToken(USDT, BUYER)).toBe(bal); expect(testGetToken(USDT, B2)).toBe(bal2);  // no token movement
    expect(testGetToken(USDT, OWNER)).toBe(own); expect(testGetToken(USDT, STATION)).toBe(sta);
    MockVM.clearEvents();
    signedBy([OWNER]); s.unsuspend_allowance(new station.unsuspend_allowance_arguments(BUYER, 0)); signedBy([]);
    expect(MockVM.getEvents()[MockVM.getEvents().length - 1].name).toBe("station.buyer_unsuspended");
    expect(s.get_suspension(new station.get_suspension_arguments(BUYER)).suspension).toBeNull();
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);       // restored
    at(NOW + 3000); tx(U1, 50 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry).toBe(r.expiry); // not extended
    expect(testGetToken(USDT, BUYER)).toBe(bal);
  });
  it("owner only; reason codes checked", () => {
    const s = setup(); gS = s;
    signedBy([U1]);
    MockVM.commitTransaction(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 1)); }).toThrow();
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(U2, 1)); }).toThrow();
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 0)); }).toThrow();
    MockVM.commitTransaction(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 5)); }).toThrow();
    MockVM.commitTransaction(); expect(() => { gS!.unsuspend_allowance(new station.unsuspend_allowance_arguments(BUYER, 0)); }).toThrow(); // not suspended
    s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 1));
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.unsuspend_allowance(new station.unsuspend_allowance_arguments(BUYER, 0)); }).toThrow(); // buyer can't lift it
    signedBy([]);
    expect(s.get_suspension(new station.get_suspension_arguments(BUYER)).suspension!.reason).toBe(1);
  });
});

describe("escrow and pro-rata refunds (Carl, 7:47 PM)", () => {
  it("cancel on day 0: 1 day charged at the 1-day price (AB-010), the rest refunded; served to the end of day 1; released once after", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);                                    // 200,000 held
    at(T + HOUR);
    const c = cancelBy(s, BUYER, r.id);
    expect(c.refund).toBe(170_000);                                            // 200,000 − 1 day × 30,000 (< floor(200,000 × 6 / 7))
    expect(c.expiry).toBe(T + DAYMS);
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - 200_000 + 170_000);
    inv(s, USDT); expect(testGetToken(USDT, STATION)).toBe(30_000);
    at(T + DAYMS - 1000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);   // paid day still served
    at(T + DAYMS); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false);
    signedBy([BUYER]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, 1)); }).toThrow(); signedBy([]); // already ended
    expect(s.release(new station.release_arguments(1)).amount).toBe(30_000);
    expect(testGetToken(USDT, OWNER)).toBe(30_000);
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow();  // never twice
    expect(testGetToken(USDT, BUYER) + testGetToken(USDT, OWNER)).toBe(1000 * USD);           // no value created or lost
    inv(s, USDT);
  });
  it("last day refunds 0; after expiry nothing to cancel; release before the end refused even for the owner", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow(); signedBy([]);
    at(T + 6 * DAYMS + HOUR);
    const c = cancelBy(s, BUYER, r.id);
    expect(c.refund).toBe(0); expect(c.expiry).toBe(T + 7 * DAYMS);
    at(T + 7 * DAYMS);
    signedBy([BUYER]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, 1)); }).toThrow(); signedBy([]);
    expect(s.release(new station.release_arguments(1)).amount).toBe(200_000);
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow();
    inv(s, USDT); expect(testGetToken(USDT, STATION)).toBe(0);
  });
  it("renewed future term is refunded in full; only the buyer can cancel; a suspended buyer can't self-cancel", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 1);                                    // 30,000
    signedBy([BUYER]); s.renew(new station.renew_arguments(BUYER, r.id, 7, USDT, 1000 * USD)); signedBy([]); // 200,000 from T+1d
    signedBy([U1]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(U1, 1)); }).toThrow(); // not yours
    signedBy([U1]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, 1)); }).toThrow(); // must sign
    at(T + 2 * HOUR);
    const c = cancelBy(s, BUYER, r.id);
    expect(c.refund).toBe(200_000); expect(c.expiry).toBe(T + DAYMS);
    inv(s, USDT);
    at(T + DAYMS);
    expect(s.release(new station.release_arguments(1)).amount).toBe(30_000);
    expect(s.get_escrow(new station.get_escrow_arguments(2)).purchase!.closed).toBe(true); // review C1: closed at cancel time
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(2)); }).toThrow();
    expect(testGetToken(USDT, OWNER)).toBe(30_000); inv(s, USDT);
    const r2 = buyAccount(s, U1, 10 * M, 7);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 1)); signedBy([]);
    signedBy([BUYER]); MockVM.commitTransaction(); expect(() => { gS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, 2)); }).toThrow(); signedBy([]);
    expect(r2.id).toBe(2);
  });
  it("double-spend style sequence: cancel, owner refund, cancel again, release, release again never pays more than paid", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 3 * M, 7);                                     // ceil(3 × 20,000,000 / 1,000) = 60,000
    expect(r.paid).toBe(60_000);
    at(T + DAYMS + HOUR);                                                      // day 2
    expect(cancelBy(s, BUYER, r.id).refund).toBe(42_000);                      // AB-010: 60,000 − 2 days × 9,000
    signedBy([OWNER]); expect(s.owner_refund(new station.owner_refund_arguments(r.id, null)).refund).toBe(0); signedBy([]);
    expect(cancelBy(s, BUYER, r.id).refund).toBe(0);                          // second cancel: nothing left to refund
    expect(testGetToken(USDT, STATION)).toBe(18_000); inv(s, USDT);
    at(T + 2 * DAYMS);
    expect(s.release(new station.release_arguments(1)).amount).toBe(18_000);
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow();
    signedBy([OWNER]); expect(s.owner_refund(new station.owner_refund_arguments(r.id, null)).refund).toBe(0); signedBy([]);
    expect(testGetToken(USDT, BUYER) + testGetToken(USDT, OWNER)).toBe(1000 * USD);
    expect(s.get_escrow(new station.get_escrow_arguments(1)).purchase!.closed).toBe(true);
    inv(s, USDT);
  });
  it("big upload: early cancel = time refund, capped at the unused-Mana share; a full lock refunds nothing (Carl, 8:19 PM)", () => {
    const s = setup(); gS = s;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]); // 500,000
    tx(U1, 10 * M + 50_000_000, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true); // used 10.5 Mana
    signedBy([U2]); MockVM.commitTransaction(); expect(() => { gS!.cancel_big_upload(new station.cancel_big_upload_arguments(U2, U1)); }).toThrow(); // not yours
    signedBy([BUYER]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(447_500); signedBy([]); // 89.5%: used share 10.5% > 5% fee
    expect(testGetToken(USDT, OWNER)).toBe(52_500);                           // exactly the used 10.5 Mana, released at settlement
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(10 * M + 50_000_000); // only the Mana actually used stays as debt
    expect(s.get_ticket(new station.get_ticket_arguments(U1)).ticket).toBeNull();
    inv(s, USDT);
    at(NOW + DAYMS + 1000);
    signedBy([BUYER, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    tx(U2, 50 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);           // used 50
    MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(U2)); }).toThrow(); // still valid
    at(NOW + 3 * DAYMS);
    const x = s.close_ticket(new station.close_ticket_arguments(U2));          // anyone, after expiry
    expect(x.refund).toBe(0); expect(x.released).toBe(500_000);                // full lock delivered: no refund (was: unused share back)
    expect(testGetToken(USDT, BUYER) + testGetToken(USDT, OWNER)).toBe(1000 * USD);
    inv(s, USDT);
  });
  it("suspension (AB-001): reasons 1, 3, 4 refund the unused share at once; sanctions (2) freeze refund and release", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 2));
    expect(testGetToken(USDT, STATION)).toBe(200_000);                         // sanctions: nothing moves
    MockVM.commitTransaction(); expect(() => { gS!.owner_refund(new station.owner_refund_arguments(1, null)); }).toThrow(); signedBy([]);
    at(T + 7 * DAYMS);
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow();  // frozen
    at(T + HOUR);                                                              // (clock back: test only) false match found
    const before = testGetToken(USDT, BUYER);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 4));   // reclassified: refunded now
    expect(testGetToken(USDT, BUYER) - before).toBe(171_428);                 // 6 unused days pro rata, no minimum kept
    expect(s.owner_refund(new station.owner_refund_arguments(r.id, null)).refund).toBe(0); signedBy([]); // nothing left
    expect(testGetToken(USDT, OWNER)).toBe(0);                                 // a refund never pays the owner
    inv(s, USDT);
    // abuse: the ticket's unexpired, unused share comes back at once (no fee); the owner keeps only what was served
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD); const X = NOW;
    signedBy([B2, user(78)]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, user(78), 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(X + 3000); tx(user(78), 50 * M, [op(user(78), EP_PLAY)]); expect(ok(s)).toBe(true); // half the Mana used
    at(X + 18 * HOUR);                                                          // 54 h of the 72 h lock left
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(B2, 1)); signedBy([]);
    expect(testGetToken(USDT, B2)).toBe(10 * USD - 500_000 + 187_500);        // 500,000 × 54/72 × 50/100
    expect(testGetToken(USDT, OWNER)).toBe(312_500);                           // only what was served is released
    expect(s.get_ticket(new station.get_ticket_arguments(user(78))).ticket).toBeNull();
    at(NOW + 3 * DAYMS + 1000);
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(user(78))); }).toThrow(); signedBy([]); // settled already
    inv(s, USDT);
  });
  it("cancel during a pause uses the frozen clock; unpause credits the remaining paid day", () => {
    const s = setup(); const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);
    at(T + HOUR); signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    at(T + 3 * DAYMS);                                                         // 3 days later, still paused
    expect(cancelBy(s, BUYER, r.id).refund).toBe(170_000);                    // still day 1 (AB-010: 1 day at 30,000)
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    const exp = s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry;
    expect(exp).toBe(T + DAYMS + (3 * DAYMS - HOUR));                         // rest of day 1 credited
    inv(s, USDT);
  });
});

describe("big-upload tickets: 5% retained fee (Carl, 8:10 PM)", () => {
  it("cancel after 20 h of a 72 h lock refunds 52/72 of the price in the stablecoin paid; the buyer's wait runs from the purchase; other buyers don't wait", () => {
    const s = setup(); gS = s; const T = NOW;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(T + 20 * HOUR);
    signedBy([BUYER]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(361_111); signedBy([]); // floor(500,000 × 52/72)
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - 138_889); expect(testGetToken(USDT, OWNER)).toBe(138_889); // elapsed time share via release
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(0);                    // unused Mana back in the pool
    inv(s, USDT);
    signedBy([BUYER, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, false)); }).toThrow(); // own wait until T+24 h
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 100 * M, USDT, 1000 * USD, false)); // another buyer: no wait (audit #2)
    at(T + DAYMS + 1000);                                                      // BUYER's own wait is over (counted from its purchase)
    signedBy([BUYER, user(79)]); expect(s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(79), 60 * M, USDT, 1000 * USD, false)).paid).toBe(300_000);
    signedBy([]); inv(s, USDT);
  });
  it("a full lock with no use refunds nothing; an immediate cancel keeps the 5% fee; owner refund has no fee; exact 128-bit math", () => {
    const s = setup(); const T = NOW;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(T + 3 * DAYMS);
    const x = s.close_ticket(new station.close_ticket_arguments(U1));
    expect(x.refund).toBe(0); expect(x.released).toBe(500_000);                // lock ran its full period (was: 95% back)
    inv(s, USDT);
    at(NOW + DAYMS + 1000);
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 200 * M, USDT, 1000 * USD, false)); signedBy([]); // 1,000,000
    tx(U2, 6 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);              // 3% used (above hard_max: ticket route)
    expect(s.get_escrow(new station.get_escrow_arguments(2)).refundable_now).toBe(950_000);
    signedBy([B2]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(B2, U2)).refund).toBe(950_000); signedBy([]); // not 970,000
    expect(testGetToken(USDT, B2)).toBe(10 * USD - 50_000);                    // 5% retained
    at(NOW + DAYMS + 1000);
    const B3 = user(88); testSetToken(USDT, B3, 10 * USD);
    signedBy([B3, user(89)]); s.buy_big_upload(new station.buy_big_upload_arguments(B3, user(89), 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    signedBy([OWNER]); expect(s.owner_refund(new station.owner_refund_arguments(0, user(89))).refund).toBe(500_000); signedBy([]); // owner refund: no fee
    signedBy([B3, user(90)]); s.buy_big_upload(new station.buy_big_upload_arguments(B3, user(90), 100 * M, USDT, 1000 * USD, false)); signedBy([]); // and no buyer wait
    inv(s, USDT);
    expect(mulDiv(50_000_000_000, 600_000_000_000, 600_000_000_000)).toBe(50_000_000_000); // 500 vUSDT × 6,000 Mana: no overflow
    expect(mulDiv(50_000_000_000, 599_999_999_999, 600_000_000_000)).toBe(49_999_999_999); // rounds down < 1 unit
    expect(mulDiv(1_000_000_000_000_000_000, 1_000_000_000_000_000_000, 1_000_000_000_000_000_000)).toBe(1_000_000_000_000_000_000);
    expect(mulDiv(7, 3, 2)).toBe(10);
  });
});

describe("only paying apps (Carl, 9:09 PM)", () => {
  it("paying app OK; unpaid app, expired allowance, mixed targets, token contracts and account allowances refused; Carl's apps OK", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, SOLDAPP, 10 * M, 1);                                       // app allowance for SOLDAPP
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(true);                               // paying app: OK, from its allowance
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).used_24h).toBe(2 * M);
    at(NOW + 3000); expect(play(s, user(2), 2 * M, OTHER)).toBe(false);               // unpaid, non-exempt app
    at(NOW + 3000); tx(user(3), 2 * M, [op(SOLDAPP, EP_PLAY), op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // mixed
    at(NOW + 3000); tx(user(3), 2 * M, [op(SOLDAPP, EP_PLAY), op(KNODE, EP_PLAY)]); expect(ok(s)).toBe(false); // mixed paid + Carl's
    at(NOW + 3000); tx(user(4), 2 * M, [op(USDT, EP_PLAY)]); expect(ok(s)).toBe(false);  // token transfer
    at(NOW + 3000); expect(play(s, user(5))).toBe(true);                               // Carl's Knode
    at(NOW + 3000); expect(play(s, user(6), 2 * M, STORIES)).toBe(true);               // Carl's Stories
    signedBy([BUYER, U2, USDT, USDC]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 3, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow(); // unknown kind (kind 2 = wallet pass, below)
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, USDT, 10 * M, 1, USDT, 1000 * USD)); }).toThrow(); // token contract
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, USDC, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([]);
    tx(SOLDAPP, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);              // the app's address as payee unlocks nothing elsewhere
    at(r.expiry + 1); expect(play(s, user(7), 2 * M, SOLDAPP)).toBe(false);            // expired allowance
  });
  it("big-upload ticket only sponsors calls to the payee's own contract", () => {
    const s = setup();
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, true)); signedBy([]);
    tx(U1, 10 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);
    tx(U1, 10 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);
  });
});

describe("wallet Mana pass (kind 2, Carl Oct 20: any app, no token moves)", () => {
  it("only the wallet itself can approve its pass; a wallet can buy its own", () => {
    const s = setup(); gS = s;
    signedBy([BUYER]); MockVM.commitTransaction();
    expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow(); // U2 didn't sign
    signedBy([U1]); const r = s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 10 * M, 1, USDT, 1000 * USD)); signedBy([]);
    expect(r.id).toBeGreaterThan(0);
    const L = s.list_connected(new station.list_connected_arguments()).paid;
    expect(L.length).toBe(1); expect(L[0].kind).toBe(2);
    inv(s, USDT);
  });
  it("pays the wallet's own calls to any contract; never another payee, the station, tokens, transfers, approvals, burns or uploads", () => {
    const s = setup();
    signedBy([U1]); s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 10 * M, 1, USDT, 1000 * USD)); signedBy([]);
    expect(play(s, U1, 2 * M, OTHER)).toBe(true);                                     // an app nobody pays for
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_PLAY), op(SOLDAPP, EP_HEAVY)]); expect(ok(s)).toBe(true); // mixed contracts
    at(NOW + 3000); expect(play(s, user(9), 2 * M, OTHER)).toBe(false);               // someone else as payee
    at(NOW + 3000); expect(play(s, U1, 2 * M, USDT)).toBe(false);                     // stablecoin contract, any entry point
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_TRANSFER)]); expect(ok(s)).toBe(false); // KCS transfer on any token
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, 0x74e21680)]); expect(ok(s)).toBe(false);  // approve
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, 0x859facc5)]); expect(ok(s)).toBe(false);  // burn
    at(NOW + 3000); tx(U1, 2 * M, [op(STATION, EP_PLAY), op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // the station itself
    const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(U1, new Uint8Array(4));
    at(NOW + 3000); tx(U1, 2 * M, [up]); expect(ok(s)).toBe(false);                   // uploads need a ticket
    at(NOW + 3000); tx(null, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // no payee
  });
  it("daily amount is a hard cap, refills on the rolling 24 h, ends at expiry; suspension stops it; free apps keep priority", () => {
    const s = setup();
    signedBy([U1]); const r = s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 5 * M, 7, USDT, 1000 * USD)); signedBy([]);
    expect(play(s, U1, 2 * M, OTHER)).toBe(true);
    at(NOW + 3000); expect(play(s, U1, 2 * M, OTHER)).toBe(true);
    at(NOW + 3000); expect(play(s, U1, 2 * M, OTHER)).toBe(false);                    // 4 + 2 > 5
    at(NOW + 3000); expect(play(s, U1, 1 * M, OTHER)).toBe(true);                     // exactly 5
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).used_24h).toBe(5 * M);
    at(NOW + 3000); expect(play(s, U1, 2 * M, KNODE)).toBe(true);                     // Knode's free slot pays, not the pass
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).used_24h).toBe(5 * M);
    at(NOW + DAYMS + HOUR); expect(play(s, U1, 2 * M, OTHER)).toBe(true);           // the day rolled: room again
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(U1, 1)); signedBy([]);
    at(NOW + 3000); expect(play(s, U1, 1 * M, OTHER)).toBe(false);                    // suspended
    signedBy([OWNER]); s.unsuspend_allowance(new station.unsuspend_allowance_arguments(U1, 0)); signedBy([]);
    at(r.expiry + 1); expect(play(s, U1, 1 * M, OTHER)).toBe(false);                  // expired
  });
});

function opA(contract: Uint8Array, ep: u32, args: Uint8Array): protocol.operation {
  const o = new protocol.operation(); o.call_contract = new protocol.call_contract_operation(contract, ep, args); return o;
}
function approveOp(token: Uint8Array, owner: Uint8Array, spender: Uint8Array): protocol.operation {
  return opA(token, 0x74e21680, Protobuf.encode(new station.kcs_approve_args(owner, spender, 1000 * USD), station.kcs_approve_args.encode));
}
function buyOp(buyer: Uint8Array, kind: u32, target: Uint8Array, token: Uint8Array): protocol.operation {
  return opA(STATION, 0x60422f5f, Protobuf.encode(new station.buy_allowance_arguments(buyer, kind, target, 5 * M, 1, token, 1000 * USD), station.buy_allowance_arguments.encode));
}
describe("free checkout (Oct 20): a wallet with no Mana can buy, renew and cancel", () => {
  it("the station pays approve + buy by the payee in a priced token; nothing else", () => {
    const s = setup();
    tx(U2, 1 * M, [approveOp(USDT, U2, STATION), buyOp(U2, 2, U2, USDT)]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, STATION), opA(STATION, 0x1c1d9f26, Protobuf.encode(new station.buy_big_upload_arguments(U2, U2, 60 * M, USDT, 1000 * USD, true), station.buy_big_upload_arguments.encode))]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, STATION), opA(STATION, 0xa36a2ce1, Protobuf.encode(new station.renew_arguments(U2, 1, 7, USDT, 1000 * USD), station.renew_arguments.encode))]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U1, 1 * M, [approveOp(USDT, U2, STATION), buyOp(U2, 2, U2, USDT)]); expect(ok(s)).toBe(false);   // someone else's approve
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U1, STATION), buyOp(U2, 2, U2, USDT)]); expect(ok(s)).toBe(false);   // approve from another owner
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, OTHER), buyOp(U2, 2, U2, USDT)]); expect(ok(s)).toBe(false);     // approve to another spender
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, STATION), buyOp(U1, 2, U1, USDT)]); expect(ok(s)).toBe(false);   // buying for another buyer
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, STATION), buyOp(U2, 2, U2, USDC)]); expect(ok(s)).toBe(false);   // token mismatch
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(OTHER, U2, STATION), buyOp(U2, 2, U2, OTHER)]); expect(ok(s)).toBe(false); // not a priced token
    at(NOW + 3000); tx(U2, 1 * M, [buyOp(U2, 2, U2, USDT), approveOp(USDT, U2, STATION)]); expect(ok(s)).toBe(false);   // wrong order
    at(NOW + 3000); tx(U2, 1 * M, [approveOp(USDT, U2, STATION), opA(STATION, 0x11111111, new Uint8Array(0))]); expect(ok(s)).toBe(false); // other station call
    at(NOW + 3000); tx(U2, 4 * M, [approveOp(USDT, U2, STATION), buyOp(U2, 2, U2, USDT)]); expect(ok(s)).toBe(false);   // above hard_max
    at(NOW + 3000); tx(U2, 1 * M, [opA(USDT, 0x27f576ca, new Uint8Array(8))]); expect(ok(s)).toBe(false);              // a plain token transfer
  });
  it("cancel by the buyer is paid, for another buyer refused; per-user limits apply; paused: cancel yes, buy no", () => {
    const s = setup();
    const cancel = (buyer: Uint8Array): protocol.operation => opA(STATION, 0xc7643cce, Protobuf.encode(new station.cancel_allowance_arguments(buyer, 1), station.cancel_allowance_arguments.encode));
    const cancelBig = (buyer: Uint8Array): protocol.operation => opA(STATION, 0xc2985745, Protobuf.encode(new station.cancel_big_upload_arguments(buyer, U2), station.cancel_big_upload_arguments.encode));
    tx(U2, 1 * M, [cancel(U2)]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U2, 1 * M, [cancelBig(U2)]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U2, 1 * M, [cancel(U1)]); expect(ok(s)).toBe(false);
    for (let i = 0; i < 3; i++) { at(NOW + 3000); tx(U2, 1 * M, [cancel(U2)]); expect(ok(s)).toBe(true); }  // 5 this minute
    at(NOW + 3000); tx(U2, 1 * M, [cancel(U2)]); expect(ok(s)).toBe(false);                                // per-minute limit, then cooldown
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    at(NOW + 3000); tx(U1, 1 * M, [cancel(U1)]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(U1, 1 * M, [approveOp(USDT, U1, STATION), buyOp(U1, 2, U1, USDT)]); expect(ok(s)).toBe(false);
  });
});

function infoOf(ops: protocol.operation[]): station.op_info[] {
  const out = new Array<station.op_info>();
  for (let i = 0; i < ops.length; i++) {
    const x = new station.op_info(); const o = ops[i];
    if (o.call_contract != null) { x.contract_id = o.call_contract!.contract_id; x.entry_point = o.call_contract!.entry_point; x.args = o.call_contract!.args; }
    else if (o.upload_contract != null) { x.contract_id = o.upload_contract!.contract_id; x.upload = true; }
    else x.other = true;
    out.push(x);
  }
  return out;
}
/** would_pay must give exactly the answer authorize then gives for the same transaction (asked first: it records nothing). */
function same(s: Station, payee: Uint8Array, rc: u64, ops: protocol.operation[], expectPay: bool, route: string = ""): void {
  tx(payee, rc, ops);
  const w = s.would_pay(new station.would_pay_arguments(payee, infoOf(ops), rc));
  expect(w.pay).toBe(expectPay);
  if (expectPay) expect(w.route).toBe(route);
  expect(ok(s)).toBe(expectPay);
}
describe("would_pay (Oct 21): the same rules as a dry run", () => {
  it("agrees with authorize on every route and every refusal", () => {
    const s = setup();
    same(s, user(1), 2 * M, [op(KNODE, EP_PLAY)], true, "free_app");
    at(NOW + 3000); same(s, user(2), 2 * M, [op(OTHER, EP_PLAY)], false);              // unknown app, no pass
    at(NOW + 3000); same(s, user(2), 2 * M, [op(USDT, EP_TRANSFER)], false);           // token transfer
    at(NOW + 3000); same(s, user(2), 4 * M, [op(KNODE, EP_PLAY)], false);              // above hard_max
    buyAccount(s, SOLDAPP, 10 * M, 1);
    at(NOW + 3000); same(s, user(3), 2 * M, [op(SOLDAPP, EP_PLAY)], true, "app_plan");
    signedBy([U1]); s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 10 * M, 1, USDT, 1000 * USD)); signedBy([]);
    at(NOW + 3000); same(s, U1, 2 * M, [op(OTHER, EP_PLAY)], true, "pass");
    at(NOW + 3000); same(s, U1, 2 * M, [op(OTHER, EP_TRANSFER)], false);               // a pass never moves tokens
    at(NOW + 3000); same(s, U2, 1 * M, [approveOp(USDT, U2, STATION), buyOp(U2, 2, U2, USDT)], true, "checkout");
    at(NOW + 3000); signedBy([OWNER]); same(s, OWNER, 1 * M, [op(STATION, 0x11111111)], true, "operator"); signedBy([]);
    signedBy([BUYER, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, true)); signedBy([]);
    const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(U2, new Uint8Array(4));
    at(NOW + 3000); same(s, U2, 10 * M, [up], true, "ticket");
    at(NOW + 3000); same(s, U1, 2 * M, [up], false);                                     // someone else's upload
  });
  it("records nothing: no use, no limits, no events, however often it is asked", () => {
    const s = setup();
    signedBy([U1]); const r = s.buy_allowance(new station.buy_allowance_arguments(U1, 2, U1, 3 * M, 1, USDT, 1000 * USD)); signedBy([]);
    testSetMana(500 * M);                                                // below the alert level: a real payment would emit reserve_low
    const ev0 = MockVM.getEvents().length;
    for (let i = 0; i < 10; i++) {
      expect(s.would_pay(new station.would_pay_arguments(U1, infoOf([op(OTHER, EP_PLAY)]), 2 * M)).pay).toBe(true);
      expect(s.would_pay(new station.would_pay_arguments(user(7), infoOf([op(KNODE, EP_PLAY)]), 2 * M)).pay).toBe(true);
    }
    expect(MockVM.getEvents().length).toBe(ev0);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).used_24h).toBe(0);
    expect(s.get_app(new station.get_app_arguments(1)).used_24h).toBe(0);
    for (let i = 0; i < 5; i++) { at(NOW + 3000); expect(play(s, user(7))).toBe(true); }   // the full per-minute allowance is still there
    expect(s.would_pay(new station.would_pay_arguments(user(7), infoOf([op(KNODE, EP_PLAY)]), 2 * M)).pay).toBe(false); // 6th: per-minute limit
    expect(s.would_pay(new station.would_pay_arguments(U1, infoOf([op(OTHER, EP_PLAY)]), 4 * M)).pay).toBe(false);       // above hard_max
    expect(s.would_pay(new station.would_pay_arguments(U1, infoOf([op(OTHER, EP_PLAY)]), 3 * M)).pay).toBe(true);        // exactly the pass
  });
});

describe("ticket fee config and stablecoin-only money paths", () => {
  it("fee is owner-adjustable in bp, capped at 20%; only vUSDT/vUSDC can be priced (so refunds are never KOIN or Mana)", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]);
    const c = cfg(); c.ticket_fee_bp = 2000; gC = c;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // audit #1: a higher fee needs the council
    const a1 = act(7); a1.fee_bp = 2001; gA = a1;
    signedBy([C1]); MockVM.commitTransaction(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); // > 20%
    const a2 = act(7); a2.fee_bp = 2000; councilDo(s, a2); signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.set_price(new station.set_price_arguments(KOIN, PRICE())); }).toThrow();
    MockVM.commitTransaction(); expect(() => { gS!.set_price(new station.set_price_arguments(OTHER, PRICE())); }).toThrow();
    s.set_price(new station.set_price_arguments(USDC, PRICE()));
    signedBy([U1]); const c3 = cfg(); c3.ticket_fee_bp = 0; gC = c3;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // owner only
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false));
    expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(400_000); signedBy([]); // 20% kept
    at(NOW + DAYMS + 1000);                                                      // rounding: 333 bp of 255,000 = 8,491.5 → keep 8,492
    signedBy([OWNER]); const c4 = cfg(); c4.ticket_fee_bp = 333; s.set_config(new station.set_config_arguments(c4)); signedBy([]);
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 51 * M, USDT, 1000 * USD, false));
    expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(B2, U2)).refund).toBe(246_508); signedBy([]);
    expect(testGetToken(USDT, B2)).toBe(10 * USD - 8_492);
    const kb = testGetToken(KOIN, BUYER);
    expect(kb).toBe(0); expect(testGetToken(KOIN, STATION)).toBe(0);            // no KOIN ever moves
    inv(s, USDT);
  });
});

describe("big-upload hold fix (Carl, 8:02 PM): cancel frees the station wait, outstanding and weekly counters", () => {
  it("attacker loop (buy, cancel, repeat) never blocks other buyers; each attacker address then waits 24 h", () => {
    const s = setup(); gS = s;
    for (let i = 0; i < 6; i++) {
      const A = user(60 + i); testSetToken(USDT, A, 10 * USD);
      at(NOW + 3000);
      signedBy([A, user(80 + i)]); s.buy_big_upload(new station.buy_big_upload_arguments(A, user(80 + i), 300 * M, USDT, 1000 * USD, false));
      expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(A, user(80 + i))).refund).toBe(1_425_000); signedBy([]);
      expect(testGetToken(USDT, A)).toBe(10 * USD - 75_000);                     // each cycle now costs the attacker 5%…
    }
    const st = s.get_status(new station.get_status_arguments());
    expect(st.big_debt).toBe(0);                                                 // …and nothing stays booked
    expect(testGetToken(USDT, OWNER)).toBe(6 * 75_000);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 300 * M)).available).toBe(true); // 6 × 300 > weekly 500 without the fix
    const A0 = user(60);                                                         // station wait is lifted, so only its own 24 h wait blocks it
    signedBy([A0]); MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(user(60), user(95), 50 * M, USDT, 1000 * USD, false)); }).toThrow(); signedBy([]);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 300 * M, USDT, 1000 * USD, false)); signedBy([]);
    inv(s, USDT);
  });
  it("only used Mana counts toward the weekly cap and outstanding; nothing goes negative or is freed twice", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]); const c = cfg(); c.big_cooldown_ms = 0; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 300 * M, USDT, 1000 * USD, false)); signedBy([]);
    tx(U1, 100 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);            // 100 used
    signedBy([BUYER]); s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)); signedBy([]);
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(100 * M);
    signedBy([BUYER]); MockVM.commitTransaction(); expect(() => { gS!.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)); }).toThrow(); signedBy([]); // already settled
    MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(U1)); }).toThrow();
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.owner_refund(new station.owner_refund_arguments(0, U1)); }).toThrow(); signedBy([]);
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(100 * M);           // not freed twice
    signedBy([B2, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 300 * M, USDT, 1000 * USD, false)); signedBy([]); // week 100 + 300, debt 400
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 101 * M)).reason!).toBe("weekly big-upload cap reached"); // 100 + 300 + 101 > 500
    signedBy([B2]); s.cancel_big_upload(new station.cancel_big_upload_arguments(B2, U2)); signedBy([]);
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(100 * M);
    const B3 = user(88); testSetToken(USDT, B3, 10 * USD);
    signedBy([B3, user(89)]); s.buy_big_upload(new station.buy_big_upload_arguments(B3, user(89), 300 * M, USDT, 1000 * USD, false)); signedBy([]); // fits again
    at(NOW + 8 * DAYMS);                                                         // week rolls off; debt repaid
    signedBy([B3]); s.cancel_big_upload(new station.cancel_big_upload_arguments(B3, user(89))); signedBy([]); // purchase day left the window: no underflow
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(0);
    inv(s, USDT);
  });
  it("audit #2: the wait is per buyer, so one buyer never blocks another; ticket lifetime defaults to 24 h", () => {
    const s = setup(); gS = s; const T = NOW;
    signedBy([OWNER]); const c = cfg(); c.big_ticket_ms = 0; c.big_max_debt = 1000 * M; c.big_week_cap = 1000 * M; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    expect(s.get_ticket(new station.get_ticket_arguments(U1)).ticket!.expiry).toBe(T + DAYMS);   // default 24 h
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).available).toBe(true); // no station-wide wait
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, U2, 100 * M, USDT, 1000 * USD, false)); signedBy([]); // right away
    signedBy([BUYER, user(70)]); MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(70), 50 * M, USDT, 1000 * USD, false)); }).toThrow(); signedBy([]);
    signedBy([OWNER]); const c2 = cfg(); c2.big_ticket_ms = 2 * HOUR; c2.big_cooldown_ms = 0; c2.big_max_debt = 1000 * M; c2.big_week_cap = 1000 * M; s.set_config(new station.set_config_arguments(c2)); signedBy([]);
    const B3 = user(88); testSetToken(USDT, B3, 10 * USD);
    signedBy([B3, user(89)]); s.buy_big_upload(new station.buy_big_upload_arguments(B3, user(89), 50 * M, USDT, 1000 * USD, false)); signedBy([]);
    expect(s.get_ticket(new station.get_ticket_arguments(user(89))).ticket!.expiry).toBe(NOW + 2 * HOUR); // owner-adjustable
  });
});

describe("big uploads from the reserve", () => {
  it("approved limits at mainnet scale: 6,000 per request, 12,000 per 7 days, 6,000 outstanding; owner-adjustable", () => {
    const s = setup(); gS = s;
    testSetBalance(40_000 * M); testSetMana(40_000 * M);
    const c = cfg(); c.koin_amount = 40_000 * M; c.big_max = 6000 * M; c.big_week_cap = 12_000 * M; c.big_max_debt = 6000 * M; c.big_cooldown_ms = 0;
    signedBy([OWNER]); s.set_config(new station.set_config_arguments(c)); signedBy([]);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 6001 * M)).reason!).toBe("above the per-request maximum");
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 6000 * M)).available).toBe(true);
    signedBy([BUYER, U1]);
    expect(s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 6000 * M, USDT, 1000 * USD, false)).paid).toBe(30_000_000);
    signedBy([]); tx(U1, 6000 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true); signedBy([BUYER, U2]); // used (unused tickets lapse: audit #2)
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).reason!).toBe("reserve still repaying"); // 6,000 outstanding
    at(NOW + DAYMS + 1000);                                                       // repaid at the sellable rate (7,840/day)
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 6000 * M, USDT, 1000 * USD, false));
    signedBy([]); tx(U2, 6000 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true); signedBy([BUYER]);
    at(NOW + DAYMS + 1000);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).reason!).toBe("weekly big-upload cap reached"); // 12,000
    signedBy([OWNER]); const c2 = cfg(); c2.koin_amount = 40_000 * M; c2.big_max = 7000 * M; c2.big_week_cap = 20_000 * M; c2.big_max_debt = 7000 * M; c2.big_cooldown_ms = 0;
    s.set_config(new station.set_config_arguments(c2)); signedBy([]);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 6001 * M)).available).toBe(true); // owner raised them
  });
  it("prepaid ticket ignores the daily limit, bounded by floor, per-request max, cooldown, weekly cap and debt", () => {
    const s = setup(); gS = s;
    signedBy([BUYER, U1]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 301 * M, USDT, 1000 * USD, true)); }).toThrow(); // > big_max
    const r = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 300 * M, USDT, 1000 * USD, true));
    expect(r.paid).toBe(1_500_000);                                          // 300/1,000 × 0.05
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(300 * M);
    signedBy([]);
    tx(U1, 150 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);          // far above hard_max: ticket pays
    const own = new protocol.operation(); own.upload_contract = new protocol.upload_contract_operation(U1, new Uint8Array(4));
    const foreign = new protocol.operation(); foreign.upload_contract = new protocol.upload_contract_operation(U2, new Uint8Array(4));
    at(NOW + 3000); tx(U1, 100 * M, [own]); expect(ok(s)).toBe(true);          // payee's own contract
    at(NOW + 3000); tx(U1, 10 * M, [foreign]); expect(ok(s)).toBe(false);      // someone else's
    at(NOW + 3000); tx(U1, 60 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(false); // only 50 left on the ticket
    testSetMana(205 * M + 10 * M - 1);
    at(NOW + 3000); tx(U1, 10 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(false); // big floor = 5 + 200
    testSetMana(1000 * M);
    signedBy([BUYER, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, false)); }).toThrow(); // cooldown
    at(NOW + DAYMS + 1000);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 200 * M, USDT, 1000 * USD, false)); }).toThrow(); // debt 260 + 200 > 400
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, false));
    signedBy([]); at(NOW + 3000); tx(U2, 10 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true); signedBy([BUYER, user(5)]); // started, so it stays booked
    at(NOW + DAYMS + 1000);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(5), 120 * M, USDT, 1000 * USD, false)); }).toThrow(); // week 400 + 120 > 500
    signedBy([]);
  });
  it("audit #2: big-upload debt never pauses paid allowances; Carl's apps keep working; expiry releases the unused Mana", () => {
    const s = setup();
    const a = buyAccount(s, U2, 10 * M, 30);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 80 * M, USDT, 1000 * USD, false)); signedBy([]);
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(80 * M);
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);    // paying customer still served (was: refused)
    expect(play(s, user(1))).toBe(true);                                             // Knode unaffected
    gS = s; MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(U1)); }).toThrow(); // lock still running
    at(NOW + 3 * DAYMS);                                                             // lock over, never used
    expect(s.close_ticket(new station.close_ticket_arguments(U1)).refund).toBe(0);   // full price for the full lock
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(0);       // its unused Mana is back in the pool
    expect(a.id).toBe(1);
  });
});

describe("fee-exempt allowlist (Carl's projects)", () => {
  it("owner-only add/remove with events; exempt = fee-free, not limit-free", () => {
    const s = setup(); gS = s;
    tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);              // not exempt, nothing bought
    signedBy([U1]);
    MockVM.commitTransaction(); expect(() => { gS!.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false)); }).toThrow();
    signedBy([OWNER]);
    const before = MockVM.getEvents().length;
    s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false));
    const ev = MockVM.getEvents();
    expect(ev.length).toBe(before + 1); expect(ev[ev.length - 1].name).toBe("station.exempt_changed");
    signedBy([]);
    expect(s.get_exempt(new station.get_exempt_arguments(OTHER)).exempt!.app).toBe(0);
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(true);  // non-strict: any entry point, fee-free
    tx(U1, 2 * M, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(false);                 // same block: rate limit applies
    at(NOW + 3000); tx(U1, 3 * M + 1, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(false); // per-tx cap applies
    testSetMana(5 * M + 2 * M - 1);
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(false); // admin floor applies
    testSetMana(1000 * M);
    let n = 0;                                                                     // non-reserved project: only the sellable 40
    for (let i = 0; i < 30; i++) { at(NOW + 3000); tx(user(i), 2 * M, [op(OTHER, EP_NOPE)]); if (ok(s)) n++; }
    expect(n).toBe(19);                                                            // 40/2 = 20, one already used
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, null, true)); signedBy([]);
    expect(MockVM.getEvents()[MockVM.getEvents().length - 1].name).toBe("station.exempt_changed");
    at(NOW + DAYMS + 2 * HOUR); tx(user(50), 2 * M, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(false); // removed
  });
  it("with sellable 0 (option A), a non-reserved exempt project is refused", () => {
    const s = setupA();
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false)); signedBy([]);
    tx(U1, 2 * M, [op(U1, EP_NOPE)]); expect(ok(s)).toBe(false);
    expect(play(s, U1)).toBe(true);                                                // reserved Knode still works
  });
  it("in-allowance exempt usage counts toward the 20% station-wide cap; buffers sit outside it", () => {
    const s = setup();
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(1, false), false)); signedBy([]);
    let n = 0;                                                                     // OTHER shares Knode's reservation
    for (let i = 0; i < 40; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    for (let i = 40; i < 80; i++) { at(NOW + 3000); tx(user(i), 2 * M, [op(OTHER, EP_NOPE)]); if (ok(s)) n++; }
    for (let i = 80; i < 140; i++) { at(NOW + 3000); if (play(s, user(i), 2 * M, STORIES)) n++; }
    expect(n).toBe(96);                                                            // (80 + 16) + (80 + 16)
    expect(s.get_status(new station.get_status_arguments()).used_24h).toBe(160 * M);
    expect(s.get_status(new station.get_status_arguments()).buffer_used_24h).toBe(32 * M);
  });
});

describe("treasury, revenue, refunds, admin", () => {
  it("payments go to the station's escrow, not to Carl; release after the term pays the treasury (owner wallet by default)", () => {
    const s = setup(); gS = s;
    expect(s.get_status(new station.get_status_arguments()).treasury!).toStrictEqual(OWNER);
    const r = buyAccount(s, U2, 10 * M, 1);
    expect(testGetToken(USDT, OWNER)).toBe(0); expect(testGetToken(USDT, STATION)).toBe(r.paid);
    expect(s.get_escrow_totals(new station.get_escrow_totals_arguments(USDT)).totals!.held).toBe(r.paid);
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow();   // term not ended: not even the owner
    const c0 = cfg(); c0.treasury = STATION; gC = c0;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // treasury can't be the escrow
    const c1 = cfg(); c1.treasury = OTHER; gC = c1;
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); // audit #1: treasury needs the council
    const t6 = act(6); t6.to = OTHER; councilDo(s, t6);                       // 48 h later
    at(r.expiry + 2 * DAYMS); expect(s.release(new station.release_arguments(1)).amount).toBe(r.paid);   // anyone may call
    expect(testGetToken(USDT, OTHER)).toBe(r.paid); expect(testGetToken(USDT, STATION)).toBe(0);
  });
  it("pause credits paused time: the term and escrow end move forward by the pause; no money moves", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, U2, 10 * M, 7);
    at(NOW + 2 * DAYMS + HOUR);                                                // into day 3
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    expect(s.get_escrow(new station.get_escrow_arguments(1)).refundable_now).toBe(200_000 - 3 * 30_000); // clock frozen in day 3 (AB-010)
    at(NOW + 3 * DAYMS);                                                       // paused 3 days
    expect(s.get_escrow(new station.get_escrow_arguments(1)).refundable_now).toBe(200_000 - 3 * 30_000); // still frozen
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry).toBe(r.expiry + 3 * DAYMS);
    expect(s.get_escrow(new station.get_escrow_arguments(1)).purchase!.end).toBe(r.expiry + 3 * DAYMS);
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - r.paid); expect(testGetToken(USDT, STATION)).toBe(r.paid);
    at(r.expiry + DAYMS); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);  // credited time is served
    gS = s; MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow(); // not yet
    at(r.expiry + 3 * DAYMS); expect(s.release(new station.release_arguments(1)).amount).toBe(r.paid);
  });
  it("escrow terms on quotes and purchase events (refundable, no auto-renew)", () => {
    const s = setup();
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7));
    expect(q.refundable).toBe(true); expect(q.auto_renew).toBe(false); expect(q.terms!).toBe(ALLOWANCE_TERMS);
    expect(ALLOWANCE_TERMS.includes("unused whole days are refunded")).toBe(true); expect(ALLOWANCE_TERMS.includes("escrow")).toBe(true);
    expect(ALLOWANCE_TERMS.includes("No auto-renew")).toBe(true);
    const bq = s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 100 * M));
    expect(bq.refundable).toBe(true); expect(bq.auto_renew).toBe(false); expect(bq.terms!).toBe(BIG_TERMS);
    MockVM.clearEvents(); const r = buyAccount(s, U2, 10 * M, 7);
    const ev = MockVM.getEvents(); const e = ev[ev.length - 1];
    expect(e.name).toBe("station.allowance_bought");
    const pe = Protobuf.decode<station.purchase_event>(e.data!, station.purchase_event.decode);
    expect(pe.refundable).toBe(true); expect(pe.auto_renew).toBe(false); expect(pe.terms!).toBe(ALLOWANCE_TERMS);
    expect(pe.paid).toBe(r.paid); expect(pe.allowance!.id).toBe(r.id);
    MockVM.clearEvents(); signedBy([BUYER, U1]);
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    const ev2 = MockVM.getEvents(); const pb = Protobuf.decode<station.purchase_event>(ev2[ev2.length - 1].data!, station.purchase_event.decode);
    expect(pb.terms!).toBe(BIG_TERMS); expect(pb.ticket!.paid).toBe(500_000);
  });
  it("vUSDT and vUSDC both accepted; vUSDC has the lower per-purchase maximum (liquidity)", () => {
    const s = setup();
    signedBy([OWNER]);
    s.set_price(new station.set_price_arguments(USDT, new station.price_object(true, 500 * USD, 3_000_000, 20_000_000, 75_000_000, 5_000_000, 50 * M)));
    s.set_price(new station.set_price_arguments(USDC, new station.price_object(true, 100 * USD, 3_000_000, 20_000_000, 75_000_000, 5_000_000, 50 * M)));
    signedBy([]);
    // 140,000 Mana/day for 30 days = 105 tokens: above vUSDC's 100 max, within vUSDT's 500 (then capacity decides)
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDC, 140_000 * M, 30)).reason!).toBe("above the per-purchase maximum");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 140_000 * M, 30)).reason!).toBe("sold capacity full");
    testSetToken(USDC, BUYER, 10 * USD);
    signedBy([BUYER, U2]);
    const r = s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 30, USDC, 1000 * USD)); signedBy([]);
    expect(r.paid).toBe(750_000);
    expect(testGetToken(USDC, STATION)).toBe(750_000);                         // held in escrow, in vUSDC
    expect(testGetToken(USDC, BUYER)).toBe(10 * USD - 750_000);
  });
  it("kill switch: pause stops sponsorship and buys; owner can unpause with station Mana", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    expect(play(s, U1)).toBe(false);
    signedBy([BUYER, U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    testSetMana(4 * M);                                                        // below admin_min
    tx(OWNER, 1 * M, [op(STATION, 0x35fbb717)]); expect(ok(s)).toBe(false);   // set_paused, not signed
    signedBy([OWNER]); expect(ok(s)).toBe(true);                               // the brake works down to rc <= Mana
    at(NOW + 1000); tx(OWNER, 1 * M, [op(STATION, 0x12345678)]); expect(ok(s)).toBe(false); // AB-012: other admin calls keep the floor
    s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    tx(null, 2 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(false);
    signedBy([STATION]); expect(ok(s)).toBe(false);                           // audit #1: the station key alone gets nothing
  });
});

describe("audit 2026-10-19: attacks replayed (branch fix/squat-freeze-stall)", () => {
  it("#2 ticket hold: a held ticket no longer freezes paying customers or other buyers; holding it costs the full price", () => {
    const s = setup(); gS = s; const T = NOW;
    signedBy([OWNER]); const c = cfg(); c.big_ticket_ms = DAYMS; s.set_config(new station.set_config_arguments(c)); signedBy([]); // 24 h lock
    const a = buyAccount(s, U2, 10 * M, 7);                                      // a paying customer
    const A = user(60); testSetToken(USDT, A, 10 * USD);
    signedBy([A, user(81)]); s.buy_big_upload(new station.buy_big_upload_arguments(A, user(81), 50 * M, USDT, 1000 * USD, false)); signedBy([]); // held unused
    at(T + 1000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);   // paying customer still served (was: frozen)
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, user(82)]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, user(82), 50 * M, USDT, 1000 * USD, false)); signedBy([]); // no station-wide wait
    at(T + DAYMS);                                                               // lock ran its full 24 h, unused
    const x = s.close_ticket(new station.close_ticket_arguments(user(81)));
    expect(x.refund).toBe(0); expect(x.released).toBe(250_000);                  // the attacker paid the full price for the day
    expect(testGetToken(USDT, A)).toBe(10 * USD - 250_000);
    expect(a.id).toBe(1); inv(s, USDT);
  });
  it("#2 early end: refund = unused Mana share × time left share, at least the 5% fee kept (Carl, 8:43 PM)", () => {
    const s = setup(); gS = s; const T = NOW;
    signedBy([OWNER]); const c = cfg(); c.big_ticket_ms = DAYMS; c.big_cooldown_ms = 0; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); // 500,000
    expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(475_000); signedBy([]); // at once: fee floor 95%
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(T + 6 * HOUR);
    signedBy([BUYER]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund).toBe(375_000); signedBy([]); // 18 of 24 h left = 75%
    at(T + 6 * HOUR + 1000);
    signedBy([BUYER, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    tx(U2, 10 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);              // 10% used
    at(T + 12 * HOUR + 1000);
    expect(s.get_escrow(new station.get_escrow_arguments(3)).refundable_now).toBe(337_500); // 90% unused × 18/24 h left = 67.5%
    tx(U2, 70 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(true);              // now 80% used
    signedBy([BUYER]); expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U2)).refund).toBe(75_000); signedBy([]); // 20% unused × 75% left = 15%
    inv(s, USDT);
  });
  it("#2 a pause freezes the lock clock: the refund and the remaining lock are the same after the pause", () => {
    const s = setup(); gS = s; const T = NOW;
    signedBy([OWNER]); const c = cfg(); c.big_ticket_ms = DAYMS; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(T + 6 * HOUR); signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    at(T + 30 * HOUR);                                                           // 24 h later, still paused
    expect(s.get_escrow(new station.get_escrow_arguments(1)).refundable_now).toBe(375_000); // frozen at 18 h left
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    expect(s.get_ticket(new station.get_ticket_arguments(U1)).ticket!.expiry).toBe(T + DAYMS + 24 * HOUR); // credited
    expect(s.get_escrow(new station.get_escrow_arguments(1)).refundable_now).toBe(375_000);
  });
  it("#3 target squat: nobody can buy an allowance for an app without that app's signature", () => {
    const s = setup(); gS = s;
    signedBy([BUYER]);                                                           // attacker signs, the app doesn't
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, SOLDAPP, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([]);
    expect(buyAccount(s, SOLDAPP, 10 * M, 1).id).toBe(1);                        // with the app's signature: fine
  });
  it("#3 slot squat: minimum charge per purchase and a per-buyer cap; other buyers still get in", () => {
    const s = setup(); gS = s;
    const p = PRICE(); p.min_purchase = 1 * USD;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1)).price).toBe(1 * USD); // was 3,000 base units ($0.00003)
    for (let i = 0; i < 5; i++) expect(buyAccount(s, user(30 + i), 1 * M, 1).paid).toBe(1 * USD);
    signedBy([BUYER, user(35)]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, user(35), 1 * M, 1, USDT, 1000 * USD)); }).toThrow(); // 6th: per-buyer cap
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, user(36)]); s.buy_allowance(new station.buy_allowance_arguments(B2, 1, user(36), 1 * M, 1, USDT, 1000 * USD)); signedBy([]);
    inv(s, USDT);
  });
  it("#4 stall: every finished purchase is closed by the next buy, so the open list (cap 128) never accumulates", () => {
    // 15 days × 8 = 120 purchases: MockVM conflates storage keys with bytes >= 0x80, so ids stay below 128 (engineering.md).
    const s = setup(); gS = s; const T = NOW; let paid: u64 = 0;
    for (let d = 0; d < 15; d++) {
      at(T + u64(d) * DAYMS + 1000);
      for (let k = 0; k < 8; k++) {
        const B = user(40 + k); if (d == 0) testSetToken(USDT, B, 10 * USD);
        signedBy([B, user(50 + k)]);
        paid += s.buy_allowance(new station.buy_allowance_arguments(B, 1, user(50 + k), 5 * M, 1, USDT, 1000 * USD)).paid;
        signedBy([]);
      }
    }
    for (let id: u32 = 1; id <= 112; id++) expect(s.get_escrow(new station.get_escrow_arguments(id)).purchase!.closed).toBe(true); // days 0-13 all swept
    for (let id: u32 = 113; id <= 120; id++) expect(s.get_escrow(new station.get_escrow_arguments(id)).purchase!.closed).toBe(false); // today's still running
    MockVM.commitTransaction(); expect(() => { gS!.release(new station.release_arguments(1)); }).toThrow(); // swept exactly once
    const tot = s.get_escrow_totals(new station.get_escrow_totals_arguments(USDT)).totals!;
    expect(tot.collected).toBe(paid); expect(tot.released).toBe(testGetToken(USDT, OWNER));
    expect(tot.held).toBe(8 * 15_000);                                           // only today's 8 terms are still held
    inv(s, USDT);
  });
  it("#7 oversell guard: owner changes can't shrink sellable capacity below what is sold", () => {
    const s = setup(); gS = s;
    buyAccount(s, U2, 30 * M, 7);                                                // sellable 40, sold 30
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.set_app(new station.set_app_arguments(1, new station.app_object(95 * M, true))); }).toThrow(); // sellable 25 < 30
    s.set_app(new station.set_app_arguments(1, new station.app_object(90 * M, true)));                       // sellable 30: OK
    const c = cfg(); c.koin_amount = 900 * M; gC = c;                                                         // budget 180 → sellable 10
    MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow();
    signedBy([]);
  });
  it("review C1: cancelling with a renewed future term can't keep the service (was: ~86% back and still served 7 days)", () => {
    const s = setup(); gS = s; const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);                                      // 200,000 for days 1-7
    signedBy([BUYER]); s.renew(new station.renew_arguments(BUYER, r.id, 1, USDT, 1000 * USD)); signedBy([]); // + day 8, 30,000
    at(T + HOUR);
    const x = cancelBy(s, BUYER, r.id);
    expect(x.refund).toBe(170_000 + 30_000);                                     // term 1 less 1 day at 30,000 (AB-010) + all of the future term
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry).toBe(T + DAYMS); // served to end of day 1 only
    at(T + DAYMS + 1000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false); // no free service after the refund
    expect(s.get_escrow(new station.get_escrow_arguments(2)).purchase!.closed).toBe(true); // refunded future term closed at once
    inv(s, USDT);
  });
  it("review H1: Mana locked by open tickets is never sold twice or spent by buffers", () => {
    const s = setup(); gS = s;                                                   // mana 1,000; big floor 5 + 200 = 205
    signedBy([OWNER]); const c = cfg(); c.big_cooldown_ms = 0; c.big_week_cap = 2000 * M; c.big_max_debt = 2000 * M; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    signedBy([BUYER, U1, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 300 * M, USDT, 1000 * USD, false));
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 300 * M, USDT, 1000 * USD, false)); signedBy([]); // 600 locked
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 200 * M)).reason!).toBe("reserve too low right now"); // 1,000 − 600 − 200 < 205
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 190 * M)).available).toBe(true);
    testSetMana(806 * M);                                                        // floor 205 + 600 locked = 805: 1 Mana spare
    let served = 0;
    for (let i = 0; i < 50; i++) { at(NOW + 70_000); if (play(s, user(100 + (i % 6)))) served++; } // 100 Mana asked of Knode's 80
    expect(served).toBe(40);                                                     // its 80-Mana allowance, all served
    expect(s.get_status(new station.get_status_arguments()).buffer_used_24h).toBe(0); // buffer refused: it would eat into the locks
    tx(U1, 300 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);              // the holder still gets its locked Mana
  });
  it("review M3: a cancel never refunds below the minimum charge; owner refunds still can", () => {
    const s = setup();
    const p = PRICE(); p.min_purchase = 1 * USD;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const r = buyAccount(s, U2, 10 * M, 30);                                     // 750,000 < $1 → charged 100,000,000
    expect(r.paid).toBe(1 * USD);
    expect(cancelBy(s, BUYER, r.id).refund).toBe(0);                             // 29/30 would be 96,666,666: capped at paid − minimum
    const r2 = buyAccount(s, U1, 10 * M, 30);                                    // also charged the $1 minimum
    signedBy([OWNER]); expect(s.owner_refund(new station.owner_refund_arguments(r2.id, null)).refund).toBe(96_666_666); signedBy([]); // 29/30 of $1: no minimum kept
    inv(s, USDT);
  });
  it("review L4: a minimum charge above the per-purchase maximum is refused", () => {
    const s = setup(); gS = s;
    const p = PRICE(); p.min_purchase = 101 * USD; gP = p;                       // max per purchase is 100
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.set_price(new station.set_price_arguments(USDT, gP)); }).toThrow(); signedBy([]);
  });
  it("Carl 8:43 PM: one wallet's open allowances and tickets together are capped (default 5)", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]); const c = cfg(); c.big_cooldown_ms = 0; c.big_week_cap = 2000 * M; c.big_max_debt = 2000 * M; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    for (let i = 0; i < 3; i++) buyAccount(s, user(30 + i), 5 * M, 7);           // 3 allowances
    signedBy([BUYER, user(40), user(41), user(42)]);
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(40), 50 * M, USDT, 1000 * USD, false));
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(41), 50 * M, USDT, 1000 * USD, false)); // + 2 tickets = 5
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(42), 50 * M, USDT, 1000 * USD, false)); }).toThrow(); // 6th: ticket refused
    signedBy([BUYER, user(43)]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, user(43), 5 * M, 1, USDT, 1000 * USD)); }).toThrow(); // 6th: allowance refused
    signedBy([BUYER, user(42)]); s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, user(41))); // one closes…
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(42), 50 * M, USDT, 1000 * USD, false)); signedBy([]); // …so there is room again
    const B2 = user(77); testSetToken(USDT, B2, 10 * USD);
    signedBy([B2, user(44)]); s.buy_big_upload(new station.buy_big_upload_arguments(B2, user(44), 50 * M, USDT, 1000 * USD, false)); signedBy([]); // other wallets unaffected
    inv(s, USDT);
  });
  it("#8 a stranger closing an expired ticket late doesn't extend the buyer's wait", () => {
    const s = setup(); const T = NOW;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 50 * M, USDT, 1000 * USD, false)); signedBy([]);
    tx(U1, 10 * M, [op(U1, EP_PLAY)]); expect(ok(s)).toBe(true);
    at(T + 5 * DAYMS);                                                           // expired at T+3 d; closed by someone at T+5 d
    signedBy([U2]); s.close_ticket(new station.close_ticket_arguments(U1)); signedBy([]);
    signedBy([BUYER, U2]); expect(s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, false)).paid).toBe(250_000); // no new wait
    signedBy([]); inv(s, USDT);
  });
});

let gId: u32 = 0;
/** contract_call authorization as a token would ask it (no closures in AssemblyScript: plain functions + globals). */
function cd(s: Station, caller: Uint8Array): bool {
  return s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_call, new authority.call_data(KOIN, EP_TRANSFER, caller))).value;
}
/** contract_upload authorization for a tx that uploads `bytes` to the station with all (or none) of the overrides. */
function upAuth(s: Station, bytes: Uint8Array, flags: bool): bool {
  const t = new protocol.transaction(); const o = new protocol.operation();
  o.upload_contract = new protocol.upload_contract_operation(STATION, bytes, "", flags, flags, flags); t.operations = [o];
  MockVM.setTransaction(t); System.resetCache();
  return s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_upload)).value;
}

describe("audit #1: permission takeover, council, delay, veto (Oct 20)", () => {
  it("init only inside the station's own upload tx, with all three permissions taken over; never twice", () => {
    MockVM.reset(); System.setSystemBufferSize(256 * 1024);
    MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); MockVM.setEntryPoint(0);
    MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
    MockVM.setHeadInfo(new chain.head_info(null, 0, 1)); at(T0); testSetMana(1000 * M); testSetBalance(1000 * M);
    const s = new Station(); gS = s; gC = cfg();
    signedBy([STATION]); tx(null, M, [op(STATION, 0x12345678)]);                 // a plain tx: no upload
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow();
    deployTx(false, true, true);                                                 // upload that keeps contract_call with the key
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow();
    deployTx(true, true, false);                                                 // …or keeps upload with the key
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow();
    const bad = cfg(); bad.threshold = 1; gC = bad; deployTx();                  // 1-of-N council refused
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow();
    const shortDelay = cfg(); shortDelay.guard_delay_ms = DAYMS; gC = shortDelay; // below 48 h on mainnet builds
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow();
    gC = cfg(); s.init(new station.init_arguments(gC));                          // the real deploy tx: OK
    MockVM.commitTransaction(); expect(() => { gS!.init(new station.init_arguments(gC)); }).toThrow(); // never twice
  });
  it("the key alone moves nothing: token transfers only when the station's own code calls; its own txs are never paid", () => {
    const s = setup();
    expect(cd(s, STATION)).toBe(true);                                              // escrow payout / approved withdrawal
    expect(cd(s, new Uint8Array(0))).toBe(false);                                   // a tx signed with the station key
    expect(cd(s, OWNER)).toBe(false); expect(cd(s, OTHER)).toBe(false);                // any other contract or wallet
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_call)).value).toBe(false); // no call data
    tx(STATION, M, [op(KOIN, EP_TRANSFER)]); signedBy([STATION]); expect(ok(s)).toBe(false); // station as payee: never
    tx(null, M, [op(STATION, 0x12345678)]); expect(ok(s)).toBe(false);
  });
  it("upgrade: only the council-approved bytecode, after the delay, keeping all three permissions; once", () => {
    const s = setup(); const code = new Uint8Array(64); code[0] = 7;
    const h = System.hash(Crypto.multicodec.sha2_256, code)!;
    expect(upAuth(s, code, true)).toBe(false);                                      // nothing approved
    const a = act(1); a.hash = h;
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, a)).id; gId = id; signedBy([]);
    expect(upAuth(s, code, true)).toBe(false);                                      // 1 of 2 approvals
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
    expect(upAuth(s, code, true)).toBe(false);                                      // waiting period
    at(NOW + 2 * DAYMS);
    const other = new Uint8Array(64); other[0] = 8;
    expect(upAuth(s, other, true)).toBe(false);                                     // different code
    expect(upAuth(s, code, false)).toBe(false);                                     // would hand permissions back to the key
    expect(upAuth(s, code, true)).toBe(true);                                       // the approved code
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.executed).toBe(true);
    expect(upAuth(s, code, true)).toBe(false);                                      // only once
    const a2 = act(1); a2.hash = h;                                              // an approval that is too old expires
    signedBy([C1]); const id2 = s.propose(new station.propose_arguments(C1, a2)).id; gId = id2;
    signedBy([C3]); s.approve(new station.approve_arguments(C3, id2)); signedBy([]);
    at(NOW + 2 * DAYMS + 7 * DAYMS); expect(upAuth(s, code, true)).toBe(false);
  });
  it("KOIN withdrawal: 2 of 3, then 48 h; never below koin_amount; anyone executes once", () => {
    const s = setup(); gS = s; testSetBalance(1300 * M);                         // 300 above koin_amount (1,000)
    const a = act(2); a.to = OTHER; a.amount = 300 * M; gA = a;
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.propose(new station.propose_arguments(OWNER, gA)); }).toThrow(); // the owner isn't council
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, a)).id; gId = id; signedBy([]);
    MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); // 1 of 2
    signedBy([C1]); MockVM.commitTransaction(); expect(() => { gS!.approve(new station.approve_arguments(C1, gId)); }).toThrow(); // no double vote
    signedBy([C2]); expect(s.approve(new station.approve_arguments(C2, id)).ready_at).toBe(NOW + 2 * DAYMS); signedBy([]);
    at(NOW + 2 * DAYMS - 1000); MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); // still waiting
    at(NOW + 1000); s.execute(new station.execute_arguments(id));
    expect(testGetToken(Base58.decode("19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK"), OTHER)).toBe(300 * M);
    MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); // once
    const b = act(2); b.to = OTHER; b.amount = M; gA = b;                        // now at koin_amount: one more KOIN refused
    signedBy([C1]); const id2 = s.propose(new station.propose_arguments(C1, b)).id; gId = id2;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id2)); signedBy([]);
    at(NOW + 2 * DAYMS); MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow();
  });
  it("veto: any ONE council member cancels during the wait; a removed member's approval stops counting", () => {
    const s = setup(); gS = s; testSetBalance(1300 * M);
    const a = act(2); a.to = OTHER; a.amount = 100 * M;
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, a)).id; gId = id;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id));
    signedBy([C3]); s.cancel_proposal(new station.cancel_proposal_arguments(C3, id)); signedBy([]);
    at(NOW + 2 * DAYMS); MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow();
    expect(s.list_proposals(new station.list_proposals_arguments()).proposals.length).toBe(0);
    gA = a; signedBy([C1]); MockVM.commitTransaction(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); // AB-011: vetoed, 14 days
    const a1 = act(2); a1.to = OTHER; a1.amount = 90 * M; gA = a1;                          // AB-025: another amount to the
    clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); // same wallet: blocked too
    revertedWith("an action of this kind was vetoed less than 14 days ago");
    const a2 = act(2); a2.to = U1; a2.amount = 90 * M; gA = a2;                              // a withdrawal to another wallet:
    clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); // blocked too (AB-034)
    revertedWith("an action of this kind was vetoed less than 14 days ago");
    at(NOW + 14 * DAYMS);                                                                    // after the 14 days
    const pid = s.propose(new station.propose_arguments(C1, a2)).id; gId = pid;            // pending withdrawal (C1 only)
    signedBy([C2]); s.approve(new station.approve_arguments(C2, pid)); signedBy([]);           // ready in 48 h
    const nc = act(4); nc.council = [C1, C3, cm(4)]; nc.threshold = 2; councilDo(s, nc);        // C2 replaced (C1 + C2 vote)
    MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); // C2's vote no longer counts
    signedBy([C2]); MockVM.commitTransaction(); expect(() => { gS!.approve(new station.approve_arguments(C2, gId)); }).toThrow(); signedBy([]); // C2 is out
  });
  it("operators: the owner runs daily actions; a council member can only pull the emergency brake; money settings need the council", () => {
    const s = setup(); gS = s;
    signedBy([C3]); s.set_paused(new station.set_paused_arguments(true));                  // emergency brake
    MockVM.commitTransaction(); expect(() => { gS!.set_paused(new station.set_paused_arguments(false)); }).toThrow(); // only the owner resumes
    MockVM.commitTransaction(); expect(() => { gS!.connect_app(new station.connect_app_arguments(SOLDAPP, 5 * M, false)); }).toThrow(); // review H1
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(false));
    signedBy([OTHER]); MockVM.commitTransaction(); expect(() => { gS!.set_paused(new station.set_paused_arguments(true)); }).toThrow();
    signedBy([OWNER]);
    const c1 = cfg(); c1.owner = OTHER; gC = c1; MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow();
    const c2 = cfg(); c2.council = [C1, C2]; gC = c2; MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow();
    const c3 = cfg(); c3.guard_delay_ms = 3 * DAYMS; gC = c3; MockVM.commitTransaction(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow();
    const c4 = cfg(); c4.per_min = 9; s.set_config(new station.set_config_arguments(c4));     // everyday limits: fine
    signedBy([]);
    tx(C2, M, [op(STATION, 0x12345678)]); signedBy([C2]); expect(ok(s)).toBe(true);         // council votes are sponsored
    tx(OTHER, M, [op(STATION, 0x12345678)]); signedBy([OTHER]); expect(ok(s)).toBe(false);
  });
  it("rescue: only tokens sent by mistake above what escrow holds; escrowed funds can't be taken", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, U2, 10 * M, 7);                                      // 200,000 held in escrow
    testSetToken(USDT, STATION, testGetToken(USDT, STATION) + 50_000);           // someone sends 50,000 by mistake
    const big = act(3); big.token = USDT; big.to = OTHER; big.amount = 50_001;
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, big)).id; gId = id;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
    at(NOW + 2 * DAYMS); MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow();
    const ok2 = act(3); ok2.token = USDT; ok2.to = OTHER; ok2.amount = 50_000; councilDo(s, ok2);
    expect(testGetToken(USDT, OTHER)).toBe(50_000); expect(r.paid).toBe(200_000);
    inv(s, USDT);
  });
});

describe("connected apps (Oct 20): one list, one-step connect / disconnect", () => {
  it("connect, list, sponsor, update, disconnect; budget and sellable follow", () => {
    const s = setup(); gS = s;
    let L0 = s.list_connected(new station.list_connected_arguments());
    expect(L0.free_apps.length).toBe(2); expect(L0.sellable).toBe(40 * M);      // Knode + Stories (80 + 80 of 200)
    signedBy([OWNER]); const app = s.connect_app(new station.connect_app_arguments(SOLDAPP, 30 * M, false)).app; signedBy([]);
    const L1 = s.list_connected(new station.list_connected_arguments());
    expect(L1.free_apps.length).toBe(3); expect(L1.sellable).toBe(10 * M); expect(L1.reserved).toBe(190 * M);
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(true);                         // its users play free now
    const L2 = s.list_connected(new station.list_connected_arguments());
    let used: u64 = 0; for (let i = 0; i < L2.free_apps.length; i++) if (L2.free_apps[i].app == app) used = L2.free_apps[i].used_24h;
    expect(used).toBe(2 * M);
    signedBy([OWNER]); expect(s.connect_app(new station.connect_app_arguments(SOLDAPP, 20 * M, false)).app).toBe(app); // update in place
    MockVM.commitTransaction(); expect(() => { gS!.connect_app(new station.connect_app_arguments(OTHER, 50 * M, false)); }).toThrow(); // over budget
    MockVM.commitTransaction(); expect(() => { gS!.connect_app(new station.connect_app_arguments(USDT, 5 * M, false)); }).toThrow();  // token contract
    s.disconnect_app(new station.disconnect_app_arguments(SOLDAPP)); signedBy([]);
    at(NOW + 3000); expect(play(s, user(2), 2 * M, SOLDAPP)).toBe(false);        // no longer free
    const L3 = s.list_connected(new station.list_connected_arguments());
    expect(L3.free_apps.length).toBe(2); expect(L3.sellable).toBe(40 * M);
    signedBy([OTHER]); MockVM.commitTransaction(); expect(() => { gS!.connect_app(new station.connect_app_arguments(SOLDAPP, 5 * M, false)); }).toThrow(); signedBy([]); // operators only
  });
  it("list shows paid allowances with today's use and suspension; connect can't oversell what's sold", () => {
    const s = setup(); gS = s;
    buyAccount(s, U2, 30 * M, 7);                                                // sellable 40, sold 30
    expect(play(s, user(3), 2 * M, U2)).toBe(true);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 1)); signedBy([]);
    const L = s.list_connected(new station.list_connected_arguments());
    expect(L.paid.length).toBe(1); expect(L.paid[0].mana_per_day).toBe(30 * M); expect(L.paid[0].used_24h).toBe(2 * M);
    expect(L.paid[0].suspended).toBe(true); expect(L.sold).toBe(30 * M);
    signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.connect_app(new station.connect_app_arguments(SOLDAPP, 11 * M, false)); }).toThrow(); // 40 − 11 < 30 sold
    s.connect_app(new station.connect_app_arguments(SOLDAPP, 10 * M, false)); signedBy([]);
  });
});

describe("independent review of audit #1 (Oct 20): fixes", () => {
  it("C1: an approved upgrade must be the ONLY operation in its tx (no attacker code slipped in before it)", () => {
    const s = setup(); const code = new Uint8Array(64); code[0] = 7; const evil = new Uint8Array(64); evil[0] = 66;
    const a = act(1); a.hash = System.hash(Crypto.multicodec.sha2_256, code)!;
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, a)).id;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
    at(NOW + 2 * DAYMS);
    const t = new protocol.transaction(); const o1 = new protocol.operation(); const o2 = new protocol.operation();
    o1.upload_contract = new protocol.upload_contract_operation(STATION, evil, "", true, true, true);
    o2.upload_contract = new protocol.upload_contract_operation(STATION, code, "", true, true, true);
    t.operations = [o1, o2]; MockVM.setTransaction(t); System.resetCache();
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_upload)).value).toBe(false);
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.executed).toBe(false); // still available
    const t2 = new protocol.transaction(); const u = new protocol.operation();       // approved code first, then anything else
    u.upload_contract = new protocol.upload_contract_operation(STATION, code, "", true, true, true);
    t2.operations = [u, op(KOIN, EP_TRANSFER)]; MockVM.setTransaction(t2); System.resetCache();
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_upload)).value).toBe(false);
    expect(upAuth(s, code, true)).toBe(true);                                    // alone in its tx: accepted
  });
  it("H1: a member can't veto their own removal; M2: 3 open proposals per member; M3: delay capped at 30 days", () => {
    const s = setup(); gS = s; testSetBalance(1300 * M);
    const nc = act(4); nc.council = [C1, C2, cm(4)]; nc.threshold = 2;          // removes C3
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, nc)).id; gId = id;
    signedBy([C3]); MockVM.commitTransaction(); expect(() => { gS!.cancel_proposal(new station.cancel_proposal_arguments(C3, gId)); }).toThrow();
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
    at(NOW + 2 * DAYMS); s.execute(new station.execute_arguments(id));
    expect(s.get_status(new station.get_status_arguments()).config!.council.length).toBe(3);
    const w = act(2); w.to = OTHER; w.amount = M;
    signedBy([C1]); s.propose(new station.propose_arguments(C1, w)); s.propose(new station.propose_arguments(C1, w)); s.propose(new station.propose_arguments(C1, w)); gA = w;
    MockVM.commitTransaction(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); // 4th from the same member
    signedBy([C2]); s.propose(new station.propose_arguments(C2, w));             // another member still can
    const d = act(5); d.delay_ms = 31 * DAYMS; gA = d;
    MockVM.commitTransaction(); expect(() => { gS!.propose(new station.propose_arguments(C2, gA)); }).toThrow(); signedBy([]);
  });
  it("L1: a council change restarts the wait on open proposals; L4: no refunds to operators' own purchases", () => {
    const s = setup(); gS = s; testSetBalance(1300 * M);
    const w = act(2); w.to = OTHER; w.amount = M;
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, w)).id; gId = id;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id)); signedBy([]);
    const nc = act(4); nc.council = [C1, C2, C3, cm(4)]; nc.threshold = 2; councilDo(s, nc); // 48 h later: council grows
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.ready_at).toBe(NOW + 2 * DAYMS); // fresh wait
    MockVM.commitTransaction(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow();
    at(NOW + 2 * DAYMS); s.execute(new station.execute_arguments(id));
    testSetToken(USDT, C1, 10 * USD);
    signedBy([C1, U2]); const r = s.buy_allowance(new station.buy_allowance_arguments(C1, 1, U2, 10 * M, 7, USDT, 1000 * USD)); signedBy([]);
    gId = r.id; signedBy([OWNER]); MockVM.commitTransaction(); expect(() => { gS!.owner_refund(new station.owner_refund_arguments(gId, null)); }).toThrow(); signedBy([]);
  });
  it("M1: station-paid admin txs follow the per-user limits; L2: set_exempt only to real slots, connect never edits a shared slot", () => {
    const s = setup(); gS = s;
    let n = 0; for (let i = 0; i < 8; i++) { at(NOW + 1000); tx(OWNER, M, [op(STATION, 0x12345678)]); signedBy([OWNER]); if (ok(s)) n++; }
    expect(n).toBe(5);                                                           // 5 per minute, then the cooldown
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.set_exempt(new station.set_exempt_arguments(SOLDAPP, new station.exempt_object(9, false), false)); }).toThrow();
    s.set_exempt(new station.set_exempt_arguments(SOLDAPP, new station.exempt_object(1, false), false)); // shares Knode's slot 1
    const id = s.connect_app(new station.connect_app_arguments(SOLDAPP, 10 * M, false)).app;
    expect(id).not.toBe(1);                                                      // gets its own slot…
    expect(s.get_app(new station.get_app_arguments(1)).app!.reserved_mana).toBe(80 * M); // …Knode's is untouched
    signedBy([]);
  });
});
