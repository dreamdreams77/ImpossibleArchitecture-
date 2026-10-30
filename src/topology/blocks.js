// Physical play: a body that walks cell by cell, and blocks it can push.
//
// Every room is a unit grid (6, 8 or 12 cells a side for the three room sizes). The player
// stands on a cell and moves one cell at a time in a compass direction. Walking into a block
// pushes it, if the cell beyond is free. A door is the middle of a room's face: a body or a
// block that leaves the grid through a door cell crosses the passage, and arrives on the
// destination room's grid at the cell that the portal maps it to. That mapping is the one
// the renderer draws: the door-local offset flips with the half-turn through the portal and
// flips again if the passage mirrors. A body also takes the engine's entry heading, so
// quarter turns and mirrors turn the walker exactly as they do in the plain traversal.
//
// Gates, one-way passages and plates keep their meaning: a passage is crossed by a body or a
// block only if `Structure.exit` allows it with the plates currently lit, and a weight plate
// is lit while a block (or the body) stands on it. Nothing here knows about drawing.
//
// The whole state is a plain value, so a breadth-first search can answer "is there any way
// to solve this construction" and a test can replay any sequence of moves.

import { platesLitBy, startingLit } from './traversal.js';

export const DIRS = Object.freeze(['N', 'E', 'S', 'W']);
const VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
// The door-local x axis of a face, in plan (x, z): the same axis frames.js gives a doorway.
const XAXIS = { N: [-1, 0], E: [0, -1], S: [1, 0], W: [0, 1] };

export function gridSize(room) {
  const size = room?.size ?? 1;
  return Math.round(8 * size);
}

const key = (room, c) => `${room}:${c[0]},${c[1]}`;

// The two cells at the middle of a face, which together make the doorway.
export function doorCells(n, face) {
  const a = n / 2 - 1; const b = n / 2;
  switch (face) {
    case 'N': return [[a, 0], [b, 0]];
    case 'S': return [[a, n - 1], [b, n - 1]];
    case 'E': return [[n - 1, a], [n - 1, b]];
    default: return [[0, a], [0, b]];
  }
}

export function isDoorCell(n, face, c) {
  return doorCells(n, face).some((d) => d[0] === c[0] && d[1] === c[1]);
}

// A cell's centre relative to the room centre, in cell units.
const centre = (n, c) => [c[0] + 0.5 - n / 2, c[1] + 0.5 - n / 2];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// Where a cell on `face` of a room of `n` cells arrives in a room of `m` cells whose
// face `toFace` the passage joins.
export function mapCell(n, face, c, m, toFace, mirror) {
  const u = dot(centre(n, c), XAXIS[face]);
  const v = mirror ? u : -u;
  const out = VEC[toFace];
  const x = out[0] * (m / 2 - 0.5) + XAXIS[toFace][0] * v;
  const z = out[1] * (m / 2 - 0.5) + XAXIS[toFace][1] * v;
  return [Math.round(x + m / 2 - 0.5), Math.round(z + m / 2 - 0.5)];
}

// ---- context: what the chapter fixes about the grid --------------------------------------

// `solids` are cells nothing may enter: { roomId: [[cx, cz], ...] }. Weight plates are the
// chapter's plates with mode 'weight' and a cell; they are lit while a block stands on them.
export function bodyContext(chapter) {
  const solids = new Map();
  for (const [room, cells] of Object.entries(chapter.solids ?? {})) solids.set(room, new Set(cells.map((c) => `${c[0]},${c[1]}`)));
  const plates = chapter.plates ?? [];
  const weights = plates.map((p, index) => ({ ...p, index })).filter((p) => p.mode === 'weight');
  return { plates, solids, weights, goal: chapter.goal };
}

export function initialBody(structure, chapter) {
  // The player may have deleted the start room or one holding a block: fall back to what exists.
  const start = structure.rooms.has(chapter.start) ? chapter.start : [...structure.rooms.keys()][0];
  const room = structure.rooms.get(start);
  const n = gridSize(room);
  const cell0 = start === chapter.start && chapter.startCell ? chapter.startCell : [Math.floor(n / 2) - 1, Math.floor(n / 2) - 1];
  const cell = [Math.min(n - 1, Math.max(0, cell0[0])), Math.min(n - 1, Math.max(0, cell0[1]))];
  const plates = chapter.plates ?? [];
  return {
    room: start, cell, heading: chapter.startHeading ?? 'N', steps: 0, pushes: 0,
    lit: startingLit(plates.filter((p) => p.mode !== 'weight'), start),
    // A block whose room has been deleted stays in the list (indices are goal identities) but can never be reached.
    blocks: (chapter.blocks ?? []).map((b) => ({ room: b.room, cell: [...b.cell] })),
    trail: [start],
  };
}

