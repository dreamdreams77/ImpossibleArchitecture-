// Generates the screenshots in docs/screenshots from the running game.
//
// The images are produced by driving the real application in headless Chromium,
// not by hand-made mockups. Requirements:
//   1. A running server:  npm start  (default http://localhost:8080)
//   2. Playwright available. Either install it (npm i -D playwright) or point
//      PLAYWRIGHT_MODULE at its index.mjs.
//
// Usage: node tools/capture-screenshots.mjs

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = process.env.BASE_URL ?? 'http://localhost:8080';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function open(chapterId) {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.selectOption('#chapter-select', chapterId);
  await page.waitForTimeout(900); // let the chapter fade-in finish
}

// Drive the session through the same intents the UI sends on pointer input.
async function solve(steps) {
  await page.click('[data-tool="connect"]');
  for (const [room, face] of steps.picks) {
    await page.evaluate(([r, f]) => window.__session.pickFace(r, f), [room, face]);
  }
  await page.click('#test');
}

// 1. Threshold: the tutorial, solved.
await open('threshold');
await solve({ picks: [['hall', 'E'], ['vault', 'W']] });
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, '01-threshold-solved.png') });

// 2. Sealed Wing: the traveller walking a route past a gate.
await open('sealed-wing');
await solve({ picks: [['hall', 'S'], ['pump', 'S']] });
await page.click('#walk');
await page.waitForTimeout(950);
await page.screenshot({ path: join(outDir, '02-sealed-wing-walk.png') });

// 3. The Machine: plates, numbered route, and the inspector's plan contradictions.
await open('the-machine');
await solve({ picks: [['intake', 'E'], ['press', 'N'], ['press', 'E'], ['sluice', 'E'], ['sluice', 'W'], ['exit', 'E']] });
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, '03-the-machine.png') });

// 4. Closing Construction: the finale, with the Closed Ring discovered.
await open('final-construction');
await page.click('[data-tool="connect"]');
await page.evaluate(() => {
  const s = window.__session;
  s.pickFace('foundation', 'S'); s.pickFace('well', 'W');   // Well lit facing east
  s.pickFace('well', 'N'); s.pickFace('apex', 'N');          // half-turn passage to the Apex
  const pid = [...s.structure.portals.values()].find((p) => p.a.room === 'well' && p.a.face === 'N' || p.b.room === 'well' && p.b.face === 'N').id;
  s.selectPortal(pid);
  s.rotateSelectedPortal(); s.rotateSelectedPortal();      // two quarter-turns
  s.pickFace('apex', 'S'); s.pickFace('foundation', 'E');  // closes the ring
});
await page.click('#test');
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, '04-closing-construction.png') });

// 5. The Stillwater: the Reeds lit from the Pool, the traveller walking the route.
await open('the-stillwater');
await solve({ picks: [['pool', 'S'], ['reeds', 'W']] });
await page.click('#walk');
await page.waitForTimeout(950);
await page.screenshot({ path: join(outDir, '05-the-stillwater-walk.png') });

// 6. The Long Corridor: the mirrored last door, seen in the 3D model.
await open('the-long-corridor');
await page.click('[data-tool="connect"]');
await page.evaluate(() => {
  const s = window.__session;
  s.pickFace('start', 'E'); s.pickFace('turn', 'W');
  s.pickFace('far', 'W'); s.pickFace('end', 'E');
  const pid = [...s.structure.portals.values()].find((p) => (p.a.room === 'far' && p.a.face === 'W') || (p.b.room === 'far' && p.b.face === 'W')).id;
  s.selectPortal(pid);
  s.mirrorSelectedPortal();                                 // the mirror turns the arrival to face east
});
await page.click('#test');
await page.click('#view-model');
await page.waitForTimeout(200);
await page.screenshot({ path: join(outDir, '06-the-long-corridor-model.png') });

await browser.close();
if (errors.length) {
  console.error('Console errors during capture:', errors);
  process.exitCode = 1;
} else {
  console.log(`Wrote screenshots to ${outDir}`);
}
