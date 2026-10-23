// audit-fixes-1 regression tests (Mana Station, 2026-10-22): the owner's decisions on the first Audit Bot audit, the
// AB-017 boundary tests for the non-equivalent mutation survivors, and the authorize-cost probe at the new caps.
// Helpers below are copied unchanged from assembly/__tests__/Station.spec.ts (lines 1-117), as in the other audit specs.
/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, testSetContract, testRealSlotFee, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
import { station } from "../proto/station";
import { clearRevert, lastRevert, revertedWith } from "./lib/revert";   // AB-031 (audit-fixes-1)

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
/** set_config is refused, and (AB-031) for the reason `msg`. */
function refusedConfig(s: Station, c: station.config_object, why: string, msg: string): void {
  gS1 = s; gC1 = c; signedBy([OWNER]); MockVM.commitTransaction(); clearRevert();
  expect(() => { gS1!.set_config(new station.set_config_arguments(gC1)); }).toThrow(why); revertedWith(msg, why); signedBy([]);
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
/** `who` proposes `a` and is refused, for the reason `msg` (AB-031). (It used to always propose as C1.) */
let gWho1: Uint8Array = new Uint8Array(0);
function refusedPropose(s: Station, who: Uint8Array, a: station.guarded_action, why: string, msg: string): void {
  gS1 = s; gA1 = a; gWho1 = who; signedBy([who]); MockVM.commitTransaction(); clearRevert();
  expect(() => { gS1!.propose(new station.propose_arguments(gWho1, gA1)); }).toThrow(why); revertedWith(msg, why); signedBy([]);
}

describe("AB-002 slot squat: Mana sold decides, passes have a minimum charge, targets count per wallet", () => {
  it("below open_cap, Mana sold decides: with 50 tiny passes open and open_cap 100, an honest small buyer still buys", () => {
    const s = setupWide(); const c = cfg(); c.open_cap = 100; setConfig(s, c);   // at open_cap 50 the 51st is refused (see below)
    for (let b = 0; b < 10; b++) {
      const B = user(600 + b); testSetToken(USDT, B, 10 * USD);
      for (let k = 0; k < 5; k++) buyPass(s, B, user(700 + b * 5 + k), 1 * M, 1);
    }
    expect(s.list_connected(new station.list_connected_arguments()).paid.length).toBe(50);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 5 * M, 1, 2));
    expect(q.available).toBe(true, "50 of 180 sellable Mana sold: a 5-Mana pass still fits");
    expect(buyPass(s, U1, U1, 5 * M, 1).paid).toBe(q.price);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 5 * M, 7, 1)).available).toBe(true, "an app plan too");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 126 * M, 1, 2)).reason!).toBe("sold capacity full"); // 55 + 126 > 180
  });
  it("a pass minimum charge (pass_min_purchase) is shown in the quote, charged, and kept on cancel; plans keep min_purchase", () => {
    const s = setupWide(); const p = PRICE(); p.pass_min_purchase = 25_000_000;   // $0.25, as proposed for mainnet
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const qp = s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2));
    expect(qp.price).toBe(25_000_000); expect(qp.min_charge).toBe(25_000_000);
    const qa = s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 1));
    expect(qa.price).toBe(3_000); expect(qa.min_charge).toBe(0);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1)).price).toBe(25_000_000); // kind not given: the higher
    const r = buyPass(s, U1, U1, 1 * M, 7);
    expect(r.paid).toBe(25_000_000, "7-day 1-Mana pass would be 20,000; the pass minimum applies");
    expect(cancelBy(s, U1, r.id).refund).toBe(0, "the minimum charge is kept on a buyer cancel");
    const plan = buyAccount(s, SOLDAPP, 1 * M, 7);
    expect(plan.paid).toBe(20_000, "app plans are not affected by the pass minimum");
    inv(s, USDT);
  });
  it("allowances FOR a wallet count toward its open limit, and a target already at the limit can't get another", () => {
    const s = setupWide(); const X = user(650), Y = user(651), Z = user(652), W = user(653);
    testSetToken(USDT, X, 10 * USD); testSetToken(USDT, Y, 10 * USD); testSetToken(USDT, Z, 10 * USD); testSetToken(USDT, W, 10 * USD);
    for (let k = 0; k < 5; k++) buyPass(s, X, user(660 + k), 1 * M, 1);          // X: 5 open
    gS1 = s; gB1 = new station.buy_allowance_arguments(Y, 2, X, 1 * M, 1, USDT, 1000 * USD); signedBy([Y, X]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("X already has 5 open: it can't be the target of a 6th"); revertedWith("the target already has the most open allowances and tickets allowed"); signedBy([]);
    buyPass(s, W, Z, 1 * M, 1);                                                  // Z is the target of one pass…
    for (let k = 0; k < 4; k++) buyPass(s, Z, user(670 + k), 1 * M, 1);         // …so Z may buy only 4 more
    gB1 = new station.buy_allowance_arguments(Z, 2, user(675), 1 * M, 1, USDT, 1000 * USD); signedBy([Z, user(675)]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("Z: 1 for it + 4 bought = 5"); revertedWith("this wallet already has the most open allowances and tickets allowed"); signedBy([]);
  });
  it("cost probe at 50, 100 and 256 open allowances (open_cap 256); the 257th is refused", () => {
    const s = setup(); testSetBalance(5000 * M); testSetMana(5000 * M);
    const c = cfg(); c.koin_amount = 5000 * M; c.open_cap = 256; setConfig(s, c); // budget 1,000; sellable 840
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false)); signedBy([]);
    let n = 0;
    for (let b = 0; b < 52 && n < 256; b++) {
      const B = user(1000 + b); testSetToken(USDT, B, 10 * USD);
      for (let k = 0; k < 5 && n < 256; k++) {
        const T = user(2000 + n); const kind: u32 = n < 246 ? 2 : 1;          // Oct 22: the last 10 slots are for app plans
        if (kind == 1) testSetContract(T, true);                                //   on deployed contracts (app_reserved 0 = 10)
        if (n == 50 || n == 100 || n == 255) {
          // heaviest authorize route (an unreserved free app: it sums every open allowance), with n open
          at(NOW + 61_000); tx(user(3000 + n), 1 * M, [op(OTHER, EP_PLAY)]); costBegin(); const okA = ok(s); costEnd(n); expect(okA).toBe(true);
          // buy_allowance with n open (it sweeps, cleans, counts the buyer and target, and quotes)
          signedBy([B, T]); costBegin(); s.buy_allowance(new station.buy_allowance_arguments(B, kind, T, 1 * M, 1, USDT, 1000 * USD)); costEnd(9000 + n); signedBy([]);
        } else if (kind == 2) buyPass(s, B, T, 1 * M, 1);
        else { signedBy([B, T]); s.buy_allowance(new station.buy_allowance_arguments(B, 1, T, 1 * M, 1, USDT, 1000 * USD)); signedBy([]); }
        n++;
      }
    }
    expect(s.list_connected(new station.list_connected_arguments()).paid.length).toBe(256);
    at(NOW + 61_000); tx(U2, 1 * M, [op(OTHER, EP_PLAY)]); costBegin(); const okFree = ok(s); costEnd(256);
    expect(okFree).toBe(true);
    at(NOW + 61_000); tx(user(2000), 1 * M, [op(SOLDAPP, EP_PLAY)]); costBegin(); const okPass = ok(s); costEnd(1256); // a pass
    expect(okPass).toBe(true);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2));
    expect(q.available).toBe(false); expect(q.reason!).toBe("too many open allowances");
  });
  it("open_cap: set_config needs 1 to 256; a stored 0 (config from before the field) reads as 50", () => {
    const s = setupWide();
    const z = cfg(); z.open_cap = 0; refusedConfig(s, z, "open_cap 0", "open_cap: 1 to 256 open allowances");
    const big = cfg(); big.open_cap = 257; refusedConfig(s, big, "open_cap 257", "open_cap: 1 to 256 open allowances");
    const top = cfg(); top.open_cap = 256; setConfig(s, top);
    // Oct 22: open_cap must also stay above app_reserved (0 = 10), so the smallest working cap is 2 with app_reserved 1.
    const one = cfg(); one.open_cap = 2; one.app_reserved = 1; setConfig(s, one);
    buyPass(s, U1, U1, 1 * M, 1);
    testSetContract(SOLDAPP, true); buyAccount(s, SOLDAPP, 1 * M, 1);          // the reserved slot: an app plan on a contract
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2)).reason!).toBe("too many open allowances"); // 2 open = cap 2
    const legacy = s.config.get()!; legacy.open_cap = 0; legacy.app_reserved = 0; s.config.put(legacy); // as stored before the fields existed
    for (let b = 0; b < 10; b++) {
      const B = user(600 + b); testSetToken(USDT, B, 10 * USD);
      for (let k = 0; k < 5 && 2 + b * 5 + k < 40; k++) buyPass(s, B, user(700 + b * 5 + k), 1 * M, 1);
    }
    expect(s.list_connected(new station.list_connected_arguments()).paid.length).toBe(40);  // U1's + SOLDAPP's + 38
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2)).reason!).toBe("the last open slots are kept for app plans on deployed contracts", "0 reads as 10 kept back");
    for (let i = 0; i < 9; i++) {                                                // the reserved slots, up to 49
      const B = user(800 + i), A = user(850 + i); testSetToken(USDT, B, 10 * USD); testSetContract(A, true);
      signedBy([B, A]); s.buy_allowance(new station.buy_allowance_arguments(B, 1, A, 1 * M, 1, USDT, 1000 * USD)); signedBy([]);
    }
    const T = user(691); testSetContract(T, true);
    const qa = new station.quote_allowance_arguments(USDT, 1 * M, 1, 1); qa.target = T;
    expect(s.quote_allowance(qa).available).toBe(true, "49 open: below the default 50 for an app plan on a contract");
    signedBy([BUYER, T]); s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, T, 1 * M, 1, USDT, 1000 * USD)); signedBy([]);
    const q = s.quote_allowance(qa);
    expect(q.available).toBe(false, "50 open: 0 reads as 50"); expect(q.reason!).toBe("too many open allowances");
  });
  it("squat at open_cap 50 (Oct 22): the 40 non-reserved slots for one day cost at least 40 slot fees + 20 pass minimums; the 41st is refused, a contract's app plan still fits", () => {
    const s = setupWide(); const p = PRICE(); p.pass_min_purchase = 25_000_000;     // $0.25, as proposed for mainnet
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);              // $0.02 a day; app_reserved 0 = 10
    let paid: u64 = 0; let first: u32 = 0;
    for (let b = 0; b < 10; b++) {                                                 // 20 passes + 20 plans on plain wallets
      const B = user(600 + b); testSetToken(USDT, B, 10 * USD);
      for (let k = 0; k < 4; k++) {
        const T = user(700 + b * 4 + k); const kind: u32 = k < 2 ? 2 : 1;
        signedBy([B, T]); const r = s.buy_allowance(new station.buy_allowance_arguments(B, kind, T, 1 * M, 1, USDT, 1000 * USD)); signedBy([]);
        paid += r.paid; if (first == 0) first = r.id;
      }
    }
    log<string>("40 one-day slots (20 passes, 20 plans on wallets) cost " + paid.toString() + " base units");
    expect(paid).toBeGreaterThanOrEqual(40 * 2_000_000 + 20 * 25_000_000, "at least 40 x $0.02 + 20 x $0.25");
    expect(s.get_status(new station.get_status_arguments()).open_allowances).toBe(40);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2));
    expect(q.available).toBe(false); expect(q.reason!).toBe("the last open slots are kept for app plans on deployed contracts");
    expect(q.min_charge).toBe(25_000_000, "the quote shows the minimum charge"); expect(q.slot_fee).toBe(2_000_000);
    expect(q.price).toBe(27_000_000, "pass minimum + one day's slot fee");
    const X = user(900); testSetToken(USDT, X, 10 * USD);
    gS1 = s; gB1 = new station.buy_allowance_arguments(X, 2, X, 1 * M, 1, USDT, 1000 * USD); signedBy([X]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("the 41st pass is refused"); revertedWith("the last open slots are kept for app plans on deployed contracts"); signedBy([]);
    const W = user(901);                                                           // a plain wallet as an app-plan target
    gB1 = new station.buy_allowance_arguments(X, 1, W, 1 * M, 1, USDT, 1000 * USD); signedBy([X, W]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("an app plan on a wallet is refused too"); revertedWith("the last open slots are kept for app plans on deployed contracts"); signedBy([]);
    const qw = new station.quote_allowance_arguments(USDT, 1 * M, 1, 1); qw.target = W;
    expect(s.quote_allowance(qw).available).toBe(false, "quote for a wallet target");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 1)).available).toBe(false, "no target given: not a contract");
    testSetContract(SOLDAPP, true);                    // MockVM stand-in for get_contract_metadata (testnet check in LAUNCH.md)
    const qc = new station.quote_allowance_arguments(USDT, 1 * M, 1, 1); qc.target = SOLDAPP;
    expect(s.quote_allowance(qc).available).toBe(true, "a deployed contract may use the reserved slots");
    signedBy([X, SOLDAPP]); expect(s.buy_allowance(new station.buy_allowance_arguments(X, 1, SOLDAPP, 1 * M, 1, USDT, 1000 * USD)).paid).toBe(2_003_000); signedBy([]);
    signedBy([user(600)]);                                                     // a renewal of an open allowance is not refused
    expect(s.renew(new station.renew_arguments(user(600), first, 1, USDT, 1000 * USD)).paid).toBe(27_000_000, "and pays its own slot fee");
    signedBy([]); inv(s, USDT);
  });
});

