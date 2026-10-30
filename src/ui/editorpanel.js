// The challenge editor's panel. It builds the next challenge value with the pure helpers in
// campaign/editor.js and hands it to the Session; it holds no rules of its own.

import {
  emptyChallenge, addGoal, addTo, removeAt, togglePad, setRule, addForbidden, toggleObjective, withStart,
  problems, OBJECTIVES, HEADINGS,
} from '../campaign/editor.js';
import { gridSize } from '../topology/blocks.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const select = (options, value, onchange, label) => {
  const el = h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));
  return el;
};

export function createEditorPanel({ root, session, render }) {
  // Draft values for the "add" rows live here, not in the session: they are not part of the challenge yet.
  const draft = { goalKind: 'reach', goalRoom: null, goalHeading: '', goalSteps: '', goalLit: false, goalBlock: '', goalX: 3, goalY: 3, plateMode: 'latch', plateRoom: null, plateHeading: 'N', plateX: 3, plateY: 3, crateRoom: null, padRoom: null, blockRoom: null, blockX: 3, blockY: 3, forbidA: null, forbidB: null };
  let lastKey = '';

  const set = (next) => { session.setChallengeObject(next); lastKey = ''; render(); };
  const current = () => session.challenge ?? emptyChallenge([...session.structure.rooms.keys()][0] ?? null);

  function sync() {
    root.hidden = !session.sandbox;
    if (!session.sandbox) return;
    const rooms = [...session.structure.rooms.values()];
    const portal = session.selection?.type === 'portal' ? session.selection.id : null;
    const key = JSON.stringify([rooms.map((r) => [r.id, r.label, r.size]), session.challenge, portal, session.structure.portals.get(portal)?.gate, session.structure.portals.get(portal)?.opensAfter, draft]);
    if (key === lastKey) return;
    lastKey = key;
    build(rooms, portal);
  }

  function build(rooms, portal) {
    const c = current();
    const opts = rooms.map((r) => [r.id, r.label || r.id]);
    const first = rooms[0]?.id ?? null;
    for (const k of ['goalRoom', 'plateRoom', 'crateRoom', 'padRoom', 'blockRoom', 'forbidA', 'forbidB']) if (!rooms.some((r) => r.id === draft[k])) draft[k] = first;
    const name = (id) => session.structure.rooms.get(id)?.label || id;
    const maxCell = (id) => gridSize(session.structure.rooms.get(id)) - 1;
    const num = (key, max) => h('input', { type: 'number', min: 0, max, value: draft[key], 'aria-label': key, class: 'cellnum', onchange: (e) => { draft[key] = Math.max(0, Math.min(max, Number(e.target.value) || 0)); lastKey = ''; sync(); } });
    const row = (...kids) => h('div', { class: 'toolrow editor-row' }, ...kids);
    const list = (items, render1, remove) => h('ul', { class: 'editor-list' }, items.map((it, i) => h('li', {}, render1(it, i), h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', onclick: () => remove(i) }, '×'))));

    const probs = c.start ? problems(c, session.structure) : ['Add a room first.'];
    const body = [
      h('p', { class: 'muted' }, 'Everything here is judged by the same engine as the campaign. Build, then Test.'),
      row(h('label', { class: 'field' }, 'Start ', select(opts, c.start, (v) => set(withStart(c, v)), 'Start room'))),

      h('h4', {}, 'Goals (all must hold)'),
      list(c.goals, (g) => (g.kind === 'place'
        ? `Place ${g.targets.map((t) => `${t.block != null ? `block ${t.block + 1} ` : 'a block '}on ${name(t.room)} (${t.cell})`).join(', ')}`
        : g.kind === 'deliver' ? `Deliver every crate to ${name(g.to)}${g.heading ? ` facing ${g.heading}` : ''}`
          : `Reach ${name(g.to)}${g.heading ? ` facing ${g.heading}` : ''}${g.maxSteps ? ` in ${g.maxSteps} steps` : ''}${g.lit ? ' with every plate lit' : ''}`),
      (i) => set(removeAt(c, 'goals', i))),
      row(
        select([['reach', 'Reach'], ['deliver', 'Deliver crates'], ['place', 'Place a block']], draft.goalKind, (v) => { draft.goalKind = v; lastKey = ''; sync(); }, 'Goal kind'),
        select(opts, draft.goalRoom, (v) => { draft.goalRoom = v; }, 'Goal room'),
      ),
      draft.goalKind === 'place'
        ? row(h('label', { class: 'field' }, 'cell ', num('goalX', 11), num('goalY', 11)), select([['', 'any block'], ...c.blocks.map((_, i) => [i, `block ${i + 1}`])], draft.goalBlock, (v) => { draft.goalBlock = v; }, 'Which block'))
        : row(
          select([['', 'any heading'], ...HEADINGS.map((x) => [x, `facing ${x}`])], draft.goalHeading, (v) => { draft.goalHeading = v; }, 'Heading'),
          draft.goalKind === 'reach' ? select([['', 'any steps'], [1, '≤ 1'], [2, '≤ 2'], [3, '≤ 3'], [4, '≤ 4'], [6, '≤ 6']], draft.goalSteps, (v) => { draft.goalSteps = v; }, 'Most steps') : '',
          draft.goalKind === 'reach' ? h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: draft.goalLit, onchange: (e) => { draft.goalLit = e.target.checked; } }), 'plates lit') : '',
        ),
      row(h('button', {
        type: 'button',
        onclick: () => {
          const g = draft.goalKind === 'place'
            ? { kind: 'place', targets: [{ room: draft.goalRoom, cell: [draft.goalX, draft.goalY], block: draft.goalBlock === '' ? null : Number(draft.goalBlock) }] }
            : draft.goalKind === 'deliver' ? { kind: 'deliver', to: draft.goalRoom, heading: draft.goalHeading || null }
              : { kind: 'reach', to: draft.goalRoom, heading: draft.goalHeading || null, maxSteps: Number(draft.goalSteps) || null, lit: draft.goalLit };
          set(addGoal({ ...c, start: c.start ?? first }, g));
        },
      }, 'Add goal')),

      h('h4', {}, 'Plates'),
      list(c.plates, (p) => `${p.mode} plate in ${name(p.room)}${p.mode === 'weight' ? ` at ${p.cell}` : ` facing ${p.heading}`}`, (i) => set(removeAt(c, 'plates', i))),
      row(
        select([['latch', 'Latch'], ['toggle', 'Toggle'], ['weight', 'Weight']], draft.plateMode, (v) => { draft.plateMode = v; lastKey = ''; sync(); }, 'Plate kind'),
        select(opts, draft.plateRoom, (v) => { draft.plateRoom = v; }, 'Plate room'),
        draft.plateMode === 'weight' ? h('label', { class: 'field' }, 'cell ', num('plateX', 11), num('plateY', 11)) : select(HEADINGS.map((x) => [x, `facing ${x}`]), draft.plateHeading, (v) => { draft.plateHeading = v; }, 'Plate heading'),
        h('button', { type: 'button', onclick: () => set(addTo({ ...c, start: c.start ?? first }, 'plates', draft.plateMode === 'weight' ? { room: draft.plateRoom, mode: 'weight', cell: [draft.plateX, draft.plateY] } : { room: draft.plateRoom, mode: draft.plateMode, heading: draft.plateHeading, startsLit: false })) }, 'Add'),
      ),

      h('h4', {}, 'Crates and pads (carried)'),
      list(c.cargo, (x, i) => `crate ${i + 1} in ${name(x.room)}`, (i) => set(removeAt(c, 'cargo', i))),
      row(select(opts, draft.crateRoom, (v) => { draft.crateRoom = v; }, 'Crate room'), h('button', { type: 'button', onclick: () => set(addTo({ ...c, start: c.start ?? first }, 'cargo', { room: draft.crateRoom })) }, 'Add crate')),
      row(select(opts, draft.padRoom, (v) => { draft.padRoom = v; }, 'Pad room'), h('button', { type: 'button', onclick: () => set(togglePad({ ...c, start: c.start ?? first }, draft.padRoom)) }, c.pads.includes(draft.padRoom) ? 'Remove pad' : 'Add pad')),
      c.pads.length ? h('p', { class: 'muted' }, `Pads in: ${c.pads.map(name).join(', ')}`) : '',

      h('h4', {}, 'Blocks (pushed, on a grid)'),
      list(c.blocks, (b, i) => `block ${i + 1} in ${name(b.room)} at ${b.cell}`, (i) => set(removeAt(c, 'blocks', i))),
      row(select(opts, draft.blockRoom, (v) => { draft.blockRoom = v; }, 'Block room'), h('label', { class: 'field' }, 'cell ', num('blockX', 11), num('blockY', 11)),
        h('button', { type: 'button', onclick: () => set(addTo({ ...c, start: c.start ?? first }, 'blocks', { room: draft.blockRoom, cell: [Math.min(draft.blockX, maxCell(draft.blockRoom)), Math.min(draft.blockY, maxCell(draft.blockRoom))] })) }, 'Add block')),

      h('h4', {}, 'Gate on the selected passage'),
      portal
        ? row(select([['', 'open'], ...c.plates.map((_, i) => [`g${i}`, `waits for plate ${i + 1}`]), ...c.cargo.map((_, i) => [`c${i}`, `waits for crate ${i + 1}`])],
          session.structure.portals.get(portal).gate != null ? `g${session.structure.portals.get(portal).gate}` : session.structure.portals.get(portal).opensAfter != null ? `c${session.structure.portals.get(portal).opensAfter}` : '',
          (v) => { session.gateSelectedPortal(v.startsWith('g') ? { gate: Number(v.slice(1)) } : v.startsWith('c') ? { opensAfter: Number(v.slice(1)) } : {}); lastKey = ''; render(); }, 'Gate'))
        : h('p', { class: 'muted' }, 'Select a passage (click its arc in the model, or in the plan) to gate it.'),

      h('h4', {}, 'Rules'),
      row(
        h('label', { class: 'field' }, 'Rooms ≤ ', select([['', 'any'], ...[2, 3, 4, 5, 6, 8, 12].map((n) => [n, n])], c.rules.maxRooms ?? '', (v) => set(setRule({ ...c, start: c.start ?? first }, 'maxRooms', Number(v) || null)), 'Most rooms')),
        h('label', { class: 'field' }, 'Passages ≤ ', select([['', 'any'], ...[1, 2, 3, 4, 5, 6, 8].map((n) => [n, n])], c.rules.maxPortals ?? '', (v) => set(setRule({ ...c, start: c.start ?? first }, 'maxPortals', Number(v) || null)), 'Most passages')),
      ),
      list(c.rules.forbidden, (f) => `never join ${name(f.a)} and ${name(f.b)}`, (i) => { const n = JSON.parse(JSON.stringify(c)); n.rules.forbidden.splice(i, 1); set(n); }),
      row(select(opts, draft.forbidA, (v) => { draft.forbidA = v; }, 'First room'), select(opts, draft.forbidB, (v) => { draft.forbidB = v; }, 'Second room'),
        h('button', { type: 'button', onclick: () => { if (draft.forbidA !== draft.forbidB) set(addForbidden({ ...c, start: c.start ?? first }, draft.forbidA, draft.forbidB)); } }, 'Forbid a link')),

      h('h4', {}, 'Optional objectives'),
      h('div', { class: 'objectives' }, Object.entries(OBJECTIVES).map(([kind, def]) => {
        const on = c.objectives.find((o) => o.kind === kind);
        return h('label', { class: 'field objective' },
          h('input', { type: 'checkbox', checked: !!on, onchange: () => set(toggleObjective({ ...c, start: c.start ?? first }, kind, def.needsValue ? (kind === 'fewPassages' ? 2 : 4) : null)) }),
          def.title(on?.value ?? (kind === 'fewPassages' ? 2 : 4)));
      })),

      probs.length && c.goals.length === 0 ? h('p', { class: 'muted' }, probs[0]) : probs.length ? h('p', { class: 'editor-problem' }, probs.join(' ')) : h('p', { class: 'muted' }, 'Ready. Test construction checks every goal; Walk lets you play it.'),
      row(h('button', { type: 'button', onclick: () => { session.clearChallenge(); lastKey = ''; render(); } }, 'Clear challenge')),
    ];
    root.replaceChildren(h('h3', {}, 'Challenge editor'), ...body);
  }

  return { sync };
}
