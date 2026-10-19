/**
 * Mana Station (TESTNET prototype). The station account is this contract. It never signs anything: the chain calls
 * `authorize` when a transaction names the station as payer, and the station agrees to pay only for allowlisted calls
 * into approved apps, within per-user / per-app limits and never below its rolling reserve floor.
 *
 * Upload with ONLY authorizes_transaction_application = true. Then the station's KOIN can only move with the station
 * key's signature (contract_call stays a plain signature check), and code changes need that key too.
 */
import { System, Storage, Protobuf, Arrays, Token, authority, value, protocol } from "@koinos/sdk-as";
import { station } from "./proto/station";

const S_CONFIG: u32 = 0, S_APPS: u32 = 1, S_ENTRIES: u32 = 2, S_USERS: u32 = 3, S_APPWIN: u32 = 4;
const DAY: u64 = 86_400_000;
const USER_SLOT: u64 = 21_600_000; // 6 h buckets × 4 = rolling 24 h per user
const USER_N: i32 = 4;
const APP_SLOT: u64 = 3_600_000;   // 1 h buckets × 24 = rolling 24 h per app
const APP_N: i32 = 24;

// Test build only: values the simulated chain cannot provide.
export let TEST_MANA: u64 = 0;
export let TEST_BALANCE: u64 = 0;
export function testSetMana(m: u64): void { TEST_MANA = m; }
export function testSetBalance(b: u64): void { TEST_BALANCE = b; }

function isAddress(a: Uint8Array | null): bool { return a != null && a.length == 25; }
function u32Key(n: u32): Uint8Array { const k = new Uint8Array(4); k[0] = u8(n >> 24); k[1] = u8(n >> 16); k[2] = u8(n >> 8); k[3] = u8(n); return k; }
function entryKey(contract: Uint8Array, ep: u32): Uint8Array { const k = new Uint8Array(contract.length + 4); k.set(contract, 0); k.set(u32Key(ep), contract.length); return k; }

/** The current transaction's operations (same path as the Knode contract proved on mainnet). */
function txOps(): protocol.operation[] {
  if (BUILD_FOR_TESTING) return System.getTransaction().operations;
  const list = Protobuf.decode<value.list_type>(System.getTransactionField("operations")!.message_value!.value!, value.list_type.decode);
  const out = new Array<protocol.operation>();
  for (let i = 0; i < list.values.length; i++) out.push(Protobuf.decode<protocol.operation>(list.values[i].message_value!.value!, protocol.operation.decode));
  return out;
}

/** Bring a ring window up to `slot`, clearing buckets that fell out of the 24 h span. */
function roll(w: station.window_object, slot: u64, n: i32, withNew: bool): void {
  if (w.n.length != n) {
    w.n = new Array<u32>(n); w.mana = new Array<u64>(n); w.new_mana = withNew ? new Array<u64>(n) : new Array<u64>(0);
    for (let i = 0; i < n; i++) { w.n[i] = 0; w.mana[i] = 0; if (withNew) w.new_mana[i] = 0; }
    w.base = slot; return;
  }
  if (slot <= w.base) return;
  const steps = slot - w.base;
  const clear = steps >= u64(n) ? n : i32(steps);
  for (let k = 1; k <= clear; k++) {
    const i = i32((w.base + u64(k)) % u64(n));
    w.n[i] = 0; w.mana[i] = 0; if (withNew) w.new_mana[i] = 0;
  }
  w.base = slot;
}
function sumN(w: station.window_object): u32 { let s: u32 = 0; for (let i = 0; i < w.n.length; i++) s += w.n[i]; return s; }
function sumMana(w: station.window_object): u64 { let s: u64 = 0; for (let i = 0; i < w.mana.length; i++) s += w.mana[i]; return s; }
function sumNew(w: station.window_object): u64 { let s: u64 = 0; for (let i = 0; i < w.new_mana.length; i++) s += w.new_mana[i]; return s; }

export class Station {
  contractId: Uint8Array = System.getContractId();
  config: Storage.Obj<station.config_object> = new Storage.Obj(System.getContractId(), S_CONFIG, station.config_object.decode, station.config_object.encode, () => new station.config_object());
  apps: Storage.Map<Uint8Array, station.app_object> = new Storage.Map(System.getContractId(), S_APPS, station.app_object.decode, station.app_object.encode, null);
  entries: Storage.Map<Uint8Array, station.entry_object> = new Storage.Map(System.getContractId(), S_ENTRIES, station.entry_object.decode, station.entry_object.encode, null);
  users: Storage.Map<Uint8Array, station.user_object> = new Storage.Map(System.getContractId(), S_USERS, station.user_object.decode, station.user_object.encode, null);
  appWin: Storage.Map<Uint8Array, station.window_object> = new Storage.Map(System.getContractId(), S_APPWIN, station.window_object.decode, station.window_object.encode, () => new station.window_object());

