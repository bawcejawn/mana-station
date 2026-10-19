// Throwaway TESTNET keys only. Never fund these with real KOIN; never reuse on mainnet.
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { Signer } = require("../contracts/station/node_modules/koilib");
import { randomBytes } from "crypto"; import fs from "fs";
const f = new URL("./keys.testnet.json", import.meta.url);
// Adds missing roles only; never overwrites an existing key.
const out = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : { WARNING: "TESTNET (Harbinger) throwaway keys. Not for mainnet. Generated " + new Date().toISOString() };
for (const role of ["funder", "station", "owner", "app", "user1", "user2", "token", "buyer", "spam1", "spam2"]) {
  if (out[role]) continue;
  const s = new Signer({ privateKey: randomBytes(32).toString("hex") });
  out[role] = { address: s.getAddress(), wif: s.getPrivateKey("wif") };
}
fs.writeFileSync(f, JSON.stringify(out, null, 2), { mode: 0o600 });
for (const r of Object.keys(out)) if (r !== "WARNING") console.log(r.padEnd(8), out[r].address);
