import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { History } from '../src/topology/history.js';
import { encodeSave, decodeSave, SaveSlots, restoreSaveIntoSession } from '../src/persistence/store.js';

test('history supports undo and redo', () => {
  const h = new History('a');
  h.push('b');
  h.push('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.canUndo, false);
  assert.equal(h.redo(), 'b');
  assert.equal(h.redo(), 'c');
  assert.equal(h.canRedo, false);
});

test('pushing after undo discards the redo branch', () => {
  const h = new History('a');
  h.push('b');
  h.undo();
  h.push('x');
  assert.equal(h.canRedo, false);
  assert.equal(h.current, 'x');
  assert.equal(h.undo(), 'a');
});

test('history ignores pushes of the identical state and respects its limit', () => {
  const h = new History('a', { limit: 3 });
  assert.equal(h.push('a'), false);
  h.push('b'); h.push('c'); h.push('d');
  assert.equal(h.stack.length, 3);
  assert.equal(h.current, 'd');
});

test('save round-trips chapter, structure and progress', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  s.addPortal({ a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 1 } });
  const text = encodeSave({ chapterId: 'returning-hall', structure: s, progress: {
    completed: ['threshold'], discoveries: ['mirror-gallery-loop'],
    attempts: { 'returning-hall': 7, 'hidden-stair': 2 },
    time: { 'returning-hall': 125000, 'hidden-stair': 42000 },
  } });
  const back = decodeSave(text);
  assert.equal(back.chapterId, 'returning-hall');
  assert.deepEqual(back.progress.completed, ['threshold']);
  assert.deepEqual(back.progress.discoveries, ['mirror-gallery-loop']);
  assert.deepEqual(back.progress.attempts, { 'returning-hall': 7, 'hidden-stair': 2 });
  assert.deepEqual(back.progress.time, { 'returning-hall': 125000, 'hidden-stair': 42000 });
  assert.deepEqual(back.structure.toJSON(), s.toJSON());
});

test('decodeSave rejects foreign and corrupt files', () => {
  assert.throws(() => decodeSave('{nope'), /not valid JSON/);
  assert.throws(() => decodeSave(JSON.stringify({ game: 'other' })), /Not an Impossible/);
  assert.throws(() => decodeSave(JSON.stringify({ game: 'impossible-architecture', saveVersion: 7 })), /Unsupported save version/);
});


test('Structure.fromJSON rejects ambiguous or malformed topology before loading', () => {
  const base = new Structure();
  const a = base.addRoom({ x: 0, y: 0 });
  const b = base.addRoom({ x: 2, y: 0 });
  base.addPortal({ a, aFace: 'N', b, bFace: 'S', transform: { turns: 1, mirror: true } });
  const original = base.toJSON();
  const corrupt = (mutate, code) => {
    const data = structuredClone(original);
    mutate(data);
    assert.throws(() => Structure.fromJSON(data), (err) => err.code === code);
  };

  corrupt((d) => { d.portals.push({ ...d.portals[0] }); }, 'DUPLICATE_PORTAL');
  corrupt((d) => { d.portals.push({ ...d.portals[0], id: 'p-extra', b: { room: a, face: 'N' } }); }, 'FACE_OCCUPIED');
  corrupt((d) => { d.portals[0].a.room = 'missing'; }, 'NO_ROOM');
  corrupt((d) => { d.portals[0].transform.turns = 8; }, 'BAD_TRANSFORM');
  corrupt((d) => { d.portals[0].transform.mirror = 'yes'; }, 'BAD_TRANSFORM');
  corrupt((d) => { d.portals[0].gate = -1; }, 'BAD_GATE');
  corrupt((d) => { d.portals[0].opensAfter = 1.5; }, 'BAD_CRATE');
  corrupt((d) => { d.rooms[0].x = Infinity; }, 'BAD_POSITION');
  corrupt((d) => { d.rooms[0].turn = 'sideways'; }, 'BAD_TURN');
  corrupt((d) => { d.nextId = 0; }, 'BAD_ID');
  corrupt((d) => { d.portals = {}; }, 'BAD_SHAPE');
});

test('Structure.fromJSON keeps valid self-room loops and one-way passages', () => {
  const s = new Structure();
  const room = s.addRoom({ x: 1, y: 2 });
  s.addPortal({ a: room, aFace: 'N', b: room, bFace: 'S', oneWay: 'a' });
  const loaded = Structure.fromJSON(s.toJSON());
  assert.deepEqual(loaded.toJSON(), s.toJSON());
});


