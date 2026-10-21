/* Mana Station wallet helper. Runs in the page, before the site's own scripts.
 *
 * What it does: when a site asks Kondor to sign a transaction that the user would pay for themselves, it first asks the
 * Mana Station "would you pay for this?" (a read-only question). If the answer is yes, it sets the station as payer
 * (and the user as payee) before Kondor opens. Kondor then shows the transaction as usual and the user approves it.
 *
 * What it never does: it holds no keys and signs nothing. It never changes what a transaction does (operations,
 * amounts, contracts), only who pays its Mana. It leaves alone any transaction that already has another payer
 * (Kondor's free mana, an app's own sponsor) or other signatures. If the station later refuses, it stands aside
 * for two minutes so the user's next try uses their own Mana.
 */
(function () {
  "use strict";
  const CFG = __MANA_STATION_CONFIG__;
  if (window.__manaStationHelper) return;
  window.__manaStationHelper = { version: CFG.version, network: CFG.network, station: CFG.station };
  const MSC = window.ManaStation;
  const post = window.postMessage.bind(window);
  const standAside = new Map();        // wallet → time until which the helper changes nothing (after a refusal)
  const ours = new Map();              // request id → wallet, for requests the helper changed

  // "popup" is Kondor; "ms-standin" is the stand-in wallet on the Mana Station playground page (Kondor ignores it).
  const isSignRequest = (d) => !!(d && typeof d === "object" && (d.to === "popup" || d.to === "ms-standin") &&
    (d.command === "signer:sendTransaction" || d.command === "signer:signTransaction") &&
    d.args && d.args.transaction && d.args.transaction.header && typeof d.args.signerAddress === "string");

  async function maybeRewrite(d) {
    const tx = d.args.transaction, h = tx.header, me = d.args.signerAddress;
    if (h.chain_id !== CFG.chainId) return d;                         // another network
    if (h.payer && h.payer !== me) return d;                          // someone else already pays
    if (h.payee && h.payee !== me) return d;
    if (tx.signatures && tx.signatures.length) return d;              // already signed by others: can't touch it
    if ((standAside.get(me) || 0) > Date.now()) return d;
    const pick = await MSC.choosePayer({ rpc: CFG.rpc, station: CFG.station, payee: me, operations: tx.operations || [],
      rcLimit: h.rc_limit || CFG.maxRc, maxRc: CFG.maxRc });
    if (pick.payer !== CFG.station) return d;
    const c = JSON.parse(JSON.stringify(d));
    c.args.transaction.header.payer = CFG.station;
    c.args.transaction.header.payee = me;
    c.args.transaction.header.rc_limit = pick.rcLimit;
    delete c.args.transaction.id;                                      // the wallet recomputes it
    ours.set(c.id, me);
    return c;
  }

  window.postMessage = function (data, ...rest) {
    if (!isSignRequest(data)) return post(data, ...rest);
    maybeRewrite(data).then((d) => post(d, ...rest), () => post(data, ...rest));
  };
  // A refusal of a transaction the helper changed: stand aside for 2 minutes for that wallet.
  window.addEventListener("message", (ev) => {
    const d = ev.data; if (!d || typeof d !== "object" || d.command || !ours.has(d.id)) return;
    const me = ours.get(d.id); ours.delete(d.id);
    if (d.error) standAside.set(me, Date.now() + 120000);
  });
})();
