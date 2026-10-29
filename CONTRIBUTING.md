# Contributing

1. Fork and branch from `main`.
2. Run `npm test`. All tests must pass before you open a pull request.
3. Keep layers separate. Topology code (`src/topology`) must not import from the
   DOM, the canvas, or `src/campaign`. Campaign data may import topology.
   Rendering reads state and never mutates it.
4. Any new rule about spatial behaviour needs a test in `tests/topology.test.js`,
   including the unusual case it is meant to handle (loops, turns, mirrors).
5. Do not describe a feature as implemented unless the tests exercise it, or you
   have played it in a browser and described what you saw.
