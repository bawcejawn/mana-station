// Verifies the MAINNET wasm (build/release/contract.wasm) embeds the real vUSDT/vUSDC addresses and no mock (MOCK_STABLE).
const fs = require("fs");
const wasm = fs.readFileSync("build/release/contract.wasm");
const has = (s) => wasm.includes(Buffer.from(s, "utf8")) || wasm.includes(Buffer.from(s, "utf16le"));
const net = fs.readFileSync("assembly/net.ts", "utf8");
const ok = net.includes('NETWORK = "mainnet"') && has("12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh") && has("1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj")
  && !(process.env.MOCK_STABLE && has(process.env.MOCK_STABLE));
console.log(ok ? "mainnet build check: OK (real vUSDT/vUSDC, no mock)" : "mainnet build check: FAILED");
process.exit(ok ? 0 : 1);
