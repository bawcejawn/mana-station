// audit-fixes-1, second round (Mana Station, 2026-10-22): regression tests for the Audit Bot fix check (dd5148d):
// AB-024, AB-025, AB-027, AB-028, AB-029, and a killing test for each real mutation survivor in its mutation report.
// Every refusal is checked for its reason (AB-031). Helpers are lines 4-169 of Station.audit-fixes-1.spec.ts, unchanged.
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
const VETOED = "an action of this kind for this target was vetoed less than 14 days ago";
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

describe("AB-024 per-user cooldown", () => {
  it("cooldown_ms may be exactly 1 hour, not 1 ms more", () => {
    const s = setup();
    const c = cfg(); c.per_min = 1; c.cooldown_ms = HOUR; setConfig(s, c);
    const c2 = cfg(); c2.per_min = 1; c2.cooldown_ms = HOUR + 1;
    configRefused(s, c2, "cooldown above 1 hour would stop paid service");
  });
  it("the cooldown in force is the current setting: raising it extends a running cooldown, lowering it ends one at once", () => {
    const s = setup(); buyAccount(s, SOLDAPP, 10 * M, 7);
    const c = cfg(); c.per_min = 1; setConfig(s, c);                                   // 1 a minute, then 10 minutes
    at(NOW + 60_000); const t1 = NOW; expect(play(s, U2, 2 * M, SOLDAPP)).toBe(true);
    const u = s.get_user(new station.get_user_arguments(U2)).user!;
    expect(u.cooldown_from).toBe(t1, "the start is stored"); expect(u.cooldown_until).toBe(0, "no end time is stored");
    const up = cfg(); up.per_min = 1; up.cooldown_ms = HOUR; setConfig(s, up);
    at(t1 + 30 * 60_000); expect(play(s, U2, 2 * M, SOLDAPP)).toBe(false, "30 min in: the 1-hour setting now applies");
    at(t1 + HOUR); expect(play(s, U2, 2 * M, SOLDAPP)).toBe(true, "served again exactly 1 hour after the start");
    const t2 = NOW; const down = cfg(); down.per_min = 1; down.cooldown_ms = 60_000; setConfig(s, down);
    at(t2 + 60_000); expect(play(s, U2, 2 * M, SOLDAPP)).toBe(true, "lowered to 1 minute: free after 1 minute, not 1 hour");
  });
});

