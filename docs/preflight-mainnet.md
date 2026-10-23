# Mana Station mainnet preflight

Node https://api.koinos.io, chain EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==, head block 40460286 (2026-10-23T18:52:59.130Z).

## 1. get_contract_metadata (system call 112)
- OK: answers on mainnet (KOIN's code hash 0x1220eb38ea471cf855ff4d336e51bf47df8cfc8a0a9ae49193b0d7e103b890d464d6)

## 2. Stablecoins

### vUSDT 12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh
- name Vortex Tether USD, symbol vUSDT
- OK: decimals 8 (the prices assume 8)
- functions in its ABI: name, symbol, decimals, get_info, total_supply, balance_of, transfer, mint, burn, approve, allowance
- **CHECK**: powers to review (M-5: can it refuse transfers to the station or the treasury?): mint

### vUSDC 1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj
- name Vortex USD Coin, symbol vUSDC
- OK: decimals 8 (the prices assume 8)
- functions in its ABI: name, symbol, decimals, get_info, total_supply, balance_of, transfer, mint, burn, approve, allowance
- **CHECK**: powers to review (M-5: can it refuse transfers to the station or the treasury?): mint

## 3. Resource prices
- disk_storage_limit: 524288
- disk_storage_cost: 61414
- network_bandwidth_limit: 1048576
- network_bandwidth_cost: 9292
- compute_bandwidth_limit: 287500000
- compute_bandwidth_cost: 47

Mana per 1 million compute units: 0.47; per 1 KB of disk: 0.62887936; per 1 KB of network: 0.09515008.
hard_max in the proposed settings is 3 Mana: that buys about 6,382,978 compute units. Compare with the measured cost of a free-checkout buy at open_cap 50 (admin/measure.mjs) and keep at least a 1.5x margin.

**2 item(s) to check before launch.**


## Reading (2026-10-23)

- Call 112 is on mainnet: app plans in the reserved slots will work (K1-04 / A1-10 closed).
- vUSDT and vUSDC use 8 decimals: the prices are right (O1-09 closed).
- Neither token's published ABI has a pause, freeze or blocklist function. The flag is only for `mint`, which issues
  new tokens and can't refuse a transfer to the station or the treasury. Carl knows of no such powers either. The
  owed-and-claim design (M-5) covers a token that refuses one transfer anyway.
- Run from the testnet CI workflow (playground = `preflight-mainnet`, no keys). Repeat right before launch.