  mana(): u64 { return BUILD_FOR_TESTING ? TEST_MANA : System.getAccountRC(this.contractId); }
  balance(c: station.config_object): u64 {
    if (c.budget_base > 0) return c.budget_base;
    if (BUILD_FOR_TESTING) return TEST_BALANCE;
    return new Token(System.getContractAddress("koin")).balanceOf(this.contractId);
  }
  now(): u64 { return System.getBlockField("header.timestamp")!.uint64_value; }
  height(): u64 { return System.getBlockField("header.height")!.uint64_value; }
  share(c: station.config_object, a: station.app_object): u64 {
    return this.balance(c) / 100 * u64(c.refill_pct) / 100 * u64(a.share_pct);
  }

  // ═══════ authorize: the station pays only when every rule passes ═══════
  authorize(args: authority.authorize_arguments): authority.authorize_result {
    if (args.type == authority.authorization_type.transaction_application) return new authority.authorize_result(this.sponsorOk());
    return new authority.authorize_result(false); // never authorizes token moves or code uploads
  }

  sponsorOk(): bool {
    const c = this.config.get()!;
    if (!isAddress(c.owner)) return false;
    const rc = System.getTransactionField("header.rc_limit")!.uint64_value;
    const pf = System.getTransactionField("header.payee");
    const payee = pf == null ? new Uint8Array(0) : pf.bytes_value;
    const mana = this.mana();
    if (rc > mana) return false;
    // Admin 1: the station's own transactions (withdrawals, setup): only with the station key's signature.
    if (payee.length == 0 || Arrays.equal(payee, this.contractId)) {
      return System.checkAuthority(authority.authorization_type.contract_call, this.contractId);
    }
    const ops = txOps();
    if (ops.length < 1 || ops.length > i32(c.max_ops)) return false;
    // Admin 2: owner calls into the station itself (pause / unpause / settings). Works while paused and below the floor.
    let allSelf = true;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i].call_contract;
      if (o == null || !Arrays.equal(o.contract_id, this.contractId)) { allSelf = false; break; }
    }
    if (allSelf) {
      return rc <= c.hard_max && Arrays.equal(payee, c.owner) && System.checkAuthority(authority.authorization_type.contract_call, c.owner!);
    }
    if (c.paused) return false;
    if (rc > c.hard_max) return false;
    if (mana - rc < c.floor) return false;                 // rolling reserve floor
    // Allowlist: every operation a call to an approved (contract, entry point) of ONE app.
    let cap: u64 = 0; let app: u32 = 0;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i].call_contract;
      if (o == null) return false;                          // upload / set_system_* operations never sponsored
      const e = this.entries.get(entryKey(o.contract_id, o.entry_point));
      if (e == null) return false;
      if (u32(o.args.length) > e.max_args) return false;
      if (i > 0 && e.app != app) return false;
      app = e.app; cap += e.cap;
    }
    if (rc > cap) return false;
    const a = this.apps.get(u32Key(app));
    if (a == null || !a.active) return false;
    // Per user.
    const now = this.now(), h = this.height();
    let u = this.users.get(payee);
    if (u == null) { u = new station.user_object(); u.first_seen = now; u.last_block = u64.MAX_VALUE; u.day = new station.window_object(); }
    if (u.cooldown_until > now) return false;
    if (u.last_block == h) return false;                    // 1 sponsored tx per user per block
    const minute = now / 60_000;
    if (u.minute != minute) { u.minute = minute; u.n_min = 0; }
    if (u.n_min >= c.per_min) return false;
    const isNew = now - u.first_seen < DAY;
    if (u.day == null) u.day = new station.window_object();
    const uw = u.day!;
    roll(uw, now / USER_SLOT, USER_N, false);
    if (sumN(uw) + 1 > (isNew ? c.new_actions : c.day_actions)) return false;
    if (sumMana(uw) + rc > (isNew ? c.new_mana : c.day_mana)) return false;
    // Per app (rolling 24 h share of the daily refill).
    const share = this.share(c, a);
    const aw = this.appWin.get(u32Key(app))!;
    roll(aw, now / APP_SLOT, APP_N, true);
    if (sumMana(aw) + rc > share) return false;
    if (isNew && sumNew(aw) + rc > share / 100 * u64(c.new_pct)) return false;
    // Accepted: record. These writes persist even if the app call later reverts (the tx is still included).
    u.n_min += 1;
    if (u.n_min >= c.per_min) u.cooldown_until = now + c.cooldown_ms; // set by an ACCEPTED tx, so it survives
    u.last_block = h;
    const ui = i32((now / USER_SLOT) % u64(USER_N));
    uw.n[ui] += 1; uw.mana[ui] += rc;
    const ai = i32((now / APP_SLOT) % u64(APP_N));
    aw.n[ai] += 1; aw.mana[ai] += rc; if (isNew) aw.new_mana[ai] += rc;
    this.users.put(payee, u);
    this.appWin.put(u32Key(app), aw);
    return true;
  }

  // ═══════ read-only ═══════
  get_status(args: station.get_status_arguments): station.get_status_result {
    const c = this.config.get()!;
    const m = this.mana();
    const r = new station.get_status_result();
    r.config = c; r.mana = m; r.available = m > c.floor ? m - c.floor : 0;
    r.daily_refill = this.balance(c) / 100 * u64(c.refill_pct);
    return r;
  }
  get_user(args: station.get_user_arguments): station.get_user_result {
    const r = new station.get_user_result();
    const u = this.users.get(args.user!);
    if (u == null) return r;
    if (u.day != null) { roll(u.day!, this.now() / USER_SLOT, USER_N, false); r.actions_24h = sumN(u.day!); r.mana_24h = sumMana(u.day!); }
    r.user = u;
    return r;
  }
  get_app(args: station.get_app_arguments): station.get_app_result {
    const r = new station.get_app_result();
    const a = this.apps.get(u32Key(args.app));
    if (a == null) return r;
    const aw = this.appWin.get(u32Key(args.app))!;
    roll(aw, this.now() / APP_SLOT, APP_N, true);
    r.app = a; r.share = this.share(this.config.get()!, a); r.used_24h = sumMana(aw); r.new_used_24h = sumNew(aw);
    return r;
  }
  get_entry(args: station.get_entry_arguments): station.get_entry_result {
    const r = new station.get_entry_result();
    r.entry = this.entries.get(entryKey(args.contract_id!, args.entry_point));
    return r;
  }

  // ═══════ admin ═══════
  requireOwner(): station.config_object {
    const c = this.config.get()!;
    System.require(isAddress(c.owner), "not initialized");
    System.require(System.checkAuthority(authority.authorization_type.contract_call, c.owner!), "owner only");
    return c;
  }
  init(args: station.init_arguments): station.init_result {
    System.require(!isAddress(this.config.get()!.owner), "already initialized");
    System.require(System.checkAuthority(authority.authorization_type.contract_call, this.contractId), "station key only");
    System.require(args.config != null && isAddress(args.config!.owner), "owner required");
    this.config.put(args.config!);
    return new station.init_result();
  }
  set_config(args: station.set_config_arguments): station.set_config_result {
    this.requireOwner();
    System.require(args.config != null && isAddress(args.config!.owner), "owner required");
    this.config.put(args.config!);
    return new station.set_config_result();
  }
  set_paused(args: station.set_paused_arguments): station.set_paused_result {
    const c = this.requireOwner();
    c.paused = args.paused;
    this.config.put(c);
    System.event("station.paused", Protobuf.encode(args, station.set_paused_arguments.encode), []);
    return new station.set_paused_result();
  }
  set_app(args: station.set_app_arguments): station.set_app_result {
    this.requireOwner();
    System.require(args.value != null && args.value!.share_pct <= 100, "share 0..100");
    this.apps.put(u32Key(args.app), args.value!);
    return new station.set_app_result();
  }
  set_entry(args: station.set_entry_arguments): station.set_entry_result {
    const c = this.requireOwner();
    const k = entryKey(args.contract_id!, args.entry_point);
    if (args.remove) { this.entries.remove(k); return new station.set_entry_result(); }
    System.require(args.value != null && args.value!.cap <= c.hard_max, "cap above hard_max");
    this.entries.put(k, args.value!);
    return new station.set_entry_result();
  }
}
