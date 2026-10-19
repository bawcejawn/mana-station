// Stablecoin addresses. MAINNET values; this file is committed with them and must stay so.
// scripts/build-testnet.cjs swaps VUSDT for a worthless testnet mock token ONLY while producing build/testnet/,
// then restores this file. scripts/check-mainnet.cjs verifies the mainnet wasm carries these exact addresses.
export const VUSDT = "12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh";   // primary, 8 decimals, Vortex-bridged
export const VUSDC = "1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj";   // optional, 8 decimals, Vortex-bridged
export const NETWORK = "mainnet";
