// What the player's hands come to in more than one of his modules (entities/player/*). DOM-free.

// whether the attack button (the left click, a pad's RB / RT) asks weapon d for a blow or a round this step: an
// automatic and a melee weapon while it is held, a semi-automatic on the step it goes down only
export const pulls = (d, input) => (d.kind === 'gun' && !d.auto ? input.mouseHit(0) : input.mouseDown(0));

export const WORN = 1e-6; // what is left of a weapon's wear (in blows) once it is used up
