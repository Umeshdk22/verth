# Demo videos

Makes the four demo videos on the home page (Scam check and For organisations, in English and Hindi).

1. `scripts/scam.json`, `scripts/org.json`: what each scene says (voice + subtitles), in English and Hindi.
2. `tts.py`: narration with Kokoro TTS: English `bm_george` (British male) at 1.2×, Hindi `hm_omega` at 1.2×.
3. `build_site.sh`: builds a local copy of the app with the in-browser Firebase stand-in; `stage.html` lays out the subtitles and phones (1600×900).
4. `record.cjs`: drives the app with Playwright, scene by scene, timed to the narration, with tap ripples.
5. `music.py`: an original soft piano bed (no samples). `assemble.py`: joins video + voice + music, ducks the music under the voice, loudness-normalises, and encodes H.264 30 fps with `+faststart` so it starts playing instantly on the web.

Needs: `kokoro-v1.0.onnx` and `voices-v1.0.bin` from github.com/thewh1teagle/kokoro-onnx releases, ffmpeg, Playwright Chromium, and the fonts from `@fontsource` (Rozha One, Hind incl. Devanagari, Kalam, IBM Plex Mono) under `site/fs/`.
