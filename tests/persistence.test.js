import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { History } from '../src/topology/history.js';
import { encodeSave, decodeSave, SaveSlots } from '../src/persistence/store.js';

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
