import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinch } from '../src/ui/pinch.js';
import { SaveSlots } from '../src/persistence/store.js';
import { encodeProgress, decodeProgress } from '../src/persistence/share.js';

test('one finger is never a pinch', () => {
  const p = createPinch();
  assert.equal(p.down(1, 0, 0), false);
  assert.equal(p.move(1, 10, 10), null);
  assert.equal(p.active(), false);
});

test('two fingers apart and together give the zoom factor', () => {
  const p = createPinch();
  p.down(1, 0, 0);
  p.down(2, 100, 0);
  assert.equal(p.active(), true);
  // Move the second finger out to 200: the span doubles.
  const z = p.move(2, 200, 0);
  assert.ok(Math.abs(z.factor - 2) < 1e-9, `factor ${z.factor}`);
  assert.equal(z.cx, 100, 'midpoint of 0 and 200');
  // Bring it back to 100: the span halves from 200.
  const back = p.move(2, 100, 0);
  assert.ok(Math.abs(back.factor - 0.5) < 1e-9);
});

test('moving both fingers together pans by the midpoint\'s total movement', () => {
  const p = createPinch();
  p.down(1, 0, 0);
  p.down(2, 100, 0);           // midpoint starts at (50, 0)
  const a = p.move(1, 30, 40); // midpoint now (65, 20)
  const b = p.move(2, 130, 40); // midpoint now (80, 40)
  assert.ok(Math.abs(a.dx + b.dx - 30) < 1e-9, `total pan x ${a.dx + b.dx}`);
  assert.ok(Math.abs(a.dy + b.dy - 40) < 1e-9, `total pan y ${a.dy + b.dy}`);
});

test('lifting a finger ends the pinch, and a stray move is ignored', () => {
  const p = createPinch();
  p.down(1, 0, 0);
  p.down(2, 100, 0);
  p.up(2);
  assert.equal(p.active(), false);
  assert.equal(p.move(1, 5, 5), null);
  assert.equal(p.move(9, 5, 5), null, 'an unknown pointer is not tracked');
});

test('coincident fingers do not divide by zero', () => {
  const p = createPinch();
  p.down(1, 50, 50);
  p.down(2, 50, 50);
  assert.equal(p.move(2, 60, 50), null);
});

test('progress codes and save slots still work alongside the pinch module', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    keys: () => [...store.keys()],
  };
  new SaveSlots(storage).save('x', { chapterId: null, structure: new (class { toJSON() { return { rooms: [], portals: [] }; } })(), progress: {} });
  assert.deepEqual(new SaveSlots(storage).names(), ['x']);
  const code = encodeProgress({ completed: ['threshold'], discoveries: [], attempts: {}, time: {} });
  assert.deepEqual(decodeProgress(code, ['threshold']).progress.completed, ['threshold']);
});
