// Where a wound shows on a body lying on the floor (data/wounds.js MARKS): bullet holes, a blade's cut, the blood of
// a blow, each put on the torso or the head, in that part's own frame (px from its centre, +y toward the feet on
// the torso), clear of its edges. Plain data, drawn by render/BodyMarkArt.js through entities/Ragdoll.js.
import { rand, randi, chance } from '../../engine/math.js';

const HEAD_ODDS = 0.25; // of a wound that may be anywhere

// one mark of `spec` on a body { tw, th: the torso across and along, head: the head's radius, 0 without one }
export function markAt(spec, body) {
  const size = rand(...spec.size), j = [rand(-1, 1), rand(0, 1), rand(-1, 1)];
  const onHead = spec.where === 'head' || (spec.where === 'any' && chance(HEAD_ODDS));
  if (onHead) {
    if (!body.head) return null; // it went with the head
    const s = Math.min(size, body.head * 0.9), a = rand(0, Math.PI * 2), d = Math.max(0, body.head - s / 2 - 1) * Math.sqrt(rand(0, 1));
    return { part: 'head', kind: spec.kind, size: s, x: Math.cos(a) * d, y: Math.sin(a) * d, a: rand(0, Math.PI), j };
  }
  const { tw, th } = body, across = spec.kind === 'cut';
  if (spec.where === 'neck') return { part: 'torso', kind: spec.kind, size: Math.min(size, tw * 0.5), x: rand(-1, 1), y: -th / 2 + 2, a: rand(-0.25, 0.25), j };
  const hx = Math.max(0, tw / 2 - (across ? size * 0.45 : size / 2) - 1.5);
  return {
    part: 'torso', kind: spec.kind, size, x: rand(-hx, hx), y: rand(-th / 2 + size / 2 + 2.5, th / 2 - size / 2 - 4),
    a: across ? rand(-0.7, 0.7) : rand(0, Math.PI), j,
  };
}

// every mark a wound leaves (spec: its MARKS entry, or nothing)
export function bodyMarks(spec, body) {
  if (!spec) return [];
  const out = [];
  for (let i = randi(spec.n[0], spec.n[1]); i > 0; i--) {
    const m = markAt(spec, body);
    if (m) out.push(m);
  }
  return out;
}
