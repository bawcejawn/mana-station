#!/usr/bin/env node
// Runs a protoc plugin with its stdin buffered through a regular file. The koinos generators read fd 0 with
// fs.readFileSync, which fails with EAGAIN when protoc hands them a non-blocking pipe (seen locally and on CI).
// Usage (installed by scripts/prebuild.cjs as node_modules/.bin/koinos-abi-proto-gen): proto-plugin-stdin.cjs <plugin.js>
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const chunks = [], buf = Buffer.alloc(65536), nap = new Int32Array(new SharedArrayBuffer(4));
for (;;) {
  let n;
  try { n = fs.readSync(0, buf, 0, buf.length, null); }
  catch (e) { if (e.code === "EAGAIN") { Atomics.wait(nap, 0, 0, 5); continue; } if (e.code === "EOF") break; throw e; }
  if (n === 0) break;
  chunks.push(Buffer.from(buf.subarray(0, n)));
}
// audit-2026-10 (Info): a fresh private directory and an exclusive create, not a predictable name in the shared tmp dir.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protoc-plugin-in-")), tmp = path.join(dir, "in");
fs.writeFileSync(tmp, Buffer.concat(chunks), { flag: "wx", mode: 0o600 });
const fd = fs.openSync(tmp, "r");
const r = spawnSync(process.execPath, [process.argv[2]], { stdio: [fd, "inherit", "inherit"], env: process.env });
fs.closeSync(fd); fs.rmSync(dir, { recursive: true, force: true });
process.exit(r.status === null ? 1 : r.status);
