import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { encodeSave, decodeSave, validChallenge } from '../src/persistence/store.js';

function sandbox() {
  const s = new Session();
  s.startSandbox();
  s.addRoomAt(0, 0); s.addRoomAt(3, 0); s.addRoomAt(6, 0);
  return s;
}
const ids = (s) => [...s.structure.rooms.keys()];

test('a sandbox challenge is solved by the same engine, and fails with a reason', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  assert.ok(s.setChallenge({ start: a, to: c }));
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error');
  assert.match(s.feedback.text, /not solved/);
  s.pickFace(a, 'E'); s.pickFace(b, 'W');
  s.pickFace(b, 'E'); s.pickFace(c, 'W');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success');
  assert.ok(s.routeHighlight, 'the route is highlighted');
  assert.equal(s.routeHighlight.trail.at(-1), c);
});

test('a step limit and an arrival heading are enforced', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  s.pickFace(a, 'E'); s.pickFace(b, 'W'); s.pickFace(b, 'E'); s.pickFace(c, 'W');
  s.setChallenge({ start: a, to: c, maxSteps: 1 });
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error', 'two steps is more than one');
  s.setChallenge({ start: a, to: c, maxSteps: 2 });
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success');
  s.setChallenge({ start: a, to: c, heading: 'S' });
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error', 'arrives facing east, not south');
});

test('bad challenges are refused, and a vanished room clears it', () => {
  const s = sandbox();
  const [a, b] = ids(s);
  assert.equal(s.setChallenge({ start: a, to: 'nope' }), false);
  assert.equal(s.setChallenge({ start: a, to: a }), false);
  assert.ok(s.setChallenge({ start: a, to: b }));
  s.selectRoom(b); s.deleteSelection();
  s.testConstruction();
  assert.equal(s.challenge, null);
  const c = new Session({ chapterId: 'threshold' });
  assert.equal(c.setChallenge({ start: 'hall', to: 'vault' }), false, 'only free construction takes one');
});

test('the challenge survives save and load, and malformed ones are dropped', () => {
  const s = sandbox();
  const [a, , c] = ids(s);
  s.setChallenge({ start: a, to: c, heading: 'E', maxSteps: 2 });
  const back = decodeSave(encodeSave({ chapterId: null, structure: s.structure, progress: s.progress, challenge: s.challenge }));
  assert.deepEqual(back.challenge, { start: a, to: c, heading: 'E', maxSteps: 2 });
  const t = new Session();
  t.loadStructure(back.structure, null, { challenge: back.challenge });
  assert.deepEqual(t.challenge, back.challenge);
  assert.equal(validChallenge({ start: 1, to: 'x' }), null);
  assert.deepEqual(validChallenge({ start: 'a', to: 'b', heading: 'Q', maxSteps: -3 }), { start: 'a', to: 'b', heading: null, maxSteps: null });
  assert.equal(decodeSave(encodeSave({ chapterId: null, structure: s.structure, progress: s.progress })).challenge, null);
});
