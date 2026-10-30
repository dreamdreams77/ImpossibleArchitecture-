import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { connect, disconnect, reshapePortal } from '../src/topology/construction.js';
import { findRoute, sightlines } from '../src/topology/traversal.js';
import { routeSegments, pointAlong } from '../src/render/geometry.js';
import { chapterById, chapterStructure, goalSatisfied } from '../src/campaign/chapters.js';
import { Session } from '../src/game.js';
import { encodeSave, decodeSave } from '../src/persistence/store.js';

test('a gated portal is impassable while its plate is unlit', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', gate: 0 });
  // The plate sits in a room the traveller cannot reach, so it never lights.
  const c = s.addRoom({ id: 'c', x: 9, y: 9 });
  const plates = [{ room: 'c', heading: 'N' }];
  assert.equal(findRoute(s, a, (t) => t.room === b, { plates }), null);
});

test('a gate is passable once its plate is lit at the start', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', gate: 0 });
  // A plate in the start room facing north is lit from the outset.
  const plates = [{ room: 'a', heading: 'N' }];
  assert.deepEqual(findRoute(s, a, (t) => t.room === b, { plates }), ['E']);
});

test('a gate opens once its plate is lit on the way to it', () => {
  const s = new Structure();
  const hall = s.addRoom({ id: 'hall', x: 0, y: 0 });
  const pump = s.addRoom({ id: 'pump', x: 0, y: 3 });
  const wing = s.addRoom({ id: 'wing', x: 4, y: 0 });
  s.addPortal({ a: hall, aFace: 'E', b: wing, bFace: 'W', gate: 0 });
  s.addPortal({ a: hall, aFace: 'S', b: pump, bFace: 'S' });
  const plates = [{ room: 'pump', heading: 'N' }];
  const route = findRoute(s, hall, (t) => t.room === wing, { plates });
  assert.deepEqual(route, ['S', 'S', 'E'], 'visit pump first, then pass the gate');
});

test('an open traveller ignores gates (used by structural analysis)', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', gate: 0 });
  assert.deepEqual(findRoute(s, a, (t) => t.room === b, { open: true }), ['E']);
});

test('a fixed passage cannot be removed or reshaped', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ id: 'f', a, aFace: 'E', b, bFace: 'W', fixed: true });
  const d = disconnect(s, 'f');
  assert.equal(d.error, 'FIXED');
  assert.equal(d.structure.portals.size, 1);
  const r = reshapePortal(s, 'f', { turns: 1 });
  assert.equal(r.error, 'FIXED');
});

test('sightlines report the room beyond each face and the arrival heading', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'N', transform: { turns: 1 } });
  const lines = sightlines(s, a);
  const east = lines.find((l) => l.face === 'E');
  assert.equal(east.room, 'b');
  // Entering b through its N face gives S; one quarter-turn of the portal gives W.
  assert.equal(east.arrival, 'W');
  assert.equal(lines.find((l) => l.face === 'N').wall, true);
});

test('the Sealed Wing: a gate that stays shut with no plate struck', () => {
  const c = chapterById('sealed-wing');
  assert.equal(goalSatisfied(chapterStructure(c), c), false);
});

test('the Sealed Wing: connecting the Pump from the south lights the plate and opens the gate', () => {
  const c = chapterById('sealed-wing');
  const s = connect(chapterStructure(c), { a: 'hall', aFace: 'S', b: 'pump', bFace: 'S' }).structure;
  assert.equal(goalSatisfied(s, c), true);
});

test('the Sealed Wing: entering the Pump from the north does not light the plate', () => {
  const c = chapterById('sealed-wing');
  const s = connect(chapterStructure(c), { a: 'hall', aFace: 'N', b: 'pump', bFace: 'N' }).structure;
  assert.equal(goalSatisfied(s, c), false);
});

test('fixed passages and gates survive save and load', () => {
  const c = chapterById('sealed-wing');
  const text = encodeSave({ chapterId: c.id, structure: chapterStructure(c), progress: { completed: [] } });
  const back = decodeSave(text);
  const gate = [...back.structure.portals.values()][0];
  assert.equal(gate.fixed, true);
  assert.equal(gate.gate, 0);
});

