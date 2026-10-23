// audit-fixes-1, third round (Mana Station, 2026-10-22): regression tests for the owner's decisions on the Audit Bot fix
// check of d982a24: AB-032 (a paid term keeps the limits it was sold with) and AB-033 / AB-034 (limited vetoes).
// Helpers are lines 4-219 of Station.audit-fixes-2.spec.ts, unchanged.
/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, testSetContract, testRealSlotFee, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
import { station } from "../proto/station";
import { clearRevert, revertedWith } from "./lib/revert";

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

// ───── helpers for this file ─────
const VETOED = "an action of this kind was vetoed less than 14 days ago";
let gR: station.renew_arguments | null = null;
let gWho: Uint8Array = new Uint8Array(0);
/** set_config is refused, for this reason. */
function configRefused(s: Station, c: station.config_object, msg: string): void {
  clearRevert(); refusedConfig(s, c, "set_config accepted: " + msg); revertedWith(msg);
}
/** `who` proposes `a` and is refused, for this reason. */
function proposeRefused(s: Station, who: Uint8Array, a: station.guarded_action, msg: string): void {
  gS1 = s; gA1 = a; gWho = who; signedBy([who]); MockVM.commitTransaction(); clearRevert();
  expect(() => { gS1!.propose(new station.propose_arguments(gWho, gA1)); }).toThrow("propose accepted: " + msg);
  revertedWith(msg); signedBy([]);
}
function veto(s: Station, who: Uint8Array, id: u32): void { signedBy([who]); s.cancel_proposal(new station.cancel_proposal_arguments(who, id)); signedBy([]); }
function voteFor(s: Station, who: Uint8Array, id: u32): void { signedBy([who]); s.approve(new station.approve_arguments(who, id)); signedBy([]); }
function code(b: u8, len: i32 = 64): Uint8Array { const c = new Uint8Array(len); c[0] = b; return c; }
function upgradeOf(bytes: Uint8Array): station.guarded_action { const a = act(1); a.hash = System.hash(Crypto.multicodec.sha2_256, bytes)!; return a; }
function uploadOk(s: Station, bytes: Uint8Array): bool {
  const t = new protocol.transaction(); const o = new protocol.operation();
  o.upload_contract = new protocol.upload_contract_operation(STATION, bytes, "", true, true, true); t.operations = [o];
  MockVM.setTransaction(t); System.resetCache();
  return s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_upload)).value;
}
function withdraw(to: Uint8Array, amount: u64): station.guarded_action { const a = act(2); a.to = to; a.amount = amount; return a; }
function slotFeeAndPassMin(s: Station): void {
  const c = cfg(); c.slot_fee_per_day = 2_000_000; setConfig(s, c);                  // proposed mainnet slot fee
  const p = PRICE(); p.pass_min_purchase = 25_000_000;                               // proposed mainnet pass minimum
  signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
}
const SLOT6H: u64 = 21_600_000;
let nextPlayer: i32 = 300;
/** n plays of 2 Mana, 3 s apart: by pass wallet `w` (on OTHER), or by fresh players of app `app` (an app plan). */
function burst(s: Station, w: Uint8Array | null, app: Uint8Array, n: i32): u64 {
  let used: u64 = 0;
  for (let i = 0; i < n; i++) {
    at(NOW + 3000);
    if (w != null) { if (play(s, w!, 2 * M, OTHER)) used += 2 * M; }
    else { const p = user(nextPlayer); nextPlayer++; if (play(s, p, 2 * M, app)) used += 2 * M; }
  }
  return used;
}
function renewBy(s: Station, payer: Uint8Array, id: u32, days: u64): station.renew_result {
  signedBy([payer]); const r = s.renew(new station.renew_arguments(payer, id, days, USDT, 1000 * USD)); signedBy([]); return r;
}
function escrowOf(s: Station, id: u32): station.escrow_object { return s.get_escrow(new station.get_escrow_arguments(id)).purchase!; }
function allowanceOf(s: Station, id: u32): station.allowance_object { return s.get_allowance(new station.get_allowance_arguments(id)).allowance!; }
function key4(n: u32): Uint8Array { const k = new Uint8Array(4); k[0] = u8(n >> 24); k[1] = u8(n >> 16); k[2] = u8(n >> 8); k[3] = u8(n); return k; }

