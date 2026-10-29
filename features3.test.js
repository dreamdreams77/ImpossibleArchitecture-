import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { drawModel, coastAngle, describeModel } from '../src/render/model3d.js';
import { drawFirstPerson, transitionKind, turnDirection } from '../src/render/firstperson.js';
import { themeFor } from '../src/render/themes.js';
import { Structure } from '../src/topology/graph.js';

// A context that accepts any drawing call, as the render smoke test does.
function stubContext() {
  const noop = () => {};
  const target = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
}

const solveStillwater = (session) => {
  session.pickFace('pool', 'S');
  session.pickFace('reeds', 'W');
  session.testConstruction();
};

test('routeText gives numbered plain-language steps for the passing route', () => {
  const session = new Session({ chapterId: 'the-stillwater' });
  assert.equal(session.routeText(), null, 'no text before a passing test');
  solveStillwater(session);
  assert.ok(session.routeHighlight, 'the test passes');
  const text = session.routeText();
  const lines = text.split('\n');
  assert.equal(lines.length, session.routeHighlight.faces.length);
  assert.match(lines[0], /^1\. Leave Pool by its south side; arrive in Reeds facing/);
  assert.match(lines.at(-1), /arrive in Dock facing/);
});

test('the Stillwater: solved, the walk runs the whole route', () => {
  const session = new Session({ chapterId: 'the-stillwater' });
  solveStillwater(session);
  assert.equal(session.startWalk(), true);
  assert.equal(session.walk.steps, session.routeHighlight.faces.length);
});

test('transitionKind: a move steps, a change of heading turns', () => {
  assert.equal(transitionKind('a|N|0', 'a|N|0'), 'step');
  assert.equal(transitionKind('a|N|0', 'a|E|0'), 'turn');
  assert.equal(transitionKind('a|N|0', 'b|N|1'), 'step');
  assert.equal(transitionKind('empty', 'a|N|0'), 'step');
});

test('turnDirection: a right turn slides from the left and a left turn from the right', () => {
  assert.equal(turnDirection('a|N|0', 'a|E|0'), -1, 'N to E is a right turn');
  assert.equal(turnDirection('a|E|0', 'a|N|0'), 1, 'E to N is a left turn');
  assert.equal(turnDirection('a|W|0', 'a|N|0'), -1, 'wraps around: W to N is a right turn');
});

test('drawFirstPerson draws both transition kinds without error at every progress', () => {
  const size = { width: 300, height: 200 };
  const T = themeFor('dusk');
  for (const kind of ['step', 'turn']) {
    for (const progress of [0, 0.5, 1]) {
      assert.doesNotThrow(() => drawFirstPerson(stubContext(), null, size, T, 0, { progress, kind, dir: -1 }));
    }
  }
});

test('the 3D model accepts an orbit angle and a walker on the route', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, label: 'A' });
  s.addRoom({ id: 'b', x: 3, y: 0, label: 'B' });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  const T = themeFor('slate');
  const size = { width: 400, height: 300 };
  const walker = { trail: ['a', 'b'], progress: 0.5 };
  for (const angle of [0, 0.5, Math.PI, -2]) {
    assert.doesNotThrow(() => drawModel(stubContext(), s, size, T, 100, { angle, walker }));
  }
  // A walker whose trail rooms are gone is skipped, not an error.
  assert.doesNotThrow(() => drawModel(stubContext(), s, size, T, 0, { walker: { trail: ['x', 'y'], progress: 0 } }));
});

test('coastAngle carries the turn on, slows down and settles to rest', () => {
  let state = { angle: 0, spin: 0.1 };
  const first = coastAngle(state.angle, state.spin);
  assert.ok(Math.abs(first.angle - 0.1) < 1e-9, 'the first frame moves by the spin');
  assert.ok(first.spin < 0.1 && first.spin > 0, 'the spin decays');
  for (let i = 0; i < 400; i++) state = { ...state, ...coastAngle(state.angle, state.spin) };
  assert.equal(state.spin, 0, 'a spin too small to see stops');
  assert.equal(coastAngle(1, 0).angle, 1, 'no spin, no movement');
});

test('describeModel gives room and portal counts with how to turn the model', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, label: 'A' });
  assert.match(describeModel(s), /^Isometric model: 1 room, 0 portals\./);
  s.addRoom({ id: 'b', x: 3, y: 0, label: 'B' });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W' });
  const text = describeModel(s);
  assert.match(text, /2 rooms, 1 portal\./);
  assert.match(text, /arrow keys/);
  assert.match(text, /F returns/);
});
