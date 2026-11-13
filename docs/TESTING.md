# Testing

```
npm test
```

Runs Node's built-in test runner over `tests/*.test.js`. No dependencies are
required. Node 18 or later.

Current coverage focus:
- `topology.test.js`: loops, quarter-turn loops, mirror transforms, shortcuts,
  face occupancy, sealed faces, room removal cascading to portals, serialisation.
- `campaign.test.js`: every chapter starts unsolved; each goal kind is satisfied
  only by a construction that actually meets it.
- `session.test.js`: the UI intent flow (pick face, pick face) reaches the same
  results as the topology operations, and undo/redo round-trip.
- `analysis.test.js`: cycle enumeration (self-loops, two-portal and triangle
  cycles, trees), net twist arithmetic, the dimension report.
- `chapters.test.js`: each new chapter is solved by an explicit construction, and
  plausible wrong constructions fail. Discoveries appear only when their
  condition holds.
- `mechanics.test.js`: gates open only after their plate is lit on the route,
  fixed passages refuse removal and reshaping, sightlines, route headings,
  route geometry for the walker, and the Sealed Wing solved and failed.
- `properties.test.js`: 120 seeded random constructions checked against
  invariants that must hold for all of them. A guard test confirms the generator
  actually produces cycles, gates, mirrors and turns, so the properties are not
  vacuous. Failures report the seed that produced them.
- `persistence.test.js`, `geometry.test.js`.
- `blocks.test.js`, `physical-campaign.test.js`: the grid engine, crates through
  transformed passages, plates and gates, and the four physical challenges solved
  by the push solver.
- `editor.test.js`, `sandbox-challenge.test.js`: the challenge editor's data,
  validation and its use by the live session.
- `render3d-frames.test.js`, `render3d-walker.test.js`: portal frame maths and
  the walker, including body mode.
- `audit.test.js`: the route-first audit finds exactly the exhaustive solver's minimal solutions on six challenges.
- `hostile-input.test.js`, `roundtrip.test.js`: 2,700 mutated saves, share links and progress codes are refused cleanly or survived, and every challenge and demonstration survives save, load and share unchanged.
- `intro.test.js`, `menu.test.js`, `responsive.test.js`, `phone.test.js`: the first-run steps (pure), touch-sized hit targets, small-room labels, and that every challenge fits a phone-shaped plan (Contradiction excepted, on purpose).
- `bench.test.js`: benchmark statistics and preset recommendation.
- `spatial-sound.test.js`: room acoustics, neighbour mix and a fake AudioContext.

Total: 477 tests. Browser tools (need Playwright, server on port 8080):
`npm run e2e` (drives the real UI and asserts WebGL initialised), `npm run fuzz`
(random edits and views in every challenge), `npm run portalcheck` (analytic
marker projections against the rendered portals, within 4 px).

Real-device performance has not been measured by these tools. Use the in-game
benchmark on an Android phone and keep its report.

Screenshots are regenerated with `npm start` running and:

    PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/capture-screenshots.mjs

This is not part of `npm test`, because it needs a browser.

The browser UI was checked by driving headless Chromium through real pointer
clicks: connecting the first chapter completes it, with no console errors. This
is a manual check, not an automated suite, and is not part of `npm test`.

Auditing the large challenges: `node tools/audit.mjs <id> [budget] [maxRoute] [seconds] [plain]` searches for
unintended solutions by building passages only where a walker stands at a wall. Budget 3 on the larger
challenges takes minutes to an hour and a few hundred MB; a result marked INCOMPLETE is not a proof.
