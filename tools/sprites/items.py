"""Small things the guards have in hand, drop or leave about (entities/PostArt.js, Enemy.dropHeld), and CUEBALL's
shades on the floor."""
import random

from .core import ascii_cv, ashtray, Batch, Cv, hx, layer
from .palette import FLUO, LINEN


def shades_item():
    """His shades on the floor, from above (the world's pixel size): the two lenses in a band, the arms folded back."""
    return ascii_cv(['.............',
                     '.dYYYYkyyyyd.',
                     '.dyyyykyyKyd.',
                     '.d.........d.',
                     '.d.........d.',
                     '.............'], {'Y': FLUO[3], 'y': FLUO[2], 'd': FLUO[1], 'k': FLUO[0], 'K': hx('#3a4406')})


# small things the guards have in hand, drop or leave about (entities/PostArt.js, Enemy.dropHeld): a cigarette end and
# a cigar stub left smoking on the floor, a can kicked down the sidewalk, a magazine slid off a knee, the boss's ashtray
def items():
    I = {}
    I['butt'] = ascii_cv(["wwwo",
                          "dddo"], {'w': hx('#ece6d6'), 'd': hx('#c8c0ae'), 'o': hx('#d89a50')}, ol=None)
    # level 2A's opening (systems/LastDrag.js), both painted at FINE density (a pixel is half a world px: their
    # flag `dense`): the end of a cigarette in his fingers, its filter toward -x, the paper, the ash, the ember at +x
    # (6 x 1 world px: longer than life, it has to read from above); and the butt once flicked, on the road, its
    # end still alight (3 x 1)
    I['cigarette'] = ascii_cv(["FFFfWWWWwaee",
                               "fffdwwwwwaee"], {'F': hx('#d8a868'), 'f': hx('#b88848'), 'd': hx('#96683a'), 'W': hx('#f4efe2'),
                                             'w': hx('#d2ccbc'), 'a': hx('#8a8680'), 'e': hx('#ff8a2a')}, ol=None)
    I['cig_butt'] = ascii_cv(["FFfWae",
                              "ffdwae"], {'F': hx('#d8a868'), 'f': hx('#b88848'), 'd': hx('#96683a'), 'W': hx('#f4efe2'),
                                          'w': hx('#d2ccbc'), 'a': hx('#8a8680'), 'e': hx('#ff7a20')}, ol=None)
    I['cigar'] = ascii_cv(["BbbgBa",
                           "BBbgBa"], {'B': hx('#5a341e'), 'b': hx('#7a4a2a'), 'g': hx('#c8a040'), 'a': hx('#8a8a8a')}, ol=None)
    I['can'] = ascii_cv(["......",
                         ".rWrs.",
                         ".RRRs.",
                         "......"], {'r': hx('#d8303a'), 'R': hx('#a01e28'), 'W': LINEN, 's': hx('#c8ccd4')})
    # a glossy cover: a picture, the title across its head, the print of its lines
    I['magazine'] = ascii_cv(["........",
                              ".tttttt.",
                              ".tTTTTt.",
                              ".pppppp.",
                              ".pPPPpp.",
                              ".pPPPpp.",
                              ".ppppbp.",
                              ".llllll.",
                              ".llllll.",
                              "........"], {'t': hx('#f0e6d0'), 'T': hx('#d8202a'), 'p': hx('#e8508a'), 'P': hx('#f0b090'),
                                            'b': hx('#4a7ab0'), 'l': hx('#d8d2c0')})
    I['ashtray'] = layer(Cv(10, 10), lambda ly: ashtray(ly, 5.0, 5.0, random.Random(901), 2.8))
    # a bottle of rum lying down, its neck toward +x: amber glass, the label, the cap
    I['bottle'] = ascii_cv(['...........',
                            '.bbLLbb....',
                            '.BbLLbbnnk.',
                            '.BBLLBB....',
                            '...........'], {'b': hx('#8a5424'), 'B': hx('#5a3416'), 'L': hx('#e8d8a8'), 'n': hx('#6a4020'),
                                            'k': hx('#c8a040')})
    return I


ITEMS = Batch(items)
GROUP = 'items'
SPRITES = {
    'butt': (ITEMS('butt'), (4, 2), ''),
    'cigarette': (ITEMS('cigarette'), (6, 1), 'dense'),
    'cig_butt': (ITEMS('cig_butt'), (3, 1), 'dense'),
    'cigar': (ITEMS('cigar'), (6, 2), ''),
    'can': (ITEMS('can'), (6, 4), ''),
    'magazine': (ITEMS('magazine'), (8, 10), ''),
    'ashtray': (ITEMS('ashtray'), (10, 10), ''),
    'bottle': (ITEMS('bottle'), (11, 5), ''),
    'shades': (shades_item, (13, 6), ''),
}
