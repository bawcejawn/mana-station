/* Mana Station helper, bridge (the extension's isolated side of the page). Passes the page part's question to the
 * extension and the answer back. Only questions from this same window are accepted; answers carry only yes/no and
 * the Mana limit to use. */
(function () {
  "use strict";
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data; if (!d || typeof d !== "object" || typeof d.__manaStation !== "string") return;
    if (d.__manaStation === "covered") { chrome.runtime.sendMessage({ type: "covered" }).catch(() => {}); return; }
    if (d.__manaStation !== "ask" || typeof d.id !== "string" || d.id.length > 64) return;
    chrome.runtime.sendMessage({ type: "would_pay", payee: d.payee, operations: d.operations, rcLimit: d.rcLimit })
      .then((a) => window.postMessage({ __manaStation: "answer", id: d.id, pay: !!(a && a.pay), rcLimit: a && a.rcLimit }, window.location.origin === "null" ? "*" : window.location.origin))
      .catch(() => window.postMessage({ __manaStation: "answer", id: d.id, pay: false }, window.location.origin === "null" ? "*" : window.location.origin));
  });
})();
