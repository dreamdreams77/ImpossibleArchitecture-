// Challenges added to the original twenty-four. They are data like the rest:
// rooms, a ruleset, plates and cargo, a goal, and optional discoveries that are
// structural predicates over what the player built.

import { UNRESTRICTED } from '../topology/construction.js';
import { findRoute } from '../topology/traversal.js';
import { findCycles } from '../topology/analysis.js';

const sealed = (...pairs) => pairs.map(([room, face]) => ({ room, face }));

// The fewest passages between two rooms, ignoring gates and one-way rules: the
// shape of the building rather than of any walk.
function steps(structure, from, to) {
  const route = findRoute(structure, from, (t) => t.room === to, { open: true });
  return route === null ? Infinity : route.length;
}

export const EXTRA = [
  {
    id: 'the-two-doors',
    theme: 'slate',
    title: 'The Two Doors',
    blurb: 'The straight way is sealed. A passage can join any face to any face, wherever the rooms are drawn.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'annex', x: 2, y: 0, label: 'Annex' },
      { id: 'vault', x: 4, y: 0, label: 'Vault' },
    ],
    ruleset: {
      ...UNRESTRICTED, maxRooms: 3, maxPortals: 2,
      sealedFaces: sealed(['hall', 'E'], ['annex', 'W'], ['annex', 'E'], ['vault', 'W']),
    },
    start: 'hall',
    goal: { kind: 'reach', to: 'vault' },
    hint: 'The faces that look at each other are sealed. Use the north or south faces: any two faces can be joined.',
    optional: [
      {
        id: 'round-the-back',
        title: 'Round the back',
        text: 'You reached the Vault without ever touching an east or west face. The plan never mattered.',
        check: (s) => [...s.portals.values()].filter((p) => !p.fixed).length >= 2
          && [...s.portals.values()].every((p) => ['N', 'S'].includes(p.a.face) && ['N', 'S'].includes(p.b.face)),
      },
    ],
  },
  {
    id: 'the-far-wing',
    theme: 'slate',
    title: 'The Far Wing',
    blurb: 'Twelve units on the plan, two doorways at most. Reach the East Gate in two steps.',
    rooms: [
      { id: 'w', x: 0, y: 0, label: 'West Gate' },
      { id: 'b', x: 3, y: 0, label: 'Bay' },
      { id: 'c', x: 6, y: 0, label: 'Court' },
      { id: 'd', x: 9, y: 0, label: 'Bay Two' },
      { id: 'e', x: 12, y: 0, label: 'East Gate' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 5, maxPortals: 2 },
    start: 'w',
    goal: { kind: 'shortcut', to: 'e', maxSteps: 2 },
    hint: 'Join the two gates directly, or hop through any one room between them. Distance on the plan is only drawing.',
    optional: [
      {
        id: 'one-step',
        title: 'Twelve units, one step',
        text: 'The whole length of the plan crossed in a single doorway.',
        check: (s) => steps(s, 'w', 'e') === 1,
      },
    ],
  },
  {
    id: 'the-turned-nave',
    theme: 'ash',
    title: 'The Turned Nave',
    blurb: 'Leave the Nave and come back to it facing east. A loop can turn you.',
    rooms: [
      { id: 'nave', x: 0, y: 0, label: 'Nave' },
      { id: 'transept', x: 3, y: 0, label: 'Transept' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 2, maxPortals: 2 },
    start: 'nave',
    goal: { kind: 'arrive', to: 'nave', heading: 'E' },
    hint: 'You start facing north. A loop through the north and south faces only ever leaves you facing north or south, until one of its passages turns you a quarter.',
    optional: [
      {
        id: 'quarter-turned',
        title: 'A quarter turned',
        text: 'The loop you built turns a traveller a quarter-turn each time round. The room is the same; the way it faces is not.',
        check: (s) => findCycles(s).some((c) => c.netTurns === 1),
      },
    ],
  },
  {
    id: 'the-cupboard',
    theme: 'dusk',
    title: 'The Cupboard',
    blurb: 'Five rooms are drawn inside a cupboard no bigger than one of them. Walk through every room to the Ballroom.',
    rooms: [
      { id: 'cupboard', x: 0, y: 0, label: 'Cupboard', size: 0.75, kind: 'cellar' },
      { id: 'hall', x: 0.25, y: 0.15, label: 'Hall' },
      { id: 'gallery', x: 0.1, y: 0.35, label: 'Gallery', kind: 'corridor' },
      { id: 'court', x: 0.4, y: 0.3, label: 'Court' },
      { id: 'ballroom', x: 0.25, y: 0.5, label: 'Ballroom', size: 1.5, kind: 'atrium' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 5, maxPortals: 4 },
    start: 'cupboard',
    plates: [
      { room: 'hall', heading: 'N' },
      { room: 'gallery', heading: 'N' },
      { room: 'court', heading: 'N' },
    ],
    goal: { kind: 'machine', to: 'ballroom' },
    hint: 'The plates answer to a traveller arriving facing north, which is how you face after entering a room through its south face. Chain the rooms.',
    optional: [
      {
        id: 'house-in-a-cupboard',
        title: 'A house in a cupboard',
        text: 'Four doorways deep, yet everything fits inside the cupboard\'s own footprint. The interior is larger than the exterior.',
        check: (s) => steps(s, 'cupboard', 'ballroom') >= 4 && s.apparentDistance('cupboard', 'ballroom') < 1,
      },
    ],
  },
  {
    id: 'the-seam',
    theme: 'verdigris',
    title: 'The Seam',
    blurb: 'Two wings that must never touch, and a hall that serves both. Light both plates, then stand in the Seam facing south.',
    rooms: [
      { id: 'seam', x: 2, y: 2, label: 'The Seam' },
      { id: 'warm', x: 0, y: 0, label: 'Warm Wing' },
      { id: 'cool', x: 4, y: 0, label: 'Cool Wing' },
    ],
    ruleset: {
      ...UNRESTRICTED, maxRooms: 3, maxPortals: 3,
      forbiddenLinks: [{ a: 'warm', b: 'cool' }],
    },
    start: 'seam',
    plates: [
      { room: 'warm', heading: 'E' },
      { room: 'cool', heading: 'W' },
    ],
    goal: { kind: 'machine', to: 'seam', heading: 'S' },
    hint: 'A passage turns you the same way from both sides, so the way you leave a wing and the way you return cannot be the same passage.',
    optional: [
      {
        id: 'two-routes',
        title: 'Two routes, one hall',
        text: 'Both wings are served by the Seam, and the Seam is entered two different ways. The building holds two readings at once.',
        check: (s) => s.degree('seam') >= 3,
      },
    ],
  },
  {
    id: 'the-ring-hall',
    theme: 'copper',
    title: 'The Ring Hall',
    blurb: 'Four halls in a ring. Every plate is struck facing south, and no hall may be entered from the north.',
    rooms: [
      { id: 'gate', x: 0, y: 0, label: 'Gate Hall' },
      { id: 'east', x: 3, y: 0, label: 'East Hall' },
      { id: 'south', x: 3, y: 3, label: 'South Hall' },
      { id: 'west', x: 0, y: 3, label: 'West Hall' },
    ],
    ruleset: {
      ...UNRESTRICTED, maxRooms: 4, maxPortals: 4,
      sealedFaces: sealed(['east', 'N'], ['south', 'N'], ['west', 'N']),
    },
    start: 'gate',
    plates: [
      { room: 'east', heading: 'S' },
      { room: 'south', heading: 'S' },
      { room: 'west', heading: 'S' },
    ],
    goal: { kind: 'machine', to: 'gate' },
    hint: 'Entering a room through its north face would face you south, but those faces are sealed. A quarter-turn on the passage changes your heading instead.',
    optional: [
      {
        id: 'the-whole-ring',
        title: 'The whole ring',
        text: 'All four halls lie on one loop. Walk it and you are turned all the way round and back to where you began.',
        check: (s) => findCycles(s).some((c) => c.rooms.length === 4),
      },
    ],
  },
  {
    id: 'the-last-construction',
    theme: 'dusk',
    title: 'The Last Construction',
    blurb: 'Two crates, one depot behind a gate. Light the Well, carry each crate through the Loft, and leave it at the Depot facing east.',
    rooms: [
      { id: 'foundation', x: 0, y: 0, label: 'Foundation' },
      { id: 'well', x: 3, y: 0, label: 'Well', kind: 'cellar' },
      { id: 'forge', x: 6, y: 0, label: 'Forge' },
      { id: 'cellar', x: 6, y: 3, label: 'Crypt', kind: 'cellar' },
      { id: 'loft', x: 3, y: 3, label: 'Loft', size: 1.5, kind: 'atrium' },
      { id: 'depot', x: 0, y: 3, label: 'Depot', size: 1.5, kind: 'atrium' },
    ],
    // The Crypt drops into the Loft by a one-way stair, and the Loft's only way on is a one-way
    // gate to the Depot that waits for the Well and mirrors whoever passes, facing them east.
    fixed: [
      { a: { room: 'cellar', face: 'W' }, b: { room: 'loft', face: 'E' }, oneWay: 'a' },
      { a: { room: 'loft', face: 'S' }, b: { room: 'depot', face: 'E' }, gate: 0, oneWay: 'a', transform: { mirror: true } },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 6, maxPortals: 8 },
    start: 'foundation',
    plates: [{ room: 'well', heading: 'S' }],
    cargo: [{ room: 'forge' }, { room: 'cellar' }],
    pads: ['loft'],
    goal: { kind: 'deliver', to: 'depot', heading: 'E' },
    hint: 'The Well answers only to a traveller facing south. A crate carried into the Loft is set down there, and you can neither climb back up the stair nor return through the gate, so you must arrive in the Loft again with empty hands. Fold the Loft onto itself, or send the traveller the long way round.',
    optional: [
      {
        id: 'loft-loop',
        title: 'The Loft folds back',
        text: 'You joined the Loft to itself. A room that opens onto itself lets a crate be set down and picked up again in a single place.',
        check: (s) => [...s.portals.values()].some((p) => !p.fixed && p.a.room === 'loft' && p.b.room === 'loft'),
      },
      {
        id: 'long-lap',
        title: 'The long lap',
        text: 'Four passages and one great ring: Foundation, Well, Forge, Crypt, Loft, Depot and back. The building folds back on itself without a single room doing it.',
        check: (s) => [...s.portals.values()].filter((p) => !p.fixed).length === 4
          && findCycles(s).some((c) => c.rooms.length === 6),
      },
    ],
  },
];
