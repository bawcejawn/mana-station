// audit-fixes-1: copied from the Audit Bot run; only the sandbox paths (/app/...) are made relative to this file.
// Red team (web attacker): can ANY https site tell that the visitor has the Mana Station helper installed (and switched
// on)? The code comment (page.js:28 "Other sites learn nothing") and AUDIT.md M3 ("the 'helper is on' marker only on
// the Mana Station site") say no. These tests assert that SAFE behaviour; they fail while the leak exists.
// Loads /app/helper/wallet-helper/src/{page,bridge}.js into vm contexts with fake window/chrome objects. No network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../src/", import.meta.url);
const PAGE = fs.readFileSync(new URL("page.js", ROOT), "utf8");
const BRIDGE = fs.readFileSync(new URL("bridge.js", ROOT), "utf8");
const CFG = {
  network: "mainnet", chainId: "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==",
  station: "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc", version: "0.3.1", targets: ["popup"],
  defaultRc: "50000000", minRc: "1000000", maxRc: "300000000", siteOrigins: ["https://bawcejawn.github.io"],
};
const EVIL = "https://evil.example";
// (AB-038: page.js passes answers on in a task of its own, so flush also lets short timers run.)
const flush = async (n = 20) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 5)); } };

function fakeWindow(origin) {
  const listeners = [], log = [], win = {};
  function nativePost(msg, targetOrigin) {
    log.push({ msg, targetOrigin });
    const ev = { data: msg, source: win, origin };
    setImmediate(() => { for (const l of listeners.slice()) l(ev); });
  }
  Object.assign(win, {
    postMessage: nativePost,
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    setTimeout, clearTimeout,
    location: { origin, protocol: new URL(origin).protocol },
  });
  win.window = win;
  return { win, log, listeners, nativePost };
}

test("bridge.js does not broadcast a helper 'state' message to an unrelated site", async () => {
  const f = fakeWindow(EVIL);
  // The attacking site listens for every message on its own window (it can do this before or after document_start).
  const seen = [];
  f.listeners.push((ev) => { if (ev.data && typeof ev.data === "object" && "__manaStation" in ev.data) seen.push(ev.data); });
  f.win.chrome = {
    storage: { local: { get: async (d) => ({ ...d, enabled: true }) }, onChanged: { addListener() {} } },
    runtime: { sendMessage: async () => ({ pay: false }) },
  };
  vm.runInContext(BRIDGE, vm.createContext(f.win), { filename: "bridge.js" });
  await flush();
  assert.deepEqual(seen.map((d) => JSON.parse(JSON.stringify(d))), [],
    "bridge.js:7-9 posts {__manaStation:'state', enabled} to every https page: any site learns the helper is installed and whether it is on");
});

test("page.js does not set the __manaStationHelper marker on an unrelated site (control: expected to pass)", () => {
  const f = fakeWindow(EVIL);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), vm.createContext(f.win), { filename: "page.js" });
  assert.equal(Object.prototype.hasOwnProperty.call(f.win, "__manaStationHelper"), false);
});

test("page.js does not leave a recognisable wrapper on window.postMessage of an unrelated site", () => {
  const f = fakeWindow(EVIL);
  const ctx = vm.createContext(f.win);
  vm.runInContext(PAGE.replace("__CONFIG__", JSON.stringify(CFG)), ctx, { filename: "page.js" });
  // What any site script can run: window.postMessage.toString() / .name
  const src = vm.runInContext("Function.prototype.toString.call(window.postMessage)", ctx);
  const name = vm.runInContext("window.postMessage.name", ctx);
  const untouched = f.win.postMessage === f.nativePost;
  const looksNative = /\[native code\]/.test(src) && name === "postMessage";
  assert.ok(untouched || looksNative,
    `page.js:75-85 replaces window.postMessage with a plain JS function (name "${name}"); its source is readable by every page: ` +
    src.slice(0, 80).replace(/\s+/g, " ") + "…");
});
