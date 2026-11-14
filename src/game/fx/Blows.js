// What a blow that lands sounds like and what flies off it, by what struck (weapon definition: swing, material), how
// (the heavy stroke or a sweep) and from which side of the victim. The flash, the star, the hit-stop and the shake
// are fx/Impact.js's (data/feel.js). DOM-free.
import { rand, angDiff } from '../../engine/math.js';

// where a blow going along `a` takes someone who looks along `facing`: 'behind' | 'side' | 'front'
export function blowFrom(facing, a) {
  const rel = Math.abs(angDiff(facing, a));
  return rel < 0.95 ? 'behind' : rel > 2.2 ? 'front' : 'side';
}

// how: { from, heavy }
export function blowFx(world, d, victim, a, how) {
  const P = world.particles, { x, y } = victim, back = a + Math.PI, club = d.swing === 'club', metal = d.material === 'metal';
  if (club) {
    // the crack of what it is made of over the blow itself: steel rings and sparks, wood knocks
    world.sound('clubHit', x, y, how.heavy ? 1 : 0.8, { material: d.material });
    if (metal) P.sparks(x, y, back, 0.9, how.heavy ? 6 : 3, 220);
    if (how.from === 'front') P.chips(x, y, a + rand(-0.5, 0.5), 0.9, 3, '#ece6d8', 150); // teeth
  }
  // brought down on him with everything: the floor takes its share
  if (how.heavy) P.dust(x, y, 7, 10, '#6a6272', { speed: 45, size: 4, life: 0.7, alpha: 0.2 });
  // a few drops off the blow itself, by what struck (the wound's own blood is the profile's business: data/wounds.js)
  const drops = Math.round((club ? 4 : 2) * (how.heavy ? 1.6 : 1));
  if (how.from === 'behind') P.blood(x, y, a, 0.35, drops, 260);        // off the back of his head, the way he falls
  else if (how.from === 'front') P.blood(x, y, back, 0.5, drops, 200); // his head snaps back
}
