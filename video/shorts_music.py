# Background music and sound effects for the Verth Shorts, made from scratch (no samples, no licences).
#   python3 video/shorts_music.py music <mood> <seconds> <turn> <out.wav>
#   python3 video/shorts_music.py sfx <events.json> <seconds> <out.wav>
# Moods: boss (calm office tension), papa (warm piano), qr (bright pop), arrest (dark thriller).
# "turn" is when the story turns from worry to relief: the music brightens there.
import json, sys, wave
import numpy as np
SR = 44100
rng = np.random.default_rng(11)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def env(n, a, r):
    t = np.arange(n) / SR; d = n / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.clip((d - t) / max(r, 1e-4), 0, 1)
def pad(f, dur, amp, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    w = sum(np.sin(2 * np.pi * f * d * t + p) for d, p in ((1, 0), (1.004, 1.1), (0.996, 2.3))) / 3
    w += bright * .25 * np.sin(2 * np.pi * f * 2.002 * t)
    return w * (1 + .12 * np.sin(2 * np.pi * .3 * t)) * env(n, min(1.0, dur / 3), min(1.2, dur / 3)) * amp
def pluck(f, dur, amp, decay=5.5):
    n = int(dur * SR); t = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9) + .2 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    return w * np.exp(-t * decay) * np.minimum(1, t / .004) * amp
def piano(f, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    w = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.6 + k * 1.2)) for k, a in ((1, 1), (2, .5), (3, .22), (4, .1)))
    return w * np.minimum(1, t / .006) * env(n, .005, .3) * amp
def bass(f, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 1.8) * env(n, .01, .1) * amp
def kick(amp, low=46):
    n = int(.35 * SR); t = np.arange(n) / SR; f = low + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * amp
