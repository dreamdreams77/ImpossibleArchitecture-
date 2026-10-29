import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, routeFor } from '../src/game.js';
import { chapterById, chapterStructure, goalSatisfied, rulesFor } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';
import { makeTraveller, step } from '../src/topology/traversal.js';
import { Structure } from '../src/topology/graph.js';
import { diagnose } from '../src/campaign/diagnose.js';
import { firstPersonModel, describeFirstPerson } from '../src/render/firstperson.js';
import { describeStructure } from '../src/topology/describe.js';

const join = (s, spec) => {
  const r = connect(s, { transform: { turns: 0, mirror: false }, ...spec });
  assert.equal(r.error, undefined, `connect failed: ${r.error}`);
  return r.structure;
};
const sealed = () => chapterById('the-sealed-vault');
const solved = () => join(chapterStructure(sealed()), { a: 'depot', aFace: 'N', b: 'yard', bFace: 'N' });

// A small structure: two rooms, one delivery gate between them.
function gatedPair() {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 2, y: 0 });
  s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W', opensAfter: 0, fixed: true });
  return s;
}

test('a delivery gate stays shut until its crate has been delivered', () => {
  const s = gatedPair();
  const t = makeTraveller('a', 'N', { cargo: [{ room: 'a' }], depot: { room: 'a' } });
  assert.equal(step(s, t, 'E'), null, 'shut before the crate is delivered');
  const open = { ...t, delivered: 1 };
  assert.equal(step(s, open, 'E')?.room, 'b', 'open once delivered');
});

test('the gate survives a round trip through serialisation', () => {
  const s = gatedPair();
  const back = Structure.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal([...back.portals.values()][0].opensAfter, 0);
});

test('addPortal refuses a delivery gate whose crate index is not one', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 2, y: 0 });
  assert.throws(() => s.addPortal({ a: 'a', aFace: 'E', b: 'b', bFace: 'W', opensAfter: -1 }), /crate index/);
});

test('the sealed vault is solved by one link to the Depot, and the Vault crate is delivered', () => {
  const c = sealed();
  const s = solved();
  assert.equal(goalSatisfied(s, c), true);
  const route = routeFor(s, c);
  assert.equal(route.delivered, 0b11);
  assert.ok(route.trail.includes('vault'), 'the second crate is fetched from behind the gate');
});

test('diagnosis explains a delivery gate that can never open in time', () => {
  // Crate 2 waits in room b behind a gate that opens once crate 1 is delivered. Crate 1
  // can only be delivered to room a, which needs the gate. Neither crate can arrive.
  const s = gatedPair();
  const chapter = {
    id: 'test-gate', start: 'a', hint: 'h', plates: [],
    cargo: [{ room: 'a' }, { room: 'b' }],
    goal: { kind: 'deliver', to: 'a' },
  };
  const d = diagnose(s, chapter);
  assert.ok(d.some((r) => /opens only once crate 1 is delivered/.test(r)), d.join(' | '));
});

test('the first-person wall says what a delivery gate waits for', () => {
  const s = gatedPair();
  const shut = firstPersonModel(s, { room: 'a', heading: 'E', lit: 0, delivered: 0 }, []);
  assert.equal(shut.walls.front.kind, 'shut');
  assert.match(describeFirstPerson(shut), /until crate 1 is delivered/);
  const open = firstPersonModel(s, { room: 'a', heading: 'E', lit: 0, delivered: 1 }, []);
  assert.equal(open.walls.front.kind, 'passage');
});

test('the description of a delivery gate names its crate', () => {
  const s = gatedPair();
  assert.match(describeStructure(s), /opens once crate 1 is delivered/);
});

test('completing a chapter flags it once, for the completion card', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.loadStructure(join(chapterStructure(chapterById('threshold')), { a: 'hall', aFace: 'E', b: 'vault', bFace: 'W' }), 'threshold');
  session.checkCompletion();
  assert.equal(session.progress.completed.includes('threshold'), true);
  assert.equal(session.justCompleted, 'threshold');
  session.justCompleted = null;
  session.checkCompletion();
  assert.equal(session.justCompleted, null, 'a chapter already completed does not flag again');
});
