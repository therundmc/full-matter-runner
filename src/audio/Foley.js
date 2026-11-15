// Synthesized foley: one recipe per sound, as data, rendered by audio/Synth.js into a few variations each (baked
// once by Audio.js, played with small live variations). A recipe is { level, dur, layers } (level: peak of the
// render, dur: s it lasts), or { by(opts) -> form, forms: { form: recipe } } when the same event sounds different
// by floor, material or weapon. Numbers given as [lo, hi] are drawn per variation; times are seconds.
// Built physically, never from bare tones: a struck thing is a noise contact ringing its own modes (f Hz, tau s,
// level), friction and cloth are moving bands of noise, grit and wire are clouds of tiny impacts.

const knock = (at, modes, o = {}) => ({ k: 'knock', at, modes, ...o });
const rub = (at, dur, f, o = {}) => ({ k: 'rub', at, dur, f, ...o });
const grains = (at, dur, n, f, o = {}) => ({ k: 'grains', at, dur, n, f, tau: [0.0008, 0.0025], a: [0.25, 1], ...o });
const whoosh = (at, dur, f, o = {}) => ({ k: 'whoosh', at, dur, f, ...o });
const BELL = [[0, 0], [0.35, 1], [1, 0]];

// ---- modes of what gets struck ----
const RUNG = [[[265, 300], [0.04, 0.06], 1], [[440, 480], [0.03, 0.045], 0.7], [[740, 800], [0.025, 0.035], 0.6], [[1100, 1200], [0.015, 0.025], 0.5], [[1750, 1900], 0.01, 0.3], [[2800, 3100], 0.006, 0.2]];
const BOOT_RUNG = [[[140, 160], 0.025, 0.45], [[180, 195], 0.08, 0.08], ...RUNG.map(([f, t, a]) => [f, 0.7 * (Array.isArray(t) ? t[0] : t), a])];
const PALM = [[[170, 200], 0.015, 1], [[380, 450], 0.008, 0.35]];
const BODY = [[[62, 74], 0.055, 1], [[125, 145], 0.035, 0.5], [[250, 290], 0.018, 0.2]];
const HIP = [[[80, 95], 0.04, 1], [[175, 200], 0.02, 0.4]];
const POST = [[[170, 185], [0.08, 0.12], 0.7], [[470, 500], 0.08, 0.7], [[900, 940], 0.06, 0.5], [[1460, 1520], 0.04, 0.35]];
const HOOD = [[[90, 100], [0.1, 0.14], 1], [[150, 170], 0.1, 0.7], [[235, 255], 0.08, 0.6], [[395, 425], 0.06, 0.45], [[660, 720], 0.05, 0.3], [[1100, 1200], 0.04, 0.2]];
const HOOD_RING = [[180, 0.08, 1], [310, 0.06, 0.8], [520, 0.05, 0.6], [870, 0.04, 0.4], [1450, 0.03, 0.25]];
const WOOD_TOP = [[[170, 190], 0.04, 1], [[300, 330], 0.03, 0.6], [[500, 560], 0.02, 0.4], [[900, 1000], 0.012, 0.2]];
const WOOD_TOP_RING = [[320, 0.03, 1], [540, 0.025, 0.6], [950, 0.015, 0.3]];
const FRAME = [[[210, 240], 0.03, 1], [[520, 580], 0.02, 0.5], [[1100, 1250], 0.012, 0.25]];
const BAT = [[[230, 250], 0.05, 1], [[630, 670], 0.035, 0.6], [[1200, 1300], 0.02, 0.35]];
const BAR = [[[450, 470], 0.2, 1], [[1240, 1300], 0.15, 0.7], [[2430, 2550], 0.1, 0.45], [[4000, 4200], 0.07, 0.25]]; // a free steel bar: 1, 2.76, 5.4, 8.9
const BLADE = [[[2000, 2200], 0.1, 1], [[5400, 5800], 0.06, 0.5], [[900, 1000], 0.02, 0.3]];
const PISTOL = [[[880, 940], 0.025, 1], [[1600, 1700], 0.02, 0.7], [[2800, 3000], 0.015, 0.5], [[4300, 4600], 0.01, 0.3], [[300, 340], 0.012, 0.5]];
const LONG = [[[360, 400], 0.05, 1], [[790, 850], 0.04, 0.7], [[1450, 1550], 0.03, 0.5], [[2500, 2700], 0.02, 0.4], [[180, 200], 0.03, 0.6]];
const LID = [[[125, 140], 0.06, 1], [[230, 250], 0.045, 0.6], [[395, 425], 0.03, 0.4], [[700, 740], 0.02, 0.2]];
const DOOR = [[[92, 100], 0.11, 1], [[165, 180], 0.08, 0.75], [[275, 300], 0.05, 0.55], [[415, 445], 0.04, 0.35], [[660, 720], 0.025, 0.2]];
const SLAM = [[[60, 65], 0.2, 1], [[113, 123], 0.15, 0.75], [[195, 210], 0.1, 0.55], [[325, 345], 0.07, 0.35], [[520, 560], 0.04, 0.25]];
const COIN = [[[2900, 3500], [0.05, 0.09], 1], [[4300, 5300], [0.04, 0.07], 0.8], [[6200, 7400], 0.04, 0.6], [[8800, 9800], 0.03, 0.4]];
const BALL = [[[3000, 3400], 0.006, 1], [[5100, 5500], 0.004, 0.6], [[7600, 8200], 0.003, 0.4]];
const LATCH = [[[2200, 2400], 0.012, 1], [[3900, 4300], 0.008, 0.6], [[6000, 6400], 0.005, 0.4]];

