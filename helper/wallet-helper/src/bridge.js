/* Mana Station helper, bridge (the extension's isolated side of the page). Passes the page part's question to the
 * extension and the answer back, and tells the page part whether the helper is switched on. Only questions from this
 * same window are accepted; answers carry only yes/no and the Mana limit to use. */
(function () {
  "use strict";
  const target = window.location.origin === "null" ? "*" : window.location.origin;
  const tell = (enabled) => window.postMessage({ __manaStation: "state", enabled }, target);
  chrome.storage.local.get({ enabled: true }).then((s) => tell(s.enabled), () => {});
  chrome.storage.onChanged.addListener((ch) => { if (ch.enabled) tell(ch.enabled.newValue !== false); });
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data; if (!d || typeof d !== "object" || d.__manaStation !== "ask" || typeof d.id !== "string" || d.id.length > 64) return;
    chrome.runtime.sendMessage({ type: "would_pay", payee: d.payee, operations: d.operations, rcLimit: d.rcLimit })
      .then((a) => window.postMessage({ __manaStation: "answer", id: d.id, pay: !!(a && a.pay), rcLimit: a && a.rcLimit }, target))
      .catch(() => window.postMessage({ __manaStation: "answer", id: d.id, pay: false }, target));
  });
})();
