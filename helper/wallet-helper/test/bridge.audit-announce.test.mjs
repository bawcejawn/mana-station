// audit-fixes-1: copied from the Audit Bot run; only the sandbox paths (/app/...) are made relative to this file.
// Audit Bot test (extension announces itself), mana-station commit 4343f83.
// Check: helper/wallet-helper/AUDIT.md M3 says the "helper is on" marker is shown only on the Mana Station site and
// other sites learn nothing. bridge.js (content script on every https page) posts its on/off state to every page and
// answers any page's "ask", so any site can detect the extension.
// Asserts the SAFE behaviour: a page on another origin receives nothing from the helper. FAILS while the issue exists.
import fs from "fs"; import vm from "vm"; import test from "node:test"; import assert from "node:assert";
const SRC = process.env.BRIDGE || new URL("../src/bridge.js", import.meta.url);
function load(origin) {
  const posted = [], listeners = [];
  const window = { location: { origin }, postMessage: (m, t) => posted.push({ m, t }), addEventListener: (ev, f) => { if (ev === "message") listeners.push(f); } };
  const chrome = { storage: { local: { get: async (d) => ({ ...d, enabled: true }) }, onChanged: { addListener() {} } },
                   runtime: { sendMessage: async () => ({ pay: false }) } };
  vm.runInNewContext(fs.readFileSync(SRC, "utf8"), { window, chrome, Promise });
  return { window, posted, listeners };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
test("a page on an unrelated origin is not told the helper is installed", async () => {
  const p = load("https://unrelated.example"); await tick();
  assert.strictEqual(p.posted.length, 0, `AB extension announce: bridge posted ${JSON.stringify(p.posted.map((x) => x.m))} to an unrelated site`);
});
test("a page on an unrelated origin gets no answer to an 'ask'", async () => {
  const p = load("https://unrelated.example"); await tick(); p.posted.length = 0;
  for (const f of p.listeners) f({ source: p.window, data: { __manaStation: "ask", id: "probe-1", payee: "1x", operations: [], rcLimit: "1" } });
  await tick();
  assert.strictEqual(p.posted.length, 0, `AB extension announce: bridge answered an unrelated site's probe: ${JSON.stringify(p.posted.map((x) => x.m))}`);
});
