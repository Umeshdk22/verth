"""Draws Verth's background artwork: topographic contour lines over a dark night sky,
with warm saffron and teal glows and film grain. Output: assets/bg-contours.webp"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image, ImageFilter
import sys

W, H = 2400, 1500
rng = np.random.default_rng(22)

def smooth_noise(h, w, scale, octaves=5):
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh, gw = int(h / scale * 2 ** o) + 3, int(w / scale * 2 ** o) + 3
        g = rng.normal(size=(gh, gw))
        img = Image.fromarray(((g - g.min()) / (np.ptp(g)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += amp * (np.asarray(img, dtype=float) / 255 - 0.5)
        tot += amp; amp *= 0.5
    return out / tot

field = smooth_noise(H // 2, W // 2, 260)
yy, xx = np.mgrid[0:H // 2, 0:W // 2]
# a couple of "peaks" so the lines gather like hills around the hero
for cx, cy, s, a in [(0.72, 0.38, 0.16, 0.55), (0.22, 0.78, 0.2, 0.4), (0.9, 0.9, 0.12, 0.3)]:
    field += a * np.exp(-(((xx / (W / 2) - cx) ** 2 + (yy / (H / 2) - cy) ** 2) / (2 * s * s)))

fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
fig.patch.set_facecolor("#0B0E18")
ax.set_facecolor("#0B0E18")
levels = np.linspace(field.min(), field.max(), 34)
cmap = LinearSegmentedColormap.from_list("v", ["#1B2A3A", "#23566A", "#2FB8A6", "#E8A33A"])
ax.contour(field, levels=levels, cmap=cmap, linewidths=np.linspace(0.6, 1.3, len(levels)), alpha=0.55)
ax.set_xlim(0, W // 2 - 1); ax.set_ylim(H // 2 - 1, 0)
fig.savefig("/tmp/claude-0/contours.png", facecolor=fig.get_facecolor())
plt.close(fig)

img = Image.open("/tmp/claude-0/contours.png").convert("RGB").resize((W, H), Image.LANCZOS)
a = np.asarray(img, dtype=float)
# glows
def glow(cx, cy, r, color, strength):
    d = np.sqrt((np.arange(W)[None, :] - cx * W) ** 2 + (np.arange(H)[:, None] - cy * H) ** 2)
    g = np.clip(1 - d / (r * W), 0, 1) ** 2.2 * strength
    return g[..., None] * np.array(color, dtype=float)[None, None, :]
a = a + glow(0.78, 0.25, 0.45, (255, 170, 60), 0.28) + glow(0.12, 0.85, 0.5, (40, 200, 180), 0.22)
# vignette
d = np.sqrt(((np.arange(W)[None, :] / W - 0.5) * 1.3) ** 2 + ((np.arange(H)[:, None] / H - 0.45)) ** 2)
a = a * np.clip(1.15 - d * 0.9, 0.35, 1)[..., None]
# grain
a = a + rng.normal(0, 7, size=(H, W, 1))
a = np.clip(a, 0, 255).astype(np.uint8)
out = Image.fromarray(a).filter(ImageFilter.GaussianBlur(0.35))
out.save(sys.argv[1] if len(sys.argv) > 1 else "bg-contours.webp", "WEBP", quality=72, method=6)
print("saved")
