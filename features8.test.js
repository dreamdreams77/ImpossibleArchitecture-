import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure } from '../src/topology/graph.js';
import { CHAPTERS } from '../src/campaign/chapters.js';
import { encodeSave, decodeSave } from '../src/persistence/store.js';
import { encodeShare, SHARE_LIMIT } from '../src/persistence/share.js';

test('previousChapterId is null at the first chapter and the one before otherwise', () => {
  assert.equal(new Session({ chapterId: CHAPTERS[0].id }).previousChapterId(), null);
  assert.equal(new Session({ chapterId: CHAPTERS[1].id }).previousChapterId(), CHAPTERS[0].id);
  const session = new Session({ chapterId: CHAPTERS[2].id });
  session.startSandbox();
  assert.equal(session.previousChapterId(), null, 'free construction has no chapters to go back to');
});

test('clearConstruction empties a free construction and undo brings it back', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  session.startSandbox();
  session.addRoomAt(0, 0);
  session.addRoomAt(3, 0);
  assert.equal(session.structure.rooms.size, 2);
  assert.equal(session.clearConstruction(), true);
  assert.equal(session.structure.rooms.size, 0);
  session.undo();
  assert.equal(session.structure.rooms.size, 2, 'undo restores the rooms');
});

test('clearConstruction refuses inside a chapter, where restart is the right tool', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  const before = session.structure.rooms.size;
  assert.equal(session.clearConstruction(), false);
  assert.equal(session.structure.rooms.size, before);
});

test('the construction survives a save and reload in the same format as manual saves', () => {
  const session = new Session({ chapterId: CHAPTERS[0].id });
  const text = encodeSave({ chapterId: CHAPTERS[0].id, structure: session.structure, progress: session.progress });
  const back = decodeSave(text);
  assert.equal(back.chapterId, CHAPTERS[0].id);
  assert.equal(back.structure.rooms.size, session.structure.rooms.size);
});

test('a free construction is saved with a null chapter', () => {
  const text = encodeSave({ chapterId: null, structure: new Structure(), progress: { completed: [], discoveries: [] } });
  assert.equal(decodeSave(text).chapterId, null);
});

test('a construction too large for a share link is reported by length', () => {
  const s = new Structure();
  for (let i = 0; i < 2000; i++) s.addRoom({ id: `r${i}`, x: i % 50, y: Math.floor(i / 50), label: `Room number ${i}` });
  assert.ok(encodeShare(s).length > SHARE_LIMIT, 'a big construction exceeds the limit');
  const small = new Structure();
  small.addRoom({ id: 'a', x: 0, y: 0 });
  assert.ok(encodeShare(small).length <= SHARE_LIMIT);
});
