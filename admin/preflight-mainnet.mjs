#!/usr/bin/env node
// Read-only checks of Koinos mainnet before launch (audit-2026-10: C3, D5, M-5, O1-09). Sends nothing, needs no key.
//
//   NETWORK=mainnet node admin/preflight-mainnet.mjs > docs/preflight-mainnet.md
//
//   1. get_contract_metadata (system call 112) answers on mainnet: the reserved app slots depend on it (K1-04).
//   2. vUSDT and vUSDC: name, symbol, decimals (the prices assume 8: O1-09), and which functions their ABI exposes
//      (pause, blocklist, freeze, owner or mint powers decide how real M-5 is).
//   3. The chain's resource prices (chain.get_resource_limits): what a unit of compute, disk and network costs in Mana,
//      to turn the measured costs (admin/measure.mjs) into hard_max and the site's limits (M-8).
import { koilib, network, fail } from "./lib.mjs";

const K = await koilib(); const NET = await network(K); const { provider } = NET;
if (NET.name !== "mainnet" && !process.env.ALLOW_OTHER) fail("This is the mainnet preflight: NETWORK=mainnet (ALLOW_OTHER=1 to try it elsewhere).");
const TOKENS = { vUSDT: "12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh", vUSDC: "1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj" };
const out = []; const say = (s = "") => out.push(s); let bad = 0;
const res = (ok, s) => { if (!ok) bad++; say(`- ${ok ? "OK" : "**CHECK**"}: ${s}`); };
const head = await provider.getHeadInfo();
say(`# Mana Station mainnet preflight\n\nNode ${NET.rpc}, chain ${NET.chainId}, head block ${head.head_topology?.height} (${new Date(Number(head.head_block_time)).toISOString()}).\n`);

say("## 1. get_contract_metadata (system call 112)");
const koin = (await provider.invokeGetContractAddress("koin")).value.address;
try { const m = await provider.invokeGetContractMetadata(koin); res(!!(m && m.value && m.value.hash), `answers on mainnet (KOIN's code hash ${m?.value?.hash})`); }
catch (e) { res(false, `NOT available: ${String(e.message || e).slice(0, 200)}. Every app-plan purchase in the reserved slots would fail; set app_reserved to keep them unused or wait for the system contract.`); }

say("\n## 2. Stablecoins");
const RISKY = /pause|paus|freeze|frozen|black|block|ban|deny|blacklist|seize|confiscat|owner|admin|upgrade|mint|burn_from|set_/i;
for (const [name, id] of Object.entries(TOKENS)) {
  say(`\n### ${name} ${id}`);
  const t = new K.Contract({ id, abi: K.utils.tokenAbi, provider });
  try {
    const [n, s, d] = await Promise.all([t.functions.name(), t.functions.symbol(), t.functions.decimals()]);
    say(`- name ${n.result?.value}, symbol ${s.result?.value}`);
    res(Number(d.result?.value) === 8, `decimals ${d.result?.value} (the prices assume 8)`);
  } catch (e) { res(false, `couldn't read name / symbol / decimals: ${String(e.message || e).slice(0, 200)}`); }
  try {
    const meta = await provider.call("contract_meta_store.get_contract_meta", { contract_id: id });
    const abi = JSON.parse(meta?.meta?.abi || "{}"); const fns = Object.keys(abi.methods || {});
    const risky = fns.filter((f) => RISKY.test(f));
    say(`- functions in its ABI: ${fns.join(", ") || "(none published)"}`);
    if (!fns.length) res(false, "no ABI published: ask the issuer whether it can pause transfers or blocklist wallets (M-5)");
    else res(risky.length === 0, risky.length ? `powers to review (M-5: can it refuse transfers to the station or the treasury?): ${risky.join(", ")}` : "no pause, blocklist, freeze or owner functions in its ABI");
  } catch (e) { res(false, `couldn't read its ABI: ${String(e.message || e).slice(0, 200)} (ask the issuer whether it can pause or blocklist)`); }
}

say("\n## 3. Resource prices");
const lim = (await provider.call("chain.get_resource_limits", {})).resource_limit_data || {};
for (const k of Object.keys(lim)) say(`- ${k}: ${lim[k]}`);
const per = (cost) => (Number(cost || 0) / 1e8);
say(`\nMana per 1 million compute units: ${per(lim.compute_bandwidth_cost) * 1e6}; per 1 KB of disk: ${per(lim.disk_storage_cost) * 1024}; per 1 KB of network: ${per(lim.network_bandwidth_cost) * 1024}.`);
say(`hard_max in the proposed settings is 3 Mana: that buys about ${Math.floor(3 / (per(lim.compute_bandwidth_cost) || 1e-12)).toLocaleString("en-US")} compute units. Compare with the measured cost of a free-checkout buy at open_cap 50 (admin/measure.mjs) and keep at least a 1.5x margin.`);

say(`\n${bad ? `**${bad} item(s) to check before launch.**` : "All checks passed."}`);
console.log(out.join("\n"));
process.exit(bad ? 2 : 0);
