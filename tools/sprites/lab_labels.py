"""Stencilled floor labels of the physics lab's stations (tools/build_lab.py, painted with Level.paint): worn
yellow floor-marking paint, 5 x 7 capitals, each font pixel 2 x 2 world px (letters 14 px = 0.44 m tall)."""
import random

from .core import Cv, hx
from .type import FONT, inked


LAB_LABELS = dict(range='1 RANGE', executions='2 EXECUTIONS', soot='3 SOOT', pool='4 POOL', bars='5 BARS',
                  curtain='6 CURTAIN', jukebox='8 JUKEBOX', trapdoor='9 TRAPDOOR', powder='10 POWDER',
                  steam='11 STEAM', power='12 POWER', liquids='13 LIQUIDS', vehicles='17 VEHICLES',
                  takedowns='7 TAKEDOWNS', doors='14 DOORS', cueball='15 CUEBALL', fire='16 FIRE', coat='18 COAT',
                  drive='19 DRIVE', getaway='20 GETAWAY', lorry='21 LORRY', grab='22 GRAB', aim='23 AIM',
                  arcade='24 ARCADE', laundry='25 LAUNDRY', arms='26 ARMS', throw='27 THROW', killcam='28 KILL CAM', shield='29 SHIELD',
                  signals='30 SIGNALS', chasecam='31 CHASE CAM', chasefx='32 CHASE FX', flat='34 FLAT', seeps='33 SEEPS', propane='35 PROPANE', bend='36 BEND',
                  toll='37 TOLL', billboard='38 BILLBOARD')   # (in the order they were added, not by number: each keeps its seed)
STENCIL_K = 2   # world px per font pixel
STENCIL_PAD = 4  # world px of dark plate round the letters (1 px of it clear)


def stencil_size(text):
    return (len(text) * 6 - 1) * STENCIL_K + 2 * STENCIL_PAD, 7 * STENCIL_K + 2 * STENCIL_PAD


def stencil(text, seed):
    """A label stencilled on the floor: bright yellow paint on a dark painted plate (it reads on any floor), worn and
    chipped where it was walked on (1 px clear margin)."""
    W, H = stencil_size(text)
    cv = Cv(W, H)
    rng = random.Random(seed)
    plate, scuff = hx('#17141e', 205), hx('#2a2530', 190)
    paint, worn = hx('#ffd23a', 240), hx('#c8a640', 215)
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            edge = x in (1, W - 2) or y in (1, H - 2)
            if edge and (x in (1, W - 2)) and (y in (1, H - 2)):
                continue                                        # the plate's corners clipped
            if edge and rng.random() < 0.3:
                continue                                        # its edge worn ragged
            cv.set(x, y, scuff if rng.random() < 0.08 else plate)
    k = STENCIL_K
    for n, ch in enumerate(text):
        for gx, gy in inked(FONT[ch]):
            for j in range(k):
                for i in range(k):
                    if rng.random() < 0.07:
                        continue                                # chipped: the plate shows through
                    cv.set(STENCIL_PAD + (n * 6 + gx) * k + i, STENCIL_PAD + gy * k + j,
                           worn if rng.random() < 0.2 else paint)
    return cv


GROUP = 'props'
SPRITES = {
    'label_' + n: ((lambda t=t, s=i: stencil(t, 1201 + s)), stencil_size(t), 'floor') for i, (n, t) in enumerate(LAB_LABELS.items())
}
