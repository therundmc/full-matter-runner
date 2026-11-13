// Weapon definitions. ammo = caliber (see AMMO), mag = magazine capacity, reload = seconds (per round when
// shellReload). A reload fills a fresh mag from the caliber pool; the old mag drops with whatever was left in it.
// Out of ammo? Throw the gun.
// hold: 'one' | 'two' | 'melee'. grip = sprite x (from left) where the hand holds it.
// gore: chance multiplier for dismemberment. noise: alert radius (0 = silent).
export const WEAPONS = {
  fists: {
    name: 'FISTS', kind: 'melee', hold: 'none', range: 21, arc: 1.1, rate: 0.32, lethal: false, sound: 'punch', windup: 0.05,
  },
  bat: {
    name: 'BAT', kind: 'melee', hold: 'melee', sprite: 'weapons/bat', grip: 3, range: 30, arc: 1.9, rate: 0.42,
    lethal: true, sound: 'punch', gore: 0.35, windup: 0.07, points: 800,
  },
  knife: {
    name: 'KNIFE', kind: 'melee', hold: 'melee', sprite: 'weapons/knife', grip: 2, range: 24, arc: 1.3, rate: 0.26,
    lethal: true, sound: 'slash', gore: 0.25, windup: 0.04, points: 800, bleed: true,
  },
  pistol: {
    name: 'PISTOL', kind: 'gun', hold: 'one', sprite: 'weapons/pistol', grip: 2, mag: 12, ammo: '9mm', reload: 0.95, magSprite: 'weapons/mag_pistol', rate: 0.2, auto: false,
    pellets: 1, spread: 0.025, speed: 1700, sound: 'pistol', noise: 640, shake: 0.18, kick: 2.5, casing: 'casing', gore: 0.25,
    enemyRate: 0.55, points: 500,
  },
  uzi: {
    name: 'UZI', kind: 'gun', hold: 'one', sprite: 'weapons/uzi', grip: 3, mag: 30, ammo: '9mm', reload: 1.15, magSprite: 'weapons/mag_uzi', rate: 0.065, auto: true,
    pellets: 1, spread: 0.11, speed: 1600, sound: 'uzi', noise: 640, shake: 0.12, kick: 1.5, casing: 'casing', gore: 0.2,
    enemyRate: 0.09, burst: 5, points: 500,
  },
  uzi_silenced: {
    name: 'SILENCED UZI', kind: 'gun', hold: 'one', sprite: 'weapons/uzi_silenced', grip: 3, mag: 30, ammo: '9mm', reload: 1.2, magSprite: 'weapons/mag_uzi', rate: 0.07, auto: true,
    pellets: 1, spread: 0.09, speed: 1600, sound: 'silenced', noise: 0, shake: 0.06, kick: 1, casing: 'casing', gore: 0.15,
    enemyRate: 0.1, burst: 5, points: 700,
  },
  shotgun: {
    name: 'SHOTGUN', kind: 'gun', hold: 'two', sprite: 'weapons/shotgun', grip: 6, mag: 6, ammo: '12g', reload: 0.34, shellReload: true, rate: 0.55, auto: false,
    pellets: 9, spread: 0.3, speed: 1450, speedVar: 0.25, range: 0.32, sound: 'shotgun', noise: 760, shake: 0.5, kick: 7,
    casing: 'shell', gore: 1.6, knock: 0.05, enemyRate: 1.1, points: 500,
  },
  rifle: {
    name: 'M-47', kind: 'gun', hold: 'two', sprite: 'weapons/rifle', grip: 7, mag: 30, ammo: '762', reload: 1.45, magSprite: 'weapons/mag_rifle', rate: 0.095, auto: true,
    pellets: 1, spread: 0.045, speed: 1950, sound: 'rifle', noise: 760, shake: 0.2, kick: 2.5, casing: 'casing', gore: 0.45,
    enemyRate: 0.12, burst: 4, points: 500,
  },
  sniper: {
    name: 'SNIPER', kind: 'gun', hold: 'two', sprite: 'weapons/sniper', grip: 8, mag: 5, ammo: '762', reload: 1.7, magSprite: 'weapons/mag_sniper', rate: 0.85, auto: false,
    pellets: 1, spread: 0.0, speed: 2800, pierce: 4, sound: 'rifle', noise: 900, shake: 0.7, kick: 9, casing: 'casing',
    gore: 1.2, enemyRate: 1.5, points: 600,
  },
  bazooka: {
    name: 'BAZOOKA', kind: 'gun', hold: 'two', sprite: 'weapons/bazooka', grip: 9, mag: 1, ammo: 'rocket', reload: 1.6, shellReload: true, rate: 0.9, auto: false,
    pellets: 1, spread: 0.0, speed: 520, rocket: true, sound: 'rocket', noise: 900, shake: 0.4, kick: 6, gore: 2,
    enemyRate: 2, points: 600,
  },
};

// map chars in level "actors" layers to weapon ids
export const WEAPON_CHARS = {
  1: 'pistol', 2: 'uzi', 3: 'shotgun', 4: 'rifle', 5: 'bat', 6: 'knife', 7: 'uzi_silenced', 8: 'bazooka', 9: 'sniper',
};

// Calibers: one ammo pool each for the player. rounds = size of a pickup box, max = how much you can carry.
export const AMMO = {
  '9mm': { name: '9MM', rounds: 30, max: 180, sprite: 'weapons/ammo_9mm', color: '#f9c80e' },
  '12g': { name: '12 GAUGE', rounds: 8, max: 40, sprite: 'weapons/ammo_12g', color: '#ff2a6d' },
  '762': { name: '7.62', rounds: 30, max: 150, sprite: 'weapons/ammo_762', color: '#05d9e8' },
  rocket: { name: 'ROCKETS', rounds: 2, max: 6, sprite: 'weapons/ammo_rocket', color: '#ff6b1a' },
};

// actors-layer chars for ammo pickups (by caliber)
export const AMMO_CHARS = { n: '9mm', z: '9mm', v: '762', w: '762', g: '12g', q: 'rocket' };