describe("AB-025 veto block by kind and target", () => {
  it("after a vetoed upgrade, no upgrade at all can be proposed for 14 days; then a new one is proposed, approved and uploaded", () => {
    const s = setup(); const start = NOW;
    const id = propose(s, C1, upgradeOf(code(1))); voteFor(s, C2, id); veto(s, C3, id);
    at(NOW + 60_000);
    proposeRefused(s, C1, upgradeOf(code(2)), VETOED);                                 // different bytecode, same kind
    at(start + 14 * DAYMS - 1); proposeRefused(s, C2, upgradeOf(code(1, 65)), VETOED);  // still blocked 1 ms before 14 days
    at(start + 14 * DAYMS);
    const id2 = propose(s, C1, upgradeOf(code(2))); voteFor(s, C2, id2);
    at(NOW + 2 * DAYMS); expect(uploadOk(s, code(2))).toBe(true, "a new upgrade passes after 14 days + the wait");
    expect(NOW - start >= 16 * DAYMS).toBe(true);
  });
  it("an upgrade proposed before another upgrade was vetoed can't be uploaded within 14 days of that veto", () => {
    const s = setup();
    const a = propose(s, C1, upgradeOf(code(1))); voteFor(s, C2, a);
    const b = propose(s, C1, upgradeOf(code(2))); voteFor(s, C2, b);
    veto(s, C3, a);
    at(NOW + 2 * DAYMS + 60_000);
    expect(uploadOk(s, code(2))).toBe(false, "AB-025: the other open upgrade went through 2 days after the veto");
  });
  it("execute refuses a withdrawal proposed before a veto on the same kind and wallet, until 14 days have passed", () => {
    const s = setup(); testSetBalance(1300 * M); const start = NOW;
    const a = propose(s, C1, withdraw(OTHER, 100 * M)); voteFor(s, C2, a);
    const b = propose(s, C1, withdraw(OTHER, 50 * M)); voteFor(s, C2, b);
    const d = propose(s, C2, withdraw(U1, 10 * M)); voteFor(s, C1, d);                  // another wallet
    veto(s, C3, a);
    at(NOW + 2 * DAYMS); gS1 = s; gId1 = b; MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.execute(new station.execute_arguments(gId1)); }).toThrow("AB-025: executed 2 days after a veto on the same kind and wallet");
    revertedWith(VETOED);
    s.execute(new station.execute_arguments(d));                                       // another wallet: not blocked
    expect(testGetToken(KOIN, U1)).toBe(10 * M);
    at(start + 14 * DAYMS); s.execute(new station.execute_arguments(b));
    expect(testGetToken(KOIN, OTHER)).toBe(50 * M, "executes once the 14 days are over");
  });
  it("kinds 4, 5 and 7 block every change of that setting; kind 6 only the same wallet; withdrawing your own proposal is not a veto", () => {
    const s = setup();
    const d1 = act(5); d1.delay_ms = 3 * DAYMS; veto(s, C2, propose(s, C1, d1));
    const d2 = act(5); d2.delay_ms = 4 * DAYMS; proposeRefused(s, C1, d2, VETOED);
    const f1 = act(7); f1.fee_bp = 100; veto(s, C1, propose(s, C2, f1));
    const f2 = act(7); f2.fee_bp = 200; proposeRefused(s, C3, f2, VETOED);
    const t1 = act(6); t1.to = U1; veto(s, C3, propose(s, C1, t1));
    const t2 = act(6); t2.to = U1; proposeRefused(s, C2, t2, VETOED);
    const t3 = act(6); t3.to = U2; propose(s, C2, t3);                                  // another treasury wallet: fine
    const w = propose(s, C3, withdraw(OTHER, 1 * M)); veto(s, C3, w);                    // C3 withdraws its own proposal
    propose(s, C3, withdraw(OTHER, 1 * M));                                             // not blocked
    const n1 = act(4); n1.council = [C1, C2, C3, cm(4)]; n1.threshold = 2; veto(s, C3, propose(s, C1, n1));
    const n2 = act(4); n2.council = [C1, C2, cm(5)]; n2.threshold = 2; proposeRefused(s, C2, n2, VETOED); // also a removal
  });
});

describe("AB-027 target and payee approve directly", () => {
  it("a wallet's own contract may buy for itself (caller = buyer = payee / target); an app's approval relayed by the buyer is refused", () => {
    const s = setupWide(); testSetToken(USDT, U2, 100 * USD);
    signedBy([U2]); callerIs(U2);
    s.buy_big_upload(new station.buy_big_upload_arguments(U2, U2, 50 * M, USDT, 1000 * USD, false, 0));
    s.buy_allowance(new station.buy_allowance_arguments(U2, 2, U2, 1 * M, 1, USDT, 1000 * USD));
    direct(); signedBy([]);
    expect(s.get_ticket(new station.get_ticket_arguments(U2)).ticket != null).toBe(true);
    gS1 = s; gB1 = new station.buy_allowance_arguments(U2, 1, SOLDAPP, 1 * M, 1, USDT, 1000 * USD);
    signedBy([U2, SOLDAPP]); callerIs(U2); MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.buy_allowance(gB1!); }).toThrow("an app's approval relayed through the buyer's contract was accepted");
    revertedWith("the target app must approve (sign) this purchase");
    direct(); signedBy([]);
  });
});

