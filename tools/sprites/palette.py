"""Named colours shared by several kits (a kit's own colours stay in it). Only exact duplicates are merged: a colour a
shade off another is another colour (#2a2a30 and #2a2a34 are both here, apart), and stays what it is. The plain
colours first, by the name of what they look like (a kit's own names for them: NEON_YELLOW is SIGNAL_YELLOW), then the
materials' 4-step ramps, the lamps, the neon, the street's paint."""

from .core import hx, ramp

# ---- plain colours, used as they are all over the kits
PITCH = hx('#0c0a10')            # the blackest ink after the outline: an eye, a slot, a hole
TYRE_BLACK = hx('#141218')
SOOT = hx('#1a1820')
GRAPHITE = hx('#2a2a30')
GUNMETAL = hx('#2a2a34')
DARK_WOOD = hx('#3a2414')
IRON_GREY = hx('#6a6e78')
STEEL_GREY = hx('#8a8e98')
SILVER_GREY = hx('#9aa0ac')
PALE_GREY = hx('#c8c8d0')
PALE_STEEL = hx('#c8ccd6')
RUST_BROWN = hx('#8a4a22')
WALNUT = hx('#8a5a32')
KHAKI = hx('#8a6a3a')
PUTTY = hx('#d8d4c8')
PARCHMENT = hx('#e8dcc0')
LINEN = hx('#f0ece0')
CHALK = hx('#f4f0e2')            # off-white paint and paper
PAPER_WHITE = hx('#f4f0e6')
PURE_WHITE = hx('#ffffff')       # a glint, the hottest highlight
SIGNAL_RED = hx('#c8242c')
SIGNAL_ORANGE = hx('#ff6b1a')
SIGNAL_YELLOW = hx('#f9c80e')
LED_RED = hx('#ff2a3a')
HOT = hx('#fff6dc')              # a lit bulb's core

# ---- materials (4-step ramps: shadow, dark, base, light)
WHITE = ramp('#f4f2ec', 0.35, 0.16, 0.2)
STEEL = ramp('#585a70', 0.5, 0.25, 0.45)
STEEL_L = ramp('#8a90a4', 0.45, 0.22, 0.35)
ALU = ramp('#9aa0b0', 0.5, 0.26, 0.4)
ZINC = ramp('#9aa0a8', 0.5, 0.25, 0.3)
WOOD = ramp('#9a5a2c', 0.45, 0.22, 0.3)
BRASS = ramp('#e0a830', 0.45, 0.22, 0.4)
CARD = ramp('#b88a52', 0.45, 0.22, 0.25)        # cardboard
ENAMEL = ramp('#dfe3e8', 0.42, 0.2, 0.4)
CASH = ramp('#5a8a4a', 0.4, 0.2, 0.3)
GLASS = [hx('#0a0e1a'), hx('#121a2e'), hx('#1c2944'), hx('#2a3c5e')]
CHROME = [hx('#3a3848'), hx('#77768c'), hx('#b8b8c8'), hx('#eeeef8')]
RUBBER = [TYRE_BLACK, hx('#211e28'), hx('#2e2a36'), hx('#45404f')]
FLUO = [hx('#6e8208'), hx('#b0cc10'), hx('#e6ff1a'), hx('#fbffb4')]   # CUEBALL's shades, fluorescent yellow

# ---- lamps: a headlamp's and a tail lamp's colour and glow, an indicator's amber
HEAD_C, HEAD_GLOW = hx('#fff4d6'), (255, 240, 205, 255)
TAIL_C, TAIL_GLOW = LED_RED, (255, 36, 48, 255)
AMBER = hx('#ffaa2a')

# ---- neon
NEON_PINK, NEON_CYAN = hx('#ff2a6d'), hx('#05d9e8')
NEON_GREEN, NEON_AMBER, NEON_YELLOW = hx('#3aff8a'), hx('#ffa62a'), SIGNAL_YELLOW
DECO_PINK, DECO_TEAL = hx('#ff4aa6'), hx('#38f0dc')     # the art deco's (the toll's)

# ---- the street: its floors, its paint, its signs, its pastels
FL_ASPHALT = hx('#575a65')
FL_SIDEWALK = hx('#94929a')
ROAD_WHITE, ROAD_YELLOW = hx('#d4cfc2'), hx('#d2aa3a')   # THE road paint of every kit (lines, words, kerbs, islands)
SIGN_WHITE, SIGN_INK = hx('#ece8de'), hx('#17151d')
SIGN_GREEN, SIGN_RED, SIGN_YELLOW, SIGN_ORANGE = '#1c6a4c', '#c8242c', '#e8b828', '#f08a1c'
PASTEL_PINK, PASTEL_TEAL = '#f0a0bc', '#58c4b8'          # 1985 Florida: the toll's art deco (and the deco kit's)
STUCCO = dict(pink='#f0a8c0', mint='#9edcc6', peach='#f6c49c', lavender='#c2b0e4')
