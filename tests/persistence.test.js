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
  const text = encodeSave({ chapterId: 'returning-hall', structure: s, progress: { completed: ['threshold'] } });
  const back = decodeSave(text);
  assert.equal(back.chapterId, 'returning-hall');
  assert.deepEqual(back.progress.completed, ['threshold']);
  assert.deepEqual(back.structure.toJSON(), s.toJSON());
});

test('decodeSave rejects foreign and corrupt files', () => {
  assert.throws(() => decodeSave('{nope'), /not valid JSON/);
  assert.throws(() => decodeSave(JSON.stringify({ game: 'other' })), /Not an Impossible/);
  assert.throws(() => decodeSave(JSON.stringify({ game: 'impossible-architecture', saveVersion: 7 })), /Unsupported save version/);
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
