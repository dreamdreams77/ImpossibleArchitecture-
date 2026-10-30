// Procedural challenges.
//
// A generated challenge is a chapter-shaped record, so the campaign engine, renderer, walker, solver
// and diagnosis all treat it like any hand-made one. It is built backwards from a solution: pick the
// rooms, hide a chain of passages (some turned, some mirrored) that links start to goal, then take those
// passages away and state a goal that only they satisfy. Nothing is accepted on trust. Every candidate
// is rebuilt with its hidden passages and judged by the real goal check, must be unsolved without them,
// and, where the search space is small enough, is also searched exhaustively for the true minimum.
//
// Deterministic: the same seed and difficulty always give the same challenge.

import { chapterStructure, goalSatisfied, rulesFor } from './chapters.js';
import { validate, UNRESTRICTED } from '../topology/construction.js';
import { FACES } from '../topology/graph.js';
import { findRoute, replay } from '../topology/traversal.js';

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Foyer', 'Atrium', 'Gallery', 'Cloister', 'Crypt', 'Stair Hall', 'Rotunda', 'Archive', 'Loggia', 'Undercroft'];
const KINDS = ['chamber', 'corridor', 'atrium', 'cellar'];
export const MAX_DIFFICULTY = 5;

function pick(r, list) { return list[Math.floor(r() * list.length)]; }
function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Difficulty 1..5 sets the number of rooms and hidden passages, whether they turn or mirror, whether the
// goal also demands a heading, and how many fixed decoy passages there are.
export function profile(difficulty) {
  const d = Math.max(1, Math.min(MAX_DIFFICULTY, Math.round(difficulty)));
  return { d, rooms: Math.min(6, 3 + Math.ceil(d / 2)), links: d >= 4 ? 3 : d >= 2 ? 2 : 1, turns: d >= 2, mirror: d >= 3, heading: d >= 3, decoys: d >= 2 ? Math.min(3, d - 1) : 0, oneWayDecoy: d >= 3 };
}

