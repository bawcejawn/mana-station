// audit-2026-10 (Repo Lense audit of ef59727): one test per contract finding, as the report's remediation plan asks.
// C-1 and M-5's checkout parts are also in Station.spec.ts; the per-recipient fuzz for M-3 is Station.fuzz-slotfee.spec.ts.
import { MockVM, Protobuf, protocol, System, chain } from "@koinos/sdk-as";
import { Station, testAutoClaim, testRefuseTransfersTo, testSetMana, testSetBalance, testSetToken, testGetToken, mulDiv } from "../Station";
import { station } from "../proto/station";
import { clearRevert, revertedWith } from "./lib/revert";
import {
  STATION, OWNER, KNODE, OTHER, SOLDAPP, USDT, U1, U2, BUYER, M, USD, EP_PLAY, DAYMS, HOUR, NOW, T0, C1, C2, C3,
  at, signedBy, cm, user, cfg, setup, deployTx, op, tx, ok, play, inv, councilDo, act, PRICE,
} from "./lib/harness";

let gS: Station | null = null;
let gC: station.config_object | null = null;
let gA: station.guarded_action | null = null;
let gId: u32 = 0;
let gW: Uint8Array = new Uint8Array(0);
function opA(contract: Uint8Array, ep: u32, args: Uint8Array): protocol.operation {
  const o = new protocol.operation(); o.call_contract = new protocol.call_contract_operation(contract, ep, args); return o;
}
function buyPass(s: Station, buyer: Uint8Array, mpd: u64, days: u64): station.buy_allowance_result {
  signedBy([buyer]); const r = s.buy_allowance(new station.buy_allowance_arguments(buyer, 2, buyer, mpd, days, USDT, 1000 * USD)); signedBy([]); return r;
}
function renewBy(s: Station, payer: Uint8Array, id: u32, days: u64): void {
  signedBy([payer]); s.renew(new station.renew_arguments(payer, id, days, USDT, 1000 * USD)); signedBy([]);
}
function suspend(s: Station, who: Uint8Array, reason: u32): void { signedBy([OWNER]); s.suspend_allowance(new station.suspend_allowance_arguments(who, reason)); signedBy([]); }
function esc(s: Station, id: u32): station.escrow_object { return s.get_escrow(new station.get_escrow_arguments(id)).purchase!; }
function propose(s: Station, who: Uint8Array, a: station.guarded_action): u32 { signedBy([who]); const id = s.propose(new station.propose_arguments(who, a)).id; signedBy([]); return id; }
function approve(s: Station, who: Uint8Array, id: u32): void { signedBy([who]); s.approve(new station.approve_arguments(who, id)); signedBy([]); }

describe("audit-2026-10 M-1: a ticket's Mana is kept for it, and it needs nothing more", () => {
  it("with one open ticket, other routes stop at admin_min + the ticket's lock; the ticket's upload is still paid", () => {
    const s = setup();
    signedBy([BUYER, U2]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U2, 100 * M, USDT, 1000 * USD, true)); signedBy([]);
    buyPass(s, U1, 10 * M, 7);
    testSetMana(5 * M + 100 * M + 1 * M);                       // admin_min 5 + ticket 100 + 1
    at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(false, "a pass may not reach into the ticket's lock");
    at(NOW + 3000); expect(play(s, user(3), 2 * M)).toBe(false, "nor a free app");
    const up = new protocol.operation(); up.upload_contract = new protocol.upload_contract_operation(U2, new Uint8Array(16));
    at(NOW + 3000); tx(U2, 100 * M, [up]); expect(ok(s)).toBe(true, "the ticket's own upload is paid down to admin_min");
  });
});

