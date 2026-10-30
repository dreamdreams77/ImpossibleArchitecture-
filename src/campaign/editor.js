// The challenge editor's data and its conversion to a chapter.
//
// A sandbox challenge is plain data: a start room, a list of goals, plates (latch, toggle or weight),
// crates, pads, blocks, rules, and optional objectives. `toChapter` turns it into exactly the record
// a campaign chapter is, so goals are judged, routes found, objects simulated, rooms drawn and the
// walk played by the same code that runs the 35 campaign challenges. Nothing here is a second engine.
//
// Goals are combined with "all": each must hold. For ordinary challenges each goal is judged on its
// own route; for physical ones (blocks or weight plates) they must hold in one final state.

import { UNRESTRICTED } from '../topology/construction.js';
import { findRoute } from '../topology/traversal.js';
import { findCycles } from '../topology/analysis.js';
import { goalSatisfied, goalPredicate, rulesFor } from './chapters.js';

export const EDITOR_VERSION = 2;
export const HEADINGS = ['N', 'E', 'S', 'W'];
export const GOAL_KINDS = Object.freeze(['reach', 'deliver', 'place']);
export const PLATE_MODES = Object.freeze(['latch', 'toggle', 'weight']);

export function emptyChallenge(start = null) {
  return { v: EDITOR_VERSION, start, goals: [], plates: [], cargo: [], pads: [], blocks: [], rules: { maxRooms: null, maxPortals: null, forbidden: [] }, objectives: [] };
}

const isCell = (c) => Array.isArray(c) && c.length === 2 && c.every((v) => Number.isInteger(v) && v >= 0 && v < 64);
const heading = (h) => (HEADINGS.includes(h) ? h : null);
const posInt = (n) => (Number.isInteger(n) && n > 0 ? n : null);

// Accepts the original single-goal shape ({ start, to, heading, maxSteps }) and the current one;
// drops anything malformed. Returns null when there is nothing usable (no start room).
export function normalizeChallenge(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.start !== 'string') return null;
  const out = emptyChallenge(raw.start);
  if (raw.v === EDITOR_VERSION) {
    for (const g of raw.goals ?? []) {
      if (g?.kind === 'reach' && typeof g.to === 'string') out.goals.push({ kind: 'reach', to: g.to, heading: heading(g.heading), maxSteps: posInt(g.maxSteps), lit: !!g.lit });
      else if (g?.kind === 'deliver' && typeof g.to === 'string') out.goals.push({ kind: 'deliver', to: g.to, heading: heading(g.heading) });
      else if (g?.kind === 'place' && Array.isArray(g.targets)) {
        const targets = g.targets.filter((t) => typeof t?.room === 'string' && isCell(t.cell)).map((t) => ({ room: t.room, cell: [...t.cell], block: Number.isInteger(t.block) && t.block >= 0 ? t.block : null }));
        if (targets.length) out.goals.push({ kind: 'place', targets });
      }
    }
    for (const p of raw.plates ?? []) {
      if (typeof p?.room !== 'string') continue;
      if (p.mode === 'weight' && isCell(p.cell)) out.plates.push({ room: p.room, mode: 'weight', cell: [...p.cell] });
      else if (heading(p.heading)) out.plates.push({ room: p.room, mode: p.mode === 'toggle' ? 'toggle' : 'latch', heading: p.heading, startsLit: !!p.startsLit });
    }
    for (const c of raw.cargo ?? []) if (typeof c?.room === 'string') out.cargo.push({ room: c.room });
    out.pads = [...new Set((raw.pads ?? []).filter((r) => typeof r === 'string'))];
    for (const b of raw.blocks ?? []) if (typeof b?.room === 'string' && isCell(b.cell)) out.blocks.push({ room: b.room, cell: [...b.cell] });
    out.rules = {
      maxRooms: posInt(raw.rules?.maxRooms),
      maxPortals: posInt(raw.rules?.maxPortals),
      forbidden: (raw.rules?.forbidden ?? []).filter((f) => typeof f?.a === 'string' && typeof f?.b === 'string' && f.a !== f.b).map((f) => ({ a: f.a, b: f.b })),
    };
    for (const o of raw.objectives ?? []) if (OBJECTIVES[o?.kind]) out.objectives.push({ kind: o.kind, value: posInt(o.value) });
    return out;
  }
  // The first version: one goal.
  if (typeof raw.to === 'string') out.goals.push({ kind: 'reach', to: raw.to, heading: heading(raw.heading), maxSteps: posInt(raw.maxSteps), lit: false });
  return out;
}

