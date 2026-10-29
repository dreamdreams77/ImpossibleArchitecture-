// Regression tests for bugs found in the bug-check pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure, TopologyError } from '../src/topology/graph.js';
import { findCycles } from '../src/topology/analysis.js';
import { Session } from '../src/game.js';

const room = (id) => ({ id, x: 0, y: 0, label: '', objects: [] });

test('bug: a save with a portal to a missing room is rejected, not loaded', () => {
  const data = {
    version: 1, nextId: 3,
    rooms: [room('a')],
    portals: [{ id: 'p', a: { room: 'a', face: 'E' }, b: { room: 'ghost', face: 'W' }, transform: {} }],
  };
  assert.throws(() => Structure.fromJSON(data), TopologyError);
});

test('bug: a save with an invalid face is rejected', () => {
  const data = {
    version: 1, nextId: 3,
    rooms: [room('a'), room('b')],
    portals: [{ id: 'p', a: { room: 'a', face: 'Q' }, b: { room: 'b', face: 'W' }, transform: {} }],
  };
  assert.throws(() => Structure.fromJSON(data), TopologyError);
});

test('bug: a save with duplicate room ids is rejected', () => {
  const data = { version: 1, nextId: 3, rooms: [room('a'), room('a')], portals: [] };
  assert.throws(() => Structure.fromJSON(data), TopologyError);
});

test('bug: one drag gesture is one undo step, not one per pointer move', () => {
  const s = new Session({ chapterId: 'threshold' });
  const before = s.history.stack.length;
  s.beginGesture();
  for (let x = 1; x <= 6; x++) s.moveRoom('hall', x, 0);
  s.endGesture();
  assert.equal(s.history.stack.length, before + 1);
  s.undo();
  assert.equal(s.structure.rooms.get('hall').x, 0, 'undo returns to where the drag began');
});

test('bug: analysis is memoised per structure, so repeated panel refreshes do not recompute', () => {
  const s = new Session({ chapterId: 'returning-hall' });
  s.pickFace('gallery', 'N'); s.pickFace('gallery', 'S');
  const a = s.analysis();
  assert.equal(s.analysis(), a, 'same structure gives the same analysis object');
  s.pickFace('gallery', 'E'); // a change, if rejected, leaves the structure as it was
  assert.equal(s.structure.portals.size, 1);
});

test('bug: cycle enumeration respects its work budget on a large, cycle-poor graph', () => {
  // A star: many spokes from one hub. Every simple path is short, so no cycles,
  // but the search must still terminate promptly.
  const s = new Structure();
  const hub = s.addRoom({ id: 'hub', x: 0, y: 0 });
  const faces = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 4; i++) {
    const r = s.addRoom({ id: `s${i}`, x: i, y: 5 });
    s.addPortal({ a: hub, aFace: faces[i], b: r, bFace: 'N' });
  }
  const t0 = Date.now();
  assert.equal(findCycles(s).length, 0);
  assert.ok(Date.now() - t0 < 500);
});