describe("Slot fee and slots kept for real apps (owner decision, Oct 22)", () => {
  it("the slot fee shows in the quote, counts toward max_price, is kept for days held and refunded for unused days; renewals pay it again", () => {
    const s = setupWide();
    const qb0 = s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).price;
    const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).price).toBe(qb0, "big-upload tickets pay no slot fee");
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7, 1));
    expect(q.slot_fee).toBe(14_000_000, "7 days x $0.02"); expect(q.price).toBe(14_200_000, "Mana 200,000 + slot fee 14,000,000");
    gS1 = s; gB1 = new station.buy_allowance_arguments(BUYER, 1, SOLDAPP, 10 * M, 7, USDT, q.price - 1); signedBy([BUYER, SOLDAPP]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("max_price must cover the slot fee too"); revertedWith("price above the accepted quote");
    const r = s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, SOLDAPP, 10 * M, 7, USDT, q.price)); signedBy([]);
    expect(r.paid).toBe(14_200_000);
    at(NOW + HOUR); const b0 = bal(BUYER);
    // Mana: the used day at the 1-day price (30,000) -> 170,000 back; slot fee: 6 unused days -> 12,000,000 back.
    expect(cancelBy(s, BUYER, r.id).refund).toBe(12_170_000); expect(bal(BUYER) - b0).toBe(12_170_000);
    at(NOW + DAYMS); expect(s.release(new station.release_arguments(1)).amount).toBe(2_030_000, "kept: 1 day's slot fee + 1 day's Mana");
    // Pass with the minimum charge: the minimum is kept, the unused days' slot fee still comes back.
    const p = PRICE(); p.pass_min_purchase = 25_000_000; signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const pr = buyPass(s, U1, U1, 1 * M, 7);
    expect(pr.paid).toBe(39_000_000, "pass minimum 25,000,000 + 7 x 2,000,000");
    expect(cancelBy(s, U1, pr.id).refund).toBe(12_000_000, "6 unused days' slot fee; the minimum charge stays");
    // Renewal: the new term pays its own slot fee and, cancelled before it starts, comes back whole.
    const r2 = buyAccount(s, U2, 10 * M, 1);
    expect(r2.paid).toBe(2_030_000);
    signedBy([BUYER]); const rn = s.renew(new station.renew_arguments(BUYER, r2.id, 7, USDT, 1000 * USD)); signedBy([]);
    expect(rn.paid).toBe(14_200_000, "the renewal pays 7 days of slot fee");
    const a2 = s.get_allowance(new station.get_allowance_arguments(r2.id)).allowance!;
    const e = s.get_escrow(new station.get_escrow_arguments(a2.purchase_ids[1])).purchase!;
    expect(e.slot_fee_per_day).toBe(2_000_000); expect(e.amount).toBe(14_200_000);
    expect(cancelBy(s, BUYER, r2.id).refund).toBe(14_200_000, "future term: nothing held yet, all of it back");
    inv(s, USDT);
  });
  it("an owner refund (buyer not at fault) returns the unused days' share of the whole price, slot fee included", () => {
    const s = setupWide(); const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);
    const r = buyAccount(s, SOLDAPP, 10 * M, 7); at(NOW + HOUR);
    signedBy([OWNER]); const x = s.owner_refund(new station.owner_refund_arguments(r.id)); signedBy([]);
    expect(x.refund).toBe(mulDiv(14_200_000, 6, 7));
    inv(s, USDT);
  });
  it("bounds and defaults: slot_fee_per_day up to $1 (0 only in a testing build, else 0 reads as $0.02); app_reserved below open_cap (0 = 10)", () => {
    const s = setupWide();
    const hi = cfg(); hi.slot_fee_per_day = 100_000_001; refusedConfig(s, hi, "slot fee above $1", "slot fee above $1 a day");
    const top = cfg(); top.slot_fee_per_day = 100_000_000; setConfig(s, top);
    const zero = cfg(); setConfig(s, zero);                                         // testing build: 0 = no fee
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7, 1)).slot_fee).toBe(0);
    testRealSlotFee(true);                                                          // the mainnet (and testnet) rule
    refusedConfig(s, cfg(), "slot fee 0 on a real build", "slot_fee_per_day must be above 0 (0 only in a testing build)");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7, 1)).slot_fee).toBe(14_000_000, "stored 0 reads as $0.02 a day");
    expect(s.get_status(new station.get_status_arguments()).slot_fee_per_day).toBe(2_000_000);
    const one = cfg(); one.slot_fee_per_day = 1; setConfig(s, one);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 7, 1)).slot_fee).toBe(7);
    testRealSlotFee(false);
    const r0 = cfg(); r0.open_cap = 10; refusedConfig(s, r0, "app_reserved 0 = 10 is not below open_cap 10", "app_reserved (0 = 10) must be below open_cap");
    const r1 = cfg(); r1.open_cap = 11; setConfig(s, r1);
    const r2 = cfg(); r2.app_reserved = 50; refusedConfig(s, r2, "app_reserved 50 = open_cap 50", "app_reserved (0 = 10) must be below open_cap");
    const r3 = cfg(); r3.app_reserved = 49; setConfig(s, r3);
    expect(s.get_status(new station.get_status_arguments()).app_reserved).toBe(49);
    const legacy = s.config.get()!; legacy.open_cap = 0; legacy.app_reserved = 0; s.config.put(legacy); // stored before the fields
    const st = s.get_status(new station.get_status_arguments());
    expect(st.open_cap).toBe(50); expect(st.app_reserved).toBe(10); expect(st.open_allowances).toBe(0);
  });
  it("get_status shows open allowances, open_cap and app_reserved (for the 80% warning)", () => {
    const s = setupWide();
    buyPass(s, U1, U1, 1 * M, 1); buyAccount(s, SOLDAPP, 1 * M, 1);
    const st = s.get_status(new station.get_status_arguments());
    expect(st.open_allowances).toBe(2); expect(st.open_cap).toBe(50); expect(st.app_reserved).toBe(10);
    at(NOW + DAYMS);
    expect(s.get_status(new station.get_status_arguments()).open_allowances).toBe(0, "expired ones don't count");
  });
});

