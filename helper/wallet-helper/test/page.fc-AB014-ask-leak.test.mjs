// Audit Bot fix-check attack test (mana-station, branch audit-fixes-1, commit dd5148d). Related: AB-014 (fix bypass).
// Attack: on an unrelated https site, the visitor sends any transaction through Kondor. page.js posts its question
// {__manaStation:"ask", ..., token} with window.postMessage on the page's own window, so the site's own "message"
// listener sees it: the site learns the helper is installed, and reads the per-load secret that bridge.js now requires.
// Asserts the SAFE behaviour ("other sites learn nothing", page.js / bridge.js AB-014): FAILS while the ask is visible.
// Harness: the same fake window as helper/wallet-helper/test/page.rt-web-answer.test.mjs (context global as source),
// plus a minimal document so the AB-014 token code runs. Loads ../src/page.js. No network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PAGE = fs.readFileSync(new URL("../src/page.js", import.meta.url), "utf8");
const CHAIN = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const CFG = { network: "mainnet", chainId: CHAIN, station: "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc", version: "0.3.1", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"] };
const ORIGIN = "https://unrelated-dapp.example";
const ME = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q", APP = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
// (AB-038: page.js passes answers on in a task of its own, so flush also lets short timers run.)
const flush = async (n = 30) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };

test("an unrelated site never sees a Mana Station message or the bridge secret when its visitor signs a transaction", async () => {
  const listeners = [], win = {}; let self = win; const attrs = {};
  function nativePost(msg) { const ev = { data: msg, source: self, origin: ORIGIN }; setImmediate(() => { for (const l of listeners.slice()) l(ev); }); }
  Object.assign(win, {
    postMessage: nativePost, addEventListener(t, fn) { if (t === "message") listeners.push(fn); },
    setTimeout, clearTimeout, location: { origin: ORIGIN, protocol: "https:" }, crypto: globalThis.crypto,
    document: { documentElement: { getAttribute: (k) => attrs[k] || null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } },
  });
  win.window = win;
  const ctx = vm.createContext(win); self = vm.runInContext("globalThis", ctx);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), ctx, { filename: "page.js" });
  // The site's own script (runs after document_start) listens to its window, as any page can.
  const seen = [];
  listeners.push((ev) => { const d = ev.data; if (d && typeof d === "object" && "__manaStation" in d) seen.push(JSON.parse(JSON.stringify(d))); });
  // The visitor uses the site normally: one Kondor signing request.
  const req = { id: "req-1", command: "signer:signTransaction", to: "popup",
    args: { signerAddress: ME, transaction: { header: { chain_id: CHAIN, rc_limit: "20000000" }, operations: [{ call_contract: { contract_id: APP, entry_point: 1, args: "" } }] } } };
  self.postMessage(req, "*");
  await flush();
  const leaked = seen.filter((d) => d.__manaStation === "ask");
  assert.equal(leaked.length, 0,
    `AB-014 bypass: the site saw ${leaked.length} helper question(s) (helper installed), token ${leaked[0] && leaked[0].token ? "visible (" + String(leaked[0].token).length + " hex chars)" : "absent"}`);
});
