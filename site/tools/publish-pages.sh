#!/bin/bash
# Publishes the website ($0) to the gh-pages branch of this repo: https://bawcejawn.github.io/mana-station/
# One-time setting on GitHub: Settings -> Pages -> Source: Deploy from a branch -> gh-pages, / (root) -> Save.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# audit-2026-10 W1-06: publish only what is committed. Rebuild first, then refuse if anything under site/ differs from the
# commit (an edited, untracked or stale file would otherwise be pushed to the public site).
node site/tools/make-site-data.mjs >/dev/null && node site/tools/build-pages.mjs >/dev/null
if [ -n "$(git status --porcelain -- site)" ]; then
  echo "site/ has changes that aren't committed (or the build changed files): commit them first."; git status --short -- site; exit 1
fi
OUT=$(mktemp -d)
node site/tools/export-site.mjs "$OUT/site" >/dev/null
git fetch -q origin +refs/heads/gh-pages:refs/remotes/origin/gh-pages 2>/dev/null || true
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
