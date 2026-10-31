import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure, TopologyError } from '../src/topology/graph.js';
import { makeTraveller, step, findRoute, replay, routeReturns } from '../src/topology/traversal.js';
import { connect, addRoom, validate, reshapePortal, removeRoom } from '../src/topology/construction.js';

test('a portal joins two rooms regardless of their drawn distance', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 500, y: 500 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  const exit = s.exit(a, 'E');
  assert.equal(exit.room, b);
  assert.ok(s.apparentDistance(a, b) > 700, 'drawn distance is large');
  assert.deepEqual(replay(s, a, ['E']).traveller.room, b);
});

test('a room can connect back to itself (a closed loop)', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S' });
  const r = routeReturns(s, a, ['N']);
  assert.equal(r.ok, true);
  assert.equal(r.room, a);
  assert.equal(r.returned, true);
});

test('a quarter-turn transform changes heading on re-entry', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 1 } });
  const r = routeReturns(s, a, ['N']);
  assert.equal(r.room, a);
  assert.equal(r.heading, 'E');
  assert.equal(r.returned, false, 'loop closes but heading is rotated');
});

test('the portal fixes the entry heading, independent of approach', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 1 } });
  // Entry heading is a property of the portal, so repeated passes agree.
  // A traveller who turns in place before walking gets the same result.
  const once = step(s, makeTraveller(a, 'N'), 'N');
  const twice = step(s, makeTraveller(a, 'W'), 'N');
  assert.equal(once.heading, 'E');
  assert.equal(twice.heading, 'E');
});

test('a mirror reflects across the line of travel: you still walk straight in, reflected', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 0, y: 0 });
  // Entering b through its W face: the heading is E with or without the mirror; the mirror flips parity.
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', transform: { mirror: true } });
  const t = step(s, makeTraveller(a, 'N'), 'E');
  assert.equal(t.room, b);
  assert.equal(t.heading, 'E');
  assert.equal(t.mirrored, true);
  const back = step(s, t, 'W');
  assert.equal(back.heading, 'W');
  assert.equal(back.mirrored, false, 'a second reflection restores the traveller');
});

test('walls block movement', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  assert.equal(step(s, makeTraveller(a), 'N'), null);
});

test('findRoute finds a shortest route through a non-Euclidean shortcut', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 1, y: 0 });
  const c = s.addRoom({ x: 2, y: 0 });
  const d = s.addRoom({ x: 99, y: 99 });
  // Drawn adjacency a-b-c is a long walk; a direct portal a->d is the shortcut.
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  s.addPortal({ a: b, aFace: 'E', b: c, bFace: 'W' });
  s.addPortal({ a, aFace: 'S', b: d, bFace: 'N' });
  const route = findRoute(s, a, (t) => t.room === d);
  assert.deepEqual(route, ['S']);
});

test('findRoute terminates on loops and reports unreachable goals', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S' });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', transform: { turns: 2 } });
  assert.equal(findRoute(s, a, (t) => t.room === 'nowhere'), null);
  assert.ok(findRoute(s, a, (t) => t.room === b) !== null);
});

test('a face can carry only one portal', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 1, y: 0 });
  const c = s.addRoom({ x: 2, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  const r = connect(s, { a, aFace: 'E', b: c, bFace: 'W' });
  assert.equal(r.error, 'FACE_OCCUPIED');
  assert.equal(r.structure.portals.size, 1, 'input structure is preserved');
});

test('a portal cannot join a face to itself', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const r = connect(s, { a, aFace: 'N', b: a, bFace: 'N' });
  assert.equal(r.error, 'SELF_PORTAL');
});

test('reshapePortal normalises turns modulo four', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 0, y: 0 });
  const withPortal = connect(s, { a, aFace: 'E', b, bFace: 'W' }).structure;
  const pid = [...withPortal.portals.keys()][0];
  const r = reshapePortal(withPortal, pid, { turns: 7 });
  assert.equal([...r.structure.portals.values()][0].transform.turns, 3);
});

test('removing a room removes its portals', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  const r = removeRoom(s, b);
  assert.equal(r.structure.portals.size, 0);
  assert.equal(r.structure.rooms.size, 1);
});

test('room limits are enforced by the ruleset', () => {
  const s = new Structure();
  s.addRoom({ x: 0, y: 0 });
  const r = addRoom(s, { x: 1, y: 1 }, { maxRooms: 1, maxPortals: Infinity, sealedFaces: [] });
  assert.equal(r.error, 'ROOM_LIMIT');
  assert.equal(r.structure.rooms.size, 1);
});

test('sealed faces reject portals', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 1, y: 0 });
  const rules = { maxRooms: Infinity, maxPortals: Infinity, sealedFaces: [{ room: a, face: 'E' }] };
  const r = connect(s, { a, aFace: 'E', b, bFace: 'W' }, rules);
  assert.equal(r.error, 'FORBIDDEN_FACE');
});

test('serialisation round-trips the full topology including transforms', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0, label: 'hall' });
  const b = s.addRoom({ x: 3, y: 7 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'N', transform: { turns: 3, mirror: true } });
  s.rooms.get(a).objects.add('lamp');
  const copy = Structure.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.deepEqual(copy.toJSON(), s.toJSON());
  assert.equal(copy.exit(a, 'E').transform.mirror, true);
});

test('fromJSON rejects unknown versions', () => {
  assert.throws(() => Structure.fromJSON({ version: 99 }), TopologyError);
});

test('validate reports no violations for a clean structure', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  assert.equal(validate(s).ok, true);
});

import { platesLitBy } from '../src/topology/traversal.js';

test('a plate lights only on arrival in its room facing its heading', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  const plates = [{ room: 'b', heading: 'E' }];
  // Entering b via W gives heading E: the plate lights.
  const r = replay(s, a, ['E'], { plates });
  assert.equal(r.traveller.lit, 1);
  // Starting in b facing N does not light a plate requiring E.
  assert.equal(platesLitBy(plates, 'b', 'N', 0), 0);
});

test('findRoute can require a plate before reaching the exit (sequence search)', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  const c = s.addRoom({ id: 'c', x: 2, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  s.addPortal({ a: b, aFace: 'E', b: c, bFace: 'W' });
  s.addPortal({ a, aFace: 'S', b: c, bFace: 'N' });
  const plates = [{ room: 'b', heading: 'E' }];
  // Direct route a->c exists, but the goal demands the plate was lit first.
  const route = findRoute(s, a, (t) => t.room === c && (t.lit & 1) === 1, { plates });
  assert.deepEqual(route, ['E', 'E']);
});

import { startingLit as startLit } from '../src/topology/traversal.js';

test('starting state keeps each plate on its own bit, even after toggles precede it', () => {
  const plates = [
    { room: 'x', heading: 'S', mode: 'toggle', startsLit: true },  // bit 0
    { room: 'a', heading: 'N' },                                    // bit 1, latch in start room
  ];
  assert.equal(startLit(plates, 'a'), 0b11);
  assert.equal(startLit(plates, 'b'), 0b01);
});

test('a toggle flips on every arrival facing its heading, so its state tracks parity', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W' });
  s.addPortal({ a, aFace: 'W', b, bFace: 'E' });
  const plates = [{ room: 'b', heading: 'E', mode: 'toggle' }];
  // Enter b facing E (via W) once, then twice, checking the parity each time.
  assert.equal(replay(s, a, ['E'], { plates }).traveller.lit, 1);
  assert.equal(replay(s, a, ['E', 'W', 'E'], { plates }).traveller.lit, 0, 'second entry flips it back');
});