// ---- floors (World tile floors -> how a foot, a body, a slide sound on them) ----
// body: the floor's thump (a wooden floor rings hollow, tiles click), grit: how much loose grit crunches, in gritF
const FLOOR = {
  concrete: { body: [[[100, 120], 0.02, 1], [[220, 260], 0.01, 0.35]], lp: 2600, click: 0.6, grit: 0.5, gritF: [2500, 8000] },
  asphalt: { body: [[[90, 110], 0.02, 1], [[200, 240], 0.01, 0.3]], lp: 2000, click: 0.5, grit: 1, gritF: [1800, 7000] },
  wood: { body: [[[110, 130], 0.05, 1], [[190, 220], 0.04, 0.7], [[320, 360], 0.03, 0.5], [[520, 600], 0.02, 0.3]], lp: 2200, click: 0.4, grit: 0, ring: [[120, 0.05, 1], [205, 0.04, 0.7], [340, 0.03, 0.5]] },
  tile: { body: [[[140, 170], 0.012, 0.8], [[2600, 3400], 0.006, 0.5], [[4200, 5200], 0.004, 0.3]], lp: 6000, click: 0.9, grit: 0.15, gritF: [4000, 9000], slide: [[0, [3600, 4000]], [0.35, [2500, 2800]], [1, [1000, 1200]]] },
  carpet: { body: [[[80, 100], 0.02, 1]], lp: 500, click: 0.25, grit: 0, contact: 0.018, slide: [[0, [1300, 1500]], [1, [400, 500]]], quiet: 0.6 },
  dirt: { body: [[[85, 100], 0.025, 1]], lp: 900, click: 0.4, grit: 1.2, gritF: [700, 3500] },
  roof: { body: [[[95, 115], 0.025, 1], [[180, 220], 0.015, 0.4]], lp: 1400, click: 0.4, grit: 1.6, gritF: [1500, 6500] },
};
export const FLOOR_OF = {
  wood: 'wood', checker: 'tile', tile_blue: 'tile', neon_floor: 'tile', carpet_red: 'carpet', carpet_purple: 'carpet',
  concrete: 'concrete', sidewalk: 'concrete', asphalt: 'asphalt', asphalt_line: 'asphalt', dirt: 'dirt', grass: 'dirt', roof: 'roof',
};
const floorOf = (o) => FLOOR_OF[o.floor] || 'concrete';
const byFloor = (make) => ({ by: floorOf, forms: Object.fromEntries(Object.entries(FLOOR).map(([k, F]) => [k, make(F)])) });

// a foot coming down (at s, amp), its grit crunching
const foot = (at, F, amp, contact = 0.008) => [
  knock(at, F.body, { contact: F.contact ?? contact, lp: F.lp, click: F.click, amp }),
  ...(F.grit ? [grains(at, 0.06, [Math.ceil(3 * F.grit), Math.ceil(7 * F.grit)], F.gritF, { amp: amp * Math.min(0.45, 0.3 * F.grit) })] : []),
];
// a sole dragged a moment: the scrape and its grit
const scuff = (at, dur, F, amp) => [
  rub(at, dur, [[0, [3000, 3400]], [1, [1800, 2100]]], { q: 0.8, env: BELL, flutter: [60, 0.5], amp: amp * (F.quiet ?? 1) }),
  ...(F.grit ? [grains(at, dur, [Math.ceil(4 * F.grit), Math.ceil(9 * F.grit)], F.gritF, { shape: 'flat', amp: amp * 0.8 })] : []),
];
const cloth = (at, dur, amp, f = [1100, 1600]) => rub(at, dur, f, { q: 0.6, flutter: [22, 0.8], env: BELL, amp });
const CONCRETE = FLOOR.concrete;
// both feet back on the ground after a jump (the first at a fixed time, the second a moment after)
const landing = (at, F = CONCRETE) => [...foot(at, F, 0.9, 0.012), ...foot([at + 0.02, at + 0.045], F, 0.65, 0.01), ...scuff(at + 0.01, 0.07, F, 0.25)];
const withLanding = (rec, at) => ({ by: (o) => (o.land === false ? 'noland' : 'land'), forms: { land: { ...rec, layers: [...rec.layers, ...landing(at)] }, noland: rec } });

