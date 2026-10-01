"""Joins recording + narration + music into a web-ready MP4: python3 assemble.py scam en"""
import json, subprocess, sys
from pathlib import Path
video, lang = sys.argv[1:3]
d = Path(f'out/{video}-{lang}')
tl = json.loads((d / 'timeline.json').read_text())
scenes = json.loads(Path(f'scripts/{video}.json').read_text())
wavs = sorted(d.glob('[0-9][0-9]-*.wav'))
total = tl['total']
inputs = ['-ss', f"{tl['offset']:.3f}", '-t', f'{total:.3f}', '-i', tl['raw']]
for w in wavs: inputs += ['-i', str(w)]
inputs += ['-stream_loop', '-1', '-i', 'music.wav']
at = {s['id']: s['at'] for s in tl['scenes']}
parts, labels = [], []
for i, (w, s) in enumerate(zip(wavs, scenes)):
    ms = int((at[s['id']] + 0.18) * 1000)
    parts.append(f'[{i+1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]')
    labels.append(f'[v{i}]')
m = len(wavs) + 1
fc = ';'.join(parts) + ';' + ''.join(labels) + f'amix=inputs={len(labels)}:normalize=0,apad,atrim=0:{total:.3f},asplit=2[voice][key];'
fc += f'[{m}:a]atrim=0:{total:.3f},volume=0.22,afade=t=in:d=1.5,afade=t=out:st={total-2.5:.3f}:d=2.5[mus];'
fc += '[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=400[duck];'
fc += '[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout];'
fc += '[0:v]fps=30,format=yuv420p,fade=t=in:d=0.4,fade=t=out:st=' + f'{total-0.6:.3f}' + ':d=0.6[vout]'
out = Path('final') / f'verth-{video}-{lang}.mp4'; out.parent.mkdir(exist_ok=True)
cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc, '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-level', '4.0', '-g', '60', '-r', '30',
       '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', '-t', f'{total:.3f}', str(out)]
subprocess.run(cmd, check=True)
# poster frame from the first scene, after the title card fades
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f"{max(2.2, at[scenes[1]['id']] - 0.5):.2f}", '-i', str(out), '-frames:v', '1', '-q:v', '4', str(out.with_suffix('.jpg'))], check=True)
print(out, round(out.stat().st_size / 1e6, 2), 'MB')
