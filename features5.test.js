import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSlots } from '../src/persistence/store.js';
import { Structure } from '../src/topology/graph.js';
import { drawModel, modelLayout } from '../src/render/model3d.js';
import { themeFor } from '../src/render/themes.js';

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test('names lists only this game\'s slots, sorted, without the prefix', () => {
  const store = memory({ 'ia-save:beta': '{}', 'ia-save:alpha': '{}', 'ia-progress': '{}', 'ia-theme': 'dark' });
  assert.deepEqual(new SaveSlots(store).names(), ['alpha', 'beta']);
});

test('names works with the indexed key(i) accessor used by localStorage', () => {
  const data = { 'ia-save:one': '{}', 'other': 'x' };
  const indexed = {
    length: Object.keys(data).length,
    key: (i) => Object.keys(data)[i],
    getItem: (k) => data[k] ?? null,
  };
  assert.deepEqual(new SaveSlots(indexed).names(), ['one']);
});

test('names is empty when nothing is saved', () => {
  assert.deepEqual(new SaveSlots(memory()).names(), []);
});

test('the 3D model accepts a zoom from both ends of its range', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 3, y: 0 });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  const T = themeFor('slate');
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: () => true });
  for (const zoom of [0.4, 1, 3]) {
    assert.doesNotThrow(() => drawModel(ctx, s, { width: 300, height: 200 }, T, 0, { zoom }));
  }
  // The layout helper keeps its default scale: zoom is a drawing option only.
  assert.equal(modelLayout(s, 300, 200).scale, modelLayout(s, 300, 200, 0).scale);
});
