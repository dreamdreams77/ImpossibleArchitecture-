import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure, ROOM_KINDS } from '../src/topology/graph.js';
import { setRoomKind } from '../src/topology/construction.js';
import { drawPlan } from '../src/render/draw.js';

function stubContext() {
  const noop = () => {};
  const target = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
}

test('a new room is a chamber unless it says otherwise', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const b = s.addRoom({ x: 2, y: 0, kind: 'atrium' });
  assert.equal(s.rooms.get(a).kind, 'chamber');
  assert.equal(s.rooms.get(b).kind, 'atrium');
  assert.deepEqual([...ROOM_KINDS], ['chamber', 'corridor', 'atrium', 'cellar']);
});

test('an unknown room kind is refused when a room is made', () => {
  const s = new Structure();
  assert.throws(() => s.addRoom({ x: 0, y: 0, kind: 'tower' }), /Unknown room kind/);
});

test('setRoomKind changes the kind and refuses an unknown one, leaving the structure alone', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0 });
  const r = setRoomKind(s, a, 'cellar');
  assert.equal(r.error, undefined);
  assert.equal(r.structure.rooms.get(a).kind, 'cellar');
  assert.equal(s.rooms.get(a).kind, 'chamber', 'the original is untouched');
  const bad = setRoomKind(s, a, 'tower');
  assert.equal(bad.error, 'BAD_KIND');
  assert.equal(bad.structure, s);
});

test('changing a room kind is undoable in a sandbox', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(0, 0);
  const id = session.selection.id;
  session.setRoomKind(id, 'corridor');
  assert.equal(session.structure.rooms.get(id).kind, 'corridor');
  session.undo();
  assert.equal(session.structure.rooms.get(id).kind, 'chamber');
});

test('the kind survives a save, and an old save without one loads as a chamber', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, kind: 'corridor' });
  const back = Structure.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(back.rooms.get('a').kind, 'corridor');

  const old = JSON.parse(JSON.stringify(s.toJSON()));
  for (const r of old.rooms) delete r.kind;
  assert.equal(Structure.fromJSON(old).rooms.get('a').kind, 'chamber');
});

test('every room kind draws in the plan without error', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  for (const kind of ROOM_KINDS) {
    session.addRoomAt(Math.random() * 10 - 5, Math.random() * 10 - 5);
    session.setRoomKind(session.selection.id, kind);
  }
  assert.doesNotThrow(() => drawPlan(stubContext(), { scale: 80, offsetX: 320, offsetY: 240 }, session, { width: 640, height: 480 }, 500));
});
