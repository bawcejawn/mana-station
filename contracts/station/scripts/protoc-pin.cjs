// audit-2026-10 O1-06: protoc pinned by version AND checksum. @roamin/protoc reads config.protocVersion from package.json
// (36.2) and uses an already installed copy; this script installs that copy first, from the official GitHub release,
// and refuses any archive whose sha256 isn't the one below. Without it, protoc was "the latest release", unchecked.
// The checksums were taken from the release assets of protocolbuffers/protobuf v36.2 (compare with the sha256 GitHub
// shows next to each asset on https://github.com/protocolbuffers/protobuf/releases/tag/v36.2).
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const VERSION = require("../package.json").config.protocVersion;
const SHA256 = {
  "protoc-36.2-linux-x86_64": "121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278",
  "protoc-36.2-linux-aarch_64": "8b8f18bd2b30346efbc698dd5a73dd7c805f3ef8380f6dfc95c768f3f1852f6a",
  "protoc-36.2-osx-aarch_64": "9cd98a532c5c5e0c4161314de0225de27e4c8a323917b6ea7b1b714d3ae23466",
  "protoc-36.2-osx-x86_64": "228cc7add4616cc14ca5e80dee83209d44449a7aee95a914ae748fa374efb078",
  "protoc-36.2-win64": "f0c128dc0d8492eceece83bb459a4c0e316764b929ffbf1aa416357fd644edd3",
};
const util = require("@roamin/protoc/util");
const name = util.makeReleaseName({ platform: os.platform(), arch: os.arch(), version: VERSION });
const want = SHA256[name];
if (!want) { console.error(`protoc-pin: no pinned checksum for ${name}; add it to scripts/protoc-pin.cjs`); process.exit(1); }
const dir = path.join(util.standardInstallDirectory, name), mark = path.join(dir, ".sha256");
if (fs.existsSync(mark) && fs.readFileSync(mark, "utf8").trim() === want) process.exit(0);   // already installed and checked
(async () => {
  const src = process.env.PROTOC_ZIP;                                   // optional: a zip you downloaded yourself
  const buf = src ? fs.readFileSync(src) : Buffer.from(await (await fetch(`https://github.com/protocolbuffers/protobuf/releases/download/v${VERSION}/${name}.zip`)).arrayBuffer());
  const got = crypto.createHash("sha256").update(buf).digest("hex");
  if (got !== want) { console.error(`protoc-pin: ${name}.zip sha256 ${got} is not the pinned ${want}: refusing it`); process.exit(1); }
  fs.rmSync(dir, { recursive: true, force: true });
  util.unzip(buf, (data, header) => {
    const f = path.join(dir, header.filename);
    if (!f.startsWith(dir + path.sep)) throw new Error("protoc-pin: unsafe path in archive: " + header.filename);
    util.mkDirRecursive(path.dirname(f)); fs.writeFileSync(f, data, { mode: header.filename.includes("bin/") ? 0o755 : 0o644 });
  });
  fs.writeFileSync(mark, want + "\n");
  console.log(`protoc-pin: installed ${name} (sha256 ${want})`);
})().catch((e) => { console.error("protoc-pin: " + (e && e.message ? e.message : e)); process.exit(1); });
