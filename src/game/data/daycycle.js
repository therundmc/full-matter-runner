// The title screen's day: a whole day and night of the city in a loop of LOOP seconds, opening at sunset so the
// title comes up on the neons lighting. ui/title/Cycle.js reads it (the palette of any instant, the sun, the moon,
// the showers); ui/TitleScene.js paints with it. Pixel art: a keyframe's colours are mixed with the next one's, then
// held for STEP seconds, so the picture changes by palette steps and never by smooth gradients.
//
// A keyframe:
//   at        s into the loop; h: the hour it stands for (rising through the loop, past 24 after midnight)
//   sky       six bands from the top of the sky down to the city's horizon
//   cloud     the deck of cloud: its lit belly, its body, its back
//   light     what lights the solid things high up (the steel, the train, the towers' crowns): a multiply colour
//   low       the same at street level (the sodium coming up at night)
//   glass     what the towers' glass gives back of the sky (multiply colour); glassTop: their high floors (the first
//             and the last light of the sun catch them)
//   haze      [colour, amount 0..1]: the air between the towers and the buildings far off
//   lamps     0..1: the city's lights (neons, the line's floodlights, the train's lit cars; each comes on at its own
//             point of the way up); offices: 0..1 of the offices with somebody still in them
//   glint     0..1: the sun caught in the towers' panes; stars 0..1
export const DAY = {
  LOOP: 104,
  STEP: 0.5,
  keys: [
    { at: 0, h: 19.3, sky: ['#2c2c62', '#4a3a7a', '#7c4a88', '#c25a76', '#f07a50', '#ffb052'],
      cloud: ['#ffa462', '#8c4c6c', '#4c305c'], light: '#ffc49c', low: '#c08a7a', glass: '#d8846a', glassTop: '#ffb070',
      haze: ['#5a3a5c', 0.4], lamps: 0.04, offices: 1, glint: 0.7, stars: 0 },
    { at: 7, h: 20, sky: ['#141434', '#22204a', '#3a2a5e', '#5e3470', '#a04a72', '#e0705a'],
      cloud: ['#c05a6a', '#3e2a52', '#241a3a'], light: '#7a6c9c', low: '#9a7086', glass: '#4c3e78', glassTop: '#7a5084',
      haze: ['#6a4a7a', 0.3], lamps: 0.45, offices: 1, glint: 0, stars: 0.2 },
    { at: 14, h: 20.6, sky: ['#0c0c24', '#121434', '#1a1c46', '#262656', '#3a2e62', '#5a3a6a'],
      cloud: ['#4a3460', '#24203e', '#16142a'], light: '#4a4a7a', low: '#8a6070', glass: '#262850', glassTop: '#2e2c60',
      haze: ['#2a2448', 0.25], lamps: 0.85, offices: 0.95, glint: 0, stars: 0.6 },
    { at: 22, h: 22, sky: ['#09070f', '#0e0b1a', '#140f24', '#1c142e', '#281a36', '#38233c'],
      cloud: ['#2a1c36', '#1e1530', '#150f24'], light: '#363458', low: '#a06a50', glass: '#181c3a', glassTop: '#16183a',
      haze: ['#1a1428', 0.2], lamps: 1, offices: 0.8, glint: 0, stars: 1 },
    { at: 44, h: 27, sky: ['#07060d', '#0b0916', '#110d20', '#18122a', '#221832', '#302038'],
      cloud: ['#261a32', '#1a132c', '#130e22'], light: '#302e50', low: '#9a6450', glass: '#151834', glassTop: '#131532',
      haze: ['#181226', 0.2], lamps: 1, offices: 0.35, glint: 0, stars: 1 },
    { at: 54, h: 29.3, sky: ['#0e0c26', '#18163a', '#26204c', '#3c2c5c', '#5e3a66', '#7e4a6a'],
      cloud: ['#5a3a5e', '#2c2444', '#1c1834'], light: '#4c4c7c', low: '#8a6270', glass: '#262852', glassTop: '#3a3062',
      haze: ['#3a2c50', 0.3], lamps: 0.9, offices: 0.25, glint: 0, stars: 0.5 },
    { at: 60, h: 30, sky: ['#2a3266', '#4a4c88', '#7a64a0', '#c07aa0', '#f09a90', '#ffc08a'],
      cloud: ['#ffb0a0', '#9a7aa0', '#5a5080'], light: '#b8a0bc', low: '#9a849c', glass: '#8a7cae', glassTop: '#e8a092',
      haze: ['#5a4a74', 0.35], lamps: 0.3, offices: 0.2, glint: 0.2, stars: 0.05 },
    { at: 66, h: 31, sky: ['#4a6aa8', '#6a8ac0', '#94aad0', '#c8c0cc', '#f0c8a8', '#ffd8a0'],
      cloud: ['#fff0d8', '#c8b8c8', '#8a8aa8'], light: '#f0d8c0', low: '#c4b4b4', glass: '#a8b8d8', glassTop: '#ffd0a0',
      haze: ['#e0c8c0', 0.45], lamps: 0, offices: 0.4, glint: 0.8, stars: 0 },
    { at: 74, h: 33, sky: ['#4a7ec8', '#6292d4', '#7ea6dc', '#9cbce4', '#bcd0e8', '#d4dfea'],
      cloud: ['#ffffff', '#dde4ee', '#a8b4c8'], light: '#f4f4f4', low: '#d4d4dc', glass: '#a8c4e4', glassTop: '#c4daf0',
      haze: ['#c8d6e6', 0.45], lamps: 0, offices: 0, glint: 1, stars: 0 },
    { at: 86, h: 37, sky: ['#3c74c4', '#5288d0', '#6a9cd8', '#88b2e0', '#a8c6e6', '#c8d8e8'],
      cloud: ['#ffffff', '#e0e6f0', '#aab6ca'], light: '#ffffff', low: '#dcdce0', glass: '#a4c2e4', glassTop: '#c0d8f0',
      haze: ['#c4d4e6', 0.5], lamps: 0, offices: 0, glint: 1, stars: 0 },
    { at: 96, h: 41, sky: ['#4070b8', '#5884c4', '#7098cc', '#98b0d0', '#c8c4c8', '#e8d0b8'],
      cloud: ['#fff4e0', '#d8d0d0', '#a09ab0'], light: '#fff0d8', low: '#d8ccc4', glass: '#b0bcd8', glassTop: '#f0d8b8',
      haze: ['#b8a0a8', 0.35], lamps: 0, offices: 0.3, glint: 1, stars: 0 },
    { at: 100, h: 42.5, sky: ['#3a4a90', '#5a5a9a', '#8a6a98', '#d08a80', '#f8b070', '#ffd080'],
      cloud: ['#ffc070', '#b07a80', '#6a4a70'], light: '#ffd4a0', low: '#c89a88', glass: '#e0a880', glassTop: '#ffc080',
      haze: ['#7a5068', 0.35], lamps: 0, offices: 0.8, glint: 1, stars: 0 },
  ],

  // the sun and the moon cross the sky on a curve through `peak` (logical px of the title's picture), from `from` at
  // `rise` to `to` at `set` (s into the loop; past LOOP when it sets in the next one). The sun comes up behind the
  // right tower and goes down in the slit between the two, behind the buildings far off; the moon comes up over the
  // right tower after dusk and goes behind the left one before dawn.
  sun: { rise: 61, set: 107.5, from: [344, 50], peak: [318, 16], to: [200, 108], r: 6 },
  moon: { rise: 12, set: 58, from: [352, 52], peak: [236, 4], to: [36, 34], r: 4 },

  // planes crossing far off at night (s into the loop), from x `from` to `to` (logical px) at `speed` px/s
  planes: [17, 36], plane: { from: 290, to: 92, speed: 12 },

  // light showers that come and go (s into the loop, rising and dying over `fade` s; `amount` 0..1 of the rain's
  // full count, itself light): a drizzle in the night under the neons, a short sunshower in the afternoon
  showers: [
    { from: 26, to: 42, fade: 4, amount: 0.8 },
    { from: 88, to: 95, fade: 2.5, amount: 0.45 },
  ],
};