describe("audit-2026-10 M-2 and M-4: settings and council shapes that would stop the station are refused", () => {
  it("max_ops above 32 (including values that wrap as i32) and max_days below 30 are refused", () => {
    const s = setup(); gS = s; signedBy([OWNER]);
    const a = cfg(); a.max_ops = 33; gC = a;
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); revertedWith("max_ops: 2 to 32");
    const b = cfg(); b.max_ops = 2_147_483_648; gC = b;
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); revertedWith("max_ops: 2 to 32");
    const d = cfg(); d.max_days = 29; gC = d;
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.set_config(new station.set_config_arguments(gC)); }).toThrow(); revertedWith("max_days: 30 to 3650");
    const ok32 = cfg(); ok32.max_ops = 32; s.set_config(new station.set_config_arguments(ok32)); signedBy([]);
  });
  it("a council change to 3 of 3, or to 2 members, is refused; a 2-of-3 council can still remove one member", () => {
    const s = setup(); gS = s;
    const a = act(4); a.council = [C1, C2, C3]; a.threshold = 3; gA = a;
    signedBy([C1]); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); revertedWith("threshold: at least 2 and below the council size");
    const b = act(4); b.council = [C1, C2]; b.threshold = 2; gA = b;
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); revertedWith("council: 3 to 7 members"); signedBy([]);
    const c = act(4); c.council = [C1, C2, cm(4)]; c.threshold = 2; councilDo(s, c);   // C3 removed by C1 + C2 alone
    expect(s.isCouncil(s.config.get()!, cm(4))).toBe(true); expect(s.isCouncil(s.config.get()!, C3)).toBe(false);
  });
});

describe("audit-2026-10 M-3: sanctions freeze by payer, and only the council unfreezes", () => {
  it("a sanctioned wallet's renewal of another's allowance is frozen: no refund to it on cancel, no release later, lifting changes nothing", () => {
    const s = setup(); gS = s; const T = NOW;
    const W = user(77); testSetToken(USDT, W, 10 * USD);
    const r = buyPass(s, U1, 10 * M, 7);                         // X = U1 owns a 7-day pass
    renewBy(s, W, r.id, 7);                                      // W pays a 7-day renewal after it (purchase 2)
    suspend(s, W, 2);
    expect(esc(s, 2).frozen).toBe(true); expect(esc(s, 1).frozen).toBe(false);
    const w0 = testGetToken(USDT, W);
    at(T + HOUR); signedBy([U1]); s.cancel_allowance(new station.cancel_allowance_arguments(U1, r.id)); signedBy([]);
    expect(testGetToken(USDT, W)).toBe(w0, "no refund reaches the sanctioned payer");
    expect(esc(s, 2).refunded).toBe(0);
    signedBy([OWNER]); s.unsuspend_allowance(new station.unsuspend_allowance_arguments(W, 0)); signedBy([]);
    at(T + 15 * DAYMS);
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.release(new station.release_arguments(2)); }).toThrow(); revertedWith("sanctions: funds frozen in escrow pending legal review");
    expect(s.release(new station.release_arguments(1)).amount > 0).toBe(true, "the innocent payer's term releases as usual");
    const k9 = act(9); k9.purchase_id = 2; k9.amount = esc(s, 2).amount; councilDo(s, k9);   // the council refunds it in full
    expect(testGetToken(USDT, W)).toBe(10 * USD, "refunded only by the council's decision");
    inv(s, USDT);
  });
  it("another wallet's renewal on a sanctioned wallet's allowance is refunded to that payer at once; reclassifying refunds nothing frozen", () => {
    const s = setup(); const T = NOW;
    const W = user(78), X = user(79); testSetToken(USDT, W, 10 * USD); testSetToken(USDT, X, 10 * USD);
    const r = buyPass(s, W, 10 * M, 7);                          // W's pass (purchase 1)
    renewBy(s, X, r.id, 7);                                      // X pays a renewal starting in 7 days (purchase 2)
    const x0 = testGetToken(USDT, X), w0 = testGetToken(USDT, W);
    at(T + HOUR); suspend(s, W, 2);
    expect(testGetToken(USDT, X) - x0).toBe(esc(s, 2).refunded); expect(esc(s, 2).refunded > 0).toBe(true, "X is refunded");
    expect(esc(s, 1).frozen).toBe(true); expect(testGetToken(USDT, W)).toBe(w0);
    suspend(s, W, 4);                                            // reclassified: still frozen
    expect(testGetToken(USDT, W)).toBe(w0); expect(esc(s, 1).refunded).toBe(0);
    inv(s, USDT);
  });
  it("kind 9 only for a frozen purchase, never above what it holds; the owner can't refund a frozen term", () => {
    const s = setup(); gS = s;
    const W = user(80); testSetToken(USDT, W, 10 * USD);
    buyPass(s, W, 10 * M, 7); buyPass(s, U1, 10 * M, 7);
    suspend(s, W, 2);
    const a = act(9); a.purchase_id = 2; gA = a;
    signedBy([C1]); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); revertedWith("kind 9: a purchase frozen by sanctions");
    const b = act(9); b.purchase_id = 1; b.amount = esc(s, 1).amount + 1; gA = b;
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.propose(new station.propose_arguments(C1, gA)); }).toThrow(); revertedWith("kind 9: amount above what the purchase holds"); signedBy([]);
    suspend(s, W, 4);
    signedBy([OWNER]); expect(s.owner_refund(new station.owner_refund_arguments(1, null)).refund).toBe(0); signedBy([]);
    expect(esc(s, 1).frozen).toBe(true);
  });
});

