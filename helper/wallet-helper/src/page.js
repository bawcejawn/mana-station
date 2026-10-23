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
 * Audit Bot AB-026 (2026-10-22): questions and answers no longer go through window.postMessage, where the page's own
 * scripts saw them (and the secret). They are DOM events on the document whose type includes the per-load secret, sent
 * with built-ins saved before any site script runs; a site can't listen for an event type it doesn't know.
 * Audit Bot AB-038 (2026-10-22): nothing the page can change runs while the helper handles its own data. No Promises (a
 * Promise resolved with an object looks up `then`, and a site getter there ran during the answer event and read the
 * secret from window.event); the request is copied into objects and arrays with no prototype; answers are read from own
 * data properties only and handed on as plain values in a later task; no RegExp or string / number methods are called.
 * audit-2026-10 W1-01: the secret no longer passes through a DOM attribute (a page could pre-set it in its HTML and so
 * learn it). bridge.js hands it over with a synchronous event handshake that is over before any site script runs.
 * W1-09: a payer, payee or limit in either send-options object leaves the request alone. W1-10: the on/off switch
 * reaches this script on every site, over the private channel.
 */
(function () {
  "use strict";
  const CFG = __CONFIG__;
  // Built-ins saved now, before any site script can replace them.
  const W = window, nativePost = W.postMessage, call = Function.prototype.call.bind(Function.prototype.call), rApply = Reflect.apply, Px = Proxy, rGet = Reflect.get;
  const parse = JSON.parse, stringify = JSON.stringify, now = Date.now.bind(Date), rand = Math.random.bind(Math), floor = Math.floor;
  const setT = W.setTimeout.bind(W), clearT = W.clearTimeout.bind(W), addListener = W.addEventListener.bind(W);
  const isArr = Array.isArray, keys = Object.keys, create = Object.create, setProto = Object.setPrototypeOf, hasOwn = Object.prototype.hasOwnProperty;
  const Str = String, Big = BigInt;
  // AB-038: own data property `k` of a parsed object, never an inherited (possibly site-defined) one.
  const own = (o, k) => (call(hasOwn, o, k) ? o[k] : undefined);
  // AB-038: a deep copy of parsed JSON in objects and arrays with no prototype (nothing to inherit, nothing to look up).
  function bare(x, depth) {
    if (depth > 32) throw new Error("too deep");
    if (x === null || typeof x !== "object") return x;
    if (isArr(x)) { const a = setProto([], null); for (let i = 0; i < x.length; i++) a[i] = bare(x[i], depth + 1); return a; }
    const o = create(null), ks = keys(x);
    for (let i = 0; i < ks.length; i++) o[ks[i]] = bare(x[ks[i]], depth + 1);
    return o;
  }
  const origin = W.location.origin, target = origin === "null" ? "*" : origin;
  const post = (msg) => call(nativePost, W, msg, target);
  const doc = W.document, CE = W.CustomEvent, ET = W.EventTarget;
  const dispatch = ET && ET.prototype.dispatchEvent, listenOn = ET && ET.prototype.addEventListener, listenOff = ET && ET.prototype.removeEventListener;
  const detailD = CE && Object.getOwnPropertyDescriptor(CE.prototype, "detail"), detailOf = detailD && detailD.get;
  const standAside = Object.create(null), ours = Object.create(null), asks = Object.create(null);
  let enabled = true;
  const isTarget = (to) => { for (let i = 0; i < CFG.targets.length; i++) if (CFG.targets[i] === to) return true; return false; };
  const isWalletRequest = (d) => !!(d && typeof d === "object" && isTarget(d.to) &&
    (d.command === "signer:sendTransaction" || d.command === "signer:signTransaction"));
  // audit-2026-10 W1-01: the per-load secret (AB-014; AB-026: it names the private events) comes from bridge.js, which
  // creates it. Both scripts run at document_start, before any site script, in either order: this one listens for
  // "ms-hello-b" and announces itself with "ms-hello-p"; bridge.js answers "ms-hello-p" once and also announces the secret
  // once when it starts. The first secret received is kept, the listener removed, and one more "ms-hello-p" uses up
  // bridge.js's single answer, so no listener is left for a site script to talk to. The secret is never sent anywhere.
  let token = "";
  const HP = "ms-hello-p", HB = "ms-hello-b";
  const ready = !!(doc && typeof CE === "function" && typeof dispatch === "function" && typeof listenOn === "function" && typeof listenOff === "function" && typeof detailOf === "function");
  // AB-026: the private channel. Without a DOM, events or a secret, nothing is asked (requests go to the wallet unchanged).
  const ASK = () => "ms-ask-" + token, ANSWER = () => "ms-answer-" + token;
  const channelOk = () => !!(ready && token);
  if (ready) {
    try {
      const onB = (ev) => {
        if (token) return;
        let x; try { x = call(detailOf, ev); } catch (e) { return; }
        if (typeof x !== "string" || x.length !== 32) return;
        token = x; call(listenOff, doc, HB, onB); call(dispatch, doc, new CE(HP)); listenState();
      };
      call(listenOn, doc, HB, onB);
      call(dispatch, doc, new CE(HP));
    } catch (e) { token = ""; }
  }
  // W1-10: bridge.js tells this script whether the helper is switched on, on its private event (any site).
  function listenState() {
    call(listenOn, doc, "ms-state-" + token, (ev) => { let x; try { x = call(detailOf, ev); } catch (e) { return; } enabled = x !== "off"; });
    call(listenOn, doc, ANSWER(), onAnswer);
  }
  // Our own site may ask "is the helper on?" (for its check page). Other sites learn nothing.
  if (CFG.siteOrigins.indexOf(origin) >= 0 || (CFG.network !== "mainnet" && W.location.protocol === "file:")) {
    try { Object.defineProperty(W, "__manaStationHelper", { value: true }); } catch (e) { /* already defined */ }
  }

  // One private copy (AB-038: with no prototypes); returns null when the helper must leave the request alone.
  function candidate(d) {
    let c; try { c = bare(parse(stringify(d)), 0); } catch (e) { return null; }
    const a = c && c.args, tx = a && a.transaction, h = tx && tx.header, me = a && a.signerAddress;
    if (!enabled || !h || typeof me !== "string" || h.chain_id !== CFG.chainId) return null;
    if (h.payer && h.payer !== me) return null;                         // someone else already pays
    if (h.payee && h.payee !== me) return null;
    if (tx.signatures && tx.signatures.length) return null;             // already signed: can't be changed
    const os = [a.optsSend, a.options];                                 // W1-09: both, even when one is an empty object
    for (let i = 0; i < 2; i++) { const o = os[i]; if (o && typeof o === "object" && (o.payer || o.payee || o.rcLimit)) return null; } // the site chose a payer / limit itself
    const ops = tx.operations;
    if (!isArr(ops) || ops.length < 1 || ops.length > 10) return null;
    for (let i = 0; i < ops.length; i++) if (!ops[i] || !ops[i].call_contract) return null;   // calls only (uploads use tickets on the site)
    if ((standAside[me] || 0) > now()) return null;
    if (!channelOk()) return null;                                      // no private channel to the extension
    return c;
  }
  // The limit to ask about: the site's own whenever the station could accept it (up to the station's per-transaction
  // maximum), so bigger transactions keep the room they need. The default (0.5 Mana) is used only when the site gave
  // none, 0 (a wallet with no Mana) or more than the station's maximum (usually a whole wallet balance). Kondor's
  // "optimize mana" then sets the final limit to about 1.1x what the transaction really uses, up or down.
  function rcFor(h) {
    const v = typeof h.rc_limit === "string" || typeof h.rc_limit === "number" ? Str(h.rc_limit) : "";
    let digits = v.length >= 1 && v.length <= 20;                       // AB-038: no RegExp (its methods are the page's)
    for (let i = 0; digits && i < v.length; i++) digits = v[i] >= "0" && v[i] <= "9";
    if (digits) { const n = Big(v); if (n >= Big(CFG.minRc) && n <= Big(CFG.maxRc)) return v; }
    return CFG.defaultRc;
  }
  let seq = 0;
  // AB-038: `done(pay, rcLimit)` gets plain values, in a task of its own (never during the answer event).
  function ask(payee, operations, rcLimit, done) {
    seq += 1;
    const id = "ms-" + seq + "-" + floor(rand() * 1e9) + "-" + now();
    let over = false;
    const finish = (pay, rc) => { if (over) return; over = true; delete asks[id]; setT(() => done(pay, rc), 0); };
    const t = setT(() => finish(false, undefined), 3000);
    asks[id] = (pay, rc) => { clearT(t); finish(pay, rc); };
    const q = create(null); q.id = id; q.payee = payee; q.operations = operations; q.rcLimit = rcLimit;
    const init = create(null); init.detail = stringify(q);
    try { call(dispatch, doc, new CE(ASK(), init)); } catch (e) { clearT(t); finish(false, undefined); }
  }
  function rewrite(c, done) {
    const tx = c.args.transaction, h = tx.header, me = c.args.signerAddress, asked = rcFor(h);
    ask(me, tx.operations, asked, (pay, rc) => {
      if (pay !== true || rc !== asked) return done(null);              // AB-022: exactly the limit asked about
      h.payer = CFG.station; h.payee = me; h.rc_limit = rc;
      delete tx.id;                                                     // the wallet recomputes it
      ours[c.id] = me;
      done(c);
    });
  }
  function wrapper(data) {
    const args = arguments;
    if ((this !== W && this !== undefined && this !== null) || !isWalletRequest(data)) return rApply(nativePost, this, args);
    const c = candidate(data);
    if (!c) return rApply(nativePost, W, args);                        // unchanged, synchronously
    const n = args.length;                                              // array literals only (AB-038: no concat / setters)
    const send = (msg) => { try { rApply(nativePost, W, n >= 3 ? [msg, args[1], args[2]] : n === 2 ? [msg, args[1]] : [msg]); } catch (e) { post({ id: data.id, error: Str(e && e.message || e) }); } };
    try { rewrite(c, (r) => send(r || data)); } catch (e) { send(data); }
  }
  // AB-014: installed as a Proxy of the native function, so it reads as native code with the native name and length.
  W.postMessage = new Px(nativePost, { apply: (t, self, args) => rApply(wrapper, self, args), get: (t, k) => (k === "name" ? "postMessage" : rGet(t, k)) });
  // AB-026: answers arrive only on the private channel (an answer posted to the window is ignored). AB-038: during this
  // event only saved built-ins run, the answer's own data properties are read, and plain values are passed on.
  function onAnswer(ev) {
    let d; try { const x = call(detailOf, ev); d = typeof x === "string" ? parse(x) : null; } catch (e) { return; }
    if (d === null || typeof d !== "object" || isArr(d)) return;
    const id = own(d, "id"); if (typeof id !== "string") return;
    const f = asks[id]; if (!f) return;
    const pay = own(d, "pay"), rc = own(d, "rcLimit");
    f(pay === true, typeof rc === "string" ? rc : undefined);
  }
  addListener("message", (ev) => {
    if (ev.source !== W) return;
    const d = ev.data; if (!d || typeof d !== "object") return;
    if (d.command || typeof d.id !== "string" || !ours[d.id]) return;  // a wallet's reply to a request we changed
    const me = ours[d.id]; delete ours[d.id];
    if (d.error) standAside[me] = now() + 120000;
  });
})();
