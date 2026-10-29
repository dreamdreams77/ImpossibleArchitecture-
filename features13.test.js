import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, routeFor, cargoEventText } from '../src/game.js';
import { chapterById, chapterStructure, goalSatisfied, rulesFor } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';
import { makeTraveller, step, findRoute, replay } from '../src/topology/traversal.js';
import { diagnose } from '../src/campaign/diagnose.js';

const join = (s, spec) => {
  const r = connect(s, { transform: { turns: 0, mirror: false }, ...spec });
  assert.equal(r.error, undefined, `connect failed: ${r.error}`);
  return r.structure;
};

const freight = () => chapterById('the-freight');

// The single connection that works: entering the Depot from its south face.
const solved = () => join(chapterStructure(freight()), { a: 'depot', aFace: 'S', b: 'hall', bFace: 'S' });

test('a traveller picks up the crate in its start room', () => {
  const c = freight();
  const t = makeTraveller('dock', 'N', rulesFor(c));
  assert.equal(t.carry, 0);
  assert.deepEqual(t.events, [{ type: 'pickup', index: 0, room: 'dock' }]);
});

test('a traveller carrying one crate does not pick up another in passing', () => {
  const c = freight();
  let t = makeTraveller('dock', 'N', rulesFor(c));
  t = step(solved(), t, 'E');             // through the turning passage into the Hall
  assert.equal(t.room, 'hall');
  assert.equal(t.carry, 0);
  assert.deepEqual(t.events, []);
});

test('the freight is solved by a route that delivers both crates, with the right heading', () => {
  const c = freight();
  const s = solved();
  assert.equal(goalSatisfied(s, c), true);
  const route = routeFor(s, c);
  assert.equal(route.delivered, 0b11);
  assert.equal(route.headings.at(-1), 'N');
});

test('a crate that reaches the Depot facing the wrong way is not delivered', () => {
  const c = freight();
  // Entering from the Depot's west face faces east, so nothing is accepted.
  const s = join(chapterStructure(c), { a: 'depot', aFace: 'W', b: 'hall', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), false);
  assert.ok(diagnose(s, c).some((r) => /wrong heading/.test(r)), diagnose(s, c).join(' | '));
});

test('a depot heading that is not required lets any arrival deliver', () => {
  const c = { ...freight(), goal: { kind: 'deliver', to: 'depot' } };
  const s = join(chapterStructure(c), { a: 'depot', aFace: 'W', b: 'hall', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), true);
});

test('the walked crate positions follow the route: at the start, carried, then delivered', () => {
  const c = freight();
  const session = new Session({ chapterId: 'the-freight' });
  session.loadChapter('the-freight');
  session.loadStructure(solved(), 'the-freight');
  session.routeHighlight = routeFor(session.structure, c);
  assert.deepEqual(session.cratePositions(), [{ room: 'dock', carried: false }, { room: 'hall', carried: false }]);

  session.startWalk();
  session.walk.progress = 0;
  assert.deepEqual(session.cratePositions()[0], { room: 'dock', carried: true });

  // Walk the route to its end: both crates end at the depot.
  session.walk.progress = session.routeHighlight.faces.length;
  assert.deepEqual(session.cratePositions(), [{ room: 'depot', carried: false }, { room: 'depot', carried: false }]);
});

test('cargoEventText describes pickups and deliveries in plain words', () => {
  const c = freight();
  const s = solved();
  const text = cargoEventText(s, c, [
    { type: 'pickup', index: 1, room: 'hall' },
    { type: 'deliver', index: 0, room: 'depot', heading: 'N' },
  ]);
  assert.match(text, /Picked up the crate in Freight Hall\./);
  assert.match(text, /Delivered the crate to Depot, facing N\./);
  assert.equal(cargoEventText(s, c, []), '');
});

test('a deliver goal with no crates can never be met', () => {
  const c = { ...freight(), cargo: [] };
  assert.equal(goalSatisfied(solved(), c), false);
});

test('findRoute distinguishes states that differ only by what is carried', () => {
  const c = freight();
  const route = findRoute(solved(), 'dock', (t) => t.room === 'depot' && t.delivered === 0b11, rulesFor(c));
  assert.ok(route && route.length >= 4, 'two trips need at least four crossings');
  const r = replay(solved(), 'dock', route, rulesFor(c));
  assert.equal(r.ok, true);
  assert.equal(r.traveller.delivered, 0b11);
});
