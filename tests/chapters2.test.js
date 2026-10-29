import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterById, chapterStructure, goalSatisfied } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';
import { diagnose } from '../src/campaign/diagnose.js';
import { routeFor } from '../src/game.js';

const join = (s, spec) => {
  const r = connect(s, spec);
  assert.equal(r.error, undefined, `connect failed: ${r.error}`);
  return r.structure;
};

test('The Wheel: north into the Wheel, east into the Sink, west out to the Crown', () => {
  const c = chapterById('the-wheel');
  let s = chapterStructure(c);
  s = join(s, { a: 'entry', aFace: 'E', b: 'wheel', bFace: 'N' });   // Wheel faces S: lit
  s = join(s, { a: 'wheel', aFace: 'E', b: 'sink', bFace: 'E' });    // Sink faces W: toggle on
  s = join(s, { a: 'sink', aFace: 'W', b: 'crown', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), true);
  assert.equal(routeFor(s, c).trail.at(-1), 'crown');
});

test('The Wheel: entering the Sink from the north leaves its toggle off', () => {
  const c = chapterById('the-wheel');
  let s = chapterStructure(c);
  s = join(s, { a: 'entry', aFace: 'E', b: 'wheel', bFace: 'N' });
  s = join(s, { a: 'wheel', aFace: 'E', b: 'sink', bFace: 'N' });   // Sink faces S: no toggle
  s = join(s, { a: 'sink', aFace: 'W', b: 'crown', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), false);
  assert.ok(diagnose(s, c).some((r) => /face W in Sink/.test(r)), diagnose(s, c).join(' | '));
});

test('The Wheel: entering the Wheel from the south faces north and leaves the latch dark', () => {
  const c = chapterById('the-wheel');
  let s = chapterStructure(c);
  s = join(s, { a: 'entry', aFace: 'E', b: 'wheel', bFace: 'S' });   // Wheel faces N
  s = join(s, { a: 'wheel', aFace: 'E', b: 'sink', bFace: 'E' });
  s = join(s, { a: 'sink', aFace: 'W', b: 'crown', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), false);
});

test('Two Keys: both keys struck on one walk open both gates to the Vault', () => {
  const c = chapterById('two-keys');
  let s = chapterStructure(c);
  s = join(s, { a: 'hall', aFace: 'E', b: 'keya', bFace: 'E' });    // Key A faces W
  s = join(s, { a: 'hall', aFace: 'S', b: 'keyb', bFace: 'S' });    // Key B faces N
  assert.equal(goalSatisfied(s, c), true);
  assert.deepEqual(routeFor(s, c).trail.slice(-3), ['hall', 'keyb', 'vault']);
});

test('Two Keys: one key alone leaves the Vault shut, and diagnosis names the other key', () => {
  const c = chapterById('two-keys');
  let s = chapterStructure(c);
  s = join(s, { a: 'hall', aFace: 'E', b: 'keya', bFace: 'E' });
  assert.equal(goalSatisfied(s, c), false);
  assert.ok(diagnose(s, c).some((r) => /face N in Key B/.test(r)), diagnose(s, c).join(' | '));
});

test('Two Keys: both gates are fixed architecture', () => {
  const c = chapterById('two-keys');
  const s = chapterStructure(c);
  assert.equal([...s.portals.values()].filter((p) => p.fixed).length, 2);
});
