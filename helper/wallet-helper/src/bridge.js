/* Mana Station helper, bridge (the extension's isolated side of the page). Passes the page part's question to the
 * extension and the answer back, and tells the page part whether the helper is switched on. Only questions from this
 * same window are accepted; answers carry only yes/no and the Mana limit to use.
 * Audit Bot AB-014 (2026-10-22): other sites learn nothing. The on/off state is posted only on the Mana Station site's
 * own origins (filled in by build.mjs), and only questions carrying this page load's secret, which page.js and this
 * script share before any site script runs, are answered.
 * Audit Bot AB-026 (2026-10-22): questions and answers travel as DOM events on the document whose type includes that
 * secret, not as window messages (the page's own scripts saw those, secret included).
 * audit-2026-10 W1-01: this script creates the secret and hands it to page.js with a synchronous event handshake at
 * document_start (no DOM attribute a page could pre-set). W1-10: the on/off switch reaches page.js on every site, on the
 * private "ms-state-<secret>" event, so a switched-off helper leaves every request alone. */
(function () {
  "use strict";
  // The per-load secret, made here. Handed to page.js only (see page.js): announced once now, and given once more in
  // answer to page.js's first "ms-hello-p"; then no listener is left that a site script could reach.
  let token = null;
  try {
    const b = new Uint8Array(16); crypto.getRandomValues(b); token = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    const give = () => document.dispatchEvent(new CustomEvent("ms-hello-b", { detail: token }));
    const onP = () => { document.removeEventListener("ms-hello-p", onP); give(); };
    document.addEventListener("ms-hello-p", onP);
    give();
  } catch (e) { token = null; }                         // no DOM: answer nothing
  if (!token) return;                                    // no secret: no channel, answer nothing
  const tell = (enabled) => document.dispatchEvent(new CustomEvent("ms-state-" + token, { detail: enabled ? "on" : "off" }));
  chrome.storage.local.get({ enabled: true }).then((s) => tell(s.enabled), () => {});
  chrome.storage.onChanged.addListener((ch) => { if (ch.enabled) tell(ch.enabled.newValue !== false); });
  // Only page.js knows the secret, so only it can send a question on this event type (no window message is answered).
  const answer = (o) => document.dispatchEvent(new CustomEvent("ms-answer-" + token, { detail: JSON.stringify(o) }));
  document.addEventListener("ms-ask-" + token, (ev) => {
    let d; try { d = typeof ev.detail === "string" ? JSON.parse(ev.detail) : null; } catch (e) { return; }
    if (!d || typeof d !== "object" || typeof d.id !== "string" || d.id.length > 64) return;
    chrome.runtime.sendMessage({ type: "would_pay", payee: d.payee, operations: d.operations, rcLimit: d.rcLimit })
      .then((a) => answer({ id: d.id, pay: !!(a && a.pay), rcLimit: a && a.rcLimit }))
      .catch(() => answer({ id: d.id, pay: false }));
  });
})();
