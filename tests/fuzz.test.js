// Random sessions: drive the Session with arbitrary sequences of player intents
// and check the invariants that must hold after every step. Seeded, so a failure
// is reproducible from the seed printed in the message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { CHAPTERS } from '../src/campaign/chapters.js';
import { FACES } from '../src/topology/graph.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s, seed, step, op) {
  const where = `seed ${seed} step ${step} after ${op}`;
  const faceUse = new Set();
  for (const p of s.structure.portals.values()) {
    assert.ok(s.structure.rooms.has(p.a.room), `${where}: portal ${p.id} a-end room missing`);
    assert.ok(s.structure.rooms.has(p.b.room), `${where}: portal ${p.id} b-end room missing`);
    assert.ok(FACES.includes(p.a.face) && FACES.includes(p.b.face), `${where}: bad face`);
    for (const end of [p.a, p.b]) {
      const key = `${end.room}.${end.face}`;
      assert.ok(!faceUse.has(key), `${where}: face ${key} carries two portals`);
      faceUse.add(key);
    }
    assert.ok(p.oneWay === null || p.oneWay === undefined || p.oneWay === 'a' || p.oneWay === 'b', `${where}: bad oneWay`);
    assert.ok(p.transform.turns >= 0 && p.transform.turns <= 3, `${where}: turns out of range`);
  }
  // The walker, if there is one, stands in a room that exists; with no rooms
  // there is no walker at all.
  const walker = s.fpEnsure();
  if (s.structure.rooms.size === 0) assert.equal(walker, null, `${where}: walker with no rooms`);
  else assert.ok(s.structure.rooms.has(walker.room), `${where}: walker in a missing room`);
  if (s.fpPlay) {
    assert.ok(s.fpPlay.index <= s.fpPlay.faces.length, `${where}: playback index past its route`);
  }
  for (const room of s.structure.rooms.values()) {
    assert.ok(typeof room.label === 'string' && room.label.length <= 24, `${where}: label out of bounds`);
  }
  for (const [id, n] of Object.entries(s.progress.attempts)) {
    assert.ok(Number.isInteger(n) && n >= 0, `${where}: attempts for ${id} is ${n}`);
  }
  for (const [id, ms] of Object.entries(s.progress.time)) {
    assert.ok(Number.isFinite(ms) && ms >= 0, `${where}: time for ${id} is ${ms}`);
  }
  if (s.selection?.type === 'portal') {
    assert.ok(s.structure.portals.has(s.selection.id), `${where}: selected portal missing`);
  }
  if (s.selection?.type === 'room') {
    assert.ok(s.structure.rooms.has(s.selection.id), `${where}: selected room missing`);
  }
}

const SEEDS = 60;
const STEPS = 250;

test('random sessions never break the structure or throw', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rng(seed * 7919);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const s = new Session({ chapterId: pick(CHAPTERS).id });
    for (let step = 0; step < STEPS; step++) {
      const rooms = [...s.structure.rooms.keys()];
      const portals = [...s.structure.portals.keys()];
      const ops = [
        ['addRoomAt', () => s.addRoomAt(Math.round(r() * 8 - 4), Math.round(r() * 8 - 4))],
        ['pickFace', () => rooms.length && s.pickFace(pick(rooms), pick(FACES))],
        ['selectRoom', () => rooms.length && s.selectRoom(pick(rooms))],
        ['selectPortal', () => portals.length && s.selectPortal(pick(portals))],
        ['beginRetarget', () => s.beginRetarget(r() < 0.5 ? 'a' : 'b')],
        ['rotate', () => s.rotateSelectedPortal()],
        ['mirror', () => s.mirrorSelectedPortal()],
        ['oneWay', () => s.cycleOneWay()],
        ['moveRoom', () => rooms.length && s.moveRoom(pick(rooms), Math.round(r() * 8 - 4), Math.round(r() * 8 - 4))],
        ['delete', () => s.deleteSelection()],
        ['undo', () => s.undo()],
        ['redo', () => s.redo()],
        ['test', () => s.testConstruction()],
        ['fpStart', () => s.startFirstPerson()],
        ['fpTurn', () => s.fpTurn(r() < 0.5 ? 'left' : 'right')],
        ['fpForward', () => s.fpForward()],
        ['fpPlay', () => s.fpPlayRoute()],
        ['fpTick', () => s.fpPlayTick()],
        ['hint', () => s.nextHint()],
        ['rename', () => rooms.length && s.renameRoom(pick(rooms), ' spaced  '.repeat(Math.floor(r() * 6)) + 'Label')],
        ['describe', () => typeof s.describe() === 'string'],
        ['time', () => s.addTime(Math.round(r() * 5000))],
        ['roomStep', () => s.selectRoomStep(r() < 0.5 ? 1 : -1)],
        ['resetProgress', () => (r() < 0.05 ? s.resetProgress() : null)],
        ['chapter', () => (r() < 0.1 ? s.loadChapter(pick(CHAPTERS).id) : r() < 0.1 ? s.startSandbox() : null)],
        ['escape', () => { s.pendingFace = null; s.retarget = null; s.selection = null; }],
      ];
      const [name, run] = pick(ops);
      run();
      checkInvariants(s, seed, step, name);
    }
  }
});
