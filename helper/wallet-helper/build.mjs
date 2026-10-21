// Builds the wallet helper for one network: a userscript and an unpacked Chrome extension (same code).
//   node helper/wallet-helper/build.mjs testnet      (station from testnet/playground.json)
//   node helper/wallet-helper/build.mjs mainnet <station address> <max rc>
import fs from "fs";
const here = (p) => new URL(p, import.meta.url);
const net = process.argv[2] || "testnet";
const NETS = {
  testnet: { rpc: "https://testnet.koinosfoundation.org", chainId: "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==" },
  mainnet: { rpc: "https://api.koinos.io", chainId: "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==" },
};
const pg = net === "testnet" ? JSON.parse(fs.readFileSync(here("../../testnet/playground.json"))) : {};
const station = net === "testnet" ? pg.station : process.argv[3];
if (!/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(station || "")) throw new Error("station address needed");
const version = "0.1.0";
const cfg = { ...NETS[net], network: net, station, maxRc: process.argv[4] || "200000000", version };
const client = fs.readFileSync(here("../mana-station-client.js"), "utf8");
const core = fs.readFileSync(here("src/helper-core.js"), "utf8").replace("__MANA_STATION_CONFIG__", JSON.stringify(cfg));
const body = client + "\n" + core;
const banner = `// ==UserScript==
// @name         Mana Station helper (${net})
// @namespace    mana-station
// @version      ${version}
// @description  Your Mana Station pass pays your Koinos transactions when it covers them. Holds no keys, signs nothing, only sets who pays.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
`;
fs.writeFileSync(here(`mana-station-helper.${net}.user.js`), banner + body);
fs.mkdirSync(here("extension"), { recursive: true });
fs.writeFileSync(here("extension/page.js"), body);
fs.writeFileSync(here("extension/manifest.json"), JSON.stringify({
  manifest_version: 3, name: `Mana Station helper${net === "mainnet" ? "" : " (" + net + ")"}`, version,
  description: "Your Mana Station pass pays your Koinos transactions when it covers them. Holds no keys, signs nothing, only sets who pays.",
  content_scripts: [{ matches: ["<all_urls>"], js: ["page.js"], world: "MAIN", run_at: "document_start", all_frames: false }],
}, null, 2) + "\n");
console.log(`built ${net} helper for station ${station}: mana-station-helper.${net}.user.js and extension/`);
