// Red-team IMPERSONATOR test (acting as someone else: paths that should already be closed), mana-station commit 4343f83.
// Attacks: name another wallet in a buyer / signer field you did not sign for; buy a pass for a wallet that did not sign;
// cancel or close someone else's plan or ticket; use someone else's pass as payee; vote, veto or act as owner with a
// signature that is not a member's / the owner's; vote twice; execute twice; get the station's contract_call "yes" for
// a call that does not come from the station's own code; get an unsigned operator transaction paid.
// Asserts the SAFE behaviour: fails if the bug exists. Expected to PASS today (controls for the impersonator pass).
// Helpers below are copied unchanged from assembly/__tests__/Station.spec.ts (lines 1-117).
/** Mana Station v2 on a simulated chain (MockVM). Mana, KOIN balance and stablecoins are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf, Crypto } from "@koinos/sdk-as";
import { Station, testSetMana, testSetBalance, testSetToken, testGetToken, VUSDT, VUSDC, ALLOWANCE_TERMS, BIG_TERMS, mulDiv } from "../Station";
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

// ───── red-team: impersonator, closed paths (controls) ─────
let xS: Station | null = null;
let xId: u32 = 0;
let xA: station.guarded_action | null = null;
function cdAs(s: Station, token: Uint8Array, caller: Uint8Array): bool {
  return s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_call, new authority.call_data(token, EP_TRANSFER, caller))).value;
}

describe("RT impersonator: acting as someone else is refused", () => {
  it("buyer fields: you can't buy in another wallet's name, nor a pass for a wallet that did not sign", () => {
    const s = setup(); xS = s;
    signedBy([U1, U2]); MockVM.commitTransaction();                      // BUYER did not sign
    clearRevert(); expect(() => { xS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 5 * M, 1, USDT, 1000 * USD)); }).toThrow("buyer must sign"); revertedWith("buyer must sign");
    signedBy([BUYER]); MockVM.commitTransaction();                        // the pass wallet U2 did not sign
    clearRevert(); expect(() => { xS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 5 * M, 1, USDT, 1000 * USD)); }).toThrow("pass wallet must sign"); revertedWith("the target app must approve (sign) this purchase");
    xId = buyAccount(s, SOLDAPP, 5 * M, 1).id;                            // renewal charged to BUYER without BUYER's signature
    signedBy([U2]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.renew(new station.renew_arguments(BUYER, xId, 1, USDT, 1000 * USD)); }).toThrow("renewal payer must sign"); revertedWith("payer must sign");
    signedBy([]); inv(s, USDT);
  });
  it("cancel / close: only the buyer cancels; not the target, not the ticket's payee, not a stranger", () => {
    const s = setup(); xS = s;
    xId = buyAccount(s, U2, 10 * M, 7).id;
    signedBy([U1]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.cancel_allowance(new station.cancel_allowance_arguments(U1, xId)); }).toThrow("not your allowance"); revertedWith("not your allowance");
    clearRevert(); expect(() => { xS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, xId)); }).toThrow("BUYER did not sign"); revertedWith("buyer must sign");
    signedBy([U2]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.cancel_allowance(new station.cancel_allowance_arguments(U2, xId)); }).toThrow("the target app is not the buyer"); revertedWith("not your allowance");
    signedBy([BUYER, U1]);                                                // a consented ticket for U1, bought by BUYER
    s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 50 * M, USDT, 1000 * USD, true));
    signedBy([U1]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.cancel_big_upload(new station.cancel_big_upload_arguments(U1, U1)); }).toThrow("the payee is not the ticket's buyer"); revertedWith("not your ticket");
    clearRevert(); expect(() => { xS!.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)); }).toThrow("BUYER did not sign"); revertedWith("buyer must sign");
    signedBy([]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.close_ticket(new station.close_ticket_arguments(U1)); }).toThrow("a running ticket can't be closed by anyone"); revertedWith("ticket still valid");
    signedBy([]); inv(s, USDT);
  });
  it("a Mana pass pays only for its own wallet as payee (not the buyer, not a stranger)", () => {
    const s = setup();
    signedBy([BUYER, U2]); s.buy_allowance(new station.buy_allowance_arguments(BUYER, 2, U2, 10 * M, 1, USDT, 1000 * USD)); signedBy([]);
    tx(U1, 2 * M, [op(SOLDAPP, EP_PLAY)]); expect(ok(s)).toBe(false, "stranger as payee");
    at(NOW + 3000); tx(BUYER, 2 * M, [op(SOLDAPP, EP_PLAY)]); expect(ok(s)).toBe(false, "the buyer is not the pass wallet");
    at(NOW + 3000); tx(U2, 2 * M, [op(SOLDAPP, EP_PLAY)]); expect(ok(s)).toBe(true, "control: the pass wallet itself");
  });
  it("council: signer field must be a member who signed; no double vote, no veto by outsiders, no second execute", () => {
    const s = setup(); xS = s; testSetBalance(1300 * M);
    const a = act(2); a.to = OTHER; a.amount = 300 * M; xA = a;
    signedBy([C1]); xId = s.propose(new station.propose_arguments(C1, a)).id;
    MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.approve(new station.approve_arguments(C2, xId)); }).toThrow("C1 signing can't vote as C2"); revertedWith("signer must sign");
    clearRevert(); expect(() => { xS!.approve(new station.approve_arguments(C1, xId)); }).toThrow("no double vote"); revertedWith("already approved");
    signedBy([OWNER]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.approve(new station.approve_arguments(OWNER, xId)); }).toThrow("the owner is not a member"); revertedWith("council members only");
    clearRevert(); expect(() => { xS!.propose(new station.propose_arguments(OWNER, xA)); }).toThrow("the owner can't propose"); revertedWith("council members only");
    signedBy([U1]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.cancel_proposal(new station.cancel_proposal_arguments(U1, xId)); }).toThrow("an outsider can't veto"); revertedWith("council members only");
    clearRevert(); expect(() => { xS!.cancel_proposal(new station.cancel_proposal_arguments(C3, xId)); }).toThrow("U1 signing can't veto as C3"); revertedWith("signer must sign");
    signedBy([C2]); s.approve(new station.approve_arguments(C2, xId)); signedBy([]);
    at(NOW + 2 * DAYMS); s.execute(new station.execute_arguments(xId));
    MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.execute(new station.execute_arguments(xId)); }).toThrow("executed once only"); revertedWith("proposal already closed");
    expect(testGetToken(KOIN, OTHER)).toBe(300 * M);
  });
  it("owner-only actions refuse a council member, a buyer and the station; resume is owner-only", () => {
    const s = setup(); xS = s;
    signedBy([C1]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false)); }).toThrow("council is not owner"); revertedWith("owner only");
    signedBy([STATION]); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false)); }).toThrow("station key is not owner"); revertedWith("owner only");
    signedBy([C1]); s.set_paused(new station.set_paused_arguments(true)); MockVM.commitTransaction();
    clearRevert(); expect(() => { xS!.set_paused(new station.set_paused_arguments(false)); }).toThrow("a council member can pause but not resume"); revertedWith("owner only");
    signedBy([]);
  });
  it("contract_call: yes only when the station's own code calls the token", () => {
    const s = setup();
    expect(cdAs(s, USDT, STATION)).toBe(true, "escrow payout by the station's code");
    expect(cdAs(s, USDT, OWNER)).toBe(false); expect(cdAs(s, USDT, C1)).toBe(false);
    expect(cdAs(s, USDT, BUYER)).toBe(false); expect(cdAs(s, USDT, KNODE)).toBe(false);
    expect(cdAs(s, USDT, new Uint8Array(0))).toBe(false, "a tx signed with the station key");
    expect(cdAs(s, KOIN, SOLDAPP)).toBe(false, "a contract the station once called");
  });
  it("operator route: an admin tx naming the owner or a member as payee is paid only if that wallet signed", () => {
    const s = setup();
    tx(OWNER, M, [op(STATION, 0x12345678)]); signedBy([]); expect(ok(s)).toBe(false, "owner as payee, not signed");
    at(NOW + 3000); tx(C1, M, [op(STATION, 0x12345678)]); signedBy([U1]); expect(ok(s)).toBe(false, "member as payee, someone else signed");
    at(NOW + 3000); tx(U1, M, [op(STATION, 0x12345678)]); signedBy([U1]); expect(ok(s)).toBe(false, "not an operator");
    at(NOW + 3000); tx(OWNER, M, [op(STATION, 0x12345678)]); signedBy([OWNER]); expect(ok(s)).toBe(true, "control");
    signedBy([]);
  });
});