test('session: the walk route carries the trail and the heading held at each room', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.pickFace('hall', 'E'); s.pickFace('vault', 'W');
  s.testConstruction();
  assert.deepEqual(s.routeHighlight.trail, ['hall', 'vault']);
  assert.equal(s.routeHighlight.headings.length, 2);
  assert.equal(s.routeHighlight.headings[1], 'E');
});

test('route segments are oriented in the direction walked', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 2, y: 0 });
  s.addPortal({ id: 'p', a, aFace: 'E', b, bFace: 'W' });
  const segs = routeSegments(s, ['b', 'a'], ['p']);
  assert.equal(segs[0].fromRoom, 'b');
  assert.equal(segs[0].toRoom, 'a');
  // The first point of a segment sits at the room the traveller left.
  assert.ok(segs[0].pts[0].x > segs[0].pts[segs[0].pts.length - 1].x);
});

test('pointAlong moves smoothly from start to end of the route', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 2, y: 0 });
  s.addPortal({ id: 'p', a, aFace: 'E', b, bFace: 'W' });
  const segs = routeSegments(s, ['a', 'b'], ['p']);
  const start = pointAlong(segs, 0);
  const end = pointAlong(segs, 1);
  assert.ok(Math.abs(start.x - 0.42) < 1e-9);
  assert.ok(Math.abs(end.x - (2 - 0.42)) < 1e-9);
  assert.equal(pointAlong(segs, 0.5).segment, 0);
});

import { retargetPortal } from '../src/topology/construction.js';

test('retargetPortal moves one end, keeping transform, gate and identity', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  const c = s.addRoom({ id: 'c', x: 2, y: 0 });
  s.addPortal({ id: 'p', a, aFace: 'E', b, bFace: 'W', transform: { turns: 2, mirror: true }, gate: 0 });
  const r = retargetPortal(s, 'p', 'b', c, 'W');
  assert.equal(r.error, undefined);
  const p = r.structure.portals.get('p');
  assert.deepEqual(p.b, { room: 'c', face: 'W' });
  assert.deepEqual(p.a, { room: 'a', face: 'E' });
  assert.equal(p.transform.turns, 2);
  assert.equal(p.gate, 0);
});

test('retargetPortal refuses an occupied face and leaves the structure unchanged', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  const c = s.addRoom({ id: 'c', x: 2, y: 0 });
  s.addPortal({ id: 'p', a, aFace: 'E', b, bFace: 'W' });
  s.addPortal({ id: 'q', a: c, aFace: 'W', b, bFace: 'E' });
  const r = retargetPortal(s, 'p', 'b', c, 'W');
  assert.equal(r.error, 'FACE_OCCUPIED');
  assert.deepEqual(r.structure.portals.get('p').b, { room: 'b', face: 'W' });
});

test('retargetPortal refuses fixed passages', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ id: 'f', a, aFace: 'E', b, bFace: 'W', fixed: true });
  assert.equal(retargetPortal(s, 'f', 'b', a, 'N').error, 'FIXED');
});

import { platesLitBy as litBy } from '../src/topology/traversal.js';

test('a sequenced plate answers only after the plate it follows', () => {
  const plates = [{ room: 'a', heading: 'N' }, { room: 'b', heading: 'N', after: 0 }];
  assert.equal(litBy(plates, 'b', 'N', 0), 0, 'struck first, it does nothing');
  assert.equal(litBy(plates, 'a', 'N', 0), 1);
  assert.equal(litBy(plates, 'b', 'N', 1), 3, 'struck after, it lights');
  assert.equal(litBy(plates, 'b', 'N', 2), 2, 'a lit plate stays lit');
});

test('The Ordered Hall needs a second lap, and is solved by one passage back', () => {
  const c = chapterById('the-ordered-hall');
  const s = chapterStructure(c);
  assert.equal(goalSatisfied(s, c), false);
  s.addPortal({ a: 'hall', aFace: 'N', b: 'drum', bFace: 'N', transform: { turns: 0, mirror: false } });
  assert.equal(goalSatisfied(s, c), true);
  const goal = (t) => t.room === 'vault' && t.lit === 3;
  const ordered = findRoute(s, 'hall', goal, { plates: c.plates });
  const unordered = findRoute(s, 'hall', goal, { plates: c.plates.map(({ after, ...p }) => p) });
  assert.equal(ordered.length, 7, 'two laps of the corridor');
  assert.equal(unordered.length, 4, 'one lap if order did not matter');
});
