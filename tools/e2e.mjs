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

await page.evaluate(() => { window.__ia.showEnding(); });
await page.waitForSelector('#ending-screen:not([hidden])');
expect((await page.textContent('#ending-heading')) === 'It stands.', 'the ending opens');

await browser.close();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('end-to-end checks passed');
