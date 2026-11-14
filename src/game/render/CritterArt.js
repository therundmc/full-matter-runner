// Draws the street fauna of systems/Critters.js, a few pixels each: rats, the cat and pigeons on the ground (and
// the dead), flies; pigeons on the wing with their shadow, over the walls; moths in the light.

const PINK = '#d09a9a', INK = '#14151c';

// on the ground, over the furniture (the cat sits on things, rats come out from under them)
export function drawCritters(ctx, critters, t, vis) {
  for (const c of critters.list) {
    if (c.state === 'fly' || c.wait > 0 && c.kind === 'rat' || !vis(c.x, c.y)) continue;
    ctx.save();
    ctx.translate(Math.round(c.x), Math.round(c.y));
    ctx.rotate(c.a);
    ART[c.kind](ctx, c, t);
    ctx.restore();
  }
  ctx.fillStyle = '#0c0c0c';
  ctx.globalAlpha = 0.9;
  for (const s of critters.swarms()) {
    if (!vis(s.x, s.y)) continue;
    for (let i = 0; i < s.n; i++) {
      const ph = s.seed + i * 2.4;
      const x = s.x + Math.cos(t * (2.1 + i * 0.37) + ph) * s.r * (0.5 + (i % 3) * 0.25) + Math.sin(t * 5.3 + ph) * 1.5;
      const y = s.y + Math.sin(t * (2.7 + i * 0.29) + ph * 1.3) * s.r * (0.45 + (i % 2) * 0.4) + Math.cos(t * 6.1 + ph) * 1.5;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// pigeons in the air: bigger as they climb, wings beating, their shadow left on the ground
export function drawFlying(ctx, critters, t) {
  for (const c of critters.list) {
    if (c.state !== 'fly') continue;
    const s = 1 + c.z * 0.6, flap = Math.abs(Math.sin(t * 24 + c.ph)), span = 1.5 + 3.5 * flap;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(Math.round(c.x + c.z * 9 - 2), Math.round(c.y + c.z * 16 - 1), 4, 2);
    ctx.save();
    ctx.translate(Math.round(c.x), Math.round(c.y));
    ctx.rotate(c.a);
    ctx.scale(s, s);
    ctx.fillStyle = INK;
    ctx.fillRect(-2.5, -3 - span, 5, span * 2 + 6);
    ctx.fillStyle = '#d0d4dc';
    ctx.fillRect(-1.5, -2 - span, 3, span);
    ctx.fillRect(-1.5, 2, 3, span);
    ctx.fillStyle = '#6c7280';
    ctx.fillRect(-1.5, -2 - span, 3, 1);
    ctx.fillRect(-1.5, 1 + span, 3, 1);
    bird(ctx, 0);
    ctx.restore();
  }
}

// pale specks turning round the lamps, drawn over the night
export function drawMoths(ctx, critters, t, vis) {
  ctx.fillStyle = '#ffffff';
  for (const s of critters.lamps()) {
    if (!vis(s.x, s.y)) continue;
    for (let i = 0; i < s.n; i++) {
      const ph = s.seed + i * 2.1;
      const r = 6 + 11 * (0.5 + 0.5 * Math.sin(t * 1.7 + ph)), a = t * (2.2 + i * 0.7) * (i % 2 ? 1 : -1) + ph + Math.sin(t * 9 + ph) * 0.6;
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 31 + ph);
      // wings open, wings shut
      ctx.fillRect(Math.round(s.x + Math.cos(a) * r), Math.round(s.y + Math.sin(a) * r * 0.8), Math.sin(t * 43 + ph) > 0 ? 2 : 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// dark-edged so that it reads on any pavement
function bird(ctx, bob) {
  ctx.fillStyle = INK;
  ctx.fillRect(-6, -2, 3, 4);
  ctx.fillRect(-4, -3, 7, 6);
  ctx.fillRect(2 + bob, -2, 4, 4);
  ctx.fillStyle = '#6c7280';
  ctx.fillRect(-5, -1, 2, 2);          // tail
  ctx.fillStyle = '#b4bac6';
  ctx.fillRect(-3, -2, 5, 4);          // body
  ctx.fillStyle = '#6c7280';
  ctx.fillRect(-2, -2, 1, 4);          // the bars of its wings
  ctx.fillRect(0, -2, 1, 4);
  ctx.fillStyle = '#3e6a62';
  ctx.fillRect(2 + bob, -1, 2, 2);     // head, with its green sheen
  ctx.fillStyle = '#e8a030';
  ctx.fillRect(4 + bob, -0.5, 1, 1);   // beak
}

const ART = {
  rat(ctx, c, t) {
    const dead = c.state === 'dead';
    ctx.fillStyle = PINK;                 // the tail, whipping as it runs
    ctx.fillRect(-7, dead ? 0.5 : Math.round(Math.sin(t * 30 + c.ph)) * 0.5 - 0.5, 4, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(-4, -2.5, 9, 5);
    ctx.fillStyle = dead ? '#6a5c58' : '#4a3e3a';
    ctx.fillRect(-3, -1.5, 5, 3);
    ctx.fillStyle = dead ? '#5a4e4a' : '#5c4e48';
    ctx.fillRect(1, -1, 3, 2);
    ctx.fillStyle = dead ? '#7a1010' : PINK;
    ctx.fillRect(dead ? -1 : 3.5, -0.5, 1, 1);
  },

  pigeon(ctx, c, t) {
    if (c.state === 'dead') {
      ctx.fillStyle = INK;
      ctx.fillRect(-3, -6, 5, 4);
      ctx.fillStyle = '#d0d4dc';
      ctx.fillRect(-2, -5, 3, 3);         // a wing out
      bird(ctx, 0);
      ctx.fillStyle = '#7a1010';
      ctx.fillRect(-1, 0, 2, 1);
      return;
    }
    // a step is a nod; standing, it pecks now and then
    bird(ctx, c.walking ? Math.round(Math.sin(t * 14 + c.ph) * 0.5 + 0.5) : Math.sin(t * 3 + c.ph) > 0.7 ? 1 : 0);
  },

  cat(ctx, c, t) {
    const run = c.state === 'run', dead = c.state === 'dead', k = run ? Math.sin(t * 28 + c.ph) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-5, -1, 10, 4);
    ctx.fillStyle = '#b8601c';
    if (run) ctx.fillRect(-11, k - 0.5, 6, 1.5);                                  // tail streaming behind
    else { ctx.fillRect(-6, 1, 2, 1.5); ctx.fillRect(-7, 2, 1.5, dead ? 3 : 3 + Math.round(Math.sin(t * 2.2 + c.ph))); } // curled, flicking
    ctx.fillStyle = '#d87a2a';
    ctx.fillRect(run ? -5 - k : -4, -2, run ? 9 + k : 7, 4);                      // the back stretching in the gallop
    ctx.fillStyle = '#b8601c';
    ctx.fillRect(-2, -2, 1, 4);
    ctx.fillRect(0, -2, 1, 4);
    ctx.fillStyle = '#e89040';
    ctx.fillRect(3, -2, 3, 4);                                                    // head
    ctx.fillStyle = '#b8601c';
    ctx.fillRect(4, -3, 1, 1);
    ctx.fillRect(4, 2, 1, 1);                                                     // ears
    if (dead) { ctx.fillStyle = '#7a1010'; ctx.fillRect(-1, -1, 3, 2); }
  },
};
