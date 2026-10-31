import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, chapterById, chapterStructure, goalSatisfied, discoveriesIn, rulesFor } from '../src/campaign/chapters.js';
import { DISCIPLINES, ORDER, disciplineOf, placeInChapter, endingFor } from '../src/campaign/campaign.js';
import { connect, validate } from '../src/topology/construction.js';
import { findRoute } from '../src/topology/traversal.js';
import { Structure } from '../src/topology/graph.js';

// Joins two faces under the chapter's own ruleset, failing loudly if the rules refuse it.
function build(id, links) {
  const c = chapterById(id);
  let s = chapterStructure(c);
  for (const [a, aFace, b, bFace, turns = 0, mirror = false] of links) {
    const r = connect(s, { a, aFace, b, bFace, transform: { turns, mirror } }, c.ruleset);
    assert.ok(!r.error, `${id}: ${a}.${aFace}-${b}.${bFace} refused: ${r.error}`);
    s = r.structure;
  }
  return { c, s };
}
const solves = (id, links) => { const { c, s } = build(id, links); return goalSatisfied(s, c); };

test('the campaign is six chapters and at least thirty challenges, each placed exactly once', () => {
  assert.equal(DISCIPLINES.length, 6);
  assert.ok(CHAPTERS.length >= 30, `${CHAPTERS.length} challenges`);
  assert.equal(new Set(ORDER).size, ORDER.length, 'no challenge appears twice');
  for (const d of DISCIPLINES) assert.ok(d.challenges.length >= 4, `${d.title} has ${d.challenges.length}`);
  for (const c of CHAPTERS) {
    assert.ok(disciplineOf(c.id), `${c.id} belongs to a chapter`);
    assert.equal(c.discipline, disciplineOf(c.id).no);
  }
  assert.equal(CHAPTERS.at(-1).id, 'the-last-construction', 'the last construction ends the campaign');
});

test('every challenge starts unsolved, has a hint, and names real rooms', () => {
  for (const c of CHAPTERS) {
    const s = chapterStructure(c);
    assert.equal(goalSatisfied(s, c), false, `${c.id} must not start solved`);
    assert.ok(c.hint && c.blurb, `${c.id} needs a blurb and a hint`);
    const ids = new Set(c.rooms.map((r) => r.id));
    assert.ok(ids.has(c.start), `${c.id} starts in a real room`);
    for (const p of c.plates ?? []) assert.ok(ids.has(p.room), `${c.id} plate room`);
    for (const x of c.cargo ?? []) assert.ok(ids.has(x.room), `${c.id} crate room`);
    for (const f of c.ruleset.forbiddenLinks ?? []) assert.ok(ids.has(f.a) && ids.has(f.b), `${c.id} forbidden link`);
    assert.ok(validate(s, c.ruleset).ok, `${c.id} starts as a valid construction`);
  }
});

test('The Two Doors: sealed faces are refused; going round by the north and south faces solves it', () => {
  const c = chapterById('the-two-doors');
  const direct = connect(chapterStructure(c), { a: 'hall', aFace: 'E', b: 'annex', bFace: 'W' }, c.ruleset);
  assert.equal(direct.error, 'FORBIDDEN_FACE');
  const skip = connect(chapterStructure(c), { a: 'hall', aFace: 'N', b: 'vault', bFace: 'N' }, c.ruleset);
  assert.equal(skip.error, 'FORBIDDEN_LINK', 'the Hall and the Vault may not be joined directly');
  assert.ok(solves('the-two-doors', [['hall', 'N', 'annex', 'N'], ['annex', 'S', 'vault', 'S']]));
  assert.ok(solves('the-two-doors', [['hall', 'S', 'annex', 'S'], ['annex', 'N', 'vault', 'N']]), 'a second, different solution');
  assert.equal(solves('the-two-doors', [['hall', 'N', 'annex', 'N']]), false, 'half a route is not a route');
});

test('The Far Wing: one doorway or two both solve it; three rooms in a chain do not', () => {
  assert.ok(solves('the-far-wing', [['w', 'E', 'e', 'W']]));
  assert.ok(solves('the-far-wing', [['w', 'E', 'c', 'W'], ['c', 'E', 'e', 'W']]));
  assert.equal(solves('the-far-wing', [['w', 'E', 'b', 'W'], ['b', 'E', 'c', 'W']]), false);
  const { c, s } = build('the-far-wing', [['w', 'E', 'e', 'W']]);
  assert.deepEqual(discoveriesIn(s, c), ['one-step']);
});

