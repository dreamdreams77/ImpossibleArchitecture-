import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterById, chapterStructure, goalSatisfied } from '../src/campaign/chapters.js';
import { connect, setOneWay } from '../src/topology/construction.js';
import { diagnose } from '../src/campaign/diagnose.js';
import { routeFor } from '../src/game.js';

const join = (s, spec) => {
  const r = connect(s, spec);
  assert.equal(r.error, undefined, `connect failed: ${r.error}`);
  return r.structure;
};

test('The Stillwater: Reeds lit from the west, back to the Pool, then the gate east', () => {
  const c = chapterById('the-stillwater');
  let s = chapterStructure(c);
  s = join(s, { a: 'pool', aFace: 'S', b: 'reeds', bFace: 'W' });   // Reeds faces E: lit
  assert.equal(goalSatisfied(s, c), true);
  assert.deepEqual(routeFor(s, c).trail, ['pool', 'reeds', 'pool', 'dock']);
});

test('The Stillwater: the Reeds entered from the north stay dark, and the gate stays shut', () => {
  const c = chapterById('the-stillwater');
  let s = chapterStructure(c);
  s = join(s, { a: 'pool', aFace: 'S', b: 'reeds', bFace: 'N' });   // Reeds faces S
  assert.equal(goalSatisfied(s, c), false);
  assert.ok(diagnose(s, c).some((r) => /plate is shut by a gate/.test(r) || /face E in Reeds/.test(r)), diagnose(s, c).join(' | '));
});

test('The Long Corridor: with the mirror on the last door the end is reached facing east, reflected', () => {
  const c = chapterById('the-long-corridor');
  let s = chapterStructure(c);
  s = join(s, { a: 'start', aFace: 'E', b: 'turn', bFace: 'W' });
  s = join(s, { a: 'far', aFace: 'W', b: 'end', bFace: 'W', transform: { mirror: true } });
  assert.equal(goalSatisfied(s, c), true);
  assert.equal(routeFor(s, c).headings.at(-1), 'E');
});

test('The Long Corridor: without the mirror the end is reached unreflected, and the goal is not met', () => {
  const c = chapterById('the-long-corridor');
  let s = chapterStructure(c);
  s = join(s, { a: 'start', aFace: 'E', b: 'turn', bFace: 'W' });
  s = join(s, { a: 'far', aFace: 'W', b: 'end', bFace: 'W' });
  assert.equal(goalSatisfied(s, c), false);
  assert.ok(diagnose(s, c).some((r) => /own reflection/.test(r)), diagnose(s, c).join(' | '));
});

test('The Long Corridor: the fixed one-way drop from Turn to Far cannot be climbed back', () => {
  const c = chapterById('the-long-corridor');
  const s = chapterStructure(c);
  assert.equal(s.exit('far', 'N').blocked, true);
  assert.equal(s.exit('turn', 'S').blocked, false);
});

test('a player one-way passage is still settable on a corridor built from the chapter', () => {
  const c = chapterById('the-long-corridor');
  let s = join(chapterStructure(c), { a: 'start', aFace: 'E', b: 'turn', bFace: 'W' });
  const pid = [...s.portals.values()].find((p) => !p.fixed).id;
  assert.equal(setOneWay(s, pid, 'a').error, undefined);
});
