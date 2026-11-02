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

export function audit(chapter, { budget = 2, maxRoute = 14, seconds = 60, maxSolutions = 500 } = {}) {
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
  const seen = new Map();    // state key -> most steps still allowed when seen
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
    if ((seen.get(k) ?? -1) >= remaining) return;
    seen.set(k, remaining);
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
        for (let turns = 0; turns < 4; turns++) for (const mirror of [false, true]) {
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
  const [id, maxBudget = '3', maxRoute = '14', seconds = '90'] = process.argv.slice(2);
  const chapter = chapterById(id);
  if (!chapter) { console.error(`no challenge ${id}`); process.exit(1); }
  for (let b = 1; b <= Number(maxBudget); b++) {
    const t0 = Date.now();
    const r = audit(chapter, { budget: b, maxRoute: Number(maxRoute), seconds: Number(seconds) });
    console.log(`${id} budget ${b}: ${r.solutions} solution set(s) by size ${JSON.stringify(r.bySize)}; ${r.nodes} states; ${r.complete ? 'COMPLETE for routes up to ' + r.maxRoute + ' steps' : 'TIME LIMIT, incomplete'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const e of r.examples) console.log('   ' + e);
    if (!r.complete) break;
  }
}
