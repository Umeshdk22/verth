"""A soft, original piano bed (no samples, no copyright): gentle arpeggios over D-A-Bm-G."""
import numpy as np, soundfile as sf
SR = 44100
def note(f, dur, amp=0.18):
    t = np.arange(int(SR * dur)) / SR
    env = np.exp(-t * 2.4) * (1 - np.exp(-t * 300))
    w = sum(a * np.sin(2 * np.pi * f * k * t + k) for k, a in [(1, 1), (2, .45), (3, .22), (4, .1), (5, .05)])
    w += 0.3 * np.sin(2 * np.pi * f * 1.003 * t)  # slight chorus
    return amp * env * w
def hz(n): return 440 * 2 ** ((n - 69) / 12)
chords = [[62, 66, 69, 74], [57, 61, 64, 69], [59, 62, 66, 71], [55, 59, 62, 67]]  # D A Bm G
bar = 2.6; total = 200
out = np.zeros(int(SR * total) + SR * 4)
i = 0; t = 0.0
while t < total:
    ch = chords[i % 4]
    for j, n in enumerate([ch[0] - 12] + ch + [ch[2] + 12]):
        start = int(SR * (t + j * bar / 6.5))
        s = note(hz(n), 3.2, 0.16 if j else 0.22)
        out[start:start + len(s)] += s
    pad = np.zeros(int(SR * bar))
    tt = np.arange(len(pad)) / SR
    for n in ch[:3]: pad += 0.03 * np.sin(2 * np.pi * hz(n - 12) * tt)
    pad *= np.minimum(1, np.minimum(tt / .8, (bar - tt) / .8))
    s0 = int(SR * t); out[s0:s0 + len(pad)] += pad
    t += bar; i += 1
out = out[:int(SR * total)]
out /= np.max(np.abs(out)) * 1.25
# gentle room reverb
ir = np.exp(-np.arange(int(SR * 1.2)) / SR * 4) * np.random.default_rng(1).normal(0, 1, int(SR * 1.2)) * 0.04
wet = np.convolve(out, ir)[:len(out)]
mix = out * 0.85 + wet * 0.5
mix /= np.max(np.abs(mix)) * 1.1
sf.write('music.wav', np.stack([mix, np.roll(mix, 220)], 1).astype(np.float32), SR)
print('music ok', len(mix) / SR)
