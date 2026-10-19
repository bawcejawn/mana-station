// TESTNET-ONLY build: same contract, but VUSDT = the worthless mock token (MOCK_STABLE=<address>).
// Output: build/testnet/contract.wasm. assembly/net.ts is restored afterwards (mainnet values), even on failure.
const fs = require("fs"), { execSync } = require("child_process");
const mock = process.env.MOCK_STABLE;
if (!/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(mock || "")) throw new Error("set MOCK_STABLE to the testnet mock token address");
const NET = "assembly/net.ts", orig = fs.readFileSync(NET, "utf8");
if (!orig.includes('NETWORK = "mainnet"')) throw new Error("net.ts is not the mainnet version; refusing");
try {
  fs.writeFileSync(NET, orig.replace(/VUSDT = "[^"]+"/, `VUSDT = "${mock}"`).replace('NETWORK = "mainnet"', 'NETWORK = "testnet"'));
  execSync("npm run build", { stdio: "inherit" });
  fs.mkdirSync("build/testnet", { recursive: true });
  fs.copyFileSync("build/release/contract.wasm", "build/testnet/contract.wasm");
} finally { fs.writeFileSync(NET, orig); }
fs.rmSync("build/release/contract.wasm"); // never leave a testnet wasm where the mainnet one belongs
console.log("build/testnet/contract.wasm (VUSDT = mock " + mock + "); run `npm run build` again for mainnet");
