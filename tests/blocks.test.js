import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import {
  gridSize, doorCells, isDoorCell, mapCell, bodyContext, initialBody, move, weightBits, litBits,
  bodyGoalMet, solveBody, replayBody,
} from '../src/topology/blocks.js';

function world(portals = [], rooms = { a: 1, b: 1 }) {
  const s = new Structure();
  Object.entries(rooms).forEach(([id, size], i) => s.addRoom({ id, x: i * 3, y: 0, size }));
  for (const p of portals) s.addPortal(p);
  return s;
}
const chap = (over = {}) => ({ start: 'a', startCell: [3, 3], blocks: [], goal: { kind: 'reach', to: 'b' }, plates: [], ...over });
const go = (s, c, moves) => replayBody(s, c, moves);

test('grids follow room size and doors sit at the middle of each face', () => {
  assert.deepEqual([0.75, 1, 1.5].map((z) => gridSize({ size: z })), [6, 8, 12]);
  assert.deepEqual(doorCells(8, 'N'), [[3, 0], [4, 0]]);
  assert.deepEqual(doorCells(8, 'E'), [[7, 3], [7, 4]]);
  assert.deepEqual(doorCells(6, 'S'), [[2, 5], [3, 5]]);
  assert.ok(isDoorCell(8, 'W', [0, 4]) && !isDoorCell(8, 'W', [0, 5]));
});

test('crossing maps the door cell through the half-turn, and a mirror flips it back', () => {
  // East face, cell row 3 (door-local offset -0.5 along (0,-1) is +0.5 -> flips on a plain passage).
  const plain = mapCell(8, 'E', [7, 3], 8, 'W', false);
  const mirrored = mapCell(8, 'E', [7, 3], 8, 'W', true);
  assert.deepEqual(plain, [0, 3], 'straight through a doorway you keep your side: row 3 arrives on row 3');
  assert.deepEqual(mirrored, [0, 4], 'a mirror reflects across the door line');
  // Differently sized rooms: the middle stays the middle, and sides are kept.
  assert.deepEqual(mapCell(8, 'E', [7, 4], 12, 'W', false), [0, 6]);
  assert.deepEqual(mapCell(12, 'N', [5, 0], 6, 'S', false), [2, 5]);
});

test('walking: free cells, walls, and the edge outside a door', () => {
  const s = world();
  const c = chap();
  assert.deepEqual(go(s, c, ['E']).state.cell, [4, 3]);
  assert.equal(go(s, c, ['N', 'N', 'N']).state.cell[1], 0);
  assert.equal(go(s, c, ['N', 'N', 'N', 'N']).error, 'wall', 'the grid ends at the wall');
  // At the east edge in a door row with no passage: still a wall.
  assert.equal(go(s, c, ['E', 'E', 'E', 'E', 'E']).error, 'wall');
});

test('pushing: a block slides, stops at another block, a solid, and the wall', () => {
  const s = world();
  const c = chap({ startCell: [1, 3], blocks: [{ room: 'a', cell: [2, 3] }, { room: 'a', cell: [4, 3] }], solids: { a: [[3, 5]] } });
  let r = go(s, c, ['E']);
  assert.deepEqual(r.state.blocks[0].cell, [3, 3]);
  assert.equal(r.state.pushes, 1);
  assert.equal(go(s, c, ['E', 'E']).error, 'block', 'two blocks in a row do not move');
  // Solids stop the body and the block alike.
  const c2 = chap({ startCell: [3, 3], blocks: [{ room: 'a', cell: [3, 4] }], solids: { a: [[3, 5]] } });
  assert.equal(go(s, c2, ['S']).error, 'block');
  assert.equal(go(s, chap({ startCell: [2, 5], solids: { a: [[3, 5]] } }), ['E']).error, 'solid');
  // Against the wall.
  const c3 = chap({ startCell: [5, 0], blocks: [{ room: 'a', cell: [6, 0] }] });
  assert.equal(go(s, c3, ['E', 'E']).error, 'block');
});

test('a block pushed through a passage arrives in the next room, where the portal sends it', () => {
  const s = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const c = chap({ startCell: [5, 3], blocks: [{ room: 'a', cell: [6, 3] }] });
  // Push east twice: the block reaches the door cell, then crosses; the body follows to the door cell.
  let r = go(s, c, ['E']);
  assert.deepEqual(r.state.blocks[0], { room: 'a', cell: [7, 3] });
  r = go(s, c, ['E', 'E']);
  assert.deepEqual(r.state.blocks[0], { room: 'b', cell: [0, 3] });
  assert.equal(r.state.room, 'a', 'the pusher stays in the room it pushed from');
  // The pusher follows through the doorway, pushing the block on ahead of it.
  r = go(s, c, ['E', 'E', 'E']);
  assert.equal(r.state.room, 'b');
  assert.deepEqual(r.state.cell, [0, 3]);
  assert.deepEqual(r.state.blocks[0], { room: 'b', cell: [1, 3] });
  assert.equal(r.state.pushes, 3);
});

test('a mirror reflects where the block lands; a quarter turn turns the body, not the block', () => {
  const sm = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { mirror: true } }]);
  const c = chap({ startCell: [5, 3], blocks: [{ room: 'a', cell: [6, 3] }] });
  assert.deepEqual(go(sm, c, ['E', 'E']).state.blocks[0], { room: 'b', cell: [0, 4] });
  const st = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { turns: 1 } }]);
  const r = go(st, chap({ startCell: [7, 3] }), ['E']);
  assert.equal(r.state.room, 'b');
  assert.equal(r.state.heading, 'S', 'the engine heading: opposite of the W face is E, a quarter turn gives S');
  assert.deepEqual(go(st, c, ['E', 'E']).state.blocks[0], { room: 'b', cell: [0, 3] }, 'the block lands the same as through a plain passage');
});

