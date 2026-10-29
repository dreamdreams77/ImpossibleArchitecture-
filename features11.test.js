import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure } from '../src/topology/graph.js';
import { drawModel } from '../src/render/model3d.js';
import { themeFor } from '../src/render/themes.js';

function stubContext() {
  const noop = () => {};
  const target = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
}

test('the 3D model can outline a selected room, and an unknown one is harmless', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 3, y: 0 });
  const T = themeFor('slate');
  const size = { width: 300, height: 200 };
  assert.doesNotThrow(() => drawModel(stubContext(), s, size, T, 0, { selected: 'a' }));
  assert.doesNotThrow(() => drawModel(stubContext(), s, size, T, 0, { selected: 'nowhere' }));
});

test('history reports how far it can undo and redo, for the button tooltips', () => {
  const session = new Session({ chapterId: 'threshold' });
  assert.equal(session.history.index, 0);
  session.nudgeRoom('hall', 1, 0);
  session.nudgeRoom('hall', 1, 0);
  assert.equal(session.history.index, 2, 'two steps back');
  session.undo();
  assert.equal(session.history.stack.length - 1 - session.history.index, 1, 'one step forward');
});
