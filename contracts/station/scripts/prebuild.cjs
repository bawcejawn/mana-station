// The contract builder writes into these folders but does not create them.
const fs = require("fs"), path = require("path");
for (const d of ["abi", "build/release", "build/debug", "build/sim"]) fs.mkdirSync(d, { recursive: true }); // sim: the test build (AB-007)
// Route the koinos protoc plugins through scripts/proto-plugin-stdin.cjs: each reads protoc's pipe with readFileSync,
// which intermittently fails with EAGAIN (seen locally and on CI).
const wrap = path.resolve("scripts/proto-plugin-stdin.cjs");
for (const [name, lib] of [["koinos-abi-proto-gen", "@koinos/abi-proto-gen/lib/index.js"], ["as-proto-gen", "@koinos/as-proto-gen/lib/index.js"], ["koinos-as-gen", "@koinos/as-gen/lib/index.js"]]) {
  const bin = path.resolve("node_modules/.bin", name), real = path.resolve("node_modules", lib);
  if (!fs.existsSync(real)) continue;
  const body = `#!/bin/sh\nexec node "${wrap}" "${real}"\n`;
  let cur = ""; try { cur = fs.readFileSync(bin, "utf8"); } catch {}
  if (cur !== body) { try { fs.unlinkSync(bin); } catch {} fs.writeFileSync(bin, body, { mode: 0o755 }); }
}
// audit-2026-10 O1-06: install the pinned, checksum-verified protoc before the builder asks for it.
require("child_process").execFileSync(process.execPath, [path.resolve("scripts/protoc-pin.cjs")], { stdio: "inherit" });
