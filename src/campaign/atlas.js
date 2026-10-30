// The Atlas: architectural phenomena a construction can exhibit, found by understanding the building and
// not by completing a goal. Each entry is a pure test of the real graph (loops, twists, reflections,
// one-way rings, distances), so it can be earned in the campaign, in free construction or in a generated
// challenge, and only by actually building the thing. Found entries are stored with the player's other
// discoveries under an `atlas:` id. Each carries a hint written as a question, never as a recipe.

import { findCycles, dimensionReport } from '../topology/analysis.js';

const walkable = (structure) => findCycles(structure, { limit: 80, budget: 20000 }).filter((c) => c.walkable);

function sharedRoom(a, b) { return a.rooms.some((r) => b.rooms.includes(r)); }

export const ATLAS = Object.freeze([
  {
    id: 'atlas:self-room', title: 'A room that opens onto itself',
    text: 'One room, two faces joined: you walk out and arrive where you started, facing a new way.',
    hint: 'What happens if a room is joined to itself?',
    check: (s) => [...s.portals.values()].some((p) => p.a.room === p.b.room),
  },
  {
    id: 'atlas:hall-of-mirrors', title: 'Hall of mirrors',
    text: 'A room joined to itself through a mirror: its far end is its own reflection, repeated without end.',
    hint: 'Can a room be its own reflection?',
    check: (s) => [...s.portals.values()].some((p) => p.a.room === p.b.room && p.transform.mirror),
  },
  {
    id: 'atlas:quarter-loop', title: 'The turning loop',
    text: 'A loop you can walk that comes back a quarter turn from where it began.',
    hint: 'Can a circuit of rooms change which way you face?',
    check: (s) => walkable(s).some((c) => c.length >= 2 && c.netTurns % 2 === 1 && !c.reflected),
  },
  {
    id: 'atlas:half-loop', title: 'The about-face',
    text: 'A loop that returns you facing the opposite way: two laps to come home.',
    hint: 'Is there a circuit that turns you right round?',
    check: (s) => walkable(s).some((c) => c.length >= 2 && c.netTurns === 2 && !c.reflected),
  },
  {
    id: 'atlas:chirality', title: 'Left becomes right',
    text: 'A loop with an odd number of mirrors. Walk it once and you return reversed.',
    hint: 'What if a circuit contained one mirror?',
    check: (s) => walkable(s).some((c) => c.length >= 2 && c.reflected),
  },
  {
    id: 'atlas:cancelling-twists', title: 'Twists that cancel',
    text: 'A loop that turns you at every step and still brings you home facing as you began.',
    hint: 'Can several turns undo each other?',
    check: (s) => walkable(s).some((c) => c.length >= 3 && c.netTurns === 0 && !c.reflected && c.portals.some((id) => s.portals.get(id).transform.turns)),
  },
  {
    id: 'atlas:one-way-ring', title: 'A ring with a direction',
    text: 'A loop you can walk only one way round. Going back means going on.',
    hint: 'Can a circuit have a direction?',
    check: (s) => findCycles(s, { limit: 80, budget: 20000 }).some((c) => c.length >= 3 && c.oneWayOnly),
  },
  {
    id: 'atlas:two-loops', title: 'Two loops, one room',
    text: 'Two separate loops that pass through the same room.',
    hint: 'What if two circuits crossed in a room?',
    check: (s) => {
      const cycles = findCycles(s, { limit: 80, budget: 20000 }).filter((c) => c.length >= 2);
      for (let i = 0; i < cycles.length; i++) for (let j = i + 1; j < cycles.length; j++) {
        if (sharedRoom(cycles[i], cycles[j]) && cycles[i].portals.some((p) => !cycles[j].portals.includes(p))) return true;
      }
      return false;
    },
  },
  {
    id: 'atlas:long-circuit', title: 'The long circuit',
    text: 'A loop of five or more rooms that you can walk all the way round.',
    hint: 'How many rooms can one circuit hold?',
    check: (s) => walkable(s).some((c) => c.length >= 5),
  },
  {
    id: 'atlas:far-neighbours', title: 'Distant neighbours',
    text: 'Two rooms drawn far apart on the plan, one doorway between them.',
    hint: 'Does a doorway care how far apart the rooms are drawn?',
    check: (s) => dimensionReport(s, { minPlanDistance: 6 }).some((p) => p.contradictory),
  },
  {
    id: 'atlas:near-strangers', title: 'Close strangers',
    text: 'Two rooms drawn side by side that are many doorways apart.',
    hint: 'Can rooms next to each other be far apart?',
    check: (s) => dimensionReport(s, { minPlanDistance: 0 }).some((p) => p.reachable && p.plan <= 3.2 && p.steps >= 4),
  },
]);

// Entries a construction currently exhibits.
export function atlasIn(structure) {
  const found = [];
  for (const e of ATLAS) {
    try { if (e.check(structure)) found.push(e.id); } catch { /* a malformed construction earns nothing */ }
  }
  return found;
}

export const atlasById = (id) => ATLAS.find((e) => e.id === id) ?? null;
