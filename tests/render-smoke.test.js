// Render smoke test: draws random constructions through every renderer with a
// stub canvas context. It cannot check pixels, but it catches the crashes that
// unusual geometry can cause (missing labels, empty views, odd transforms).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { CHAPTERS } from '../src/campaign/chapters.js';
import { FACES } from '../src/topology/graph.js';
import { drawPlan, drawGraph } from '../src/render/draw.js';
import { drawSightCards, sightCardModel } from '../src/render/sightcards.js';
import { drawFirstPerson, firstPersonModel, describeFirstPerson } from '../src/render/firstperson.js';
import { drawModel } from '../src/render/model3d.js';
import { themeFor } from '../src/render/themes.js';

// A context that accepts any drawing call and any property assignment.
function stubContext() {
  const noop = () => {};
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  };
  return new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }) }, handler);
}

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

test('every renderer draws random constructions without throwing', () => {
  const size = { width: 640, height: 480 };
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed * 104729);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const session = new Session({ chapterId: pick(CHAPTERS).id });
    for (let step = 0; step < 60; step++) {
      const rooms = [...session.structure.rooms.keys()];
      if (rooms.length && r() < 0.6) session.pickFace(pick(rooms), pick(FACES));
      if (r() < 0.1) session.addRoomAt(Math.round(r() * 6 - 3), Math.round(r() * 6 - 3));
      if (r() < 0.1) session.startFirstPerson();
      if (r() < 0.2) session.fpForward();
      if (r() < 0.2) session.fpTurn(r() < 0.5 ? 'left' : 'right');
    }
    const s = session.structure;
    const theme = themeFor(session.themeName);
    const ctx = stubContext();
    assert.doesNotThrow(() => drawPlan(ctx, { scale: 80, offsetX: 320, offsetY: 240 }, session, size, 500), `plan seed ${seed}`);
    assert.doesNotThrow(() => drawGraph(ctx, s, session.selection, size, session.themeName), `graph seed ${seed}`);
    assert.doesNotThrow(() => drawModel(ctx, s, size, theme, 300), `model seed ${seed}`);
    for (const id of s.rooms.keys()) {
      assert.doesNotThrow(() => drawSightCards(ctx, sightCardModel(s, id), { width: 300, height: 240 }, theme, id), `sight ${id} seed ${seed}`);
    }
    const walker = session.fpEnsure();
    const model = walker ? firstPersonModel(s, walker, session.chapter?.plates ?? []) : null;
    assert.doesNotThrow(() => drawFirstPerson(ctx, model, size, theme, 200, { progress: 0.5 }), `first person seed ${seed}`);
    assert.doesNotThrow(() => describeFirstPerson(model), `description seed ${seed}`);
    assert.doesNotThrow(() => session.describe(), `describe seed ${seed}`);
  }
});
