import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure } from '../src/topology/graph.js';
import { searchCycles, findCycles } from '../src/topology/analysis.js';
import { SaveSlots } from '../src/persistence/store.js';
import { encodeProgress, decodeProgress } from '../src/persistence/share.js';
import { Sound } from '../src/ui/sound.js';
import { CHAPTERS } from '../src/campaign/chapters.js';

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

function ring() {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 3, y: 0 });
  s.addRoom({ id: 'c', x: 3, y: 3 });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  s.addPortal({ a: 'b', aFace: 'S', b: 'c', bFace: 'N' });
  s.addPortal({ a: 'c', aFace: 'W', b: 'a', bFace: 'S' });
  return s;
}

test('searchCycles reports a finished search as complete', () => {
  const r = searchCycles(ring());
  assert.equal(r.complete, true);
  assert.equal(r.reason, null);
  assert.equal(r.cycles.length, 1);
  assert.deepEqual(findCycles(ring()), r.cycles);
});

test('searchCycles says when its budget ran out', () => {
  const r = searchCycles(ring(), { budget: 1 });
  assert.equal(r.complete, false);
  assert.equal(r.reason, 'budget');
});

test('searchCycles says when its list was capped', () => {
  const r = searchCycles(ring(), { limit: 0 });
  assert.equal(r.complete, false);
  assert.equal(r.reason, 'limit');
});

test('the session reports loop completeness for the analysis panel', () => {
  const session = new Session({ chapterId: 'threshold' });
  assert.equal(session.analysis().loopsComplete, true);
});

test('nudgeRoom moves a room one step, as its own undo step', () => {
  const session = new Session({ chapterId: 'threshold' });
  const start = session.structure.rooms.get('hall');
  const x0 = start.x;
  assert.equal(session.nudgeRoom('hall', 1, 0), true);
  assert.equal(session.structure.rooms.get('hall').x, x0 + 1);
  session.undo();
  assert.equal(session.structure.rooms.get('hall').x, x0, 'one undo puts it back');
});

test('nudgeRoom refuses an unknown room', () => {
  const session = new Session({ chapterId: 'threshold' });
  assert.equal(session.nudgeRoom('nowhere', 1, 0), false);
});

test('SaveSlots can tell whether a slot exists, and remove it', () => {
  const slots = new SaveSlots(memory());
  assert.equal(slots.has('mine'), false);
  slots.save('mine', { chapterId: null, structure: new Structure(), progress: { completed: [], discoveries: [] } });
  assert.equal(slots.has('mine'), true);
  slots.remove('mine');
  assert.equal(slots.has('mine'), false);
});

test('a progress code round-trips completed chapters, discoveries and counts', () => {
  const progress = {
    completed: ['threshold', 'the-machine'],
    discoveries: ['closed-ring'],
    attempts: { threshold: 3 },
    time: { threshold: 120000 },
  };
  const code = encodeProgress(progress);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = decodeProgress(code, CHAPTERS.map((c) => c.id));
  assert.deepEqual(back.progress, progress);
});

test('a progress code drops chapter ids the game does not know', () => {
  const code = encodeProgress({ completed: ['threshold', 'made-up'], discoveries: [], attempts: { 'made-up': 2 }, time: {} });
  const back = decodeProgress(code, ['threshold']);
  assert.deepEqual(back.progress.completed, ['threshold']);
  assert.deepEqual(back.progress.attempts, {});
});

test('bad progress codes are refused with a reason, never thrown', () => {
  const ids = ['threshold'];
  assert.match(decodeProgress('', ids).error, /Paste/);
  assert.match(decodeProgress('not base64!', ids).error, /not a progress code/);
  assert.match(decodeProgress('bm90IGpzb24', ids).error, /could not be read/);
  const wrong = Buffer.from(JSON.stringify({ v: 2, completed: [] })).toString('base64url');
  assert.match(decodeProgress(wrong, ids).error, /not in a form this game knows/);
  const badCounts = Buffer.from(JSON.stringify({ v: 1, attempts: { threshold: -1 } })).toString('base64url');
  assert.match(decodeProgress(badCounts, ids).error, /not in a form/);
});

test('the sound volume is clamped, remembered, and read back', () => {
  const store = memory();
  const sound = new Sound(store);
  assert.equal(sound.volume, 1);
  sound.setVolume(0.4);
  assert.equal(store.getItem('ia-volume'), '0.4');
  assert.equal(new Sound(store).volume, 0.4);
  sound.setVolume(5);
  assert.equal(sound.volume, 1);
  sound.setVolume(-2);
  assert.equal(sound.volume, 0);
});

test('a corrupt stored volume falls back to full', () => {
  const sound = new Sound(memory({ 'ia-volume': 'loud' }));
  assert.equal(sound.volume, 1);
});
