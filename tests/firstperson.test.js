import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { connect, setOneWay } from '../src/topology/construction.js';
import { firstPersonModel, wallFaces } from '../src/render/firstperson.js';
import { Session } from '../src/game.js';
import { chapterById, chapterStructure } from '../src/campaign/chapters.js';

function two() {
  const s = new Structure();
  s.addRoom({ id: 'hall', x: 0, y: 0, label: 'Hall' });
  s.addRoom({ id: 'far', x: 5, y: 5, label: 'Far Room' });
  return s;
}

test('wallFaces: the wall ahead, and the walls on either side, for each heading', () => {
  assert.deepEqual(wallFaces('N'), { front: 'N', right: 'E', left: 'W' });
  assert.deepEqual(wallFaces('E'), { front: 'E', right: 'S', left: 'N' });
  assert.deepEqual(wallFaces('W'), { front: 'W', right: 'N', left: 'S' });
});

test('model: a solid wall ahead is a wall, not a passage', () => {
  const s = two();
  const m = firstPersonModel(s, { room: 'hall', heading: 'N' });
  assert.equal(m.walls.front.kind, 'wall');
  assert.equal(m.label, 'Hall');
});

test('model: a passage ahead names the room beyond and the arrival heading', () => {
  const s = two();
  const r = connect(s, { a: 'hall', aFace: 'N', b: 'far', bFace: 'S' });
  const m = firstPersonModel(r.structure, { room: 'hall', heading: 'N' });
  assert.equal(m.walls.front.kind, 'passage');
  assert.equal(m.walls.front.label, 'Far Room');
  assert.equal(m.walls.front.arrival, 'N');
});

test('model: turning changes which passage is ahead', () => {
  const s = two();
  const r = connect(s, { a: 'hall', aFace: 'E', b: 'far', bFace: 'W' });
  assert.equal(firstPersonModel(r.structure, { room: 'hall', heading: 'N' }).walls.right.kind, 'passage');
  assert.equal(firstPersonModel(r.structure, { room: 'hall', heading: 'N' }).walls.front.kind, 'wall');
});

test('model: a one-way passage seen from its closed side is blocked, from its open side a passage', () => {
  const s = two();
  const r = connect(s, { a: 'hall', aFace: 'N', b: 'far', bFace: 'S' });
  const pid = [...r.structure.portals.keys()][0];
  const oneWay = setOneWay(r.structure, pid, 'b').structure;   // may only leave from far
  assert.equal(firstPersonModel(oneWay, { room: 'hall', heading: 'N' }).walls.front.kind, 'blocked');
  assert.equal(firstPersonModel(oneWay, { room: 'far', heading: 'S' }).walls.front.kind, 'passage');
});

test('model: a gate is shut until its plate is lit on this walk', () => {
  const c = chapterById('revolving-house');
  const s = chapterStructure(c);
  const plates = c.plates;
  const lobbyView = { room: 'drum', heading: 'E', lit: 0 };
  assert.equal(firstPersonModel(s, lobbyView, plates).walls.front.kind, 'shut');
  assert.equal(firstPersonModel(s, { ...lobbyView, lit: 1 }, plates).walls.front.kind, 'passage');
});

test('session: first-person walking goes through a passage and reports a wall', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  session.startFirstPerson();
  assert.equal(session.fp.room, 'court');
  assert.equal(session.fpForward(), false, 'the court faces north: a wall');
  assert.match(session.feedback.text, /solid wall/);
  session.fpTurn('right');                 // facing E: the gate, shut
  assert.equal(session.fpForward(), false);
  assert.match(session.feedback.text, /Shut/);
});

test('session: walking the Lantern Court in first person lights the Lantern and opens the gate', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  session.loadChapter('lantern-court');
  session.startFirstPerson();
  // Build the solution through the same intents the plan uses.
  session.pickFace('court', 'S'); session.pickFace('lantern', 'W');
  session.pickFace('stair', 'S'); session.pickFace('roof', 'N');
  session.startFirstPerson();
  session.fpTurn('left');                   // facing W... then turn to S
  session.fpTurn('left');                   // facing S: the way to the Lantern
  assert.equal(session.fpForward(), true);  // into the Lantern, facing E: lit
  assert.equal(session.fp.room, 'lantern');
  assert.equal(session.fp.heading, 'E');
  assert.equal(session.fp.lit & 1, 1);
});

test('session: a one-way passage refuses the walker from the closed side', () => {
  const session = new Session({ chapterId: 'the-drop' });
  session.startFirstPerson();
  session.fp = { ...session.fp, heading: 'E' };   // the Ledge's east face: one way from the Vault
  assert.equal(session.fpForward(), false);
  assert.match(session.feedback.text, /One way/);
});

test('session: cycling a player passage through one-way and back to two-way', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(0, 0); session.addRoomAt(2, 0);
  const [a, b] = [...session.structure.rooms.keys()];
  session.pickFace(a, 'E'); session.pickFace(b, 'W');
  const pid = [...session.structure.portals.keys()][0];
  session.selectPortal(pid);
  session.cycleOneWay();
  assert.equal(session.structure.portals.get(pid).oneWay, 'a');
  session.cycleOneWay();
  assert.equal(session.structure.portals.get(pid).oneWay, 'b');
  session.cycleOneWay();
  assert.equal(session.structure.portals.get(pid).oneWay, null);
});