describe("audit-2026-10 M-5: payouts are owed and claimed, so a refusing token blocks nobody else", () => {
  it("with transfers to the treasury refused, purchases, renewals and cancels still work; only the treasury's claim fails", () => {
    const s = setup(); gS = s; testAutoClaim(false); testRefuseTransfersTo(OWNER); testSetToken(USDT, U2, 1000 * USD);
    const r = buyPass(s, U1, 10 * M, 1);
    at(NOW + DAYMS + 1000);
    expect(s.release(new station.release_arguments(1)).amount).toBe(r.paid);           // recorded as owed to the treasury
    expect(s.get_owed(new station.get_owed_arguments(USDT, OWNER)).amount).toBe(r.paid);
    const r2 = buyPass(s, U2, 10 * M, 7);                                                // a new purchase sweeps nothing inline
    signedBy([U2]); const c = s.cancel_allowance(new station.cancel_allowance_arguments(U2, r2.id)); signedBy([]);
    expect(c.refund > 0).toBe(true);
    expect(s.get_owed(new station.get_owed_arguments(USDT, U2)).amount).toBe(c.refund);
    const u2 = testGetToken(USDT, U2);
    expect(s.claim(new station.claim_arguments(USDT, U2)).amount).toBe(c.refund);       // anyone may trigger it; U2 gets it
    expect(testGetToken(USDT, U2) - u2).toBe(c.refund);
    expect(s.claim(new station.claim_arguments(USDT, U2)).amount).toBe(0);              // nothing twice
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.claim(new station.claim_arguments(USDT, OWNER)); }).toThrow(); revertedWith("escrow payout failed");
    const t = s.get_escrow_totals(new station.get_escrow_totals_arguments(USDT)).totals!;
    expect(testGetToken(USDT, STATION)).toBe(t.held + t.owed);
    testRefuseTransfersTo(new Uint8Array(0));
    expect(s.claim(new station.claim_arguments(USDT, OWNER)).amount > 0).toBe(true);    // once the token allows it again
    inv(s, USDT);
  });
  it("rescue never takes what is owed; a sanctioned wallet can't claim", () => {
    const s = setup(); gS = s; testAutoClaim(false);
    const r = buyPass(s, U1, 10 * M, 1);
    at(NOW + DAYMS + 1000); s.release(new station.release_arguments(1));               // r.paid owed to the treasury, 0 held
    testSetToken(USDT, STATION, testGetToken(USDT, STATION) + 1000);                    // sent by mistake
    const a = act(3); a.token = USDT; a.to = OTHER; a.amount = 1001;
    signedBy([C1]); gId = s.propose(new station.propose_arguments(C1, a)).id; signedBy([C2]); s.approve(new station.approve_arguments(C2, gId)); signedBy([]);
    at(NOW + 2 * DAYMS); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); revertedWith("only tokens above what escrow holds and owes can be rescued");
    const W = user(81); testSetToken(USDT, W, 10 * USD); const p = buyPass(s, W, 10 * M, 7);
    signedBy([W]); s.cancel_allowance(new station.cancel_allowance_arguments(W, p.id)); signedBy([]);   // owed to W
    suspend(s, W, 2);
    gW = W; MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.claim(new station.claim_arguments(USDT, gW)); }).toThrow(); revertedWith("sanctions: payouts to this wallet are frozen pending legal review");
    expect(r.paid > 0).toBe(true);
  });
});

