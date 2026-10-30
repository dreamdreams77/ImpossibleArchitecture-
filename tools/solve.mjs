// Exhaustive solver for campaign challenges. Enumerates every set of player passages the
// challenge's rules allow (face pairs, quarter turns, mirror) up to a size, and reports
// the smallest build that solves it and how many different builds solve it at that size.
//
//   node tools/solve.mjs               # every challenge whose search space fits the budget
//   node tools/solve.mjs the-seam      # one challenge
//
// Passage direction (one-way) is not searched: only turns and mirror are.

import { CHAPTERS, chapterById, chapterStructure, goalSatisfied } from '../src/campaign/chapters.js';
import { validate } from '../src/topology/construction.js';
import { FACES } from '../src/topology/graph.js';

export function candidates(chapter) {
  const s0 = chapterStructure(chapter);
  const used = new Set();
  for (const p of s0.portals.values()) { used.add(`${p.a.room}:${p.a.face}`); used.add(`${p.b.room}:${p.b.face}`); }
  const faces = [];
  for (const r of chapter.rooms) for (const f of FACES) if (!used.has(`${r.id}:${f}`)) faces.push({ room: r.id, face: f });
  const out = [];
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    for (let turns = 0; turns < 4; turns++) for (const mirror of [false, true]) {
      out.push({ a: faces[i].room, aFace: faces[i].face, b: faces[j].room, bFace: faces[j].face, transform: { turns, mirror } });
    }
  }
  return out;
}

function build(chapter, links) {
  const s = chapterStructure(chapter);
  for (const l of links) s.addPortal({ ...l, transform: { ...l.transform } });
  return s;
}

const binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };

// Returns { size, count, example } for the smallest solving size, or null if none within `maxSize`.
export function solve(chapter, { maxSize = 4, budget = 1.5e6 } = {}) {
  // Physical challenges are searched over moves and pushes (src/topology/blocks.js), not by enumerating builds here.
  if (chapter.physical) return { skipped: true, size: 0, space: Infinity, physical: true };
  const cands = candidates(chapter);
  const fixedCount = (chapter.fixed ?? []).length;
  const allowed = Math.min(maxSize, (chapter.ruleset.maxPortals === Infinity ? maxSize : chapter.ruleset.maxPortals) - fixedCount);
  for (let size = 0; size <= allowed; size++) {
    if (binom(cands.length, size) > budget) return { skipped: true, size, space: binom(cands.length, size) };
    let count = 0;
    let example = null;
    const pick = (start, links) => {
      if (links.length === size) {
        const s = build(chapter, links);
        if (!validate(s, chapter.ruleset).ok) return;
        if (goalSatisfied(s, chapter)) { count++; example ??= links.map((l) => `${l.a}.${l.aFace}-${l.b}.${l.bFace}${l.transform.turns ? `^${l.transform.turns}` : ''}${l.transform.mirror ? 'm' : ''}`); }
        return;
      }
      for (let i = start; i < cands.length; i++) {
        const c = cands[i];
        // faces may carry only one passage
        if (links.some((l) => (l.a === c.a && l.aFace === c.aFace) || (l.b === c.a && l.bFace === c.aFace) || (l.a === c.b && l.aFace === c.bFace) || (l.b === c.b && l.bFace === c.bFace))) continue;
        links.push(c);
        pick(i + 1, links);
        links.pop();
      }
    };
    pick(0, []);
    if (count > 0) return { size, count, example };
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2];
  const list = only ? [chapterById(only)] : CHAPTERS;
  for (const c of list) {
    const r = solve(c);
    const label = r === null ? 'NO SOLUTION within the size searched' : r.skipped ? `skipped (size ${r.size} has ${Math.round(r.space)} builds)` : `${r.size} passage${r.size === 1 ? '' : 's'}, ${r.count} solution${r.count === 1 ? '' : 's'}  e.g. ${r.example.join(' ')}`;
    console.log(`${c.id.padEnd(22)} ${label}`);
  }
}
