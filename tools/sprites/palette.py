"""Named colours shared by several kits (a kit's own colours stay in it). Only exact duplicates are merged: a
colour a shade off another is another colour, and stays where it is."""

from .core import hx, ramp


WHITE = ramp('#f4f2ec', 0.35, 0.16, 0.2)
FLUO = [hx('#6e8208'), hx('#b0cc10'), hx('#e6ff1a'), hx('#fbffb4')]
STEEL = ramp('#585a70', 0.5, 0.25, 0.45)
STEEL_L = ramp('#8a90a4', 0.45, 0.22, 0.35)
WOOD = ramp('#9a5a2c', 0.45, 0.22, 0.3)
BRASS = ramp('#e0a830', 0.45, 0.22, 0.4)
FL_ASPHALT = hx('#575a65')
FL_SIDEWALK = hx('#94929a')
NEON_PINK, NEON_CYAN = hx('#ff2a6d'), hx('#05d9e8')
GLASS = [hx('#0a0e1a'), hx('#121a2e'), hx('#1c2944'), hx('#2a3c5e')]
CHROME = [hx('#3a3848'), hx('#77768c'), hx('#b8b8c8'), hx('#eeeef8')]
RUBBER = [hx('#141218'), hx('#211e28'), hx('#2e2a36'), hx('#45404f')]
AMBER = hx('#ffaa2a')
HEAD_C, HEAD_GLOW = hx('#fff4d6'), (255, 240, 205, 255)
TAIL_C, TAIL_GLOW = hx('#ff2a3a'), (255, 36, 48, 255)
NEON_GREEN, NEON_AMBER, NEON_YELLOW = hx('#3aff8a'), hx('#ffa62a'), hx('#f9c80e')
CASH = ramp('#5a8a4a', 0.4, 0.2, 0.3)
ALU = ramp('#9aa0b0', 0.5, 0.26, 0.4)
ROAD_WHITE, ROAD_YELLOW = hx('#d4cfc2'), hx('#d2aa3a')   # THE road paint of every kit (lines, words, kerbs, islands)
SIGN_WHITE, SIGN_INK = hx('#ece8de'), hx('#17151d')
SIGN_GREEN, SIGN_RED, SIGN_YELLOW, SIGN_ORANGE = '#1c6a4c', '#c8242c', '#e8b828', '#f08a1c'
ZINC = ramp('#9aa0a8', 0.5, 0.25, 0.3)
PASTEL_PINK, PASTEL_TEAL = '#f0a0bc', '#58c4b8'          # 1985 Florida: the toll's art deco (and the deco kit's)
DECO_PINK, DECO_TEAL = hx('#ff4aa6'), hx('#38f0dc')                 # their neon
STUCCO = dict(pink='#f0a8c0', mint='#9edcc6', peach='#f6c49c', lavender='#c2b0e4')
