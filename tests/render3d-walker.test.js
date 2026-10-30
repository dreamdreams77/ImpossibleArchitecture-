import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Walker } from '../src/render3d/walker.js';
import { Structure } from '../src/topology/graph.js';
import { makeTraveller, step } from '../src/topology/traversal.js';
import { halfWidth, yawHeading, headingYaw } from '../src/render3d/frames.js';

const halfOf = (s) => (id) => halfWidth(s.rooms.get(id).size ?? 1);
const headingOf = (w) => yawHeading(w.pose().yaw);

function build(portals, rooms = ['a', 'b', 'c']) {
  const s = new Structure();
  rooms.forEach((id, i) => s.addRoom({ id, x: i * 3, y: 0 }));
  for (const p of portals) s.addPortal(p);
  return s;
}

test('a step walks through the doorway and ends at the engine heading in the engine room', () => {
  const s = build([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const w = new Walker();
  let t = makeTraveller('a', 'E');
  w.sync(s, t, halfOf(s));
  t = step(s, t, 'E');
  w.sync(s, t, halfOf(s));
  assert.ok(w.busy);
  w.finish();
  assert.equal(w.room, 'b');
  assert.equal(headingOf(w), t.heading);
  assert.ok(Math.hypot(w.x, w.z) < 1e-9, 'rests at the middle of the room');
});

test('crossing events are reported, in order, as time passes', () => {
  const s = build([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { mirror: true } }]);
  const w = new Walker();
  let t = makeTraveller('a', 'E');
  w.sync(s, t, halfOf(s));
  t = step(s, t, 'E');
  w.sync(s, t, halfOf(s));
  const seen = [];
  for (let i = 0; i < 400 && w.busy; i++) seen.push(...w.update(1 / 60));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'cross');
  assert.equal(seen[0].mirror, true);
  assert.equal(headingOf(w), t.heading);
});

test('a position is continuous through the crossing', () => {
  const s = build([{ a: 'a', aFace: 'N', b: 'c', bFace: 'S' }]);
  const w = new Walker();
  let t = makeTraveller('a', 'N');
  w.sync(s, t, halfOf(s));
  t = step(s, t, 'N');
  w.sync(s, t, halfOf(s));
  let prev = null;
  let maxJump = 0;
  for (let i = 0; i < 600 && w.busy; i++) {
    w.update(1 / 120);
    const p = w.pose();
    if (prev && prev.room === p.room) maxJump = Math.max(maxJump, Math.hypot(p.pos[0] - prev.pos[0], p.pos[2] - prev.pos[2]));
    prev = p;
  }
  assert.ok(maxJump < 0.2, `no teleport within a room (largest step ${maxJump})`);
});

test('quarter-turn passages turn the walker; the walker ends at the engine heading', () => {
  for (const turns of [1, 2, 3]) {
    const s = build([{ a: 'a', aFace: 'E', b: 'b', bFace: 'N', transform: { turns } }]);
    const w = new Walker();
    let t = makeTraveller('a', 'E');
    w.sync(s, t, halfOf(s));
    t = step(s, t, 'E');
    w.sync(s, t, halfOf(s));
    w.finish();
    assert.equal(headingOf(w), t.heading, `turns ${turns}`);
  }
});

test('a self-loop is walked as a step, not a snap', () => {
  const s = build([{ a: 'a', aFace: 'N', b: 'a', bFace: 'S', transform: { turns: 1 } }], ['a']);
  const w = new Walker();
  let t = makeTraveller('a', 'N');
  w.sync(s, t, halfOf(s));
  t = step(s, t, 'N');
  w.sync(s, t, halfOf(s));
  assert.ok(w.busy);
  w.finish();
  assert.equal(w.room, 'a');
  assert.equal(headingOf(w), t.heading);
});

test('turning in place animates to the new heading by the short way', () => {
  const s = build([], ['a']);
  const w = new Walker();
  w.sync(s, { room: 'a', heading: 'N', steps: 0 }, halfOf(s));
  w.sync(s, { room: 'a', heading: 'W', steps: 0 }, halfOf(s));
  w.finish();
  assert.ok(Math.abs(w.yaw - headingYaw('W')) < 1e-9);
  w.sync(s, { room: 'a', heading: 'N', steps: 0 }, halfOf(s));
  w.finish();
  assert.ok(Math.abs(w.yaw - 0) < 1e-9);
});

test('a route replay (turn and step in one tick) still walks through the right door', () => {
  const s = build([{ a: 'a', aFace: 'S', b: 'b', bFace: 'N' }]);
  const w = new Walker();
  let t = makeTraveller('a', 'N');
  w.sync(s, t, halfOf(s));
  t = step(s, { ...t, heading: 'S' }, 'S'); // the replay sets the heading, then walks forward
  w.sync(s, t, halfOf(s));
  assert.ok(w.busy);
  w.finish();
  assert.equal(w.room, 'b');
  assert.equal(headingOf(w), t.heading);
});

