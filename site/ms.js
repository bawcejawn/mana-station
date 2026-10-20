// Shared by every page: network settings, the one wallet you're using (shown top right), sending, and plain-language
// errors. Needs koilib (window.Provider, Contract, Transaction, Signer), abis.js, playground.js and wallets.js first.
window.MS = (() => {
  const PG = window.MS_PLAYGROUND || {}, ABI = window.MS_ABI || {};
  const M = 100000000n;
  const ST = PG.station, TOK = PG.testStablecoin;
  const provider = window.Provider ? new Provider([PG.rpc || "https://testnet.koinosfoundation.org"]) : null;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const $ = (id) => document.getElementById(id);

  // ---------- formatting ----------
  const mana = (v, d = 2) => (Number(BigInt(v || 0)) / 1e8).toLocaleString(undefined, { maximumFractionDigits: d });
  const usd = (v) => { const n = Number(BigInt(v || 0)) / 1e8; return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n && n < 0.01 ? 6 : 2 }) + " tUSDT"; };
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const when = (ms) => (ms && ms !== "0" ? new Date(Number(ms)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  const units = (v) => BigInt(Math.round(Number(v) * 1e8));
  const ACTION = 0.16;                                    // Mana for one simple action (measured on the testnet: 0.15–0.17)
  const actions = (manaPerDay) => Math.max(1, Math.floor(Number(manaPerDay) / ACTION)).toLocaleString();

  // ---------- contracts ----------
  const station = (signer) => new Contract({ id: ST, abi: ABI.station, provider, signer });
  const token = (signer) => new Contract({ id: TOK, abi: ABI.token, provider, signer });
  const appC = (id, signer) => new Contract({ id, abi: ABI.app, provider, signer });
  const read = async (fn, a = {}) => (await station().functions[fn](a)).result || {};

  // ---------- the wallet you're using ----------
  // A test wallet kept in this browser (testnet) or a Kondor account. Apps and players have their own keys and are
  // not listed here (names starting "App" or "Player").
  let kondorAddr = store.get("ms.kondor") || null;
  const listeners = [];
  const people = () => MSWallets.list().filter((w) => !/^(App|Player)/.test(w.name));
  function active() {
    const v = store.get("ms.active") || "";
    if (v.startsWith("kondor:") && kondorAddr) return { kind: "kondor", address: kondorAddr, name: "Kondor" };
    const w = people().find((x) => "test:" + x.address === v) || null;
    return w ? { kind: "test", address: w.address, name: w.name } : null;
  }
  function use(value) { store.set("ms.active", value); renderChip(); listeners.forEach((f) => f(active())); }
  const onWallet = (f) => listeners.push(f);
  const signerFor = (addr) => {
    const a = active();
    if (a && a.address === addr && a.kind === "kondor") return kondor.getSigner(addr);
    return MSWallets.signer(addr, provider);
  };
  async function connectKondor() {
    if (!window.kondor) throw new Error("Kondor isn't installed in this browser. Use a test wallet instead.");
    const a = (await kondor.getAccounts())[0]?.address; if (!a) throw new Error("Kondor didn't share an account.");
    kondorAddr = a; store.set("ms.kondor", a); use("kondor:" + a);
  }
  function newWallet(name) { const w = MSWallets.create(name || "Wallet " + (people().length + 1)); use("test:" + w.address); return w; }

  // The chip in the header: who you are, and a small menu to switch.
  let chipEl = null;
  document.addEventListener("click", (e) => { if (chipEl && !chipEl.contains(e.target)) chipEl.open = false; });
  function renderChip() {
    const box = $("walletChip"); if (!box) return;
    const a = active();
    box.replaceChildren();
    const d = document.createElement("details"); d.className = "chip";
    const s = document.createElement("summary");
    s.innerHTML = a ? '<span class="dot"></span><b></b><span class="addr"></span>' : "<b>Choose a wallet</b>";
    if (a) { s.querySelector("b").textContent = a.name; s.querySelector(".addr").textContent = short(a.address); }
    d.append(s);
    const menu = document.createElement("div"); menu.className = "chip-menu";
    const head = document.createElement("p"); head.className = "small"; head.textContent = "Test wallets live in this browser and hold nothing of value.";
    menu.append(head);
    for (const w of people()) {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip-item" + (a && a.address === w.address ? " on" : "");
      b.innerHTML = "<b></b><span></span>"; b.firstChild.textContent = w.name; b.lastChild.textContent = short(w.address);
      b.addEventListener("click", () => { d.open = false; use("test:" + w.address); }); menu.append(b);
    }
    if (kondorAddr) { const b = document.createElement("button"); b.type = "button"; b.className = "chip-item" + (a?.kind === "kondor" ? " on" : ""); b.innerHTML = "<b>Kondor</b><span></span>"; b.lastChild.textContent = short(kondorAddr); b.addEventListener("click", () => { d.open = false; use("kondor:" + kondorAddr); }); menu.append(b); }
    const row = document.createElement("div"); row.className = "chip-actions";
    const mk = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-quiet btn-small"; b.textContent = label; b.addEventListener("click", fn); row.append(b); };
    mk("New test wallet", () => { d.open = false; newWallet(); });
    mk("Use Kondor", async () => { d.open = false; try { await connectKondor(); } catch (e) { alert(e.message); } });
    if (a) mk("Copy address", async () => { try { await navigator.clipboard.writeText(a.address); } catch {} d.open = false; });
    menu.append(row); d.append(menu); box.append(d); chipEl = d;
  }

  // ---------- sending ----------
  // ops: [[contract, fn, args], …]. The station pays when its rules allow (free checkout, your pass, free apps);
  // if it says no and this wallet has Mana of its own, the wallet pays instead. `cosign` = another key in this browser
  // that must also sign (an app approving a purchase for itself).
  async function send(ops, { from, cosign, rc = M / 2n, stationPays = true, fallback = true } = {}) {
    from = from || active()?.address; if (!from) throw new Error("Choose a wallet first (top right).");
    const isKondor = active()?.kind === "kondor" && active().address === from;
    const tries = !stationPays ? [{ payer: from }] : fallback ? [{ payer: ST, payee: from }, { payer: from }] : [{ payer: ST, payee: from }];
    let last;
    for (const t of tries) {
      try { return await sendOnce(ops, from, isKondor, cosign, { rcLimit: String(rc), ...t }); }
      catch (e) {
        last = e;
        if (/not mined/i.test(String(e?.message || e))) throw e;      // sent: never send it a second time
        const refused = /has not authorized|insufficient|"code":104/i.test(String(e?.message || e));
        if (!refused) break;
        if (t.payer === ST && BigInt(await provider.getAccountRc(from).catch(() => "0")) < rc) break; // no own Mana to fall back on
      }
    }
    throw last;
  }
  async function sendOnce(ops, from, isKondor, cosign, options) {
    if (!isKondor) {
      const o = { ...options }; if (cosign) o.beforeSend = async (tx) => { await MSWallets.signer(cosign, provider).signTransaction(tx); };
      const tx = new Transaction({ signer: MSWallets.signer(from, provider), provider, options: o });
      for (const [c, fn, a] of ops) await tx.pushOperation(c.functions[fn], a);
      const r = await tx.send(); await tx.wait("byBlock", 180000); return r;
    }
    const ks = kondor.getSigner(from);
    const tx = new Transaction({ signer: ks, provider, options });
    for (const [c, fn, a] of ops) await tx.pushOperation(c.functions[fn], a);
    await tx.prepare();
    if (cosign) await MSWallets.signer(cosign, provider).signTransaction(tx.transaction);
    const signed = await ks.signTransaction(tx.transaction);
    const { receipt, transaction } = await provider.sendTransaction(signed);
    await transaction.wait("byBlock", 180000); return receipt;
  }

  // ---------- words ----------
  function friendly(e) {
    const m = String(e?.message || e || "");
    const why = (m.match(/transaction reverted: ([^"\]]+)/) || [])[1] || (m.match(/"message":"([^"]+)"/) || [])[1];
    if (/user rejected|denied|cancel/i.test(m) && !why) return "You cancelled it in your wallet. Nothing was sent.";
    if (/not mined/i.test(m)) return "Sent, but the network is slow to put it in a block. It usually lands within a few minutes and will then show under Your Mana. Don't send it again.";
    if (/insufficient balance/i.test(m)) return "This wallet doesn't have enough tUSDT for that.";
    if (/insufficient pending account resources|"code":104|insufficient rc/i.test(m)) return "The station didn't cover this one and this wallet has no Mana of its own. Wait a minute and try again.";
    if (/has not authorized/i.test(m)) return "The station didn't cover this one. You may have hit a limit for now; try again in a minute.";
    if (why) return why.charAt(0).toUpperCase() + why.slice(1) + ".";
    return m.slice(0, 200) || "Something went wrong.";
  }
  function say(el, text, kind = "") { if (typeof el === "string") el = $(el); if (!el) return; el.hidden = !text; el.className = "msg " + kind; el.textContent = text || ""; }
  // Run a button's action once, with a busy label and a plain result message.
  async function run(btn, msgEl, fn) {
    if (btn.disabled) return; const label = btn.textContent; btn.disabled = true; btn.textContent = "Working…"; say(msgEl, "Sending to the Koinos testnet. This takes a few seconds…");
    try { const done = await fn(); say(msgEl, done || "Done.", "ok"); return true; }
    catch (e) { say(msgEl, friendly(e), "err"); return false; }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  function roleOf(addr, cfg) {
    if (!addr || !cfg) return "visitor";
    if (cfg.owner === addr) return "owner";
    if ((cfg.council || []).includes(addr)) return "council";
    return "visitor";
  }

  document.addEventListener("DOMContentLoaded", renderChip);
  if (document.readyState !== "loading") setTimeout(renderChip);
  return { PG, ABI, M, ST, TOK, provider, store, $, mana, usd, short, when, units, actions, station, token, appC, read,
    active, use, onWallet, newWallet, connectKondor, signerFor, send, friendly, say, run, roleOf, renderChip };
})();