describe("AB-001 owner powers", () => {
  it("ticket lifetime is 1 h to 7 days (0 = 24 h), shown in the quote; a buyer refuses a shorter one than it saw", () => {
    const s = setup();
    const c0 = cfg(); c0.big_ticket_ms = HOUR - 1; refusedConfig(s, c0, "below 1 hour", "ticket lifetime: 1 hour to 7 days (0 = 24 h)");
    const c1 = cfg(); c1.big_ticket_ms = 7 * DAYMS + 1; refusedConfig(s, c1, "above 7 days", "ticket lifetime: 1 hour to 7 days (0 = 24 h)");
    const c2 = cfg(); c2.big_ticket_ms = 0; setConfig(s, c2);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).lifetime_ms).toBe(DAYMS);
    const c3 = cfg(); c3.big_ticket_ms = 7 * DAYMS; setConfig(s, c3);
    const c4 = cfg(); c4.big_ticket_ms = HOUR; setConfig(s, c4);
    expect(s.quote_big_upload(new station.quote_big_upload_arguments(USDT, 50 * M)).lifetime_ms).toBe(HOUR);
    gS1 = s; gT1 = new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, true, DAYMS);
    signedBy([BUYER, U2]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.buy_big_upload(gT1!); }).toThrow("the buyer saw 24 h; the lifetime is now 1 h"); revertedWith("ticket lifetime below what the buyer accepted");
    const r = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, true, HOUR)); signedBy([]);
    expect(r.expiry).toBe(NOW + HOUR);
  });
  it("settings that would stop paid service are refused (hard_max, admin_min, per-user limits)", () => {
    const s = setup();
    const a = cfg(); a.hard_max = M - 1; refusedConfig(s, a, "hard_max below 1 Mana", "hard_max below 1 Mana would stop paid service");
    const b = cfg(); b.admin_min = 100 * M + 1; refusedConfig(s, b, "admin_min above 10% of koin_amount", "admin_min above 10% of koin_amount would stop paid service");
    const c = cfg(); c.max_ops = 1; refusedConfig(s, c, "max_ops 1 would stop checkout", "per-user limits would stop paid service");
    const d = cfg(); d.per_min = 0; refusedConfig(s, d, "per_min 0", "per-user limits would stop paid service");
    const e = cfg(); e.day_mana = 3 * M - 1; refusedConfig(s, e, "day_mana below hard_max", "per-user daily Mana below hard_max would stop paid service");
    const f = cfg(); f.new_actions = 0; refusedConfig(s, f, "new_actions 0", "per-user limits would stop paid service");
    const ok1 = cfg(); ok1.hard_max = M; ok1.admin_min = 100 * M; setConfig(s, ok1);   // the exact bounds are fine
  });
  it("connect_app / set_exempt refuse a contract with a live paid allowance; fine once it has ended", () => {
    const s = setup(); const r = buyAccount(s, SOLDAPP, 10 * M, 1);
    gS1 = s; signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.connect_app(new station.connect_app_arguments(SOLDAPP, 5 * M, false)); }).toThrow("connect over a paid plan"); revertedWith("this contract has a live paid allowance");
    clearRevert(); expect(() => { gS1!.set_exempt(new station.set_exempt_arguments(SOLDAPP, new station.exempt_object(0, false), false)); }).toThrow("exempt over a paid plan"); revertedWith("this contract has a live paid allowance");
    at(r.expiry);
    s.connect_app(new station.connect_app_arguments(SOLDAPP, 5 * M, false)); signedBy([]);
  });
  it("suspension (reason 3) refunds every running and future term to whoever paid it; the owner keeps only what was served", () => {
    const s = setup(); const T = NOW;
    const r = buyAccount(s, U2, 10 * M, 7);                                      // BUYER pays 200,000
    signedBy([U1]); s.renew(new station.renew_arguments(U1, r.id, 1, USDT, 1000 * USD)); signedBy([]); // U1 pays 30,000 (future)
    at(T + HOUR);
    const b0 = bal(BUYER), u0 = bal(U1);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 3)); signedBy([]);
    expect(bal(BUYER) - b0).toBe(171_428, "6 of 7 days back, pro rata, no minimum");
    expect(bal(U1) - u0).toBe(30_000, "the renewal payer gets its future term back");
    at(NOW + 3000); tx(U2, 2 * M, [op(U2, EP_PLAY)]); expect(ok(s)).toBe(false);
    at(T + DAYMS); expect(s.release(new station.release_arguments(1)).amount).toBe(28_572, "only the served day is released");
    expect(bal(OWNER)).toBe(28_572);
    inv(s, USDT);
  });
  it("sanctions (2) refund nothing and freeze the ticket; reclassifying to 4 refunds it then", () => {
    const s = setup();
    signedBy([BUYER, U2]); const t = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, true)); signedBy([]);
    const b0 = bal(BUYER);
    signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 2)); signedBy([]);
    expect(bal(BUYER)).toBe(b0); expect(s.get_ticket(new station.get_ticket_arguments(U2)).ticket).not.toBeNull();
    at(NOW + 3 * DAYMS + 1); gS1 = s; signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.close_ticket(new station.close_ticket_arguments(U2)); }).toThrow("frozen"); revertedWith("sanctions: funds frozen in escrow pending legal review");
    s.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 4)); signedBy([]);   // ticket over: nothing unused is left
    expect(bal(BUYER)).toBe(b0); expect(bal(OWNER)).toBe(t.paid, "a full lock was served");
    inv(s, USDT);
  });
});