test('The Turned Nave: only a quarter turn returns you facing east; the other turns cannot', () => {
  assert.ok(solves('the-turned-nave', [['nave', 'N', 'nave', 'S', 1]]), 'a single self-loop with a quarter turn');
  assert.ok(solves('the-turned-nave', [['nave', 'N', 'transept', 'S'], ['transept', 'N', 'nave', 'S', 1]]), 'the same turn spread over two passages');
  for (const turns of [0, 2]) {
    assert.equal(solves('the-turned-nave', [['nave', 'N', 'nave', 'S', turns]]), false, `${turns} turns only ever faces north or south`);
  }
  const { c, s } = build('the-turned-nave', [['nave', 'N', 'nave', 'S', 1]]);
  assert.deepEqual(discoveriesIn(s, c), ['quarter-turned']);
});

test('The Cupboard: five rooms drawn inside one footprint must be chained, and the discovery notices', () => {
  const chain = [['cupboard', 'N', 'hall', 'S'], ['hall', 'N', 'gallery', 'S'], ['gallery', 'N', 'court', 'S'], ['court', 'N', 'ballroom', 'S']];
  assert.ok(solves('the-cupboard', chain));
  assert.equal(solves('the-cupboard', chain.slice(0, 3)), false, 'the Ballroom is not reached');
  // Skipping the Court reaches the Ballroom but leaves a plate dark.
  assert.equal(solves('the-cupboard', [['cupboard', 'N', 'hall', 'S'], ['hall', 'N', 'gallery', 'S'], ['gallery', 'N', 'ballroom', 'S']]), false);
  const { c, s } = build('the-cupboard', chain);
  assert.deepEqual(discoveriesIn(s, c), ['house-in-a-cupboard']);
  assert.ok(s.apparentDistance('cupboard', 'ballroom') < 1, 'every room really is drawn inside one footprint');
});

test('The Seam: the forbidden link is refused, and the hub with a returning passage solves it', () => {
  const c = chapterById('the-seam');
  const direct = connect(chapterStructure(c), { a: 'warm', aFace: 'E', b: 'cool', bFace: 'W' }, c.ruleset);
  assert.equal(direct.error, 'FORBIDDEN_LINK');
  assert.match(direct.violations[0].message, /never be joined/);
  // Two passages, each doing two jobs: strike a plate, and return to the Seam facing south.
  const links = [['seam', 'N', 'warm', 'N', 3], ['seam', 'E', 'cool', 'N', 1]];
  assert.ok(solves('the-seam', links));
  assert.deepEqual(discoveriesIn(...(() => { const r = build('the-seam', links); return [r.s, r.c]; })()), []);
  // A mirror on the warm passage still solves it (a reflected twist turns the same way back) and earns the discovery.
  const mirrored = [['seam', 'N', 'warm', 'N', 3, true], links[1]];
  assert.ok(solves('the-seam', mirrored));
  assert.deepEqual(discoveriesIn(...(() => { const r = build('the-seam', mirrored); return [r.s, r.c]; })()), ['two-routes']);
  // The same faces with no turn or mirror light the plates but leave you facing the wrong way.
  assert.equal(solves('the-seam', [['seam', 'N', 'warm', 'N'], ['seam', 'E', 'cool', 'N']]), false);
  // One passage cannot serve both wings.
  assert.equal(solves('the-seam', [links[0]]), false);
});

test('The Ring Hall: sealed north faces force the quarter-turn ring; the ring is found as a loop', () => {
  const c = chapterById('the-ring-hall');
  assert.equal(connect(chapterStructure(c), { a: 'gate', aFace: 'E', b: 'east', bFace: 'N' }, c.ruleset).error, 'FORBIDDEN_FACE');
  const ring = [['gate', 'E', 'east', 'W', 1], ['east', 'S', 'south', 'W', 1], ['south', 'S', 'west', 'S', 2], ['west', 'W', 'gate', 'W']];
  assert.ok(solves('the-ring-hall', ring));
  // The same ring with no turns lights nothing: every arrival faces east or north.
  assert.equal(solves('the-ring-hall', ring.map(([a, af, b, bf]) => [a, af, b, bf, 0])), false);
  const { c: cc, s } = build('the-ring-hall', ring);
  assert.deepEqual(discoveriesIn(s, cc), ['the-whole-ring']);
});