// ───── helpers for this file ─────
const APP2 = user(88);                                   // a second paid app, bought after a change
let pu: i32 = 600;
function nextUser(): Uint8Array { pu++; return user(pu); }
/** One transaction by `who` with `nops` calls to `app`, Mana limit `rc`. */
function use(s: Station, who: Uint8Array, app: Uint8Array, rc: u64, nops: i32 = 1): bool {
  const ops = new Array<protocol.operation>(); for (let i = 0; i < nops; i++) ops.push(op(app, EP_PLAY));
  tx(who, rc, ops); return ok(s);
}
/** A user first seen 2 days ago (an established user), on `app`. */
function known(s: Station, app: Uint8Array): Uint8Array { const u = nextUser(); expect(use(s, u, app, M)).toBe(true, "setup: first use"); return u; }
function plan(s: Station, app: Uint8Array, days: u64 = 30): station.buy_allowance_result { return buyAccount(s, app, 30 * M, days); }

describe("AB-032 a paid term keeps the limits it was sold with", () => {
  it("hard_max: tightened after a purchase, the running plan and pass keep the old limit; a new plan gets the new one; a renewal bought after it too", () => {
    const s = setupWide(); plan(s, SOLDAPP, 1); buyPass(s, U1, U1, 10 * M, 30);
    const c = cfg(); c.hard_max = M; setConfig(s, c);                                   // 3 Mana → 1 Mana
    plan(s, APP2);
    expect(use(s, nextUser(), SOLDAPP, 2 * M)).toBe(true, "running plan: 2-Mana action still paid");
    expect(use(s, U1, OTHER, 2 * M)).toBe(true, "running pass: 2-Mana transaction still paid");
    expect(use(s, nextUser(), APP2, 2 * M)).toBe(false, "plan bought after the change: new limit");
    expect(use(s, nextUser(), APP2, M)).toBe(true, "control: within the new limit");
    const r = allowanceOf(s, u32(s.targets.get(SOLDAPP)!.total));
    signedBy([BUYER]); s.renew(new station.renew_arguments(BUYER, r.id, 1, USDT, 1000 * USD)); signedBy([]);
    at(r.expiry + HOUR);                                                                 // the renewal's term is running
    expect(use(s, nextUser(), SOLDAPP, 2 * M)).toBe(false, "renewal bought after the change: new limit");
  });
  it("hard_max: loosened after a purchase, the running term gets the higher limit", () => {
    const s = setupWide();
    const st = cfg(); st.hard_max = 2 * M; setConfig(s, st); plan(s, SOLDAPP);
    expect(use(s, nextUser(), SOLDAPP, 3 * M)).toBe(false, "control: above the limit sold");
    setConfig(s, cfg());                                                                 // back to 3 Mana
    expect(use(s, nextUser(), SOLDAPP, 3 * M)).toBe(true, "loosened: the running term benefits");
  });
  it("max_ops: tightened after a purchase (3 → 2), the running plan keeps 3 operations; a new plan gets 2; loosened, a plan sold 2 gets 3", () => {
    const s = setupWide();
    const three = cfg(); three.max_ops = 3; setConfig(s, three); plan(s, SOLDAPP);
    setConfig(s, cfg());                                                                 // 2
    plan(s, APP2);
    expect(use(s, nextUser(), SOLDAPP, M, 3)).toBe(true, "running plan: 3 operations still paid");
    expect(use(s, nextUser(), APP2, M, 3)).toBe(false, "plan bought after the change: 2");
    setConfig(s, three);
    expect(use(s, nextUser(), APP2, M, 3)).toBe(true, "loosened: the running term benefits");
  });
  it("per_min: tightened (5 → 1), a running plan's user still gets 2 actions a minute; a new plan's 1; loosened, a plan sold 1 gets 2", () => {
    const s = setupWide(); plan(s, SOLDAPP);
    const one = cfg(); one.per_min = 1; setConfig(s, one); plan(s, APP2);
    const a = nextUser(), b = nextUser();
    expect(use(s, a, SOLDAPP, M)).toBe(true); at(NOW + 1000); expect(use(s, a, SOLDAPP, M)).toBe(true, "running plan: 2 in a minute");
    expect(use(s, b, APP2, M)).toBe(true); at(NOW + 1000); expect(use(s, b, APP2, M)).toBe(false, "new plan: 1 a minute");
    setConfig(s, cfg());                                                                 // loosened to 5
    at(NOW + 11 * 60_000); const c2 = nextUser();
    expect(use(s, c2, APP2, M)).toBe(true); at(NOW + 1000); expect(use(s, c2, APP2, M)).toBe(true, "loosened: the running term benefits");
  });
  it("cooldown_ms: tightened (10 min → 1 h), a running plan's user is served after 11 minutes; a new plan's isn't; loosened, the running term benefits", () => {
    const s = setupWide(); plan(s, SOLDAPP);
    const slow = cfg(); slow.per_min = 1; slow.cooldown_ms = HOUR;
    const fast = cfg(); fast.per_min = 1;                                                // per_min 1, 10 minutes
    setConfig(s, fast); const r2 = plan(s, APP2);                                        // APP2 sold 1 a minute, 10 min
    setConfig(s, slow);
    const a = nextUser(), b = nextUser();
    expect(use(s, a, SOLDAPP, M)).toBe(true); expect(use(s, b, APP2, M)).toBe(true);
    at(NOW + 11 * 60_000);
    expect(use(s, a, SOLDAPP, M)).toBe(true, "running plan (sold 5 a minute): not in a cooldown");
    expect(use(s, b, APP2, M)).toBe(true, "running plan sold a 10-minute cooldown: served after 11 minutes");
    const c3 = nextUser(); plan(s, nextUser());                                           // a plan sold the 1-hour cooldown
    const app3 = user(pu); expect(use(s, c3, app3, M)).toBe(true); at(NOW + 11 * 60_000);
    expect(use(s, c3, app3, M)).toBe(false, "plan bought after the change: 1-hour cooldown");
    setConfig(s, fast); at(NOW + 60_000);
    expect(use(s, c3, app3, M)).toBe(true, "loosened to 10 minutes: the running term benefits");
    expect(r2.id > 0).toBe(true);
  });
  it("day_actions: tightened (25 → 24), a running plan's known user gets a 25th action; a new plan's doesn't; loosened, the running term benefits", () => {
    const s = setupWide(); plan(s, SOLDAPP); plan(s, APP2);
    const a = known(s, SOLDAPP), b = known(s, APP2); at(NOW + 2 * DAYMS);
    const t24 = cfg(); t24.day_actions = 24; setConfig(s, t24);
    const app3 = nextUser(); plan(s, app3); const c = known(s, app3); at(NOW + 2 * DAYMS);
    let na = 0, nb = 0, nc = 0;
    for (let i = 0; i < 25; i++) { at(NOW + 11 * 60_000); if (use(s, a, SOLDAPP, M)) na++; if (use(s, b, APP2, M)) nb++; if (use(s, c, app3, M)) nc++; }
    expect(na).toBe(25, "running plan: 25 a day as sold"); expect(nb).toBe(25, "running plan: 25 a day as sold");
    expect(nc).toBe(24, "plan bought after the change: 24");
    const t30 = cfg(); t30.day_actions = 30; setConfig(s, t30);
    at(NOW + 11 * 60_000); expect(use(s, c, app3, M)).toBe(true, "loosened to 30: the running term benefits");
  });
  it("new_actions: tightened (10 → 1), a running plan's new user gets a second action; a new plan's doesn't; loosened, the running term benefits", () => {
    const s = setupWide(); plan(s, SOLDAPP);
    const one = cfg(); one.new_actions = 1; setConfig(s, one); plan(s, APP2);
    const a = nextUser(), b = nextUser();
    expect(use(s, a, SOLDAPP, M)).toBe(true); expect(use(s, b, APP2, M)).toBe(true);
    at(NOW + 11 * 60_000);
    expect(use(s, a, SOLDAPP, M)).toBe(true, "running plan: second first-day action");
    expect(use(s, b, APP2, M)).toBe(false, "plan bought after the change: 1");
    setConfig(s, cfg()); at(NOW + 11 * 60_000);
    expect(use(s, b, APP2, M)).toBe(true, "loosened to 10: the running term benefits");
  });
  it("day_mana: tightened (60 → 3 Mana), a running plan's known user still spends 4 Mana; a new plan's can't; loosened, the running term benefits", () => {
    const s = setupWide(); plan(s, SOLDAPP); plan(s, APP2);
    const a = known(s, SOLDAPP); at(NOW + 2 * DAYMS);
    const tight = cfg(); tight.day_mana = 3 * M; setConfig(s, tight);
    const app3 = nextUser(); plan(s, app3); const c = known(s, app3); at(NOW + 2 * DAYMS);
    expect(use(s, a, SOLDAPP, 2 * M)).toBe(true); at(NOW + 11 * 60_000); expect(use(s, a, SOLDAPP, 2 * M)).toBe(true, "running plan: 4 Mana a day");
    expect(use(s, c, app3, 2 * M)).toBe(true); at(NOW + 11 * 60_000); expect(use(s, c, app3, 2 * M)).toBe(false, "new plan: 3 Mana a day");
    setConfig(s, cfg()); at(NOW + 11 * 60_000);
    expect(use(s, c, app3, 2 * M)).toBe(true, "loosened to 60: the running term benefits");
  });
  it("new_mana: tightened (25 → 3 Mana), a running plan's new user still spends 4 Mana; a new plan's can't; loosened, the running term benefits", () => {
    const s = setupWide(); plan(s, SOLDAPP);
    const tight = cfg(); tight.new_mana = 3 * M; setConfig(s, tight); plan(s, APP2);
    const a = nextUser(), b = nextUser();
    expect(use(s, a, SOLDAPP, 2 * M)).toBe(true); expect(use(s, b, APP2, 2 * M)).toBe(true);
    at(NOW + 11 * 60_000);
    expect(use(s, a, SOLDAPP, 2 * M)).toBe(true, "running plan: 4 Mana on the first day");
    expect(use(s, b, APP2, 2 * M)).toBe(false, "plan bought after the change: 3 Mana");
    setConfig(s, cfg()); at(NOW + 11 * 60_000);
    expect(use(s, b, APP2, 2 * M)).toBe(true, "loosened to 25: the running term benefits");
  });
  it("the quote shows the limits a purchase keeps; free use follows the current settings; a pause still stops paid terms", () => {
    const s = setupWide(); plan(s, SOLDAPP);
    const c = cfg(); c.hard_max = 2 * M; c.day_mana = 50 * M; setConfig(s, c);
    const q = s.quote_allowance(new station.quote_allowance_arguments(USDT, 10 * M, 30, 1, APP2));
    expect(q.limits!.hard_max).toBe(2 * M); expect(q.limits!.day_mana).toBe(50 * M); expect(q.limits!.day_actions).toBe(25);
    expect(q.limits!.cooldown_ms).toBe(600_000); expect(q.limits!.max_ops).toBe(2);
    expect(q.terms!.includes("the limits you buy are the limits you keep until your term ends, unless the station is paused")).toBe(true, "terms say so");
    expect(play(s, nextUser(), 3 * M)).toBe(false, "free app (Knode): the current 2-Mana limit");
    expect(use(s, nextUser(), SOLDAPP, 3 * M)).toBe(true, "running plan: the 3 Mana it was sold");
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    expect(use(s, nextUser(), SOLDAPP, M)).toBe(false, "paused: nothing is paid");
  });
});

