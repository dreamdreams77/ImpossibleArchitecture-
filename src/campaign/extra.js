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

// Physical challenges: the walker is a body on a grid, with blocks to push. A cell is [column, row],
// counted from the north-west corner; a door is the middle of a face. Goals are judged by search over
// real moves (see src/topology/blocks.js), so any solution is accepted. An objective with `bonusMoves`
// is earned by actually finishing in that many moves or fewer; it is not a property of the structure.
export const EXTRA = [
  {
    id: 'the-two-doors',
    theme: 'slate',
    title: 'The Two Doors',
    blurb: 'The Hall and the Vault may never be joined directly, and the straight way through the Annex is sealed. A passage can join any face to any face, wherever the rooms are drawn.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'annex', x: 2, y: 0, label: 'Annex' },
      { id: 'vault', x: 4, y: 0, label: 'Vault' },
    ],
    ruleset: {
      ...UNRESTRICTED, maxRooms: 3, maxPortals: 2,
      sealedFaces: sealed(['hall', 'E'], ['annex', 'W'], ['annex', 'E'], ['vault', 'W']),
      forbiddenLinks: [{ a: 'hall', b: 'vault' }],
    },
    start: 'hall',
    goal: { kind: 'reach', to: 'vault' },
    hint: 'You must go through the Annex, and its east and west faces are sealed. Use its north or south faces: any two faces can be joined.',
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
    blurb: 'Two wings that must never touch, and a hall that serves both, with two passages to build. Light both plates, then stand in the Seam facing south.',
    rooms: [
      { id: 'seam', x: 2, y: 2, label: 'The Seam' },
      { id: 'warm', x: 0, y: 0, label: 'Warm Wing' },
      { id: 'cool', x: 4, y: 0, label: 'Cool Wing' },
    ],
    ruleset: {
      ...UNRESTRICTED, maxRooms: 3, maxPortals: 2,
      forbiddenLinks: [{ a: 'warm', b: 'cool' }],
    },
    start: 'seam',
    plates: [
      { room: 'warm', heading: 'E' },
      { room: 'cool', heading: 'W' },
    ],
    goal: { kind: 'machine', to: 'seam', heading: 'S' },
    hint: 'A passage turns you the same way from both sides. Each wing needs a plate struck and then a way back to the Seam facing south, so one passage per wing must do both jobs: look for the faces and turns that give each arrival the heading it needs.',
    optional: [
      {
        id: 'two-routes',
        title: 'One doorway, two readings',
        text: 'A mirror in the Seam: the same doorway reads one way entering and another leaving. The building holds two readings at once.',
        check: (s) => s.degree('seam') >= 2 && [...s.portals.values()].some((p) => p.transform.mirror),
      },
    ],
  },
  {
    id: 'the-ring-hall',
    theme: 'copper',
    title: 'The Ring Hall',
    blurb: 'Three halls off the Gate Hall. Every plate is struck facing south, and no hall may be entered from its north face. Strike all three, then come back to the Gate.',
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
    hint: 'Entering a room through its north face would face you south, but those faces are sealed. A quarter-turn on the passage, or entering through its south face with a half-turn, changes your heading instead. Joining the halls in a ring is not required, but there is something in it.',
    optional: [
      {
        id: 'the-whole-ring',
        title: 'The whole ring',
        text: 'You closed all four halls into one loop, though the plates only asked for a chain. Walk it and you are turned all the way round and back to where you began.',
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

  {
    id: 'the-first-push',
    theme: 'copper',
    physical: true,
    title: 'The First Push',
    blurb: 'Walk with the arrow keys or the on-screen buttons. A block can be pushed, never pulled. Build a doorway and push the block through it onto the plate in the Bay.',
    rooms: [
      { id: 'yard', x: 0, y: 0, label: 'Yard' },
      { id: 'bay', x: 3, y: 0, label: 'Bay' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 2, maxPortals: 1 },
    start: 'yard',
    startCell: [2, 3],
    blocks: [{ room: 'yard', cell: [3, 3] }],
    goal: { kind: 'place', targets: [{ room: 'bay', cell: [4, 2], block: 0 }] },
    hint: 'A doorway is the middle of a face: the two cells there. A block on a door cell, pushed outward, goes through and arrives where the passage sends it.',
    optional: [
      {
        id: 'first-push-lean',
        title: 'No step wasted',
        text: 'The block is home in the fewest moves the construction allows.',
        bonusMoves: 9,
        check: () => false,
      },
    ],
  },
  {
    id: 'the-weighted-gate',
    theme: 'copper',
    physical: true,
    title: 'The Weighted Gate',
    blurb: 'The gate to the Vault stays shut unless something heavy rests on the plate in the Hall. The only block is in the Store, and the Store has no way out yet.',
    rooms: [
      { id: 'store', x: 0, y: 0, label: 'Store' },
      { id: 'hall', x: 3, y: 0, label: 'Hall' },
      { id: 'vault', x: 6, y: 0, label: 'Vault' },
    ],
    fixed: [{ a: { room: 'hall', face: 'E' }, b: { room: 'vault', face: 'W' }, gate: 0 }],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 2 },
    start: 'hall',
    startCell: [1, 6],
    plates: [{ room: 'hall', cell: [3, 3], mode: 'weight' }],
    blocks: [{ room: 'store', cell: [4, 3] }],
    goal: { kind: 'reach', to: 'vault' },
    hint: 'A plate lights while a block rests on it, and goes dark when the block leaves. You can walk through the gate while it is lit.',
    optional: [
      {
        id: 'weighted-lean',
        title: 'Light on its feet',
        text: 'Through the gate in the fewest moves the construction allows.',
        bonusMoves: 27,
        check: () => false,
      },
    ],
  },
  {
    id: 'the-long-push',
    theme: 'verdigris',
    physical: true,
    title: 'The Long Push',
    blurb: 'A block goes where a walker goes, but it cannot come back through a one-way passage, and a mirror swaps the side it lands on. Leave the Vault open.',
    rooms: [
      { id: 'dock', x: 0, y: 0, label: 'Dock' },
      { id: 'ring', x: 3, y: 0, label: 'Ring' },
      { id: 'annex', x: 6, y: 0, label: 'Annex' },
      { id: 'vault', x: 9, y: 0, label: 'Vault' },
    ],
    fixed: [
      { a: { room: 'ring', face: 'E' }, b: { room: 'annex', face: 'W' }, oneWay: 'a', transform: { mirror: true } },
      { a: { room: 'annex', face: 'E' }, b: { room: 'vault', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'dock',
    startCell: [1, 1],
    plates: [{ room: 'annex', cell: [3, 5], mode: 'weight' }],
    solids: { ring: [[3, 3], [4, 3], [3, 4], [4, 4]] },
    blocks: [{ room: 'dock', cell: [3, 3] }],
    goal: { kind: 'reach', to: 'vault' },
    hint: 'Join the Dock to the Ring. The Ring has a pillar in the middle: push the block round it to the east door. Through the one-way mirror the rows swap sides, so line the block up for the plate, not the door.',
    optional: [
      {
        id: 'long-push-lean',
        title: 'The straight way round',
        text: 'The Vault is open in the fewest moves the construction allows.',
        bonusMoves: 36,
        check: () => false,
      },
    ],
  },
  {
    id: 'the-moving-day',
    theme: 'dusk',
    physical: true,
    title: 'The Moving Day',
    blurb: 'Two gates in a row, each held open by its own plate, and two blocks to hold them. One block must go through the first gate to hold the second.',
    rooms: [
      { id: 'yard', x: 0, y: 0, label: 'Yard', size: 0.75 },
      { id: 'hall', x: 3, y: 0, label: 'Hall', size: 0.75 },
      { id: 'cellar', x: 3, y: 3, label: 'Cellar', kind: 'cellar', size: 0.75 },
      { id: 'vault', x: 6, y: 3, label: 'Vault', size: 0.75 },
    ],
    fixed: [
      { a: { room: 'hall', face: 'S' }, b: { room: 'cellar', face: 'N' }, gate: 0 },
      { a: { room: 'cellar', face: 'E' }, b: { room: 'vault', face: 'W' }, gate: 1 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'yard',
    startCell: [0, 0],
    plates: [
      { room: 'hall', cell: [1, 3], mode: 'weight' },
      { room: 'cellar', cell: [4, 2], mode: 'weight' },
    ],
    blocks: [{ room: 'yard', cell: [2, 2] }, { room: 'yard', cell: [3, 4] }],
    goal: { kind: 'reach', to: 'vault' },
    hint: 'Whichever block goes through the first gate must be pushed through while the other holds the first plate. Plan the order before you push: a block against a wall stays there.',
    optional: [
      {
        id: 'moving-lean',
        title: 'Everything in its place',
        text: 'Both gates open and the Vault reached in very few moves.',
        bonusMoves: 70,
        check: () => false,
      },
    ],
  },
  {
    id: 'the-ordered-hall',
    theme: 'copper',
    title: 'The Ordered Hall',
    blurb: 'A one-way corridor carries you past the Bell and then the Drum. The gate answers the Bell plate, which answers only after the Drum has been struck. You passed them in the wrong order.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'bell', x: 3, y: 0, label: 'Bell Room' },
      { id: 'drum', x: 6, y: 0, label: 'Drum Room' },
      { id: 'vault', x: 0, y: 3, label: 'Vault' },
    ],
    fixed: [
      { a: { room: 'hall', face: 'E' }, b: { room: 'bell', face: 'W' }, oneWay: 'a' },
      { a: { room: 'bell', face: 'E' }, b: { room: 'drum', face: 'W' }, oneWay: 'a' },
      { a: { room: 'hall', face: 'S' }, b: { room: 'vault', face: 'N' }, gate: 1 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 5, sealedFaces: sealed(['vault', 'E'], ['vault', 'S'], ['vault', 'W']) },
    start: 'hall',
    plates: [
      { room: 'drum', heading: 'E' },
      { room: 'bell', heading: 'E', after: 0 },
    ],
    goal: { kind: 'machine', to: 'vault' },
    hint: 'The corridor only runs one way: Bell, then Drum. The gate listens to the Bell plate, which lights only once the Drum has been struck, so your first pass did nothing. Build a way back to the Hall and walk the corridor a second time.',
    optional: [],
  },
];
