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

Screenshots are regenerated with `npm start` running and:

    PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/capture-screenshots.mjs

This is not part of `npm test`, because it needs a browser.

The browser UI was checked by driving headless Chromium through real pointer
clicks: connecting the first chapter completes it, with no console errors. This
is a manual check, not an automated suite, and is not part of `npm test`.