function council(m: Uint8Array[], thr: u32): station.guarded_action { const a = act(4); a.council = m; a.threshold = thr; return a; }
function keepAll(n: i32): station.guarded_action { return council([C1, C2, C3, cm(4), cm(5), cm(10 + n)], 3); }
describe("AB-033 / AB-034 limited vetoes", () => {
  it("two colluding members can block a kind for at most 14 days each: a third veto inside 30 days cancels without a block", () => {
    const s = setup(); councilDo(s, council([C1, C2, C3, cm(4), cm(5)], 3));
    const d1 = propose(s, cm(4), keepAll(1)), d2 = propose(s, cm(4), keepAll(2)), d3 = propose(s, cm(5), keepAll(3));
    const u1 = propose(s, cm(4), upgradeOf(code(7))), u3 = propose(s, cm(5), upgradeOf(code(9)));
    const t0 = NOW;
    veto(s, cm(5), d1); veto(s, cm(5), u1);                                              // cm(5): first blocks (kinds 4, 1)
    at(t0 + 14 * DAYMS - 1); veto(s, cm(4), d3); veto(s, cm(4), u3);                    // cm(4): first blocks, chained
    at(t0 + 28 * DAYMS - 2); veto(s, cm(5), d2);                    // cm(5) again inside 30 days: no block
    expect(s.get_proposal(new station.get_proposal_arguments(d2)).proposal!.cancelled).toBe(true, "the veto still cancels");
    proposeRefused(s, C1, upgradeOf(code(42)), VETOED);                                  // still inside cm(4)'s block
    at(t0 + 28 * DAYMS);
    const up = propose(s, C1, upgradeOf(code(42))); voteFor(s, C2, up); voteFor(s, C3, up);
    const rm = propose(s, C1, council([C1, C2, C3], 2)); voteFor(s, C2, rm); voteFor(s, C3, rm);
    at(NOW + 2 * DAYMS + 60_000);
    expect(uploadOk(s, code(42))).toBe(true, "28 days: 14 per colluding member, then the honest upgrade goes through");
    s.execute(new station.execute_arguments(rm));
    expect(s.config.get()!.council.length).toBe(3, "and the colluders are removed");
  });
  it("a second veto by the same member doesn't extend that member's block", () => {
    const s = setup(); const t0 = NOW;
    const f1 = act(7); f1.fee_bp = 100; veto(s, C3, propose(s, C1, f1));
    at(t0 + 7 * DAYMS); const f2 = act(7); f2.fee_bp = 150;
    proposeRefused(s, C1, f2, VETOED);
    at(t0 + 14 * DAYMS); const p2 = propose(s, C1, f2); at(NOW + 60_000); veto(s, C3, p2);   // inside 30 days of the first
    at(NOW + 60_000); const f3 = act(7); f3.fee_bp = 200; propose(s, C2, f3);             // not blocked
  });
  it("a veto never blocks removing the member who cast it, nor the member whose proposal was vetoed", () => {
    const s = setup();
    veto(s, C3, propose(s, C1, council([C1, C2, C3, cm(4)], 2)));                        // C3 vetoes C1's council change
    const keep = council([C1, C2, C3, cm(6)], 2); proposeRefused(s, C2, keep, VETOED);     // a change keeping both: blocked
    const rm3 = propose(s, C2, council([C1, C2, cm(6)], 2)); voteFor(s, C1, rm3);         // removes the vetoer: allowed
    at(NOW + 2 * DAYMS); s.execute(new station.execute_arguments(rm3));
    expect(s.config.get()!.council.length).toBe(3);
    const s2 = setup();
    veto(s2, C3, propose(s2, C1, council([C1, C2, C3, cm(4)], 2)));
    const rm1 = propose(s2, C2, council([C2, C3, cm(6)], 2));                             // removes the proposer C1: allowed
    expect(rm1 > 0).toBe(true);
  });
});
