// Route-driven audit of a challenge: an independent way to look for unintended solutions.
//
// tools/solve.mjs enumerates every set of passages up to a size, which is hopeless for the larger challenges
// (the Machine alone has 960 possible passages to choose from). This tool searches the other way round: a
// traveller walks from the start and, whenever they stand at a wall, may build a passage there to any free
// face with any turn and mirror, up to a budget. Every passage in a minimal solution is used by some walk
// that solves the challenge, so this finds every minimal solution up to the budget (and the route length
// limit) without enumerating the passages nobody walks.
//
//   node tools/audit.mjs the-machine            # budgets 1, 2, 3 ...
//   node tools/audit.mjs the-machine 4 14 120   # up to 4 new passages, routes of 14 steps, 120 seconds
//   node tools/audit.mjs the-ring-hall 4 14 900 plain   # only passages with no turn or mirror
//
// Single steps use the engine's own crossing rule (whose algebra is checked separately in
// tests/passage-algebra.test.js); the goal predicate and gate, plate and cargo rules are the engine's too.
// What this adds is an independent search, which can find a solution the planted one did not intend.

import { chapterById, chapterStructure, goalPredicate, rulesFor } from '../src/campaign/chapters.js';
import { validate } from '../src/topology/construction.js';
import { FACES } from '../src/topology/graph.js';
import { makeTraveller, step, startingLit, platesLitBy } from '../src/topology/traversal.js';

// A passage written from either end is the same passage: crossing from the b end applies the inverse, which for
// a plain turn is the opposite turn and for a mirrored one is the same. Written from the smaller end first.
const sig = (p) => {
  let { a, b } = p; let turns = p.transform.turns;
  if (`${b.room}.${b.face}` < `${a.room}.${a.face}`) { [a, b] = [b, a]; if (!p.transform.mirror) turns = (4 - turns) % 4; }
  return `${a.room}.${a.face}-${b.room}.${b.face}${turns ? '^' + turns : ''}${p.transform.mirror ? 'm' : ''}`;
};

// A fixed-memory set of 64-bit state hashes with the most steps still allowed when each was seen. A 64-bit hash
// makes an accidental collision, which could prune a real path, astronomically unlikely (about n^2 / 2^65).
// When the table fills the search reports itself incomplete instead of exhausting memory.
class Seen {
  constructor(bits = 27) { this.mask = (1 << bits) - 1; this.a = new Uint32Array(1 << bits); this.b = new Uint32Array(1 << bits); this.v = new Int8Array(1 << bits).fill(-1); this.n = 0; this.cap = Math.floor((1 << bits) * 0.7); this.full = false; }
  static hash(str) {
    let h1 = 0x811c9dc5; let h2 = 0x9747b28c;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 15; }
    return [h1 >>> 0, h2 >>> 0];
  }
  // Returns true if this state was already seen with at least `remaining` steps to spare; otherwise records it.
  seenWith(str, remaining) {
    const [h1, h2] = Seen.hash(str);
    let i = h1 & this.mask;
    while (this.v[i] >= 0) {
      if (this.a[i] === h1 && this.b[i] === h2) { if (this.v[i] >= remaining) return true; this.v[i] = remaining; return false; }
      i = (i + 1) & this.mask;
    }
    if (this.n >= this.cap) { this.full = true; return false; }
    this.a[i] = h1; this.b[i] = h2; this.v[i] = remaining; this.n++;
    return false;
  }
}