describe("AB-003 the tickets' locked Mana and owner boosts", () => {
  it("free apps, passes and checkout all keep admin_min + the tickets' locked Mana", () => {
    const s = setup();
    signedBy([BUYER, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, true)); signedBy([]);
    buyPass(s, U1, U1, 10 * M, 7);
    testSetMana(106 * M);                                                        // a 2-Mana tx would leave 104 < 5 + 100
    at(NOW + 3000); expect(play(s, user(3), 2 * M)).toBe(false, "free app");
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false, "pass");
    at(NOW + 3000); tx(user(4), 2 * M, [apOp(user(4)), buyPassOp(user(4))]); expect(ok(s)).toBe(false, "checkout");
    testSetMana(107 * M);                                                        // leaves exactly 105
    at(NOW + 3000); expect(play(s, user(3), 2 * M)).toBe(true);
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(user(4), 2 * M, [apOp(user(4)), buyPassOp(user(4))]); expect(ok(s)).toBe(true);
  });
  it("owner boosts together stay within buffer_bp of the daily budget (40 of 200 here)", () => {
    const s = setup(); gS1 = s; signedBy([OWNER]);
    s.set_app(new station.set_app_arguments(1, new station.app_object(80 * M, true, 40 * M, NOW + DAYMS)));
    MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.set_app(new station.set_app_arguments(2, new station.app_object(80 * M, true, 1, NOW + DAYMS))); }).toThrow("41st Mana of boost"); revertedWith("boosts above buffer_bp of the daily budget");
    clearRevert(); expect(() => { gS1!.set_app(new station.set_app_arguments(1, new station.app_object(80 * M, true, 40 * M + 1, NOW + DAYMS))); }).toThrow(); revertedWith("boosts above buffer_bp of the daily budget");
    s.set_app(new station.set_app_arguments(2, new station.app_object(80 * M, true, 500 * M, NOW - 1)));   // an expired boost counts for nothing
    signedBy([]);
  });
});

