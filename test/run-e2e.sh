#!/usr/bin/env bash
# Builds the app against the in-browser Firebase stand-in and runs the two-person browser test.
set -euo pipefail
T=$(mktemp -d); OUT=${1:-test-output}
mkdir -p "$T/assets" "$OUT"
A=./test/fake-firebase.js
npx esbuild src/app.js --bundle --format=esm --target=es2020 \
  --alias:firebase/app=$A --alias:firebase/auth=$A --alias:firebase/firestore=$A --alias:firebase/app-check=$A --outfile="$T/assets/app.js"
cp app.html manifest.webmanifest sw.js "$T/"; cp assets/verth.css assets/bg-contours.webp assets/icon-192.png assets/icon-512.png assets/icon-maskable-512.png assets/apple-touch-icon.png "$T/assets/"
sed -i '/fonts.googleapis.com\/css\|preconnect/d; s/; upgrade-insecure-requests//' "$T/app.html"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$T" >/dev/null 2>&1 &
SERVER=$!; trap 'kill $SERVER' EXIT
sleep 1
node test/e2e.cjs "$OUT"
