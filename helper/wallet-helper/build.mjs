// Builds the Mana Station helper browser extension for one network, plus a zip ready for the Edge Add-ons store and the
// Chrome Web Store.
//   node helper/wallet-helper/build.mjs testnet                                   (station from testnet/playground.json)
//   node helper/wallet-helper/build.mjs mainnet <station address> <max rc> <site url>
// Output: helper/wallet-helper/dist/<network>/ (load unpacked) and dist/mana-station-helper-<network>-<version>.zip
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const net = process.argv[2] || "testnet";
const NETS = {
  testnet: { rpc: "https://testnet.koinosfoundation.org", chainId: "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==", targets: ["popup", "ms-standin"] },
  mainnet: { rpc: "https://api.koinos.io", chainId: "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==", targets: ["popup"] },
};
if (!NETS[net]) throw new Error("network: testnet or mainnet");
const pg = net === "testnet" ? JSON.parse(fs.readFileSync(path.join(dir, "../../testnet/playground.json"))) : {};
const station = net === "testnet" ? pg.station : process.argv[3];
if (!/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(station || "")) throw new Error("station address needed (mainnet: build.mjs mainnet <station> <max rc> <site url>)");
const maxRc = (net === "testnet" ? "200000000" : process.argv[4]) || "300000000";            // the station's hard_max
const site = (net === "testnet" ? "https://bawcejawn.github.io/mana-station/" : process.argv[5]) || "https://bawcejawn.github.io/mana-station/";
const version = JSON.parse(fs.readFileSync(path.join(dir, "version.json"))).version;
// defaultRc: the limit asked about when the site's own limit isn't a sensible size (0.5 Mana; a simple action uses ~0.17);
// Kondor's "optimize mana" then sets the final limit to ~1.1x real use. maxRc: the station's per-transaction maximum.
const cfg = { network: net, rpc: NETS[net].rpc, chainId: NETS[net].chainId, station, maxRc, site, version, targets: NETS[net].targets, defaultRc: "50000000", minRc: "1000000" };

const out = path.join(dir, "dist", net);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, "icons"), { recursive: true });
const src = (f) => fs.readFileSync(path.join(dir, "src", f), "utf8");
const siteOrigin = new URL(site).origin;
const siteOrigins = net === "mainnet" ? [siteOrigin] : [siteOrigin, "https://example.test"];
fs.writeFileSync(path.join(out, "page.js"), src("page.js").replace("__CONFIG__", JSON.stringify({ network: net, chainId: cfg.chainId, station, version, targets: cfg.targets,
  defaultRc: cfg.defaultRc, minRc: cfg.minRc, maxRc, siteOrigins })));
// AB-014: bridge.js posts the on/off state only on these origins (the Mana Station site's own pages).
fs.writeFileSync(path.join(out, "bridge.js"), src("bridge.js"));
for (const f of ["background.js", "popup.html", "popup.js"]) fs.writeFileSync(path.join(out, f), src(f));
fs.copyFileSync(path.join(dir, "../mana-station-client.js"), path.join(out, "client.js"));
fs.writeFileSync(path.join(out, "config.js"), "self.MS_CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n");
for (const s of [16, 32, 48, 128]) fs.copyFileSync(path.join(dir, "icons", `icon${s}.png`), path.join(out, "icons", `icon${s}.png`));
const icons = { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" };
// Web pages only (https, and localhost for developers); the testnet build also runs on the playground opened from disk.
const matches = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"].concat(net === "mainnet" ? [] : ["file:///*"]);
const name = "Mana Station helper" + (net === "mainnet" ? "" : ` (${net})`);
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
  manifest_version: 3, name, version,
  description: "Lets your Mana Station pass, and apps the station supports, pay your Koinos transaction fees. Holds no keys, signs nothing, only sets who pays.",
  icons, action: { default_popup: "popup.html", default_icon: icons, default_title: name },
  permissions: ["storage"],
  host_permissions: [new URL(cfg.rpc).origin + "/*"],
  background: { service_worker: "background.js" },
  content_scripts: [
    { matches, js: ["page.js"], world: "MAIN", run_at: "document_start", all_frames: false },
    { matches, js: ["bridge.js"], run_at: "document_start", all_frames: false },
  ],
  minimum_chrome_version: "111",
}, null, 2) + "\n");
const zip = path.join(dir, "dist", `mana-station-helper-${net}-${version}.zip`);
fs.rmSync(zip, { force: true });
execSync(`cd "${out}" && zip -q -X -r "${zip}" .`);
console.log(`built ${name} ${version} for station ${station}: ${path.relative(process.cwd(), out)} and ${path.relative(process.cwd(), zip)}`);