def noise(dur, decay, amp, hp=6):
    n = int(dur * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
    if hp: x = x - np.convolve(x, np.ones(hp) / hp, mode='same')
    return x * np.exp(-t * decay) * amp
def clap(amp):
    x = noise(.25, 20, amp, 4); x[:int(.012 * SR)] *= 1.6; return x
def add(buf, x, at, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1] or i < 0: return
    x = x[: buf.shape[1] - i]
    buf[0, i:i + len(x)] += x * (1 - max(pan, 0)); buf[1, i:i + len(x)] += x * (1 + min(pan, 0))

MOODS = {
    # bpm, chords before the turn, chords after (MIDI notes), and which parts play
    'boss': dict(bpm=100, a=[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], b=[[48, 52, 55, 59], [55, 59, 62], [57, 60, 64], [53, 57, 60, 64]], inst='pluck'),
    'papa': dict(bpm=76, a=[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], b=[[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], inst='piano'),
    'qr': dict(bpm=122, a=[[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], b=[[60, 64, 67, 72], [57, 60, 64, 69], [65, 69, 72, 77], [67, 71, 74, 79]], inst='pop'),
    'arrest': dict(bpm=84, a=[[50, 53, 57], [50, 53, 58], [50, 53, 57], [49, 52, 57]], b=[[50, 54, 57, 62], [55, 59, 62, 67], [57, 61, 64, 69], [50, 54, 57, 62]], inst='dark'),
}
def music(mood, seconds, turn, out):
    m = MOODS[mood]; beat = 60 / m['bpm']; bar = 4 * beat
    total = int((seconds + 2) * SR); buf = np.zeros((2, total))
    nb = int(seconds / bar) + 1
    for k in range(nb):
        t0 = k * bar; after = t0 >= turn - bar * .5
        ch = (m['b'] if after else m['a'])[k % 4]
        inst = m['inst']
        # pad under everything
        for j, note in enumerate(ch):
            add(buf, pad(hz(note - 12 if inst == 'dark' else note), bar + .6, .045 if inst != 'dark' else .06, 1.2 if after else .6), t0, (j - 1) * .3)
        root = hz(ch[0] - 24)
        if inst == 'pluck':
            for s in range(8):
                note = ch[[0, 1, 2, 1, 2, 1, 0, 2][s]] + (12 if s in (3, 7) else 0)
                add(buf, pluck(hz(note), beat * .9, .07 if after else .055), t0 + s * beat / 2, .25 if s % 2 else -.25)
            add(buf, bass(root, bar * .9, .12), t0)
            for s in range(4):
                add(buf, noise(.06, 70, .02), t0 + s * beat + beat / 2, .4)
                if after: add(buf, kick(.22), t0 + s * beat)
        elif inst == 'piano':
            for s, idx in enumerate([0, 1, 2, 1] if not after else [0, 2, 1, 2, 3 if len(ch) > 3 else 1, 2]):
                step = bar / (4 if not after else 6)
                add(buf, piano(hz(ch[idx] + (12 if after and s % 3 == 2 else 0)), 2.4, .09), t0 + s * step, (s % 3 - 1) * .3)
            add(buf, piano(hz(ch[0] - 12), 3.2, .09), t0)
        elif inst == 'pop':
            for s in range(4):
                add(buf, kick(.32, 50), t0 + s * beat)
                if s in (1, 3): add(buf, clap(.12), t0 + s * beat, .1)
                add(buf, noise(.05, 80, .03), t0 + s * beat + beat / 2, -.3)
                add(buf, bass(root * (2 if s % 2 else 1), beat * .9, .14), t0 + s * beat)
            for s in range(8 if after else 4):
                step = bar / (8 if after else 4)
                add(buf, pluck(hz(ch[s % len(ch)] + 12), step * 1.5, .06, 7), t0 + s * step, .3 if s % 2 else -.3)
        else:  # dark
            if not after:
                for s in range(4):  # heartbeat
                    add(buf, kick(.3, 40), t0 + s * beat); add(buf, kick(.18, 40), t0 + s * beat + .18)
                for s in range(8): add(buf, noise(.04, 90, .025), t0 + s * beat / 2, .5 if s % 2 else -.5)  # clock tick
                add(buf, pad(hz(ch[2] + 13), bar, .018), t0, .6)  # uneasy high note
            else:
                for s, idx in enumerate([0, 1, 2, 3]):
                    add(buf, piano(hz(ch[idx] + 12), 2.6, .07), t0 + s * beat, (s - 1.5) * .2)
                add(buf, kick(.16, 44), t0)
    # swell into the turn
    if 0 < turn < seconds:
        n = int(1.4 * SR); sw = noise(1.4, 0, .03, 0) * np.linspace(0, 1, n) ** 2
        add(buf, sw, turn - 1.4)
    fade = np.clip((seconds + .5 - np.arange(total) / SR) / 2.5, 0, 1); buf *= fade
    buf /= max(1e-9, np.abs(buf).max()) / .8
    write(out, buf)

def mix(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs: out[:len(x)] += x
    return out
def sfx_sound(kind):
    if kind == 'ping':  # message arrives
        return np.concatenate([pluck(hz(88), .22, .35, 14), pluck(hz(93), .4, .35, 9)])
    if kind == 'buzz':  # phone vibrating
        n = int(.7 * SR); t = np.arange(n) / SR
        return np.sin(2 * np.pi * 150 * t) * (np.sin(2 * np.pi * 18 * t) > -.2) * ((t % .35) < .25) * .22
    if kind == 'pop':
        n = int(.12 * SR); t = np.arange(n) / SR; f = 900 * np.exp(-t * 30) + 300
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35) * .3
    if kind == 'whoosh':
        n = int(.6 * SR); x = rng.standard_normal(n); x = np.convolve(x, np.ones(30) / 30, mode='same')
        return x * np.sin(np.linspace(0, np.pi, n)) ** 2 * .9
    if kind == 'stamp':
        return mix(kick(.6, 55), noise(.2, 25, .12, 3))
    if kind == 'ding':  # cash/success chime
        return mix(pluck(hz(84), 1.2, .25, 3), pluck(hz(91), 1.2, .2, 3), pluck(hz(96), 1.4, .15, 2.5))
    if kind == 'tick':
        out = np.zeros(int(1.6 * SR))
        for k in range(4): x = noise(.03, 120, .25); i = int(k * .4 * SR); out[i:i + len(x)] += x
        return out
    if kind == 'tada':
        return np.concatenate([pluck(hz(72), .12, .3, 8), pluck(hz(76), .12, .3, 8), pluck(hz(79), .9, .3, 3)])
    if kind == 'rewind':  # tape rewinding: a fast whir that slides down, with hiss
        n = int(1.8 * SR); t = np.arange(n) / SR; f = 1400 * np.exp(-t * 1.1) + 220
        whir = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * t))
        return (whir * 0.12 + noise(1.8, 0.4, .05, 3)[:n]) * env(n, .05, .25)
    if kind == 'ring':  # phone ringing
        n = int(1.2 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 440 * t) + np.sin(2 * np.pi * 480 * t)) * ((t % .4) < .3) * env(n, .02, .2) * .12
    if kind == 'alarm':
        n = int(1.0 * SR); t = np.arange(n) / SR; f = 600 + 250 * np.sin(2 * np.pi * 2 * t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .05, .3) * .14
    return np.zeros(10)
def sfx(events_file, seconds, out):
    ev = json.load(open(events_file)); total = int((seconds + 2) * SR); buf = np.zeros((2, total))
    for e in ev: add(buf, sfx_sound(e['kind']), max(0, e['t']), 0)
    peak = np.abs(buf).max()
    if peak > .9: buf *= .9 / peak
    write(out, buf)
def write(out, buf):
    pcm = (np.clip(buf, -1, 1).T * 32767).astype(np.int16)
    with wave.open(out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

if __name__ == '__main__':
    if sys.argv[1] == 'music': music(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5])
    else: sfx(sys.argv[2], float(sys.argv[3]), sys.argv[4])
