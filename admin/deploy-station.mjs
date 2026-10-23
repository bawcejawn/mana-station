#!/usr/bin/env node
// Deploy the Mana Station: the reviewed deploy tool (audit-2026-10 M-12). One transaction uploads the checked wasm with
// all three permissions taken over AND runs init with your final settings (init refuses anything else), then the
// result is read back from the chain and compared with what you meant to deploy.
//
//   NETWORK=mainnet node admin/deploy-station.mjs --wasm contracts/station/build/release/contract.wasm \
//     --sha256 <the release sha256 published in docs/LAUNCH.md> --config <final settings .json> [--dry-run]
//
// Before running it on mainnet: `cd contracts/station && npm run check:mainnet -- --release` at the release tag (a
// clean, committed, tagged tree whose fresh build is this wasm). Rehearse first on a local node or the testnet:
// NETWORK=local RPC=http://localhost:8080 CHAIN_ID=<id> …, or NETWORK=testnet ….
//
// --dry-run   checks everything and prints the transaction, without asking for the key or sending anything.
// The Station's own key (the account whose address becomes the contract) is asked for with a hidden prompt (or
// ADMIN_WIF). It must already hold koin_amount KOIN (init checks it) and enough Mana to pay for the upload. After the
// deploy, that key can't move funds or replace the code (the three permissions are the contract's): keep it offline.
import fs from "fs"; import crypto from "crypto";
import { koilib, network, abi, isAddress, signer, confirmSigning, fail } from "./lib.mjs";

const arg = (k) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes("--dry-run");
const wasmPath = arg("wasm"), want = String(arg("sha256") || "").toLowerCase(), cfgPath = arg("config");
if (!wasmPath || !cfgPath || !/^[0-9a-f]{64}$/.test(want)) fail("usage: deploy-station.mjs --wasm <file> --sha256 <64 hex> --config <file.json> [--dry-run]");
const K = await koilib(); const NET = await network(K); const { provider } = NET;
const M = 100_000_000n;
const lines = [];
const check = (ok, what) => { lines.push(`${ok ? "OK  " : "FAIL"} ${what}`); if (!ok) { console.log(lines.join("\n")); fail("Stopped: fix the above. Nothing was sent."); } };

// 1. The code: exactly the published release.
const wasm = fs.readFileSync(wasmPath);
const sha = crypto.createHash("sha256").update(wasm).digest("hex");
check(sha === want, `wasm ${wasmPath}: ${wasm.length} bytes, sha256 ${sha}${sha === want ? " = the published release" : ` is NOT the published ${want}`}`);

// 2. The settings: complete, no placeholders, and the shapes the contract will accept.
const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8")); const config = raw.config || raw;
const text = JSON.stringify(config);
check(!/[<>]/.test(text) && !Object.keys(config).some((k) => k.startsWith("_")), "settings: no placeholders or notes (\"<…>\", \"_…\" keys)");
check(isAddress(config.owner), `owner ${config.owner}`);
const council = config.council || [];
check(council.length >= 3 && council.length <= 7 && council.every(isAddress) && new Set(council).size === council.length, `council of ${council.length}: ${council.join(", ")}`);
check(Number(config.threshold) >= 2 && Number(config.threshold) < council.length, `threshold ${config.threshold} of ${council.length} (below the size, audit-2026-10 M-4)`);
check(!council.includes(config.owner), "the owner isn't a council member");
check(!config.treasury || isAddress(config.treasury), `treasury ${config.treasury || "(empty: the owner wallet)"}`);
if (NET.name === "mainnet") check(BigInt(config.guard_delay_ms || 0) >= 172_800_000n, `waiting period ${Number(BigInt(config.guard_delay_ms || 0) / 3_600_000n)} hours (at least 48 on mainnet)`);
check(!config.paused, "starts running (not paused)");

