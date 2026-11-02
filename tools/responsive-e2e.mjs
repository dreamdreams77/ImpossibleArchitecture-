// Responsive browser checks across touch portrait, touch landscape and desktop.
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath);
const url = process.env.GAME_URL ?? 'http://localhost:8080/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (condition, label) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`);
  if (!condition) problems.push(label);
};
const makePage = async (options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console error: ${message.text()}`); });
  await page.goto(`${url}?quality=low`);
  await page.waitForSelector('#menu-new');
  return { context, page };
};

// Portrait phone: the drawing is pinned at the top and the controls column (the objective and the Test button)
// scrolls beneath it, so Auto keeps it. Compact tucks it away for the largest drawing, Full keeps it open, and
// the menu is always one tap away in the header.
{
  const { context, page } = await makePage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  check(!(await page.evaluate(() => document.body.classList.contains('panel-hidden'))), 'portrait touch keeps the controls column beneath the drawing');
  check(await page.locator('#menu-open').isVisible(), 'the Menu button is in the phone header');
  await page.click('#menu-settings-open');
  await page.selectOption('#set-layout', 'full');
  check(!(await page.evaluate(() => document.body.classList.contains('panel-hidden'))), 'Full layout keeps the controls open on a phone');
  await page.selectOption('#set-layout', 'compact');
  check(await page.evaluate(() => document.body.classList.contains('panel-hidden')), 'Compact layout tucks the controls away');
  await page.selectOption('#set-layout', 'auto');
  check(!(await page.evaluate(() => document.body.classList.contains('panel-hidden'))), 'Auto restores the controls column');
  await page.click('#settings-back');
  await page.click('#menu-sandbox');
  await page.waitForFunction(() => document.getElementById('menu').hidden);
  check(!(await page.locator('#plan-tools').evaluate((el) => el.hidden)), 'the construction tools appear in the plan');
  const stagePosition = await page.locator('.stage').evaluate((el) => getComputedStyle(el).position);
  check(stagePosition === 'sticky', 'the drawing stays pinned while the column scrolls');
  const before = await page.evaluate(() => window.__session.structure.rooms.size);
  await page.click('#plan-tools [data-tool="add"]');
  await page.locator('#plan').tap({ position: { x: 190, y: 180 } });
  const afterAdd = await page.evaluate(() => window.__session.structure.rooms.size);
  check(afterAdd === before + 1, 'Add room works by touch');
  await page.click('#undo');
  const afterUndo = await page.evaluate(() => window.__session.structure.rooms.size);
  check(afterUndo === before, 'Undo works by touch');
  await page.click('#redo');
  const afterRedo = await page.evaluate(() => window.__session.structure.rooms.size);
  check(afterRedo === before + 1, 'Redo works by touch');
  await page.click('#more > summary');
  await page.click('#panel-toggle');
  check(await page.evaluate(() => document.body.classList.contains('panel-hidden')), 'More, Hide controls tucks the column away');
  await page.click('#more > summary');
  await page.click('#panel-toggle');
  check(!(await page.evaluate(() => document.body.classList.contains('panel-hidden'))), 'and brings it back');
  await page.click('#menu-open');
  check(await page.locator('#menu-pause').isVisible(), 'Menu opens the pause menu on a phone');
  await context.close();
}

// Landscape phone: the inspector becomes a side rail beside the 3D/plan stage,
// rather than stealing vertical space from the construction.
{
  const { context, page } = await makePage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.click('#menu-sandbox');
  await page.waitForFunction(() => document.getElementById('menu').hidden);
  const stagePosition = await page.locator('.stage').evaluate((el) => getComputedStyle(el).position);
  check(stagePosition === 'relative', 'landscape phone uses a side-by-side stage layout');
  const layout = await page.locator('.layout').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  check(layout >= 2, 'landscape phone can show the inspector beside the stage');
  check(await page.locator('#controls').isVisible(), 'landscape inspector is reachable');
  await context.close();
}

// Desktop: keep the full inspector visible and give the construction stage the
// remaining width; the same quick tools are available without a touch device.
{
  const { context, page } = await makePage({ viewport: { width: 1440, height: 900 } });
  check(!(await page.evaluate(() => document.body.classList.contains('panel-hidden'))), 'desktop Auto keeps the inspector open');
  await page.click('#menu-sandbox');
  await page.waitForFunction(() => document.getElementById('menu').hidden);
  check(await page.locator('#controls').isVisible(), 'desktop inspector remains visible');
  check(await page.locator('#plan-tools').isVisible(), 'desktop quick construction tools remain available');
  const cols = await page.locator('.layout').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  check(cols >= 2, 'desktop uses a two-column workspace');
  await context.close();
}

await browser.close();
if (problems.length) {
  console.error(problems.join('\\n'));
  process.exit(1);
}
console.log('responsive browser checks passed');
