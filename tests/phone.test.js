import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure } from '../src/topology/graph.js';
import { hitTest, faceAnchor } from '../src/render/geometry.js';
import { drawPlan } from '../src/render/draw.js';
import { fitViewFor, scaleNeededToFit, MIN_SCALE } from '../src/render/view.js';

function recorder() {
  const calls = [];
  const target = { measureText: (t) => ({ width: String(t).length * 6.5 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
  return { calls, ctx: new Proxy(target, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: () => true }) };
}

test('a fingertip-sized radius picks the nearest face dot, and a plain mouse radius still misses', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 }); s.addRoom({ id: 'b', x: 2, y: 0 });
  const e = faceAnchor(s.rooms.get('a'), 'E');
  // About 0.46 world units from the dot: 11 px at a scale of 24, a finger's wobble.
  assert.notEqual(hitTest(s, e.x + 0.1, e.y + 0.45)?.type, 'face', 'the default radius is for a mouse');
  const hit = hitTest(s, e.x + 0.1, e.y + 0.45, { faceRadius: 20 / 24 });
  assert.deepEqual([hit.type, hit.room, hit.face], ['face', 'a', 'E']);
});

test('room slack widens the room target without stealing a face dot', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  assert.equal(hitTest(s, 0.6, 0.5)?.type ?? null, null);
  assert.equal(hitTest(s, 0.6, 0.5, { roomSlack: 0.3 })?.type, 'room');
  const e = faceAnchor(s.rooms.get('a'), 'N');
  assert.equal(hitTest(s, e.x, e.y, { roomSlack: 0.3 }).type, 'face');
});

test('small rooms put their name underneath, shortened and haloed; big rooms keep it inside', () => {
  const session = new Session({ chapterId: 'the-far-wing' });
  const small = recorder();
  drawPlan(small.ctx, { scale: 24, offsetX: 60, offsetY: 120 }, session, { width: 390, height: 389 }, 0);
  const strokes = small.calls.filter((c) => c[0] === 'strokeText').map((c) => c[1]);
  assert.ok(strokes.length >= 5, 'every room named with a halo');
  assert.ok(strokes.every((t) => t.length <= 12), 'and kept short');
  const big = recorder();
  drawPlan(big.ctx, { scale: 100, offsetX: 60, offsetY: 120 }, session, { width: 900, height: 600 }, 0);
  assert.equal(big.calls.filter((c) => c[0] === 'strokeText').length, 0, 'large rooms are labelled inside');
  assert.ok(big.calls.some((c) => c[0] === 'fillText' && c[1] === 'West Gate'));
});

test('a long name is shortened to fit under a small room', () => {
  const s = new Session();
  s.startSandbox(); s.addRoomAt(0, 0);
  const id = [...s.structure.rooms.keys()][0];
  s.renameRoom(id, 'The Extraordinarily Long Room Name');
  const r = recorder();
  drawPlan(r.ctx, { scale: 24, offsetX: 100, offsetY: 100 }, s, { width: 390, height: 389 }, 0);
  const shown = r.calls.filter((c) => c[0] === 'strokeText').map((c) => c[1])[0];
  assert.ok(shown.endsWith('…') && shown.length < 20, shown);
});

test('every challenge fits a phone-shaped canvas with all its rooms visible', async () => {
  const { CHAPTERS, chapterStructure } = await import('../src/campaign/chapters.js');
  for (const c of CHAPTERS) {
    const s = chapterStructure(c);
    // Contradiction draws its rooms 300 units apart on purpose: no plan can show both, and the app says so.
    if (scaleNeededToFit(s, 390, 389) < MIN_SCALE) { assert.equal(c.id, 'contradiction', `${c.id} is the only challenge too wide for a phone plan`); continue; }
    const { scale, offsetX, offsetY } = fitViewFor(s, 390, 389);
    for (const r of s.rooms.values()) {
      const x = r.x * scale + offsetX; const y = r.y * scale + offsetY;
      assert.ok(x - 0.42 * scale >= -0.5 && x + 0.42 * scale <= 390.5 && y - 0.42 * scale >= -0.5 && y + 0.42 * scale <= 389.5, `${c.id}: ${r.id} is on screen`);
    }
  }
});

test('nearestFace lets a tap anywhere on a room choose its face', async () => {
  const { nearestFace, faceAnchor } = await import('../src/render/geometry.js');
  const room = { id: 'r', x: 4, y: 4, size: 1 };
  for (const face of ['N', 'E', 'S', 'W']) {
    const a = faceAnchor(room, face);
    // a point a little inside the room towards that face picks it
    const px = room.x + (a.x - room.x) * 0.5;
    const py = room.y + (a.y - room.y) * 0.5;
    assert.equal(nearestFace(room, px, py), face);
  }
});

test('nearestFace follows a rotated room', async () => {
  const { nearestFace, faceAnchor } = await import('../src/render/geometry.js');
  const room = { id: 'r', x: 0, y: 0, size: 1, turn: 1 };
  for (const face of ['N', 'E', 'S', 'W']) {
    const a = faceAnchor(room, face);
    assert.equal(nearestFace(room, a.x * 0.5, a.y * 0.5), face);
  }
});
