import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { ATLAS, atlasIn } from '../src/campaign/atlas.js';
import { Session } from '../src/game.js';

function rooms(n, spacing = 3) {
  const s = new Structure();
  for (let i = 0; i < n; i++) s.addRoom({ id: `r${i}`, x: i * spacing, y: 0 });
  return s;
}
const ring = (s, n, transforms = []) => {
  for (let i = 0; i < n; i++) s.addPortal({ a: `r${i}`, aFace: 'E', b: `r${(i + 1) % n}`, bFace: 'W', transform: { turns: 0, mirror: false, ...(transforms[i] ?? {}) } });
  return s;
};

test('an empty or plain construction finds nothing', () => {
  assert.deepEqual(atlasIn(rooms(3)), []);
  const s = rooms(3); s.addPortal({ a: 'r0', aFace: 'E', b: 'r1', bFace: 'W' });
  assert.deepEqual(atlasIn(s), []);
});

test('self joins and mirrors', () => {
  const s = rooms(1);
  s.addPortal({ a: 'r0', aFace: 'E', b: 'r0', bFace: 'N', transform: { turns: 1, mirror: false } });
  assert.deepEqual(atlasIn(s), ['atlas:self-room']);
  const m = rooms(1);
  m.addPortal({ a: 'r0', aFace: 'E', b: 'r0', bFace: 'W', transform: { turns: 0, mirror: true } });
  assert.ok(atlasIn(m).includes('atlas:hall-of-mirrors'));
});

test('loops are classified by their net turn and reflection', () => {
  assert.ok(atlasIn(ring(rooms(3), 3, [{ turns: 1 }])).includes('atlas:quarter-loop'));
  assert.ok(atlasIn(ring(rooms(3), 3, [{ turns: 2 }])).includes('atlas:half-loop'));
  assert.ok(atlasIn(ring(rooms(3), 3, [{ mirror: true }])).includes('atlas:chirality'));
  const cancel = atlasIn(ring(rooms(4), 4, [{ turns: 1 }, { turns: 3 }]));
  assert.ok(cancel.includes('atlas:cancelling-twists'));
  assert.ok(!cancel.includes('atlas:quarter-loop'));
});

test('one-way rings, long circuits and shared rooms', () => {
  const s = ring(rooms(5), 5);
  assert.ok(atlasIn(s).includes('atlas:long-circuit'));
  for (const p of s.portals.values()) p.oneWay = 'a';
  assert.ok(atlasIn(s).includes('atlas:one-way-ring'));
  const two = rooms(5);
  two.addPortal({ a: 'r0', aFace: 'E', b: 'r1', bFace: 'W' });
  two.addPortal({ a: 'r1', aFace: 'E', b: 'r0', bFace: 'S' });
  two.addPortal({ a: 'r0', aFace: 'N', b: 'r2', bFace: 'W' });
  two.addPortal({ a: 'r2', aFace: 'E', b: 'r0', bFace: 'W' });
  assert.ok(atlasIn(two).includes('atlas:two-loops'));
});

test('plan and graph distance', () => {
  const far = rooms(2, 9);
  far.addPortal({ a: 'r0', aFace: 'E', b: 'r1', bFace: 'W' });
  assert.ok(atlasIn(far).includes('atlas:far-neighbours'));
  const strangers = new Structure();
  for (let i = 0; i < 5; i++) strangers.addRoom({ id: `r${i}`, x: i % 2 ? 1 : 0, y: i * 0.7 });
  const faces = [['E', 'W'], ['S', 'N']];
  for (let i = 0; i < 4; i++) strangers.addPortal({ a: `r${i}`, aFace: 'E', b: `r${i + 1}`, bFace: 'W' });
  assert.ok(atlasIn(strangers).includes('atlas:near-strangers'), faces.length ? 'ok' : '');
});

test('every entry has text, a hint written as a question, and a unique atlas id', () => {
  const ids = new Set();
  for (const e of ATLAS) {
    assert.match(e.id, /^atlas:/); assert.ok(!ids.has(e.id)); ids.add(e.id);
    assert.ok(e.title && e.text); assert.match(e.hint, /\?$/);
  }
});

test('building a phenomenon in free construction records it once and announces it', () => {
  const s = new Session();
  s.startSandbox();
  s.addRoomAt(0, 0);
  const [a] = [...s.structure.rooms.keys()];
  s.pickFace(a, 'E'); s.pickFace(a, 'W');
  assert.ok(s.progress.discoveries.includes('atlas:self-room'));
  assert.match(s.feedback.text, /Atlas/);
  const n = s.progress.discoveries.length;
  s.checkAtlas();
  assert.equal(s.progress.discoveries.length, n);
});