// Bits of the plates held down by weight right now.
export function weightBits(state, ctx) {
  let bits = 0;
  for (const w of ctx.weights) {
    if (state.blocks.some((b) => b.room === w.room && b.cell[0] === w.cell[0] && b.cell[1] === w.cell[1])) bits |= 1 << w.index;
  }
  return bits;
}

export const litBits = (state, ctx) => state.lit | weightBits(state, ctx);

function solidAt(ctx, room, c) {
  return ctx.solids.get(room)?.has(`${c[0]},${c[1]}`) ?? false;
}
function blockAt(state, room, c, except = -1) {
  return state.blocks.findIndex((b, i) => i !== except && b.room === room && b.cell[0] === c[0] && b.cell[1] === c[1]);
}

// Whether a passage lets something through right now. Returns { exit } or { error }.
function passage(structure, state, ctx, room, face) {
  const exit = structure.exit(room, face);
  if (!exit) return { error: 'wall' };
  if (exit.blocked) return { error: 'oneway' };
  if (exit.gate !== null && !(litBits(state, ctx) & (1 << exit.gate))) return { error: 'shut' };
  if (exit.opensAfter != null) return { error: 'shut' }; // delivery gates belong to the carried-crate rules
  return { exit };
}

// Tries one step in compass direction `dir`. Returns { state, push?, crossed? } or { error }.
// Errors: 'wall', 'solid', 'block' (a block that cannot move), 'shut', 'oneway', 'full'
// (the arrival cell is occupied). The input state is never changed.
export function move(structure, state, dir, ctx) {
  const room = structure.rooms.get(state.room);
  const n = gridSize(room);
  const d = VEC[dir];
  const target = [state.cell[0] + d[0], state.cell[1] + d[1]];
  const inside = target[0] >= 0 && target[0] < n && target[1] >= 0 && target[1] < n;
  // Blocks are shared with the input until a push needs its own copy: states are values, never mutated.
  const own = () => { out.blocks = state.blocks.map((b) => ({ room: b.room, cell: [...b.cell] })); };
  const out = { ...state, steps: state.steps + 1, trail: state.trail };

  // Leaving the room by a door.
  if (!inside) {
    if (!isDoorCell(n, dir, state.cell)) return { error: 'wall' };
    const p = passage(structure, state, ctx, state.room, dir);
    if (p.error) return p;
    const to = structure.rooms.get(p.exit.room);
    const m = gridSize(to);
    const arrive = mapCell(n, dir, state.cell, m, p.exit.face, !!p.exit.transform.mirror);
    if (solidAt(ctx, p.exit.room, arrive)) return { error: 'solid' };
    // A block waiting on the arrival cell is pushed on, inward, as the body comes through.
    const waiting = blockAt(state, p.exit.room, arrive);
    let pushed = null;
    if (waiting >= 0) {
      const inward = VEC[OPPOSITE[p.exit.face]];
      const ahead = [arrive[0] + inward[0], arrive[1] + inward[1]];
      if (ahead[0] < 0 || ahead[0] >= m || ahead[1] < 0 || ahead[1] >= m || solidAt(ctx, p.exit.room, ahead) || blockAt(state, p.exit.room, ahead, waiting) >= 0) return { error: 'full' };
      own();
      out.blocks[waiting].cell = ahead;
      out.pushes = state.pushes + 1;
      pushed = { index: waiting, from: { room: p.exit.room, cell: arrive }, to: { room: p.exit.room, cell: ahead } };
    }
    out.room = p.exit.room;
    out.cell = arrive;
    out.heading = p.exit.entryHeading;
    out.trail = [...state.trail, p.exit.room];
    // Arrival can strike or flip an ordinary plate; a weight plate has no heading and ignores arrivals.
    out.lit = platesLitBy(ctx.plates.map((q) => (q.mode === 'weight' ? { ...q, heading: null } : q)), p.exit.room, p.exit.entryHeading, state.lit);
    return { state: out, push: pushed ?? undefined, crossed: { from: state.room, to: p.exit.room, face: dir, toFace: p.exit.face } };
  }

  if (solidAt(ctx, state.room, target)) return { error: 'solid' };
  const bi = blockAt(state, state.room, target);
  if (bi < 0) { out.cell = target; return { state: out }; }

  // Pushing a block.
  const beyond = [target[0] + d[0], target[1] + d[1]];
  const beyondInside = beyond[0] >= 0 && beyond[0] < n && beyond[1] >= 0 && beyond[1] < n;
  if (beyondInside) {
    if (solidAt(ctx, state.room, beyond) || blockAt(state, state.room, beyond, bi) >= 0) return { error: 'block' };
    own();
    out.blocks[bi].cell = beyond;
    out.cell = target;
    out.pushes = state.pushes + 1;
    return { state: out, push: { index: bi, from: { room: state.room, cell: target }, to: { room: state.room, cell: beyond } } };
  }
  // The block is on the edge: push it through the door if it is on a door cell.
  if (!isDoorCell(n, dir, target)) return { error: 'block' };
  const p = passage(structure, state, ctx, state.room, dir);
  if (p.error) return { error: p.error === 'wall' ? 'block' : p.error };
  const to = structure.rooms.get(p.exit.room);
  const m = gridSize(to);
  const landing = mapCell(n, dir, target, m, p.exit.face, !!p.exit.transform.mirror);
  if (solidAt(ctx, p.exit.room, landing) || blockAt(state, p.exit.room, landing, bi) >= 0) return { error: 'block' };
  own();
  out.blocks[bi] = { room: p.exit.room, cell: landing };
  out.cell = target;
  out.pushes = state.pushes + 1;
  return { state: out, push: { index: bi, from: { room: state.room, cell: target }, to: { room: p.exit.room, cell: landing }, crossed: { face: dir, toFace: p.exit.face } } };
}

