# Music for the Verth promo video, made from scratch (no samples, no licence issues):
# a calm, modern track at 104 BPM with a warm pad, a plucked arpeggio, a soft beat that enters
# after the intro, a gentle lift before the ending and a clean final chord.
#   python3 video/promo_music.py <seconds> <out.wav>
import numpy as np, sys, wave
SR = 44100
rng = np.random.default_rng(7)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def env_ar(n, attack, release, dur):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.clip((dur - t) / max(release, 1e-4), 0, 1)
def pad(f, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    w = sum(np.sin(2 * np.pi * f * d * t + p) for d, p in ((1, 0), (1.004, 1.1), (0.996, 2.3), (2.001, .4)))
    w = w / 4 * (1 + .15 * np.sin(2 * np.pi * .25 * t))
    return w * env_ar(n, 1.2, 1.4, dur) * amp
def pluck(f, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9) + .2 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    return w * np.exp(-t * 5.5) * np.minimum(1, t / .004) * amp
def bass(f, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t)
    return w * np.exp(-t * 1.6) * env_ar(n, .01, .12, dur) * amp
def kick(amp):
    n = int(.35 * SR); t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * amp
def hat(amp):
    n = int(.06 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - np.convolve(noise, np.ones(6) / 6, mode='same')  # brighter
    return noise * np.exp(-t * 70) * amp
def snap(amp):
    n = int(.18 * SR); t = np.arange(n) / SR
    return (rng.standard_normal(n) * np.exp(-t * 26) * .7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)) * amp
def render(seconds, out):
    bpm = 104; beat = 60 / bpm; bar = 4 * beat
    prog = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]  # Am7 Fmaj7 Cmaj7 G7(sus-ish)
    total = int((seconds + 3) * SR); L = np.zeros(total); R = np.zeros(total)
    def add(t0, x, pan=0.0):
        s = int(t0 * SR)
        if s >= total: return
        e = min(total, s + len(x)); x = x[:e - s]
        L[s:e] += x * (1 - pan) ; R[s:e] += x * (1 + pan)
    end = seconds - 2.2            # the last chord rings from here
    bars = int(end / bar) + 1
    for b in range(bars):
        t0 = b * bar
        if t0 >= end: break
        ch = prog[b % 4]
        for k, m in enumerate(ch): add(t0, pad(hz(m), bar + 1.2, .045), pan=(k - 1.5) * .25)
        add(t0, bass(hz(ch[0] - 24), bar * .5, .16)); add(t0 + bar * .5, bass(hz(ch[0] - 24), bar * .5, .13))
        arp = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 24, ch[3] + 12, ch[1] + 12, ch[2] + 12]
        for k, m in enumerate(arp):
            add(t0 + k * beat / 2, pluck(hz(m), beat * 1.5, .085 if b else .06), pan=(-.35 if k % 2 else .35))
        if b >= 1:  # the beat comes in after the first bar
            for q in range(4):
                add(t0 + q * beat, kick(.42 if q % 2 == 0 else .3))
                add(t0 + q * beat + beat / 2, hat(.05), pan=.3)
                if q % 2: add(t0 + q * beat, snap(.13))
    # gentle lift (rising noise) into the ending, then one clean chord
    rise_n = int(1.6 * SR); t = np.arange(rise_n) / SR
    add(end - 1.6, rng.standard_normal(rise_n) * (t / 1.6) ** 2 * .05)
    for k, m in enumerate([57, 64, 69, 72, 76]): add(end, pluck(hz(m), 3.5, .1), pan=(k - 2) * .2); add(end, pad(hz(m - 12), 3.2, .04), pan=(k - 2) * .2)
    mix = np.stack([L, R], 1)[:int(seconds * SR)]
    fade = int(.6 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]; mix[:int(.3 * SR)] *= np.linspace(0, 1, int(.3 * SR))[:, None]
    mix /= np.max(np.abs(mix)) + 1e-9; mix *= .89
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype('<i2').tobytes())
if __name__ == '__main__':
    render(float(sys.argv[1]), sys.argv[2])
