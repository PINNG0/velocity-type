#!/usr/bin/env python3
"""Gera as 3 capas exigidas pela CrazyGames (arte própria, só o título, sem bordas/ícones/textos extras).
Uso: python3 scripts/make_covers.py   (requer Pillow). Saída em docs/crazygames/."""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
SS = 2  # supersampling para bordas limpas

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def sky(w, h):
    img = Image.new('RGB', (w, h)); px = img.load()
    stops = [(0.0, (4, 7, 16)), (0.5, (22, 14, 62)), (0.78, (72, 28, 110)), (1.0, (120, 44, 120))]
    for y in range(h):
        t = y / h
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1: c = lerp(c0, c1, (t - t0) / (t1 - t0)); break
        for x in range(w): px[x, y] = c
    return img

def glow(base, draw_fn, radius, strength=1.0):
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(layer))
    blur = layer.filter(ImageFilter.GaussianBlur(radius))
    for _ in range(int(2 * strength) or 1): base.alpha_composite(blur)
    base.alpha_composite(layer)

def mountains(d, w, base_y, amp, color, seed, step=6):
    rnd = random.Random(seed); ph = [rnd.random() * 6.28 for _ in range(4)]
    pts = [(0, base_y)]
    for x in range(0, w + step, step):
        y = base_y - amp * (0.5 + 0.28 * math.sin(x / (w / 3.1) + ph[0]) + 0.14 * math.sin(x / (w / 7.3) + ph[1]) + 0.08 * math.sin(x / (w / 17) + ph[2]))
        pts.append((x, y))
    pts.append((w, base_y)); d.polygon(pts, fill=color)

def car(img, cx, cy, s, body, accent, flame=False):
    """Carro esportivo visto de lado, virado para a direita."""
    def draw(d):
        w, h = 300 * s, 78 * s
        x0, y0 = cx - w / 2, cy - h
        # sombra
        d.ellipse([x0 - 10 * s, cy - 6 * s, x0 + w + 10 * s, cy + 12 * s], fill=(0, 0, 0, 150))
        if flame:
            for i, (L, col) in enumerate([(120, (255, 120, 20, 200)), (80, (255, 200, 60, 230)), (45, (255, 255, 230, 255))]):
                d.polygon([(x0 + 6 * s, cy - 30 * s), (x0 - L * s, cy - 24 * s), (x0 + 6 * s, cy - 18 * s)], fill=col)
        d.polygon([(x0, cy - 26 * s), (x0 + 22 * s, cy - 46 * s), (x0 + 96 * s, cy - 52 * s), (x0 + 134 * s, cy - h + 4 * s),
                   (x0 + 214 * s, cy - h + 4 * s), (x0 + 262 * s, cy - 48 * s), (x0 + w, cy - 38 * s), (x0 + w, cy - 14 * s), (x0 + 6 * s, cy - 12 * s)], fill=body)
        d.polygon([(x0 + 146 * s, cy - h + 12 * s), (x0 + 206 * s, cy - h + 12 * s), (x0 + 244 * s, cy - 50 * s), (x0 + 116 * s, cy - 50 * s)], fill=(14, 22, 38, 255))
        d.polygon([(x0 + 150 * s, cy - h + 16 * s), (x0 + 176 * s, cy - h + 16 * s), (x0 + 160 * s, cy - 52 * s), (x0 + 128 * s, cy - 52 * s)], fill=(60, 100, 150, 140))
        d.rectangle([x0 + 20 * s, cy - 30 * s, x0 + w - 14 * s, cy - 26 * s], fill=accent)
        d.rectangle([x0 + w - 22 * s, cy - 36 * s, x0 + w, cy - 28 * s], fill=(255, 245, 190, 255))
        for wx in (x0 + 66 * s, x0 + 232 * s):
            d.ellipse([wx - 27 * s, cy - 30 * s, wx + 27 * s, cy + 24 * s], fill=(8, 10, 14, 255))
            d.ellipse([wx - 15 * s, cy - 18 * s, wx + 15 * s, cy + 12 * s], fill=(150, 165, 185, 255))
    glow(img, draw, 14 * s, 0.6)

def streaks(img, x_from, x_to, y_min, y_max, n, seed, color):
    rnd = random.Random(seed); d = ImageDraw.Draw(img)
    for _ in range(n):
        y = rnd.uniform(y_min, y_max); L = rnd.uniform(0.12, 0.4) * (x_to - x_from); x = rnd.uniform(x_from, x_to - L)
        d.line([(x, y), (x + L, y)], fill=color + (rnd.randint(40, 110),), width=max(2, int((y_max - y_min) / 90)))

