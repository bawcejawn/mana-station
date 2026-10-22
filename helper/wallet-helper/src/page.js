/* Mana Station helper, page part (runs in the page, before the site's scripts).
 *
 * When a site asks Kondor to sign a transaction the user would pay for themselves, this asks the extension "would the
 * Mana Station pay for this?" If yes, it sets the station as payer (and the user as payee) before Kondor opens. Kondor
 * then shows the transaction as usual and the user approves it.
 *
 * It holds no keys and signs nothing. It never changes what a transaction does, only who pays its Mana. It leaves
 * alone any request that already has another payer or payee (in the transaction or in its send options), other
 * signatures, uploads, or another network. If the station refuses a transaction it changed, it stands aside for that
 * wallet for two minutes. If the extension doesn't answer within 3 seconds, the request goes to Kondor unchanged.
 * Audit 2026-10-21: every check is made on one private copy of the request, with built-ins saved before any site code
 * runs; requests it won't change are passed on at once, unchanged and synchronously.
 * Audit Bot 2026-10-22: AB-014 questions carry a per-load secret shared with bridge.js, so other scripts can't probe for
 * the helper, and the postMessage wrapper looks like the native function; AB-022 an answer must keep the exact Mana limit
 * that was asked about (a forged answer can't raise it).
 */
(function () {
  "use strict";
  const CFG = __CONFIG__;
  // Built-ins saved now, before any site script can replace them.
  const W = window, nativePost = W.postMessage, call = Function.prototype.call.bind(Function.prototype.call), rApply = Reflect.apply, Px = Proxy, rGet = Reflect.get;
  const parse = JSON.parse, stringify = JSON.stringify, now = Date.now.bind(Date), rand = Math.random.bind(Math);
  const setT = W.setTimeout.bind(W), clearT = W.clearTimeout.bind(W), addListener = W.addEventListener.bind(W);
  const origin = W.location.origin, target = origin === "null" ? "*" : origin;
  const post = (msg) => call(nativePost, W, msg, target);
  const standAside = Object.create(null), ours = Object.create(null), asks = Object.create(null);
  let enabled = true;
  const isTarget = (to) => { for (let i = 0; i < CFG.targets.length; i++) if (CFG.targets[i] === to) return true; return false; };
  const isWalletRequest = (d) => !!(d && typeof d === "object" && isTarget(d.to) &&
    (d.command === "signer:sendTransaction" || d.command === "signer:signTransaction"));
  // AB-014: the per-load secret shared with bridge.js through a DOM attribute before any site script runs (whichever of
  // the two runs first creates it, the other takes it and removes the attribute). Questions carry it; bridge.js answers
  // nothing else.
  let token = "";
  try {
    const el = document.documentElement, A = "data-ms-helper";
    const mine = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); };
    token = el.getAttribute(A) || "";
    if (token) el.removeAttribute(A); else { token = mine(); el.setAttribute(A, token); }
  } catch (e) { token = ""; }
  // Our own site may ask "is the helper on?" (for its check page). Other sites learn nothing.
  if (CFG.siteOrigins.indexOf(origin) >= 0 || (CFG.network !== "mainnet" && W.location.protocol === "file:")) {
    try { Object.defineProperty(W, "__manaStationHelper", { value: true }); } catch (e) { /* already defined */ }
  }

  // One private copy; returns null when the helper must leave the request alone.
  function candidate(d) {
    let c; try { c = parse(stringify(d)); } catch (e) { return null; }
    const a = c && c.args, tx = a && a.transaction, h = tx && tx.header, me = a && a.signerAddress;
    if (!enabled || !h || typeof me !== "string" || h.chain_id !== CFG.chainId) return null;
    if (h.payer && h.payer !== me) return null;                         // someone else already pays
    if (h.payee && h.payee !== me) return null;
    if (tx.signatures && tx.signatures.length) return null;             // already signed: can't be changed
    const o = a.optsSend || a.options;
    if (o && (o.payer || o.payee || o.rcLimit)) return null;           // the site chose a payer / limit itself
    const ops = tx.operations;
    if (!Array.isArray(ops) || ops.length < 1 || ops.length > 10) return null;
    for (let i = 0; i < ops.length; i++) if (!ops[i] || !ops[i].call_contract) return null;   // calls only (uploads use tickets on the site)
    if ((standAside[me] || 0) > now()) return null;
    return c;
  }
  // The limit to ask about: the site's own whenever the station could accept it (up to the station's per-transaction
  // maximum), so bigger transactions keep the room they need. The default (0.5 Mana) is used only when the site gave
  // none, 0 (a wallet with no Mana) or more than the station's maximum (usually a whole wallet balance). Kondor's
  // "optimize mana" then sets the final limit to about 1.1x what the transaction really uses, up or down.
  function rcFor(h) {
    const v = typeof h.rc_limit === "string" || typeof h.rc_limit === "number" ? String(h.rc_limit) : "";
    if (/^[0-9]{1,20}$/.test(v)) { const n = BigInt(v); if (n >= BigInt(CFG.minRc) && n <= BigInt(CFG.maxRc)) return v; }
    return CFG.defaultRc;
  }
  function ask(payee, operations, rcLimit) {
    return new Promise((resolve) => {
      const id = "ms-" + rand().toString(36).slice(2) + now().toString(36);
      const t = setT(() => { delete asks[id]; resolve(null); }, 3000);
      asks[id] = (a) => { clearT(t); resolve(a); };
      post({ __manaStation: "ask", id, payee, operations, rcLimit, token });
    });
  }
  async function rewrite(c) {
    const tx = c.args.transaction, h = tx.header, me = c.args.signerAddress, asked = rcFor(h);
    const a = await ask(me, tx.operations, asked);
    if (!a || a.pay !== true || a.rcLimit !== asked) return null;       // AB-022: exactly the limit asked about
    h.payer = CFG.station; h.payee = me; h.rc_limit = a.rcLimit;
    delete tx.id;                                                       // the wallet recomputes it
    ours[c.id] = me;
    return c;
  }
  function wrapper(data) {
    const args = arguments;
    if ((this !== W && this !== undefined && this !== null) || !isWalletRequest(data)) return rApply(nativePost, this, args);
    const c = candidate(data);
    if (!c) return rApply(nativePost, W, args);                        // unchanged, synchronously
    const rest = []; for (let i = 1; i < args.length; i++) rest[rest.length] = args[i];
    const send = (msg) => { try { rApply(nativePost, W, [msg].concat(rest)); } catch (e) { post({ id: data.id, error: String(e && e.message || e) }); } };
    rewrite(c).then((r) => send(r || data), () => send(data));
  }
  // AB-014: installed as a Proxy of the native function, so it reads as native code with the native name and length.
  W.postMessage = new Px(nativePost, { apply: (t, self, args) => rApply(wrapper, self, args), get: (t, k) => (k === "name" ? "postMessage" : rGet(t, k)) });
  addListener("message", (ev) => {
    if (ev.source !== W) return;
    const d = ev.data; if (!d || typeof d !== "object") return;
    if (d.__manaStation === "answer" && typeof d.id === "string" && asks[d.id]) { const f = asks[d.id]; delete asks[d.id]; f(d); return; }
    if (d.__manaStation === "state") { enabled = d.enabled !== false; return; }
    if (d.command || typeof d.id !== "string" || !ours[d.id]) return;  // a wallet's reply to a request we changed
    const me = ours[d.id]; delete ours[d.id];
    if (d.error) standAside[me] = now() + 120000;
  });
})();
