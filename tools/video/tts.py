"""Narration for each scene: English (British male, bm_george) and Hindi (male, hm_omega), at a brisk pace."""
import json, sys, soundfile as sf, numpy as np
from pathlib import Path
from kokoro_onnx import Kokoro
VOICE = {'en': ('bm_george', 'en-gb', 1.2), 'hi': ('hm_omega', 'hi', 1.2)}
k = Kokoro('kokoro-v1.0.onnx', 'voices-v1.0.bin')
for video in sys.argv[1].split(','):
    scenes = json.load(open(f'scripts/{video}.json'))
    for lang in sys.argv[2].split(','):
        voice, code, speed = VOICE[lang]
        out = Path(f'out/{video}-{lang}'); out.mkdir(parents=True, exist_ok=True)
        dur = {}
        for i, s in enumerate(scenes):
            audio, sr = k.create(s['say'][lang], voice=voice, speed=speed, lang=code)
            # trim leading/trailing silence so scenes flow quickly
            nz = np.where(np.abs(audio) > 0.01)[0]
            if len(nz): audio = audio[max(0, nz[0] - 800): nz[-1] + 2400]
            sf.write(out / f'{i:02d}-{s["id"]}.wav', audio, sr)
            dur[s['id']] = round(len(audio) / sr, 3)
        json.dump(dur, open(out / 'durations.json', 'w'), indent=1)
        print(video, lang, round(sum(dur.values()), 1), 's', dur)
