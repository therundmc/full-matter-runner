// Weapon definitions. ammo = caliber (see AMMO), mag = magazine capacity, reload = seconds (per round when
// shellReload). A reload fills a fresh mag from the caliber pool; the old mag drops with whatever was left in it.
// Out of ammo? Throw the gun.
// hold: 'both' | 'side' | 'two' | 'melee'. grip = sprite x (from left, world px) where the hand holds it; bore = how far
// the barrel runs off the sprite's middle line (world px, - = toward its top). A gun fires from the end of its sprite
// on that line (CharacterAnim muzzleIn): rounds, muzzle flash, smoke and laser start there (tests/muzzle.test.mjs).
// palm = where the gun hand's centre is on a handgun (world px off the middle line, + = toward the grip).
// A pistol ('both') is held out in both hands, the arms a narrow triangle: the gun hand on the grip, under the slide
// and behind the trigger guard, the other hand closed over it on the butt; the two hide the grip.
// A machine pistol ('side') is held in one hand, arm out, turned on its side (the top of the slide toward the other
// shoulder), so that from above its side shows: hide = the line under which it is all in the fist (grip, guard,
// magazine well): that part is not drawn while the hand is closed on it. In the fist it is turned three-quarters
// (render/HandgunArt.js): deck = how wide (world px) the top of its slide shows then.
// A long gun ('two') is shouldered: butt = sprite x that sits in the shoulder, fore = sprite x of the front hand;
// onShoulder: carried on top of the shoulder (a launcher), over it.
// melee: swing = 'club' (long, swung with both hands, lies on the shoulder) | 'blade' (held low, stabs and cuts);
// heft 2 = smashes panes and doors; material = what it is made of (the crack of a blow, the item on the floor);
// rest: angle a club is carried at when it does not lie on the shoulder (a cue is held across the body, by its middle);
// thrust: its heavy stroke is a lunge, not an overhead smash; finisher: its own ground finisher (data/finishers.js);
// short: a club short enough for one hand (the other is free to take a man by the hair: data/finishers.js freeHand).
// wear: the blows the player's weapon takes (WEAR: a man counts one, a thing struck a share, the air nothing); the
// blow that uses it up breaks it (Character.breakWeapon) as `breaks`:
//   'snap'  it breaks in two: the far end (parts[0]) flies on along the swing, what is left in the hand is `snaps`
//           (a weapon of its own), else the stub (parts[1]) he looks at a beat and lets fall;
//   'lodge' it stays planted in what it struck (parts[0], the blade; without parts all of it), the handle (parts[1])
//           falls from the hand;
//   'bend'  steel: it bends into `bends`, a worse one;
//   'toss'  bent past use: he looks at it a beat and throws it away.
// parts: the sprites of its two pieces once broken, [far end, the end in the hand], cut from its own drawing
// (tools/generate_assets.py weapons()).
// gore: chance multiplier for dismemberment. wound: how the victim bleeds (data/wounds.js). noise: alert radius (0 = silent).
// pen: penetration energy of one round (systems/Penetration.js: plaster wall ~27, brick ~67, a body 14).
// casing: what the gun throws out after a shot (its sprite, and its kind in data/feel.js CASING), from its ejection
// port at sprite x `eject` (world px, on the bore line), to its right. load: the sprite of the round a shell reload
// pushes in by hand.
// A magazine gun's reload (data/feel.js RELOAD.mag, CharacterAnim): well = [x, y, rake, depth], the mouth of its
// magazine well (sprite x and y off the middle line, world px like grip and palm, + toward the grip), the way the
// magazine leans out of it (rad from straight down toward the muzzle) and how deep it goes in when seated (world px; the
// rest of magSprite shows under the gun). rack = the way the free hand works the action once it is seated: the points
// of the sprite (same px) it goes through, the first one where it takes hold (a slide's rear, a cocking knob, a
// charging handle, a bolt's handle). Its `_bare` sprite is the gun with its magazine out.
export const WEAPONS = {
  fists: {
    name: 'FISTS', kind: 'melee', hold: 'none', range: 21, arc: 1.1, rate: 0.32, lethal: false, sound: 'punch', windup: 0.05, wound: 'punch',
  },
  bat: {
    name: 'BASEBALL BAT', kind: 'melee', hold: 'melee', sprite: 'weapons/bat', grip: 3, range: 30, arc: 1.9, rate: 0.42,
    lethal: true, sound: 'punch', gore: 0.35, wound: 'blunt', windup: 0.07, points: 800, swing: 'club', heft: 2, material: 'wood',
    wear: 3, breaks: 'snap', parts: ['weapons/bat_head', 'weapons/bat_handle'], finisher: 'bat',
  },
  // heavier and shorter than a bat: it breaks what it lands on
  tire_iron: {
    name: 'TIRE IRON', kind: 'melee', hold: 'melee', sprite: 'weapons/tire_iron', grip: 3, range: 27, arc: 1.7, rate: 0.37,
    lethal: true, sound: 'punch', gore: 0.6, wound: 'blunt', windup: 0.06, points: 800, swing: 'club', heft: 2, material: 'metal',
    wear: 3, breaks: 'bend', bends: 'tire_iron_bent', short: true,
  },
  // ... bent over a man: slower, shorter, and it soon has to go
  tire_iron_bent: {
    name: 'BENT IRON', kind: 'melee', hold: 'melee', sprite: 'weapons/tire_iron_bent', grip: 3, range: 24, arc: 1.4, rate: 0.46,
    lethal: true, sound: 'punch', gore: 0.5, wound: 'blunt', windup: 0.08, points: 800, swing: 'club', heft: 2, material: 'metal',
    wear: 2, breaks: 'toss', short: true,
  },
  // long reach, quick; it soon snaps over a skull, and what is left is a stake
  cue: {
    name: 'POOL CUE', kind: 'melee', hold: 'melee', sprite: 'weapons/cue', grip: 13, rest: 0.5, range: 38, arc: 1.5, rate: 0.36,
    lethal: true, sound: 'punch', gore: 0.2, wound: 'blunt', windup: 0.06, points: 800, swing: 'club', heft: 1, material: 'wood',
    thrust: true, snaps: 'cue_half', finisher: 'cue', wear: 2, breaks: 'snap',
  },
  cue_half: {
    name: 'BROKEN CUE', kind: 'melee', hold: 'melee', sprite: 'weapons/cue_half', grip: 3, range: 26, arc: 1.2, rate: 0.25,
    lethal: true, sound: 'slash', gore: 0.2, wound: 'slash', windup: 0.04, points: 800, swing: 'blade', material: 'wood', bleed: true,
    finisher: 'stake', wear: 2, breaks: 'lodge',
  },
  knife: {
    name: 'COMBAT KNIFE', kind: 'melee', hold: 'melee', sprite: 'weapons/knife', grip: 3.5, range: 24, arc: 1.3, rate: 0.26,
    lethal: true, sound: 'slash', gore: 0.25, wound: 'slash', windup: 0.04, points: 800, bleed: true, swing: 'blade', material: 'metal',
    wear: 3, breaks: 'lodge', parts: ['weapons/knife_blade', 'weapons/knife_handle'],
  },
  pistol: {
    name: '1911', kind: 'gun', hold: 'both', sprite: 'weapons/pistol', grip: 3.4, bore: -1.75, palm: 2, mag: 7, ammo: '9mm', reload: 0.95, magSprite: 'weapons/mag_pistol', rate: 0.2, auto: false,
    pellets: 1, spread: 0.025, speed: 1700, pen: 16, sound: 'pistol', noise: 640, shake: 0.18, kick: 2.5, casing: 'casing', eject: 12, gore: 0.25, wound: 'small',
    enemyRate: 0.55, points: 500,
    well: [1.9, 2.75, -0.38, 6], rack: [[2.6, -2.4], [0.6, -2.4], [2.6, -2.4]], // the slide drawn back by its serrations
  },
  uzi: {
    name: 'UZI', kind: 'gun', hold: 'side', sprite: 'weapons/uzi', grip: 7, bore: -1.75, palm: 1.3, hide: 0, deck: 1, mag: 30, ammo: '9mm', reload: 1.15, magSprite: 'weapons/mag_uzi', rate: 0.065, auto: true,
    pellets: 1, spread: 0.11, speed: 1600, pen: 10, sound: 'uzi', noise: 640, shake: 0.12, kick: 1.5, casing: 'casing', eject: 14, gore: 0.2, wound: 'small',
    enemyRate: 0.09, burst: 5, points: 500,
    well: [7, 2.5, 0, 7], rack: [[8.8, -4], [6, -4], [8.8, -4]], // up the grip; the cocking knob on top
  },
  uzi_silenced: {
    name: 'SILENCED UZI', kind: 'gun', hold: 'side', sprite: 'weapons/uzi_silenced', grip: 7, bore: -1.75, palm: 1.3, hide: 0, deck: 1, mag: 30, ammo: '9mm', reload: 1.2, magSprite: 'weapons/mag_uzi', rate: 0.07, auto: true,
    pellets: 1, spread: 0.09, speed: 1600, pen: 8, sound: 'silenced', noise: 0, shake: 0.06, kick: 1, casing: 'casing', eject: 14, gore: 0.15, wound: 'quiet',
    enemyRate: 0.1, burst: 5, points: 700,
    well: [7, 2.5, 0, 7], rack: [[8.8, -4], [6, -4], [8.8, -4]],
  },
  shotgun: {
    name: 'SUPER 90', kind: 'gun', hold: 'two', sprite: 'weapons/shotgun', grip: 7.5, bore: -0.75, fore: 16, mag: 6, ammo: '12g', reload: 0.34, shellReload: true, rate: 0.55, auto: false,
    pellets: 9, spread: 0.3, speed: 1450, pen: 4, speedVar: 0.25, range: 0.32, sound: 'shotgun', noise: 760, shake: 0.5, kick: 7,
    casing: 'shell', eject: 14, load: 'weapons/shell', gore: 1.6, wound: 'buckshot', knock: 0.05, enemyRate: 1.1, points: 500,
  },
  rifle: {
    name: 'M16', kind: 'gun', hold: 'two', sprite: 'weapons/rifle', grip: 8.5, bore: -1, fore: 17, mag: 30, ammo: '762', reload: 1.45, magSprite: 'weapons/mag_rifle', rate: 0.095, auto: true,
    pellets: 1, spread: 0.045, speed: 1950, pen: 34, sound: 'rifle', noise: 760, shake: 0.2, kick: 2.5, casing: 'casing', eject: 15, gore: 0.45, wound: 'rifle',
    enemyRate: 0.12, burst: 4, points: 500,
    well: [12.75, 0.5, 0.45, 5], rack: [[11.4, -3], [11.4, -0.5], [11.4, -2.8]], // the bolt catch slapped, on its left side
  },
  sniper: {
    name: '.50 CAL', kind: 'gun', hold: 'two', sprite: 'weapons/sniper', grip: 8.5, fore: 17.5, mag: 5, ammo: '762', reload: 1.7, magSprite: 'weapons/mag_sniper', rate: 0.85, auto: false,
    pellets: 1, spread: 0.0, speed: 2800, pen: 95, heavy: true, laser: '#ff2e3e', sound: 'sniper', noise: 900, shake: 0.7, kick: 9, casing: 'casing', eject: 16,
    gore: 1.2, wound: 'heavy', enemyRate: 1.5, points: 600,
    well: [14.25, 1.25, 0, 3], rack: [[10.8, 0.9], [10.8, -0.8], [7.4, -0.8], [10.8, -0.8], [10.8, 0.9]], // the bolt: up, back, home, down
  },
  bazooka: {
    name: 'BAZOOKA', kind: 'gun', hold: 'two', sprite: 'weapons/bazooka', grip: 9, butt: 5.5, fore: 15, onShoulder: true, mag: 1, ammo: 'rocket', reload: 1.6, shellReload: true, load: 'weapons/rocket', rate: 0.9, auto: false,
    pellets: 1, spread: 0.0, speed: 520, rocket: true, sound: 'rocket', noise: 900, shake: 0.4, kick: 6, gore: 2,
    enemyRate: 2, points: 600,
  },
};

