"""Build assets/avatar/guide.png — the dithered guide avatar (run once, offline).

Source: assets/img/profile-cutout.png when present, otherwise the About-page
photo (assets/img/profile.jpg) fitted into a rounded 4:5 frame.

Pipeline (as specified): grayscale -> contrast boost -> resize to ~220px wide
-> Bayer 4x4 ordered dither -> map to two colours (ink #111010, paper
#edeae4) -> upscale 3x nearest-neighbour -> rounded mask (crisp, blocky).

The source photo is never modified. Rerunning this script only rewrites
assets/avatar/guide.png.
"""
import os

from PIL import Image, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUTOUT = os.path.join(ROOT, 'assets', 'img', 'profile-cutout.png')
SOURCE = os.path.join(ROOT, 'assets', 'img', 'profile.jpg')
OUT_DIR = os.path.join(ROOT, 'assets', 'avatar')
OUT = os.path.join(OUT_DIR, 'guide.png')

INK = (0x11, 0x10, 0x10)
PAPER = (0xED, 0xEA, 0xE4)

BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]

SMALL_W = 220          # "about 220px wide"
SCALE = 3              # nearest-neighbour upscale
RADIUS_SMALL = 16      # rounded corner radius on the small grid (48px final)


def ordered_dither(gray):
    """Bayer 4x4 ordered dither on an 'L' image -> '1'-style ink mask."""
    w, h = gray.size
    px = gray.load()
    out = Image.new('L', (w, h))
    op = out.load()
    for y in range(h):
        row = BAYER_4[y & 3]
        for x in range(w):
            threshold = (row[x & 3] + 0.5) * (255.0 / 16.0)
            # darker than the local threshold -> ink
            op[x, y] = 0 if px[x, y] < threshold else 255
    return out


def rounded_mask(size, radius):
    """Hard-edged rounded rectangle mask (no antialiasing: stays pixel-crisp)."""
    w, h = size
    m = Image.new('L', (w, h), 0)
    mp = m.load()
    r2 = radius * radius
    for y in range(h):
        dy = 0
        if y < radius:
            dy = radius - y
        elif y >= h - radius:
            dy = y - (h - 1 - radius)
        for x in range(w):
            dx = 0
            if x < radius:
                dx = radius - x
            elif x >= w - radius:
                dx = x - (w - 1 - radius)
            if dx * dx + dy * dy > r2 and (dx or dy):
                continue
            mp[x, y] = 255
    return m


def main():
    if os.path.exists(CUTOUT):
        src = Image.open(CUTOUT)
        fit_4x5 = False
    else:
        src = Image.open(SOURCE)
        fit_4x5 = True
    src = src.convert('RGB')

    # 4:5 frame — centre-crop the width (face sits in the upper half)
    if fit_4x5:
        w, h = src.size
        target_w = int(round(h * 4 / 5))
        if target_w <= w:
            left = (w - target_w) // 2
            src = src.crop((left, 0, left + target_w, h))
        else:
            target_h = int(round(w * 5 / 4))
            top = max(0, (h - target_h) // 3)   # keep the face in frame
            src = src.crop((0, top, w, top + target_h))

    small_h = int(round(SMALL_W * 5 / 4))       # 4:5
    gray = ImageOps.grayscale(src)
    gray = ImageEnhance.Contrast(gray).enhance(1.45)
    gray = gray.resize((SMALL_W, small_h), Image.LANCZOS)

    mask = ordered_dither(gray)                 # 0 = ink, 255 = paper
    small = Image.new('RGB', (SMALL_W, small_h))
    sp = small.load()
    mp = mask.load()
    for y in range(small_h):
        for x in range(SMALL_W):
            sp[x, y] = PAPER if mp[x, y] else INK

    final = small.resize((SMALL_W * SCALE, small_h * SCALE), Image.NEAREST)
    alpha = rounded_mask((SMALL_W, small_h), RADIUS_SMALL).resize(
        final.size, Image.NEAREST)
    final = final.convert('RGBA')
    final.putalpha(alpha)

    os.makedirs(OUT_DIR, exist_ok=True)
    final.save(OUT, optimize=True)
    kb = os.path.getsize(OUT) / 1024
    print('wrote %s  %dx%d  %.1f KB' % (OUT, final.size[0], final.size[1], kb))


if __name__ == '__main__':
    main()
