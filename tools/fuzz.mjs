// Fuzzes the running game: random edits, view switches and walks in every challenge,
// failing on any console or page error. Needs `npm start` and Playwright.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const url = process.env.GAME_URL ?? 'http://localhost:8080/';
const rounds = Number(process.env.ROUNDS ?? 25);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
page.setDefaultTimeout(120000);
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
await page.goto(`${url}?quality=low`);
await page.waitForSelector('#menu-new');
await page.click('#menu-new');
await page.evaluate(() => { document.getElementById('menu').hidden = true; document.getElementById('chapter-card').hidden = true; });
const seed = Number(process.env.SEED ?? 1);
const log = await page.evaluate(async ({ rounds, seed }) => {
  const { CHAPTERS } = await import('/src/campaign/chapters.js');
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const s = window.__session;
  const out = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < rounds; i++) {
    const c = pick(CHAPTERS);
    s.loadChapter(c.id);
    const rooms = [...s.structure.rooms.keys()];
    for (let k = 0; k < 8; k++) {
      const op = rnd();
      try {
        if (op < 0.45) { s.pickFace(pick(rooms), pick(['N', 'E', 'S', 'W'])); s.pickFace(pick(rooms), pick(['N', 'E', 'S', 'W'])); }
        else if (op < 0.55) { const p = [...s.structure.portals.values()]; if (p.length) { s.selectPortal(pick(p).id); rnd() < 0.5 ? s.rotateSelectedPortal() : s.mirrorSelectedPortal(); } }
        else if (op < 0.65) s.deleteSelection();
        else if (op < 0.72) s.undo();
        else if (op < 0.78) s.redo();
        else if (op < 0.85) s.setRoomSize(pick(rooms), pick([0.75, 1, 1.5]));
        else if (op < 0.92) s.setRoomKind(pick(rooms), pick(['chamber', 'corridor', 'atrium', 'cellar']));
        else s.testConstruction();
      } catch (e) { out.push(`session threw in ${c.id}: ${e.message}`); }
    }
    window.__ia.setView(pick(['first', 'model', 'plan']));
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.5) s.fpTurn(pick(['left', 'right'])); else s.fpForward();
      window.__ia.render();
      await wait(120);
    }
    await wait(150);
  }
  return out;
}, { rounds, seed });
await browser.close();
const all = [...log, ...problems];
if (all.length) { console.error([...new Set(all)].join('\n')); process.exit(1); }
console.log(`fuzz passed (${rounds} rounds, seed ${seed})`);
