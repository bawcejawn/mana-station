// audit-fixes-1 (2026-10-22): SKIPPED (xit), unchanged otherwise. It proves AB-023, and the owner accepted this residual for launch (no pricing change): a squat of all 50 slots costs about
// 50 x the slot fee a day; renewals are never blocked; the daily 80% open_cap check (station-admin.mjs check) is the
// response. config/mainnet.proposed.json and docs/LAUNCH.md now state that figure.
// It still fails if switched back to it(): that is the accepted behaviour, not a regression.
// Audit Bot fix-check attack test (mana-station, branch audit-fixes-1, commit dd5148d). Related: AB-002.
// Attack: app plans (kind 1, min_purchase 0) on the attacker own wallets, 40 plain + 10 with a tiny contract, fill all 50 slots (open_cap 50, app_reserved 10) for one day; the pass minimum never applies.
// Asserts the SAFE behaviour: FAILS while the issue exists (proof), PASSES once fixed (regression test).
// Helpers below are copied unchanged from assembly/__tests__/Station.audit-fixes-1.spec.ts (lines 4-170).
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


function buyPlanOp(buyer: Uint8Array, target: Uint8Array): protocol.operation {
  const o = new protocol.operation();
  o.call_contract = new protocol.call_contract_operation(STATION, 0x60422f5f, Protobuf.encode(new station.buy_allowance_arguments(buyer, 1, target, 1 * M, 1, USDT, 1000 * USD), station.buy_allowance_arguments.encode));
  return o;
}
let paidAll: u64 = 0;

describe("FIX-CHECK AB-002 bypass: app plans on the attacker's own wallets fill every slot for about $1 a day", () => {
  xit("50 one-day app plans (40 plain wallets + 10 wallets with a tiny contract) can't lock every new buyer out for ~$1", () => {
    const s = setupWide(); const p = PRICE(); p.pass_min_purchase = 25_000_000;   // mainnet: $0.25 pass minimum, min_purchase 0
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);              // $0.02 a day; open_cap 50, app_reserved 0 = 10
    // Free checkout pays the Mana for such a purchase (fresh wallet, no Mana): approve + buy_allowance(kind 1, target = self).
    const W0 = user(300); testSetToken(USDT, W0, 1 * USD);
    tx(W0, 1 * M, [apOp(W0), buyPlanOp(W0, W0)]);
    expect(ok(s)).toBe(true, "control: free checkout sponsors a kind-1 self plan purchase");
    paidAll = 0;
    for (let i = 0; i < 50; i++) {
      const Wi = user(300 + i); testSetToken(USDT, Wi, 1 * USD);
      if (i >= 40) testSetContract(Wi, true);                                      // a tiny contract uploaded at its own address
      signedBy([Wi]); paidAll += s.buy_allowance(new station.buy_allowance_arguments(Wi, 1, Wi, 1 * M, 1, USDT, 1000 * USD)).paid; signedBy([]);
    }
    log<string>("50 slots for one day cost " + paidAll.toString() + " base units (100,000,000 = $1)");
    expect(s.get_status(new station.get_status_arguments()).open_allowances).toBe(50, "setup: all 50 slots taken");
    log<string>("honest pass quote: " + s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 2)).reason!);
    testSetContract(SOLDAPP, true);
    const qa = new station.quote_allowance_arguments(USDT, 10 * M, 30, 1); qa.target = SOLDAPP;
    const ra = s.quote_allowance(qa);
    log<string>("honest app plan quote (deployed contract, 10 Mana/day, 30 days): " + ra.reason!);
    // The pass minimum was meant to make each squatted slot cost at least $0.25 + $0.02 a day (config notes, LAUNCH.md).
    expect(paidAll).toBeGreaterThanOrEqual(50 * 27_000_000, "AB-002 bypass: 50 slots squatted for one day for far less than 50 x ($0.25 + $0.02)");
    expect(ra.available).toBe(true, "AB-002 bypass: an honest app plan on a real contract is refused while the squat lasts");
    inv(s, USDT);
  });
});
