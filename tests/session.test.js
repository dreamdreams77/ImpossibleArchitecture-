import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';

test('connecting the threshold through the UI flow completes the chapter', () => {
  const s = new Session({ chapterId: 'threshold' });
  assert.equal(s.pickFace('hall', 'E'), false);
  assert.equal(s.pendingFace.room, 'hall');
  s.pickFace('vault', 'W');
  assert.equal(s.structure.portals.size, 1);
  assert.deepEqual(s.progress.completed, ['threshold']);
  assert.equal(s.nextChapterId(), 'the-two-doors');
});

test('a second connection onto an occupied face is refused with an explanation', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.pickFace('hall', 'E');
  s.pickFace('vault', 'W');
  s.pickFace('hall', 'E');
  s.pickFace('vault', 'E');
  assert.equal(s.feedback.kind, 'error');
  assert.match(s.feedback.text, /one portal/);
  assert.equal(s.structure.portals.size, 1);
});

test('undo reverts a connection and clears completion-free state is preserved', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.pickFace('hall', 'E');
  s.pickFace('vault', 'W');
  s.undo();
  assert.equal(s.structure.portals.size, 0);
  s.redo();
  assert.equal(s.structure.portals.size, 1);
});

test('the chapter room limit blocks adding rooms and explains why', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.addRoomAt(5, 5);
  assert.equal(s.feedback.kind, 'error');
  assert.equal(s.structure.rooms.size, 2);
});

test('the returning hall is solved by a self-loop built through the UI', () => {
  const s = new Session({ chapterId: 'returning-hall' });
  s.pickFace('gallery', 'N');
  s.pickFace('gallery', 'S');
  assert.ok(s.progress.completed.includes('returning-hall'));
  assert.equal(s.isFinished(), false);
});

test('rotating a selected portal changes its transform and is undoable', () => {
  const s = new Session({ chapterId: 'twisted-stair' });
  s.pickFace('base', 'E');
  s.pickFace('landing', 'N');
  const pid = [...s.structure.portals.keys()][0];
  s.selectPortal(pid);
  s.rotateSelectedPortal();
  assert.equal(s.structure.portals.get(pid).transform.turns, 1);
  s.undo();
  assert.equal(s.structure.portals.get(pid).transform.turns, 0);
});

test('sandbox has no chapter, no completion, and no room limit', () => {
  const s = new Session();
  s.startSandbox();
  for (let i = 0; i < 6; i++) s.addRoomAt(i, 0);
  assert.equal(s.structure.rooms.size, 6);
  assert.equal(s.chapter, null);
  assert.equal(s.nextChapterId(), null);
});

test('session: moving a portal end through the UI flow, undoable', () => {
  const s = new Session({ chapterId: 'contradiction' });
  s.loadChapter('threshold');
  s.pickFace('hall', 'E'); s.pickFace('vault', 'W');
  const pid = [...s.structure.portals.keys()][0];
  s.selectPortal(pid);
  assert.equal(s.beginRetarget('b'), true);
  s.pickFace('hall', 'S');
  const p = s.structure.portals.get(pid);
  assert.deepEqual(p.b, { room: 'hall', face: 'S' });
  s.undo();
  assert.deepEqual(s.structure.portals.get(pid).b, { room: 'vault', face: 'W' });
});

test('session: beginRetarget needs a selected portal', () => {
  const s = new Session({ chapterId: 'threshold' });
  assert.equal(s.beginRetarget(), false);
  assert.equal(s.feedback.kind, 'error');
});
