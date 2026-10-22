// Verifies the wasm you are about to upload to MAINNET is exactly a fresh mainnet release build.
//   npm run check:mainnet                       checks build/release/contract.wasm
//   npm run check:mainnet -- path/to/file.wasm  checks the file you will actually upload
// AB-007 (audit-fixes-1): it reads the file first, then rebuilds with `npm run build` (BUILD_FOR_TESTING=0) and compares
// sha256. A testing build (`npm run build:sim`, now written to build/sim/), a testnet build or any stale or edited file
// is refused. The rebuilt wasm must also embed the real vUSDT/vUSDC addresses and no mock (MOCK_STABLE), with net.ts
// set to mainnet. Put the printed sha256 in the launch checklist (docs/LAUNCH.md).
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execSync } = require("child_process");
const RELEASE = "build/release/contract.wasm";
const target = process.argv[2] || RELEASE;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fail = (why) => { console.log("mainnet build check: FAILED (" + why + ")"); process.exit(1); };

if (!fs.existsSync(target)) fail("no file to check at " + target);
const upload = fs.readFileSync(target);                       // read before the rebuild overwrites build/release
try { execSync("npm run build", { stdio: "pipe" }); } catch (e) { process.stdout.write(String(e.stdout || "") + String(e.stderr || "")); fail("npm run build failed"); }
const wasm = fs.readFileSync(RELEASE);
const has = (s) => wasm.includes(Buffer.from(s, "utf8")) || wasm.includes(Buffer.from(s, "utf16le"));
const net = fs.readFileSync("assembly/net.ts", "utf8");
if (!net.includes('NETWORK = "mainnet"')) fail("assembly/net.ts is not the mainnet version");
if (!has("12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh") || !has("1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj")) fail("real vUSDT/vUSDC addresses missing");
if (process.env.MOCK_STABLE && has(process.env.MOCK_STABLE)) fail("the mock stablecoin is in the build");
if (sha(upload) !== sha(wasm)) fail(`${path.normalize(target)} (sha256 ${sha(upload)}) is not the mainnet release build (sha256 ${sha(wasm)}); upload only a fresh \`npm run build\``);
console.log(`mainnet build check: OK (real vUSDT/vUSDC, no mock; ${path.normalize(target)} = fresh release build)`);
console.log(`sha256 ${sha(wasm)}  ${wasm.length} bytes`);
