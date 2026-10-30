// The developer's read-out of the authoritative world. Pure: it takes a Session
// and returns lines of text. It reports what the engine holds (nodes, connections,
// object ownership, transform state, the walker's path, invalid constructions and
// the challenge verdict), never what the renderer happens to be drawing, so a
// disagreement between the two is visible at a glance.

import { validate, UNRESTRICTED } from '../topology/construction.js';
import { findCycles } from '../topology/analysis.js';
import { goalSatisfied, discoveriesIn } from '../campaign/chapters.js';
import { diagnose } from '../campaign/diagnose.js';
import { FACES } from '../topology/graph.js';

const TURN_NAMES = ['', '¼', '½', '¾'];

export function describePortal(p) {
  const t = p.transform ?? {};
  const bits = [];
  if (t.turns) bits.push(`turns ${TURN_NAMES[t.turns]}`);
  if (t.mirror) bits.push('mirror');
  if (p.oneWay) bits.push(`one-way from ${p.oneWay === 'a' ? p.a.room : p.b.room}`);
  if (p.gate !== null && p.gate !== undefined) bits.push(`gate: plate ${p.gate + 1}`);
  if (p.opensAfter !== null && p.opensAfter !== undefined) bits.push(`opens after crate ${p.opensAfter + 1}`);
  if (p.fixed) bits.push('fixed');
  return `${p.id}  ${p.a.room}.${p.a.face} <-> ${p.b.room}.${p.b.face}${bits.length ? `  [${bits.join(', ')}]` : ''}`;
}

export function debugReport(session) {
  const s = session.structure;
  const out = [];
  const ruleset = session.ruleset ?? UNRESTRICTED;
  out.push(`== world: ${s.rooms.size} nodes, ${s.portals.size} connections, ${session.chapter ? session.chapter.id : 'free construction'}`);

  out.push('-- nodes');
  for (const r of s.rooms.values()) {
    const faces = FACES.map((f) => {
      const hit = s.portalAt(r.id, f);
      return hit ? `${f}:${hit.portal.id}` : `${f}:-`;
    }).join(' ');
    out.push(`${r.id}  "${r.label}"  ${r.kind ?? 'chamber'} x${r.size ?? 1}  plan(${r.x}, ${r.y})  degree ${s.degree(r.id)}  ${faces}`);
  }

  out.push('-- connections');
  if (s.portals.size === 0) out.push('(none)');
  for (const p of s.portals.values()) out.push(describePortal(p));

  const cycles = findCycles(s);
  out.push(`-- loops: ${cycles.length}`);
  for (const c of cycles.slice(0, 6)) out.push(`${c.rooms.join(' > ')}  net turn ${TURN_NAMES[c.netTurns] || 0}${c.reflected ? '  reflects' : ''}`);

  const fp = session.fp;
  out.push('-- walker');
  if (fp) {
    out.push(`in ${fp.room} facing ${fp.heading}, ${fp.steps} steps, lit ${fp.lit.toString(2).padStart(1, '0')}b, delivered ${fp.delivered.toString(2)}b, carrying ${fp.carry >= 0 ? `crate ${fp.carry + 1}` : 'nothing'}`);
    out.push(`path: ${fp.trail.join(' > ')}`);
  } else out.push('(no walker)');

  out.push('-- objects');
  const chapter = session.chapter;
  if (chapter) {
    (chapter.plates ?? []).forEach((p, i) => {
      const lit = fp ? (fp.lit & (1 << i)) !== 0 : false;
      out.push(`plate ${i + 1} in ${p.room} facing ${p.heading} (${p.mode ?? 'latch'}): ${lit ? 'lit' : 'dark'}`);
    });
    session.cratePositions().forEach((c, i) => out.push(`crate ${i + 1}: ${c.carried ? 'carried' : `in ${c.room}`}`));
    for (const id of chapter.pads ?? []) out.push(`pad in ${id}`);
    if (!(chapter.plates?.length || chapter.cargo?.length || chapter.pads?.length)) out.push('(no objects in this challenge)');
  } else out.push('(none in free construction)');

  out.push('-- invalid constructions');
  const v = validate(s, ruleset);
  if (v.ok) out.push('(none)');
  for (const x of v.violations) out.push(`${x.code}: ${x.message}${x.portal ? ` (${x.portal})` : ''}`);

  out.push('-- challenge');
  if (chapter) {
    out.push(`${chapter.title}  goal ${JSON.stringify(chapter.goal)}`);
    out.push(`solved by this construction: ${goalSatisfied(s, chapter) ? 'yes' : 'no'}`);
    out.push(`discoveries met: ${discoveriesIn(s, chapter).join(', ') || 'none'}`);
    if (!goalSatisfied(s, chapter)) for (const r of diagnose(s, chapter)) out.push(`blocked: ${r}`);
    out.push(`route to goal: ${session.routeHighlight ? session.routeHighlight.faces.join('') : '(run a test)'}`);
  } else out.push('(no goal)');
  return out;
}