// ---- goals ------------------------------------------------------------------------------

// Whether a state meets the chapter's goal. Goals:
//   reach  the body stands in `to` (optionally facing `heading`)
//   place  every target holds a block (a target naming a `block` index needs that block)
// With `requireLit` every plate must be lit too, weight plates included.
export function bodyGoalMet(state, chapter, ctx = bodyContext(chapter)) {
  const g = chapter.goal;
  if (g.requireLit) {
    const full = ctx.plates.length ? (1 << ctx.plates.length) - 1 : 0;
    if ((litBits(state, ctx) & full) !== full) return false;
  }
  if (g.kind === 'place') {
    const on = (t, b) => !!b && b.room === t.room && b.cell[0] === t.cell[0] && b.cell[1] === t.cell[1];
    const okTargets = (g.targets ?? []).every((t) => (t.block != null ? on(t, state.blocks[t.block]) : state.blocks.some((b) => on(t, b))));
    return okTargets && (!g.to || state.room === g.to);
  }
  if (g.kind === 'reach' || g.kind === 'arrive') return state.room === g.to && (!g.heading || state.heading === g.heading);
  return false;
}

// ---- search -----------------------------------------------------------------------------

function stateKey(state, ctx) {
  const heading = ctx.plates.length ? state.heading : '';
  return `${state.room}:${state.cell}:${heading}:${state.lit}|${state.blocks.map((b) => `${b.room}:${b.cell}`).join(';')}`;
}

// Breadth-first search for the shortest sequence of compass moves that meets the goal.
// Returns { moves, state, explored } or null; `exceeded` is set if the search hit its cap.
// For puzzles with several blocks plain search explodes, so when it runs out of room the
// search is repeated over pushes (see solveByPushes), which gives a solution with the
// fewest pushes rather than the fewest steps.
export function solveBody(structure, chapter, { maxStates = 400000, from = null } = {}) {
  const plain = solvePlain(structure, chapter, { maxStates: Math.min(maxStates, (chapter.blocks ?? []).length > 1 ? 8000 : 60000), from });
  if (!plain?.exceeded) return plain;
  if ((chapter.blocks ?? []).length === 0) return plain;
  return solveByPushes(structure, chapter, { maxStates, from });
}

function solvePlain(structure, chapter, { maxStates, from }) {
  const ctx = bodyContext(chapter);
  const start = from ?? initialBody(structure, chapter);
  if (!structure.rooms.has(start.room)) return null;
  const seen = new Map([[stateKey(start, ctx), null]]);
  let frontier = [{ state: start, moves: [] }];
  let explored = 0;
  if (bodyGoalMet(start, chapter, ctx)) return { moves: [], state: start, explored: 1 };
  while (frontier.length) {
    const next = [];
    for (const { state, moves } of frontier) {
      for (const dir of DIRS) {
        const r = move(structure, state, dir, ctx);
        if (r.error) continue;
        const k = stateKey(r.state, ctx);
        if (seen.has(k)) continue;
        seen.set(k, true);
        explored++;
        const m = [...moves, dir];
        if (bodyGoalMet(r.state, chapter, ctx)) return { moves: m, state: r.state, explored };
        if (seen.size > maxStates) return { exceeded: true, explored };
        next.push({ state: r.state, moves: m });
      }
    }
    frontier = next;
  }
  return null;
}

