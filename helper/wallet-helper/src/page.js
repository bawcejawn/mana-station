/* Mana Station helper, page part (runs in the page, before the site's scripts).
 *
 * When a site asks Kondor to sign a transaction the user would pay for themselves, this asks the extension "would the
 * Mana Station pay for this?" If yes, it sets the station as payer (and the user as payee) before Kondor opens. Kondor
 * then shows the transaction as usual and the user approves it.
 *
 * It holds no keys and signs nothing. It never changes what a transaction does, only who pays its Mana. It leaves
 * alone any transaction that already has another payer or payee, other signatures, or is for another network.
 * If the station refuses a transaction it changed, it stands aside for that wallet for two minutes.
 * If the extension doesn't answer within 3 seconds, the request goes to Kondor unchanged.
 */
(function () {
  "use strict";
  const CFG = __CONFIG__;
  if (window.__manaStationHelper) return;
  Object.defineProperty(window, "__manaStationHelper", { value: Object.freeze({ version: CFG.version, network: CFG.network, station: CFG.station }) });
  const post = window.postMessage.bind(window);
  const TARGETS = CFG.targets;                       // "popup" = Kondor (+ "ms-standin" on the testnet playground)
  const standAside = new Map(), ours = new Map(), asks = new Map();

  const isSignRequest = (d) => !!(d && typeof d === "object" && TARGETS.includes(d.to) &&
    (d.command === "signer:sendTransaction" || d.command === "signer:signTransaction") &&
    d.args && d.args.transaction && d.args.transaction.header && typeof d.args.signerAddress === "string");

  function ask(payee, operations, rcLimit) {        // → { pay, rcLimit } from the extension, or null
    return new Promise((resolve) => {
      const id = "ms-" + Math.random().toString(36).slice(2) + Date.now();
      const t = setTimeout(() => { asks.delete(id); resolve(null); }, 3000);
      asks.set(id, (a) => { clearTimeout(t); resolve(a); });
      post({ __manaStation: "ask", id, payee, operations, rcLimit }, window.location.origin === "null" ? "*" : window.location.origin);
    });
  }
  async function maybeRewrite(d) {
    const tx = d.args.transaction, h = tx.header, me = d.args.signerAddress;
    if (h.chain_id !== CFG.chainId) return d;
    if (h.payer && h.payer !== me) return d;
    if (h.payee && h.payee !== me) return d;
    if (tx.signatures && tx.signatures.length) return d;
    if ((standAside.get(me) || 0) > Date.now()) return d;
    const a = await ask(me, tx.operations || [], String(h.rc_limit || CFG.maxRc));
    if (!a || a.pay !== true) return d;
    const c = JSON.parse(JSON.stringify(d));
    c.args.transaction.header.payer = CFG.station;
    c.args.transaction.header.payee = me;
    c.args.transaction.header.rc_limit = a.rcLimit;
    delete c.args.transaction.id;
    ours.set(c.id, me);
    post({ __manaStation: "covered" }, window.location.origin === "null" ? "*" : window.location.origin);
    return c;
  }
  window.postMessage = function (data, ...rest) {
    if (!isSignRequest(data)) return post(data, ...rest);
    maybeRewrite(data).then((d) => post(d, ...rest), () => post(data, ...rest));
  };
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data; if (!d || typeof d !== "object") return;
    if (d.__manaStation === "answer" && asks.has(d.id)) { const f = asks.get(d.id); asks.delete(d.id); f(d); return; }
    if (d.command || !ours.has(d.id)) return;      // a wallet's reply to a request we changed
    const me = ours.get(d.id); ours.delete(d.id);
    if (d.error) standAside.set(me, Date.now() + 120000);
  });
})();
