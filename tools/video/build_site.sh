#!/usr/bin/env bash
# Builds a local copy of Verth for recording videos: fake Firebase, framing allowed, local fonts.
set -euo pipefail
V=/home/claude/verth; M=/home/claude/media; S=$M/site
A=$V/test/fake-firebase.js
cd $V
npx esbuild src/app.js --bundle --format=esm --target=es2020 --define:__TEST_ALLOW_FRAME__=true \
  --alias:firebase/app=$A --alias:firebase/auth=$A --alias:firebase/firestore=$A --alias:firebase/app-check=$A --alias:firebase/ai=$A \
  --outfile=$S/assets/app.js --log-level=warning
cp -r assets/verth.css assets/bg-dusk.webp assets/icon-192.png assets/ocr $S/assets/
cp app.html manifest.webmanifest $S/
mkdir -p $S/fixtures && cp test/fixtures/*.png $S/fixtures/
# local fonts instead of Google Fonts; no CSP upgrade in local http
sed -i '/fonts.googleapis.com\/css\|preconnect/d; s/; upgrade-insecure-requests//; s/font-src https:\/\/fonts.gstatic.com/font-src '"'"'self'"'"'/' $S/app.html
sed -i 's#<link rel="stylesheet" href="assets/verth.css">#<link rel="stylesheet" href="fonts.css">\n<link rel="stylesheet" href="assets/verth.css">#' $S/app.html
echo built
