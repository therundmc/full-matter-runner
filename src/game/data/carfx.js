// What a car in trouble looks like (systems/CarFx.js; the user, 2026-11-19: "faut que ca envoie niveau Michael
// Bay"): the smoke of a damaged engine through the modelled air (systems/Smoke.js), the showers of sparks wherever
// metal rubs, the fire-ball of one that goes up and what it throws. LOOKS ONLY: nothing here pushes a body that a car
// can touch, slows anything or changes a path. Lengths in world px, times in s, speeds in px/step (60 Hz) where a
// car's own speed is meant and px/s for what flies. Amounts of smoke are densities (0..1, data/atmosphere.js).
export const CARFX = {
  // ---- THE ENGINE'S SMOKE, by how much of the car's hp is gone (smokeStage: the worst stage reached; a car on fire
  // is `fire` whatever its hp; a blown wreck's soot is its own: Vehicle.update). Out of the engine bay (the hood's middle), laid
  // along what the hood covered since the last step so that a car at speed leaves an unbroken plume behind it:
  //   lay: [kind (SMOKE.kinds), per s standing, per px it moved] each; r: px of a lump, cap: never denser
  //   puff: what is SEEN of it on a road at night (the air's smoke only shows where a lamp lights it): billows that
  //   ride the modelled air (`puffs` below), [tone, a s standing, per px it moved, px from, to, s from, to]
  //   jitter: share of r a lump is thrown off the line, swell: the hot air welling out (volume 1/s per s)
  //   flames: [chance a step, how many, px/s] out of the hood (a spit of fire now and then at the `black` stage,
  //   licking out of it all the time once it burns), carried at `carry` of the car's speed, with `light` [r, colour,
  //   s]: black smoke on a road at night is only seen by what lights it; puffs: dark billows of particles [chance a
  //   step, px, s] rolling up over the plume
  smoke: {
    stages: [
      { name: 'steam', from: 0.15, lay: [['steam', 1.6, 0.03]], r: 7, cap: 0.45, jitter: 0.5, swell: 0,
        puff: ['white', 14, 0.07, 3, 8, 0.5, 0.9] },
      { name: 'grey', from: 0.35, lay: [['smoke', 2.4, 0.06], ['steam', 0.8, 0.02]], r: 9, cap: 0.9, jitter: 0.6, swell: 0.4,
        puff: ['grey', 20, 0.13, 4, 12, 0.6, 1.2] },
      { name: 'black', from: 0.55, lay: [['soot', 2.4, 0.07], ['smoke', 1.2, 0.03]], r: 11, cap: 1.2, jitter: 0.7, swell: 0.8,
        puff: ['black', 24, 0.17, 5, 15, 0.7, 1.4], flames: [0.16, 2, 50], carry: 0.85, light: [64, '#ff8a30', 0.08] },
    ],
    fire: { name: 'fire', lay: [['soot', 3.6, 0.09], ['smoke', 1, 0.02]], r: 13, cap: 1.4, jitter: 0.8, swell: 1.6,
      puff: ['black', 30, 0.22, 6, 18, 0.8, 1.6], flames: [1, 2, 70], carry: 0.82, light: [86, '#ff7a20', 0.07] },
    most: 5,                 // lumps laid a step at most (a car thrown a long way in one step)
    // the plume curls in its wake: an eddy set turning behind the tail every `every` s, one way then the other
    // (`omega` rad/s over r px, capped at `vmax` px/s, k of the way), from `from` px/step
    curl: { from: 2, every: 0.12, r: 30, omega: 5, vmax: 110, k: 0.5 },
  },
  // ---- THE BILLOWS THAT ARE SEEN (render/CarFxArt.js, drawn over the night like the chase's wind): flat squares in
  // a few tones with their lit corner a tone lighter, thinning in `steps`, that ride the modelled air (`ride` of its
  // velocity there, so they trail, are dragged by a wake and curl with it), keep `carry` of the speed of what threw
  // them (lost at `drag` 1/s), wander `drift` px/s, lean `lift` px/s as they rise (what a standing car's plume does:
  // it goes up the picture and aside instead of sitting on its hood) and swell (`grow`: their size at the end,
  // times). `most` alive at once (times the QUALITY's `fx`), the oldest let go. Tones: colours from the lit one
  // down, their opacity
  puffs: {
    most: 340, steps: 4, ride: 1, carry: 0.3, drag: 3, drift: 12, lift: [10, -20], grow: 1.9,
    tones: {
      white: { colors: ['#eef1f8', '#cfd4e0', '#aeb4c4'], alpha: 0.55 },
      grey: { colors: ['#b2b5c0', '#8c8f9c', '#6a6d7a'], alpha: 0.7 },
      black: { colors: ['#3a353c', '#221e24', '#131116'], alpha: 0.88 },
    },
  },
  // ---- TYRES. Rubber smoke through the air where they let go (the world's 'tyres': a burn-out as it pulls away, a
  // shove, a hard turn, a wreck sliding; the billows only off the wheels behind its middle: the others' would lie
  // over the car itself): white first (`steam`: gone in a second) and the grey that hangs, each
  // [per s standing, per px/step of the car's speed a step], over r px, never over `cap`. pop: a tyre shot out
  // (SMOKE.puffs.tyre, times `scale`). rim: from then on the bare rim throws sparks off the road from `from` px/step
  // (a shower: `per` sparks a s per px/step, `most` a s), its grind heard every `sound` s
  tyres: {
    lay: [['steam', 3, 0.012], ['smoke', 3, 0.02]], r: 8, cap: 0.8,
    puff: ['white', 26, 0.06, 4, 11, 0.5, 1.1],   // (a wheel)
    pop: { scale: 1.4 },
    rim: { from: 1.5, per: 16, most: 170, sound: 0.22 },
  },
  // the exhausts (the model's `pipes`, else its tail's corners at `at` of its width): a puff (SMOKE.puffs.exhaust
  // times `scale`) every `every` s while the car gains more than `from` px/step a second
  exhaust: { from: 4, every: 0.07, scale: 1.6, at: 0.3, puff: ['grey', 3, 6, 0.3, 0.6] }, // (puff: tone, px, s)
  // ---- SPARKS WHEREVER IT SCRAPES. A shower for as long as two things rub (a moving car against a wall, a kerb's
  // wall, a pole, a barrier, another car): showerRate = `per` sparks a s per px/step of rubbing speed over `from`,
  // `most` a s at most (two cars going the same way hardly slide on each other, yet their flanks grind: `lean` of the
  // speed they share counts as rubbing too); they leave the contact at `carry` [from, to] of the car's speed plus `kick` px/s any way,
  // thrown up at `up` px/s, bouncing `hops` times on the road and leaving a hot mark there `mark` of the time.
  //   light: a point light at the contact every `every` s [r from, r to, colour, s], larger the harder it rubs
  //   paint: a bright score along the bodywork of the cars that rub (Vehicle.scar), every `every` s, `most` a car
  //   sound: the grind (placeholder carGrind), every `every` s, `vol` at `full` px/step of rubbing
  //   slide: a wreck going on its own way (no driver left, a pursuer's exit): sparks from under it, a shower by its
  //   speed (`per`, `most`) from `from` px/step
  scrape: {
    from: 1, per: 30, most: 300, lean: 0.7, carry: [0.2, 0.8], kick: 90, up: [30, 150], hops: 2, mark: 0.5, life: [0.25, 0.7],
    light: { every: 0.06, r: [40, 78], color: '#ffb450', t: 0.09 },
    paint: { every: 0.1, most: 48 },
    sound: { every: 0.14, vol: 0.7, full: 8 },
    slide: { from: 1.5, per: 14, most: 150 },
  },
  // ---- ROUNDS ON A CAR (the world's 'carStruck': a round in a body panel): hot sparks off the metal, bouncing, a
  // glint; a window taken ('carPart'): more glass in the air [cracked, blown out] and a cold flash; the casings out
  // of his gun at the wheel (systems/CarGun.js): `casings` of them thrown (times the QUALITY's share)
  rounds: { sparks: 7, kick: 150, up: [40, 160], hops: 2, mark: 0.35, life: [0.2, 0.5], light: [34, '#ffd890', 0.06] },
  glass: { more: [8, 26], speed: 190, light: [56, '#cfeaff', 0.07] },
  casings: 1,
  // ---- A HARD KNOCK on the car he drives (the world's 'ride' beats): a breath of steam out of the grille
  // (SMOKE.puffs, times `scale`); the crash that kills him: steam and smoke out of the crumpled nose, sparks
  knock: { hit: ['spray', 1.2], clip: ['spray', 2], crash: { steam: 4, smoke: 3, sparks: 40 } },
  // ---- BOOM. A fire-ball in stages (looks only: no blast, nobody hurt; the real explosion is systems/Explosions.js,
  // and when it is a car's this is laid over it). R: its size, px.
  //   flash: a light of `flash` x R for `flashT` s at once (never the whole picture: Explosions.js keeps its flash off
  //   at the wheel), the shock front out to `front` x R
  //   core: [flames, px/s per px of R, size from, to]: a third of them white-hot, the rest born yellow; carried at
  //   `carry` of the car's speed
  //   lobes: at `lobesT` s, `lobes` balls of orange [flames each, px/s per px of R] thrown off its heart
  //   soot: at `sootT` s the billow goes into the modelled air (Smoke.blast over `soot` x R), `puffs` black billows
  //   (the seen ones) rolling out of it
  //   sparks / embers / glass: thrown all round at once
  //   debris: burning pieces [how many, px/s from, to, s they burn from, to]: they bounce and roll down the road
  //   trailing flame and soot (never touching a car: CarFx.piece), `tyre` of them a tyre
  //   pool: burning spots left on the road [how many, within x R, s from, to]
  //   pops: secondary pops [how many, s from, to] (CARFX.pop), where the wreck is by then
  //   shake: the picture's (whole px at the wheel: engine/Camera.js)
  boom: {
    // a pursuer stopped for good: its engine goes
    engine: { R: 60, flash: 2.6, flashT: 0.22, front: 1.5, core: [34, 3.2, 5, 12], carry: 0.75, lobes: 3, lobesT: 0.05, lobe: [10, 2.2], sootT: 0.1, soot: 1.1,
      puffs: 8, sparks: 46, embers: 22, glass: 14, debris: [3, 140, 330, 1.2, 2.6], tyre: 0.34, pool: [2, 0.5, 0.8, 1.8], pops: [1, 0.35, 0.8], shake: 0.4 },
    // a burning wreck slammed into what lines the road
    crash: { R: 84, flash: 2.8, flashT: 0.26, front: 1.6, core: [48, 3, 5, 13], carry: 0.3, lobes: 4, lobesT: 0.05, lobe: [12, 2], sootT: 0.1, soot: 1.25,
      puffs: 12, sparks: 70, embers: 36, glass: 22, debris: [5, 160, 380, 1.5, 3.2], tyre: 0.4, pool: [4, 0.6, 1.2, 3], pops: [2, 0.3, 1.1], shake: 0.55 },
    // over a car's real explosion (it has its own fire-ball, flash light, shake and scorch: this is what is thrown)
    car: { R: 120, flash: 0, flashT: 0, front: 0, core: [26, 3, 6, 14], carry: 0, lobes: 5, lobesT: 0.07, lobe: [12, 1.7], sootT: 0.16, soot: 1.2,
      puffs: 14, sparks: 60, embers: 30, glass: 30, debris: [7, 180, 430, 2, 4], tyre: 0, pool: [6, 0.6, 2, 5], pops: [3, 0.5, 2.2], shake: 0 },
  },
  // a secondary pop: a small ball of fire, sparks, a light, a lump of soot (placeholder carPop)
  pop: { flames: [14, 150], sparks: 18, light: [110, '#ffb060', 0.14], soot: 0.5, r: 16, shake: 0.12 },
  // a burning piece: flames [a step, px/s] and a thread of soot (per px it moved, r px) while it moves faster than
  // `from` px/step, its light [r, colour, s, chance a step]; thrown up at `up` px/s from `z` px, `bounce`
  piece: { flames: [1, 26], soot: [0.02, 5], from: 0.4, light: [44, '#ff8a30', 0.06, 0.25], up: [120, 300], z: 6, bounce: 0.55, kg: 6 },
  // ---- BUDGETS (a second, at QUALITY HIGH; times the level's `fx` share: data/quality.js; the lights by its
  // `fxLights`): what is over is simply not thrown. burning: pieces alight at once
  budget: { sparks: 520, burst: 90, lights: 30, burning: 12 },
};
