// The passage algebra, checked against an independent model.
//
// Each passage is a map between two rooms' compasses: an element of the symmetry group of the square
// (four rotations, four reflections). Crossing from end a applies the map; crossing from end b applies its
// inverse. The model below builds those maps from first principles (vectors on the compass), without
// using the engine, and every test compares the engine's answer to the model's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure, FACES } from '../src/topology/graph.js';
import { makeTraveller, step, findRoute } from '../src/topology/traversal.js';
import { portalLocalTransform, geometricArrivalHeading, headingYaw, yawHeading, arrivalTurn } from '../src/render3d/frames.js';

// ---- the model: compass directions as unit vectors, maps as 2x2 integer matrices (x east, y north)
const VEC = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
const face = ([x, y]) => FACES.find((f) => VEC[f][0] === x && VEC[f][1] === y);
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
const ID = [1, 0, 0, 1];
const ROT_CW = [0, 1, -1, 0]; // one quarter turn clockwise seen from above: N -> E
const rot = (n) => { let m = ID; for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = mul(ROT_CW, m); return m; };
// Rotation taking unit vector u to unit vector v.
const rotTo = (u, v) => { for (let n = 0; n < 4; n++) { const r = rot(n); const w = apply(r, u); if (w[0] === v[0] && w[1] === v[1]) return r; } throw new Error('no rotation'); };
// Reflection that fixes the axis of u (and so the line of travel through a door facing u).
const reflectAlong = (u) => (u[0] !== 0 ? [1, 0, 0, -1] : [-1, 0, 0, 1]);
const inv = (m) => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d]; };
const det = (m) => m[0] * m[3] - m[1] * m[2];
const neg = (v) => [-v[0], -v[1]];

// The map of a passage from face fa (in room A) to face fb (in room B): straight in, reflected across the
// line of travel if mirrored, then turned.
function passageMap(fa, fb, turns, mirror) {
  const straight = rotTo(VEC[fa], neg(VEC[fb]));
  const m = mirror ? mul(straight, reflectAlong(VEC[fa])) : straight;
  return mul(rot(turns), m);
}

function pair(fa, fb, turns, mirror, oneWay = null) {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 }); s.addRoom({ id: 'b', x: 9, y: 4 });
  s.addPortal({ a: 'a', aFace: fa, b: 'b', bFace: fb, transform: { turns, mirror }, oneWay });
  return s;
}

const ALL = [];
for (const fa of FACES) for (const fb of FACES) for (const turns of [0, 1, 2, 3]) for (const mirror of [false, true]) ALL.push([fa, fb, turns, mirror]);

test('forward crossings arrive where the model says, and a mirror only flips parity', () => {
  for (const [fa, fb, turns, mirror] of ALL) {
    const t = step(pair(fa, fb, turns, mirror), makeTraveller('a', fa), fa);
    const m = passageMap(fa, fb, turns, mirror);
    assert.equal(t.room, 'b');
    assert.equal(t.heading, face(apply(m, VEC[fa])), `${fa}->${fb} t${turns} m${mirror}`);
    assert.equal(t.mirrored, det(m) < 0, 'parity is the sign of the map');
  }
});

test('reverse crossings apply the inverse map, so walking back undoes the passage', () => {
  for (const [fa, fb, turns, mirror] of ALL) {
    const s = pair(fa, fb, turns, mirror);
    const back = step(s, makeTraveller('b', fb), fb);
    const m = inv(passageMap(fa, fb, turns, mirror));
    assert.equal(back.room, 'a');
    assert.equal(back.heading, face(apply(m, VEC[fb])), `${fb}->${fa} t${turns} m${mirror}`);
  }
});

test('there and back again: the round trip is the identity on the traveller\'s frame', () => {
  for (const [fa, fb, turns, mirror] of ALL) {
    const s = pair(fa, fb, turns, mirror);
    const m = passageMap(fa, fb, turns, mirror);
    const there = step(s, makeTraveller('a', fa), fa);
    const home = step(s, there, fb);
    // The composed map is the identity, so parity is restored, and the arrival home is the reverse of
    // the step that left through fb as the model maps it.
    assert.deepEqual(mul(inv(m), m), ID);
    assert.equal(home.room, 'a');
    assert.equal(home.mirrored, false, `${fa}<->${fb} t${turns} m${mirror}`);
    assert.equal(home.heading, face(apply(inv(m), VEC[fb])));
  }
});

test('one-way passages refuse the reverse crossing and say so', () => {
  const s = pair('E', 'W', 1, false, 'a');
  assert.ok(step(s, makeTraveller('a', 'E'), 'E'));
  assert.equal(step(s, makeTraveller('b', 'W'), 'W'), null);
  assert.equal(s.exit('b', 'W').blocked, true);
});

