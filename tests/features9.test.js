import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure } from '../src/topology/graph.js';
import { CHAPTERS } from '../src/campaign/chapters.js';

test('restarting a chapter is undoable: undo brings back the construction it replaced', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  const startX = session.structure.rooms.get('hall').x;
  session.nudgeRoom('hall', 2, 0);
  const built = session.structure.rooms.get('hall').x;
  assert.equal(built, startX + 2);
  assert.equal(session.restartChapter(), true);
  assert.equal(session.structure.rooms.get('hall').x, startX, 'restart returns to the chapter start');
  session.undo();
  assert.equal(session.structure.rooms.get('hall').x, built, 'undo brings the moved room back');
});

test('restartChapter refuses in free construction', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  session.startSandbox();
  assert.equal(session.restartChapter(), false);
});

test('loading a save for the same chapter is undoable', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  const before = session.structure.rooms.size;
  const replacement = new Structure();
  replacement.addRoom({ id: 'only', x: 0, y: 0 });
  session.loadStructure(replacement, CHAPTERS[0].id, { undoable: true });
  assert.equal(session.structure.rooms.size, 1);
  session.undo();
  assert.equal(session.structure.rooms.size, before, 'undo returns to the construction before the load');
});

test('loading a save for a different chapter starts the history again', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  const replacement = new Structure();
  replacement.addRoom({ id: 'only', x: 0, y: 0 });
  session.loadStructure(replacement, CHAPTERS[1].id, { undoable: true });
  assert.equal(session.chapter.id, CHAPTERS[1].id);
  assert.equal(session.history.canUndo, false, 'nothing to undo across chapters');
});

test('loading without the undoable option replaces the history, as before', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  session.addRoomAt(9, 9);
  const replacement = new Structure();
  session.loadStructure(replacement, CHAPTERS[0].id);
  assert.equal(session.history.canUndo, false);
});
