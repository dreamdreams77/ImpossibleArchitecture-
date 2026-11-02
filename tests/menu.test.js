import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLandingMenuView } from '../src/ui/menu.js';

test('the title and its subpages use the clean landing backdrop', () => {
  assert.equal(isLandingMenuView('title', 'title'), true);
  for (const view of ['chapters', 'settings', 'atlas', 'demos', 'tutorial', 'credits']) {
    assert.equal(isLandingMenuView(view, 'title'), true, `${view} opened from title`);
  }
});

test('pause stays over the live game, including after visiting the title menu', () => {
  assert.equal(isLandingMenuView('pause', 'title'), false);
  assert.equal(isLandingMenuView('pause', 'pause'), false);
  for (const view of ['chapters', 'settings', 'atlas', 'demos', 'tutorial', 'credits']) {
    assert.equal(isLandingMenuView(view, 'pause'), false, `${view} opened from pause`);
  }
});

test('returning to the title from pause restores the landing backdrop', () => {
  assert.equal(isLandingMenuView('title', 'pause'), true);
});
