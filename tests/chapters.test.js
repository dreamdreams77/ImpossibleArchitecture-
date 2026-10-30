import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { connect, reshapePortal, setOneWay } from '../src/topology/construction.js';
import { CHAPTERS, chapterById, chapterStructure, goalSatisfied, discoveriesIn } from '../src/campaign/chapters.js';
import { Session, routeFor } from '../src/game.js';
import { replay } from '../src/topology/traversal.js';

function build(chapter) {
  const s = new Structure();
  for (const r of chapter.rooms) s.addRoom({ id: r.id, x: r.x, y: r.y, label: r.label });
  return s;
}

function join(s, spec) {
  const r = connect(s, spec);
  assert.equal(r.error, undefined, `connect failed: ${r.error} ${r.message ?? ''}`);
  return r.structure;
}

test('every chapter references only rooms it declares', () => {
  for (const c of CHAPTERS) {
    const ids = new Set(c.rooms.map((r) => r.id));
    assert.ok(ids.has(c.start), `${c.id}: start`);
    if (c.goal.to) assert.ok(ids.has(c.goal.to), `${c.id}: goal.to`);
    for (const p of c.plates ?? []) assert.ok(ids.has(p.room), `${c.id}: plate room`);
    for (const d of c.optional ?? []) assert.equal(typeof d.check, 'function');
  }
});

test('the machine: a route that strikes both plates, then reaches the exit', () => {
  const c = chapterById('the-machine');
  let s = build(c);
  s = join(s, { a: 'intake', aFace: 'E', b: 'press', bFace: 'N' });   // arrive Press facing S: plate 1
  s = join(s, { a: 'press', aFace: 'E', b: 'sluice', bFace: 'E' });   // arrive Sluice facing W: plate 2
  s = join(s, { a: 'sluice', aFace: 'W', b: 'exit', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), true);
});

