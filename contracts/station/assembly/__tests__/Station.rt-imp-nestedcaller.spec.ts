// Red-team IMPERSONATOR test (signature forwarded through another contract), mana-station commit 4343f83.
// Attack: every "X must sign" check in the station is System.checkAuthority(contract_call, X) with no look at the caller
// (requireOwner Station.ts:825, requireCouncil :1262, set_paused/signedCouncil :829/:887, buyer checks :721/:755/:784/:1014/:1070).
// For a normal wallet (no authorize override) Koinos answers that from the transaction's signatures, so when the owner,
// a council member or a buyer signs ANY transaction that calls some other contract E (a game, a mint, a dApp), E can call
// the station in the same transaction and act as them: propose / approve a KOIN withdrawal, pause, exempt E's own
// contract for free Mana, cancel a buyer's plan. The station never checks System.getCaller() (no use in Station.ts).
// MockVM.setCaller(E) plays "the station was called by contract E"; signedBy([X]) plays X's signature on the outer tx.
// (Whether the real kernel grants X's authority inside E's nested call is the assumption to confirm on a local chain.)
// Asserts the SAFE behaviour: FAILS while the issue exists (proof), PASSES once fixed (owner / council / buyer checks also
// require the call to come straight from the transaction or from X itself: caller empty or caller == X).
// Helpers below are copied unchanged from assembly/__tests__/Station.spec.ts (lines 1-117).
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

// ───── red-team: impersonator, forwarded signatures ─────
const EVIL = user(77);                         // a contract the signer happens to call (dApp, game, mint...)
const LOOT = user(78);                         // where the attacker wants KOIN to go
function viaContract(): void { MockVM.setCaller(new chain.caller_data(EVIL, chain.privilege.user_mode)); }
function direct(): void { MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode)); }
let xS: Station | null = null;
let xA: station.guarded_action | null = null;
let xId: u32 = 0;
function withdrawal(): station.guarded_action { const a = act(2); a.to = LOOT; a.amount = 300 * M; return a; }

describe("RT impersonator: owner / council / buyer signature used by a contract they called", () => {
  it("control: the same calls made directly by the signer work", () => {
    const s = setup(); testSetBalance(1300 * M); direct();
    signedBy([C1]); const id = s.propose(new station.propose_arguments(C1, withdrawal())).id;
    signedBy([C2]); s.approve(new station.approve_arguments(C2, id));
    signedBy([OWNER]); s.set_exempt(new station.set_exempt_arguments(OTHER, new station.exempt_object(0, false), false));
    signedBy([]);
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.approvals.length).toBe(2);
  });
  it("a contract a council member calls can't propose a KOIN withdrawal in that member's name", () => {
    const s = setup(); xS = s; testSetBalance(1300 * M); xA = withdrawal();
    signedBy([C1]); viaContract(); MockVM.commitTransaction();
    expect(() => { xS!.propose(new station.propose_arguments(C1, xA)); }).toThrow("propose relayed by another contract must be refused");
    direct(); signedBy([]);
  });
  it("a contract a council member calls can't add that member's approval", () => {
    const s = setup(); xS = s; testSetBalance(1300 * M);
    signedBy([C1]); xId = s.propose(new station.propose_arguments(C1, withdrawal())).id;  // direct, by C1
    signedBy([C2]); viaContract(); MockVM.commitTransaction();                            // C2 only signed a tx to EVIL
    expect(() => { xS!.approve(new station.approve_arguments(C2, xId)); }).toThrow("approve relayed by another contract must be refused");
    direct(); signedBy([]);
  });
  it("a contract the owner calls can't make itself a free (exempt) app", () => {
    const s = setup(); xS = s;
    signedBy([OWNER]); viaContract(); MockVM.commitTransaction();
    expect(() => { xS!.set_exempt(new station.set_exempt_arguments(EVIL, new station.exempt_object(0, false), false)); })
      .toThrow("owner action relayed by another contract must be refused");
    direct(); signedBy([]);
  });
  it("a contract a council member calls can't pause the station", () => {
    const s = setup(); xS = s;
    signedBy([C3]); viaContract(); MockVM.commitTransaction();
    expect(() => { xS!.set_paused(new station.set_paused_arguments(true)); }).toThrow("pause relayed by another contract must be refused");
    direct(); signedBy([]);
  });
  it("a contract a buyer calls can't cancel that buyer's plan (the minimum charge and the current day are lost)", () => {
    const s = setup(); xS = s; direct();
    xId = buyAccount(s, U2, 10 * M, 7).id;
    signedBy([BUYER]); viaContract(); MockVM.commitTransaction();
    expect(() => { xS!.cancel_allowance(new station.cancel_allowance_arguments(BUYER, xId)); }).toThrow("cancel relayed by another contract must be refused");
    direct(); signedBy([]);
  });
});
