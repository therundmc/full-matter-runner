"""Lettering. One 5 x 7 capital font for every sign (FONT: the lab's stencils, the road's words, the signs' small
print, hand-painted boards, the neon), its tube cut (FONT_TUBE: the same letters, the I a single stroke) and the bar
sign's big letters (FONT_BAR). The ways a word is put on a sprite, each walking the inked cells of its letters
(inked): neon_text (1 px tubes on a Neon), tube_text (bigger tubes on a grid), words (font pixels k world px square),
tiny_text (a sprite pixel a font pixel), hand_words (painted by hand). road_text (a word drawn out long on the lane)
is the road's (road.py), stencil the lab's (lab_labels.py)."""
import random

from .core import frect, shift


FONT = {
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'B': ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    'C': [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    'D': ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    'F': ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    'G': [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    'H': ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'I': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    'J': ["....#", "....#", "....#", "....#", "....#", "#...#", ".###."],
    'K': ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    'L': ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    'M': ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    'N': ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'P': ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    'Q': [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    'R': ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    'S': [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    'T': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    'U': ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'V': ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    'W': ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    'X': ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    'Y': ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    'Z': ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    '0': [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    '1': ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    '2': [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    '3': ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    '4': ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    '5': ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    '6': [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    '7': ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    '8': [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    '9': [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ' ': [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    '.': [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
    '-': [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
    '/': ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
    '$': ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
}
FONT_TUBE = dict(FONT, I=["#", "#", "#", "#", "#", "#", "#"])   # the neon's: an I is one tube, no serifs
# the bar's own sign, 6 x 8
FONT_BAR = {
    'B': ["#####.", "#....#", "#....#", "#####.", "#....#", "#....#", "#....#", "#####."],
    'A': [".####.", "#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#"],
    'R': ["#####.", "#....#", "#....#", "#####.", "#..#..", "#...#.", "#....#", "#....#"],
}


def inked(glyph):
    """The (column, row) of every inked cell of a glyph, row by row from the top, each from the left."""
    for gy, row in enumerate(glyph):
        for gx, c in enumerate(row):
            if c == '#':
                yield gx, gy


def neon_text(ne, x, y, text, col):
    """Writes `text` in tubes from (x, y); returns the x where the next word would start."""
    for ch in text:
        for gx, gy in inked(FONT_TUBE[ch]):
            ne.dot(x + gx, y + gy, col)
        x += len(FONT_TUBE[ch][0]) + 1
    return x


def tiny_text(cv, x, y, text, col):
    """Small print, a pixel of the sprite a pixel of the font (FONT): (x, y) its top left, world px."""
    s = cv.s
    i0, j0 = int(round(x * s)), int(round(y * s))
    for n, ch in enumerate(text):
        for gx, gy in inked(FONT[ch]):
            if cv.pok(i0 + n * 6 + gx, j0 + gy):
                cv.p[i0 + n * 6 + gx, j0 + gy] = col


def words_w(text, k=1.0):
    return (len(text) * 6 - 1) * k


def words(cv, x, y, text, col, k=1.0, centre=False):
    """Capitals of FONT, a font pixel k world px square (0.5: one pixel of a fine sprite), (x, y) its top left
    (centre: x is the middle of the line)."""
    if centre:
        x = round((x - words_w(text, k) / 2) * 2) / 2
    for n, ch in enumerate(text):
        for gx, gy in inked(FONT[ch]):
            x0, y0 = x + (n * 6 + gx) * k, y + gy * k
            frect(cv, x0, y0, x0 + k, y0 + k, col)


def tube_text(ne, x, y, text, col, k=2):
    """Neon letters of FONT_TUBE on a grid k px apart, the strokes ONE tube wide (bigger letters, still tubes)."""
    for ch in text:
        g = FONT_TUBE[ch]
        for gx, gy in inked(g):
            for (dx, dy) in ((1, 0), (0, 1), (1, 1), (-1, 1)):
                nx, ny = gx + dx, gy + dy
                if 0 <= ny < len(g) and 0 <= nx < len(g[gy]) and g[ny][nx] == '#':
                    if dx and dy and (g[gy][nx] == '#' or g[ny][gx] == '#'):
                        continue                                      # (a diagonal only where nothing turns the corner)
                    ne.line([(x + gx * k, y + gy * k), (x + nx * k, y + ny * k)], col)
            ne.dot(x + gx * k, y + gy * k, col)
        x += (len(g[0]) + 1) * k
    return x


def tube_w(text, k=2):
    return sum((len(FONT_TUBE[c][0]) + 1) * k for c in text) - k - (k - 1)


def hand_words(cv, x, y, text, col, k=1.0, seed=0, centre=False, wob=0.4):
    """Capitals of FONT painted by hand (a brush or a marker): every letter a little off the line, askew in its place
    and of its own tone, the stroke dry here and there."""
    rng = random.Random(seed)
    if centre:
        x = x - words_w(text, k) / 2
    for n, ch in enumerate(text):
        dx, dy = rng.uniform(-wob, wob) * 0.5 * k, rng.uniform(-wob, wob) * k
        sh, tn = rng.uniform(-0.14, 0.14), rng.randint(-10, 10)
        for gx, gy in inked(FONT[ch]):
            if rng.random() < 0.05:
                continue
            x0, y0 = x + (n * 6 + gx + sh * (3 - gy)) * k + dx, y + gy * k + dy
            frect(cv, x0, y0, x0 + k, y0 + k, shift(col, tn))
