// End-to-end check of the running game in headless Chromium: boots the app,
// walks the first chapter's card and solution, visits the 3D walk and model, and
// opens the ending. Needs the game served (npm start) and Playwright installed.
//
//   npm start &
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/e2e.mjs
//
// Exits non-zero on any console error or failed expectation.

const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath);
const url = process.env.GAME_URL ?? 'http://localhost:8080/';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.setDefaultTimeout(120000);
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
const expect = (cond, what) => { if (!cond) problems.push(`expected: ${what}`); console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); };

await page.goto(`${url}?quality=low`);
await page.waitForSelector('#menu-new');
await page.click('#menu-new');
await page.waitForSelector('#chapter-card:not([hidden])');
expect((await page.textContent('#card-title')) === 'The First Connection', 'chapter 1 opens with its card');
await page.click('#card-begin');

await page.evaluate(() => { const s = window.__session; s.pickFace('hall', 'E'); s.pickFace('vault', 'W'); });
await page.waitForSelector('#complete:not([hidden])');
expect(await page.evaluate(() => window.__session.progress.completed.includes('threshold')), 'connecting the first doorway completes the challenge');
await page.click('#complete-stay');

expect(await page.evaluate(() => !!window.__ia?.gl), 'the 3D renderer initialised');
await page.click('#view-first');
await page.waitForTimeout(1500);
expect(await page.evaluate(() => !document.getElementById('gl').hidden), 'the 3D walk is showing');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__session.fp.room === 'vault', null, { timeout: 30000 }).catch(() => {});
expect(await page.evaluate(() => window.__session.fp.room === 'vault'), 'walking east carries the traveller into the Vault');

await page.click('#view-model');
await page.waitForTimeout(1500);
expect(await page.evaluate(() => !document.getElementById('gl-model-controls').hidden), 'the architect\'s model is showing');

// One architecture, three views: edits made through the plan's operations and the model's face picking
// must show up at once in the 3D world (rooms, doorways at both ends of every passage, one arc each).
const views = () => page.evaluate(() => {
  const s = window.__session; const w = window.__ia.gl.world;
  window.__ia.render(); window.__ia.gl.paint?.(performance.now());
  return { rooms: s.structure.rooms.size, portals: s.structure.portals.size, worldRooms: w.rooms.size, doors: w.doors.size, arcs: w.linkGroup.children.filter((c) => c.userData.portalId).length };
});
await page.click('#menu-sandbox').catch(() => {});
await page.evaluate(() => { window.__ia.session.loadDemo('distant-neighbours'); window.__ia.setView('model'); window.__ia.render(); });
await page.waitForTimeout(800);
let v = await views();
expect(v.worldRooms === v.rooms && v.doors === 2 * v.portals && v.arcs === v.portals, `a loaded building appears whole in the model (${JSON.stringify(v)})`);
await page.evaluate(() => { const s = window.__ia.session; s.addRoomAt(8, 8); const id = [...s.structure.rooms.keys()].pop(); s.pickFace(id, 'N'); s.pickFace('lodge', 'S'); window.__ia.render(); });
await page.waitForTimeout(800);
v = await views();
expect(v.rooms === 6 && v.portals === 5 && v.worldRooms === v.rooms && v.doors === 2 * v.portals && v.arcs === v.portals, `a room and a passage added in one view appear in the others (${JSON.stringify(v)})`);
await page.evaluate(() => { const s = window.__ia.session; s.undo(); s.undo(); window.__ia.render(); });
await page.waitForTimeout(800);
v = await views();
expect(v.rooms === 5 && v.portals === 4 && v.worldRooms === 5 && v.arcs === 4, `undo takes them away everywhere (${JSON.stringify(v)})`);

await page.evaluate(() => { window.__ia.showEnding(); });
await page.waitForSelector('#ending-screen:not([hidden])');
expect((await page.textContent('#ending-heading')) === 'It stands.', 'the ending opens');

await browser.close();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('end-to-end checks passed');