function attempt(seed, d, n) {
  const r = rng(seed * 7919 + n * 104729);
  const p = profile(d);
  // Rooms on a jittered 3-unit lattice, shuffled so plan order says nothing about connection order.
  const cells = shuffle(r, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 0], [3, 1]]).slice(0, p.rooms);
  const names = shuffle(r, NAMES);
  const rooms = cells.map((c, i) => ({ id: `r${i}`, x: c[0] * 3, y: c[1] * 3, label: names[i], kind: pick(r, KINDS) }));
  const chain = shuffle(r, rooms.map((x) => x.id)).slice(0, Math.min(p.links + 1, rooms.length));
  const start = chain[0];
  const goalRoom = chain[chain.length - 1];

  const used = new Set();
  const take = (room, avoid = []) => {
    const free = FACES.filter((f) => !used.has(`${room}:${f}`) && !avoid.includes(f));
    if (!free.length) return null;
    const f = pick(r, free);
    used.add(`${room}:${f}`);
    return f;
  };

  // Hidden solution chain.
  const solution = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const aFace = take(chain[i]);
    const bFace = take(chain[i + 1]);
    if (!aFace || !bFace) return null;
    solution.push({ a: chain[i], aFace, b: chain[i + 1], bFace, transform: { turns: p.turns && r() < 0.6 ? 1 + Math.floor(r() * 3) : 0, mirror: p.mirror && r() < 0.4 } });
  }

  // Fixed decoys: passages already built, between rooms off the chain where possible, so the player has
  // something to read and to avoid, never a way to skip the work.
  const fixed = [];
  const off = rooms.map((x) => x.id).filter((id) => !chain.includes(id));
  const pool = off.length >= 2 ? off : rooms.map((x) => x.id);
  for (let i = 0; i < p.decoys; i++) {
    const a = pick(r, pool); const b = pick(r, pool.filter((x) => x !== a));
    if (!b || a === goalRoom || b === goalRoom) continue;
    const aFace = take(a); const bFace = aFace && take(b);
    if (!aFace || !bFace) continue;
    fixed.push({ a: { room: a, face: aFace }, b: { room: b, face: bFace }, oneWay: p.oneWayDecoy && i === 0 ? 'a' : null, transform: { turns: Math.floor(r() * 4), mirror: false } });
  }

  const chapter = {
    id: `generated-${seed}-${d}`, theme: pick(r, ['slate', 'ash', 'oxide']),
    title: `${names[0]} ${['I', 'II', 'III', 'IV', 'V'][p.d - 1]}`,
    blurb: `Generated challenge ${seed}, difficulty ${p.d}.`,
    hint: 'Build the passages that link the start to the goal; the plan distance is only drawing.',
    rooms, fixed, start, generated: { seed, difficulty: p.d },
    ruleset: { ...UNRESTRICTED, maxRooms: rooms.length, maxPortals: fixed.length + p.links },
    goal: { kind: 'reach', to: goalRoom }, optional: [],
  };

  // Without the hidden passages the goal must not already hold.
  if (goalSatisfied(chapterStructure(chapter), chapter)) return null;
  const withSolution = chapterStructure(chapter);
  for (const l of solution) withSolution.addPortal({ ...l, transform: { ...l.transform } });
  if (!validate(withSolution, chapter.ruleset).ok) return null;
  if (!goalSatisfied(withSolution, chapter)) return null;

  // Higher difficulties also ask for a heading on arrival, read from how the solution actually arrives.
  if (p.heading) {
    const route = findRoute(withSolution, start, (t) => t.room === goalRoom, rulesFor(chapter));
    const end = route && replay(withSolution, start, route, rulesFor(chapter));
    if (!end?.ok) return null;
    chapter.goal = { kind: 'arrive', to: goalRoom, heading: end.traveller.heading };
    if (goalSatisfied(chapterStructure(chapter), chapter)) return null;
    if (!goalSatisfied(withSolution, chapter)) return null;
  }
  return { chapter, solution };
}

// Makes a challenge. Returns { chapter, solution, difficulty } where `solution` is a set of passages that
// provably meets the goal under the chapter's own rules. Throws only if no valid candidate is found
// in many tries, which would be a bug in the generator.
export function generateChallenge(seed, difficulty = 1) {
  for (let n = 0; n < 200; n++) {
    const made = attempt(seed, difficulty, n);
    if (made) return { ...made, difficulty: profile(difficulty).d };
  }
  throw new Error(`generateChallenge: no valid challenge for seed ${seed}, difficulty ${difficulty}`);
}

// A plain difficulty estimate from what the solution demands, on a 1 to 10 scale. `minimum` is the size of
// the smallest solution found by exhaustive search when available, otherwise the hidden chain's length.
export function estimateDifficulty(chapter, solution, minimum = solution.length) {
  const free = chapter.rooms.length * 4 - chapter.fixed.length * 2;
  const twists = solution.filter((l) => l.transform.turns || l.transform.mirror).length;
  let score = 1 + (minimum - 1) * 2 + twists * 1.2 + free / 10;
  if (chapter.goal.heading) score += 1.5;
  if (chapter.fixed.some((f) => f.oneWay)) score += 0.8;
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// The generated chapter as a sandbox challenge (editor data) plus its starting structure. Playing it in free
// construction uses the same engine as the campaign, with the editor's goal and rule fields.
export function toChallenge(chapter) {
  const g = chapter.goal;
  return {
    v: 2, start: chapter.start,
    goals: [{ kind: 'reach', to: g.to, heading: g.heading ?? null, maxSteps: null, lit: false }],
    plates: [], cargo: [], pads: [], blocks: [],
    rules: { maxRooms: chapter.ruleset.maxRooms, maxPortals: chapter.ruleset.maxPortals, forbidden: [] },
    objectives: [],
  };
}
