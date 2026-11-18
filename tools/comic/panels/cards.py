"""The cards: one full-screen still per man, front on, with his name (for a screen between levels that shows the
targets; not built yet) and one for the runner (a title or a menu). 384 x 216 title px each."""
from .. import poster
from ..kit import BONE, BONE_D, CYAN, FIRE, FIRE_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, panel, slab, text_mask

SIZE = (1152, 648)
# key: (name, the character, his figure's height for 100 units, the slab behind him, its ink for the small lettering,
#       what he is, his sign in two lines, the tag over his name)
CARDS = {
    'cueball': ('CUEBALL', poster.cueball, 430, PINK, PINK, 'THE HEAVY', ['FLUO YELLOW SHADES', 'ON A BALD DOME'], 'TARGET - LEVEL 1'),
    'lucky': ('LUCKY', poster.lucky, 380, CYAN, CYAN, 'THE MAN WITH THE MATCH', ['A LONG PINK SCARF,', 'ITS END FLYING'], 'TARGET'),
    'jitters': ('JITTERS', poster.jitters, 430, BONE, BONE, 'THE YOUNG ONE', ['A CYAN', 'SAW-TOOTH CREST'], 'TARGET'),
    'boss': ('THE BOSS', poster.boss, 430, PINK_D, PINK, 'HE OWNS THE CITY', ['A BONE SUIT, A BLACK TIE,', 'A CIGAR'], 'THE LAST TARGET'),
    'runner': ('THE RUNNER', poster.runner, 430, FIRE_D, FIRE, 'SIX YEARS OF PACKAGES', ['A LOW DARK CAP, A LONG', 'COAT, ITS TAILS FLYING'], None),
}


def fitted(s, width, px=132):
    """A line of lettering as large as fits in width."""
    while px > 12 and text_mask(s, px).size[0] > width:
        px -= 4
    return text_mask(s, px)


def card(key):
    name, who, h, ground, ink, what, sign, tag = CARDS[key]
    W, H = SIZE
    cv = Cv(W, H, NIGHT)
    cv.poly([(430, -10), (760, -10), (470, H + 10), (140, H + 10)], NIGHT_L)                  # one diagonal across the card
    cv.poly(slab(84, 50, 548, 590, len(name) * 7, 12), ground)
    cv.poly(slab(52, 566, 590, 616, len(name) * 7 + 3, 6), INK)
    poster.man(cv, who, 316 - (14 if key in ('boss', 'runner') else 0), 580, h)
    x = 624
    if tag:
        cv.im.paste(FIRE, (x, 58), text_mask(tag, 24))
    t = fitted(name, 470)
    cv.im.paste(BONE, (x, 96), t)
    y = 96 + t.size[1] + 22
    cv.im.paste(ink, (x, y), fitted(what, 470, 30))
    for i, line in enumerate(sign):
        cv.im.paste(BONE_D, (x, y + 48 + i * 30), text_mask(line, 20))
    # how he reads in the game: from straight above, on the boards
    pool = cv.disc(886, 430, 132, col=NIGHT_LL)
    poster.board_gaps(cv, -150, 62, NIGHT_L, pool, x0=-100, w=4)
    poster.above(cv, key, 880, 430, 4.6, -24)
    t = text_mask('FROM ABOVE', 20)
    cv.im.paste(NIGHT_LL, (886 - t.size[0] // 2, 580), t)
    return cv


@panel('target_cueball', SIZE)
def target_cueball():
    return card('cueball')


@panel('target_lucky', SIZE)
def target_lucky():
    return card('lucky')


@panel('target_jitters', SIZE)
def target_jitters():
    return card('jitters')


@panel('target_boss', SIZE)
def target_boss():
    return card('boss')


@panel('card_runner', SIZE)
def card_runner():
    return card('runner')
