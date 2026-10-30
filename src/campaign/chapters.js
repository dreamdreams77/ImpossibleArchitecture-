// Campaign chapters as data.
//
// A chapter provides starting rooms, a ruleset that constrains construction,
// a main goal, optional discoveries, and optionally pressure plates. Goals and
// discoveries are checked by the topology engine (traversal and analysis),
// never by scripted triggers, so a chapter is "solved" only when the built
// structure actually does what the goal says.
//
// Main goal kinds:
//   reach    - a traveller starting in `start` can reach `to`.
//   arrive   - as reach, but the traveller must also be facing `heading`.
//   loop     - starting in `start`, the traveller returns to `start` after
//              at least one step.
//   shortcut - `to` is reachable from `start` in at most `maxSteps` steps.
//   machine  - a traveller reaches `to` having lit every plate in `plates`
//              on one route (order is free, arrivals must be real).
//   deliver  - a traveller carries every crate in `cargo` to `to`, arriving
//              facing `heading` when one is given. A crate is picked up on
//              arrival in its room, so a route may need several trips.
//
// Optional discoveries are structural predicates over the construction, e.g.
// "contains a loop whose net twist is a half-turn". They are not required to
// finish a chapter and are recorded in progress when first met.

import { UNRESTRICTED } from '../topology/construction.js';
import { Structure } from '../topology/graph.js';
import { findRoute } from '../topology/traversal.js';
import { findCycles, dimensionReport } from '../topology/analysis.js';
import { EXTRA } from './extra.js';
import { ORDER, placeInChapter } from './campaign.js';