describe("AB-028 cancel after a slot-edge burst charges the Mana used", () => {
  it("pass: 20 Mana used on day 1 of a 10 Mana/day pass; the cancel charges 2 days and nothing more is sponsored", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H; at(edge - 60_000);
    const r = buyPass(s, U1, U1, 10 * M, 30);                                          // 25,000,000 + 30 x 2,000,000
    burst(s, U1, OTHER, 6); at(edge + 3 * SLOT6H + 1000); burst(s, U1, OTHER, 6);
    expect(allowanceOf(s, r.id).used_total).toBe(20 * M, "setup: two days' Mana in the first 19 hours");
    const b0 = bal(U1); const c = cancelBy(s, U1, r.id);
    // 2 days at the 1-day price (25,000,000, the pass minimum) take the whole Mana price; 28 unused days' slot fee back.
    expect(bal(U1) - b0).toBe(56_000_000, "1 day charged would have returned 58,000,000");
    expect(c.refund).toBe(56_000_000, "the result reports what was refunded");
    const a = allowanceOf(s, r.id); const e = escrowOf(s, a.purchase_ids[0]);
    expect(e.days).toBe(2); expect(a.cap_total).toBe(20 * M); expect(c.expiry).toBe(e.start + 2 * DAYMS);
    expect(burst(s, U1, OTHER, 3)).toBe(0, "nothing more is sponsored");
    inv(s, USDT);
  });
  it("app plan: the same burst; refund 56,690,000 (2 days at 30,000 each), not 58,720,000", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H; at(edge - 60_000);
    const r = buyAccount(s, SOLDAPP, 10 * M, 30);                                      // 750,000 + 30 x 2,000,000
    burst(s, null, SOLDAPP, 6); at(edge + 3 * SLOT6H + 1000); burst(s, null, SOLDAPP, 6);
    const b0 = bal(BUYER); cancelBy(s, BUYER, r.id);
    expect(bal(BUYER) - b0).toBe(56_690_000);
    inv(s, USDT);
  });
  it("no burst: the cancel still charges only the day used", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const r = buyAccount(s, SOLDAPP, 10 * M, 30); burst(s, null, SOLDAPP, 2);
    const b0 = bal(BUYER); cancelBy(s, BUYER, r.id);
    expect(bal(BUYER) - b0).toBe(58_720_000, "750,000 x 29/30 = 725,000, less 30,000 for the day used: 720,000; + 29 x 2,000,000");
    expect(escrowOf(s, allowanceOf(s, r.id).purchase_ids[0]).days).toBe(1);
  });
  it("a burst on a term's last day is charged to the canceller's own next term, never to a term another wallet paid", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H; at(edge - 60_000);
    const r = buyPass(s, U1, U1, 10 * M, 1);                                           // 27,000,000
    expect(renewBy(s, U1, r.id, 7).paid).toBe(39_000_000, "setup: U1's own renewal");
    burst(s, U1, OTHER, 6); at(edge + 3 * SLOT6H + 1000); burst(s, U1, OTHER, 6);
    const b0 = bal(U1); cancelBy(s, U1, r.id);
    expect(escrowOf(s, allowanceOf(s, r.id).purchase_ids[1]).days).toBe(1, "1 extra day charged to U1's own renewal");
    // That renewal is then treated as started and cancelled after 1 day: its Mana price (the minimum) is kept, 6 days' slot fee back.
    expect(bal(U1) - b0).toBe(12_000_000);
    expect(allowanceOf(s, r.id).used_total <= allowanceOf(s, r.id).cap_total).toBe(true);
    inv(s, USDT);
  });
  it("the same burst with the next term paid by another wallet: that wallet gets all of it back, and nothing more is sponsored", () => {
    const s = setupWide(); slotFeeAndPassMin(s); const B = user(9); testSetToken(USDT, B, 100 * USD);
    const edge = (T0 / SLOT6H + 1) * SLOT6H; at(edge - 60_000);
    const r = buyPass(s, U1, U1, 10 * M, 1); const rn = renewBy(s, B, r.id, 7);
    burst(s, U1, OTHER, 6); at(edge + 3 * SLOT6H + 1000); burst(s, U1, OTHER, 6);
    const bB = bal(B); cancelBy(s, U1, r.id);
    expect(bal(B) - bB).toBe(rn.paid, "B's renewal comes back whole (AB-029)");
    expect(burst(s, U1, OTHER, 3)).toBe(0, "nothing more is sponsored");
    inv(s, USDT);
  });
  it("an owner refund after a burst stays plain pro rata (buyer not at fault)", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const edge = (T0 / SLOT6H + 1) * SLOT6H; at(edge - 60_000);
    const r = buyPass(s, U1, U1, 10 * M, 30);
    burst(s, U1, OTHER, 6); at(edge + 3 * SLOT6H + 1000); burst(s, U1, OTHER, 6);
    const b0 = bal(U1);
    signedBy([OWNER]); s.owner_refund(new station.owner_refund_arguments(r.id)); signedBy([]);
    expect(bal(U1) - b0).toBe(82_166_666, "85,000,000 x 29 / 30");
  });
});

