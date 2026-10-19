/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, VUSDT, VUSDC } from "../Station";
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
function user(i: i32): Uint8Array { const u = new Uint8Array(25); u[1] = u8(i / 100); u[2] = u8(i % 100); u[24] = 7; return u; }
// Small test station: 1,000 KOIN → daily budget 200 Mana (20%). Reservations Knode 80, Stories 80 → sellable 40 (derived).
function cfg(): station.config_object {
  const c = new station.config_object();
  c.owner = OWNER; c.koin_amount = 1000 * M; c.refill_bp = 2000; c.admin_min = 5 * M; c.hard_max = 3 * M;
  c.per_min = 5; c.cooldown_ms = 600_000; c.day_actions = 25; c.day_mana = 60 * M;
  c.new_actions = 10; c.new_mana = 25 * M; c.new_pct = 100; c.max_ops = 2;
  c.big_max = 300 * M; c.big_cooldown_ms = DAYMS; c.big_week_cap = 500 * M; c.big_max_debt = 400 * M; c.big_ticket_ms = 3 * DAYMS;
  c.max_allowances = 8; c.max_days = 90;
  return c;
}
function setup(): Station {
  MockVM.reset();
  MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); MockVM.setEntryPoint(0);
  MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
  MockVM.setContractMetadata(new chain.contract_metadata_object(new Uint8Array(0), false, false, false, true));
  MockVM.setHeadInfo(new chain.head_info(null, 0, 1));
  at(T0);
  testSetMana(1000 * M); testSetBalance(1000 * M);
  const s = new Station();
  signedBy([STATION]); s.init(new station.init_arguments(cfg()));
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
  signedBy([BUYER]);
  const r = s.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, target, manaPerDay, days, USDT, 1000 * USD));
  signedBy([]); return r;
}
let gS: Station | null = null;
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

