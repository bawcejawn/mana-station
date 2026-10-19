/** Station rules on a simulated chain (MockVM). Mana and the KOIN balance are test values. Run: npm test */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf } from "@koinos/sdk-as";
import { Station, testSetMana } from "../Station";
import { station } from "../proto/station";

const STATION = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqe");
const OWNER = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqG");
const APP1 = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqK"); // "Knode"
const APP2 = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqP"); // "SwarmTales"
const OTHER = Base58.decode("12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq");
const KOIN = Base58.decode("19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK");
const U1 = Base58.decode("1PWeFG4pPtjZZoYvcmGb6mYhMYJjnkHrmz");
const U2 = Base58.decode("1HGh4rQvYYcm4fGiU1C7vQoSxnUiGa9Ah7");
const M: u64 = 100_000_000; // 1 Mana
const EP_PLAY: u32 = 0x11111111, EP_HEAVY: u32 = 0x22222222, EP_NOPE: u32 = 0x33333333, EP_TRANSFER: u32 = 0x27f576ca;
const T0: u64 = 1_800_000_000_000; // block time (ms)
const DAYMS: u64 = 86_400_000;

let H: u64 = 1000; let NOW: u64 = T0;
function at(t: u64): void { NOW = t; H += 1; MockVM.setBlock(new protocol.block(new Uint8Array(0), new protocol.block_header(new Uint8Array(0), H, t))); System.resetCache(); }
function signedBy(accts: Uint8Array[]): void {
  const a = new Array<MockVM.MockAuthority>();
  for (let i = 0; i < accts.length; i++) a.push(new MockVM.MockAuthority(authority.authorization_type.contract_call, accts[i], true));
  MockVM.setAuthorities(a);
}
function cfg(): station.config_object {
  const c = new station.config_object();
  c.owner = OWNER; c.paused = false; c.floor = 6000 * M; c.hard_max = 3 * M;
  c.per_min = 5; c.cooldown_ms = 600_000; c.day_actions = 25; c.day_mana = 60 * M;
  c.new_actions = 10; c.new_mana = 25 * M; c.new_pct = 25; c.max_ops = 2; c.refill_pct = 20;
  c.budget_base = 30_000 * M; // 30k KOIN → 6,000 Mana/day refill
  return c;
}
function setup(): Station {
  MockVM.reset();
  MockVM.setContractId(STATION);
  MockVM.setContractArguments(STATION);
  MockVM.setEntryPoint(0);
  MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
  MockVM.setContractMetadata(new chain.contract_metadata_object(new Uint8Array(0), false, false, false, true));
  MockVM.setHeadInfo(new chain.head_info(null, 0, 1));
  at(T0);
  testSetMana(30_000 * M);
  const s = new Station();
  signedBy([STATION]);
  s.init(new station.init_arguments(cfg()));
  signedBy([OWNER]);
  s.set_app(new station.set_app_arguments(1, new station.app_object(50, true)));
  s.set_app(new station.set_app_arguments(2, new station.app_object(50, true)));
  s.set_entry(new station.set_entry_arguments(APP1, EP_PLAY, new station.entry_object(1, 3 * M, 256), false));
  s.set_entry(new station.set_entry_arguments(APP1, EP_HEAVY, new station.entry_object(1, 2 * M, 256), false));
  s.set_entry(new station.set_entry_arguments(APP2, EP_PLAY, new station.entry_object(2, 3 * M, 256), false));
  signedBy([]);
  return s;
}
function op(contract: Uint8Array, ep: u32, argLen: i32 = 8): protocol.operation {
  const o = new protocol.operation();
  o.call_contract = new protocol.call_contract_operation(contract, ep, new Uint8Array(argLen));
  return o;
}
function tx(payee: Uint8Array | null, rc: u64, ops: protocol.operation[]): void {
  const t = new protocol.transaction();
  t.header = new protocol.transaction_header();
  t.header!.rc_limit = rc;
  t.header!.payer = STATION;
  if (payee != null) t.header!.payee = payee;
  t.operations = ops;
  MockVM.setTransaction(t);
  System.resetCache();
}
function ok(s: Station): bool { return s.authorize(new authority.authorize_arguments(authority.authorization_type.transaction_application)).value; }
function play(s: Station, who: Uint8Array, rc: u64 = 2 * M): bool { tx(who, rc, [op(APP1, EP_PLAY)]); return ok(s); }

