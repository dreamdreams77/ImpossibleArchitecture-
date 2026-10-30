import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { propagate, throughFaces, ambientFrom, disagreements, portalOpen } from '../src/topology/propagation.js';
import { neighbourMix } from '../src/ui/sound.js';

// a - b - c in a row on the graph, but d sits right beside a on the plan with no passage.
function world({ gate = null } = {}) {
  const s = new Structure();
  for (const [id, x, y] of [['a', 0, 0], ['b', 9, 0], ['c', 18, 0], ['d', 1, 0]]) s.addRoom({ id, x, y });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  s.addPortal({ a: 'b', aFace: 'E', b: 'c', bFace: 'W', gate });
  return s;
}

test('signals follow the graph, not the plan: far rooms are near, adjacent strangers are silent', () => {
  const r = propagate(world(), 'a');
  assert.ok(r.get('b').strength > 0.3);
  assert.ok(r.get('c').strength < r.get('b').strength, 'fades with each hop');
  assert.equal(r.has('d'), false, 'next door on the plan, no passage, nothing');
  assert.equal(r.get('c').hops, 2);
  assert.equal(r.get('c').via, 'E');
});

test('a shut gate dulls what lies beyond it, and a lit plate restores it', () => {
  const s = world({ gate: 0 });
  const shut = propagate(s, 'a', 'sound', { lit: 0 }).get('c')?.strength ?? 0;
  const open = propagate(s, 'a', 'sound', { lit: 1 }).get('c').strength;
  assert.ok(open > shut * 3);
  assert.equal(portalOpen(s.portals.get([...s.portals.keys()][1]), 0), false);
  // Light comes through the bars better than sound does.
  const lightShut = propagate(s, 'a', 'light', { lit: 0 }).get('c').strength / propagate(s, 'a', 'light', { lit: 1 }).get('c').strength;
  assert.ok(lightShut > shut / open);
});

test('loops terminate and a room takes its best route', () => {
  const s = world();
  s.addPortal({ a: 'a', aFace: 'N', b: 'c', bFace: 'N' }); // a shortcut: c is now one hop from a
  s.addPortal({ a: 'b', aFace: 'N', b: 'b', bFace: 'S' }); // and b opens onto itself
  const r = propagate(s, 'a');
  assert.equal(r.get('c').hops, 1);
  assert.equal(r.get('c').via, 'N');
  assert.ok(r.get('b').strength > 0);
});

test('through-face sums what lies beyond each doorway and ambient light sums the lamps', () => {
  const s = world();
  const f = throughFaces(s, 'a');
  assert.deepEqual(Object.keys(f), ['E']);
  assert.ok(f.E > propagate(s, 'a').get('b').strength - 1e-9);
  assert.ok(ambientFrom(s, 'a', ['c']) > 0);
  assert.equal(ambientFrom(s, 'a', ['d']), 0);
  assert.equal(ambientFrom(s, 'a', ['a']), 0);
});

test('graph and plan distance disagree where the interesting rooms are', () => {
  const s = world();
  s.addPortal({ a: 'a', aFace: 'S', b: 'c', bFace: 'S' });
  const top = disagreements(s, 'a')[0];
  assert.equal(top.room, 'c');
  assert.equal(top.hops, 1);
});

test('audio reach: a deep open enfilade carries more than a closet, a sealed one nothing', () => {
  const near = neighbourMix({ reach: 0.1 }).gain;
  const deep = neighbourMix({ reach: 0.9 }).gain;
  assert.ok(deep > near);
  assert.ok(neighbourMix({ shut: true, reach: 0.05 }).gain < neighbourMix({ reach: 0.05 }).gain);
});
