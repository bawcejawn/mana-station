#!/bin/bash
# Publishes the website ($0) to the gh-pages branch of this repo: https://bawcejawn.github.io/mana-station/
# One-time setting on GitHub: Settings -> Pages -> Source: Deploy from a branch -> gh-pages, / (root) -> Save.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
OUT=$(mktemp -d)
node site/tools/export-site.mjs "$OUT/site" >/dev/null
git fetch -q origin gh-pages 2>/dev/null || true
WT=$(mktemp -d)
if git rev-parse -q --verify origin/gh-pages >/dev/null; then git worktree add -q "$WT" origin/gh-pages; git -C "$WT" checkout -q -B gh-pages
else git worktree add -q --detach "$WT"; git -C "$WT" checkout -q --orphan gh-pages; git -C "$WT" rm -rq . >/dev/null 2>&1 || true; fi
find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$OUT/site/." "$WT/"
git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then echo "website unchanged"; else
  git -C "$WT" -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "Publish website from $(git rev-parse --short HEAD)"
  git -C "$WT" push -q origin gh-pages; echo "published to gh-pages"; fi
git worktree remove --force "$WT"; rm -rf "$OUT"
