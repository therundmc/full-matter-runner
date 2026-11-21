// The numbers of the game's frame round the world (Game.js and src/game/flow/: the camera's look-ahead, a death's
// beat, the clock's easing, the muffle, the flash, the guards on a click, the menu's mouse, the backdrop and the
// vignette drawn outside the lens). DOM-free.
export const GAME = {
  // the look-ahead toward the cursor (PLAYER.lookAhead / lookAheadFar of the way to it), at most `max` world px, `far`
  // with SHIFT held (looking further: flow/CameraDirector.js)
  look: { max: 110, far: 260 },
  // the player's death (LevelFlow.onPlayerDeath): slow motion [time scale, s], the camera's shake, a flash
  death: { slowmo: [0.18, 1.6], shake: 0.8, flash: { color: '#ff2040', a: 0.5 } },
  // the time scale eased toward its target: the share of the gap still left after one real s (systems/TimeScale.js)
  ease: 0.001,
  // the world's sound muffled: on the death screen, and in slow motion (`slow` x (1 - time scale))
  muffle: { dead: 0.75, slow: 0.7 },
  // a flash's alpha lost a real s
  flash: { fade: 3 },
  // s a screen has been up before a click or a key may leave it (he may have reached it clicking): the death
  // screen's click, the results' ESC / B and their going on, the hit list between two levels
  guard: { dead: 0.5, results: 0.3, hitlist: 1 },
  // s the mouse rests on one of OPTIONS' things, crossed on its way right to the sheet, before that thing's sheet
  // shows (flow/MenuInput.js pointed)
  dwell: 0.15,
  // s F6's label (the lens on / off, the developer's) stays up
  lensNote: 1.6,
  // the backdrop outside the map (render/FrameRenderer.js): a diagonal gradient whose middle drifts at `rate` by
  // `swing` about the middle, held on steps of `step` (share of its diagonal); `flat` under a map that fills the picture
  backdrop: { from: '#12061f', mid: '#2a0a3a', to: '#07030c', flat: '#12061f', rate: 0.3, swing: 0.3, step: 0.005 },
  // the 2D vignette and scanlines, without the lens: clear within `inner` of the half diagonal, `edge` at the corners;
  // a scanline every `lines` px of height (at least 2), at `scan` alpha
  vignette: { inner: 0.45, color: '10,0,20', edge: 0.7, scan: 0.07, lines: 360 },
};
