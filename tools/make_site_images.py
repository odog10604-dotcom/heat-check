"""Draw the site's icons and social share image into site/.

    python3 tools/make_site_images.py

These are PLACEHOLDERS in the game's own style (a flaming basketball), so the site has a real favicon, home-screen
icon and link preview from day one. Replace them with final art by overwriting the files in site/ at the same sizes.

Only this tool needs Pillow (`pip install pillow`). The game and build.py do not: the PNGs are committed.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'site'
INK, GOLD, HOT, RED, BALL = (43, 30, 58), (255, 210, 63), (255, 122, 26), (255, 59, 47), (255, 138, 31)
BG_TOP, BG_BOTTOM = (70, 46, 96), (43, 30, 58)
FONTS = ['/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf', '/Library/Fonts/Arial Rounded Bold.ttf']
SS = 4   # supersampling: draw big, shrink for smooth edges

FLAME = [(-.36, .20), (-.43, -.05), (-.31, -.30), (-.25, -.13), (-.12, -.50), (-.03, -.29), (.08, -.62),
         (.21, -.27), (.31, -.40), (.43, -.05), (.36, .20), (0, .40)]


def gradient(w, h):
    img = Image.new('RGB', (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        px.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return img


def mark(img, cx, cy, u):
    """The flaming basketball, centred on (cx, cy); `u` is the size of one unit (the mark is about 1 unit across)."""
    d = ImageDraw.Draw(img)

    def pts(scale, dy=0):
        return [(cx + x * scale * u, cy + (y * scale + dy) * u) for x, y in FLAME]
    lw = max(2, round(u * .045))
    outer = pts(1)
    d.polygon(outer, fill=RED)
    d.line(outer + outer[:2], fill=INK, width=lw, joint='curve')
    d.polygon(pts(.74, .06), fill=HOT)
    d.polygon(pts(.5, .12), fill=GOLD)
    r, by = .29 * u, cy + .13 * u
    box = [cx - r, by - r, cx + r, by + r]
    d.ellipse(box, fill=BALL, outline=INK, width=lw)
    # seams are drawn on their own layer and clipped to the ball, so the curved ones can't poke outside it
    sw, size = max(2, round(u * .03)), img.size
    seams, clip = Image.new('RGBA', size, (0, 0, 0, 0)), Image.new('L', size, 0)
    s = ImageDraw.Draw(seams)
    s.line([(cx, by - r), (cx, by + r)], fill=INK, width=sw)
    s.line([(cx - r, by), (cx + r, by)], fill=INK, width=sw)
    s.ellipse([cx - r * 1.9, by - r * 1.15, cx - r * .5, by + r * 1.15], outline=INK, width=sw)
    s.ellipse([cx + r * .5, by - r * 1.15, cx + r * 1.9, by + r * 1.15], outline=INK, width=sw)
    ImageDraw.Draw(clip).ellipse(box, fill=255)
    img.paste(seams, (0, 0), Image.composite(seams.getchannel('A'), Image.new('L', size, 0), clip))
    ImageDraw.Draw(img).ellipse(box, outline=INK, width=lw)


def icon(size, scale, rounded=False):
    s = size * SS
    img = gradient(s, s)
    mark(img, s / 2, s * .52, s * scale)
    img = img.resize((size, size), Image.LANCZOS)
    if rounded:   # browser tabs show the favicon as-is, so give it its own rounded corners
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * .22, fill=255)
        img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


def font(px):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, px)
    raise SystemExit('make_site_images.py: needs the "Arial Rounded Bold" font (macOS) for the share image')


def share_image(w=1200, h=630):
    W, H = w * 2, h * 2
    img = gradient(W, H)
    mark(img, W * .835, H * .47, H * .6)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    big = font(round(H * .225))
    for text, x, y, fill in (('HEAT', .07, .13, GOLD), ('CHECK!', .10, .37, HOT)):
        d.text((W * x + 10, H * y + 16), text, font=big, fill=INK, stroke_width=22, stroke_fill=INK)   # drop shadow
        d.text((W * x, H * y), text, font=big, fill=fill, stroke_width=20, stroke_fill=INK)
    layer = layer.rotate(4, resample=Image.BICUBIC, center=(W * .3, H * .4))
    img.paste(layer, (0, 0), layer)
    d = ImageDraw.Draw(img)
    d.text((W * .075, H * .77), '25 shots. No aiming. No excuses.', font=font(round(H * .072)), fill=(255, 255, 255),
           stroke_width=6, stroke_fill=INK)
    return img.resize((w, h), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    icon(512, .86).save(OUT / 'icon-512.png', optimize=True)
    icon(192, .86).save(OUT / 'icon-192.png', optimize=True)
    icon(512, .62).save(OUT / 'icon-maskable-512.png', optimize=True)   # art inside the centre 80%: any mask shape is safe
    icon(180, .80).save(OUT / 'apple-touch-icon.png', optimize=True)
    icon(96, .92, rounded=True).save(OUT / 'favicon.png', optimize=True)
    icon(64, .92, rounded=True).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    share_image().save(OUT / 'share.png', optimize=True)
    for p in sorted(OUT.iterdir()):
        print(f'{p.name:26} {p.stat().st_size / 1024:6.1f} KB')


if __name__ == '__main__':
    main()
