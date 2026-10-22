// audit-fixes-1: copied from the Audit Bot run; only the sandbox paths (/app/...) are made relative to this file.
// Red team (web attacker) against the published site's helper check page (site/helper.html, inline script).
// Its "stand-in wallet" listens for window messages {to:"ms-standin", command:"signer:sendTransaction"} and SIGNS AND
// SENDS the transaction with the test wallet key kept in this browser's localStorage, with no prompt and no check of
// who sent the message (helper.html:140-151). Any other site holding a reference to the tab (window.open, an iframe
// of the page: GitHub Pages sends no frame-ancestors / X-Frame-Options) can post that message cross-origin.
// SAFE behaviour asserted: messages from another window / origin are never signed; the chain id comes from the site
// config, not from the message. A same-window control shows the harness works.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const HTML = fs.readFileSync(new URL("../helper.html", import.meta.url), "utf8");
const at = HTML.indexOf("ms-standin");
const CODE = HTML.slice(HTML.lastIndexOf("<script>", at) + "<script>".length, HTML.indexOf("</script>", at));
const SITE = "https://bawcejawn.github.io";
const TESTNET = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==";
const MAINNET = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const VICTIM = "1G85uRcAKiMPQjXv7jYc7VQWMe37NtNT2q";      // a test wallet address kept in the victim's localStorage
const TOKEN = "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX";
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function load() {
  const listeners = [], sent = [], replies = [];
  const el = () => ({ hidden: false, textContent: "", className: "", addEventListener() {}, replaceChildren() {}, append() {} });
  class Transaction {
    constructor({ signer, provider, options }) { this.signer = signer; this.options = options; this.transaction = { header: {}, operations: [] }; }
    async prepare() { if (!this.signer) throw new Error("no signer"); this.transaction.header = { ...this.options }; }
    async send() { sent.push({ signer: this.signer, options: { ...this.options }, operations: this.transaction.operations }); return { id: "0x01", rc_used: "1", payer: this.options.payer }; }
    async wait() { return { blockNumber: 1 }; }
  }
  const g = {
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    postMessage(m, t) { replies.push({ m, t }); },
    Transaction,
    MSWallets: { signer: (a) => (a === VICTIM ? { address: a, key: "victim test key" } : null), list: () => [] },
    MS: { $: () => el(), PG: { chainId: TESTNET }, ST: "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc", provider: { getAccountRc: async () => "0" },
      active: () => null, onWallet() {}, run() {}, read: async () => ({}), mana: () => "0", appC() { return {}; } },
    document: { createElement: () => ({ className: "", innerHTML: "", firstChild: {}, lastChild: {} }) },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0)" },
    location: { origin: SITE, protocol: "https:" },
  };
  g.window = g;
  // audit-fixes-1 harness fix: inside the vm context `window` is the context's global, not `g`, so a message "from the
  // page itself" (source g) looked like another window. Deliver the context's own global instead, as a browser does.
  const ctx = vm.createContext(g), self = vm.runInContext("globalThis", ctx);
  vm.runInContext(CODE, ctx, { filename: "helper.html#inline" });
  const fire = (data, source, origin) => { for (const l of listeners.slice()) l({ data, source: source === g ? self : source, origin }); };
  return { g, sent, replies, fire };
}
const transfer = (chain) => ({
  id: "x1", to: "ms-standin", command: "signer:sendTransaction",
  args: { signerAddress: VICTIM, transaction: { header: { chain_id: chain, rc_limit: "100000000" },
    operations: [{ call_contract: { contract_id: TOKEN, entry_point: 0x27f576ca, args: "attacker-chosen-transfer" } }] } },
});

test("helper.html stand-in does not sign a request posted by another window / origin", async () => {
  const p = load();
  p.fire(transfer(TESTNET), { attacker: "window" }, "https://evil.example");
  await flush();
  assert.equal(p.sent.length, 0,
    "helper.html:140-151: a cross-origin message made the stand-in sign and send a transaction with the victim's test key " +
    "(no ev.source / ev.origin check, no prompt); the receipt is also posted back with targetOrigin '*'");
});

test("helper.html stand-in signs only for the playground's chain id", async () => {
  const p = load();
  p.fire(transfer(MAINNET), p.g, SITE);              // even from the page itself
  await flush();
  assert.equal(p.sent.length, 0, "helper.html:144-145 takes chainId from the message header, not from MS.PG.chainId");
});

test("control: the page's own testnet request is signed (expected to pass)", async () => {
  const p = load();
  p.fire(transfer(TESTNET), p.g, SITE);
  await flush();
  assert.equal(p.sent.length, 1);
  assert.equal(p.sent[0].signer.address, VICTIM);
});