describe("v1 rules still hold", () => {
  it("approved call sponsored; transfers, unknown contracts/entry points, uploads, over-cap refused", () => {
    const s = setup();
    expect(play(s, U1)).toBe(true);
    at(NOW + 70_000);
    tx(U1, 2 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(false);
    tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);
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
    expect(u.cooldown_until).toBe(NOW + 600_000);
    at(NOW + 120_000); expect(play(s, U1)).toBe(false);
    at(u.cooldown_until + 1); expect(play(s, U1)).toBe(true);
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
    for (let i = 0; i < 60; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    expect(n).toBe(50);                                                     // 50 × 2 = 100 Mana, no overflow (sellable 0)
    expect(s.get_app(new station.get_app_arguments(1)).allowance).toBe(100 * M);
    expect(play(s, user(200), 2 * M, STORIES)).toBe(true);
    at(NOW + DAYMS + 2 * HOUR); expect(play(s, user(300))).toBe(true);
  });
  it("beyond the reservation, exempt usage spills into the unsold sellable slice, then stops", () => {
    const s = setup(); let n = 0;
    for (let i = 0; i < 70; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    expect(n).toBe(60);                                                     // 80 reserved + 40 sellable
    buyAccount(s, U2, 10 * M, 7);                                            // a 7-day sale takes sellable capacity
    at(NOW + DAYMS + 2 * HOUR); n = 0;
    for (let i = 100; i < 170; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    expect(n).toBe(55);                                                     // 80 + (40 − 10 sold) = 110 Mana
  });
  it("only the owner can exceed it, with an explicit expiring boost", () => {
    const s = setupA();
    for (let i = 0; i < 50; i++) { at(NOW + 3000); play(s, user(i)); }
    at(NOW + 3000); expect(play(s, user(99))).toBe(false);
    signedBy([U1]);
    gS = s; MockVM.commitTransaction(); expect(() => { gS!.set_app(new station.set_app_arguments(1, new station.app_object(100 * M, true, 20 * M, NOW + HOUR))); }).toThrow();
    signedBy([OWNER]); s.set_app(new station.set_app_arguments(1, new station.app_object(100 * M, true, 20 * M, NOW + HOUR))); signedBy([]);
    at(NOW + 3000); expect(play(s, user(99))).toBe(true);
    at(NOW + 2 * HOUR); expect(play(s, user(98))).toBe(false);              // boost expired
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
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
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
    expect(testGetToken(USDT, STATION)).toBe(r.paid);                         // treasury = station by default
    let n = 0;
    for (let i = 0; i < 8; i++) { at(NOW + 70_000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); if (ok(s)) n++; }
    expect(n).toBe(5);                                                        // 10 Mana/day
    expect(s.get_app(new station.get_app_arguments(1)).used_24h).toBe(0);     // never touches Carl's apps
    at(r.expiry + 1); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);  // auto cut-off
    signedBy([BUYER]); s.renew(new station.renew_arguments(BUYER, r.id, 1, USDT, 1000 * USD)); signedBy([]);
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);
  });
  it("app allowance: any user of the bought contract, with per-user limits", () => {
    const s = setup();
    signedBy([BUYER]); s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, SOLDAPP, 20 * M, 7, USDT, 1000 * USD)); signedBy([]);
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(true);
    expect(play(s, user(1), 2 * M, SOLDAPP)).toBe(false);                     // same block
    at(NOW + 3000); expect(play(s, user(2), 2 * M, SOLDAPP)).toBe(true);
  });
  it("sold slice is a hard cap; quotes, per-purchase max, legacy token, signer checks", () => {
    const s = setup(); gS = s;
    buyAccount(s, U1, 30 * M, 1);
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 11 * M, 1, USDT, 1000 * USD)); }).toThrow(); // 30+11 > 40
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDT, 1)); }).toThrow();          // over max_price
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDC, 1000 * USD)); }).toThrow(); // USDC not priced
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U1, 5 * M, 1, USDT, 1000 * USD)); }).toThrow(); // target already has one
    signedBy([U2]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 5 * M, 1, USDT, 1000 * USD)); }).toThrow(); // buyer must sign
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
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true); // term still served
    expect(buyAccount(s, U1, 10 * M, 7).paid).toBe(400_000);                    // new purchase: new price
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 7, USDT, 200_000)); }).toThrow(); // old price not honoured for a renewal
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
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 3, USDT, 1000 * USD)); }).toThrow();
    const p = PRICE(); p.price_30d = 0;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 30)).reason!).toBe("days must be 1, 7 or 30");
  });
  it("big-upload minimum enforced; mainnet minimum 5,000 Mana = 25,000,000", () => {
    const s = setup(); gS = s;
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 49 * M)).reason!).toBe("below the big-upload minimum");
    signedBy([BUYER]);
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
    const bal = testGetToken(USDT, BUYER); const rev = testGetToken(USDT, STATION);
    at(r.expiry + 40 * DAYMS);
    tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.expiry).toBe(r.expiry);
    expect(testGetToken(USDT, BUYER)).toBe(bal); expect(testGetToken(USDT, STATION)).toBe(rev);
    signedBy([U1]);                                                              // someone else can't renew on the buyer's tokens
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([OWNER]);                                                           // nor the owner
    MockVM.commitTransaction(); expect(() => { gS!.renew(new station.renew_arguments(BUYER, 1, 1, USDT, 1000 * USD)); }).toThrow();
    signedBy([]);
    expect(testGetToken(USDT, BUYER)).toBe(bal);
  });
});