describe("AB-004 caller check, AB-020 the station is never a buyer", () => {
  it("renew, ticket cancel, resume and suspension relayed by another contract are refused; a wallet's own contract may act for it", () => {
    const s = setup(); gS1 = s;
    const r = buyAccount(s, U2, 10 * M, 7); gId1 = r.id;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 50 * M, USDT, 1000 * USD, true));
    viaContract(); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.renew(new station.renew_arguments(BUYER, gId1, 1, USDT, 1000 * USD)); }).toThrow("renew relayed"); revertedWith("payer must sign");
    clearRevert(); expect(() => { gS1!.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)); }).toThrow("ticket cancel relayed"); revertedWith("buyer must sign");
    signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 1)); }).toThrow("suspension relayed"); revertedWith("owner only");
    clearRevert(); expect(() => { gS1!.set_paused(new station.set_paused_arguments(true)); }).toThrow("owner pause relayed"); revertedWith("owner or council only");
    callerIs(BUYER); signedBy([BUYER]);                                          // a smart wallet's own code acting for it
    expect(s.renew(new station.renew_arguments(BUYER, r.id, 1, USDT, 1000 * USD)).paid).toBe(30_000);
    direct(); signedBy([]);
  });
});

describe("AB-008 / AB-009 / AB-012 / AB-013", () => {
  it("AB-008: an app plan on a token pays for its calls but never transfer, approve or burn", () => {
    const s = setup();
    signedBy([BUYER, OTHER]); s.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, OTHER, 5 * M, 1, USDT, 1000 * USD)); signedBy([]);
    at(NOW + 3000); tx(U2, 1 * M, [op(OTHER, 0x74e21680)]); expect(ok(s)).toBe(false, "approve");
    at(NOW + 3000); tx(U2, 1 * M, [op(OTHER, 0x859facc5)]); expect(ok(s)).toBe(false, "burn");
    at(NOW + 3000); tx(U2, 1 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true, "control: other calls are paid");
  });
  it("AB-009: set_exempt refuses vUSDC too", () => {
    gS1 = setup(); signedBy([OWNER]);
    gS1!.set_price(new station.set_price_arguments(USDC, PRICE())); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.set_exempt(new station.set_exempt_arguments(USDC, new station.exempt_object(0, false), false)); }).toThrow(); revertedWith("token contracts (KOIN, stablecoins) cannot be sponsored");
    signedBy([]);
  });
  it("AB-012: below admin_min only the brake and council votes / vetoes are paid", () => {
    const s = setup(); testSetMana(4 * M);
    tx(C2, 1 * M, [op(STATION, 0x74e21680)]); signedBy([C2]); expect(ok(s)).toBe(true, "approve (vote)");
    at(NOW + 3000); tx(C3, 1 * M, [op(STATION, 0x062f1ed9)]); signedBy([C3]); expect(ok(s)).toBe(true, "cancel_proposal (veto)");
    at(NOW + 3000); tx(C1, 1 * M, [op(STATION, 0x12df7f0e)]); signedBy([C1]); expect(ok(s)).toBe(false, "propose is not a vote");
    at(NOW + 3000); tx(OWNER, 1 * M, [op(STATION, 0x35fbb717), op(STATION, 0x12345678)]); signedBy([OWNER]); expect(ok(s)).toBe(false, "brake + another call");
    signedBy([]);
  });
  it("AB-013: the owner can't join the council and a member can't become owner (propose and execute)", () => {
    const s = setup(); testSetBalance(1300 * M);
    const k4 = act(4); k4.council = [C1, C2, OWNER]; k4.threshold = 2; refusedPropose(s, C1, k4, "owner into the council", "the owner can't be a council member");
    const k8 = act(8); k8.to = C2; refusedPropose(s, C1, k8, "member as owner", "the owner can't be a council member");
    const add = act(4); add.council = [C1, C2, C3, U1]; add.threshold = 2;
    const own = act(8); own.to = U1;                                             // U1 is not a member yet: proposable
    const id8 = propose(s, C1, own); signedBy([C2]); s.approve(new station.approve_arguments(C2, id8)); signedBy([]);
    councilDo(s, add);                                                           // U1 joins; the owner proposal re-arms
    at(NOW + 2 * DAYMS); gS1 = s; gId1 = id8; MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.execute(new station.execute_arguments(gId1)); }).toThrow("U1 is a member now"); revertedWith("the owner can't be a council member");
  });
});