test('the machine: striking only one plate is not enough', () => {
  const c = chapterById('the-machine');
  let s = build(c);
  s = join(s, { a: 'intake', aFace: 'E', b: 'press', bFace: 'N' });
  s = join(s, { a: 'press', aFace: 'S', b: 'exit', bFace: 'N' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the machine: plates must be struck on a single route, not separately', () => {
  const c = chapterById('the-machine');
  let s = build(c);
  // Press plate is reachable from Intake; Sluice plate is reachable from Exit.
  // But no single route passes both, so the goal must fail.
  s = join(s, { a: 'intake', aFace: 'E', b: 'press', bFace: 'N' });
  s = join(s, { a: 'exit', aFace: 'E', b: 'sluice', bFace: 'W' });
  s = join(s, { a: 'sluice', aFace: 'E', b: 'press', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), true, 'this route does pass both plates');
  const separate = join(build(c), { a: 'intake', aFace: 'S', b: 'exit', bFace: 'N' });
  assert.equal(goalSatisfied(separate, c), false);
});

test('mirrored gallery: the second portal must reflect to face west', () => {
  const c = chapterById('mirrored-gallery');
  let s = build(c);
  s = join(s, { a: 'atrium', aFace: 'E', b: 'wing', bFace: 'W' });
  s = join(s, { a: 'wing', aFace: 'E', b: 'gallery', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), false, 'unmirrored arrival faces east');
  const pid = [...s.portals.values()].find((p) => p.a.room === 'wing').id;
  s = reshapePortal(s, pid, { mirror: true }).structure;
  assert.equal(goalSatisfied(s, c), true);
});

test('mirror-gallery-loop discovery appears only when a loop reflects space', () => {
  const c = chapterById('returning-hall');
  let s = build(c);
  s = join(s, { a: 'gallery', aFace: 'N', b: 'gallery', bFace: 'S' });
  assert.deepEqual(discoveriesIn(s, c), []);
  const pid = [...s.portals.keys()][0];
  s = reshapePortal(s, pid, { mirror: true }).structure;
  assert.deepEqual(discoveriesIn(s, c), ['mirror-gallery-loop']);
});

test('hidden stair: reaching the upper floor is the goal, the half-turn loop is hidden', () => {
  const c = chapterById('hidden-stair');
  let s = build(c);
  s = join(s, { a: 'cellar', aFace: 'S', b: 'stair', bFace: 'N' });
  s = join(s, { a: 'stair', aFace: 'E', b: 'upper', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), true);
  assert.deepEqual(discoveriesIn(s, c), []);
});

test('hidden stair: a triangle whose portals total two quarter-turns reveals the Ninth Room', () => {
  const c = chapterById('hidden-stair');
  let s = build(c);
  s = join(s, { a: 'cellar', aFace: 'S', b: 'stair', bFace: 'N' });
  s = join(s, { a: 'stair', aFace: 'E', b: 'upper', bFace: 'W' });
  s = join(s, { a: 'upper', aFace: 'N', b: 'cellar', bFace: 'E' });
  const pid = [...s.portals.values()].find((p) => p.a.room === 'upper').id;
  s = reshapePortal(s, pid, { turns: 2 }).structure;
  assert.deepEqual(discoveriesIn(s, c), ['half-turn-loop']);
});

test('session: solving the machine through the UI completes it and keeps progress', () => {
  const s = new Session({ chapterId: 'the-machine' });
  s.pickFace('intake', 'E'); s.pickFace('press', 'N');
  s.pickFace('press', 'E'); s.pickFace('sluice', 'E');
  s.pickFace('sluice', 'W'); s.pickFace('exit', 'E');
  assert.ok(s.progress.completed.includes('the-machine'));
});

// Atlas entries share the list; the chapter's own discoveries are what this test is about.
const own = (p) => p.discoveries.filter((d) => !d.startsWith('atlas:'));
test('session: discoveries are recorded once and survive a reload of progress', () => {
  const s = new Session({ chapterId: 'returning-hall' });
  s.pickFace('gallery', 'N'); s.pickFace('gallery', 'S');
  s.selectPortal([...s.structure.portals.keys()][0]);
  s.mirrorSelectedPortal();
  assert.deepEqual(own(s.progress), ['mirror-gallery-loop']);
  s.mirrorSelectedPortal();
  s.mirrorSelectedPortal();
  assert.deepEqual(own(s.progress), ['mirror-gallery-loop'], 'not duplicated');
  const reloaded = new Session({ chapterId: 'returning-hall', progress: s.progress });
  assert.deepEqual(own(reloaded.progress), ['mirror-gallery-loop']);
});

test('session analysis reports loops and reachable distances', () => {
  const s = new Session({ chapterId: 'returning-hall' });
  s.pickFace('gallery', 'N'); s.pickFace('gallery', 'S');
  const a = s.analysis();
  assert.equal(a.loops.length, 1);
  assert.equal(a.loops[0].length, 1);
});

test('the finale: light the Well, then enter the Apex from the north with two quarter-turns', () => {
  const c = chapterById('final-construction');
  let s = chapterStructure(c);
  s = join(s, { a: 'foundation', aFace: 'S', b: 'well', bFace: 'W' });   // Well entered from W: faces E, plate lit
  s = join(s, { a: 'well', aFace: 'N', b: 'apex', bFace: 'N', transform: { turns: 2 } }); // Apex entered from N: faces N
  assert.equal(goalSatisfied(s, c), true);
});

test('the finale: reaching the Apex through the gate faces east, not north', () => {
  const c = chapterById('final-construction');
  let s = chapterStructure(c);
  s = join(s, { a: 'foundation', aFace: 'S', b: 'well', bFace: 'W' });
  // The fixed gate from Well to Apex is passable now, but arrives facing east.
  assert.equal(goalSatisfied(s, c), false);
});

test('the finale: a north passage without the Well plate does not satisfy the goal', () => {
  const c = chapterById('final-construction');
  let s = chapterStructure(c);
  s = join(s, { a: 'foundation', aFace: 'E', b: 'apex', bFace: 'S' });
  s = join(s, { a: 'well', aFace: 'N', b: 'apex', bFace: 'N', transform: { turns: 2 } });
  assert.equal(goalSatisfied(s, c), false, 'the Well plate was never struck');
});

test('the finale: the Closed Ring discovery needs a three-room cycle', () => {
  const c = chapterById('final-construction');
  let s = chapterStructure(c);
  s = join(s, { a: 'foundation', aFace: 'S', b: 'well', bFace: 'W' });
  s = join(s, { a: 'well', aFace: 'N', b: 'apex', bFace: 'N', transform: { turns: 2 } });
  assert.deepEqual(discoveriesIn(s, c), []);
  s = join(s, { a: 'apex', aFace: 'S', b: 'foundation', bFace: 'E' });
  assert.deepEqual(discoveriesIn(s, c), ['closed-ring']);
});

test('goal check and walked route agree for every chapter, unsolved and solved', () => {
  for (const c of CHAPTERS) {
    const s = chapterStructure(c);
    if (c.goal.kind !== 'loop') {
      assert.equal(goalSatisfied(s, c), routeFor(s, c) !== null, `${c.id}: unsolved agreement`);
    }
  }
  // The finale's solved state must also yield a route that ends at the Apex facing north.
  const f = chapterById('final-construction');
  let s = chapterStructure(f);
  s = join(s, { a: 'foundation', aFace: 'S', b: 'well', bFace: 'W' });
  s = join(s, { a: 'well', aFace: 'N', b: 'apex', bFace: 'N', transform: { turns: 2 } });
  const r = routeFor(s, f);
  assert.ok(r, 'a route exists');
  assert.equal(r.trail.at(-1), 'apex');
  assert.equal(r.headings.at(-1), 'N');
});

test('the Revolving House: without a passage to the Drum, the stage is unreachable', () => {
  const c = chapterById('revolving-house');
  assert.equal(goalSatisfied(chapterStructure(c), c), false);
});

test('the Revolving House: walking the passage out and back in lights the Drum and opens the gate', () => {
  const c = chapterById('revolving-house');
  let s = chapterStructure(c);
  s = join(s, { a: 'lobby', aFace: 'S', b: 'drum', bFace: 'N' });
  // Enter the Drum from the north once: it turns off, so the gate is shut.
  // The route must pass the Drum twice (off, then on) before leaving by the gate.
  assert.equal(goalSatisfied(s, c), true);
  const r = routeFor(s, c);
  assert.deepEqual(r.faces, ['S', 'N', 'S', 'E']);
});

test('the Revolving House: the Drum starts lit, so a single entry leaves the gate shut', () => {
  const c = chapterById('revolving-house');
  const s = join(chapterStructure(c), { a: 'lobby', aFace: 'S', b: 'drum', bFace: 'N' });
  // Walking straight in and out through the gate is impossible: the gate needs the Drum lit.
  assert.equal(replay(s, 'lobby', ['S', 'E'], { plates: c.plates }).ok, false);
});

test('the Orrery: enter the East Dial from the south, leave west, arrive at the South Dial facing west', () => {
  const c = chapterById('the-orrery');
  let s = chapterStructure(c);
  s = join(s, { a: 'north', aFace: 'E', b: 'east', bFace: 'S' });
  s = join(s, { a: 'east', aFace: 'W', b: 'south', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), true);
  assert.deepEqual(routeFor(s, c).faces, ['E', 'W']);
});

test('the Orrery: entering the East Dial from the north does not light it', () => {
  const c = chapterById('the-orrery');
  let s = chapterStructure(c);
  s = join(s, { a: 'north', aFace: 'S', b: 'east', bFace: 'N' });
  s = join(s, { a: 'east', aFace: 'W', b: 'south', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Orrery: a built loop with a quarter-turn reveals The Dial that turns the route', () => {
  const c = chapterById('the-orrery');
  let s = chapterStructure(c);
  s = join(s, { a: 'north', aFace: 'E', b: 'east', bFace: 'S' });
  s = join(s, { a: 'east', aFace: 'W', b: 'south', bFace: 'E' });
  assert.deepEqual(discoveriesIn(s, c), []);
  s = join(s, { a: 'south', aFace: 'N', b: 'north', bFace: 'W', transform: { turns: 1 } });
  assert.deepEqual(discoveriesIn(s, c), ['turning-dial']);
});

test('the Cistern: the shaft is shut without the lever', () => {
  const c = chapterById('the-cistern');
  assert.equal(goalSatisfied(chapterStructure(c), c), false);
});

test('the Cistern: lever from the east, then down from the lever', () => {
  const c = chapterById('the-cistern');
  let s = chapterStructure(c);
  s = join(s, { a: 'surface', aFace: 'E', b: 'lever', bFace: 'E' });
  s = join(s, { a: 'lever', aFace: 'S', b: 'cistern', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), true);
  assert.deepEqual(discoveriesIn(s, c), ['six-fathoms']);
});

test('the Cistern: the discovery needs the shaft to be passable, not just the plan to lie', () => {
  const c = chapterById('the-cistern');
  // The plan already contradicts itself (gated shaft), but the discovery is only
  // earned once the shaft is actually passable.
  assert.deepEqual(discoveriesIn(chapterStructure(c), c), []);
});

test('the Reflecting Vault: a mirrored passage from the east lights the plate and opens the way', () => {
  const c = chapterById('reflecting-vault');
  let s = chapterStructure(c);
  s = join(s, { a: 'hall', aFace: 'E', b: 'mirror-room', bFace: 'E', transform: { mirror: true } });
  s = join(s, { a: 'mirror-room', aFace: 'S', b: 'treasury', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), true);
});

test('the Reflecting Vault: the same passage without a mirror does not light the plate', () => {
  const c = chapterById('reflecting-vault');
  let s = chapterStructure(c);
  s = join(s, { a: 'hall', aFace: 'E', b: 'mirror-room', bFace: 'E' });
  s = join(s, { a: 'mirror-room', aFace: 'S', b: 'treasury', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Reflecting Vault: a loop with one mirror reveals the mirror-pair discovery', () => {
  const c = chapterById('reflecting-vault');
  let s = chapterStructure(c);
  s = join(s, { a: 'hall', aFace: 'E', b: 'mirror-room', bFace: 'E', transform: { mirror: true } });
  assert.deepEqual(discoveriesIn(s, c), [], 'a single passage is not a loop');
  // A second passage with no mirror closes the loop with odd reflection parity.
  s = join(s, { a: 'hall', aFace: 'S', b: 'mirror-room', bFace: 'N' });
  assert.deepEqual(discoveriesIn(s, c), ['mirror-pair']);
});

test('chapter data is consistent: gates name real plates, numbering runs in order, ids are unique', () => {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV', 'XXXVI'];
  const ids = new Set();
  CHAPTERS.forEach((c, i) => {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.equal(c.title.split('.')[0], romans[i], `${c.id} is numbered ${c.title.split('.')[0]}, expected ${romans[i]}`);
    for (const f of c.fixed ?? []) {
      if (f.gate !== null && f.gate !== undefined) {
        assert.ok(f.gate < (c.plates ?? []).length, `${c.id}: gate ${f.gate} has no plate`);
      }
    }
  });
});

test('the Lantern Court: the Lantern lights from the west, the gate then opens to the Roof', () => {
  const c = chapterById('lantern-court');
  let s = chapterStructure(c);
  s = join(s, { a: 'court', aFace: 'S', b: 'lantern', bFace: 'W' });   // entered from W: faces E, lit
  s = join(s, { a: 'stair', aFace: 'S', b: 'roof', bFace: 'N' });
  assert.equal(goalSatisfied(s, c), true);
  const r = routeFor(s, c);
  assert.equal(r.trail.at(-1), 'roof');
});

test('the Lantern Court: entering the Lantern from the north faces south and does not light it', () => {
  const c = chapterById('lantern-court');
  let s = chapterStructure(c);
  s = join(s, { a: 'court', aFace: 'S', b: 'lantern', bFace: 'N' });
  s = join(s, { a: 'stair', aFace: 'S', b: 'roof', bFace: 'N' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Lantern Court: without the Lantern, the gate stays shut to the Roof', () => {
  const c = chapterById('lantern-court');
  let s = chapterStructure(c);
  s = join(s, { a: 'stair', aFace: 'S', b: 'roof', bFace: 'N' });
  assert.equal(routeFor(s, c), null);
});

test('the Spiral Cellar: Spiral from the west, then Landing from the south, then Crown', () => {
  const c = chapterById('spiral-cellar');
  let s = chapterStructure(c);
  s = join(s, { a: 'cellar', aFace: 'S', b: 'spiral', bFace: 'W' });   // Spiral faces E: lit
  s = join(s, { a: 'spiral', aFace: 'E', b: 'landing', bFace: 'S' });  // Landing faces N: toggle on
  s = join(s, { a: 'landing', aFace: 'E', b: 'crown', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), true);
  assert.equal(routeFor(s, c).trail.at(-1), 'crown');
});

test('the Spiral Cellar: entering the Landing from the north leaves the toggle off', () => {
  const c = chapterById('spiral-cellar');
  let s = chapterStructure(c);
  s = join(s, { a: 'cellar', aFace: 'S', b: 'spiral', bFace: 'W' });
  s = join(s, { a: 'spiral', aFace: 'E', b: 'landing', bFace: 'N' });  // Landing faces S: no toggle
  s = join(s, { a: 'landing', aFace: 'E', b: 'crown', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Mirror Archive: the Stacks plate, the gate, and a reflected passage arrive facing west', () => {
  const c = chapterById('mirror-archive');
  let s = chapterStructure(c);
  s = join(s, { a: 'reading', aFace: 'S', b: 'stacks', bFace: 'S' });   // Stacks faces N: plate lit
  s = join(s, { a: 'vault', aFace: 'N', b: 'archive', bFace: 'W', transform: { mirror: true } });
  assert.equal(goalSatisfied(s, c), true);
  assert.equal(routeFor(s, c).headings.at(-1), 'W');
});

test('the Mirror Archive: without the mirror the Archive is reached facing east', () => {
  const c = chapterById('mirror-archive');
  let s = chapterStructure(c);
  s = join(s, { a: 'reading', aFace: 'S', b: 'stacks', bFace: 'S' });
  s = join(s, { a: 'vault', aFace: 'N', b: 'archive', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Mirror Archive: the gate stays shut until the Stacks plate is struck', () => {
  const c = chapterById('mirror-archive');
  let s = chapterStructure(c);
  s = join(s, { a: 'vault', aFace: 'N', b: 'archive', bFace: 'W', transform: { mirror: true } });
  assert.equal(routeFor(s, c), null);
});


test('the Drop: the one-way passage cannot be crossed from the Ledge', () => {
  const c = chapterById('the-drop');
  const s = chapterStructure(c);
  assert.equal(s.exit('ledge', 'E').blocked, true);
  assert.equal(s.exit('vault', 'W').blocked, false);
});

test('the Drop: south, east through the Gallery, then north into the Vault facing north', () => {
  const c = chapterById('the-drop');
  let s = chapterStructure(c);
  s = join(s, { a: 'ledge', aFace: 'S', b: 'cellar', bFace: 'N' });
  s = join(s, { a: 'cellar', aFace: 'E', b: 'gallery', bFace: 'W' });   // Gallery faces E: lit
  s = join(s, { a: 'gallery', aFace: 'N', b: 'vault', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), true);
  assert.equal(routeFor(s, c).headings.at(-1), 'N');
});

test('the Drop: entering the Gallery from the north leaves it dark', () => {
  const c = chapterById('the-drop');
  let s = chapterStructure(c);
  s = join(s, { a: 'ledge', aFace: 'S', b: 'cellar', bFace: 'N' });
  s = join(s, { a: 'cellar', aFace: 'E', b: 'gallery', bFace: 'S' });  // entered from the south: faces N, dark
  s = join(s, { a: 'gallery', aFace: 'N', b: 'vault', bFace: 'S' });
  assert.equal(goalSatisfied(s, c), false);
});

test('the Drop: falling from the Vault to the Ledge is allowed', () => {
  const c = chapterById('the-drop');
  const s = chapterStructure(c);
  assert.equal(replay(s, 'vault', ['W']).ok, true);
  assert.equal(replay(s, 'ledge', ['E']).ok, false);
});

test('one-way: a player-built passage can be set and cleared, and blocks the reverse walk', () => {
  const s0 = new Structure();
  s0.addRoom({ id: 'x', x: 0, y: 0 });
  s0.addRoom({ id: 'y', x: 1, y: 0 });
  let s = join(s0, { a: 'x', aFace: 'E', b: 'y', bFace: 'W' });
  const pid = [...s.portals.keys()][0];
  const set = setOneWay(s, pid, 'a');
  assert.equal(set.error, undefined);
  s = set.structure;
  assert.equal(replay(s, 'x', ['E']).ok, true);
  assert.equal(replay(s, 'y', ['W']).ok, false);
  const cleared = setOneWay(s, pid, null).structure;
  assert.equal(replay(cleared, 'y', ['W']).ok, true);
  assert.equal(setOneWay(s, pid, 'z').error, 'BAD_ONEWAY');
});

test('one-way passages survive a save and a reload', () => {
  const c = chapterById('the-drop');
  const s = chapterStructure(c);
  const copy = Structure.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(copy.exit('ledge', 'E').blocked, true);
});