describe("what is sponsored", () => {
  it("pays for an approved call, refuses everything else", () => {
    const s = setup();
    expect(play(s, U1)).toBe(true);
    at(NOW + 70_000);
    tx(U1, 2 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(false);          // token transfer
    tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);             // unapproved contract
    tx(U1, 2 * M, [op(APP1, EP_NOPE)]); expect(ok(s)).toBe(false);              // unapproved entry point
    tx(U1, 3 * M + 1, [op(APP1, EP_PLAY)]); expect(ok(s)).toBe(false);          // rc_limit above the action cap / hard max
    tx(U1, 2 * M + 1, [op(APP1, EP_HEAVY)]); expect(ok(s)).toBe(false);         // above this entry point's own cap (2)
    tx(U1, 2 * M, [op(APP1, EP_PLAY, 300)]); expect(ok(s)).toBe(false);         // arguments too large
    tx(U1, 2 * M, [op(APP1, EP_PLAY), op(APP2, EP_PLAY)]); expect(ok(s)).toBe(false); // two apps in one tx
    tx(U1, 2 * M, [op(APP1, EP_PLAY), op(APP1, EP_PLAY), op(APP1, EP_PLAY)]); expect(ok(s)).toBe(false); // > max_ops
    const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(STATION, new Uint8Array(4));
    tx(U1, 2 * M, [up]); expect(ok(s)).toBe(false);                              // code upload
    tx(U1, 2 * M, [op(APP1, EP_PLAY), up]); expect(ok(s)).toBe(false);           // approved call + upload
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_call)).value).toBe(false);
    expect(s.authorize(new authority.authorize_arguments(authority.authorization_type.contract_upload)).value).toBe(false);
    tx(U1, 2 * M, [op(APP1, EP_HEAVY)]); expect(ok(s)).toBe(true);              // a different approved action
  });
});

describe("rolling reserve floor (reads the station's own Mana)", () => {
  it("never sponsors below 6,000 Mana", () => {
    const s = setup();
    testSetMana(6000 * M + 2 * M - 1);
    expect(play(s, U1)).toBe(false);
    testSetMana(6000 * M + 2 * M);
    expect(play(s, U1)).toBe(true);
    testSetMana(1 * M);                                                           // even below rc_limit
    at(NOW + 70_000); expect(play(s, U1)).toBe(false);
  });
});

describe("per-user limits", () => {
  it("1 per block, 5 per minute, then a 10-minute cooldown that is stored by the accepted tx", () => {
    const s = setup();
    at(T0 + 60_000 * 100);                                                        // start of a minute
    expect(play(s, U1)).toBe(true);
    expect(play(s, U1)).toBe(false);                                               // same block
    for (let i = 0; i < 4; i++) { at(NOW + 3000); expect(play(s, U1)).toBe(true); }
    const u = s.get_user(new station.get_user_arguments(U1)).user!;
    expect(u.cooldown_until).toBe(NOW + 600_000);                                  // written by the 5th, ACCEPTED tx
    at(NOW + 3000); expect(play(s, U1)).toBe(false);
    at(NOW + 120_000); expect(play(s, U1)).toBe(false);                            // next minute: still cooling down
    at(u.cooldown_until + 1); expect(play(s, U1)).toBe(true);
    expect(play(s, U2)).toBe(true);                                                // other users unaffected
  });
  it("new users: 10 actions in their first 24 h, then 25 per rolling 24 h", () => {
    const s = setup();
    let t = T0;
    for (let i = 0; i < 10; i++) { t += 13 * 60_000; at(t); expect(play(s, U1)).toBe(true); }
    t += 13 * 60_000; at(t); expect(play(s, U1)).toBe(false);                     // 11th on day one
    // after 24 h the user is no longer new; 10 used in the window still count until their 6 h bucket rolls out
    t = T0 + DAYMS + 60_000; at(t);
    let n = 0;
    for (let i = 0; i < 30; i++) { t += 13 * 60_000; at(t); if (play(s, U1, M)) n++; }
    expect(n).toBeGreaterThan(14);
    expect(n).toBeLessThanOrEqual(25);
  });
  it("rolling window: a full allowance comes back 24 h later, not at 00:00 UTC", () => {
    const s = setup();
    let t = T0 + 2 * DAYMS; at(t);
    // make U2 an old user
    expect(play(s, U2, M)).toBe(true);
    t += DAYMS + 6 * 3_600_000; at(t);
    const start = t;
    let n = 0;
    for (let i = 0; i < 30; i++) { t += 13 * 60_000; at(t); if (play(s, U2, M)) n++; }
    expect(n).toBe(25);
    t = start + 20 * 3_600_000; at(t); expect(play(s, U2, M)).toBe(false);       // 20 h later: still used up
    t = start + 30 * 3_600_000; at(t); expect(play(s, U2, M)).toBe(true);        // all buckets rolled out
  });
  it("per-user Mana cap (60 Mana per rolling 24 h, counted at rc_limit)", () => {
    const s = setup();
    let t = T0 + 2 * DAYMS; at(t); expect(play(s, U2, M)).toBe(true);
    t += DAYMS + 6 * 3_600_000;
    let n = 0;
    for (let i = 0; i < 25; i++) { t += 13 * 60_000; at(t); if (play(s, U2, 3 * M)) n++; }
    expect(n).toBe(20);                                                            // 20 × 3 = 60 Mana
  });
});

