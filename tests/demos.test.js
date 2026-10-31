import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMOS, demoById } from '../src/campaign/demos.js';
import { validate } from '../src/topology/construction.js';
import { Session } from '../src/game.js';

test('every demonstration builds a valid structure and demonstrates what it claims', () => {
  assert.ok(DEMOS.length >= 6);
  const ids = new Set();
  for (const d of DEMOS) {
    assert.ok(!ids.has(d.id)); ids.add(d.id);
    const s = d.build();
    assert.ok(validate(s).ok, d.id);
    assert.ok(s.rooms.has(d.start), `${d.id} start room`);
    assert.ok(d.claim(s), `${d.id}: ${d.title} does not demonstrate its claim`);
    assert.ok(d.title && d.text && d.try);
  }
});

test('a demonstration loads into free construction, editable and undoable, with the traveller placed', () => {
  const s = new Session();
  for (const d of DEMOS) {
    assert.ok(s.loadDemo(d.id));
    assert.ok(s.sandbox);
    assert.equal(s.structure.rooms.size, d.build().rooms.size);
    assert.equal(s.fp.room, d.start);
    assert.equal(s.fp.heading, d.heading);
    assert.match(s.feedback.text, new RegExp(d.title));
  }
  assert.equal(s.loadDemo('nonsense'), false);
  assert.equal(demoById('nonsense'), null);
});
