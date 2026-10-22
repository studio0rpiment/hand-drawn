#!/bin/sh
# Build Hand Drawn and deploy it to Vercel (handdrawn.orpiment.studio) from this
# Mac, so the licensed fonts in public/fonts, which git ignores, go up too.
# The build goes outside ~/__DEV: pCloud syncs that folder and renames files
# rebuilt under it "[conflicted]".
set -e
cd "$(dirname "$0")/.."
out="${TMPDIR:-/tmp}/hand-drawn-deploy"
rm -rf "$out"
mkdir -p "$out"
npx tsc --noEmit -p .
npx vite build --outDir "$out" --emptyOutDir
# Licensed and unused: never published.
rm -f "$out/fonts/NaNSuccessTitling-Variable.woff2"
cp vercel.json "$out/"
cd "$out"
vercel link --yes --project hand-drawn --scope kevin-pattons-projects
vercel deploy --prod --yes --scope kevin-pattons-projects