// `plainOnly` restricts new passages to ones with no turn and no mirror: if a challenge teaches turning, nothing
// should be solvable that way.
export function audit(chapter, { budget = 2, maxRoute = 14, seconds = 60, maxSolutions = 500, plainOnly = false } = {}) {
  const s = chapterStructure(chapter);
  const rules = rulesFor(chapter);
  const pred = goalPredicate(chapter);
  const fixedCount = s.portals.size;
  const sealed = new Set((chapter.ruleset.sealedFaces ?? []).map((f) => `${f.room}:${f.face}`));
  const faces = []; for (const r of chapter.rooms) for (const f of FACES) if (!sealed.has(`${r.id}:${f}`)) faces.push({ room: r.id, face: f });
  const start = makeTraveller(chapter.start, 'N', { cargo: rules.cargo, depot: rules.depot, pads: rules.pads });
  start.lit = startingLit(rules.plates, chapter.start);
  const deadline = Date.now() + seconds * 1000;
  const found = new Map();   // portal-set signature -> { size, example route }
  const seen = new Seen();
  let nodes = 0; let truncated = false;

  const portalKey = () => [...s.portals.values()].map(sig).sort().join(',');
  const stateKey = (t) => `${t.room}|${t.heading}|${t.mirrored ? 1 : 0}|${t.lit}|${t.carry}|${t.delivered}|${(t.where ?? []).join(',')}|${portalKey()}`;

  function visit(t, left, built, route) {
    if (Date.now() > deadline) { truncated = true; return; }
    nodes++;
    if (pred(t)) {
      const key = built.slice().sort().join(' ');
      if (!found.has(key) && found.size < maxSolutions) found.set(key, { size: built.length, route: route.join('') });
      return;
    }
    if (route.length >= maxRoute) return;
    const k = stateKey(t);
    const remaining = maxRoute - route.length;
    if (seen.seenWith(k, remaining)) return;
    if (seen.full) { truncated = true; return; }
    for (const face of FACES) {
      const exit = s.exit(t.room, face);
      if (exit) {
        if (exit.blocked) continue;
        const moved = step(s, t, face);
        if (!moved) continue;
        moved.lit = platesLitBy(rules.plates, moved.room, moved.heading, moved.lit, moved.mirrored);
        visit(moved, left, built, [...route, face]);
        continue;
      }
      if (left === 0 || sealed.has(`${t.room}:${face}`)) continue;
      // A wall: build a passage here, to any free face, any turn, mirrored or not.
      for (const target of faces) {
        if (target.room === t.room && target.face === face) continue;
        if (s.portalAt(target.room, target.face)) continue;
        for (let turns = 0; turns < (plainOnly ? 1 : 4); turns++) for (const mirror of (plainOnly ? [false] : [false, true])) {
          const id = s.addPortal({ a: t.room, aFace: face, b: target.room, bFace: target.face, transform: { turns, mirror } });
          if (validate(s, chapter.ruleset).ok) {
            const moved = step(s, t, face);
            if (moved) {
              moved.lit = platesLitBy(rules.plates, moved.room, moved.heading, moved.lit, moved.mirrored);
              visit(moved, left - 1, [...built, sig(s.portals.get(id))], [...route, face]);
            }
          }
          s.removePortal(id);
        }
      }
    }
  }
  visit(start, budget, [], []);
  const bySize = {};
  for (const v of found.values()) bySize[v.size] = (bySize[v.size] ?? 0) + 1;
  return { budget, maxRoute, nodes, complete: !truncated, solutions: found.size, bySize, fixedCount, examples: [...found.entries()].slice(0, 6).map(([k, v]) => `${k}  (route ${v.route})`) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, maxBudget = '3', maxRoute = '14', seconds = '90', mode = ''] = process.argv.slice(2);
  const chapter = chapterById(id);
  if (!chapter) { console.error(`no challenge ${id}`); process.exit(1); }
  for (let b = 1; b <= Number(maxBudget); b++) {
    const t0 = Date.now();
    const r = audit(chapter, { budget: b, maxRoute: Number(maxRoute), seconds: Number(seconds), plainOnly: mode === 'plain' });
    console.log(`${id} budget ${b}: ${r.solutions} solution set(s) by size ${JSON.stringify(r.bySize)}; ${r.nodes} states; ${r.complete ? 'COMPLETE for routes up to ' + r.maxRoute + ' steps' : 'TIME LIMIT, incomplete'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const e of r.examples) console.log('   ' + e);
    if (!r.complete) break;
  }
}

// A lower bound on how many new passages a challenge needs, by counting. A walker must enter every room that
// holds a plate, a crate or the goal. A room the fixed passages already lead to needs nothing, and rooms
// downstream of an unreachable one come with it. Each remaining "source" group of rooms (a strongly connected
// set of fixed passages that nothing else required leads into) needs its own new passage in, because one new
// passage joins an already-reached room to at most one unreached group. So no solution can have fewer new
// passages than there are source groups. If the bound meets the intended size, no shortcut exists.
export function lowerBound(chapter) {
  const s = chapterStructure(chapter);
  const rooms = chapter.rooms.map((r) => r.id);
  const needed = new Set();
  for (const p of chapter.plates ?? []) if (!(p.room === chapter.start && p.heading === 'N')) needed.add(p.room);
  for (const c of chapter.cargo ?? []) needed.add(c.room);
  if (chapter.goal.to) needed.add(chapter.goal.to);
  if (chapter.goal.kind === 'deliver') needed.add(chapter.goal.to);
  // Directed reachability over fixed passages (a one-way passage only leads one way).
  const out = new Map(rooms.map((r) => [r, new Set()]));
  for (const p of s.portals.values()) {
    if (p.oneWay !== 'b') out.get(p.a.room).add(p.b.room);
    if (p.oneWay !== 'a') out.get(p.b.room).add(p.a.room);
  }
  const reach = (from) => { const seen = new Set([from]); const q = [from]; while (q.length) { const r = q.pop(); for (const n of out.get(r)) if (!seen.has(n)) { seen.add(n); q.push(n); } } return seen; };
  const fromStart = reach(chapter.start);
  const unreached = [...needed].filter((r) => !fromStart.has(r));
  // Groups: rooms mutually reachable. A group is a source if no other unreached needed room leads into it.
  const closure = new Map(rooms.map((r) => [r, reach(r)]));
  const group = (r) => rooms.filter((x) => closure.get(r).has(x) && closure.get(x).has(r)).sort()[0];
  const groups = [...new Set(unreached.map(group))];
  const sources = groups.filter((g) => !groups.some((h) => h !== g && closure.get(h).has(g) && !closure.get(g).has(h)));
  return { needed: [...needed], unreached, sources, bound: sources.length };
}