describe("AB-029 a term that hasn't started comes back whole", () => {
  it("the buyer's own renewal, cancelled before it starts, is refunded in full, minimum included", () => {
    const s = setupWide(); slotFeeAndPassMin(s);
    const r = buyPass(s, U1, U1, 1 * M, 1); const rn = renewBy(s, U1, r.id, 7);
    expect(rn.paid).toBe(39_000_000);
    expect(s.get_escrow(new station.get_escrow_arguments(allowanceOf(s, r.id).purchase_ids[1])).refundable_now).toBe(39_000_000, "shown in get_escrow too");
    at(NOW + HOUR); const b0 = bal(U1); cancelBy(s, U1, r.id);
    expect(bal(U1) - b0).toBe(39_000_000, "the running day is charged, the renewal comes back whole");
    inv(s, USDT);
  });
});

describe("Mutation survivors of the fix check (dd5148d)", () => {
  it("M0011: execute re-counts approvals against the CURRENT council, even when ready_at is already set", () => {
    // Defense in depth: today a council change re-arms every open proposal (rearm), so this state is written directly.
    const s = setup(); testSetBalance(1300 * M);
    const id = propose(s, C1, withdraw(OTHER, 100 * M)); voteFor(s, C2, id);
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.ready_at > 0).toBe(true);
    const c = s.config.get()!; c.council = [C1, C3, cm(4)]; s.config.put(c);           // C2 gone, proposal not re-armed
    at(NOW + 2 * DAYMS); gS1 = s; gId1 = id; MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.execute(new station.execute_arguments(gId1)); }).toThrow("executed with 1 current-council approval");
    revertedWith("not enough approvals from current council members");
    voteFor(s, C3, id); s.execute(new station.execute_arguments(id));                  // control: 2 current members
    expect(testGetToken(KOIN, OTHER)).toBe(100 * M);
  });
  it("M0023: an allowance holds at most 8 open terms; the 9th is refused", () => {
    const s = setupWide(); const r = buyPass(s, U1, U1, 1 * M, 1);
    for (let i = 0; i < 7; i++) renewBy(s, U1, r.id, 1);
    expect(allowanceOf(s, r.id).purchase_ids.length).toBe(8);
    gS1 = s; gR = new station.renew_arguments(U1, r.id, 1, USDT, 1000 * USD); signedBy([U1]); MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.renew(gR!); }).toThrow("a 9th open term was accepted");
    revertedWith("too many open terms on this allowance"); signedBy([]);
  });
  it("M0026: a reserved app's known users stop at its allowance + buffer (80 + 16 Mana), not later", () => {
    const s = setup();
    for (let i = 0; i < 48; i++) { at(NOW + 3000); expect(play(s, user(i))).toBe(true); }        // day 0: 96 Mana on Knode
    for (let i = 48; i < 61; i++) { at(NOW + 3000); expect(play(s, user(i), 2 * M, STORIES)).toBe(true); }
    at(T0 + 2 * DAYMS); let n = 0;
    for (let i = 0; i < 61; i++) { at(NOW + 3000); if (play(s, user(i))) n++; }            // known users now: no new-user pool
    expect(n).toBe(48, "80 allowance + 20% buffer = 96 Mana = 48 plays");
  });
  it("M0058: known users' Mana doesn't count toward the new-user pool", () => {
    const s = setup();
    for (let i = 0; i < 10; i++) { at(NOW + 3000); expect(play(s, user(i), 2 * M, STORIES)).toBe(true); }
    at(T0 + 2 * DAYMS);
    const c = cfg(); c.new_pct = 10; setConfig(s, c);                                 // new users: 10% of 96 Mana
    for (let i = 0; i < 10; i++) { at(NOW + 3000); expect(play(s, user(i))).toBe(true); }   // 20 Mana by known users
    at(NOW + 3000); expect(play(s, user(100))).toBe(true, "a new user still fits the (empty) new-user pool");
  });
  it("M0019: init refuses the station itself as treasury", () => {
    setup(); MockVM.reset(); System.setSystemBufferSize(256 * 1024);
    MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); direct();
    MockVM.setContractMetadata(new chain.contract_metadata_object(new Uint8Array(0), false, false, false, true));
    at(T0); testSetBalance(1000 * M);
    gS1 = new Station(); const c = cfg(); c.treasury = STATION; gC1 = c;
    signedBy([STATION]); deployTx(); MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.init(new station.init_arguments(gC1)); }).toThrow("the station was accepted as its own treasury");
    revertedWith("treasury must be an external wallet (escrow lives in the station)");
    const c2 = cfg(); c2.treasury = OTHER; gS1!.init(new station.init_arguments(c2));       // control
    expect(gS1!.get_status(new station.get_status_arguments()).treasury).toStrictEqual(OTHER);
  });
  it("M0038: a user's daily Mana may reach the limit exactly", () => {
    const s = setup(); const c = cfg(); c.new_mana = 4 * M; setConfig(s, c);
    at(NOW + 3000); expect(play(s, U1)).toBe(true);
    at(NOW + 3000); expect(play(s, U1)).toBe(true, "2 + 2 = the 4-Mana limit exactly");
    at(NOW + 3000); expect(play(s, U1)).toBe(false);
  });
  it("M0041: an app plan may use its total cap exactly", () => {
    const s = setupWide(); buyAccount(s, SOLDAPP, 4 * M, 1);
    expect(play(s, U1, 2 * M, SOLDAPP)).toBe(true);
    at(NOW + 3000); expect(play(s, U2, 2 * M, SOLDAPP)).toBe(true, "used_total 4 = cap_total 4");
    at(NOW + 3000); expect(play(s, user(3), 2 * M, SOLDAPP)).toBe(false);
  });
  it("M0031: a price equal to max_per_purchase is accepted", () => {
    const s = setupWide(); const p = PRICE(); p.max_per_purchase = 3_000;
    signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 1 * M, 1, 1)).available).toBe(true, "3,000 = the maximum");
    expect(s.quote_allowance(new station.quote_allowance_arguments(USDT, 2 * M, 1, 1)).reason!).toBe("above the per-purchase maximum");
  });
  it("M0040: a buyer's next ticket is allowed exactly when the ticket cooldown ends", () => {
    const s = setup(); const t0 = NOW;
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 50 * M, USDT, 1000 * USD, false, 0)); signedBy([]);
    at(t0 + DAYMS - 1); gS1 = s; gT1 = new station.buy_big_upload_arguments(BUYER, U2, 50 * M, USDT, 1000 * USD, false, 0);
    signedBy([BUYER, U2]); MockVM.commitTransaction(); clearRevert();
    expect(() => { gS1!.buy_big_upload(gT1!); }).toThrow("a second ticket 1 ms before the cooldown ends");
    revertedWith("buyer cooldown: one ticket per buyer per cooldown period");
    at(t0 + DAYMS); signedBy([BUYER, U2]); s.buy_big_upload(gT1!); signedBy([]);
    expect(s.get_ticket(new station.get_ticket_arguments(U2)).ticket != null).toBe(true);
  });
  it("M0036: new_mana may equal hard_max, not be below it", () => {
    const s = setup(); const c = cfg(); c.new_mana = c.hard_max; setConfig(s, c);
    const c2 = cfg(); c2.new_mana = c2.hard_max - 1;
    configRefused(s, c2, "per-user daily Mana below hard_max would stop paid service");
  });
  it("M0035: an allowance that expired exactly when the pause began is not extended by it", () => {
    const s = setupWide(); const r = buyPass(s, U1, U1, 1 * M, 1); const exp = r.expiry;
    at(exp); signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true));
    at(exp + DAYMS); s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    expect(allowanceOf(s, r.id).expiry).toBe(exp);
  });
  it("M0032: renewing an allowance from before AB-006 (cap_total 0) keeps it untracked", () => {
    const s = setupWide(); const r = buyPass(s, U1, U1, 1 * M, 1);
    const a = allowanceOf(s, r.id); a.cap_total = 0; a.used_total = 0; s.allowances.put(key4(a.id), a);
    renewBy(s, U1, r.id, 1);
    expect(allowanceOf(s, r.id).cap_total).toBe(0);
  });
});