describe("audit-2026-10 M-6: a free app's refusal falls back to the payee's pass; no plan for a free app", () => {
  it("strict free app, unlisted entry point: the pass pays; a plan for a connected free app can't be bought", () => {
    const s = setup(); gS = s;
    buyPass(s, U1, 10 * M, 7);
    tx(U1, 2 * M, [op(KNODE, 0x44444444)]);                         // Knode is strict: this entry point isn't listed
    const w = s.would_pay(new station.would_pay_arguments(U1, [new station.op_info(KNODE, 0x44444444, new Uint8Array(8))], 2 * M));
    expect(w.pay).toBe(true); expect(w.route).toBe("pass");
    expect(ok(s)).toBe(true);
    at(NOW + 3000); tx(user(9), 2 * M, [op(KNODE, 0x44444444)]); expect(ok(s)).toBe(false, "no pass: still refused");
    signedBy([BUYER, KNODE]); MockVM.commitTransaction(); clearRevert();
    expect(() => { gS!.buy_allowance(new station.buy_allowance_arguments(BUYER, 1, KNODE, 10 * M, 7, USDT, 1000 * USD)); }).toThrow();
    revertedWith("this contract is a free app: its users are already covered"); signedBy([]);
  });
  it("A1-07: a free app is never paid for a top-level token transfer", () => {
    const s = setup();
    signedBy([OWNER]); s.connect_app(new station.connect_app_arguments(SOLDAPP, 20 * M, false)); signedBy([]);
    expect(play(s, user(4), 2 * M, SOLDAPP)).toBe(true);
    at(NOW + 3000); tx(user(5), 2 * M, [op(SOLDAPP, 0x27f576ca)]); expect(ok(s)).toBe(false);
  });
});

describe("audit-2026-10 M-7: authorize writes no alert flag; get_status says when Mana is low", () => {
  it("each transaction that crosses the alert level emits reserve_low; nothing is latched", () => {
    const s = setup();
    buyPass(s, U1, 10 * M, 7);
    testSetMana(601 * M);                                          // alert level 600
    MockVM.clearEvents(); tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);
    let n = 0; const ev = MockVM.getEvents(); for (let i = 0; i < ev.length; i++) if (ev[i].name == "station.reserve_low") n++;
    expect(n).toBe(1);
    expect(s.big.get()!.low_alerted).toBe(false, "no state that could outlive a reverted transaction");
    testSetMana(599 * M); expect(s.get_status(new station.get_status_arguments()).reserve_low).toBe(true);
    testSetMana(601 * M); expect(s.get_status(new station.get_status_arguments()).reserve_low).toBe(false);
    MockVM.clearEvents(); at(NOW + 3000); tx(U1, 2 * M, [op(OTHER, EP_PLAY)]); expect(ok(s)).toBe(true);
    n = 0; const ev2 = MockVM.getEvents(); for (let i = 0; i < ev2.length; i++) if (ev2[i].name == "station.reserve_low") n++;
    expect(n).toBe(1, "the next crossing alerts again");
  });
});