// The cells the body can walk to without pushing anything, as a map from a node key to
// { state, from, dir } (a tree rooted at `start`).
function walkRegion(structure, start, ctx) {
  const nodes = new Map([[stateKey(start, ctx), { state: start, from: null, dir: null }]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const st = queue[i];
    const sk = stateKey(st, ctx);
    for (const dir of DIRS) {
      const r = move(structure, st, dir, ctx);
      if (r.error || r.push) continue;
      const k = stateKey(r.state, ctx);
      if (nodes.has(k)) continue;
      nodes.set(k, { state: r.state, from: sk, dir });
      queue.push(r.state);
    }
  }
  return nodes;
}

function pathTo(nodes, key) {
  const dirs = [];
  for (let k = key; nodes.get(k).from !== null; k = nodes.get(k).from) dirs.push(nodes.get(k).dir);
  return dirs.reverse();
}

const blocksKey = (st) => st.blocks.map((b) => `${b.room}:${b.cell}`).join(';');

// Search over pushes. A node is the blocks' positions plus the region the body can reach without
// pushing; from each cell of the region the body may push a block, which makes a new node.
export function solveByPushes(structure, chapter, { maxStates = 200000, from = null } = {}) {
  const ctx = bodyContext(chapter);
  const start = from ?? initialBody(structure, chapter);
  if (!structure.rooms.has(start.room)) return null;
  // Walkable regions depend only on where the blocks are, so each is flooded once and labelled.
  const cache = new Map();
  const regionOf = (st) => {
    const bk = blocksKey(st);
    let c = cache.get(bk);
    if (!c) { c = { label: new Map(), regions: new Map() }; cache.set(bk, c); }
    const k = stateKey(st, ctx);
    if (c.label.has(k)) { const id = c.label.get(k); return { id, nodes: c.regions.get(id) }; }
    const nodes = walkRegion(structure, st, ctx);
    let id = null;
    for (const nk of nodes.keys()) if (id === null || nk < id) id = nk;
    for (const nk of nodes.keys()) c.label.set(nk, id);
    c.regions.set(id, nodes);
    return { id, nodes };
  };
  const firstRegion = regionOf(start);
  const first = firstRegion.nodes;
  const goalIn = (nodes) => { for (const [k, n] of nodes) if (bodyGoalMet(n.state, chapter, ctx)) return k; return null; };
  const records = [{ entry: start, parent: -1, via: null, dir: null }];
  const seen = new Set([`${blocksKey(start)}|${firstRegion.id}`]);
  let frontier = [{ index: 0, nodes: first }];
  let explored = 1;
  const expand = (index, nodes, goalKey) => {
    // Rebuild the moves: for each ancestor, walk to its pushing cell and push; then walk to the goal.
    const chain = [];
    for (let i = index; records[i].parent >= 0; i = records[i].parent) chain.push(i);
    chain.reverse();
    const moves = [];
    for (const i of chain) {
      const rec = records[i];
      const parentNodes = walkRegion(structure, records[rec.parent].entry, ctx);
      moves.push(...pathTo(parentNodes, rec.via), rec.dir);
    }
    moves.push(...pathTo(nodes, goalKey));
    return moves;
  };
  const g0 = goalIn(first);
  if (g0 !== null) return { moves: expand(0, first, g0), state: first.get(g0).state, explored };
  while (frontier.length) {
    const next = [];
    for (const { index, nodes } of frontier) {
      for (const [k, n] of nodes) {
        for (const dir of DIRS) {
          const r = move(structure, n.state, dir, ctx);
          if (!r.push) continue;
          const reg = regionOf(r.state);
          const region = reg.nodes;
          const id = `${blocksKey(r.state)}|${reg.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          explored++;
          records.push({ entry: r.state, parent: index, via: k, dir });
          const ri = records.length - 1;
          const g = goalIn(region);
          if (g !== null) return { moves: expand(ri, region, g), state: region.get(g).state, explored };
          if (records.length > maxStates) return { exceeded: true, explored };
          next.push({ index: ri, nodes: region });
        }
      }
    }
    frontier = next;
  }
  return null;
}

// Replays moves from the start; returns the final state, or the first error.
export function replayBody(structure, chapter, moves) {
  const ctx = bodyContext(chapter);
  let state = initialBody(structure, chapter);
  for (const dir of moves) {
    const r = move(structure, state, dir, ctx);
    if (r.error) return { error: r.error, state };
    state = r.state;
  }
  return { state };
}