describe("per-app share (50/50 of the daily refill, configurable)", () => {
  it("stops an app at its share; the other app keeps working; new users capped at 25% of the share", () => {
    const s = setup();
    signedBy([OWNER]);
    const c = cfg(); c.budget_base = 1000 * M; c.day_actions = 1000; c.day_mana = 100000 * M; c.new_actions = 1000; c.new_mana = 100000 * M;
    s.set_config(new station.set_config_arguments(c));                            // refill 200, share 100 Mana each
    signedBy([]);
    let t = T0; let n = 0;
    // new users only: pool 25% of 100 = 25 Mana → 12 txs at 2 Mana
    for (let i = 0; i < 20; i++) { t += 13 * 60_000; at(t); if (play(s, U1)) n++; }
    expect(n).toBe(12);
    const a = s.get_app(new station.get_app_arguments(1));
    expect(a.share).toBe(100 * M);
    expect(a.new_used_24h).toBe(24 * M);
    tx(U2, 2 * M, [op(APP2, EP_PLAY)]); expect(ok(s)).toBe(true);                // app 2 independent
    signedBy([OWNER]);
    s.set_app(new station.set_app_arguments(3, new station.app_object(0, true))); // added later with 0% → nothing
    s.set_entry(new station.set_entry_arguments(OTHER, EP_PLAY, new station.entry_object(3, 3 * M, 256), false));
    signedBy([]);
    at(NOW + 3000); tx(U2, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false);
  });
});

describe("admin and kill switch", () => {
  it("pause stops sponsorship; the owner can still unpause with station Mana, below the floor", () => {
    const s = setup();
    signedBy([OWNER]); s.set_paused(new station.set_paused_arguments(true)); signedBy([]);
    expect(play(s, U1)).toBe(false);
    testSetMana(10 * M);                                                          // far below the floor
    tx(OWNER, 1 * M, [op(STATION, 0x12345678)]);
    expect(ok(s)).toBe(false);                                                    // not signed by the owner
    signedBy([OWNER]); expect(ok(s)).toBe(true);
    signedBy([U1]); tx(U1, 1 * M, [op(STATION, 0x12345678)]); expect(ok(s)).toBe(false); // someone else
    signedBy([OWNER]); tx(OWNER, 4 * M, [op(STATION, 0x12345678)]); expect(ok(s)).toBe(false); // above hard max
    s.set_paused(new station.set_paused_arguments(false)); signedBy([]);
    testSetMana(30_000 * M);
    at(NOW + 70_000); expect(play(s, U1)).toBe(true);
  });
  it("station's own transactions (no payee) need the station key", () => {
    const s = setup();
    tx(null, 5 * M, [op(KOIN, EP_TRANSFER)]);
    expect(ok(s)).toBe(false);
    signedBy([STATION]); expect(ok(s)).toBe(true);
    tx(STATION, 5 * M, [op(KOIN, EP_TRANSFER)]); expect(ok(s)).toBe(true);       // payee = station: same rule
  });
  it("only the owner changes settings", () => {
    const s = setup();
    signedBy([U1]);
    expect(() => { const t = new Station(); t.set_paused(new station.set_paused_arguments(true)); }).toThrow();
  });
});

describe("storage size of the rolling windows", () => {
  it("logs the record sizes after a day of use", () => {
    const s = setup();
    let t = T0 + 2 * DAYMS; at(t); play(s, U2, M);
    t += DAYMS + 6 * 3_600_000;
    for (let i = 0; i < 25; i++) { t += 55 * 60_000; at(t); play(s, U2, 2 * M); }
    const u = s.get_user(new station.get_user_arguments(U2)).user!;
    const k = new Uint8Array(4); k[3] = 1; const aw = s.appWin.get(k)!;
    log<string>("user_object bytes: " + Protobuf.encode(u, station.user_object.encode).length.toString());
    log<string>("app window bytes: " + Protobuf.encode(aw, station.window_object.encode).length.toString());
    expect(Protobuf.encode(u, station.user_object.encode).length).toBeLessThan(120);
  });
});