const RAW = [
  {
    id: 'threshold',
    theme: 'slate',
    title: 'I. Threshold',
    blurb: 'Two rooms, one doorway. Connect them and walk through.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Entrance' },
      { id: 'vault', x: 2, y: 0, label: 'Vault' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 2, maxPortals: 1 },
    start: 'hall',
    goal: { kind: 'reach', to: 'vault' },
    hint: 'Select the Connect tool, click the east face of Entrance, then the west face of Vault.',
    optional: [],
  },
  {
    id: 'returning-hall',
    theme: 'ash',
    title: 'II. The Returning Hall',
    blurb: 'A corridor that leads back to where it began. Build a loop.',
    rooms: [{ id: 'gallery', x: 0, y: 0, label: 'Gallery' }],
    ruleset: { ...UNRESTRICTED, maxRooms: 1, maxPortals: 1 },
    start: 'gallery',
    goal: { kind: 'loop', start: 'gallery' },
    hint: 'A room may connect to itself. Join its north face to its south face.',
    optional: [
      {
        id: 'mirror-gallery-loop',
        title: 'A gallery that reverses itself',
        text: 'Your loop reflects space. Walking it once turns left into right.',
        check: (s) => findCycles(s).some((c) => c.reflected),
      },
    ],
  },
  {
    id: 'twisted-stair',
    theme: 'slate',
    title: 'III. The Twisted Stair',
    blurb: 'Arrive facing the right way. Quarter-turns change the direction you face.',
    rooms: [
      { id: 'base', x: 0, y: 0, label: 'Base' },
      { id: 'landing', x: 1, y: 0, label: 'Landing' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 2, maxPortals: 2 },
    start: 'base',
    goal: { kind: 'arrive', to: 'landing', heading: 'S' },
    hint: 'Your heading on arrival is set by the face you enter through and the portal\'s quarter-turns, not by how you approached.',
    optional: [],
  },
  {
    id: 'contradiction',
    theme: 'dusk',
    title: 'IV. Contradiction',
    blurb: 'Drawn three hundred units apart, yet one step apart in the building.',
    rooms: [
      { id: 'low', x: 0, y: 0, label: 'Cellar' },
      { id: 'high', x: 300, y: 300, label: 'Attic' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 2, maxPortals: 1 },
    start: 'low',
    goal: { kind: 'shortcut', to: 'high', maxSteps: 1 },
    hint: 'Distance on the plan is not distance in the building. Connect them directly.',
    optional: [],
  },
  {
    id: 'mirrored-gallery',
    theme: 'verdigris',
    title: 'V. The Mirrored Gallery',
    blurb: 'Two doorways, one reflection. The last room must be entered facing west.',
    rooms: [
      { id: 'atrium', x: 0, y: 0, label: 'Atrium' },
      { id: 'wing', x: 2, y: 0, label: 'Wing' },
      { id: 'gallery', x: 4, y: 0, label: 'Gallery' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 2 },
    start: 'atrium',
    goal: { kind: 'arrive', to: 'gallery', heading: 'W' },
    hint: 'Entering the Gallery from its west face faces you east. A mirror on that portal reflects the heading.',
    optional: [],
  },
  {
    id: 'the-machine',
    theme: 'copper',
    title: 'VI. The Machine',
    blurb: 'Two plates must be struck from the right side. Walk one route that strikes both, then reach the Exit.',
    rooms: [
      { id: 'intake', x: 0, y: 0, label: 'Intake' },
      { id: 'press', x: 3, y: 0, label: 'Press' },
      { id: 'sluice', x: 3, y: 3, label: 'Sluice' },
      { id: 'exit', x: 0, y: 3, label: 'Exit' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 5 },
    start: 'intake',
    plates: [
      { room: 'press', heading: 'S' },
      { room: 'sluice', heading: 'W' },
    ],
    goal: { kind: 'machine', to: 'exit' },
    hint: 'A plate lights when you arrive facing its direction. Entering the Press from the north faces south.',
    optional: [],
  },
  {
    id: 'sealed-wing',
    theme: 'verdigris',
    title: 'VII. The Sealed Wing',
    blurb: 'The east passage is locked. Something in the Pump room must be struck before it opens.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'pump', x: 0, y: 3, label: 'Pump' },
      { id: 'wing', x: 4, y: 0, label: 'Wing' },
    ],
    // Passages already in the architecture. The gate opens when plate 0 is lit.
    fixed: [
      { a: { room: 'hall', face: 'E' }, b: { room: 'wing', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'hall',
    plates: [{ room: 'pump', heading: 'N' }],
    goal: { kind: 'reach', to: 'wing' },
    hint: 'A gate stays shut until its plate is struck. The Pump plate lights when you enter from the south.',
    optional: [],
  },
  {
    id: 'hidden-stair',
    theme: 'ash',
    title: 'VIII. The Hidden Stair',
    blurb: 'A simple stair to the Upper floor. Some passages are only visible from a loop.',
    rooms: [
      { id: 'cellar', x: 0, y: 0, label: 'Cellar' },
      { id: 'stair', x: 0, y: 2, label: 'Stair' },
      { id: 'upper', x: 2, y: 2, label: 'Upper' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 4 },
    start: 'cellar',
    goal: { kind: 'reach', to: 'upper' },
    hint: 'Connect the stair to the upper floor. The house is larger than its plan.',
    optional: [
      {
        id: 'half-turn-loop',
        title: 'The Ninth Room',
        text: 'A loop that turns you half-way round opens a room that the plan never showed.',
        check: (s) => findCycles(s).some((c) => c.netTurns === 2),
      },
    ],
  },
  {
    id: 'revolving-house',
    theme: 'copper',
    title: 'IX. The Revolving House',
    blurb: 'The Drum turns each time you enter it. Its gate opens only while the Drum is lit.',
    rooms: [
      { id: 'lobby', x: 0, y: 0, label: 'Lobby' },
      { id: 'drum', x: 0, y: 3, label: 'Drum' },
      { id: 'stage', x: 4, y: 3, label: 'Stage' },
    ],
    fixed: [
      { a: { room: 'drum', face: 'E' }, b: { room: 'stage', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 2 },
    start: 'lobby',
    // A toggle: it starts lit, and every arrival from the north flips it. Entering
    // once turns it off; going back out and in again turns it on.
    plates: [{ room: 'drum', heading: 'S', mode: 'toggle', startsLit: true }],
    goal: { kind: 'reach', to: 'stage' },
    hint: 'Connect the Lobby to the Drum from the south. Entering the Drum flips it, so walk through the passage and back to change its state.',
    optional: [],
  },
  {
    id: 'the-orrery',
    theme: 'verdigris',
    title: 'X. The Orrery',
    blurb: 'A dial in the East only lights when you enter it from the south. Strike it, then reach the South Dial facing west.',
    rooms: [
      { id: 'north', x: 0, y: 0, label: 'North Dial' },
      { id: 'east', x: 3, y: 0, label: 'East Dial' },
      { id: 'south', x: 3, y: 3, label: 'South Dial' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'north',
    plates: [{ room: 'east', heading: 'N' }],
    goal: { kind: 'machine', to: 'south', heading: 'W' },
    hint: 'Enter the East Dial from its south face to face north. Leave it by the west face and you arrive at the South Dial facing west.',
    optional: [
      {
        id: 'turning-dial',
        title: 'A dial that turns the route',
        text: 'The loop you built turns you a quarter-circle. The orrery now moves on its own.',
        check: (s) => findCycles(s).some((c) => c.netTurns === 1),
      },
    ],
  },
  {
    id: 'the-cistern',
    theme: 'ash',
    title: 'XI. The Cistern',
    blurb: 'A shaft drops six units straight down, but the way in is locked. A lever on the ledge opens it.',
    rooms: [
      { id: 'surface', x: 0, y: 0, label: 'Surface' },
      { id: 'lever', x: 2, y: 2, label: 'Lever' },
      { id: 'cistern', x: 0, y: 6, label: 'Cistern' },
    ],
    // The shaft already exists: a gated passage that waits for the lever.
    fixed: [
      { a: { room: 'surface', face: 'S' }, b: { room: 'cistern', face: 'N' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'surface',
    plates: [{ room: 'lever', heading: 'W' }],
    goal: { kind: 'reach', to: 'cistern' },
    hint: 'The lever lights when you enter it from the east. Reach it from the surface, then take a passage from the lever down to the Cistern.',
    optional: [
      {
        id: 'six-fathoms',
        title: 'Six fathoms, one step',
        text: 'Once the shaft is open, the Cistern is one step from the Surface. The plan still shows it six units away.',
        check: (s) => {
          const plates = [{ room: 'lever', heading: 'W' }];
          if (!findRoute(s, 'surface', (t) => t.room === 'cistern', { plates })) return false;
          return dimensionReport(s).some((d) => d.contradictory && (d.a === 'cistern' || d.b === 'cistern'));
        },
      },
    ],
  },
  {
    id: 'reflecting-vault',
    theme: 'dusk',
    title: 'XII. The Reflecting Vault',
    blurb: 'The Mirror Room\'s plate is a toggle, and it only responds to a traveller who has been reflected. Reach the Treasury.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'mirror-room', x: 0, y: 3, label: 'Mirror Room' },
      { id: 'treasury', x: 3, y: 3, label: 'Treasury' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'hall',
    // Starts unlit. Entering from the east faces west; a mirror turns that to east.
    plates: [{ room: 'mirror-room', heading: 'E', mode: 'toggle', startsLit: false }],
    goal: { kind: 'machine', to: 'treasury' },
    hint: 'Entering the Mirror Room from the east faces west. A mirrored passage reflects that to east, which lights the plate.',
    optional: [
      {
        id: 'mirror-pair',
        title: 'A pair of mirrors',
        text: 'Your loop reflects space an odd number of times. The vault is its own reflection.',
        check: (s) => findCycles(s).some((c) => c.reflected),
      },
    ],
  },
  {
    id: 'lantern-court',
    theme: 'verdigris',
    title: 'XIII. The Lantern Court',
    blurb: 'The Lantern is lit only by a traveller who enters it from the west. Its gate to the Stair stays shut until then.',
    rooms: [
      { id: 'court', x: 0, y: 0, label: 'Court' },
      { id: 'lantern', x: 0, y: 3, label: 'Lantern' },
      { id: 'stair', x: 4, y: 0, label: 'Stair' },
      { id: 'roof', x: 4, y: 3, label: 'Roof' },
    ],
    fixed: [
      { a: { room: 'court', face: 'E' }, b: { room: 'stair', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'court',
    // Entering the Lantern from the west faces east, which lights it.
    plates: [{ room: 'lantern', heading: 'E' }],
    goal: { kind: 'machine', to: 'roof' },
    hint: 'Join the Court to the Lantern on the Lantern\'s west face. Strike it, step back out, cross the gate, then go south from the Stair to the Roof.',
    optional: [],
  },
  {
    id: 'spiral-cellar',
    theme: 'ash',
    title: 'XIV. The Spiral Cellar',
    blurb: 'Two plates, struck in order by one route. The Landing\'s plate is a toggle that only answers an arrival from the east.',
    rooms: [
      { id: 'cellar', x: 0, y: 0, label: 'Cellar' },
      { id: 'spiral', x: 0, y: 3, label: 'Spiral' },
      { id: 'landing', x: 3, y: 3, label: 'Landing' },
      { id: 'crown', x: 3, y: 0, label: 'Crown' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'cellar',
    plates: [
      { room: 'spiral', heading: 'E' },
      { room: 'landing', heading: 'N', mode: 'toggle', startsLit: false },
    ],
    goal: { kind: 'machine', to: 'crown' },
    hint: 'Enter the Spiral from the west, then leave it by its east face and enter the Landing from the south: that arrival faces north and flips the toggle.',
    optional: [],
  },
  {
    id: 'mirror-archive',
    theme: 'copper',
    title: 'XV. The Mirror Archive',
    blurb: 'The gate opens for the Stacks\' plate. The Vault\'s passage to the Archive reflects you, so you arrive facing west.',
    rooms: [
      { id: 'reading', x: 0, y: 0, label: 'Reading' },
      { id: 'stacks', x: 0, y: 3, label: 'Stacks' },
      { id: 'vault', x: 3, y: 3, label: 'Vault' },
      { id: 'archive', x: 3, y: 0, label: 'Archive' },
    ],
    fixed: [
      { a: { room: 'stacks', face: 'E' }, b: { room: 'vault', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'reading',
    plates: [{ room: 'stacks', heading: 'N' }],
    goal: { kind: 'machine', to: 'archive', heading: 'W' },
    hint: 'Enter the Stacks from the south so you face north, then take the gate east. From the Vault, a mirrored passage to the Archive\'s west face comes out facing west.',
    optional: [],
  },
  {
    id: 'the-drop',
    theme: 'slate',
    title: 'XVI. The Drop',
    blurb: 'The passage from the Vault to the Ledge is one way: you can fall through it, never climb back. Reach the Vault from below.',
    rooms: [
      { id: 'ledge', x: 0, y: 0, label: 'Ledge' },
      { id: 'cellar', x: 0, y: 3, label: 'Cellar' },
      { id: 'gallery', x: 3, y: 3, label: 'Gallery' },
      { id: 'vault', x: 3, y: 0, label: 'Vault' },
    ],
    // One way: crossing from the Vault end is allowed, from the Ledge end never.
    fixed: [
      { a: { room: 'vault', face: 'W' }, b: { room: 'ledge', face: 'E' }, oneWay: 'a' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 4 },
    start: 'ledge',
    // Entering the Gallery from the west faces east, which lights it.
    plates: [{ room: 'gallery', heading: 'E' }],
    goal: { kind: 'machine', to: 'vault', heading: 'N' },
    hint: 'The direct way is closed to you. Go south from the Ledge, east through the Gallery\'s west face, then north into the Vault.',
    optional: [
      {
        id: 'own-one-way',
        title: 'A passage of your own',
        text: 'You built a one-way passage yourself. Architecture is not the only thing that can fall.',
        check: (st) => [...st.portals.values()].some((q) => !q.fixed && q.oneWay != null),
      },
    ],
  },
  {
    id: 'the-wheel',
    theme: 'copper',
    title: 'XVII. The Wheel',
    blurb: 'The Wheel is struck from the north, so you arrive facing south. The Sink\'s toggle answers only an arrival from the east.',
    rooms: [
      { id: 'entry', x: 0, y: 0, label: 'Entry' },
      { id: 'wheel', x: 3, y: 0, label: 'Wheel' },
      { id: 'sink', x: 3, y: 3, label: 'Sink' },
      { id: 'crown', x: 0, y: 3, label: 'Crown' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'entry',
    plates: [
      { room: 'wheel', heading: 'S' },
      { room: 'sink', heading: 'W', mode: 'toggle', startsLit: false },
    ],
    goal: { kind: 'machine', to: 'crown' },
    hint: 'Enter the Wheel from the north, so you face south. Leave it by its east side and enter the Sink from the east, which flips its toggle. The Sink\'s west side leads to the Crown.',
    optional: [],
  },
  {
    id: 'two-keys',
    theme: 'slate',
    title: 'XVIII. Two Keys',
    blurb: 'The Vault has two gates, and each opens only for its own key. Strike both keys on one walk.',
    rooms: [
      { id: 'hall', x: 0, y: 0, label: 'Hall' },
      { id: 'keya', x: 3, y: 0, label: 'Key A' },
      { id: 'keyb', x: 0, y: 3, label: 'Key B' },
      { id: 'vault', x: 3, y: 3, label: 'Vault' },
    ],
    fixed: [
      { a: { room: 'keya', face: 'S' }, b: { room: 'vault', face: 'N' }, gate: 0 },
      { a: { room: 'keyb', face: 'E' }, b: { room: 'vault', face: 'W' }, gate: 1 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 4 },
    start: 'hall',
    plates: [
      { room: 'keya', heading: 'W' },
      { room: 'keyb', heading: 'N' },
    ],
    goal: { kind: 'machine', to: 'vault' },
    hint: 'Connect the Hall to Key A from the east, so you face west there. Connect it to Key B from the south, so you face north. Then walk: Key A, back to the Hall, Key B, and through the gate.',
    optional: [],
  },
  {
    id: 'the-stillwater',
    theme: 'verdigris',
    title: 'XIX. The Stillwater',
    blurb: 'The Dock\'s gate opens only once the Reeds are lit. Light them from the Pool, then cross.',
    rooms: [
      { id: 'pool', x: 0, y: 0, label: 'Pool' },
      { id: 'reeds', x: 0, y: 3, label: 'Reeds' },
      { id: 'bank', x: 3, y: 3, label: 'Bank' },
      { id: 'dock', x: 3, y: 0, label: 'Dock' },
    ],
    fixed: [
      { a: { room: 'pool', face: 'E' }, b: { room: 'dock', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 2 },
    start: 'pool',
    // Entering the Reeds from the west faces east, which lights the gate.
    plates: [{ room: 'reeds', heading: 'E' }],
    goal: { kind: 'machine', to: 'dock' },
    hint: 'Join the Pool to the Reeds on the Reeds\' west side. Strike them, step back into the Pool from the south, then cross the gate east.',
    optional: [],
  },
  {
    id: 'the-long-corridor',
    theme: 'ash',
    title: 'XX. The Long Corridor',
    blurb: 'The passage down from the Bank is one way. The last door must be mirrored to arrive facing east.',
    rooms: [
      { id: 'start', x: 0, y: 0, label: 'Start' },
      { id: 'turn', x: 3, y: 0, label: 'Turn' },
      { id: 'far', x: 3, y: 3, label: 'Far' },
      { id: 'end', x: 0, y: 3, label: 'End' },
    ],
    // Fixed: from Turn you may drop down to Far, but never climb back.
    fixed: [
      { a: { room: 'turn', face: 'S' }, b: { room: 'far', face: 'N' }, oneWay: 'a' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 4, maxPortals: 3 },
    start: 'start',
    plates: [],
    goal: { kind: 'machine', to: 'end', heading: 'E' },
    hint: 'Connect Start to Turn on Start\'s east side, then Far to End on Far\'s west side with a mirror: the mirror turns the arrival around to face east.',
    optional: [],
  },
  {
    id: 'the-freight',
    theme: 'ash',
    title: 'XXI. The Freight',
    blurb: 'Two crates, one depot. A crate is accepted only when it arrives facing north, so the route you build must turn it.',
    rooms: [
      { id: 'dock', x: 0, y: 0, label: 'Loading Dock' },
      { id: 'hall', x: 3, y: 0, label: 'Freight Hall' },
      { id: 'depot', x: 3, y: 3, label: 'Depot' },
    ],
    // The Dock's east door is a turning passage: whatever crosses it arrives in
    // the Hall turned a quarter-turn, so the crate must be turned again.
    fixed: [
      { a: { room: 'dock', face: 'E' }, b: { room: 'hall', face: 'W' }, transform: { turns: 1, mirror: false } },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'dock',
    cargo: [
      { room: 'dock', name: 'crate' },
      { room: 'hall', name: 'crate' },
    ],
    goal: { kind: 'deliver', to: 'depot', heading: 'N' },
    hint: 'Entering the Depot from its south face faces you north. Connect the Depot\'s south face to the Freight Hall\'s south face, then carry one crate in, go back for the other, and bring it in too.',
    optional: [],
  },
  {
    id: 'the-sealed-vault',
    theme: 'copper',
    title: 'XXII. The Sealed Vault',
    blurb: 'The gate to the Vault stays shut until one crate has reached the Depot. Deliver the first crate, then fetch the second from behind the gate.',
    rooms: [
      { id: 'yard', x: 0, y: 0, label: 'Yard' },
      { id: 'depot', x: 3, y: 0, label: 'Depot' },
      { id: 'vault', x: 3, y: 3, label: 'Vault' },
    ],
    // The gate between the Depot and the Vault opens once crate 1 is delivered.
    fixed: [
      { a: { room: 'depot', face: 'S' }, b: { room: 'vault', face: 'N' }, opensAfter: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 2 },
    start: 'yard',
    cargo: [
      { room: 'yard', name: 'crate' },
      { room: 'vault', name: 'crate' },
    ],
    goal: { kind: 'deliver', to: 'depot' },
    hint: 'Connect the Yard to the Depot first, and deliver the crate you start with. Only then will the gate to the Vault open.',
    optional: [],
  },
  {
    id: 'the-pad-room',
    theme: 'verdigris',
    title: 'XXIII. The Pad Room',
    blurb: 'A crate carried into the Pad room is set down there, and waits until you come back empty-handed. Bring both crates to the Depot.',
    rooms: [
      { id: 'yard', x: 0, y: 0, label: 'Yard' },
      { id: 'pad', x: 2, y: 2, label: 'Pad room' },
      { id: 'depot', x: 4, y: 0, label: 'Depot' },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 3 },
    start: 'yard',
    cargo: [
      { room: 'yard', name: 'crate' },
      { room: 'pad', name: 'crate' },
    ],
    pads: ['pad'],
    goal: { kind: 'deliver', to: 'depot' },
    hint: 'Link the Yard straight to the Depot, and deliver the crate you start with. Then go into the Pad room empty-handed to fetch the other crate, and bring it back.',
    optional: [],
  },
  {
    id: 'final-construction',
    theme: 'dusk',
    title: 'XXIV. Closing Construction',
    blurb: 'Every mechanic at once. Strike the Well plate, then reach the Apex facing north.',
    rooms: [
      { id: 'foundation', x: 0, y: 0, label: 'Foundation' },
      { id: 'well', x: 2, y: 2, label: 'Well' },
      { id: 'apex', x: 4, y: 0, label: 'Apex' },
    ],
    // A gate from the Well to the Apex. It opens with the Well plate, but
    // entering the Apex that way faces you east, not north.
    fixed: [
      { a: { room: 'well', face: 'E' }, b: { room: 'apex', face: 'W' }, gate: 0 },
    ],
    ruleset: { ...UNRESTRICTED, maxRooms: 3, maxPortals: 5 },
    start: 'foundation',
    plates: [{ room: 'well', heading: 'E' }],
    goal: { kind: 'machine', to: 'apex', heading: 'N' },
    hint: 'Enter the Well from the west to light its plate. A passage that enters the Apex from the north, with two quarter-turns, faces you north.',
    optional: [
      {
        id: 'closed-ring',
        title: 'The Closed Ring',
        text: 'Foundation, Well and Apex are joined in a single ring. Every room can be left and returned to.',
        check: (s) => findCycles(s).some((c) => c.rooms.length === 3),
      },
    ],
  },
];

// The campaign order and chapter grouping come from campaign.js. Each challenge
// takes its chapter's look (theme), its chapter number and a numeral in play order.
const ROMANS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX','XXXI','XXXII','XXXIII','XXXIV','XXXV','XXXVI','XXXVII','XXXVIII','XXXIX','XL'];
const BY_ID = new Map([...RAW, ...EXTRA].map((c) => [c.id, c]));
export const CHAPTERS = Object.freeze(ORDER.map((id, i) => {
  const raw = BY_ID.get(id);
  if (!raw) throw new Error(`Campaign names an unknown challenge ${id}`);
  const place = placeInChapter(id);
  return Object.freeze({
    ...raw,
    title: `${ROMANS[i]}. ${raw.title.replace(/^[IVXL]+\.\s*/, '')}`,
    theme: place.chapter.theme,
    discipline: place.chapter.no,
    inChapter: place.index,
  });
}));

export function chapterById(id) {
  return CHAPTERS.find((c) => c.id === id) ?? null;
}

// The structure a player starts a chapter with: its rooms and fixed passages.
export function chapterStructure(chapter) {
  const s = new Structure();
  for (const r of chapter.rooms) s.addRoom({ id: r.id, x: r.x, y: r.y, label: r.label, kind: r.kind, size: r.size });
  for (const f of chapter.fixed ?? []) {
    s.addPortal({ a: f.a.room, aFace: f.a.face, b: f.b.room, bFace: f.b.face, gate: f.gate ?? null, opensAfter: f.opensAfter ?? null, fixed: true, oneWay: f.oneWay ?? null, transform: f.transform });
  }
  return s;
}

// The predicate a traveller state must satisfy to meet the chapter's goal.
// Shared by the goal check and by route-finding, so the test and the walked
// route always agree. Returns null for goals that are not about a state
// (loops, which are checked structurally).
// The object rules a chapter gives the traveller: its plates, its cargo, and
// the depot the cargo must reach. Passed to every route search and replay, so
// the goal check, the walked route and the diagnosis all agree.
export function rulesFor(chapter) {
  const g = chapter.goal;
  return {
    plates: chapter.plates ?? [],
    cargo: chapter.cargo ?? [],
    pads: chapter.pads ?? [],
    depot: g?.kind === 'deliver' ? { room: g.to, heading: g.heading ?? null } : null,
  };
}

export function goalPredicate(chapter) {
  const g = chapter.goal;
  const plates = chapter.plates ?? [];
  const full = plates.length ? (1 << plates.length) - 1 : 0;
  const crates = chapter.cargo ?? [];
  const allDelivered = crates.length ? (1 << crates.length) - 1 : 0;
  switch (g.kind) {
    case 'deliver':
      if (!crates.length) return null; // nothing to deliver: no state can meet this goal
      return (t) => (t.delivered & allDelivered) === allDelivered;
    case 'reach':
    case 'shortcut':
      return (t) => t.room === g.to;
    case 'arrive':
      return (t) => t.room === g.to && t.heading === g.heading;
    case 'machine':
      return (t) => t.room === g.to
        && (t.lit & full) === full
        && (g.heading === undefined || t.heading === g.heading);
    default:
      return null;
  }
}

// Whether the structure satisfies a chapter's main goal.
export function goalSatisfied(structure, chapter) {
  const g = chapter.goal;
  if (g.kind === 'loop') return loopExists(structure, g.start);
  const pred = goalPredicate(chapter);
  if (!pred) return false;
  const route = findRoute(structure, chapter.start, pred, rulesFor(chapter));
  if (route === null) return false;
  if (g.kind === 'shortcut') return route.length <= g.maxSteps;
  return true;
}

// Which optional discoveries the structure currently satisfies.
export function discoveriesIn(structure, chapter) {
  return (chapter.optional ?? []).filter((d) => d.check(structure)).map((d) => d.id);
}

// A loop exists if some non-empty route leads from `room` back to `room`.
function loopExists(structure, room) {
  for (const face of ['N', 'E', 'S', 'W']) {
    const hit = structure.exit(room, face);
    if (!hit) continue;
    if (hit.room === room) return true;
    const route = findRoute(structure, hit.room, (t) => t.room === room);
    if (route !== null) return true;
  }
  return false;
}
