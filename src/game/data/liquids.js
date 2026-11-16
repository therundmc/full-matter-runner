// Liquid on the floor (systems/Liquids.js over engine/physics/Shallow.js, drawn by render/LiquidArt.js): water,
// the rain's standing puddles, beer, spirits, blood, petrol. Everything poured runs on the floor as a real shallow
// liquid: it spreads, runs on and sloshes, gathers in hollows and along a kerb, is held by walls, shut doors and
// what stands on the floor (`dams`), mixes, and dries or soaks into the floor. Depths in mm, lengths in px
// (1 m = 32 px), times in s. A spill is given as the floor area it covers (px2): that many films deep over it.
export const LIQUIDS = {
  cell: 4,                 // px of a cell of the liquid's grid (8 to a tile)
  rate: 30,                // flow steps per s (at most two a frame)
  dryEvery: 0.25,          // s between two passes of drying
  check: 0.12,             // s between two looks at the doors and the furniture (what holds the liquid)
  k: 140,                  // 1/s2: how hard a difference of level drives the flow (it runs at about sqrt(k) cells/s)
  stick: 0.5,              // share of its film a cell keeps wet when a flow has passed (the trail it leaves)
  thin: 1.2,               // a film drags this much more per film of thinness (deep gushes keep running, thin ones stop)
  fill: 0.85,              // a spill of `area` px2 is poured that many films deep over that area (it spreads to about it)
  wet: 0.3,                // films deep from which a floor is wet (grip, prints)
  splash: 0.7,             // films deep from which feet splash in it
  pourR: 5,                // px: the disc a spill is poured over
  shut: 0.12,              // rad off its frame under which a door holds the liquid
  wade: { r: 7, k: 0.18 }, // someone walking through it pushes it along (px, share of his speed per frame)
  // what a jet pushes the liquid it pours at (px/s), at that share of the way per frame
  jet: { speed: 70, k: 0.35 },
  // the floors (TileMap names): its level (z, mm: a raised floor indoors, the kerb's step), what it drinks (soak,
  // mm/s), how bumpy it is (rough, mm: where the liquid gathers and the way it runs). A road is cambered: it rises
  // `camber` mm a cell away from its kerbs, up to `max`, so water runs along the gutters.
  floors: {
    wood: { z: 8, soak: 0.004, rough: 0.3 },
    checker: { z: 8, soak: 0, rough: 0.15 },
    tile_blue: { z: 8, soak: 0, rough: 0.15 },
    neon_floor: { z: 8, soak: 0, rough: 0.1 },
    carpet_red: { z: 8, soak: 0.03, rough: 0.4 },
    carpet_purple: { z: 8, soak: 0.03, rough: 0.4 },
    concrete: { z: 0, soak: 0.003, rough: 0.5 },
    asphalt: { z: 0, soak: 0.002, rough: 0.7 },
    asphalt_line: { z: 0, soak: 0.002, rough: 0.7 },
    sidewalk: { z: 6, soak: 0.003, rough: 0.4 },
    dirt: { z: 0, soak: 0.04, rough: 0.9 },
    grass: { z: 2, soak: 0.06, rough: 0.9 },
    roof: { z: 0, soak: 0.002, rough: 0.5 },
  },
  road: { floors: ['asphalt', 'asphalt_line'], camber: 0.1, max: 2.5 },
  relief: { size: 7, fine: 2.2, share: 0.65 }, // the bumps: a broad noise of `size` cells and a fine one
  drain: { r: 7, soak: 2.5, dip: 1 },       // a manhole (level street.manholes): mm/s it swallows within r px, mm it sits low
  // what stands on the floor and holds the liquid (static props of these types, their footprint); tables, beds, a
  // dumpster stand on legs or wheels: it runs under them
  dams: ['bar_counter', 'fridge', 'oven', 'sink', 'bookshelf', 'arcade', 'dj_booth', 'jukebox', 'bottle_shelf',
    'back_bar', 'washer', 'vending', 'phone_booth', 'ac_unit', 'water_tank', 'toilet', 'urinal'],
  // the rain's puddles (systems/Weather.js lays them): hollows `hollow` mm deep at their heart, the water standing
  // level `margin` mm under the lowest point of the rim (none where it would be under `min` mm); they never dry
  rain: { hollow: 3.2, margin: 0.4, min: 0.2 },
  // the petrol poured on the floor of a lesson's room that is set alight (level `fires` of a stage with a `spark`),
  // px2 at each fire
  petrol: { area: 1400, r: 8 },
  minPool: 4,              // a body's pool (px) under which it is not fed yet
  stride: 17,              // px between two footprints (alternating feet)
  gait: 3,                 // half the distance between the left and the right foot
  smear: 7,                // length of one stroke of a slide's smear
  maxStains: 4096,         // cells set or dried waiting to be painted as stains (render/LiquidArt.js)
  // the kinds, in the order of the grid's layers:
  //   film (mm: it stops spreading this thin), flow (how freely it runs), drag (1/s: its viscosity), dry (mm/s it
  //   evaporates), drunk (share of the floor's soak it takes in: an oily film stays on top; 1 if not given), age (s it stays fresh: a beer's foam, a blood's wet shine), sets (blood: once it is no longer
  //   fresh it is no longer wet, it is left as a stain), stains (what stood is painted when it dries), grip (floor
  //   grip times this where it is a film deep), slip (whoever runs on it may go down: systems/Slips.js);
  //   prints (steps a wet sole keeps marking; 0: none), color / alpha (of the prints), splash (drops kicked up
  //   running through it; quiet: without the slosh)
  kinds: {
    water: {
      film: 1, flow: 1, drag: 2.5, dry: 0.012, age: 4, grip: 0.7,
      prints: 9, color: '#0b0f1c', alpha: 0.55, splash: 'rgba(110,160,200,0.14)',
    },
    // what an earlier rain left lying in the open: water that marks no sole and splashes quietly
    rain: {
      film: 1, flow: 1, drag: 2.5, dry: 0.008, age: 4, grip: 0.85,
      prints: 0, color: '#0b0f1c', alpha: 0, splash: 'rgba(200,225,250,0.5)', quiet: true,
    },
    // draught beer out of a keg: amber, a head of foam on a fresh flow; slick, runners go down (systems/Slips.js)
    beer: {
      film: 1.15, flow: 0.85, drag: 3.5, dry: 0.01, age: 6, grip: 0.3, slip: true,
      prints: 8, color: '#3a2208', alpha: 0.45, splash: 'rgba(214,160,64,0.4)',
    },
    // spirits out of a bottle: brown, sticky, a thin film
    booze: {
      film: 0.8, flow: 1, drag: 3, dry: 0.02, age: 3, grip: 0.55,
      prints: 7, color: '#2c1806', alpha: 0.5, splash: 'rgba(150,96,36,0.3)', quiet: true,
    },
    blood: {
      film: 1.5, flow: 0.5, drag: 7, dry: 0, drunk: 0.4, age: 45, sets: true, stains: true, grip: 0.5,
      prints: 16, color: '#5c0a0c', alpha: 0.9,
    },
    petrol: {
      film: 0.5, flow: 1.3, drag: 2, dry: 0.003, drunk: 0.05, age: 8, grip: 0.45,
      prints: 6, color: '#14101c', alpha: 0.4, splash: 'rgba(160,140,190,0.25)', quiet: true,
    },
  },
  hydrant: { kind: 'water', rate: 2600, dur: 12, r: 14 }, // a burst hydrant gushes px2/s for dur s (a flooded street corner)
  leak: 260,               // px2 per second out of a pierced tank, keg or pipe (Prop.leak)
  // something that rains on the floor (Liquids.sprinkle: the sprinklers): drops poured a call, a ring now and then
  sprinkle: { drops: 3, ring: 0.5 },
  // rings spreading where a drop falls in standing liquid: at most `max` at once, `life` s, radius px
  ripple: { max: 48, life: [0.45, 0.8], size: [2, 5] },
  // the look (render/LiquidArt.js): drawn a texel of `px` world px at a time (the world's pixel-art grid), in flat
  // steps by depth (films): `levels` = from where it shows as its edge line, its thin film, its body, its deep part,
  // its core; the depth is first softened over the cells round each one (`soften`: the share kept, of each side
  // neighbour, of each corner), then roughened by `rag` films of a still noise (`grain`: texels to a lump, two
  // octaves; steady as the view moves). A kind's `ramp` gives those five colours (fresh / `aged` once it is no longer
  // fresh), `rim` its edge where it faces the light (the top left); blood takes its colours from
  // render/BloodArt.js (RAMPS: wet, then tacky; set, it is painted dry), `blood` = the shade of each step. `glint`:
  // a pale pixel in the deep (`glint` here: the odds of one); `foam` on a fresh flow's edge and in clumps (beer);
  // `sheen`: a petrol's rainbow bands (`stripe`: the share of each band that shows); `ring`: the ripples; `mirror`: how
  // much of the lights it mirrors (Lighting.post), `matte` once aged; `sky` (rain): the night sky it mirrors too.
  // `gap`: px of floor left dry along what holds it (a wall, a window, a shut door, standing furniture): it never
  // reads as painted over them (blood set into a stain keeps BLOOD_EDGE.floor, data/wounds.js)
  look: {
    px: 2,
    gap: 2,
    levels: [0.2, 0.34, 0.55, 1.3, 2.3],
    soften: [0.25, 0.125, 0.0625],
    rag: 0.32,
    grain: [5, 2],
    glint: 0.012,
    foam: { edge: -0.2, deep: 0.62 }, // foam where the still noise (in shares of `rag`) is over this: on the edge, inside
    mix: [0.1, 0.24, 0.4],    // share of a second kind from which it tints the first (a quarter, a third, half)
    kinds: {
      water: {
        ramp: ['rgba(4,8,18,0.4)', 'rgba(10,16,34,0.18)', 'rgba(8,14,30,0.24)', 'rgba(6,10,24,0.31)', 'rgba(4,8,20,0.38)'],
        rim: 'rgba(170,205,245,0.4)', glint: 'rgba(188,216,255,0.6)', ring: 'rgba(170,210,255,0.35)', mirror: 0.5,
      },
      rain: {
        ramp: ['rgba(4,8,20,0.4)', 'rgba(8,12,30,0.26)', 'rgba(6,10,26,0.34)', 'rgba(4,8,22,0.42)', 'rgba(3,6,18,0.48)'],
        rim: 'rgba(180,205,250,0.36)', glint: 'rgba(212,230,255,0.55)', ring: 'rgba(170,210,255,0.28)', mirror: 1, sky: 'rgba(30,38,74,0.26)',
      },
      beer: {
        ramp: ['rgba(70,38,6,0.7)', 'rgba(176,112,24,0.45)', 'rgba(196,128,30,0.55)', 'rgba(186,116,22,0.65)', 'rgba(168,100,18,0.72)'],
        aged: ['rgba(64,34,6,0.6)', 'rgba(140,86,18,0.42)', 'rgba(150,92,20,0.5)', 'rgba(140,84,16,0.58)', 'rgba(128,76,14,0.64)'],
        rim: 'rgba(255,214,130,0.75)', glint: 'rgba(255,240,190,0.85)', foam: 'rgba(244,234,208,0.9)', ring: 'rgba(255,226,160,0.35)', mirror: 0.32,
      },
      booze: {
        ramp: ['rgba(30,12,2,0.66)', 'rgba(52,22,4,0.5)', 'rgba(40,16,3,0.6)', 'rgba(34,13,2,0.66)', 'rgba(28,10,2,0.72)'],
        rim: 'rgba(170,100,36,0.6)', glint: 'rgba(255,217,160,0.6)', ring: 'rgba(236,190,120,0.3)', mirror: 0.32,
      },
      blood: { blood: [4, 3, 3, 4, 5], ring: 'rgba(200,40,40,0.35)', mirror: 0.25, matte: 0.08 },
      petrol: {
        ramp: ['rgba(10,6,18,0.6)', 'rgba(22,16,32,0.42)', 'rgba(18,12,28,0.52)', 'rgba(14,10,24,0.6)', 'rgba(12,8,20,0.66)'],
        sheen: ['rgba(120,70,170,0.22)', 'rgba(50,130,130,0.2)', 'rgba(170,140,60,0.2)', 'rgba(160,70,110,0.2)'], stripe: 0.3,
        rim: 'rgba(160,130,210,0.3)', glint: 'rgba(230,220,255,0.6)', ring: 'rgba(200,180,240,0.3)', mirror: 0.5,
      },
    },
  },
};