test('The Last Construction: the twist, the gate and both crates, solved by a fold or by a long lap', () => {
  const start = [['foundation', 'E', 'well', 'W', 1], ['well', 'E', 'forge', 'W'], ['forge', 'S', 'cellar', 'N']];
  const back = ['depot', 'N', 'foundation', 'S'];
  const fold = ['loft', 'N', 'loft', 'W'];
  // The ring: four passages, and the traveller laps the building until both crates have come round.
  const ring = build('the-last-construction', [...start, back]);
  assert.ok(goalSatisfied(ring.s, ring.c));
  assert.deepEqual(discoveriesIn(ring.s, ring.c), ['long-lap']);
  // The fold: five passages, and the Loft sets down and picks up in one place.
  const both = build('the-last-construction', [...start, fold, back]);
  assert.ok(goalSatisfied(both.s, both.c));
  assert.deepEqual(discoveriesIn(both.s, both.c), ['loft-loop']);
  // Neither the fold nor the way back: the first crate is stranded in the Loft.
  assert.equal(solves('the-last-construction', start), false);
  // The fold alone delivers the first crate, but the Depot leads nowhere: the second is never fetched.
  assert.equal(solves('the-last-construction', [...start, fold]), false);
  // The Well entered without a quarter turn faces east, not south: the gate stays shut.
  assert.equal(solves('the-last-construction', [['foundation', 'E', 'well', 'W', 0], ...start.slice(1), back]), false);
  // Entering the Well through its north face also faces south: a different, valid solution.
  assert.ok(solves('the-last-construction', [['foundation', 'N', 'well', 'N', 0], ...start.slice(1), back]));
  // The stair and the gate are architecture: they cannot be removed.
  const fixed = [...ring.s.portals.values()].filter((p) => p.fixed);
  assert.equal(fixed.length, 2);
  assert.ok(fixed.every((p) => p.oneWay === 'a'));
  // The walk really does carry both crates, round the building more than once.
  const route = findRoute(ring.s, ring.c.start, (t) => t.delivered === 3, rulesFor(ring.c));
  assert.ok(route && route.length >= 20, `a long route (${route?.length})`);
});

test('every chapter has an intro and an outro, and the ending is built from the player\'s structure', () => {
  for (const d of DISCIPLINES) assert.ok(d.intro.length > 40 && d.outro.length > 3, d.title);
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, label: 'Alpha' });
  s.addRoom({ id: 'b', x: 9, y: 0, label: 'Beta' });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { turns: 1, mirror: true } });
  s.addPortal({ a: 'a', aFace: 'N', b: 'a', bFace: 'S' });
  const e = endingFor(s, { completed: [], discoveries: ['x', 'y'] }, { timeMs: 3 * 60000 });
  const text = e.lines.join(' ');
  assert.match(text, /2 rooms and 2 passages/);
  assert.match(text, /1 of them turn/);
  assert.match(text, /1 reflect/);
  assert.match(text, /1 lead a room back into itself/);
  assert.match(text, /Alpha and Beta are drawn 9\.0 units apart/);
  assert.match(text, /2 hidden things/);
  assert.match(text, /3 minutes/);
});

test('place in chapter reports the position within the run', () => {
  assert.deepEqual({ i: placeInChapter('threshold').index, of: placeInChapter('threshold').of }, { i: 1, of: 5 });
  assert.equal(placeInChapter('the-last-construction').index, 7);
  assert.equal(placeInChapter('nonsense'), null);
});

test('deleting a room named by a discovery or a goal never crashes the checks', async () => {
  const { Session } = await import('../src/game.js');
  for (const c of CHAPTERS) {
    const s = new Session({ chapterId: c.id });
    for (const id of [...s.structure.rooms.keys()]) { s.selectRoom(id); s.deleteSelection(); }
    assert.doesNotThrow(() => { s.testConstruction(); s.fpEnsure(); s.fpForward(); discoveriesIn(s.structure, c); goalSatisfied(s.structure, c); }, c.id);
  }
});