// What a blow that lands takes out of a weapon that wears (`wear`): a man (whatever comes of him), a thing (a piece
// of furniture, a door, a pane, a wall). A blow in the air takes nothing; one swing that lands on both counts the man.
export const WEAR = { man: 1, thing: 0.25 };
// what stays in a man weapon d breaks on (a sprite): its blade (all of a stake), the half a cue snaps into
export const plantedOf = (d) => (d.breaks === 'lodge' ? d.parts?.[0] ?? d.sprite : d.breaks === 'snap' && d.snaps ? WEAPONS[d.snaps].sprite : undefined);
// whether the hand keeps a weapon when d breaks (a cue's butt half, a bent iron)
export const keepsOne = (d) => !!(d.snaps || d.bends);

// map chars in level "actors" layers to weapon ids
export const WEAPON_CHARS = {
  1: 'pistol', 2: 'uzi', 3: 'shotgun', 4: 'rifle', 5: 'bat', 6: 'knife', 7: 'uzi_silenced', 8: 'bazooka', 9: 'sniper', 0: 'cue',
};

// Calibers: one ammo pool each for the player. rounds = size of a pickup box, max = how much you can carry.
// spent: how its spent case sounds on the floor (Audio CASINGS kind).
export const AMMO = {
  '9mm': { name: '9MM', spent: '9mm', rounds: 30, max: 180, sprite: 'weapons/ammo_9mm', color: '#f9c80e' },
  '12g': { name: '12 GAUGE', spent: 'hull', rounds: 8, max: 40, sprite: 'weapons/ammo_12g', color: '#ff2a6d' },
  '762': { name: '7.62', spent: '762', rounds: 30, max: 150, sprite: 'weapons/ammo_762', color: '#05d9e8' },
  rocket: { name: 'ROCKETS', rounds: 2, max: 6, sprite: 'weapons/ammo_rocket', color: '#ff6b1a' },
};

// actors-layer chars for ammo pickups (by caliber)
export const AMMO_CHARS = { n: '9mm', z: '9mm', v: '762', w: '762', g: '12g', q: 'rocket' };