// ---- optional objectives ----------------------------------------------------------------------

const playerPortals = (s) => [...s.portals.values()].filter((p) => !p.fixed);

export const OBJECTIVES = Object.freeze({
  fewPassages: { needsValue: true, title: (v) => `At most ${v} passage${v === 1 ? '' : 's'}`, text: 'Solved with a lean building.', check: (s, ch, v) => playerPortals(s).length <= v },
  noMirror: { title: () => 'No mirrors', text: 'Solved without reflecting space.', check: (s) => playerPortals(s).every((p) => !p.transform.mirror) },
  noTurns: { title: () => 'No turns', text: 'Solved without turning anyone.', check: (s) => playerPortals(s).every((p) => !(p.transform.turns ?? 0)) },
  usesMirror: { title: () => 'Uses a mirror', text: 'A mirror does some of the work.', check: (s) => playerPortals(s).some((p) => p.transform.mirror) },
  usesTurn: { title: () => 'Uses a turn', text: 'A quarter turn does some of the work.', check: (s) => playerPortals(s).some((p) => (p.transform.turns ?? 0) !== 0) },
  usesOneWay: { title: () => 'Uses a one-way passage', text: 'Something goes one way only.', check: (s) => playerPortals(s).some((p) => p.oneWay != null) },
  needsLoop: { title: () => 'Contains a loop', text: 'The building folds back on itself.', check: (s) => findCycles(s).length > 0 },
  stepsAtMost: {
    needsValue: true,
    title: (v) => `Within ${v} step${v === 1 ? '' : 's'}`,
    text: 'The way to the goal is short.',
    check: (s, ch, v) => {
      if (ch.physical) return true; // judged on moves when played, not here
      const first = ch.goal.kind === 'all' ? { ...ch, goal: ch.goal.goals[0] } : ch;
      const pred = goalPredicate(first);
      if (!pred) return true;
      const route = findRoute(s, ch.start, pred, rulesFor(first));
      return !!route && route.length <= v;
    },
  },
});

// ---- problems the editor reports before a challenge is tested --------------------------------------

export function problems(challenge, structure) {
  const out = [];
  if (!challenge) return ['No challenge yet.'];
  const has = (r) => structure.rooms.has(r);
  if (!has(challenge.start)) out.push('The start room no longer exists.');
  if (!challenge.goals.length) out.push('Add at least one goal.');
  const physical = challenge.blocks.length > 0 || challenge.plates.some((p) => p.mode === 'weight');
  for (const [i, g] of challenge.goals.entries()) {
    if (g.kind === 'place') { if (!challenge.blocks.length) out.push(`Goal ${i + 1} places blocks, but there are no blocks.`); for (const t of g.targets) if (!has(t.room)) out.push(`Goal ${i + 1} names a room that is gone.`); }
    else if (!has(g.to)) out.push(`Goal ${i + 1} names a room that is gone.`);
    if (g.kind === 'deliver' && !challenge.cargo.length) out.push(`Goal ${i + 1} delivers crates, but there are none.`);
    if (g.kind === 'deliver' && physical) out.push(`Goal ${i + 1}: crates are carried, blocks are pushed. A challenge with blocks cannot also deliver crates.`);
  }
  for (const p of challenge.plates) if (!has(p.room)) out.push('A plate sits in a room that is gone.');
  for (const c of challenge.cargo) if (!has(c.room)) out.push('A crate sits in a room that is gone.');
  for (const b of challenge.blocks) if (!has(b.room)) out.push('A block sits in a room that is gone.');
  for (const [i, p] of structure.portals) {
    if (p.gate != null && p.gate >= challenge.plates.length) out.push(`Passage ${i} waits for plate ${p.gate + 1}, which does not exist.`);
    if (p.opensAfter != null && p.opensAfter >= challenge.cargo.length) out.push(`Passage ${i} waits for crate ${p.opensAfter + 1}, which does not exist.`);
  }
  return out;
}

