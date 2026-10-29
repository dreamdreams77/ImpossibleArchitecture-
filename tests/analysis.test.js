import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { findCycles, dimensionReport } from '../src/topology/analysis.js';

test('a self-loop is a cycle of length one with its own twist', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addPortal({ id: 'p', a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 2 } });
  const cycles = findCycles(s);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 1);
  assert.equal(cycles[0].netTurns, 2);
  assert.equal(cycles[0].reflected, false);
});

test('two portals between the same pair of rooms form a two-cycle', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ id: 'p1', a, aFace: 'E', b, bFace: 'W', transform: { turns: 1 } });
  s.addPortal({ id: 'p2', a, aFace: 'S', b, bFace: 'N', transform: { turns: 2, mirror: true } });
  const cycles = findCycles(s);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 2);
  assert.equal(cycles[0].netTurns, 3);
  assert.equal(cycles[0].reflected, true);
});

test('a tree has no cycles', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  const c = s.addRoom({ id: 'c', x: 2, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  s.addPortal({ a: b, aFace: 'E', b: c, bFace: 'W' });
  assert.equal(findCycles(s).length, 0);
});

test('a triangle is found once, with its net twist summed', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  const c = s.addRoom({ id: 'c', x: 0, y: 1 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', transform: { turns: 1 } });
  s.addPortal({ a: b, aFace: 'S', b: c, bFace: 'N', transform: { turns: 1 } });
  s.addPortal({ a: c, aFace: 'E', b: a, bFace: 'S', transform: { turns: 2 } });
  const cycles = findCycles(s);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 3);
  assert.equal(cycles[0].netTurns, 0);
});

test('net twist wraps modulo four', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 3 } });
  s.addPortal({ a, aFace: 'E', b: a, bFace: 'W', transform: { turns: 3 } });
  const cycles = findCycles(s);
  assert.equal(cycles.length, 2);
  assert.ok(cycles.every((c) => c.netTurns === 3));
});

test('dimension report flags a long drawn distance covered in one step', () => {
  const s = new Structure();
  const low = s.addRoom({ id: 'low', x: 0, y: 0 });
  const high = s.addRoom({ id: 'high', x: 300, y: 300 });
  s.addPortal({ a: low, aFace: 'S', b: high, bFace: 'N' });
  const [pair] = dimensionReport(s);
  assert.equal(pair.steps, 1);
  assert.equal(pair.contradictory, true);
});

test('dimension report does not flag nearby rooms', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  assert.equal(dimensionReport(s)[0].contradictory, false);
});

test('dimension report marks unreachable pairs without flagging them', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 9, y: 9 });
  const [pair] = dimensionReport(s);
  assert.equal(pair.reachable, false);
  assert.equal(pair.contradictory, false);
});

test('dimension report sees through gates: structure is not hidden by a shut passage', () => {
  const s = new Structure();
  const low = s.addRoom({ id: 'low', x: 0, y: 0 });
  const high = s.addRoom({ id: 'high', x: 0, y: 6 });
  // A gated passage with no plate: shut for any traveller, but still architecture.
  s.addPortal({ a: low, aFace: 'S', b: high, bFace: 'N', gate: 0 });
  const [pair] = dimensionReport(s);
  assert.equal(pair.reachable, true);
  assert.equal(pair.steps, 1);
  assert.equal(pair.contradictory, true);
});

// ---- walkable loops (one-way aware) ----
import { findCycles as findCyclesOneWay } from '../src/topology/analysis.js';
import { setOneWay as setOneWayLoop } from '../src/topology/construction.js';

function triangle() {
  const s = new Structure();
  s.addRoom({ id: 'p', x: 0, y: 0 });
  s.addRoom({ id: 'q', x: 1, y: 0 });
  s.addRoom({ id: 'r', x: 0, y: 1 });
  s.addPortal({ a: 'p', aFace: 'E', b: 'q', bFace: 'W' });
  s.addPortal({ a: 'q', aFace: 'S', b: 'r', bFace: 'N' });
  s.addPortal({ a: 'r', aFace: 'W', b: 'p', bFace: 'S' });
  return s;
}

test('a two-way loop is walkable in both directions', () => {
  const [loop] = findCyclesOneWay(triangle());
  assert.equal(loop.walkable, true);
  assert.equal(loop.oneWayOnly, false);
});

test('a loop with one one-way passage can only be walked one way', () => {
  const s = triangle();
  const pid = [...s.portals.keys()][0];
  const one = setOneWayLoop(s, pid, 'a').structure;   // only from p towards q
  const [loop] = findCyclesOneWay(one);
  assert.equal(loop.walkable, true);
  assert.equal(loop.oneWayOnly, true);
});

test('a loop whose passages point round it in opposite senses cannot be walked round', () => {
  const s = triangle();
  const ids = [...s.portals.keys()];
  // Forward around p->q->r->p needs p->q, q->r and r->p. Pointing q->p and
  // r->q in the opposite sense leaves neither direction open.
  let t = setOneWayLoop(s, ids[0], 'b').structure;    // p-q: only from q
  t = setOneWayLoop(t, ids[1], 'a').structure;        // q-r: only from q
  // Forward needs p->q (blocked); backward needs r->q (blocked).
  const [loop] = findCyclesOneWay(t);
  assert.equal(loop.walkable, false);
});
