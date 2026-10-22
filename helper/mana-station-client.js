/* Mana Station client: ask the station "would you pay for this?" before the user signs, then pick the payer.
 * No dependencies. Works in a browser (window.ManaStation), in Node (require / import) and inside the wallet helper.
 *
 *   const pick = await ManaStation.choosePayer({ rpc, station, payee: user, operations, rcLimit });
 *   // → { payer: station, payee: user, rcLimit, route: "app_plan" }   station pays
 *   // → { payer: user, rcLimit, route: "" }                           the user's own Mana pays (as if we weren't here)
 *
 * `rpc` is a Koinos RPC URL or anything with call(method, params) (a koilib Provider). `operations` are koilib
 * operation objects ({ call_contract: { contract_id, entry_point, args } }, …), exactly what a Transaction holds.
 * The answer is a snapshot: in rare cases the station still refuses when the transaction lands, so keep a fallback
 * to the user's own Mana (helper/payer.js sendWithStation does both).
 */
(function (root) {
  "use strict";
  const WOULD_PAY = 0xda1fd8f5;            // station entry point would_pay (read-only)
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  function b58decode(s) {
    if (typeof s !== "string" || s.length > 64) throw new Error("bad base58");   // addresses are ~34 characters
    let n = 0n; for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
    const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
    for (const ch of s) { if (ch !== "1") break; out.unshift(0); }
    return Uint8Array.from(out);
  }
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function fromB64url(s) {
    s = String(s || "").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); const out = []; let buf = 0, bits = 0;
    for (const ch of s) { const v = B64.indexOf(ch); if (v < 0) throw new Error("bad base64"); buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); } }
    return Uint8Array.from(out);
  }
  function toB64url(b) {
    let s = "", i = 0;
    for (; i + 2 < b.length; i += 3) { const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    if (b.length - i === 1) { const n = b[i] << 16; s += B64[n >> 18] + B64[(n >> 12) & 63]; }
    else if (b.length - i === 2) { const n = (b[i] << 16) | (b[i + 1] << 8); s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]; }
    return s;
  }
  // koilib / Kondor JSON carries bytes as base64url strings (never hex).
  const bytesOf = (v) => (v instanceof Uint8Array ? v : typeof v === "string" ? fromB64url(v) : Uint8Array.from(v || []));
  const addr = (v) => (v instanceof Uint8Array ? v : b58decode(String(v)));

  // protobuf writer (only what would_pay_arguments needs)
  function varint(n) { n = BigInt(n); if (n < 0n) throw new Error("negative"); const out = []; do { let b = Number(n & 127n); n >>= 7n; if (n > 0n) b |= 128; out.push(b); } while (n > 0n); return out; }
  const key = (field, wire) => varint((field << 3) | wire);
  const lenField = (field, bytes) => [...key(field, 2), ...varint(bytes.length), ...bytes];
  function opInfo(op) {
    const out = [];
    if (op.call_contract) {
      const c = op.call_contract;
      if (!Number.isInteger(c.entry_point) || c.entry_point < 0 || c.entry_point > 0xffffffff) throw new Error("bad entry point");
      out.push(...lenField(1, addr(c.contract_id)), ...key(2, 0), ...varint(c.entry_point));
      const a = bytesOf(c.args); if (a.length) out.push(...lenField(3, a));
    } else if (op.upload_contract) { out.push(...lenField(1, addr(op.upload_contract.contract_id)), ...key(4, 0), 1); }
    else out.push(...key(5, 0), 1);
    return out;
  }
  function encodeArgs(payee, operations, rcLimit) {
    const out = [...lenField(1, addr(payee))];
    for (const op of operations) out.push(...lenField(2, opInfo(op)));
    out.push(...key(3, 0), ...varint(rcLimit));
    return Uint8Array.from(out);
  }
  function decodeResult(b) {           // would_pay_result { bool pay = 1; string route = 2; }
    const r = { pay: false, route: "" }; let i = 0;
    const rv = () => { let n = 0, s = 0, x; do { x = b[i++]; n += (x & 127) * 2 ** s; s += 7; } while (x & 128); return n; };
    while (i < b.length) {
      const k = rv(), f = k >> 3, w = k & 7;
      if (w === 0) { const v = rv(); if (f === 1) r.pay = v !== 0; }
      else if (w === 2) { const n = rv(); if (f === 2) r.route = new TextDecoder().decode(b.slice(i, i + n)); i += n; }
      else break;
    }
    return r;
  }
  async function call(rpc, method, params) {
    if (rpc && typeof rpc.call === "function") return rpc.call(method, params);
    // AB-016: never wait on a node for more than 5 s (a hung request used to lock the helper off on that tab).
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
    const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal });
    const j = await res.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result;
  }

  /** Would the station pay? → { pay, route } ; { pay: false, unknown: true } if it can't be asked (old station, network). */
  async function wouldPay({ rpc, station, payee, operations, rcLimit }) {
    try {
      const r = await call(rpc, "chain.read_contract", { contract_id: station, entry_point: WOULD_PAY, args: toB64url(encodeArgs(payee, operations, rcLimit)) });
      return decodeResult(fromB64url((r && r.result) || ""));
    } catch (e) { return { pay: false, unknown: true, error: String((e && e.message) || e) }; }
  }
  /** Pick the payer. maxRc caps the limit offered to the station (its per-transaction maximum). */
  async function choosePayer({ rpc, station, payee, operations, rcLimit, maxRc }) {
    let rc = BigInt(rcLimit && String(rcLimit) !== "0" ? rcLimit : 50000000); if (maxRc && rc > BigInt(maxRc)) rc = BigInt(maxRc);
    const w = await wouldPay({ rpc, station, payee, operations, rcLimit: rc });
    if (w.pay) return { payer: station, payee, rcLimit: String(rc), route: w.route };
    return { payer: payee, rcLimit: String(rcLimit || rc), route: "", unknown: !!w.unknown };
  }

  const api = { wouldPay, choosePayer, encodeArgs, decodeResult, b58decode, toB64url, fromB64url, WOULD_PAY };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ManaStation = api;
})(typeof window !== "undefined" ? window : globalThis);
