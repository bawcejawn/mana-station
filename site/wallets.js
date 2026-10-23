// Test wallets kept in this browser (TESTNET ONLY). Each is a throwaway Koinos key stored in localStorage, so the
// playground works with no extension and no KOIN. Never use these for real funds. Needs koilib's Signer (window.Signer).
// audit-2026-10 M-11: raw keys in browser storage are acceptable only for throwaway testnet keys. On any other network
// this module holds nothing: no wallet is listed, created or loaded, so a mainnet build can't keep a key in the page.
window.MSWallets = (() => {
  const PG = window.MS_PLAYGROUND || {};
  if (!/testnet/i.test(PG.network || "") || PG.chainId === "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==") {
    const off = () => { throw new Error("Test wallets exist only on the testnet playground. Use Kondor."); };
    return { list: () => [], create: off, ensure: off, rename() {}, remove() {}, signer: () => null, disabled: true };
  }
  const KEY = "ms.testwallets.v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
  const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let mem = load();                                   // works even if storage is blocked (then lost on reload)
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  function create(name) {
    const pk = new Uint8Array(32); crypto.getRandomValues(pk);
    const s = new Signer({ privateKey: hex(pk) });
    const w = { name: name || "Test wallet " + (mem.length + 1), address: s.getAddress(), pk: hex(pk), created: Date.now() };
    mem.push(w); save(mem); return w;
  }
  return {
    list: () => mem.map(({ name, address, created }) => ({ name, address, created })),
    create,
    ensure(name) { return mem.find((w) => w.name === name) || create(name); },
    rename(address, name) { const w = mem.find((x) => x.address === address); if (w) { w.name = name; save(mem); } },
    remove(address) { mem = mem.filter((w) => w.address !== address); save(mem); },
    signer(address, provider) { const w = mem.find((x) => x.address === address); if (!w) return null; const s = new Signer({ privateKey: w.pk, provider }); return s; },
  };
})();