test('an unexplained jump snaps instead of animating', () => {
  const s = build([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const w = new Walker();
  w.sync(s, { room: 'a', heading: 'N', steps: 0 }, halfOf(s));
  w.sync(s, { room: 'c', heading: 'S', steps: 7 }, halfOf(s));
  assert.equal(w.busy, false);
  assert.equal(w.room, 'c');
  assert.equal(headingOf(w), 'S');
});

test('a chain of steps through a random structure always ends in the engine state', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let trial = 0; trial < 20; trial++) {
    const s = new Structure();
    const ids = ['p', 'q', 'r', 'u'];
    ids.forEach((id, i) => s.addRoom({ id, x: i, y: 0, size: [0.75, 1, 1.5][i % 3] }));
    const faces = ['N', 'E', 'S', 'W'];
    for (let k = 0; k < 6; k++) {
      try {
        s.addPortal({
          a: ids[Math.floor(rnd() * 4)], aFace: faces[Math.floor(rnd() * 4)], b: ids[Math.floor(rnd() * 4)], bFace: faces[Math.floor(rnd() * 4)],
          transform: { turns: Math.floor(rnd() * 4), mirror: rnd() < 0.3 },
        });
      } catch { /* occupied face */ }
    }
    const w = new Walker();
    let t = makeTraveller('p', 'N');
    w.sync(s, t, halfOf(s));
    for (let i = 0; i < 12; i++) {
      const f = faces[Math.floor(rnd() * 4)];
      const next = step(s, { ...t, heading: f }, f);
      if (!next) continue;
      t = next;
      w.sync(s, t, halfOf(s));
      w.finish();
      assert.equal(w.room, t.room);
      assert.equal(headingOf(w), t.heading, `trial ${trial} step ${i}`);
    }
  }
});

test('body mode: a step in a room moves one cell, a doorway step crosses and ends on the engine cell and heading', async () => {
  const { move, bodyContext, initialBody } = await import('../src/topology/blocks.js');
  const cases = [
    { portal: { a: 'a', aFace: 'E', b: 'b', bFace: 'W' } },
    { portal: { a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { mirror: true } } },
    { portal: { a: 'a', aFace: 'E', b: 'b', bFace: 'N', transform: { turns: 1 } } },
    { portal: { a: 'a', aFace: 'E', b: 'a', bFace: 'W', transform: { turns: 3 } } },
  ];
  for (const { portal } of cases) {
    const s = build([portal], ['a', 'b']);
    const chapter = { start: 'a', startCell: [5, 3], goal: { kind: 'reach', to: 'b' }, plates: [], blocks: [] };
    const ctx = bodyContext(chapter);
    let st = { ...initialBody(s, chapter) };
    const w = new Walker();
    w.sync(s, st, halfOf(s));
    assert.ok(Math.abs(w.x - (5.5 - 4)) < 1e-9 && Math.abs(w.z - (3.5 - 4)) < 1e-9, 'rests on the cell centre');
    for (const dir of ['E', 'E', 'E']) {
      const r = move(s, st, dir, ctx);
      assert.ok(!r.error, `${JSON.stringify(portal)} ${dir}`);
      st = { ...r.state, lastDir: dir };
      w.sync(s, st, halfOf(s));
      w.finish();
      assert.equal(w.room, st.room);
      const n = Math.round(halfOf(s)(st.room) * 2);
      assert.ok(Math.abs(w.x - (st.cell[0] + 0.5 - n / 2)) < 1e-6 && Math.abs(w.z - (st.cell[1] + 0.5 - n / 2)) < 1e-6, `ends on cell ${st.cell} (got ${w.x}, ${w.z})`);
      assert.equal(headingOf(w), st.heading);
    }
  }
});

test('body mode: turning on the spot and stepping backward keep the walker where the engine says', async () => {
  const { move, bodyContext, initialBody } = await import('../src/topology/blocks.js');
  const s = build([], ['a']);
  const chapter = { start: 'a', startCell: [3, 3], goal: { kind: 'reach', to: 'a' }, plates: [], blocks: [] };
  const ctx = bodyContext(chapter);
  let st = initialBody(s, chapter);
  const w = new Walker();
  w.sync(s, st, halfOf(s));
  st = { ...st, heading: 'E' };
  w.sync(s, st, halfOf(s)); w.finish();
  assert.equal(headingOf(w), 'E');
  const r = move(s, st, 'W', ctx); // backward: the heading is kept
  st = { ...r.state, lastDir: 'W' };
  w.sync(s, st, halfOf(s)); w.finish();
  assert.equal(headingOf(w), 'E');
  assert.ok(Math.abs(w.x - (2.5 - 4)) < 1e-6);
});
