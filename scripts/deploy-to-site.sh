#!/usr/bin/env bash
# Build the deck and sync it into the RectifiedFlow.github.io repo at
# slides/signed-rf/ (served at https://rectifiedflow.github.io/slides/signed-rf/).
#
# Usage: ./scripts/deploy-to-site.sh [path-to-RectifiedFlow.github.io-clone]
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_REPO=${1:-../RectifiedFlow.github.io}
[ -d "$SITE_REPO/.git" ] || { echo "site repo not found at $SITE_REPO"; exit 1; }

npx slidev build slides.md --base /slides/signed-rf/ --out dist-site
rm -rf "$SITE_REPO/slides/signed-rf"
mkdir -p "$SITE_REPO/slides"
cp -R dist-site "$SITE_REPO/slides/signed-rf"
rm -f "$SITE_REPO/slides/signed-rf/_redirects"   # Netlify-only; Jekyll drops _files anyway

cd "$SITE_REPO"
git add slides/signed-rf
git commit -m "Update Signed RF slides"
git push
echo "deployed: https://rectifiedflow.github.io/slides/signed-rf/"
