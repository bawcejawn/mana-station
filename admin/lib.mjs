// Shared by the owner / council tools in admin/ (audit-2026-10 M-12, M-13, O1-05).
//
// No npm packages. These tools hold signing keys, so they load nothing from the build folder's ~800 development
// packages: the Koinos library is the single pinned koilib 9.4.1 browser bundle the website also uses, checked against
// the same sha384 (Subresource Integrity) before it runs. It is downloaded once from jsDelivr into admin/vendor/
// (git-ignored) or read from there; a file with any other hash is refused.
//
// Every tool is pinned to one network: NETWORK=mainnet or NETWORK=testnet (no default), and the node's chain id must
// be that network's. RPC may point at another node (a local one for rehearsals) with NETWORK=local CHAIN_ID=<id>.
import fs from "fs"; import vm from "vm"; import crypto from "crypto"; import readline from "readline"; import { createRequire } from "module";

const KOILIB_URL = "https://cdn.jsdelivr.net/npm/koilib@9.4.1/dist/koinos.min.js";
const KOILIB_SRI = "sha384-IAL9o3r4bQJvWhvszkorFINY2ct4LBA/LvyXE9NSOPCyYB25BsFV12JITA7Gxbk6";   // = site/src/parts/foot.html
const VENDOR = new URL("./vendor/koinos.min.js", import.meta.url);
export const NETWORKS = {
  mainnet: { rpc: "https://api.koinos.io", chainId: "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==" },
  testnet: { rpc: "https://testnet.koinosfoundation.org", chainId: "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==" },
};
const sri = (buf) => "sha384-" + crypto.createHash("sha384").update(buf).digest("base64");
export const fail = (msg) => { console.error(msg); process.exit(1); };
// A failure inside the one-line koilib bundle would otherwise print the whole bundle: print only the message.
for (const ev of ["uncaughtException", "unhandledRejection"]) process.on(ev, (e) => fail("error: " + (e && e.message ? e.message : e)));

/** koilib's Provider, Signer, Contract, Transaction and utils, from the pinned, hash-checked bundle. */
export async function koilib() {
  let code = null;
  try { code = fs.readFileSync(VENDOR); } catch {}
  if (!code) {
    const r = await fetch(KOILIB_URL); if (!r.ok) fail(`couldn't download koilib (${r.status}); put the file at admin/vendor/koinos.min.js`);
    code = Buffer.from(await r.arrayBuffer());
    if (sri(code) === KOILIB_SRI) { fs.mkdirSync(new URL("./vendor/", import.meta.url), { recursive: true }); fs.writeFileSync(VENDOR, code); }
  }
  if (sri(code) !== KOILIB_SRI) fail(`koilib bundle hash ${sri(code)} is not the pinned ${KOILIB_SRI}: refusing to run it`);
  const ctx = { console, TextEncoder, TextDecoder, crypto: crypto.webcrypto, fetch, setTimeout, clearTimeout, URL };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx); vm.runInContext(code.toString("utf8"), ctx, { filename: "koinos.min.js" });
  const { Provider, Signer, Contract, Transaction, utils } = ctx;
  if (!Provider || !Signer || !Contract) fail("the koilib bundle didn't load");
  return { Provider, Signer, Contract, Transaction, utils };
}

/** The pinned network: { name, rpc, chainId, provider } after checking the node's chain id. */
export async function network(K) {
  const name = process.env.NETWORK;
  if (!name) fail("Set NETWORK=mainnet or NETWORK=testnet (no default, so a command meant for one can't run on the other).");
  const known = NETWORKS[name];
  if (!known && name !== "local") fail(`unknown NETWORK ${name}`);
  const chainId = known ? known.chainId : process.env.CHAIN_ID;
  if (!chainId) fail("NETWORK=local needs CHAIN_ID");
  const rpc = process.env.RPC || (known && known.rpc); if (!rpc) fail("RPC required");
  const provider = new K.Provider([rpc]);
  const got = await provider.getChainId();
  if (got !== chainId) fail(`${rpc} is chain ${got}, not ${name} (${chainId}): refusing`);
  return { name, rpc, chainId, provider };
}

export const station = () => process.env.STATION || fail("Set STATION=<the station's address>.");
export const abi = () => JSON.parse(fs.readFileSync(new URL("../contracts/station/abi/station.koilib.json", import.meta.url)));
export const proposalText = () => createRequire(import.meta.url)("../site/proposal-text.js");
export const amount = (s, what = "amount") => {           // decimal string → 8-decimal base units, exactly
  const m = String(s ?? "").trim().match(/^(\d*)(?:\.(\d{0,8}))?$/); if (!m || (m[1] === "" && !m[2])) fail(`${what}: not a number (at most 8 decimals): ${s}`);
  return BigInt(m[1] || "0") * 100000000n + BigInt(((m[2] || "") + "00000000").slice(0, 8));
};
export const show = (v) => proposalText().amt(v);
export const isAddress = (a) => /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(String(a || ""));

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}
/** The signing key: ADMIN_WIF, or a hidden prompt. Never printed or saved. */
export async function signer(K, provider, label = "Signing key (WIF, hidden): ") {
  const wif = process.env.ADMIN_WIF || (await ask(label, true));
  let s; try { s = K.Signer.fromWif(wif); } catch { fail("That isn't a valid private key (WIF)."); }
  s.provider = provider; return s;
}
/** Show exactly what will be signed, then require the typed word. */
export async function confirmSigning(lines, word = "yes") {
  console.log("\n" + lines.map((l) => "  " + l).join("\n") + "\n");
  const a = await ask(`Type ${word} to sign and send, anything else to stop: `, false);
  if (a !== word) fail("Stopped. Nothing was signed.");
}