describe("big uploads from the reserve", () => {
  it("prepaid ticket ignores the daily limit, bounded by floor, per-request max, cooldown, weekly cap and debt", () => {
    const s = setup(); gS = s;
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 301 * M, USDT, 1000 * USD, true)); }).toThrow(); // > big_max
    const r = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 300 * M, USDT, 1000 * USD, true));
    expect(r.paid).toBe(1_500_000);                                          // 300/1,000 × 0.05
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(300 * M);
    signedBy([]);
    tx(U1, 150 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);          // far above hard_max: ticket pays
    const own = new protocol.operation(); own.upload_contract = new protocol.upload_contract_operation(U1, new Uint8Array(4));
    const foreign = new protocol.operation(); foreign.upload_contract = new protocol.upload_contract_operation(U2, new Uint8Array(4));
    at(NOW + 3000); tx(U1, 100 * M, [own]); expect(ok(s)).toBe(true);          // payee's own contract
    at(NOW + 3000); tx(U1, 10 * M, [foreign]); expect(ok(s)).toBe(false);      // someone else's
    at(NOW + 3000); tx(U1, 60 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // only 50 left on the ticket
    testSetMana(205 * M + 10 * M - 1);
    at(NOW + 3000); tx(U1, 10 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // big floor = 5 + 200
    testSetMana(1000 * M);
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, false)); }).toThrow(); // cooldown
    at(NOW + DAYMS + 1000);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 200 * M, USDT, 1000 * USD, false)); }).toThrow(); // debt 260 + 200 > 400
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, false));
    at(NOW + DAYMS + 1000);
    MockVM.commitTransaction(); expect(() => { gS!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, user(5), 120 * M, USDT, 1000 * USD, false)); }).toThrow(); // week 400 + 120 > 500
    signedBy([]);
  });
  it("debt pauses the sold slice until repaid; Carl's apps keep working; close_ticket releases unused Mana", () => {
    const s = setup();
    const a = buyAccount(s, U2, 10 * M, 30);
    signedBy([BUYER]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 80 * M, USDT, 1000 * USD, false)); signedBy([]);
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);   // sold slice repaying
    expect(play(s, user(1))).toBe(true);                                             // Knode unaffected
    at(NOW + DAYMS); expect(s.get_status(new station.get_status_arguments()).big_debt).toBeLessThan(41 * M); // 40/day repaid
    gS = s; MockVM.commitTransaction(); expect(() => { gS!.close_ticket(new station.close_ticket_arguments(U1)); }).toThrow(); // still valid
    at(NOW + 2 * DAYMS + 1000);                                                      // ticket expired unused
    s.close_ticket(new station.close_ticket_arguments(U1));
    expect(s.get_status(new station.get_status_arguments()).big_debt).toBe(0);
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);    // sold slice back
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
    tx(U1, 2 * M, [op(OTHER, EP_NOPE)]); expect(ok(s)).toBe(false);
    expect(play(s, U1)).toBe(true);                                                // reserved Knode still works
  });
  it("exempt usage counts toward the 20% station-wide cap", () => {
    const s = setup();
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(1, false), false)); signedBy([]);
    let n = 0;                                                                     // OTHER shares Knode's reservation
    for (let i = 0; i < 40; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }
    for (let i = 40; i < 80; i++) { at(NOW + 3000); tx(user(i), 2 * M, [op(OTHER, EP_NOPE)]); if (ok(s)) n++; }
    for (let i = 80; i < 130; i++) { at(NOW + 3000); if (play(s, user(i), 2 * M, STORIES)) n++; }
    expect(n).toBe(100);                                                           // 80 + 40 + 80 = 200 = 20% of 1,000
    expect(s.get_status(new station.get_status_arguments()).used_24h).toBe(200 * M);
  });
});

describe("treasury, revenue, refunds, admin", () => {
  it("treasury = Carl's wallet: payment lands there; on-chain withdraw is refused", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]); const c = cfg(); c.treasury = OWNER; s.set_config(new station.set_config_arguments(c)); signedBy([]);
    const r = buyAccount(s, U2, 10 * M, 1);
    expect(testGetToken(USDT, OWNER)).toBe(r.paid);
    signedBy([OWNER]);
    MockVM.commitTransaction(); expect(() => { gS!.withdraw_revenue(new station.withdraw_revenue_arguments(USDT, OWNER, 1)); }).toThrow();
    signedBy([]);
  });
  it("treasury = station: owner withdraws to Carl; owner cancel with optional refund", () => {
    const s = setup(); gS = s;
    const r = buyAccount(s, U2, 10 * M, 30);                                  // 750,000 = 0.0075 vUSDT
    signedBy([U1]);
    MockVM.commitTransaction(); expect(() => { gS!.withdraw_revenue(new station.withdraw_revenue_arguments(USDT, U1, 1)); }).toThrow();
    signedBy([OWNER]);
    s.withdraw_revenue(new station.withdraw_revenue_arguments(USDT, OWNER, 500_000));
    expect(testGetToken(USDT, OWNER)).toBe(500_000);
    s.cancel_allowance(new station.cancel_allowance_arguments(r.id, USDT, 200_000));
    expect(testGetToken(USDT, BUYER)).toBe(1000 * USD - r.paid + 200_000);
    signedBy([]);
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false); // cancelled
  });
  it("kill switch: pause stops sponsorship and buys; owner can unpause with station Mana", () => {
    const s = setup(); gS = s;
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    expect(play(s, U1)).toBe(false);
    signedBy([BUYER]);
    MockVM.commitTransaction(); expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDT, 1000 * USD)); }).toThrow();
    testSetMana(4 * M);                                                        // below admin_min
    tx(OWNER, 1 * M, [op(STATION, 0x12345678)]); expect(ok(s)).toBe(false);
    signedBy([OWNER]); expect(ok(s)).toBe(true);
    s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    tx(null, 2 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(false);
    signedBy([STATION]); expect(ok(s)).toBe(true);                            // station key's own tx
  });
});
