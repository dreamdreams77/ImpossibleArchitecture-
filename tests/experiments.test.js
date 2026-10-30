import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { loopExperiments, walkLoop, judge } from '../src/campaign/experiments.js';
import { makeTraveller, step } from '../src/topology/traversal.js';
import { findCycles } from '../src/topology/analysis.js';
import { Session } from '../src/game.js';

const ring = (n, transforms = []) => {
  const s = new Structure();
  for (let i = 0; i < n; i++) s.addRoom({ id: `r${i}`, x: i * 3, y: 0 });
  for (let i = 0; i < n; i++) s.addPortal({ a: `r${i}`, aFace: 'E', b: `r${(i + 1) % n}`, bFace: 'W', transform: { turns: 0, mirror: false, ...(transforms[i] ?? {}) } });
  return s;
};

test('no loops, no experiments', () => {
  const s = new Structure(); s.addRoom({ id: 'a', x: 0, y: 0 }); s.addRoom({ id: 'b', x: 3, y: 0 });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  assert.deepEqual(loopExperiments(s), []);
});

test('the answer is what the engine\'s own walk gives, for plain, turning and half-turning loops', () => {
  const plain = loopExperiments(ring(3))[0];
  assert.ok(['E', 'W'].includes(plain.answer), 'a plain ring leaves you facing the way you last moved');
  const quarter = loopExperiments(ring(3, [{ turns: 1 }]))[0];
  assert.notEqual(quarter.answer, plain.answer);
  const half = loopExperiments(ring(3, [{ turns: 2 }]))[0];
  assert.equal(half.answer, { E: 'W', W: 'E' }[plain.answer], 'a half-turn loop reverses it');
  // Independent check: walk the faces by hand.
  let t = makeTraveller('r0', 'N');
  for (const f of half.faces) t = step(ring(3, [{ turns: 2 }]), t, f);
  assert.equal(t.heading, half.answer);
});

test('a self-loop is an experiment, a one-way ring is walkable one way, a blocked loop is not offered', () => {
  const s = new Structure(); s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addPortal({ a: 'a', aFace: 'E', b: 'a', bFace: 'N', transform: { turns: 1, mirror: false } });
  assert.equal(loopExperiments(s).length, 1);
  const r = ring(3); for (const p of r.portals.values()) p.oneWay = 'a';
  assert.equal(loopExperiments(r).length >= 1, true);
  const blocked = ring(3); [...blocked.portals.values()][0].oneWay = 'a'; [...blocked.portals.values()][1].oneWay = 'b';
  assert.equal(loopExperiments(blocked).length, 0, 'opposed one-way passages: nobody can walk it');
  assert.equal(findCycles(blocked).length, 1);
});

test('judging and Session reward a correct prediction once per loop', () => {
  assert.equal(judge({ answer: 'S' }, 'S').correct, true);
  assert.equal(judge({ answer: 'S' }, 'x').correct, false);
  const s = new Session(); s.startSandbox();
  s.addRoomAt(0, 0);
  const a = [...s.structure.rooms.keys()][0];
  s.pickFace(a, 'E'); s.pickFace(a, 'N');
  const e = s.experiment();
  assert.ok(e);
  const wrong = ['N', 'E', 'S', 'W'].find((h) => h !== e.answer);
  assert.equal(s.answerExperiment(wrong).correct, false);
  assert.ok(!s.progress.discoveries.includes(e.id));
  assert.equal(s.answerExperiment(e.answer).correct, true);
  assert.ok(s.progress.discoveries.includes(e.id));
  const n = s.progress.discoveries.length;
  s.answerExperiment(e.answer);
  assert.equal(s.progress.discoveries.length, n, 'not rewarded twice');
});