test('chains compose: the heading after many crossings is the model\'s, and parity is the product', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + rnd(5);
    const s = new Structure();
    for (let i = 0; i < n; i++) s.addRoom({ id: `r${i}`, x: rnd(20), y: rnd(20) });
    const passages = [];
    for (let i = 0; i < n; i++) {
      const a = `r${i}`; const b = `r${rnd(n)}`;
      const fa = FACES[rnd(4)]; const fb = FACES[rnd(4)];
      if (s.portalAt(a, fa) || s.portalAt(b, fb) || (a === b && fa === fb)) continue;
      const turns = rnd(4); const mirror = rnd(2) === 1;
      s.addPortal({ a, aFace: fa, b, bFace: fb, transform: { turns, mirror } });
      passages.push({ a, fa, b, fb, turns, mirror });
    }
    // Walk at random; check every crossing against the model, and parity against the running product.
    let t = makeTraveller('r0', 'N');
    let sign = 1;
    for (let k = 0; k < 25; k++) {
      const f = FACES[rnd(4)];
      const hit = s.portalAt(t.room, f);
      if (!hit) continue;
      const p = passages.find((q) => (hit.end === 'a' ? q.a === t.room && q.fa === f : q.b === t.room && q.fb === f));
      const m = passageMap(p.fa, p.fb, p.turns, p.mirror);
      const map = hit.end === 'a' ? m : inv(m);
      const next = step(s, t, f);
      assert.equal(next.heading, face(apply(map, VEC[f])), `trial ${trial} step ${k}`);
      sign *= det(map);
      assert.equal(next.mirrored, sign < 0);
      t = next;
    }
  }
});

test('self-loops: a room joined to itself maps by the passage one way and its inverse the other', () => {
  for (const [fa, fb, turns, mirror] of ALL) {
    if (fa === fb) continue;
    const s = new Structure();
    s.addRoom({ id: 'r', x: 0, y: 0 });
    s.addPortal({ a: 'r', aFace: fa, b: 'r', bFace: fb, transform: { turns, mirror } });
    const m = passageMap(fa, fb, turns, mirror);
    const out = step(s, makeTraveller('r', fa), fa);
    assert.equal(out.room, 'r');
    assert.equal(out.heading, face(apply(m, VEC[fa])));
    const back = step(s, makeTraveller('r', fb), fb);
    assert.equal(back.heading, face(apply(inv(m), VEC[fb])));
  }
});

test('loops: a twisted passage turns you on arrival, one mirror per lap reflects you, two cancel', () => {
  const ring = (transforms) => {
    const s = new Structure();
    for (let i = 0; i < 4; i++) s.addRoom({ id: `r${i}`, x: i * 3, y: 0 });
    transforms.forEach((tr, i) => s.addPortal({ a: `r${i}`, aFace: 'E', b: `r${(i + 1) % 4}`, bFace: 'W', transform: tr }));
    return s;
  };
  const lap = (s) => { let t = makeTraveller('r0', 'E'); for (let i = 0; i < 4; i++) t = step(s, t, 'E') ?? t; return t; };
  // With turns, the next door east is no longer ahead; walk the loop by its faces instead.
  const walk = (s) => { let t = makeTraveller('r0', 'E'); for (let i = 0; i < 4; i++) t = step(s, t, 'E'); return t; };
  const plain = walk(ring([{ turns: 0 }, { turns: 0 }, { turns: 0 }, { turns: 0 }]));
  assert.equal(plain.room, 'r0'); assert.equal(plain.heading, 'E'); assert.equal(plain.mirrored, false);
  // The twisted passage turns the traveller as they arrive; the loop still closes on the same room.
  const twisted = ring([{ turns: 1 }, { turns: 0 }, { turns: 0 }, { turns: 0 }]);
  assert.equal(step(twisted, makeTraveller('r0', 'E'), 'E').heading, 'S', 'turned a quarter on arrival');
  assert.equal(walk(twisted).room, 'r0');
  const reflected = lap(ring([{ mirror: true }, {}, {}, {}]));
  assert.equal(reflected.room, 'r0'); assert.equal(reflected.mirrored, true, 'one mirror per lap reflects you');
  const twice = lap(ring([{ mirror: true }, { mirror: true }, {}, {}]));
  assert.equal(twice.mirrored, false, 'two mirrors cancel');
});

test('the 3D crossing matrices agree with the engine in both directions, and mirrors reverse handedness', () => {
  for (const [fa, fb, turns, mirror] of ALL) {
    const s = pair(fa, fb, turns, mirror);
    for (const [from, f, to, g] of [['a', fa, 'b', fb], ['b', fb, 'a', fa]]) {
      const e = s.exit(from, f);
      const T = portalLocalTransform({ faceA: f, halfA: 4, faceB: g, halfB: 5, mirror });
      const geo = geometricArrivalHeading(f, T);
      assert.equal(yawHeading(headingYaw(geo) + arrivalTurn(e.turnsApplied)), e.entryHeading, `${from}:${f}->${g} t${turns} m${mirror}`);
      assert.equal(T.determinant() < 0, mirror);
      assert.equal(e.room, to);
    }
  }
});

test('route search respects parity: a goal that needs a reflection is found only through a mirror', () => {
  const s = pair('E', 'W', 0, false);
  assert.equal(findRoute(s, 'a', (t) => t.room === 'b' && t.mirrored), null);
  const m = pair('E', 'W', 0, true);
  assert.deepEqual(findRoute(m, 'a', (t) => t.room === 'b' && t.mirrored), ['E']);
});
