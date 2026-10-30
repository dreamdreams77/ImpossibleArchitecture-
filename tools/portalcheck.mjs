// Independent check of the portal renderer's mathematics. For each case a bright marker sits
// off-centre in the destination room. The check predicts, from the transform alone, where that
// marker must appear on screen through the doorway (marker -> back through the portal -> camera
// projection) and compares it with where the renderer actually drew it. Plain, mirrored, rotated,
// differently sized and self-looping passages are covered.
//
//   npm start &   then   PLAYWRIGHT_MODULE=... node tools/portalcheck.mjs
//
// Exits non-zero if any case is off by more than the tolerance (pixels).

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const url = process.env.GAME_URL ?? 'http://localhost:8080/';
const TOL = Number(process.env.TOL ?? 6);
const W = 640; const H = 400;

const cases = [
  ['plain east-west', 'p=hall:E:vault:W&h=E', 'hall', 'vault'],
  ['north to south', 'p=hall:N:vault:S&h=N', 'hall', 'vault'],
  ['mirrored', 'p=hall:E:vault:W:0:1&h=E', 'hall', 'vault'],
  ['quarter turn (view unchanged, walker turns)', 'p=hall:E:vault:W:1:0&h=E', 'hall', 'vault'],
  ['east to north (faces differ)', 'p=hall:E:vault:N&h=E', 'hall', 'vault'],
  ['different sizes', 'p=hall:E:vault:W&size=vault:1.5&size=hall:0.75&h=E', 'hall', 'vault'],
  ['mirror into a north door, off-axis eye', 'p=hall:S:vault:N:0:1&h=S&x=0.8&z=-0.6', 'hall', 'vault'],
  ['self loop (room into itself)', 'p=hall:N:hall:S&h=N&x=0.6', 'hall', 'hall'],
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [name, query, room, marker] of cases) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(120000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${url}tools/preview.html?still&check&plain&quality=medium&chapter=threshold&room=${room}&marker=${marker}&${query}`);
  await page.waitForFunction(() => window.__check, null, { timeout: 120000 });
  const r = await page.evaluate(() => window.__check);
  await page.close();
  let line;
  if (!r.found) { failed++; line = `FAIL no marker pixels found (predicted ${r.predicted.x.toFixed(0)}, ${r.predicted.y.toFixed(0)})`; }
  else {
    // Self loops draw the marker at every recursion level; the nearest blob to the prediction is the first.
    const dx = r.found.x - r.predicted.x; const dy = r.found.y - r.predicted.y;
    const err = Math.hypot(dx, dy);
    const ok = err <= TOL && r.predicted.inFront;
    if (!ok) failed++;
    line = `${ok ? 'ok  ' : 'FAIL'} error ${err.toFixed(1)}px (${r.found.pixels} px)`;
  }
  if (errs.length) { failed++; line += `  page errors: ${errs[0]}`; }
  console.log(`${name.padEnd(46)} ${line}`);
}
await browser.close();
if (failed) { console.error(`${failed} portal case(s) failed`); process.exit(1); }
console.log('portal mathematics check passed');
