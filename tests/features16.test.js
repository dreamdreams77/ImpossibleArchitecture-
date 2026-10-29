import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { Structure, ROOM_SIZES } from '../src/topology/graph.js';
import { setRoomSize, turnRoom, connect } from '../src/topology/construction.js';
import { faceDir, faceAnchor, hitTest, roomHalf, ROOM_HALF } from '../src/render/geometry.js';
import { findRoute } from '../src/topology/traversal.js';
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

function twoRooms() {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  s.addRoom({ id: 'b', x: 3, y: 0 });
  const r = connect(s, { a: 'a', aFace: 'E', b: 'b', bFace: 'W', transform: { turns: 1, mirror: false } });
  assert.equal(r.error, undefined);
  return r.structure;
}

test('turning a room turns its faces clockwise, and four turns is the same room', () => {
  const room = { x: 0, y: 0, turn: 0 };
  assert.deepEqual(faceDir(room, 'N'), { x: 0, y: -1 });
  assert.deepEqual(faceDir({ ...room, turn: 1 }, 'N'), { x: 1, y: 0 }, 'N becomes E');
  assert.deepEqual(faceDir({ ...room, turn: 1 }, 'E'), { x: 0, y: 1 }, 'E becomes S');
  assert.deepEqual(faceDir({ ...room, turn: 2 }, 'N'), { x: 0, y: 1 }, 'two turns: N becomes S');
  assert.deepEqual(faceDir({ ...room, turn: 4 }, 'W'), { x: -1, y: 0 }, 'four turns: unchanged');
});

test('the face anchor follows the turn, and the size scales the anchor distance', () => {
  const turned = { x: 2, y: 2, turn: 1, size: 1 };
  const a = faceAnchor(turned, 'N');
  assert.ok(Math.abs(a.x - (2 + ROOM_HALF)) < 1e-9 && Math.abs(a.y - 2) < 1e-9);
  const big = faceAnchor({ x: 0, y: 0, turn: 0, size: 1.5 }, 'E');
  assert.ok(big.x > ROOM_HALF, 'a large room puts its east face further out');
});

test('a large room is hit further from its centre than a standard one', () => {
  const s = new Structure();
  s.addRoom({ id: 'big', x: 0, y: 0, size: 1.5 });
  s.addRoom({ id: 'std', x: 10, y: 0 });
  // (0.5, 0.5) is outside a standard room (half-size 0.42) but inside a large one (0.63).
  const hit = hitTest(s, 0.5, 0.5);
  assert.deepEqual(hit, { type: 'room', id: 'big' });
  assert.equal(roomHalf(s.rooms.get('big')), ROOM_HALF * 1.5);
  assert.equal(hitTest(s, 0.5, 0.5 + 10), null, 'a point beside the standard room misses it');
});

test('turning a room leaves its connections and every route exactly as they were', () => {
  const s = twoRooms();
  const before = JSON.stringify([...s.portals.values()]);
  const route = findRoute(s, 'a', (t) => t.room === 'b');
  const turned = turnRoom(s, 'a');
  assert.equal(turned.error, undefined);
  assert.equal(JSON.stringify([...turned.structure.portals.values()]), before);
  assert.deepEqual(findRoute(turned.structure, 'a', (t) => t.room === 'b'), route);
  assert.equal(turned.structure.rooms.get('a').turn, 1);
});

test('setRoomSize accepts the listed sizes and refuses others', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0 });
  assert.deepEqual([...ROOM_SIZES], [0.75, 1, 1.5]);
  assert.equal(setRoomSize(s, 'a', 1.5).structure.rooms.get('a').size, 1.5);
  assert.equal(setRoomSize(s, 'a', 3).error, 'BAD_SIZE');
  assert.throws(() => s.addRoom({ x: 0, y: 0, size: 2 }), /Unknown room size/);
});

test('size and turn survive a save, and an old save loads as standard and unturned', () => {
  const s = new Structure();
  s.addRoom({ id: 'a', x: 0, y: 0, size: 0.75, turn: 3 });
  const back = Structure.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(back.rooms.get('a').size, 0.75);
  assert.equal(back.rooms.get('a').turn, 3);
  const old = JSON.parse(JSON.stringify(s.toJSON()));
  for (const r of old.rooms) { delete r.size; delete r.turn; }
  const loaded = Structure.fromJSON(old).rooms.get('a');
  assert.equal(loaded.size, 1);
  assert.equal(loaded.turn, 0);
});

test('size and turn are undoable in a sandbox', () => {
  const session = new Session({ chapterId: 'threshold' });
  session.startSandbox();
  session.addRoomAt(0, 0);
  const id = session.selection.id;
  session.turnRoom(id);
  session.setRoomSize(id, 1.5);
  assert.equal(session.structure.rooms.get(id).turn, 1);
  assert.equal(session.structure.rooms.get(id).size, 1.5);
  session.undo();
  assert.equal(session.structure.rooms.get(id).size, 1);
  session.undo();
  assert.equal(session.structure.rooms.get(id).turn, 0);
});

test('the plan draws turned and resized rooms without error', () => {
  const session = new Session({ chapterId: 'threshold' });
  const shaped = turnRoom(setRoomSize(twoRooms(), 'a', 1.5).structure, 'a').structure;
  session.loadStructure(shaped, 'threshold');
  assert.doesNotThrow(() => drawPlan(stubContext(), { scale: 80, offsetX: 320, offsetY: 240 }, session, { width: 640, height: 480 }, 500));
});