test('passages between different faces and sizes map cells by the geometry', () => {
  const s = world([{ a: 'a', aFace: 'N', b: 'b', bFace: 'E' }], { a: 1, b: 1.5 });
  const c = chap({ startCell: [3, 1], blocks: [{ room: 'a', cell: [3, 0] }] });
  const r = go(s, c, ['N']);
  assert.equal(r.state.blocks[0].room, 'b');
  assert.equal(r.state.blocks[0].cell[0], 11, 'it arrives on the east edge of the larger room');
  assert.ok([5, 6].includes(r.state.blocks[0].cell[1]), 'at the middle of that edge');
});

test('gates open for a weight plate and shut when it is released; one-way passages refuse the wrong side', () => {
  const s = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W', gate: 0 }]);
  const c = chap({ startCell: [6, 3], plates: [{ room: 'a', cell: [3, 6], mode: 'weight' }], blocks: [{ room: 'a', cell: [3, 5] }] });
  const ctx = bodyContext(c);
  assert.equal(go(s, c, ['E', 'E']).error, 'shut', 'the gate is shut with nothing on the plate');
  // Push the block south onto the plate from (3,4): the gate opens while it sits there.
  const c2 = { ...c, startCell: [3, 4] };
  let r = go(s, c2, ['S']);
  assert.equal(weightBits(r.state, ctx), 1);
  assert.equal(litBits(r.state, ctx), 1);
  // Walk round to the door and through: (3,5) east along row 5, up to the door row, out.
  r = go(s, c2, ['S', 'E', 'E', 'E', 'E', 'N', 'E']);
  assert.equal(r.error, undefined, 'the way is open while the block holds the plate');
  assert.equal(r.state.room, 'b');
  // Pushing the block off the plate: round it and shove it east. The gate is shut again behind.
  const off = go(s, c2, ['S', 'W', 'S', 'E']);
  assert.equal(weightBits(off.state, ctx), 0);
  const oneway = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W', oneWay: 'b' }]);
  assert.equal(go(oneway, chap({ startCell: [7, 3] }), ['E']).error, 'oneway');
  assert.equal(go(oneway, chap({ start: 'b', startCell: [0, 3] }), ['W']).state.room, 'a', 'the permitted direction works');
});

test('blocks cannot be pushed into an occupied arrival cell, and the body cannot arrive on one', () => {
  const s = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const c = chap({ startCell: [5, 3], blocks: [{ room: 'a', cell: [6, 3] }, { room: 'b', cell: [0, 3] }] });
  assert.equal(go(s, c, ['E', 'E']).error, 'block', 'the landing cell is taken');
  const c2 = chap({ startCell: [7, 3], blocks: [{ room: 'b', cell: [0, 3] }, { room: 'b', cell: [1, 3] }] });
  assert.equal(go(s, c2, ['E']).error, 'full', 'the block on the arrival cell has nowhere to go');
  const c3 = chap({ startCell: [7, 3], blocks: [{ room: 'b', cell: [0, 3] }] });
  assert.deepEqual(go(s, c3, ['E']).state.blocks[0].cell, [1, 3], 'a block on the arrival cell is pushed on');
});

test('goals: reach, arrive and place are judged on the state', () => {
  const s = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const reach = chap({ startCell: [7, 3] });
  assert.ok(bodyGoalMet(go(s, reach, ['E']).state, reach));
  assert.equal(bodyGoalMet(initialBody(s, reach), reach), false);
  const place = chap({ blocks: [{ room: 'a', cell: [2, 3] }], startCell: [1, 3], goal: { kind: 'place', targets: [{ room: 'a', cell: [4, 3], block: 0 }] } });
  assert.equal(bodyGoalMet(initialBody(s, place), place), false);
  assert.ok(bodyGoalMet(go(s, place, ['E', 'E']).state, place));
});

test('the solver finds the shortest solution, reports none when walled in, and caps its search', () => {
  const s = world([{ a: 'a', aFace: 'E', b: 'b', bFace: 'W' }]);
  const c = chap({ startCell: [4, 3] });
  const sol = solveBody(s, c);
  assert.deepEqual(sol.moves, ['E', 'E', 'E', 'E'], 'three cells to the door cell, one to cross');
  const walled = world([]);
  assert.equal(solveBody(walled, c), null);
  assert.ok(solveBody(s, { ...c, startCell: [0, 0] }, { maxStates: 4 }).exceeded);
  // A push puzzle: the block must go through the door to the target in the next room.
  const p = chap({
    startCell: [4, 3], blocks: [{ room: 'a', cell: [5, 3] }],
    goal: { kind: 'place', targets: [{ room: 'b', cell: [2, 4], block: 0 }] },
  });
  const ps = solveBody(s, p);
  assert.ok(ps && ps.moves.length >= 6, `pushes the block across and on to the target (${ps?.moves.length})`);
  assert.ok(bodyGoalMet(replayBody(s, p, ps.moves).state, p), 'replaying the solution meets the goal');
});

test('states are values: a failed or successful move never changes its input', () => {
  const s = world();
  const c = chap({ startCell: [1, 3], blocks: [{ room: 'a', cell: [2, 3] }] });
  const st = initialBody(s, c);
  const snap = JSON.stringify(st);
  move(s, st, 'E', bodyContext(c));
  move(s, st, 'N', bodyContext(c));
  assert.equal(JSON.stringify(st), snap);
});
