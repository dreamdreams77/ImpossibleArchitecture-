// Experiments: questions the player's own construction can answer. Each is posed from the real graph and
// judged by walking it, so a correct prediction proves the player understands the building, not that they
// clicked something. The only kind so far is the loop prediction: starting in a room of a walkable loop,
// which way will you face when you come back round?

import { findCycles } from './../topology/analysis.js';
import { makeTraveller, step } from '../topology/traversal.js';

const FACES = ['N', 'E', 'S', 'W'];

// The faces to take, in order, to walk `cycle` once from its first room. Null if it cannot be walked
// (a one-way passage in the way) or does not bring the traveller back to the start.
export function walkLoop(structure, cycle, startHeading = 'N') {
  let t = makeTraveller(cycle.rooms[0], startHeading);
  const faces = [];
  for (let i = 0; i < cycle.portals.length; i++) {
    const room = cycle.rooms[i];
    const p = structure.portals.get(cycle.portals[i]);
    if (!p || t.room !== room) return null;
    // Try each end of the passage that lies in this room (both, for a self-loop) and take the one that works.
    const ends = [p.a, p.b].filter((e) => e.room === room);
    let moved = null; let face = null;
    for (const e of ends) { const m = step(structure, t, e.face); if (m) { moved = m; face = e.face; break; } }
    if (!moved) return null;
    faces.push(face); t = moved;
  }
  if (t.room !== cycle.rooms[0]) return null;
  return { faces, heading: t.heading, steps: faces.length };
}

// The loop experiments the construction offers right now, easiest (shortest loop) first. Each has a stable
// `id` so a loop is rewarded once however many times it is asked.
export function loopExperiments(structure) {
  const out = [];
  for (const c of findCycles(structure, { limit: 40, budget: 15000 })) {
    if (!c.walkable) continue;
    // A loop may only be walkable the other way round (one-way passages): try that too.
    const n = c.rooms.length;
    const reversed = { rooms: [c.rooms[0], ...c.rooms.slice(1).reverse()], portals: [...c.portals].reverse() };
    const walk = walkLoop(structure, c) ?? (n > 1 ? walkLoop(structure, reversed) : null);
    if (!walk) continue;
    const label = (id) => structure.rooms.get(id)?.label || id;
    const sig = c.portals.map((id) => { const p = structure.portals.get(id); return `${id}${p.transform.turns}${p.transform.mirror ? 'm' : ''}`; }).join('.');
    out.push({
      id: `exp:loop:${sig}`,
      room: c.rooms[0],
      question: `You stand in ${label(c.rooms[0])} facing north and walk once round the loop of ${c.length === 1 ? 'one passage' : `${c.length} passages`}. Which way do you face when you are back?`,
      answer: walk.heading,
      steps: walk.steps,
      faces: walk.faces,
    });
  }
  return out.sort((a, b) => a.steps - b.steps || a.id.localeCompare(b.id));
}

export function judge(experiment, guess) {
  return { correct: FACES.includes(guess) && guess === experiment.answer, answer: experiment.answer };
}