test('decodeSave rejects malformed campaign progress without accepting partial state', () => {
  const base = {
    game: 'impossible-architecture', saveVersion: 1, chapterId: null,
    structure: new Structure().toJSON(),
    progress: { completed: [], discoveries: [], attempts: {}, time: {} },
  };
  for (const patch of [
    { completed: 'threshold' },
    { discoveries: [42] },
    { attempts: { threshold: -1 } },
    { attempts: [] },
    { time: { threshold: 'a long time' } },
  ]) {
    const data = { ...base, progress: { ...base.progress, ...patch } };
    assert.throws(() => decodeSave(JSON.stringify(data)), /invalid campaign progress/);
  }
});

test('decodeSave tolerates older saves without optional progress statistics', () => {
  const data = {
    game: 'impossible-architecture', saveVersion: 1, chapterId: null,
    structure: new Structure().toJSON(),
    progress: { completed: ['threshold'], discoveries: [] },
  };
  assert.deepEqual(decodeSave(JSON.stringify(data)).progress, {
    completed: ['threshold'], discoveries: [], attempts: {}, time: {},
  });
});


test('autosave recovery restores its matching campaign progress snapshot', () => {
  const source = new Structure();
  const a = source.addRoom({ x: 0, y: 0 });
  source.addPortal({ a, aFace: 'N', b: a, bFace: 'S', transform: { turns: 1 } });
  const raw = encodeSave({
    chapterId: 'threshold', structure: source,
    progress: {
      completed: ['threshold'], discoveries: ['reflected-ring'],
      attempts: { threshold: 4 }, time: { threshold: 98765 },
    },
  });
  const session = {
    chapter: { id: 'threshold' },
    progress: { completed: [], discoveries: [], attempts: {}, time: {} },
    loadStructure(structure, chapterId) {
      this.structure = structure;
      this.loadedChapter = chapterId;
    },
  };
  assert.equal(restoreSaveIntoSession(session, raw), true);
  assert.equal(session.loadedChapter, 'threshold');
  assert.deepEqual(session.structure.toJSON(), source.toJSON());
  assert.deepEqual(session.progress, {
    completed: ['threshold'], discoveries: ['reflected-ring'],
    attempts: { threshold: 4 }, time: { threshold: 98765 },
  });
});

test('autosave recovery refuses a different chapter without changing progress', () => {
  const session = {
    chapter: { id: 'threshold' },
    progress: { completed: ['old'], discoveries: [], attempts: {}, time: {} },
    loadStructure() { throw new Error('must not load another chapter'); },
  };
  const raw = encodeSave({
    chapterId: 'lantern-court', structure: new Structure(),
    progress: { completed: ['lantern-court'], discoveries: [], attempts: {}, time: {} },
  });
  assert.equal(restoreSaveIntoSession(session, raw), false);
  assert.deepEqual(session.progress.completed, ['old']);
});

test('autosave recovery restores free construction and its challenge state', () => {
  const source = new Structure();
  const a = source.addRoom({ x: 1, y: 2 });
  source.addPortal({ a, aFace: 'E', b: a, bFace: 'W' });
  const raw = encodeSave({
    chapterId: null, structure: source,
    challenge: { goal: { kind: 'reach', to: a } },
    progress: { completed: ['threshold'], discoveries: ['lantern-orbit'], attempts: {}, time: {} },
  });
  const session = {
    progress: { completed: [], discoveries: [], attempts: {}, time: {} },
    startSandbox() { this.sandboxStarted = true; },
    loadStructure(structure, chapterId, options) {
      this.structure = structure; this.loadedChapter = chapterId; this.challenge = options.challenge;
    },
  };
  assert.equal(restoreSaveIntoSession(session, raw), true);
  assert.equal(session.sandboxStarted, true);
  assert.equal(session.loadedChapter, null);
  assert.deepEqual(session.structure.toJSON(), source.toJSON());
  assert.deepEqual(session.progress.discoveries, ['lantern-orbit']);
});


