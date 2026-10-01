"""Generates original background options for Verth (no stock photos, no licences needed)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import gaussian_filter
from pathlib import Path

W, H = 1920, 1200
OUT = Path(__file__).parent / "backgrounds"  # site uses 03-monsoon-dusk-skyline as assets/bg-dusk.webp
OUT.mkdir(exist_ok=True)


def rng(seed):
    return np.random.default_rng(seed)


def field(seed, sigma, h=H, w=W):
    a = gaussian_filter(rng(seed).standard_normal((h, w)), sigma)
    a -= a.min(); a /= a.max() + 1e-9
    return a


def fbm(seed, base=180, octaves=5):
    out = np.zeros((H, W)); amp = 1; tot = 0
    for o in range(octaves):
        out += amp * field(seed + o, max(1.5, base / 2 ** o)); tot += amp; amp *= 0.5
    out /= tot
    out -= out.min(); out /= out.max()
    return out


def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def vgrad(top, bottom, h=H, w=W, stops=None):
    t = np.linspace(0, 1, h)[:, None, None]
    if stops:
        cols = [hexrgb(c) for _, c in stops]; pos = [p for p, _ in stops]
        out = np.zeros((h, 1, 3))
        for i in range(3):
            out[:, 0, i] = np.interp(t[:, 0, 0], pos, [c[i] for c in cols])
        return np.repeat(out, w, axis=1)
    return np.repeat(hexrgb(top) * (1 - t) + hexrgb(bottom) * t, w, axis=1)


def grain(img, amt=6, seed=99):
    return img + rng(seed).normal(0, amt, img.shape)


def vignette(img, strength=0.55):
    y, x = np.mgrid[0:H, 0:W]
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    return img * (1 - strength * np.clip(d - 0.35, 0, 1)[..., None])


def save(img, name):
    a = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(a).save(OUT / f"{name}.webp", quality=82, method=6)
    print("wrote", name)


def stars(img, seed, n=900, maxb=200):
    r = rng(seed)
    ys, xs = r.integers(0, H, n), r.integers(0, W, n)
    b = r.random(n) ** 3 * maxb
    for y, x, v in zip(ys, xs, b):
        img[y, x] += v
        if v > maxb * 0.6:
            img[max(0, y - 1):y + 2, max(0, x - 1):x + 2] += v * 0.35
    return img


def blur_layer(draw_fn, radius):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return np.asarray(layer.filter(ImageFilter.GaussianBlur(radius)), float)


# 1. City lights at night (bokeh)
def night_city():
    img = vgrad(None, None, stops=[(0, '#070A14'), (0.55, '#0E1426'), (1, '#1A1420')])
    r = rng(1)
    pal = ['#FFB224', '#FF8A3D', '#FF5E5B', '#3DD6C3', '#F7E3A1', '#8FB8FF']
    for radius, n, a in [(26, 70, 0.55), (60, 40, 0.35), (110, 22, 0.22)]:
        def d(dr):
            for _ in range(n):
                x = r.integers(-50, W + 50); y = int(H * (0.35 + 0.65 * r.random() ** 0.7))
                s = int(radius * (0.6 + r.random()))
                c = tuple(int(v * a) for v in hexrgb(r.choice(pal)))
                dr.ellipse([x - s, y - s, x + s, y + s], fill=c)
        img += blur_layer(d, radius * 0.18)
    img += blur_layer(lambda dr: dr.ellipse([W * .1, H * .6, W * .9, H * 1.4], fill=(60, 35, 10)), 160)
    save(grain(vignette(img, 0.6), 5), "01-city-lights")


# 2. Aurora
def aurora():
    img = vgrad(None, None, stops=[(0, '#03050C'), (0.6, '#071423'), (1, '#0A1C24')])
    img = stars(img, 2, 1100, 170)
    y, x = np.mgrid[0:H, 0:W].astype(float)
    curtain = np.repeat(field(5, 9, 1, W), H, axis=0) ** 1.1 * 0.7 + 0.45
    base = np.zeros((H, W))
    for k, (yc, amp, ph, col) in enumerate([(0.42, 70, 0.0, '#3DFFB8'), (0.32, 90, 1.7, '#3DD6C3'), (0.52, 50, 3.1, '#7A6CFF')]):
        cy = H * yc + amp * np.sin(x / W * 5.2 + ph) + 120 * (field(10 + k, 120, 1, W)[0] - 0.5)
        dist = (y - cy)
        band = np.where(dist < 0, np.exp(-(dist / 220) ** 2), np.exp(-(dist / 28) ** 2))
        layer = band * curtain
        img += layer[..., None] * hexrgb(col) * 0.75
    img = gaussian_filter(img, (3, 2, 0))
    ridge = H * 0.78 + 90 * (field(21, 140, 1, W)[0] - 0.5) * 2 + 40 * (field(22, 25, 1, W)[0] - 0.5)
    mask = (y > ridge[None, :])
    img[mask] = img[mask] * 0.12 + hexrgb('#02040A') * 0.88
    save(grain(vignette(img, 0.45), 4), "02-aurora")


# 3. Monsoon dusk over an Indian city skyline
def monsoon_dusk():
    img = vgrad(None, None, stops=[(0, '#0B1030'), (0.35, '#2A1E4A'), (0.62, '#7A3B52'), (0.78, '#E07A3A'), (0.86, '#FFB45E'), (1, '#FFB45E')])
    cl = fbm(31, 240)
    clouds = np.clip((cl - 0.45) * 3, 0, 1) * np.clip(1 - np.linspace(0, 1, H) * 1.2, 0, 1)[:, None]
    img = img * (1 - 0.55 * clouds[..., None]) + clouds[..., None] * hexrgb('#3A2A50') * 0.3
    sky = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(sky)
    r = rng(3); x = 0; ground = int(H * 0.86)
    lights = []
    while x < W:
        bw = int(r.integers(40, 140)); bh = int(r.integers(60, 330))
        kind = r.random()
        col = (14, 10, 22)
        d.rectangle([x, ground - bh, x + bw, H], fill=col)
        if kind < 0.12:  # dome
            d.ellipse([x + bw * .1, ground - bh - bw * .45, x + bw * .9, ground - bh + bw * .35], fill=col)
            d.rectangle([x + bw / 2 - 2, ground - bh - bw * .65, x + bw / 2 + 2, ground - bh - bw * .4], fill=col)
        elif kind < 0.2:  # minaret
            d.rectangle([x + bw - 10, ground - bh - 120, x + bw - 2, ground - bh], fill=col)
        for wy in range(ground - bh + 12, H - 10, 18):
            for wx in range(x + 8, x + bw - 8, 14):
                if r.random() < 0.18:
                    lights.append((wx, wy))
        x += bw + int(r.integers(0, 12))
    for wx, wy in lights:
        d.rectangle([wx, wy, wx + 5, wy + 7], fill=(255, 196, 110))
    img = np.asarray(sky, float)
    glow = blur_layer(lambda dr: [dr.rectangle([wx - 2, wy - 2, wx + 7, wy + 9], fill=(120, 70, 20)) for wx, wy in lights], 6)
    save(grain(vignette(img + glow, 0.4), 5), "03-monsoon-dusk-skyline")


# 4. Cyber grid horizon
def cyber_grid():
    img = vgrad(None, None, stops=[(0, '#05060E'), (0.5, '#0B0F22'), (0.58, '#1C1230'), (1, '#05060E')])
    img = stars(img, 4, 500, 140)
    hz = int(H * 0.56)
    sun = blur_layer(lambda d: d.ellipse([W / 2 - 260, hz - 260, W / 2 + 260, hz + 260], fill=(255, 150, 40)), 90)
    sun[hz:] *= 0.2
    img += sun * 0.55
    layer = Image.new("RGB", (W, H)); d = ImageDraw.Draw(layer)
    for i in range(-30, 31):
        d.line([(W / 2 + i * 18, hz), (W / 2 + i * 260, H)], fill=(61, 214, 195), width=2)
    for k in range(1, 26):
        y = hz + (H - hz) * (k / 25) ** 2.2
        d.line([(0, y), (W, y)], fill=(61, 214, 195), width=2)
    g = np.asarray(layer, float)
    fade = np.clip((np.arange(H) - hz) / (H - hz), 0, 1)[:, None, None] ** 0.8
    g = g * fade
    img += g * 0.55 + gaussian_filter(g, (6, 6, 0)) * 1.2
    img += blur_layer(lambda d: d.rectangle([0, hz - 3, W, hz + 3], fill=(255, 178, 36)), 8) * 0.8
    save(grain(vignette(img, 0.5), 5), "04-cyber-grid")


# 5. Circuit board
def circuit():
    img = vgrad('#061016', '#0A1A1E')
    r = rng(5)
    layer = Image.new("RGB", (W, H)); d = ImageDraw.Draw(layer)
    nodes = []
    for _ in range(140):
        x, y = int(r.integers(0, W)), int(r.integers(0, H))
        pts = [(x, y)]
        for _ in range(int(r.integers(2, 6))):
            dirx, diry = [(1, 0), (0, 1), (1, 1), (1, -1), (-1, 0), (0, -1)][r.integers(0, 6)]
            L = int(r.integers(40, 220)); x += dirx * L; y += diry * L; pts.append((x, y))
        c = (61, 214, 195) if r.random() > 0.15 else (255, 178, 36)
        d.line(pts, fill=c, width=2, joint="curve")
        nodes.append((pts[-1], c)); nodes.append((pts[0], c))
    for (x, y), c in nodes:
        d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=c, width=2)
    g = np.asarray(layer, float)
    light = 0.25 + 0.75 * fbm(55, 300)[..., None]
    img += g * 0.35 * light + gaussian_filter(g, (5, 5, 0)) * 0.9 * light
    save(grain(vignette(img, 0.55), 4), "05-circuit-board")


# 6. Nebula / deep space
def nebula():
    img = np.zeros((H, W, 3)) + hexrgb('#04050B')
    a, b, c = fbm(61, 260), fbm(71, 200), fbm(81, 320)
    img += (np.clip(a - 0.45, 0, 1) ** 1.3)[..., None] * hexrgb('#7A4DFF') * 1.4
    img += (np.clip(b - 0.5, 0, 1) ** 1.3)[..., None] * hexrgb('#3DD6C3') * 1.4
    img += (np.clip(c - 0.55, 0, 1) ** 1.2)[..., None] * hexrgb('#FFB224') * 1.6
    img = stars(img, 6, 1600, 220)
    save(grain(vignette(img, 0.5), 4), "06-nebula")


# 7. Soft glass blobs (modern app look)
def glass_blobs():
    img = np.zeros((H, W, 3)) + hexrgb('#0B0E18')
    for (x, y, rr, col) in [(0.18, 0.25, 380, '#FFB224'), (0.82, 0.2, 420, '#7A4DFF'), (0.7, 0.85, 460, '#3DD6C3'), (0.25, 0.9, 320, '#FF5E5B')]:
        img += blur_layer(lambda d: d.ellipse([W * x - rr, H * y - rr, W * x + rr, H * y + rr], fill=tuple(int(v * .55) for v in hexrgb(col))), 170)
    save(grain(img, 7), "07-glass-glow")


# 8. Hexagon shield mesh
def hex_mesh():
    img = vgrad('#070B16', '#0B1222')
    layer = Image.new("RGB", (W, H)); d = ImageDraw.Draw(layer)
    s = 46; hgt = s * np.sqrt(3); r = rng(8)
    hot = Image.new("RGB", (W, H)); dh = ImageDraw.Draw(hot)
    for row in range(-1, int(H / hgt) + 2):
        for col in range(-1, int(W / (1.5 * s)) + 2):
            cx = col * 1.5 * s; cy = row * hgt + (hgt / 2 if col % 2 else 0)
            pts = [(cx + s * np.cos(np.pi / 3 * k), cy + s * np.sin(np.pi / 3 * k)) for k in range(6)]
            d.polygon(pts, outline=(61, 214, 195))
            if r.random() < 0.04:
                dh.polygon(pts, fill=(255, 178, 36) if r.random() < 0.4 else (61, 214, 195))
    g = np.asarray(layer, float); hh = np.asarray(hot, float)
    light = fbm(88, 280)[..., None]
    img += g * (0.08 + 0.4 * light) + hh * 0.18 * light + gaussian_filter(hh, (20, 20, 0)) * 0.5 * light
    save(grain(vignette(img, 0.55), 4), "08-hex-shield")


# 9. Code rain (security operations feel)
def code_rain():
    img = np.zeros((H, W, 3)) + hexrgb('#050A0C')
    layer = Image.new("RGB", (W, H)); d = ImageDraw.Draw(layer)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
    except OSError:
        f = ImageFont.load_default()
    r = rng(9); chars = "0123456789ABCDEF<>/{}=#$%@"
    for x in range(0, W, 22):
        if r.random() < 0.35: continue
        head = int(r.integers(0, H)); length = int(r.integers(8, 40))
        for k in range(length):
            y = head - k * 22
            if y < -20: break
            fade = (1 - k / length) ** 1.5
            c = (int(255 * fade), int(230 * fade), int(200 * fade)) if k == 0 else (int(61 * fade), int(214 * fade), int(195 * fade))
            d.text((x, y), r.choice(list(chars)), font=f, fill=c)
    g = np.asarray(layer, float)
    img += g * 0.55 + gaussian_filter(g, (4, 4, 0)) * 0.8
    save(grain(vignette(img, 0.6), 4), "09-code-rain")


# 10. Warm paper (light theme)
def paper():
    img = vgrad('#F7F1E3', '#EFE5CF')
    fibre = gaussian_filter(rng(10).standard_normal((H, W)), (0.6, 6))
    blot = fbm(101, 300)
    img += fibre[..., None] * 9 - (blot[..., None] - 0.5) * 18
    save(grain(img, 3), "10-paper-light")


# 11. Saffron morning (light theme)
def saffron_morning():
    img = vgrad(None, None, stops=[(0, '#FFF6E8'), (0.6, '#FDEBD3'), (1, '#F9E1C2')])
    for (x, y, rr, col) in [(0.85, 0.1, 460, '#FFC56B'), (0.1, 0.8, 420, '#9FE7DD'), (0.55, 0.55, 300, '#FFD9A0')]:
        c = hexrgb(col) - hexrgb('#FDEBD3')
        layer = blur_layer(lambda d: d.ellipse([W * x - rr, H * y - rr, W * x + rr, H * y + rr], fill=(255, 255, 255)), 200) / 255
        img += layer * c * 0.9
    save(grain(img, 3), "11-saffron-morning-light")


import sys
for fn in [globals()[n] for n in sys.argv[1:]] or [night_city, aurora, monsoon_dusk, cyber_grid, circuit, nebula, glass_blobs, hex_mesh, code_rain, paper, saffron_morning]:
    fn()