// ---- conversion ---------------------------------------------------------------------------------------

let counter = 0;
const memo = new WeakMap();

// The challenge as a chapter. The result is remembered per challenge value, with an id of its own, so
// per-chapter caches (the physical solver's) never mix one version of a challenge with another.
export function toChapter(challenge, themeName = 'slate') {
  if (!challenge) return null;
  if (memo.has(challenge)) return memo.get(challenge);
  const physical = challenge.blocks.length > 0 || challenge.plates.some((p) => p.mode === 'weight');
  const plates = challenge.plates.map((p) => (p.mode === 'weight' ? { room: p.room, mode: 'weight', cell: p.cell } : { room: p.room, heading: p.heading, ...(p.mode === 'toggle' ? { mode: 'toggle', startsLit: !!p.startsLit } : {}) }));
  const goals = [];
  for (const g of challenge.goals) {
    if (g.kind === 'place') goals.push({ kind: 'place', targets: g.targets.map((t) => ({ room: t.room, cell: t.cell, ...(t.block != null ? { block: t.block } : {}) })) });
    else if (g.kind === 'deliver') { if (!physical) goals.push({ kind: 'deliver', to: g.to, ...(g.heading ? { heading: g.heading } : {}) }); }
    else {
      const needsLit = g.lit && plates.length;
      if (physical) goals.push({ kind: g.heading ? 'arrive' : 'reach', to: g.to, ...(g.heading ? { heading: g.heading } : {}), ...(needsLit ? { requireLit: true } : {}) });
      else if (needsLit) goals.push({ kind: 'machine', to: g.to, ...(g.heading ? { heading: g.heading } : {}) });
      else if (g.heading) goals.push({ kind: 'arrive', to: g.to, heading: g.heading });
      else if (g.maxSteps) goals.push({ kind: 'shortcut', to: g.to, maxSteps: g.maxSteps });
      else goals.push({ kind: 'reach', to: g.to });
    }
  }
  const goal = goals.length === 1 ? goals[0] : { kind: 'all', goals };
  const forbiddenLinks = challenge.rules.forbidden;
  const chapter = {
    id: `sandbox-challenge-${++counter}`,
    title: 'Your challenge',
    blurb: 'A challenge you made.',
    hint: 'Build so that every goal can be met.',
    theme: themeName,
    start: challenge.start,
    plates,
    cargo: challenge.cargo.map((c) => ({ room: c.room })),
    pads: [...challenge.pads],
    blocks: challenge.blocks.map((b) => ({ room: b.room, cell: [...b.cell] })),
    physical,
    goal,
    ruleset: { ...UNRESTRICTED, maxRooms: challenge.rules.maxRooms ?? Infinity, maxPortals: challenge.rules.maxPortals ?? Infinity, forbiddenLinks },
    optional: [],
  };
  chapter.optional = challenge.objectives.map((o, i) => {
    const def = OBJECTIVES[o.kind];
    return { id: `objective-${i}`, title: def.title(o.value), text: def.text, check: (s) => goalSatisfied(s, chapter) && def.check(s, chapter, o.value) };
  });
  memo.set(challenge, chapter);
  return chapter;
}

// ---- immutable edits (the UI builds the next challenge from the current one) ---------------------------------

const copy = (c) => JSON.parse(JSON.stringify(c));
export function withStart(c, start) { const n = copy(c); n.start = start; return n; }
export function addGoal(c, goal) { const n = copy(c); n.goals.push(goal); return n; }
export function removeAt(c, list, i) { const n = copy(c); n[list].splice(i, 1); return n; }
export function addTo(c, list, item) { const n = copy(c); n[list].push(item); return n; }
export function togglePad(c, room) { const n = copy(c); n.pads = n.pads.includes(room) ? n.pads.filter((r) => r !== room) : [...n.pads, room]; return n; }
export function setRule(c, key, value) { const n = copy(c); n.rules[key] = value; return n; }
export function addForbidden(c, a, b) { const n = copy(c); n.rules.forbidden.push({ a, b }); return n; }
export function toggleObjective(c, kind, value = null) {
  const n = copy(c);
  const i = n.objectives.findIndex((o) => o.kind === kind);
  if (i >= 0) n.objectives.splice(i, 1); else n.objectives.push({ kind, value });
  return n;
}
