import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, defaultBindings, rebind, translate, loadBindings, saveBindings } from '../src/ui/keybindings.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('defaults translate to themselves', () => {
  const b = defaultBindings();
  for (const a of ACTIONS) assert.equal(translate(b, a.key), a.key);
  assert.equal(translate(b, 'ArrowUp'), 'ArrowUp');
});

test('a rebound key acts as the default, and the old default goes quiet', () => {
  const r = rebind(defaultBindings(), 'forward', 'k');
  assert.ok(r.bindings);
  assert.equal(translate(r.bindings, 'k'), 'w');
  assert.equal(translate(r.bindings, 'w'), null);
  assert.equal(translate(r.bindings, 'x'), 'x');
});

test('reserved keys, duplicates and shadowed defaults are refused with a reason', () => {
  const b = defaultBindings();
  assert.match(rebind(b, 'forward', 'Escape').error, /cannot be bound/);
  assert.match(rebind(b, 'forward', 'e').error, /already turn right/);
  const moved = rebind(b, 'turnRight', 'l').bindings;
  assert.match(rebind(moved, 'forward', 'e').error, /default for turn right/);
  assert.match(rebind(b, 'nonsense', 'z').error, /Unknown action/);
});

test('bindings persist and bad stored data falls back to defaults', () => {
  const st = memory();
  saveBindings(st, rebind(defaultBindings(), 'hint', 'j').bindings);
  assert.equal(loadBindings(st).hint, 'j');
  st.setItem('ia-keys', '{not json');
  assert.deepEqual(loadBindings(st), defaultBindings());
  st.setItem('ia-keys', JSON.stringify({ hint: 'toolong', test: 5 }));
  assert.deepEqual(loadBindings(st), defaultBindings());
});
