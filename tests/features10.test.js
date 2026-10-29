import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSlots, encodeSave } from '../src/persistence/store.js';
import { Structure } from '../src/topology/graph.js';
import { modelLayout } from '../src/render/model3d.js';

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test('describe lists each slot with the chapter it belongs to', () => {
  const store = memory();
  const slots = new SaveSlots(store);
  slots.save('mine', { chapterId: 'threshold', structure: new Structure(), progress: {} });
  slots.save('free', { chapterId: null, structure: new Structure(), progress: {} });
  assert.deepEqual(slots.describe(), [
    { name: 'free', chapterId: null },
    { name: 'mine', chapterId: 'threshold' },
  ]);
});

test('describe lists an unreadable save without a chapter rather than failing', () => {
  const store = memory();
  store.setItem('ia-save:broken', 'not json');
  assert.deepEqual(new SaveSlots(store).describe(), [{ name: 'broken', chapterId: null }]);
});

test('describe is empty when nothing is saved', () => {
  assert.deepEqual(new SaveSlots(memory()).describe(), []);
});

test('modelLayout scales room positions with zoom, so clicks land where the view draws', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 3, y: 0 });
  const near = modelLayout(s, 400, 300, 0, 1).pts;
  const far = modelLayout(s, 400, 300, 0, 2).pts;
  const gap = (pts) => Math.hypot(pts.get('b').x - pts.get('a').x, pts.get('b').y - pts.get('a').y);
  assert.ok(gap(far) > gap(near) * 1.5, 'twice the zoom spreads the rooms further apart');
  assert.equal(modelLayout(s, 400, 300).scale, modelLayout(s, 400, 300, 0, 1).scale, 'zoom defaults to 1');
});

test('selectRoom with no id clears the selection rather than selecting a blank room', () => {
  // Imported lazily so this file's other tests stay independent of the session.
  return import('../src/game.js').then(({ Session }) => {
    const session = new Session({ chapterId: 'threshold' });
    session.selectRoom('hall');
    session.selectRoom(null);
    assert.equal(session.selection, null);
  });
});
