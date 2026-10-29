import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { hitTest, portalHit, graphLayout, faceAnchor, portalCurve } from '../src/render/geometry.js';

function sample() {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 2, y: 0 });
  s.addPortal({ id: 'p1', a, aFace: 'E', b, bFace: 'W' });
  return s;
}

test('clicking a face anchor hits that face', () => {
  const s = sample();
  const anchor = faceAnchor(s.rooms.get('a'), 'E');
  assert.deepEqual(hitTest(s, anchor.x, anchor.y), { type: 'face', room: 'a', face: 'E' });
});

test('clicking inside a room hits the room', () => {
  const s = sample();
  assert.deepEqual(hitTest(s, 0, 0), { type: 'room', id: 'a' });
});

test('clicking empty space hits nothing', () => {
  assert.equal(hitTest(sample(), 10, 10), null);
});

test('a portal curve can be hit along its length', () => {
  const s = sample();
  const curve = portalCurve(s.rooms.get('a'), 'E', s.rooms.get('b'), 'W', 'p1');
  const mid = curve[Math.floor(curve.length / 2)];
  assert.deepEqual(portalHit(s, mid.x, mid.y), { type: 'portal', id: 'p1' });
});

test('self-loop portals produce a curve away from the room', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addPortal({ id: 'loop', a, aFace: 'N', b: a, bFace: 'S' });
  const curve = portalCurve(s.rooms.get('a'), 'N', s.rooms.get('a'), 'S', 'loop');
  assert.ok(curve.length > 2);
  assert.ok(curve.some((p) => Math.hypot(p.x, p.y) > 1));
});

test('graph layout places every room on a circle regardless of plan position', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 1000, y: 1000 });
  const layout = graphLayout(s, 1);
  for (const p of layout.values()) {
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-9);
  }
});

import { sightCardModel } from '../src/render/sightcards.js';

test('sight card model: one entry per face, walls for closed faces, passages with arrival headings', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0, label: 'Hall' });
  const b = s.addRoom({ id: 'b', x: 1, y: 0, label: 'Vault' });
  s.addPortal({ a, aFace: 'E', b, bFace: 'N', transform: { turns: 1 } });
  const model = sightCardModel(s, 'a');
  assert.equal(model.length, 4);
  assert.deepEqual(model.map((m) => m.face), ['N', 'E', 'S', 'W']);
  assert.equal(model.find((m) => m.face === 'N').kind, 'wall');
  const east = model.find((m) => m.face === 'E');
  assert.equal(east.kind, 'passage');
  assert.equal(east.label, 'Vault');
  assert.equal(east.arrival, 'W'); // entering b through N gives S; one turn gives W
});

test('sight card model: a gated passage is marked as gated', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', gate: 0 });
  assert.equal(sightCardModel(s, 'a').find((m) => m.face === 'E').gated, true);
});

test('sight card model is null for an unknown room', () => {
  assert.equal(sightCardModel(new Structure(), 'nope'), null);
});

test('sight card model carries a passage\'s quarter-turns and mirror', () => {
  const s = new Structure();
  const a = s.addRoom({ id: 'a', x: 0, y: 0 });
  const b = s.addRoom({ id: 'b', x: 1, y: 0 });
  s.addPortal({ a, aFace: 'E', b, bFace: 'W', transform: { turns: 3, mirror: true } });
  const e = sightCardModel(s, 'a').find((m) => m.face === 'E');
  assert.equal(e.turns, 3);
  assert.equal(e.mirror, true);
});
