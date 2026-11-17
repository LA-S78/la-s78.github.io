"""Cuts game screenshots out of the owner's annotated guide sheets (owner request, 2026-11-17),
removing the annotations that touch them (black arrows and handwriting, red arrows) by colour
and connected shape instead of a straight crop: red arrows and the outline around them, long
ink strokes, arrowheads a crop split from their line, handwriting cut by the edge, and loose
specks. Needs only Pillow. Used for the Crystal Cluster Valley guide's skill tree and
Victory pictures; the helpers (components, grow_erase, is_ink, is_red) suit other sheets
drawn the same way, with crop boxes and rules adjusted per picture: check the result."""
from collections import deque
from PIL import Image

import sys

# The owner's two Crystal Cluster Valley sheets: python3 clean_annotations.py <skill tree sheet> <late method sheet>
SHEETS = sys.argv[1:3]
WHITE = (255, 255, 255)


def is_white(p):
    return min(p) > 232


def is_ink(p):
    """Black/grey annotation ink: no colour, not white."""
    return max(p) - min(p) < 28 and max(p) < 225


def is_red(p):
    r, g, b = p
    return r > 150 and r - g > 90 and r - b > 70 and g < 135


def is_blue(p):
    r, g, b = p
    return b - r > 35


def components(px, w, h, pred):
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not pred(px[x, y]):
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            comp = []
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1),
                               (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and pred(px[nx, ny]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            out.append(comp)
    return out


def bbox(comp):
    xs = [p[0] for p in comp]
    ys = [p[1] for p in comp]
    return min(xs), min(ys), max(xs), max(ys)


def grow_erase(px, w, h, seeds, radius, pred):
    """Erase pixels matching pred within `radius` of the seed pixels (arrow outlines)."""
    frontier = set(seeds)
    for _ in range(radius):
        nxt = set()
        for x, y in frontier:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seeds and pred(px[nx, ny]):
                        nxt.add((nx, ny))
        for p in nxt:
            px[p] = WHITE
        seeds = seeds | nxt
        frontier = nxt


def clean_tree():
    A = Image.open(SHEETS[0]).convert('RGB')
    im = A.crop((400, 222, 668, 665))
    px = im.load()
    w, h = im.size
    # The arrows are long thin strokes of ink; the icons' own dark text (WIN/LOSE) is small
    for comp in components(px, w, h, is_ink):
        x0, y0, x1, y1 = bbox(comp)
        if (x1 - x0 >= 22 or y1 - y0 >= 22) and not (x0 > 110 and x1 < 160):
            for p in comp:
                px[p] = WHITE
    # Arrowheads the crop split from their lines: any ink shape in the side margins
    for comp in components(px, w, h, is_ink):
        x0, y0, x1, y1 = bbox(comp)
        if x1 < 34 or x0 > w - 34:
            for p in comp:
                px[p] = WHITE
    # Pale anti-aliasing left along where the strokes were
    grey = lambda p: max(p) - min(p) < 22 and 150 <= max(p) <= 232
    for comp in components(px, w, h, grey):
        x0, y0, x1, y1 = bbox(comp)
        if x1 - x0 >= 12 and (x0 < 30 or x1 > w - 30):
            for p in comp:
                px[p] = WHITE
    return im


def clean_victory():
    B = Image.open(SHEETS[1]).convert('RGB')
    im = B.crop((474, 116, 688, 318))
    px = im.load()
    w, h = im.size
    reds = set()
    for comp in components(px, w, h, is_red):
        if len(comp) > 25:
            reds.update(comp)
    for p in reds:
        px[p] = WHITE
    # The arrows' black outline and anti-aliasing around the red fill
    grow_erase(px, w, h, reds, 7, lambda p: is_ink(p) or (max(p) - min(p) < 60 and min(p) > 120 and not is_white(p)))
    # Whatever is left of the arrows (anti-aliased outline, pink edges): anything that isn't
    # white, blue (crystals) or the screenshot's own colours, joined to where an arrow was
    leftover = lambda p: not is_white(p) and not is_blue(p) and (is_ink(p) or (p[0] - p[2] > 25 and p[0] > 140))
    grow_erase(px, w, h, reds, 16, leftover)
    # Handwriting cut by the crop's sides: ink shapes touching the left or right edge
    for comp in components(px, w, h, is_ink):
        x0, y0, x1, y1 = bbox(comp)
        if x0 <= 1 or x1 >= w - 2:
            for p in comp:
                px[p] = WHITE
    # Specks left on the white: keep only the screenshot's big pieces (the title, pin, label,
    # cluster, crystals); small loose shapes, and ones with no blue or gold in them, go
    for comp in components(px, w, h, lambda p: min(p) < 225):
        art = sum(1 for p in comp if is_blue(px[p]) or (px[p][0] > 200 and 120 < px[p][1] < 220 and px[p][2] < 120))
        if len(comp) < 160 or art < 8:
            for p in comp:
                px[p] = WHITE
    return im


if __name__ == '__main__':
    clean_tree().save('crystal-tree.webp', quality=85, method=6)
    clean_victory().save('crystal-victory.webp', quality=85, method=6)
