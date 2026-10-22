/* Mana Station helper, bridge (the extension's isolated side of the page). Passes the page part's question to the
 * extension and the answer back, and tells the page part whether the helper is switched on. Only questions from this
 * same window are accepted; answers carry only yes/no and the Mana limit to use.
 * Audit Bot AB-014 (2026-10-22): other sites learn nothing. The on/off state is posted only on the Mana Station site's
 * own origins (filled in by build.mjs), and only questions carrying this page load's secret, which page.js and this
 * script share before any site script runs, are answered. */
(function () {
  "use strict";
  const SITES = [] /*SITE_ORIGINS*/;
  const origin = window.location.origin, target = origin === "null" ? "*" : origin;
  // The per-load secret: whichever of page.js / bridge.js runs first at document_start puts a random value in a DOM
  // attribute; the other takes it and removes the attribute, so page scripts (which run later) never see it.
  let token = null;
  try {
    const el = document.documentElement, A = "data-ms-helper";
    const mine = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); };
    token = el.getAttribute(A);
    if (token) el.removeAttribute(A); else { token = mine(); el.setAttribute(A, token); }
  } catch (e) { token = null; }                         // no DOM: answer nothing
  if (SITES.indexOf(origin) >= 0) {
    const tell = (enabled) => window.postMessage({ __manaStation: "state", enabled }, target);
    chrome.storage.local.get({ enabled: true }).then((s) => tell(s.enabled), () => {});
    chrome.storage.onChanged.addListener((ch) => { if (ch.enabled) tell(ch.enabled.newValue !== false); });
  }
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data; if (!d || typeof d !== "object" || d.__manaStation !== "ask" || typeof d.id !== "string" || d.id.length > 64) return;
    if (!token || d.token !== token) return;               // not asked by this extension's page part
    chrome.runtime.sendMessage({ type: "would_pay", payee: d.payee, operations: d.operations, rcLimit: d.rcLimit })
      .then((a) => window.postMessage({ __manaStation: "answer", id: d.id, pay: !!(a && a.pay), rcLimit: a && a.rcLimit }, target))
      .catch(() => window.postMessage({ __manaStation: "answer", id: d.id, pay: false }, target));
  });
})();
