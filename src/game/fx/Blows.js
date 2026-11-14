// What a blow that lands looks and sounds like, by what struck (weapon definition: swing, material), how (the
// heavy stroke or a sweep) and from which side of the victim. DOM-free.
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
    world.sound(metal ? 'metal' : 'wood', x, y, how.heavy ? 1 : 0.8, { pitch: metal ? 0.8 : 1.15 });
    if (metal) P.sparks(x, y, back, 0.9, how.heavy ? 6 : 3, 220);
    if (how.from === 'front') P.chips(x, y, a + rand(-0.5, 0.5), 0.9, 3, '#ece6d8', 150); // teeth
  }
  if (how.heavy) {
    // brought down on him with everything: the floor takes its share
    P.dust(x, y, 7, 10, '#6a6272', { speed: 45, size: 4, life: 0.7, alpha: 0.2 });
    world.shake(club ? 0.34 : 0.2);
    world.hitstop(club ? 0.1 : 0.07);
  } else world.shake(club ? 0.2 : 0.1);
  if (how.from === 'behind') P.blood(x, y, a, 0.35, 10, 260);      // off the back of his head, the way he falls
  else if (how.from === 'front') P.blood(x, y, back, 0.5, 8, 200); // his head snaps back
}