describe("audit-2026-10 Lows and Infos in the contract", () => {
  it("E1 L-1: a ticket keeps the fee in force when it was bought", () => {
    const s = setup();
    signedBy([BUYER, U1]); s.buy_big_upload(new station.buy_big_upload_arguments(BUYER, U1, 100 * M, USDT, 1000 * USD, false)); signedBy([]);
    const f = act(7); f.fee_bp = 2000; councilDo(s, f);            // the council raises the fee to 20% afterwards
    const tk = s.get_ticket(new station.get_ticket_arguments(U1)).ticket!;
    expect(tk.fee_bp).toBe(500); expect(s.feeOf(s.config.get()!, tk)).toBe(500); expect(s.ticketFeeBp(s.config.get()!)).toBe(2000);
    const b0 = testGetToken(USDT, BUYER);
    signedBy([BUYER]); const r = s.cancel_big_upload(new station.cancel_big_upload_arguments(BUYER, U1)).refund; signedBy([]);
    expect(testGetToken(USDT, BUYER) - b0).toBe(r);
    expect(r).toBe(mulDiv(500_000, DAYMS, 3 * DAYMS), "2 of 3 days gone: a third back");
  });
  it("E1 L-2: the owner can't suspend (and so refund) the owner or a council member", () => {
    const s = setup(); gS = s; signedBy([OWNER]);
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(C1, 1)); }).toThrow(); revertedWith("the owner can't suspend the owner or a council member");
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.suspend_allowance(new station.suspend_allowance_arguments(OWNER, 4)); }).toThrow(); revertedWith("the owner can't suspend the owner or a council member");
    signedBy([]);
  });
  it("G-04: a member can withdraw their approval; an approval expires 30 days after it is ready", () => {
    const s = setup(); gS = s; const T = NOW;
    const a = act(5); a.delay_ms = 3 * DAYMS;
    const id = propose(s, C1, a); approve(s, C2, id);
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.ready_at > 0).toBe(true);
    signedBy([C2]); s.unapprove(new station.unapprove_arguments(C2, id)); signedBy([]);
    expect(s.get_proposal(new station.get_proposal_arguments(id)).proposal!.ready_at).toBe(0, "below the threshold again");
    gId = id; at(T + 3 * DAYMS); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); revertedWith("not enough approvals yet");
    approve(s, C3, id);
    at(NOW + 33 * DAYMS); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); revertedWith("approval expired: carry out within 30 days of being ready, or propose again");
    signedBy([C3]); MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.unapprove(new station.unapprove_arguments(C1, gId)); }).toThrow(); revertedWith("signer must sign"); signedBy([]);
  });
  it("G-05 and G-07: a council change keeps approval times for veto ordering and closes proposals of members who left", () => {
    const s = setup(); testSetMana(1000 * M);
    const w = act(6); w.to = U1;
    const pW = propose(s, C3, w);                                  // C3's own proposal, still waiting for a second approval
    const nc = act(4); nc.council = [C1, C2, cm(4)]; nc.threshold = 2; councilDo(s, nc);   // C3 leaves
    const p = s.get_proposal(new station.get_proposal_arguments(pW)).proposal!;
    expect(p.cancelled).toBe(true, "G-07: closed without a veto block");
    expect(s.vetoBlocked(w, NOW)).toBe(false);
  });
  it("Info: a raised delay also applies to proposals already waiting", () => {
    const s = setup(); gS = s; const T = NOW;
    const t = act(6); t.to = U1;
    const id = propose(s, C1, t); approve(s, C2, id); gId = id;     // approved at T: ready at T + 2 days
    const d = act(5); d.delay_ms = 5 * DAYMS; councilDo(s, d);      // the delay becomes 5 days at T + 2 days
    MockVM.commitTransaction(); clearRevert(); expect(() => { gS!.execute(new station.execute_arguments(gId)); }).toThrow(); revertedWith("waiting period not over");
    at(T + 5 * DAYMS); s.execute(new station.execute_arguments(id));
    expect(s.config.get()!.treasury).toStrictEqual(U1);
  });
  it("Info: votes are paid below the floor only for council members; the brake for any operator", () => {
    const s = setup(); testSetMana(5 * M + 1 * M - 1);             // just under admin_min + 1
    const vote = opA(STATION, 0x74e21680, new Uint8Array(4));
    signedBy([OWNER]); tx(OWNER, 1 * M, [vote]); expect(ok(s)).toBe(false, "the owner can't vote: not paid below the floor");
    at(NOW + 3000); signedBy([C1]); tx(C1, 1 * M, [vote]); expect(ok(s)).toBe(true, "a council vote is");
    at(NOW + 3000); signedBy([OWNER]); tx(OWNER, 1 * M, [opA(STATION, 0x35fbb717, new Uint8Array(2))]); expect(ok(s)).toBe(true, "the brake is");
    signedBy([]);
  });
  it("Info: init while paused stops the escrow clock at init (no ~56 years of pause credit)", () => {
    MockVM.reset(); System.setSystemBufferSize(256 * 1024);
    MockVM.setContractId(STATION); MockVM.setContractArguments(STATION); MockVM.setEntryPoint(0);
    MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
    MockVM.setHeadInfo(new chain.head_info(null, 0, 1)); at(T0); testSetMana(1000 * M); testSetBalance(1000 * M);
    const s = new Station(); const c = cfg(); c.paused = true;
    signedBy([STATION]); deployTx(); s.init(new station.init_arguments(c)); signedBy([]);
    expect(s.big.get()!.paused_at).toBe(T0);
  });
  it("Info: a missing 1-day price still charges cancels (the shortest term's price per day)", () => {
    const s = setup();
    const p = PRICE(); p.price_1d = 0; signedBy([OWNER]); s.set_price(new station.set_price_arguments(USDT, p)); signedBy([]);
    const r = buyPass(s, U1, 10 * M, 7);
    expect(s.get_escrow(new station.get_escrow_arguments(1)).purchase!.day_price > 0).toBe(true, "the 7-day price per day is charged");
    expect(r.paid > 0).toBe(true);
  });
  it("Info: mulDiv refuses division by zero and results above 2^64 instead of returning garbage", () => {
    expect(mulDiv(10, 20, 4)).toBe(50);
    expect(mulDiv(u64.MAX_VALUE, 3, 4)).toBe(13_835_058_055_282_163_711);
    expect(() => { mulDiv(1, 1, 0); }).toThrow("division by zero");
    expect(() => { mulDiv(u64.MAX_VALUE, 2, 1); }).toThrow("above 2^64");
  });
});