describe("AB-006 / AB-011", () => {
  it("AB-006: a renewal adds its days to the total cap; a cancel removes the refunded days", () => {
    const s = setup(); const T = NOW;
    const r = buyPass(s, U1, U1, 2 * M, 1);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.cap_total).toBe(2 * M);
    signedBy([U1]); s.renew(new station.renew_arguments(U1, r.id, 7, USDT, 1000 * USD)); signedBy([]);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.cap_total).toBe(16 * M);
    at(T + HOUR); cancelBy(s, U1, r.id);
    expect(s.get_allowance(new station.get_allowance_arguments(r.id)).allowance!.cap_total).toBe(2 * M);
  });
  it("AB-011: a vetoed action can be proposed again after exactly 14 days, not before", () => {
    const s = setup(); testSetBalance(1300 * M);
    const a = act(2); a.to = OTHER; a.amount = M;
    const id = propose(s, C1, a); signedBy([C3]); s.cancel_proposal(new station.cancel_proposal_arguments(C3, id)); signedBy([]);
    const T1 = NOW;
    at(T1 + 14 * DAYMS - 1); refusedPropose(s, C1, a, "1 ms early", "an action of this kind was vetoed less than 14 days ago");
    at(T1 + 14 * DAYMS); expect(propose(s, C1, a)).toBeGreaterThan(id);
  });
});