// ---- weapons by how they handle (weapon id -> class) ----
export const HANDLING = {
  fists: 'fist', bat: 'bat', tire_iron: 'iron', cue: 'cue', cue_half: 'stake', knife: 'knife',
  pistol: 'pistol', uzi: 'pistol', uzi_silenced: 'pistol', shotgun: 'long', rifle: 'long', sniper: 'long', bazooka: 'long',
};
const handling = (o) => HANDLING[o.weapon] || 'fist';
const sleeve = (amp) => rub(0, 0.12, [900, 1500], { q: 0.6, flutter: [30, 0.7], env: BELL, amp });

export const RECIPES = {
  // ---- the body and its moves ----
  // a ladder rung: the hand taking the steel bar (light, brighter), then the boot coming down on the next (dull),
  // the frame knocking a little against its brackets
  rung: {
    level: 0.8, dur: 0.32, layers: [
      knock(0, RUNG, { contact: 0.002, lp: 3000, click: 0.35, amp: [0.35, 0.6], odds: 0.8 }),
      knock([0.07, 0.12], BOOT_RUNG, { contact: 0.005, lp: 1200, click: 0.6, amp: 1 }),
      grains([0.08, 0.13], 0.18, [2, 5], [600, 1500], { tau: [0.006, 0.018], amp: 0.18 }),
    ],
  },
  // pulling himself over the roof's edge: both palms on the coping, the body dragged over its grit, a knee
  ledge: {
    level: 0.7, dur: 0.5, layers: [
      knock(0, PALM, { contact: 0.004, lp: 2500, click: 0.8, amp: 0.6 }),
      knock([0.05, 0.09], PALM, { contact: 0.004, lp: 2500, click: 0.8, amp: 0.5 }),
      rub(0.12, 0.3, [[0, [3200, 3800]], [1, [2000, 2400]]], { q: 0.8, env: [[0, 0], [0.3, 1], [1, 0]], flutter: [45, 0.6], amp: 0.35 }),
      grains(0.12, 0.3, [10, 18], [2500, 7500], { shape: 'flat', amp: 0.3 }),
      knock([0.24, 0.3], [[[110, 130], 0.03, 1], [[250, 280], 0.015, 0.3]], { contact: 0.012, lp: 700, click: 0.6, amp: 0.55 }),
      cloth(0.04, 0.4, 0.2),
    ],
  },
  // hands on a sill or a low wall, the body swung over, the landing (VAULT_DUR 0.5 s: feet down at 0.39 s)
  vault: withLanding({
    level: 0.75, dur: 0.5, layers: [
      knock(0, PALM, { contact: 0.004, lp: 2500, click: 0.8, amp: 0.55 }),
      knock([0.025, 0.045], PALM, { contact: 0.004, lp: 2500, click: 0.8, amp: 0.45 }),
      whoosh(0.06, 0.32, [[350, 500], [1300, 1800]], { q: 0.7, peak: 0.5, amp: 0.35 }),
      cloth(0.02, 0.4, 0.2),
    ],
  }, 0.385),
  // through a window: the body launched, a shoulder brushing the frame, the fall on the far side (the glass is
  // its own sound)
  dive: withLanding({
    level: 0.85, dur: 0.6, layers: [
      whoosh(0, 0.35, [[250, 350], [900, 1300]], { q: 0.6, peak: 0.45, amp: 0.5 }),
      knock([0.1, 0.16], FRAME, { contact: 0.006, lp: 1800, click: 0.4, amp: 0.3 }),
      cloth(0, 0.45, 0.25),
      knock(0.37, BODY, { contact: 0.025, lp: 600, click: 0.6, amp: 1 }),
      rub(0.38, 0.15, [[0, 1800], [1, 800]], { q: 0.7, env: [[0, 1], [1, 0]], flutter: [40, 0.5], amp: 0.3 }),
    ],
  }, 0.4),
  // a hip slide across a car hood (cloth on sheet metal, the panel booming), a table or a counter, a sofa
  hipSlide: {
    by: (o) => (o.material === 'metal' ? 'metal' : o.material === 'fabric' ? 'soft' : 'wood'),
    forms: {
      metal: {
        level: 0.8, dur: 0.5, layers: [
          knock(0, HOOD, { contact: 0.012, lp: 1200, click: 0.35, amp: 0.8 }),
          rub(0.03, 0.36, [[0, 2600], [1, 1300]], { q: 0.6, env: [[0, 0], [0.1, 1], [0.8, 0.6], [1, 0]], flutter: [35, 0.5], ring: HOOD_RING, wet: 0.6, amp: 0.55 }),
          ...landing(0.42),
        ],
      },
      wood: {
        level: 0.75, dur: 0.5, layers: [
          knock(0, WOOD_TOP, { contact: 0.012, lp: 1000, click: 0.5, amp: 0.7 }),
          rub(0.03, 0.36, [[0, 2000], [1, 900]], { q: 0.7, env: [[0, 0], [0.1, 1], [0.8, 0.6], [1, 0]], flutter: [30, 0.6], ring: WOOD_TOP_RING, wet: 0.3, amp: 0.4 }),
          ...landing(0.42),
        ],
      },
      soft: {
        level: 0.7, dur: 0.5, layers: [
          knock(0, HIP, { contact: 0.02, lp: 600, click: 0.4, amp: 0.5 }),
          rub(0.03, 0.35, [[0, 1500], [1, 700]], { q: 0.6, flutter: [25, 0.7], amp: 0.35 }),
          ...landing(0.42),
        ],
      },
    },
  },
  // over a chain-link gate (CLIMB_DUR 0.72 s): hands, feet, then the body on the mesh, each shake a cloud of tiny
  // wire pings, the posts answering, the whole panel flexing; the drop on the far side
  climb: withLanding({
    level: 0.8, dur: 0.75, layers: [
      knock(0, [[[200, 240], 0.01, 1]], { contact: 0.004, lp: 2000, click: 0.8, amp: 0.3 }),
      grains(0, 0.25, [40, 55], [2500, 10000], { tau: [0.004, 0.02], a: [0.2, 1], amp: 0.55 }),
      grains(0.18, 0.22, [30, 45], [2500, 10000], { tau: [0.004, 0.02], a: [0.2, 1], amp: 0.5 }),
      grains(0.34, 0.3, [45, 60], [2500, 10000], { tau: [0.004, 0.02], a: [0.2, 1], amp: 0.55 }),
      knock(0.005, POST, { contact: 0.003, lp: 2500, click: 0.15, amp: [0.25, 0.35] }),
      knock(0.185, POST, { contact: 0.003, lp: 2500, click: 0.15, amp: [0.2, 0.3] }),
      knock(0.345, POST, { contact: 0.003, lp: 2500, click: 0.15, amp: [0.25, 0.35] }),
      rub(0, 0.6, [[0, 450], [0.5, 700], [1, 400]], { q: 1.2, flutter: [11, 0.9], amp: 0.15 }),
      whoosh(0.32, 0.22, [[300, 400], [900, 1200]], { amp: 0.25 }),
    ],
  }, 0.56),
  // the slide on the floor (0.5 s): the hip down, a shoe catching, the friction falling in pitch and level as he
  // slows, the grit under him, the shoe catching again at the end
  slide: byFloor((F) => ({
    level: 0.8, dur: 0.55, layers: [
      knock(0, F.ring ? [...HIP, ...F.body] : HIP, { contact: 0.02, lp: 600, click: 0.5, amp: 0.6 }),
      grains(0, 0.03, [3, 5], [900, 3000], { tau: [0.002, 0.004], a: [0.5, 1], shape: 'flat', amp: 0.35 }),
      rub(0.01, 0.5, F.slide || [[0, [3000, 3400]], [0.35, [1900, 2200]], [1, [650, 800]]], {
        q: F === FLOOR.tile ? 1 : 0.7, env: [[0, 0], [0.05, 1], [0.5, 0.6], [1, 0]], flutter: [30, 0.4],
        amp: 0.6 * (F.quiet ?? 1), ...(F.ring ? { ring: F.ring, wet: 0.35 } : {}),
      }),
      ...(F.grit ? [grains(0.01, 0.45, [Math.ceil(20 * F.grit), Math.ceil(40 * F.grit)], F.gritF, { shape: 'flat', amp: 0.35 * Math.min(1, F.grit) })] : []),
      knock([0.42, 0.48], [[[120, 140], 0.02, 1]], { contact: 0.006, lp: 1500, click: 0.6, amp: 0.3 }),
    ],
  })),
  // the roll after a drop: both feet, the shoulder, the back rolling over the ground (cloth, grit), then up
  roll: byFloor((F) => ({
    level: 0.85, dur: 0.5, layers: [
      ...foot(0, F, 0.8, 0.012), ...foot([0.025, 0.04], F, 0.6, 0.01),
      knock([0.08, 0.11], F.ring ? [...BODY, ...F.body] : BODY, { contact: 0.025, lp: 500, click: 0.5, amp: 1 }),
      rub(0.08, 0.36, [[0, [1300, 1600]], [1, [800, 1000]]], { q: 0.6, flutter: [9, 0.75], env: BELL, amp: 0.4 * (F.quiet ?? 1) }),
      knock([0.2, 0.25], [[[90, 110], 0.03, 1]], { contact: 0.02, lp: 500, click: 0.5, amp: 0.45 }),
      ...(F.grit ? [grains(0.08, 0.35, [Math.ceil(12 * F.grit), Math.ceil(22 * F.grit)], F.gritF, { shape: 'flat', amp: 0.3 })] : []),
    ],
  })),
  // on his feet again at the end of the roll
  rollUp: byFloor((F) => ({ level: 0.6, dur: 0.25, layers: [...foot(0, F, 0.7), ...foot([0.06, 0.1], F, 0.55), ...scuff(0.01, 0.08, F, 0.25)] })),
  // up from sitting against a wall: clothes, a palm pushing off, a sole dragged, both feet planted
  getUp: {
    level: 0.6, dur: 0.6, layers: [
      cloth(0, 0.45, 0.35, [1200, 1700]),
      knock(0.04, PALM, { contact: 0.005, lp: 2000, click: 0.7, amp: 0.4 }),
      ...scuff(0.16, 0.12, CONCRETE, 0.3),
      ...foot(0.34, CONCRETE, 0.6), ...foot([0.48, 0.54], CONCRETE, 0.5),
    ],
  },
  // a footstep: heel then sole for a walk, a quicker heavier strike for a run (opts.floor, opts.run)
  step: {
    by: (o) => `${floorOf(o)}.${o.run ? 'run' : 'walk'}`,
    forms: Object.fromEntries(Object.entries(FLOOR).flatMap(([k, F]) => [
      [`${k}.walk`, { level: 0.5, dur: 0.15, layers: [...foot(0, F, 1, 0.006), knock([0.035, 0.06], F.body, { contact: 0.006, lp: F.lp * 1.5, click: F.click, amp: 0.45 }), ...scuff(0.01, 0.05, F, 0.15)] }],
      [`${k}.run`, { level: 0.8, dur: 0.12, layers: [...foot(0, F, 1, 0.01), knock([0.012, 0.025], F.body, { contact: 0.006, lp: F.lp, click: F.click, amp: 0.6 }), ...scuff(0.005, 0.07, F, 0.3)] }],
    ])),
  },
  // a body hitting the floor: knees, the torso, an arm, the head, the clothes
  bodyFall: {
    level: 0.9, dur: 0.45, layers: [
      knock(0, [[[105, 120], 0.03, 1], [[230, 260], 0.012, 0.3]], { contact: 0.012, lp: 900, click: 0.6, amp: 0.55 }),
      knock([0.06, 0.1], BODY, { contact: 0.03, lp: 450, click: 0.6, amp: 1 }),
      knock([0.12, 0.16], [[[190, 220], 0.012, 1]], { contact: 0.004, lp: 2500, click: 0.9, amp: 0.3 }),
      knock([0.15, 0.21], [[[130, 150], 0.02, 1], [[340, 380], 0.01, 0.3]], { contact: 0.008, lp: 1200, click: 0.6, amp: 0.4, odds: 0.8 }),
      cloth(0.03, 0.3, 0.25, [900, 1400]),
      grains(0.06, 0.25, [4, 8], [1500, 5000], { amp: 0.12 }),
    ],
  },
  // a body dragged over the floor by its clothes
  drag: {
    level: 0.45, dur: 0.6, layers: [
      rub(0, 0.55, [[0, 900], [1, 700]], { q: 0.5, flutter: [5, 0.7], env: [[0, 0], [0.2, 1], [0.8, 1], [1, 0]], amp: 0.6 }),
      grains(0, 0.55, [8, 14], [1200, 4500], { tau: [0.001, 0.003], a: [0.2, 1], shape: 'flat', amp: 0.3 }),
    ],
  },

  // ---- hands and objects ----
  // the swing of a melee weapon (opts.weapon): the air it tears, by weight and length, and the sleeve
  swing: {
    by: (o) => (['pistol', 'long'].includes(handling(o)) ? 'fist' : handling(o)), // a gun swung is an arm swung
    forms: {
      fist: { level: 0.5, dur: 0.16, layers: [sleeve(0.6), whoosh(0.01, 0.13, [[350, 450], [1100, 1500]], { q: 0.8, amp: 0.6 })] },
      bat: { level: 0.8, dur: 0.28, layers: [whoosh(0, 0.26, [[140, 170], [380, 480]], { q: 1.1, peak: 0.65, edge: 0.05, amp: 1 }), sleeve(0.12)] },
      iron: { level: 0.7, dur: 0.22, layers: [whoosh(0, 0.2, [[220, 280], [700, 850]], { q: 1.4, peak: 0.62, edge: 0.1, amp: 1 }), sleeve(0.15)] },
      cue: { level: 0.6, dur: 0.26, layers: [whoosh(0, 0.24, [[450, 550], [1600, 1900]], { q: 1.8, peak: 0.6, amp: 1 }), sleeve(0.2)] },
      stake: { level: 0.45, dur: 0.15, layers: [whoosh(0, 0.13, [[700, 850], [2300, 2700]], { q: 1.3, amp: 1 }), sleeve(0.5)] },
      // a blade cutting the air: a thin bright whistle over the stroke, the steel singing a little (the user: the knife
      // had no cutting sound of its own)
      knife: { level: 0.8, dur: 0.24, layers: [whoosh(0, 0.12, [[1900, 2400], [5200, 6400]], { q: 2.6, peak: 0.55, amp: 1 }),
        whoosh(0.005, 0.11, [[900, 1100], [2600, 3200]], { q: 1.1, amp: 0.5 }), knock(0.03, BLADE, { contact: 0.003, amp: 0.2 }), sleeve(0.35)] },
    },
  },
  // a weapon thrown (opts.weapon): the arm, then the thing turning over and over through the air
  throw: {
    by: (o) => (['long', 'bat', 'cue', 'iron'].includes(HANDLING[o.weapon]) ? 'long' : 'light'),
    forms: {
      light: { level: 0.6, dur: 0.34, layers: [sleeve(0.4), whoosh(0.03, 0.3, [[500, 600], [1500, 1800]], { q: 1, peak: 0.3, spinHz: [11, 15], spinDepth: 0.75, amp: 1 })] },
      long: { level: 0.75, dur: 0.42, layers: [sleeve(0.4), whoosh(0.03, 0.38, [[250, 320], [800, 1000]], { q: 1, peak: 0.3, spinHz: [6, 9], spinDepth: 0.8, amp: 1 })] },
    },
  },
  // a melee weapon taken in hand (guns use their handling recording): the palm closing, what it is made of
  grip: {
    by: (o) => ({ bat: 'wood', cue: 'wood', stake: 'wood', iron: 'iron', knife: 'knife' })[HANDLING[o.weapon]] || null,
    forms: {
      wood: { level: 0.5, dur: 0.25, layers: [knock(0, [[[220, 260], 0.008, 1]], { contact: 0.005, lp: 2500, click: 0.9, amp: 0.5 }), knock([0.015, 0.03], BAT, { contact: 0.003, lp: 4000, click: 0.3, amp: 0.6 }), sleeve(0.3)] },
      iron: { level: 0.5, dur: 0.3, layers: [knock(0, [[[220, 260], 0.008, 1]], { contact: 0.005, lp: 2500, click: 0.9, amp: 0.5 }), knock([0.015, 0.03], [[[600, 640], 0.09, 1], [[1650, 1760], 0.06, 0.55], [[3250, 3450], 0.035, 0.3]], { contact: 0.0015, click: 0.2, amp: 0.45 }), sleeve(0.3)] },
      knife: { level: 0.4, dur: 0.2, layers: [knock(0, [[[220, 260], 0.008, 1]], { contact: 0.005, lp: 2500, click: 0.9, amp: 0.5 }), knock([0.015, 0.03], [[[2300, 2500], 0.04, 1], [[5400, 5800], 0.025, 0.5]], { contact: 0.001, click: 0.2, amp: 0.3 }), sleeve(0.3)] },
    },
  },
  // a weapon falling on the floor (opts.weapon): its clatter and bounces, by what it is made of
  drop: {
    by: (o) => ({ pistol: 'pistol', long: 'long', bat: 'wood', cue: 'wood', stake: 'wood', iron: 'iron', knife: 'knife' })[HANDLING[o.weapon]] || 'pistol',
    forms: {
      pistol: { level: 0.7, dur: 0.35, layers: [knock(0, PISTOL, { contact: 0.0015, click: 0.5, amp: 1 }), knock([0.08, 0.11], PISTOL, { contact: 0.0015, click: 0.4, amp: 0.45 }), knock([0.15, 0.19], PISTOL, { contact: 0.0015, click: 0.3, amp: 0.2 })] },
      long: { level: 0.8, dur: 0.45, layers: [knock(0, LONG, { contact: 0.003, lp: 5000, click: 0.4, amp: 1 }), knock([0.03, 0.06], LONG, { contact: 0.003, lp: 5000, click: 0.4, amp: 0.8 }), knock([0.14, 0.18], LONG, { contact: 0.003, lp: 5000, click: 0.3, amp: 0.35 })] },
      wood: {
        level: 0.7, dur: 0.65, layers: [
          knock(0, BAT, { contact: 0.003, lp: 4000, click: 0.4, amp: 1 }), knock([0.14, 0.18], BAT, { contact: 0.003, lp: 4000, click: 0.4, amp: 0.55 }),
          knock([0.25, 0.3], BAT, { contact: 0.003, lp: 4000, click: 0.4, amp: 0.3 }), rub(0.3, 0.35, [600, 900], { q: 1, flutter: [14, 0.8], amp: 0.12 }),
        ],
      },
      iron: { level: 0.45, dur: 0.6, layers: [knock(0, BAR, { contact: 0.0015, click: 0.3, amp: 1 }), knock([0.1, 0.14], BAR, { contact: 0.0015, click: 0.3, amp: 0.5 }), knock([0.19, 0.24], BAR, { contact: 0.0015, click: 0.3, amp: 0.3 })] },
      knife: { level: 0.5, dur: 0.35, layers: [knock(0, BLADE, { contact: 0.001, click: 0.3, amp: 1 }), knock([0.07, 0.1], BLADE, { contact: 0.001, click: 0.3, amp: 0.4 })] },
    },
  },
  // what a club is made of, heard over the blow (opts.material 'metal'): the bat's dull knock, the iron's clank,
  // and the body taking it
  clubHit: {
    by: (o) => (o.material === 'metal' ? 'steel' : 'wood'),
    forms: {
      wood: { level: 0.8, dur: 0.3, layers: [knock(0, [[[160, 180], 0.03, 0.7], [[540, 580], 0.025, 1], [[1100, 1200], 0.015, 0.6]], { contact: 0.003, lp: 3000, click: 0.5, amp: 1 }), knock(0, HIP, { contact: 0.015, lp: 500, click: 0.5, amp: 0.5 })] },
      steel: { level: 0.8, dur: 0.35, layers: [knock(0, [[[410, 430], 0.05, 1], [[1130, 1190], 0.035, 0.6], [[2220, 2320], 0.025, 0.35]], { contact: 0.0015, click: 0.4, amp: 1 }), knock(0, HIP, { contact: 0.015, lp: 500, click: 0.5, amp: 0.5 })] },
    },
  },
  // the body under a punch (under the recorded one): the chest's dull knock and the smack of the contact
  punchBody: { level: 0.8, dur: 0.2, layers: [knock(0, [[[75, 90], 0.035, 1], [[150, 170], 0.02, 0.4]], { contact: 0.012, lp: 700, click: 0.5, amp: 1 }), knock(0, [], { contact: 0.003, click: 1, amp: 0.3 })] },
  // a car trunk opened: the latch, the lid let go, its struts, the lid stopping at the top (GESTURE.trunk)
  trunk: {
    level: 0.7, dur: 0.45, layers: [
      knock(0.06, LATCH, { contact: 0.0008, click: 0.3, amp: 0.45 }),
      knock(0.07, LID, { contact: 0.006, lp: 1500, click: 0.4, amp: 0.75 }),
      rub(0.1, 0.22, [[0, 3600], [1, 2600]], { q: 1.2, env: [[0, 0], [0.2, 1], [1, 0]], amp: 0.1 }),
      knock(0.31, [[[175, 190], 0.03, 1], [[330, 350], 0.02, 0.4]], { contact: 0.01, lp: 900, click: 0.5, amp: 0.4 }),
    ],
  },
  // a door against its stop (or let through with a key): the panel's hollow knock, the latch
  door: { level: 0.8, dur: 0.35, layers: [knock(0, DOOR, { contact: 0.008, lp: 1800, click: 0.8, amp: 1, jit: 0.05 }), knock(0.03, [[[2800, 3000], 0.01, 1], [[4600, 4800], 0.006, 0.5]], { contact: 0.0008, click: 0.3, amp: 0.12 })] },
  // kicked open or broken in: the same panel hit hard, lower and longer, the latch rattling
  doorSlam: { level: 0.9, dur: 0.5, layers: [knock(0, SLAM, { contact: 0.012, lp: 2500, click: 1, amp: 1 }), grains(0.05, 0.18, [2, 4], [2500, 3600], { tau: [0.008, 0.014], a: [0.4, 1], amp: 0.15 })] },
  // a chair shoved back: its legs juddering over the floor, then set down
  chairScrape: {
    level: 0.6, dur: 0.4, layers: [
      grains(0, 0.28, [12, 18], [450, 900], { tau: [0.006, 0.012], a: [0.4, 1], shape: 'flat', amp: 0.8 }),
      rub(0, 0.28, [[0, 1800], [1, 1300]], { q: 1, flutter: [50, 0.7], amp: 0.4 }),
      knock([0.3, 0.36], [[[240, 270], 0.025, 1], [[600, 650], 0.015, 0.4]], { contact: 0.003, lp: 3000, click: 0.4, amp: 0.5 }),
    ],
  },

  // ---- small things ----
  // small change shaken out of a parking meter: coins ringing on the pavement and on each other
  coin: {
    level: 0.45, dur: 0.6, layers: [
      knock(0, COIN, { contact: 0.0006, click: 0.3, amp: 1, jit: 0.08 }),
      knock([0.04, 0.12], COIN, { contact: 0.0006, click: 0.3, amp: 0.7, jit: 0.08 }),
      knock([0.1, 0.22], COIN, { contact: 0.0006, click: 0.3, amp: 0.5, jit: 0.08 }),
      knock([0.18, 0.32], COIN, { contact: 0.0006, click: 0.3, amp: 0.35, jit: 0.08, odds: 0.7 }),
      grains(0.02, 0.4, [8, 14], [2500, 9000], { tau: [0.008, 0.03], a: [0.2, 1], amp: 0.45 }),
    ],
  },
  // two pool balls meeting (systems/PoolBalls.js): a hard short click
  clack: { level: 0.9, dur: 0.06, layers: [knock(0, BALL, { contact: 0.0008, click: 1, amp: 1 })] },
  // a pool shot: the cue's leather tip on the cue ball, the ball it knocks an instant later
  pool: {
    level: 0.65, dur: 0.2, layers: [
      knock(0, [[[1600, 1900], 0.004, 1], [[3200, 3600], 0.003, 0.4]], { contact: 0.0015, lp: 5000, click: 0.8, amp: 0.6 }),
      knock(0.002, [[[150, 170], 0.015, 1]], { contact: 0.006, lp: 800, amp: 0.25 }),
      knock([0.06, 0.09], BALL, { contact: 0.0005, click: 1, amp: 1 }),
    ],
  },
  // a ball dropping into a pocket and rolling down the return
  pocket: {
    level: 0.55, dur: 0.45, layers: [
      knock(0, [[[240, 280], 0.03, 1], [[580, 640], 0.02, 0.4]], { contact: 0.005, lp: 1800, click: 0.5, amp: 0.8 }),
      rub(0.03, 0.35, [[0, 500], [1, 350]], { q: 1.2, flutter: [18, 0.6], amp: 0.35 }),
      knock([0.25, 0.35], BALL, { contact: 0.0005, click: 1, amp: 0.35 }),
    ],
  },
  // fire: embers popping over the breath of the flame
  crackle: {
    level: 0.5, dur: 0.35, layers: [
      grains(0, 0.32, [5, 10], [1200, 6000], { tau: [0.0008, 0.004], a: [0.15, 1], shape: 'flat', len: 0.0004, amp: 1 }),
      rub(0, 0.32, 450, { q: 0.5, env: [[0, 0], [0.3, 1], [1, 0]], flutter: [12, 0.8], amp: 0.25 }),
    ],
  },
};

// the recipe a play of `name` with `opts` renders, and the key its variations are baked under (null: none)
export function formOf(name, opts) {
  const r = RECIPES[name];
  if (!r) return null;
  if (!r.by) return { key: name, recipe: r };
  const f = r.by(opts);
  return f && r.forms[f] ? { key: `${name}.${f}`, recipe: r.forms[f] } : null;
}