def title(img, lines, x, y, size, anchor='la', spacing=1.0):
    font = ImageFont.truetype(FONT, size); w, h = img.size
    def draw(d):
        yy = y
        for line in lines:
            d.text((x, yy), line, font=font, fill=(85, 214, 255, 255), anchor=anchor); yy += size * spacing
    glow(img, draw, size * 0.12, 1.0)
    d = ImageDraw.Draw(img); yy = y
    for line in lines:
        d.text((x + size * 0.03, yy + size * 0.03), line, font=font, fill=(10, 20, 40, 255), anchor=anchor)
        d.text((x, yy), line, font=font, fill=(244, 252, 255, 255), anchor=anchor); yy += size * spacing

def cover(w, h, layout):
    W, H = w * SS, h * SS
    img = sky(W, H).convert('RGBA'); rnd = random.Random(7)
    d = ImageDraw.Draw(img)
    for _ in range(int(W * H / 14000)):
        x, y, r = rnd.randrange(W), rnd.randrange(int(H * 0.6)), rnd.choice([1, 1, 2, 3]) * SS * 0.6
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(90, 220)))
    moon_x, moon_y, moon_r = (W * 0.89, H * 0.30, H * 0.095) if layout == 'land' else (W * 0.78, H * 0.47, W * 0.10) if layout == 'port' else (W * 0.80, H * 0.36, W * 0.10)
    glow(img, lambda g: g.ellipse([moon_x - moon_r, moon_y - moon_r, moon_x + moon_r, moon_y + moon_r], fill=(255, 238, 210, 255)), moon_r * 0.5, 1.0)
    road_top = H * (0.66 if layout == 'land' else 0.70)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
    mountains(ld, W, road_top - H * 0.02, H * 0.26, (22, 16, 54, 255), 3); img.alpha_composite(layer)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
    mountains(ld, W, road_top, H * 0.14, (10, 12, 32, 255), 9); img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    d.rectangle([0, road_top, W, H], fill=(14, 20, 31, 255))
    for i in range(0, int(H - road_top), 2):  # leve gradiente do asfalto
        a = int(70 * i / max(1, H - road_top)); d.line([(0, road_top + i), (W, road_top + i)], fill=(0, 0, 0, a))
    glow(img, lambda g: g.rectangle([0, road_top - 5 * SS, W, road_top], fill=(85, 214, 255, 255)), 10 * SS, 1.0)
    band = H - road_top
    for k in (1, 2):  # faixas tracejadas
        y = road_top + band * k / 3
        for x in range(-int(W * 0.05), W, int(W * 0.07)): d.rectangle([x, y - 3 * SS, x + int(W * 0.04), y + 3 * SS], fill=(200, 225, 255, 150))
    s = (W / 1920) * (1.55 if layout == 'land' else 2.5 if layout == 'port' else 2.3)
    lane1, lane2 = road_top + band * 0.36, road_top + band * 0.74
    streaks(img, 0, W, road_top + 10, H - 10, 26, 5, (180, 230, 255))
    car(img, W * (0.36 if layout == 'land' else 0.60), lane1, s, (214, 40, 70, 255), (255, 140, 160, 255))
    car(img, W * (0.68 if layout == 'land' else 0.40), lane2, s, (30, 150, 214, 255), (140, 230, 255, 255), flame=True)
    if layout == 'land': title(img, ['VELOCITY TYPE'], W * 0.06, H * 0.10, int(H * 0.17))
    elif layout == 'port': title(img, ['VELOCITY', 'TYPE'], W * 0.5, H * 0.09, int(W * 0.17), anchor='ma', spacing=1.05)
    else: title(img, ['VELOCITY', 'TYPE'], W * 0.07, H * 0.07, int(W * 0.15), spacing=1.0)
    return img.convert('RGB').resize((w, h), Image.LANCZOS)

if __name__ == '__main__':
    for name, (w, h, lay) in {'cover-landscape-1920x1080.png': (1920, 1080, 'land'), 'cover-portrait-800x1200.png': (800, 1200, 'port'), 'cover-square-800x800.png': (800, 800, 'sq')}.items():
        cover(w, h, lay).save(f'docs/crazygames/{name}', optimize=True); print('ok', name)
