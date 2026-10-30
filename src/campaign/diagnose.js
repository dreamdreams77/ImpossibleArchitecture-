// Diagnosis of a failed test: what, specifically, stands between the current
// construction and the chapter's goal. Read-only, and built only from the
// traversal engine, so the reasons agree with what a walk would do.

import { findRoute } from '../topology/traversal.js';
import { findCycles } from '../topology/analysis.js';
import { goalPredicate, rulesFor, bodySolution, goalSatisfied } from './chapters.js';

export function diagnose(structure, chapter) {
  if (!chapter.physical && (chapter.goal.kind === 'all' || chapter.goal.kind === 'any')) {
    const out = [];
    chapter.goal.goals.forEach((g, i) => {
      const sub = { ...chapter, goal: g };
      if (!goalSatisfied(structure, sub)) out.push(...diagnose(structure, sub).map((r) => `Goal ${i + 1}: ${r}`));
    });
    return out.length ? out : [chapter.hint];
  }
  const name = (id) => structure.rooms.get(id)?.label || id;
  const plates = chapter.plates ?? [];
  const start = chapter.start;
  const goal = chapter.goal;

  if (chapter.physical) {
    if (!structure.rooms.has(start)) return [chapter.hint];
    const reach = findRoute(structure, start, (t) => goal.to ? t.room === goal.to : true, { open: true });
    const sol = bodySolution(structure, chapter);
    if (sol?.exceeded) return ['The search for a solution gave up: the construction is very open. Try a simpler one.'];
    const out = [];
    const target = goal.to ?? goal.targets?.[0]?.room;
    if (target && !findRoute(structure, start, (t) => t.room === target, { open: true })) out.push(`No passage leads to ${name(target)} from ${name(start)} yet.`);
    else out.push('Every move runs into a wall, a block that cannot move, a shut gate or a one-way passage. Look at where the blocks must go and which doorway row they need.');
    return out;
  }
  if (goal.kind === 'loop') {
    return findCycles(structure).length === 0
      ? ['No loop closes the construction yet.']
      : [chapter.hint];
  }
  if (!goalPredicate(chapter) || !structure.rooms.has(start)) return [chapter.hint];

  const reasons = [];
  const to = goal.to;
  const reachable = findRoute(structure, start, (t) => t.room === to, { open: true });
  if (!reachable) {
    reasons.push(`No passage leads to ${name(to)} from ${name(start)} yet.`);
  }

  for (const p of plates) {
    const facing = (t) => t.room === p.room && t.heading === p.heading;
    const ignoringGates = findRoute(structure, start, facing, { open: true, plates });
    if (!ignoringGates) {
      reasons.push(`Nothing brings a traveller to face ${p.heading} in ${name(p.room)}.`);
    } else if (!findRoute(structure, start, facing, { plates })) {
      reasons.push(`The way to the ${name(p.room)} plate is shut by a gate.`);
    }
  }

  if (reachable && goal.heading) {
    const rightHeading = findRoute(structure, start, (t) => t.room === to && t.heading === goal.heading, { open: true, plates });
    if (!rightHeading) {
      reasons.push(`Arriving at ${name(to)} gives the wrong heading: it must face ${goal.heading}.`);
    }
  }

  // Delivery gates: a passage that waits for a crate to be delivered.
  const pred = goalPredicate(chapter);
  const gated = [...structure.portals.values()].filter((p) => p.opensAfter != null);
  if (gated.length && reachable && !findRoute(structure, start, pred, rulesFor(chapter))) {
    const k = gated[0].opensAfter + 1;
    reasons.push(`A gate opens only once crate ${k} is delivered, so deliver it first.`);
  }

  if (goal.kind === 'deliver' && reasons.length === 0 && reachable) {
    reasons.push('Not every crate reaches the depot: one crate is carried at a time, picked up only where it lies, and delivered only with the right heading.');
  }

  if (reasons.length === 0) reasons.push(chapter.hint);
  return reasons;
}