test('autosave recovery survives repeated construction and progress round-trips', () => {
  const progress = {
    completed: ['threshold'], discoveries: ['reflected-ring'],
    attempts: { threshold: 3 }, time: { threshold: 12000 },
  };
  const session = {
    chapter: { id: 'threshold' },
    progress: { completed: [], discoveries: [], attempts: {}, time: {} },
    loadStructure(structure, chapterId) {
      this.structure = structure;
      this.loadedChapter = chapterId;
    },
  };

  // Repeatedly replace the saved construction, recover it, and immediately
  // serialize the recovered state again. This catches drift across many cycles.
  for (let cycle = 0; cycle < 100; cycle++) {
    const structure = new Structure();
    const count = 1 + (cycle % 7);
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(structure.addRoom({ x: i * 2, y: (cycle % 5) - 2 }));
    for (let i = 0; i + 1 < ids.length; i++) {
      structure.addPortal({ a: ids[i], aFace: 'E', b: ids[i + 1], bFace: 'W', transform: { turns: cycle % 4, mirror: cycle % 2 === 1 } });
    }
    const snapshot = {
      completed: cycle % 2 ? ['threshold'] : [],
      discoveries: cycle % 3 ? ['reflected-ring', 'lantern-orbit'] : [],
      attempts: { threshold: cycle, 'lantern-court': cycle * 2 },
      time: { threshold: cycle * 1000, 'lantern-court': cycle * 250 },
    };
    const raw = encodeSave({ chapterId: 'threshold', structure, progress: snapshot });
    assert.equal(restoreSaveIntoSession(session, raw), true, `restore cycle ${cycle}`);
    assert.deepEqual(session.structure.toJSON(), structure.toJSON(), `structure cycle ${cycle}`);
    assert.deepEqual(session.progress, snapshot, `progress cycle ${cycle}`);
    const second = decodeSave(encodeSave({
      chapterId: session.loadedChapter,
      structure: session.structure,
      progress: session.progress,
    }));
    assert.deepEqual(second.structure.toJSON(), structure.toJSON(), `re-encode cycle ${cycle}`);
    assert.deepEqual(second.progress, snapshot, `re-encode progress cycle ${cycle}`);
  }
});

test('failed save-slot writes preserve the last known-good save', () => {
  const values = new Map();
  let failWrites = false;
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (failWrites) throw new Error('simulated quota exceeded');
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  const slots = new SaveSlots(storage);
  const first = { chapterId: 'threshold', structure: new Structure(), progress: { completed: ['threshold'] } };
  slots.save('autosave', first);
  const knownGood = values.get('ia-save:autosave');

  failWrites = true;
  assert.throws(() => slots.save('autosave', {
    chapterId: 'threshold', structure: new Structure(), progress: { completed: [] },
  }), /quota exceeded/);
  assert.equal(values.get('ia-save:autosave'), knownGood);
  assert.deepEqual(slots.load('autosave').progress.completed, ['threshold']);
});

test('recovery rejects a batch of corrupted autosaves without mutating the session', () => {
  const structure = new Structure();
  structure.addRoom({ x: 0, y: 0 });
  const valid = JSON.parse(encodeSave({
    chapterId: 'threshold', structure,
    progress: { completed: ['threshold'], discoveries: [], attempts: {}, time: {} },
  }));
  const session = {
    chapter: { id: 'threshold' },
    progress: { completed: ['keep-me'], discoveries: [], attempts: {}, time: {} },
    structure: 'untouched',
    loadStructure() { throw new Error('corrupt save must never reach loadStructure'); },
  };

  const corruptions = [
    (d) => { d.structure.rooms = {}; },
    (d) => { d.structure.nextId = -1; },
    (d) => { d.progress.completed = [null]; },
    (d) => { d.progress.attempts = { threshold: Infinity }; },
    (d) => { d.progress.time = []; },
    (d) => { d.chapterId = 42; },
    (d) => { d.challenge = { goal: 'not-a-valid-goal' }; },
  ];
  for (const corrupt of corruptions) {
    const data = structuredClone(valid);
    corrupt(data);
    assert.equal(restoreSaveIntoSession(session, JSON.stringify(data)), false);
    assert.equal(session.structure, 'untouched');
    assert.deepEqual(session.progress.completed, ['keep-me']);
  }
  assert.equal(restoreSaveIntoSession(session, '{truncated json'), false);
  assert.equal(session.structure, 'untouched');
});

test('SaveSlots writes and reads through an injected storage', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
  const slots = new SaveSlots(storage);
  assert.equal(slots.load('1'), null);
  slots.save('1', { chapterId: 'threshold', structure: new Structure(), progress: { completed: [] } });
  assert.equal(slots.load('1').chapterId, 'threshold');
  slots.remove('1');
  assert.equal(slots.load('1'), null);
});
