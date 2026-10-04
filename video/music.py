# Light background music for the help videos, made from scratch (no samples, no licence issues):
# a soft electric-piano chord pad with a gentle arpeggio, in a slow I-vi-IV-V loop.
import numpy as np, sys, wave
SR = 44100
def note(f, dur, amp, attack=0.02, release=0.6, kind='ep'):
    n = int(dur * SR); t = np.arange(n) / SR
    if kind == 'ep':  # electric piano: sine + soft bell partial, decaying
        w = np.sin(2*np.pi*f*t) + 0.25*np.sin(2*np.pi*2*f*t)*np.exp(-t*3) + 0.08*np.sin(2*np.pi*3.01*f*t)*np.exp(-t*6)
        env = np.exp(-t * 1.1)
    else:  # pad: detuned sines, slow swell
        w = sum(np.sin(2*np.pi*f*d*t + p) for d, p in ((1, 0), (1.003, 1.3), (0.997, 2.1))) / 3
        env = np.ones(n)
    a = np.minimum(1, t / attack); r = np.minimum(1, (dur - t) / release).clip(0, 1)
    return w * env * a * r * amp
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def render(seconds, out):
    bpm = 84; beat = 60 / bpm; bar = 4 * beat
    chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]]  # Cmaj7 Am7 Fmaj7 G
    total = int((seconds + 2) * SR); mix = np.zeros(total)
    def add(s0, x):
        if s0 >= total: return
        e = min(total, s0 + len(x)); mix[s0:e] += x[:e - s0]
    t0, i = 0.0, 0
    while t0 < seconds + 1:
        ch = chords[i % 4]
        s = int(t0 * SR)
        for m in ch:  # pad
            add(s, note(hz(m - 12), bar + 0.8, 0.05, attack=0.9, release=1.2, kind='pad'))
        add(s, note(hz(ch[0] - 24), bar, 0.09, attack=0.05, release=0.8, kind='pad'))  # bass
        for k, m in enumerate([ch[0], ch[2], ch[1] + 12, ch[3], ch[2] + 12, ch[1] + 12, ch[3], ch[2]]):  # arpeggio, 8ths
            add(int((t0 + k * beat / 2) * SR), note(hz(m), 1.6, 0.045))
        t0 += bar; i += 1
    # simple stereo widening + room: short delays
    L = mix.copy(); R = mix.copy()
    for d, g in ((0.031, 0.25), (0.067, 0.18), (0.113, 0.12)):
        k = int(d * SR); L[k:] += mix[:-k] * g; R[int(k*1.3):] += mix[:-int(k*1.3)] * g
    st = np.stack([L, R], 1)[: int(seconds * SR)]
    fade = int(2.5 * SR); st[:fade] *= np.linspace(0, 1, fade)[:, None]; st[-fade:] *= np.linspace(1, 0, fade)[:, None]
    st /= np.abs(st).max() + 1e-9; st *= 0.9
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
if __name__ == '__main__': render(float(sys.argv[1]), sys.argv[2])
