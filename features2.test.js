import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { Session } from '../src/game.js';
import { fitViewFor, transitionProgress, snapTo, DEFAULT_SCALE } from '../src/render/view.js';
import { describeFirstPerson, fpZoneFor } from '../src/render/firstperson.js';
import { connect, renameRoom, LABEL_LIMIT } from '../src/topology/construction.js';
import { describeStructure, describePortal } from '../src/topology/describe.js';
import { FACE_DIR, shorten, polygon } from '../src/render/util.js';

test('fit view centres the construction and keeps every room on screen', () => {
  const s = new Structure();
  s.addRoom({ x: -3, y: 0 });
  s.addRoom({ x: 5, y: 2 });
  const { scale, offsetX, offsetY } = fitViewFor(s, 800, 600);
  // Each room's screen position must sit inside the canvas.
  for (const r of s.rooms.values()) {
    const sx = r.x * scale + offsetX;
    const sy = r.y * scale + offsetY;
    assert.ok(sx > 0 && sx < 800, `x ${sx} on screen`);
    assert.ok(sy > 0 && sy < 600, `y ${sy} on screen`);
  }
  // The midpoint of the rooms lands at the centre.
  assert.equal(Math.round(1 * scale + offsetX), 400);
});

test('fit view clamps the scale for a single room and for a very wide spread', () => {
  const one = new Structure();
  one.addRoom({ x: 0, y: 0 });
  assert.equal(fitViewFor(one, 800, 600).scale, 120, 'a lone room is not blown up past the maximum');
  const wide = new Structure();
  wide.addRoom({ x: 0, y: 0 });
  wide.addRoom({ x: 500, y: 0 });
  assert.equal(fitViewFor(wide, 800, 600).scale, 40, 'a huge spread stops at the minimum');
});

test('fit view of an empty construction is the default framing', () => {
  assert.deepEqual(fitViewFor(new Structure(), 800, 600), { scale: DEFAULT_SCALE, offsetX: 400, offsetY: 300 });
});

test('transition progress is linear, clamped, and immediate with reduced motion', () => {
  assert.equal(transitionProgress(130, 260), 0.5);
  assert.equal(transitionProgress(-5, 260), 0);
  assert.equal(transitionProgress(900, 260), 1);
  assert.equal(transitionProgress(10, 260, true), 1, 'reduced motion skips the transition');
  assert.equal(transitionProgress(0, 0), 1);
});

test('field notes: each optional discovery, titled until found, with its text once found', () => {
  const session = new Session({ chapterId: 'the-drop' });
  let notes = session.fieldNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].found, false);
  assert.equal(notes[0].text, null);
  assert.equal(notes[0].title, 'A passage of your own');
  session.progress.discoveries.push('own-one-way');
  notes = session.fieldNotes();
  assert.equal(notes[0].found, true);
  assert.match(notes[0].text, /one-way/);
});

test('field notes are empty in free construction and in chapters with none', () => {
  const session = new Session({ chapterId: 'threshold' });
  assert.deepEqual(session.fieldNotes(), []);
  session.startSandbox();
  assert.deepEqual(session.fieldNotes(), []);
});

test('an edit during route playback ends the playback', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  session.pickFace('court', 'S'); session.pickFace('lantern', 'W');
  session.pickFace('stair', 'S'); session.pickFace('roof', 'N');
  session.testConstruction();
  session.fpPlayRoute();
  assert.ok(session.fpPlay);
  session.addRoomAt(9, 9);
  assert.equal(session.fpPlay, null);
});

test('shared drawing helpers: directions, label truncation, and both point shapes', () => {
  assert.deepEqual(FACE_DIR.E, [1, 0]);
  assert.equal(shorten('Cellar', 10), 'Cellar');
  assert.equal(shorten('Reflecting Vault', 8), 'Reflect…');
  const calls = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {},
    moveTo: (x, y) => calls.push(['m', x, y]), lineTo: (x, y) => calls.push(['l', x, y]) };
  polygon(ctx, [[1, 2], { x: 3, y: 4 }], '#000');
  assert.deepEqual(calls, [['m', 1, 2], ['l', 3, 4]]);
});

// ---- round 12: rename, description, attempts, snapping ----

test('renaming a room trims, collapses spaces, and limits length', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, label: 'Old' });
  const r = renameRoom(s, 'a', '   The   Long\tHall  ' + 'x'.repeat(40));
  const label = r.structure.rooms.get('a').label;
  assert.equal(label.length, LABEL_LIMIT);
  assert.ok(label.startsWith('The Long Hall'));
  assert.equal(s.rooms.get('a').label, 'Old', 'the input structure is untouched');
  assert.equal(renameRoom(s, 'missing', 'x').error, 'NO_ROOM');
});

test('the session renames the selected room and records feedback', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.renameRoom('hall', 'Gate');
  assert.equal(session.structure.rooms.get('hall').label, 'Gate');
  assert.equal(session.feedback.text, 'Room renamed.');
});

test('description: plain sentences for rooms and portals, with their transforms and gates', () => {
  const s = new Structure();
  s.addRoom({ id: 'hall', x: 0, y: 0, label: 'Hall' });
  s.addRoom({ id: 'vault', x: 2, y: 0, label: 'Vault' });
  const r = connect(s, { a: 'hall', aFace: 'E', b: 'vault', bFace: 'W', transform: { turns: 2, mirror: true } });
  const text = describeStructure(r.structure);
  assert.match(text, /2 rooms, 1 portal\./);
  assert.match(text, /Hall's east side joins Vault's west side \(a half turn, mirrored\)\./);
  const p = [...r.structure.portals.values()][0];
  assert.equal(describePortal(r.structure, { ...p, gate: 0, oneWay: 'b' }).includes('gated by plate 1'), true);
});

