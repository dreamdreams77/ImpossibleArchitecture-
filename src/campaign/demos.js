// Demonstrations: small buildings that each show one thing the architecture can do that an ordinary
// floor plan cannot. They load into free construction, so they can be walked, inspected and edited like
// anything else, and each carries a `claim`: a statement about the building, checked by the engine in the
// tests, so a demonstration can never quietly stop demonstrating what it says.

import { Structure } from '../topology/graph.js';
import { makeTraveller, step, findRoute } from '../topology/traversal.js';
import { findCycles } from '../topology/analysis.js';

const T = (turns = 0, mirror = false) => ({ turns, mirror });

function build(rooms, portals) {
  const s = new Structure();
  for (const r of rooms) s.addRoom(r);
  for (const [a, aFace, b, bFace, transform = T(), oneWay = null] of portals) s.addPortal({ a, aFace, b, bFace, transform, oneWay });
  return s;
}

const walk = (s, room, faces) => { let t = makeTraveller(room, faces[0]); for (const f of faces) { t = step(s, t, f); if (!t) return null; } return t; };

export const DEMOS = Object.freeze([
  {
    id: 'endless-corridor',
    title: 'The Endless Corridor',
    text: 'One room. Its east door opens onto its own west wall. Look through it: the corridor goes on for ever, and walking it never leaves the room.',
    try: 'Walk east as many times as you like. Then look at the plan: there is only one room.',
    view: 'first', start: 'hall', heading: 'E',
    build: () => build([{ id: 'hall', x: 0, y: 0, label: 'Corridor', kind: 'corridor' }], [['hall', 'E', 'hall', 'W']]),
    claim: (s) => { const t = walk(s, 'hall', ['E', 'E', 'E']); return t?.room === 'hall' && t.heading === 'E'; },
  },
  {
    id: 'hall-of-mirrors',
    title: 'The Hall of Mirrors',
    text: 'A room whose far wall is a mirrored doorway back into itself. You walk through and come back as your own reflection: left is right, and the controls turn the other way. Walk through again and you are restored.',
    try: 'Walk east once and watch the reflected badge; turn right and see the world turn left. Walk east again.',
    view: 'first', start: 'hall', heading: 'E',
    build: () => build([{ id: 'hall', x: 0, y: 0, label: 'Mirror Hall', kind: 'atrium', size: 1.5 }], [['hall', 'E', 'hall', 'W', T(0, true)]]),
    claim: (s) => walk(s, 'hall', ['E'])?.mirrored === true && walk(s, 'hall', ['E', 'E'])?.mirrored === false,
  },
  {
    id: 'turning-tower',
    title: 'The Turning Tower',
    text: 'Four rooms in a square, each door turning you a quarter. Go round the ring and you come home facing a way you never turned.',
    try: 'Walk the loop from the Base and check which way you face on return. Then open the model and follow the green arcs.',
    view: 'model', start: 'base', heading: 'E',
    build: () => build([
      { id: 'base', x: 0, y: 0, label: 'Base' }, { id: 'stair', x: 3, y: 0, label: 'Stair' },
      { id: 'landing', x: 3, y: 3, label: 'Landing' }, { id: 'loft', x: 0, y: 3, label: 'Loft' },
    ], [['base', 'E', 'stair', 'W', T(1)], ['stair', 'S', 'landing', 'W', T(1)], ['landing', 'S', 'loft', 'W', T(1)], ['loft', 'S', 'base', 'W', T(1)]]),
    claim: (s) => { const t = walk(s, 'base', ['E', 'S', 'S', 'S']); return t?.room === 'base' && t.heading === 'S'; },
  },
  {
    id: 'distant-neighbours',
    title: 'Distant Neighbours',
    text: 'The Observatory is drawn twelve units from the Lodge, and its door is one step away. The Annex, drawn right beside the Lodge, is three doors away the other way round.',
    try: 'Open the model: the arc from the Lodge leaps across the plan, while the room next door is far by every route.',
    view: 'model', start: 'lodge', heading: 'E',
    build: () => build([
      { id: 'lodge', x: 0, y: 0, label: 'Lodge' }, { id: 'annex', x: 2, y: 0, label: 'Annex' },
      { id: 'observatory', x: 12, y: 0, label: 'Observatory', kind: 'atrium', size: 1.5 },
      { id: 'hall', x: 12, y: 4, label: 'Hall' }, { id: 'gallery', x: 6, y: 6, label: 'Gallery' },
    ], [['lodge', 'E', 'observatory', 'W'], ['observatory', 'S', 'hall', 'N'], ['hall', 'W', 'gallery', 'E'], ['gallery', 'N', 'annex', 'S']]),
    claim: (s) => findRoute(s, 'lodge', (t) => t.room === 'observatory').length === 1 && findRoute(s, 'lodge', (t) => t.room === 'annex').length === 4,
  },
  {
    id: 'two-rooms-one-place',
    title: 'Two Rooms in One Place',
    text: 'The Cellar and the Chapel are drawn on exactly the same spot of the plan, and they are different rooms: one low and close, one tall and lit. Which one you are in depends only on the door you came through.',
    try: 'Walk north from the Stair, come back, then walk south. Same place on the plan, two different rooms.',
    view: 'first', start: 'stair', heading: 'N',
    build: () => build([
      { id: 'stair', x: 0, y: 0, label: 'Stair', kind: 'corridor' },
      { id: 'cellar', x: 0, y: 4, label: 'Cellar', kind: 'cellar', size: 0.75 },
      { id: 'chapel', x: 0, y: 4, label: 'Chapel', kind: 'atrium', size: 1.5 },
    ], [['stair', 'N', 'cellar', 'S'], ['stair', 'S', 'chapel', 'N']]),
    claim: (s) => { const a = s.rooms.get('cellar'); const b = s.rooms.get('chapel'); return a.x === b.x && a.y === b.y && walk(s, 'stair', ['N']).room !== walk(s, 'stair', ['S']).room; },
  },
  {
    id: 'mobius-gallery',
    title: 'The Möbius Gallery',
    text: 'A ring of three galleries with one mirror in it. Once round and you come home reflected; twice round and you are yourself again. The loop has only one side.',
    try: 'Walk the ring once and look for the reflected badge. Walk it again.',
    view: 'first', start: 'west', heading: 'E',
    build: () => build([
      { id: 'west', x: 0, y: 0, label: 'West Gallery' }, { id: 'north', x: 3, y: -3, label: 'North Gallery' }, { id: 'east', x: 6, y: 0, label: 'East Gallery' },
    ], [['west', 'E', 'north', 'W'], ['north', 'E', 'east', 'W', T(0, true)], ['east', 'E', 'west', 'W']]),
    claim: (s) => { const once = walk(s, 'west', ['E', 'E', 'E']); const twice = walk(s, 'west', ['E', 'E', 'E', 'E', 'E', 'E']); return once?.room === 'west' && once.mirrored && twice?.room === 'west' && !twice.mirrored; },
  },
  {
    id: 'one-way-spiral',
    title: 'The One-Way Spiral',
    text: 'Three chambers joined by one-way doors. You can always go on, never back: the only way to return to where you started is all the way round.',
    try: 'Try to walk back the way you came. Then follow the amber chevrons in the model.',
    view: 'model', start: 'a', heading: 'E',
    build: () => build([
      { id: 'a', x: 0, y: 0, label: 'First' }, { id: 'b', x: 3, y: 0, label: 'Second' }, { id: 'c', x: 1.5, y: 3, label: 'Third' },
    ], [['a', 'E', 'b', 'W', T(), 'a'], ['b', 'S', 'c', 'E', T(), 'a'], ['c', 'W', 'a', 'S', T(), 'a']]),
    claim: (s) => !step(s, walk(s, 'a', ['E']), 'W') && findCycles(s).some((c) => c.oneWayOnly),
  },
]);

export const demoById = (id) => DEMOS.find((d) => d.id === id) ?? null;
