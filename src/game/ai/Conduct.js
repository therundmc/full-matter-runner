// A word with a stranger, worked out (no DOM, no world access, unit tested). A guard who saw him do something odd
// (data/conduct.js ACTS) opens a Case: he walks over (stage 0), tells him (1), warns him (2), shoves him (3), and then
// the fight is on (4). At each stage the stranger is given a while to comply; doing it again moves the guard on at
// once; once he has complied long enough he is let off, and if he gets out of sight the guard lets it go. A man let
// off is remembered a while: his next case opens a stage further on. Tuning: Config AI.challenge.
import { AI } from '../Config.js';
import { ACTS } from '../data/conduct.js';

export const STAGE = { GO: 0, TOLD: 1, WARNED: 2, SHOVED: 3, FIGHT: 4 };

export class Case {
  // act: a key of ACTS; at: where it was done { x, y }; stage: the stage it opens at once he is there (see opening)
  constructor(act, at, now, open = STAGE.TOLD) {
    this.act = act;
    this.at = { x: at.x, y: at.y };
    this.open = open;
    this.stage = STAGE.GO;
    this.t = now;       // when the stage under way began
    this.okT = 0;       // s he has been complying
    this.lost = 0;      // s out of sight
    this.again = false; // he did it again since the last look (see judge)
  }

  get rules() { return ACTS[this.act]; }

  // s given at the stage under way
  wait(C = AI.challenge) {
    const w = this.rules.wait ?? C.wait;
    return w[Math.min(w.length, Math.max(1, this.stage)) - 1];
  }

  // seen at it (or at something else) during the talk: a lasting act he is still at is not news; a worse one
  // becomes the case; again = false: the same doing seen another way (a pane put in is heard as glass too)
  saw(act, again = true) {
    if (act === this.act && this.rules.lasting) return false;
    if ((ACTS[act]?.rank ?? 0) > this.rules.rank) this.act = act;
    if (again) this.again = true;
    return again;
  }

  // on to the next stage (at once to the opening one on getting there)
  next(now) {
    this.stage = this.stage === STAGE.GO ? this.open : Math.min(STAGE.FIGHT, this.stage + 1);
    this.t = now;
    this.okT = 0;
    this.again = false;
    return this.stage;
  }
}

// The stage a case opens at: told, or warned straight away when he was let off once in the last C.memory s.
export function opening(letOff, now, C = AI.challenge) {
  return letOff.some((t) => now - t < C.memory) ? STAGE.WARNED : STAGE.TOLD;
}

// Once the guard is talking to him (stage 1..3): 'drop' (out of sight too long: let it go), 'escalate' (did it again,
// or did not comply in time), 'settle' (complied long enough: let off), else 'wait'. complied: whether he is doing
// as told now; an act whose compliance is only not doing it again is watched for the whole wait of the stage.
export function judge(c, { complied, lost }, now, dt, C = AI.challenge) {
  if (lost > C.lost) return 'drop';
  if (c.again) return 'escalate';
  const wait = c.wait(C);
  if (complied) {
    c.okT += dt;
    if (c.okT >= (c.rules.comply === 'calm' ? wait : C.settle)) return 'settle';
    return 'wait';
  }
  c.okT = 0;
  return now - c.t >= wait ? 'escalate' : 'wait';
}

// Whether he is doing as told: off the premises, empty-handed, off the spot, or (a 'calm' act) simply not at it.
// p: { x, y, armed }, inPremises: whether p is in the guarded premises
export function complies(c, p, inPremises) {
  switch (c.rules.comply) {
    case 'leave': return !inPremises;
    case 'unarmed': return !p.armed;
    case 'away': return Math.hypot(p.x - c.at.x, p.y - c.at.y) > (c.rules.away ?? 96);
    default: return true;
  }
}