test('attempts: the chapter counts its tests, free construction does not', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.testConstruction();
  session.testConstruction();
  assert.equal(session.progress.attempts.threshold, 2);
  session.startSandbox();
  session.testConstruction();
  assert.equal(Object.keys(session.progress.attempts).length, 1);
});

test('snapping rounds to the step, and with no step keeps two decimals', () => {
  assert.equal(snapTo(1.3, 0.5), 1.5);
  assert.equal(snapTo(1.2, 0.5), 1);
  assert.equal(snapTo(1.2345, 0), 1.23);
  assert.equal(snapTo(-0.26, 0.5), -0.5);
});

// ---- round 13: progress reset, time, room cycling, screen reader, click zones ----

test('resetting progress clears completion, discoveries, attempts and time but keeps the construction', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.pickFace('hall', 'E'); session.pickFace('vault', 'W');
  session.testConstruction();
  session.addTime(5000);
  session.progress.completed.push('threshold');
  const before = session.structure.toJSON();
  session.resetProgress();
  assert.deepEqual(session.progress, { completed: [], discoveries: [], attempts: {}, time: {} });
  assert.deepEqual(session.structure.toJSON(), before);
});

test('time is recorded per chapter, not in free construction', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.addTime(1500);
  session.addTime(500);
  session.addTime(-10);
  assert.equal(session.progress.time.threshold, 2000);
  session.startSandbox();
  session.addTime(9000);
  assert.equal(Object.keys(session.progress.time).length, 1);
});

test('room selection steps through rooms in id order and wraps around', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  assert.equal(session.selectRoomStep(1), true);
  assert.equal(session.selection.id, 'court');
  session.selectRoomStep(1);
  assert.equal(session.selection.id, 'lantern');
  session.selectRoomStep(-1);
  session.selectRoomStep(-1);
  assert.equal(session.selection.id, 'stair', 'stepping back from the first room wraps to the last');
});

test('the first-person description names what is ahead and to each side', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  const text = describeFirstPerson({
    label: 'Court', heading: 'N',
    walls: {
      front: { kind: 'wall' },
      left: { kind: 'passage', label: 'Hall', arrival: 'E' },
      right: { kind: 'shut', label: 'Stair', gate: 0 },
    },
  });
  assert.equal(text, 'In Court, facing N. Ahead, a solid wall. On the left, a passage to Hall, arriving facing E. On the right, a gate to Stair, shut until plate 1 is lit.');
  assert.equal(describeFirstPerson(null), 'No room to stand in.');
});

test('clicks in the outer thirds turn, the middle walks forward', () => {
  assert.equal(fpZoneFor(100, 900), 'left');
  assert.equal(fpZoneFor(450, 900), 'forward');
  assert.equal(fpZoneFor(850, 900), 'right');
  assert.equal(fpZoneFor(10, 0), 'forward');
});

import { isoProject, modelLayout } from '../src/render/model3d.js';

test('isometric projection: x goes right-down, y goes left-down, height lifts', () => {
  const origin = isoProject(0, 0, 0, 100);
  assert.deepEqual(origin, { x: 0, y: 0 });
  assert.ok(isoProject(1, 0, 0, 100).x > 0 && isoProject(1, 0, 0, 100).y > 0);
  assert.ok(isoProject(0, 1, 0, 100).x < 0 && isoProject(0, 1, 0, 100).y > 0);
  assert.ok(isoProject(0, 0, 1, 100).y < 0, 'height moves a point up the screen');
});

test('model layout centres the construction and keeps every room on the canvas', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 4, y: 0 });
  s.addRoom({ id: 'c', x: 0, y: 4 });
  const { pts } = modelLayout(s, 600, 400);
  for (const p of pts.values()) {
    assert.ok(p.x > 0 && p.x < 600, `x ${p.x}`);
    assert.ok(p.y > 0 && p.y < 400, `y ${p.y}`);
  }
  const xs = [...pts.values()].map((p) => p.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(mid - 300) < 1, 'centred horizontally');
});

import { cueSpec, CUE_NAMES, Sound } from '../src/ui/sound.js';

test('every sound cue has notes with sensible pitch, timing and shape', () => {
  for (const name of CUE_NAMES) {
    const notes = cueSpec(name);
    assert.ok(notes.length > 0, `${name} has notes`);
    for (const n of notes) {
      assert.ok(n.freq > 50 && n.freq < 2000, `${name} pitch ${n.freq}`);
      assert.ok(n.dur > 0 && n.at >= 0, `${name} timing`);
      assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(n.type), `${name} waveform`);
    }
  }
  assert.deepEqual(cueSpec('no-such-cue'), []);
});

test('sound is off until enabled, and the choice is remembered', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = new Sound(storage);
  assert.equal(first.enabled, false);
  first.setEnabled(true);
  assert.equal(new Sound(storage).enabled, true);
  first.setEnabled(false);
  assert.equal(new Sound(storage).enabled, false);
});

test('playing a cue with sound off does nothing and does not throw', () => {
  const sound = new Sound(null);
  assert.doesNotThrow(() => sound.play('goal'));
  assert.equal(sound.ctx, null, 'no audio context is made while muted');
});