// 3. The station account: its KOIN, its Mana, and that nothing is there yet.
const K0 = new K.Contract({ id: (await provider.invokeGetContractAddress("koin")).value.address, abi: K.utils.tokenAbi, provider });
const lim = (await provider.call("chain.get_resource_limits", {})).resource_limit_data;
const rcLimit = (BigInt(wasm.length + 4096) * (BigInt(lim.disk_storage_cost) + BigInt(lim.network_bandwidth_cost)) + 40_000_000n * BigInt(lim.compute_bandwidth_cost)) * 3n / 2n;
let st = null, address = process.env.STATION_ADDRESS || "";
if (!DRY) { st = await signer(K, provider, "The STATION's key (WIF, hidden): "); address = st.getAddress(); }
if (address) {
  const meta = await provider.invokeGetContractMetadata(address).catch(() => null);
  check(!(meta && meta.value && meta.value.hash), `${address} has no contract yet (this tool deploys once; upgrades go through the council)`);
  const koin = BigInt((await K0.functions.balanceOf({ owner: address })).result?.value || 0);
  check(koin >= BigInt(config.koin_amount), `station KOIN ${Number(koin) / 1e8} ≥ koin_amount ${Number(BigInt(config.koin_amount)) / 1e8}`);
  const rc = BigInt(await provider.getAccountRc(address));
  check(rc >= rcLimit, `station Mana ${Number(rc) / 1e8} ≥ the upload's limit ${Number(rcLimit) / 1e8}`);
}

// 4. One transaction: upload (all three permissions taken over) + init.
const ABI = abi();
// (A dry run builds the operations with a throwaway key: only the station's own key can make the real upload.)
const sk = st || K.Signer.fromSeed(crypto.randomBytes(32).toString("hex")); sk.provider = provider;
const c = new K.Contract({ id: address || sk.getAddress(), abi: ABI, provider, signer: sk, bytecode: wasm });
const { operation: up } = await c.deploy({ onlyOperation: true, authorizesCallContract: true, authorizesTransactionApplication: true, authorizesUploadContract: true });
const { operation: init } = await c.functions.init({ config }, { onlyOperation: true });
console.log(lines.join("\n"));
console.log(`\nTransaction: 1) upload ${wasm.length} bytes to ${address || "(the station's address)"} with authorizes_call_contract, authorizes_transaction_application and authorizes_upload_contract = true; 2) init with ${cfgPath}. Mana limit ${Number(rcLimit) / 1e8}.`);
if (DRY) { console.log("Dry run: nothing signed or sent."); process.exit(0); }
await confirmSigning([`Network: ${NET.name} (${NET.chainId})`, `Station: ${address}`, `Code sha256: ${sha}`, `Owner: ${config.owner}`,
  `Council (${config.threshold} of ${council.length}): ${council.join(", ")}`, `Treasury: ${config.treasury || "the owner wallet"}`, `koin_amount: ${Number(BigInt(config.koin_amount)) / 1e8} KOIN`], "DEPLOY");
const tx = new K.Transaction({ signer: st, provider, options: { rcLimit: String(rcLimit), chainId: NET.chainId } });
await tx.pushOperation(up); await tx.pushOperation(init);
const { receipt } = await tx.send(); await tx.wait("byBlock", 180000);
console.log(`Sent: ${tx.transaction.id}, ${Number(BigInt(receipt.rc_used || 0)) / 1e8} Mana used${receipt.reverted ? " — REVERTED" : ""}.`);

// 5. Post-deploy check: what the chain now holds is what was meant.
const after = []; const ok = (good, what) => after.push(`${good ? "OK  " : "FAIL"} ${what}`);
const meta = (await provider.invokeGetContractMetadata(address)).value || {};
ok(String(meta.hash || "").toLowerCase() === "0x1220" + sha, `code on chain: ${meta.hash} (expected 0x1220${sha})`);
ok(meta.authorizes_call_contract && meta.authorizes_transaction_application && meta.authorizes_upload_contract, "all three permissions belong to the contract");
const reader = new K.Contract({ id: address, abi: ABI, provider });
const got = (await reader.functions.get_status({})).result?.config || {};
const norm = (v) => (Array.isArray(v) ? v.join(",") : v === undefined || v === null ? "" : String(v));
const diffs = Object.keys(config).filter((k) => norm(config[k]) !== norm(got[k]) && !(norm(config[k]) === "0" && norm(got[k]) === "") && !(norm(config[k]) === "false" && norm(got[k]) === ""));
ok(diffs.length === 0, diffs.length ? "settings differ on chain: " + diffs.map((k) => `${k}: ${norm(config[k])} → ${norm(got[k])}`).join("; ") : "settings on chain = the settings file");
console.log("\nPost-deploy check:\n" + after.join("\n"));
if (after.some((l) => l.startsWith("FAIL"))) fail("Post-deploy check FAILED: pause the station (any council member) and investigate.");
console.log("\nRecord the transaction id, the code hash and this output in docs/LAUNCH.md.");
