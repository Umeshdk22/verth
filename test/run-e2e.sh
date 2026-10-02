#!/usr/bin/env bash
# Builds the app against the in-browser Firebase stand-in and runs the two-person browser test.
set -euo pipefail
T=$(mktemp -d); OUT=${1:-test-output}
mkdir -p "$T/assets" "$OUT"
A=./test/fake-firebase.js
npx esbuild src/app.js --bundle --format=esm --target=es2020 \
  --alias:firebase/app=$A --alias:firebase/auth=$A --alias:firebase/firestore=$A --alias:firebase/app-check=$A --alias:firebase/ai=$A --alias:re2js=./src/shims/re2js.js --outfile="$T/assets/app.js"
cp app.html manifest.webmanifest sw.js "$T/"; cp -r assets/ocr assets/fonts assets/fonts.css assets/slides "$T/assets/"; cp assets/verth.css assets/bg-dusk.webp assets/icon-192.png assets/icon-512.png assets/icon-maskable-512.png assets/apple-touch-icon.png "$T/assets/"
sed -i '/fonts.googleapis.com\/css\|preconnect/d; s/; upgrade-insecure-requests//; s#https://verth-pay.umeshdk22.workers.dev#https://pay.test.workers.dev#' "$T/app.html"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$T" >/dev/null 2>&1 &
SERVER=$!; trap 'kill $SERVER' EXIT
sleep 1
node test/e2e.cjs "$OUT"
