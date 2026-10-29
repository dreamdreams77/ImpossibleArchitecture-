import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import * as C from '../src/topology/construction.js';

// Two rooms joined by one passage, with the passage selected in a sandbox.
function sandboxPair() {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(0, 0);
  const a = session.selection.id;
  session.addRoomAt(4, 0);
  const b = session.selection.id;
  const r = C.connect(session.structure, {
    a, aFace: 'E', b, bFace: 'W', transform: { turns: 0, mirror: false },
  });
  assert.equal(r.error, undefined, r.error?.message);
  session.loadStructure(r.structure, null, { undoable: false });
  const portalId = [...session.structure.portals.keys()][0];
  return { session, a, b, portalId };
}

test('reverseOneWay flips a one-way passage to the other end', () => {
  const { session, portalId } = sandboxPair();
  let r = C.setOneWay(session.structure, portalId, 'a');
  assert.equal(r.error, undefined);
  r = C.reverseOneWay(r.structure, portalId);
  assert.equal(r.error, undefined);
  assert.equal(r.structure.portals.get(portalId).oneWay, 'b');
  const back = C.reverseOneWay(r.structure, portalId);
  assert.equal(back.structure.portals.get(portalId).oneWay, 'a');
});

test('reverseOneWay refuses a two-way passage and leaves the structure alone', () => {
  const { session, portalId } = sandboxPair();
  const r = C.reverseOneWay(session.structure, portalId);
  assert.ok(r.error);
  assert.equal(r.structure, session.structure);
});

test('session reverse names the room the flipped passage starts from, and undoes', () => {
  const { session, b, portalId } = sandboxPair();
  session.selectPortal(portalId);
  session.apply(C.setOneWay(session.structure, portalId, 'a'));
  session.reverseOneWay();
  // Flipped to 'b': it may now be crossed from end b.
  assert.equal(session.structure.portals.get(portalId).oneWay, 'b');
  assert.match(session.feedback.text, new RegExp(`crossed from ${session.structure.rooms.get(b).label || b}`));
  session.undo();
  assert.equal(session.structure.portals.get(portalId).oneWay, 'a');
});

test('duplicateRoom places an empty copy one step away and selects it', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(2, 3);
  const id = session.selection.id;
  session.renameRoom(id, 'Cellar');
  const before = session.structure.rooms.size;
  session.duplicateRoom(id);
  assert.equal(session.structure.rooms.size, before + 1);
  const copy = session.structure.rooms.get(session.selection.id);
  assert.equal(copy.label, 'Cellar copy');
  assert.equal(copy.x, 3);
  assert.equal(copy.y, 4);
  assert.equal(session.structure.portals.size, 0);
});

test('duplicateRoom shortens a long label to the label limit', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(0, 0);
  const id = session.selection.id;
  session.renameRoom(id, 'x'.repeat(C.LABEL_LIMIT));
  session.duplicateRoom(id);
  const copy = session.structure.rooms.get(session.selection.id);
  assert.ok(copy.label.length <= C.LABEL_LIMIT);
});

test('duplicateRoom on an unknown room changes nothing', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  const before = session.structure;
  assert.equal(session.duplicateRoom('nowhere'), false);
  assert.equal(session.structure, before);
});