describe("AB-017 boundary tests (mutation survivors)", () => {
  it("M0048: a ticket cancel never refunds into the minimum charge", () => {
    const s = setup(); const p = PRICE(); p.min_purchase = 300_000;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    signedBy([BUYER, U2]); const r = s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, true));
    expect(r.paid).toBe(500_000);
    expect(s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U2)).refund).toBe(200_000, "500,000 − 300,000 minimum (the 5% fee cap is 475,000)");
    signedBy([]); inv(s, USDT);
  });
  it("M0049: with no 1-day tier (no AB-010 day price), a plan cancel still stops at the minimum charge", () => {
    const s = setup(); const p = PRICE(); p.price_1d = 0; p.min_purchase = 50_000;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const r = buyAccount(s, SOLDAPP, 5 * M, 7);
    expect(r.paid).toBe(100_000);
    expect(cancelBy(s, BUYER, r.id).refund).toBe(50_000, "pro rata 6/7 would be 85,714: the 50,000 minimum is kept");
  });
  it("M0017: set_app refuses the reserved global key and a missing value", () => {
    gS1 = setup(); signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.set_app(new station.set_app_arguments(0xffffffff, new station.app_object(1 * M, true))); }).toThrow(); revertedWith("app value required");
    clearRevert(); expect(() => { gS1!.set_app(new station.set_app_arguments(3, null)); }).toThrow(); revertedWith("app value required");
    signedBy([]);
  });
  it("M0008: an entry cap may equal hard_max, not exceed it", () => {
    gS1 = setup(); signedBy([OWNER]);
    gS1!.set_entry(new station.set_entry_arguments(KNODE, EP_HEAVY, new station.entry_object(1, 3 * M, 256), false));
    MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.set_entry(new station.set_entry_arguments(KNODE, EP_HEAVY, new station.entry_object(1, 3 * M + 1, 256), false)); }).toThrow(); revertedWith("cap above hard_max");
    signedBy([]);
  });
  it("M0011: owner_refund needs an allowance id or a ticket payee", () => {
    gS1 = setup(); signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.owner_refund(new station.owner_refund_arguments(0, null)); }).toThrow(); revertedWith("allowance_id or ticket_payee");
    signedBy([]);
  });
  it("M0033: the ticket fee may be exactly 20% at init, not more", () => {
    for (let k = 0; k < 2; k++) {
      MockVM.reset(); System.setSystemBufferSize(256 * 1024);
      MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); MockVM.setEntryPoint(0);
      MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
      MockVM.setHeadInfo(new chain.head_info(null, 0, 1)); at(T0); testSetMana(1000 * M); testSetBalance(1000 * M);
      gC1 = cfg(); gC1!.ticket_fee_bp = k == 0 ? 2000 : 2001;
      signedBy([STATION]); deployTx();
      if (k == 0) { new Station().init(new station.init_arguments(gC1)); expect(new Station().get_status(new station.get_status_arguments()).config!.ticket_fee_bp).toBe(2000); }
      else { MockVM.commitTransaction(); clearRevert(); expect(() => { new Station().init(new station.init_arguments(gC1)); }).toThrow(); revertedWith("ticket fee above 20%"); }
    }
  });
  it("M0031: each price may be exactly MAX_UNIT_PRICE, not one unit more", () => {
    gS1 = setup(); signedBy([OWNER]);
    const top: u64 = 10_000_000_000;
    gS1!.set_price(new station.set_price_arguments(USDT, new station.price_object(true, 100 * USD, top, top, top, top, 50 * M)));
    for (let i = 0; i < 4; i++) {
      const p = new station.price_object(true, 100 * USD, top, top, top, top, 50 * M);
      if (i == 0) p.price_1d = top + 1; if (i == 1) p.price_7d = top + 1; if (i == 2) p.price_30d = top + 1; if (i == 3) p.big_per_1000 = top + 1;
      gP1 = p; MockVM.commitTransaction();
      clearRevert(); expect(() => { gS1!.set_price(new station.set_price_arguments(USDT, gP1)); }).toThrow(); revertedWith("price too large");
    }
    signedBy([]);
  });
  it("M0028: connect_app accepts exactly 1 Mana a day, not less", () => {
    gS1 = setup(); signedBy([OWNER]);
    gS1!.connect_app(new station.connect_app_arguments(SOLDAPP, M, false));
    MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.connect_app(new station.connect_app_arguments(OTHER, M - 1, false)); }).toThrow(); revertedWith("at least 1 Mana per day (use disconnect_app to remove)");
    signedBy([]);
  });
  it("M0035: a KOIN withdrawal or token rescue needs an amount above 0", () => {
    const s = setup();
    const z = act(2); z.to = OTHER; z.amount = 0; refusedPropose(s, C1, z, "amount 0", "amount required");
    const r = act(3); r.to = OTHER; r.token = USDT; r.amount = 0; refusedPropose(s, C1, r, "rescue amount 0", "amount required");
    const one = act(2); one.to = OTHER; one.amount = 1; expect(propose(s, C1, one)).toBeGreaterThan(0);
  });
  it("M0022: a buyer suspended for sanctions can't cancel their (frozen) ticket", () => {
    gS1 = setup(); signedBy([BUYER, U2]);
    gS1!.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, true));
    signedBy([OWNER]); gS1!.suspend_allowance(new station.suspend_allowance_arguments(BUYER, 2));
    signedBy([BUYER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { gS1!.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U2)); }).toThrow("sanctioned buyer cancelled"); revertedWith("buyer suspended: the unused share was refunded at suspension (sanctions: frozen)");
    expect(gS1!.get_ticket(new station.get_ticket_arguments(U2)).ticket).not.toBeNull();
    signedBy([]);
  });
  // M0032 (`>` → `>=` in the min_keep cap at termRefund) is equivalent: at amount == min_keep both forms give 0.
  // M0011 (owner_refund's isAddress(ticket_payee) guard removed) is equivalent apart from the error text: a payee that
  // isn't an address can hold no ticket, so the call still fails ("no ticket"). The M0011 test above pins the refusal.
  // M0002 (the payment transfer result check) only exists in the real-chain build: it needs a node test.
});
