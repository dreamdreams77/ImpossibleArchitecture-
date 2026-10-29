import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, routeFor, cargoEventText } from '../src/game.js';
import { chapterById, chapterStructure, goalSatisfied, rulesFor } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';
import { makeTraveller, step, findRoute, replay } from '../src/topology/traversal.js';
import { drawPlan } from '../src/render/draw.js';

function stubContext() {
  const noop = () => {};
  const target = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
}

const T = { turns: 0, mirror: false };
const join = (s, spec) => {
  const r = connect(s, { ...spec, transform: T });
  assert.equal(r.error, undefined, `connect failed: ${r.error}`);
  return r.structure;
};
const pad = () => chapterById('the-pad-room');
const solved = () => join(join(chapterStructure(pad()), { a: 'yard', aFace: 'E', b: 'depot', bFace: 'W' }), { a: 'depot', aFace: 'S', b: 'pad', bFace: 'E' });

test('a crate carried into a pad room is set down there, and nothing is picked up on that arrival', () => {
  const c = rulesFor(pad());
  // Start with the crate in the Yard, then walk into the Pad room carrying it.
  const s = join(chapterStructure(pad()), { a: 'yard', aFace: 'S', b: 'pad', bFace: 'N' });
  let t = makeTraveller('yard', 'N', c);
  assert.equal(t.carry, 0);
  t = step(s, t, 'S');
  assert.equal(t.room, 'pad');
  assert.equal(t.carry, -1, 'the crate is no longer carried');
  assert.equal(t.where[0], 'pad', 'it now lies in the Pad room');
  assert.equal(t.where[1], 'pad', 'the other crate is still there, not picked up');
  assert.equal(t.events.at(-1).type, 'setdown');
});

test('leaving a pad and coming back empty-handed picks the crate up again', () => {
  const c = rulesFor(pad());
  const s = join(chapterStructure(pad()), { a: 'yard', aFace: 'S', b: 'pad', bFace: 'N' });
  let t = makeTraveller('yard', 'N', c);
  t = step(s, t, 'S');   // set the first crate down in the Pad room
  t = step(s, t, 'N');   // back to the Yard, empty-handed
  t = step(s, t, 'S');   // into the Pad room again: the first pickup it finds is the crate there
  assert.equal(t.carry, 0, 'the crate set down first is picked up first');
  assert.equal(t.where[0], null);
});

test('the pad chapter is solved by linking the Yard to the Depot and the Depot to the Pad room', () => {
  const c = pad();
  const s = solved();
  assert.equal(goalSatisfied(s, c), true);
  const route = routeFor(s, c);
  assert.equal(route.delivered, 0b11);
});

test('the pad chapter is not solved by linking the Yard to the Depot alone', () => {
  const c = pad();
  const s = join(chapterStructure(c), { a: 'yard', aFace: 'E', b: 'depot', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), false, 'the second crate has no way to the Depot');
});

test('the crate positions show a set-down crate in the pad room', () => {
  const session = new Session({ chapterId: 'the-pad-room' });
  const s = join(chapterStructure(pad()), { a: 'yard', aFace: 'S', b: 'pad', bFace: 'N' });
  session.loadStructure(s, 'the-pad-room');
  // Route: yard to pad (sets the first crate down), pad back to yard, yard to pad again.
  const faces = ['S', 'N', 'S'];
  session.routeHighlight = { faces, trail: ['yard', 'pad', 'yard', 'pad'], headings: [], portals: [] };
  session.walk = { progress: 1, steps: faces.length };
  const after = session.cratePositions();
  assert.equal(after[0].room, 'pad');
  assert.equal(after[0].carried, false);
});

test('the set-down event reads plainly', () => {
  const text = cargoEventText(solved(), pad(), [{ type: 'setdown', index: 0, room: 'pad' }]);
  assert.match(text, /Set the crate down in Pad room\./);
});

test('the pad room draws without error', () => {
  const session = new Session({ chapterId: 'the-pad-room' });
  session.loadStructure(solved(), 'the-pad-room');
  assert.doesNotThrow(() => drawPlan(stubContext(), { scale: 80, offsetX: 320, offsetY: 240 }, session, { width: 640, height: 480 }, 500));
});
