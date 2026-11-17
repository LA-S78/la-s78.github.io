"""The Alliance Duel graphics' item pictures (owner request, 2026-11-17), cut out with the
parchment behind them made transparent: a flood fill from the crop's edges over
parchment-coloured pixels, loose specks dropped, then a soft edge. Pillow only.

    python3 cut_items.py <folder of the six day graphics> <output folder>

The day graphics are named by FILES below (as they were uploaded); ITEMS lists each day's
item boxes in the order of that day's task list (None: a task with no picture)."""
from collections import deque
from PIL import Image, ImageFilter
import json, sys

U = sys.argv[1].rstrip('/') + '/' if len(sys.argv) > 2 else './'
FILES = {'d1': '9fe47c78', 'd2': '434ee65d', 'd3': '1671b552', 'd4': '60571764', 'd5': '4233533f', 'd6': 'd29b43f7'}
# day -> [(name, box)] in the order of that day's task list
ITEMS = {
    'd1': [('falcon', (122, 212, 207, 295)), ('fruit', (120, 305, 212, 395)), ('stamina', (125, 405, 212, 492)),
           (None, None), ('heroxp', (530, 208, 612, 288)), ('gather', (522, 295, 617, 392)), ('epigraph', (523, 408, 612, 502))],
    'd2': [('caravan', (163, 298, 352, 407)), ('survivors', (163, 418, 410, 542)), ('weaponshards', (733, 278, 850, 392)),
           ('construction', (1140, 396, 1252, 466)), ('buildmight', (400, 552, 530, 672))],
    'd3': [('falcon', (145, 292, 272, 412)), ('scrolls', (728, 282, 852, 397)), ('gearchests', (163, 420, 305, 550)),
           ('research', (735, 420, 835, 535)), ('techmight', (410, 585, 525, 690))],
    'd4': [('awakening', (185, 292, 282, 398)), ('skillbadges', (726, 288, 855, 397)), ('heroshards', (176, 416, 295, 545)),
           ('heroxp', (733, 438, 840, 532)), ('recruit', (500, 553, 602, 642))],
    'd5': [('falcon', (167, 292, 275, 402)), ('train', (733, 295, 858, 470)), ('trainspeed', (172, 422, 295, 525)),
           ('researchspeed', (172, 560, 295, 668)), ('constructspeed', (722, 560, 848, 668))],
    'd6': [('caravan', (160, 458, 290, 550)), ('kill', (730, 455, 830, 548)), ('healing', (195, 560, 272, 618)),
           ('training', (728, 545, 840, 615)), ('construction', (185, 620, 285, 692)), ('research', (726, 615, 840, 695))],
}


def parchment(p):
    r, g, b = p[:3]
    return r > 175 and g > 140 and b > 95 and r >= g >= b - 6 and (r - b) < 110


def cut(img, box):
    im = img.crop(box).convert('RGBA')
    px = im.load()
    w, h = im.size
    seen = set()
    q = deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not parchment(px[x, y]):
            continue
        seen.add((x, y))
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    alpha = Image.new('L', (w, h), 255)
    ap = alpha.load()
    for x, y in seen:
        ap[x, y] = 0
    # Soften the edge a little, and drop specks the fill missed
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    # Keep the item, drop loose specks: opaque shapes under 4% of the biggest one
    ap = alpha.load()
    seen2 = set()
    shapes = []
    for sy in range(h):
        for sx in range(w):
            if ap[sx, sy] == 0 or (sx, sy) in seen2:
                continue
            shape = []
            q2 = deque([(sx, sy)])
            seen2.add((sx, sy))
            while q2:
                x, y = q2.popleft()
                shape.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen2 and ap[nx, ny]:
                        seen2.add((nx, ny))
                        q2.append((nx, ny))
            shapes.append(shape)
    biggest = max((len(sh) for sh in shapes), default=0)
    for sh in shapes:
        if len(sh) < biggest * 0.04:
            for x, y in sh:
                ap[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(alpha)
    bb = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    return im.crop(bb) if bb else im


if __name__ == '__main__':
    out = sys.argv[-1]
    sizes = {}
    for day, items in ITEMS.items():
        img = Image.open(U + FILES[day] + '-image.png').convert('RGB')
        for name, box in items:
            if not name:
                continue
            c = cut(img, box)
            # 2x the 40px display height, for sharp phones
            scale = 80 / c.height
            if scale < 1:
                c = c.resize((max(1, round(c.width * scale)), 80), Image.LANCZOS)
            fn = f'duel-{day}-{name}.webp'
            c.save(f'{out}/{fn}', quality=85, method=6)
            sizes[f'{day}-{name}'] = c.size
    json.dump(sizes, open(f'{out}/sizes.json', 'w'))
    print(sizes)
