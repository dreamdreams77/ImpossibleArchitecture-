# Impossible Architecture

A construction game about space that is not fixed. You build rooms and join them
with passages. A room's place on the plan never decides whether you can reach it;
only the passages do. You then **walk** what you built in 3D, through doorways that
show the real room beyond, and inspect it from above in an architect's model.

> In the Concordance, space is not a place but an agreement. Every room agrees
> which others are its neighbours, and a building is nothing more than the set of
> its agreements. You are an architect of those agreements.

## Run it

Needs Node 18 or later. No install, no build step (three.js is vendored).

```
npm start      # then open http://localhost:8080
npm test       # 415 tests over the engine, campaign, renderer maths and walker
npm run e2e    # optional: drives the real game in headless Chromium (needs Playwright)
npm run portalcheck # optional: checks the portal projection maths against a real render
npm run fuzz   # optional: random edits, views and walks in every challenge, failing on any error
```

## What is in it

- **A campaign of six chapters and 38 challenges (the original 31 plus four physical ones, a sequenced-plate puzzle, a two-lock gate and the three-lock Mirror Lock)**, each chapter one discipline:
  The First Connection, The Architecture of Return, The Rooms That Should Not Fit,
  The Mechanical Interior, The Structure With Two Truths, The Last Construction.
  Every goal is checked by searching the real graph, not by triggers, and most have
  more than one solution. Each chapter opens with a card and closes with a line; the
  last construction ends in an ending written from the building you made.
- **Three views of one world**: the *plan* (where you build), the *walk* (WebGL, first
  person, with recursive portal rendering) and the *model* (an architect's cutaway
  with a glowing arc for every real connection, so plan distance and graph distance
  can disagree in plain sight).
- **Construction in 3D**: in the model, every free face carries a ring. Click one, then another: hovering previews the join, in red with the rule's reason if it is refused.
- **Free construction** with the same engine, saving, loading, sharing and undo, and **your own challenge**: pick a start, a goal, an optional heading and step limit, and Test construction checks it with the campaign's engine (saved with the construction).
- **Rebindable keys**, camera comfort (look sensitivity, field of view, head bob) and a graphics quality choice in Settings.
- **A soundscape per chapter**, synthesised in the browser (drones and drifting filtered noise), with cues for crossing a passage and for mirrors. Sound starts off. It is spatial: each room has a reverb set by its size and kind, the rooms beyond the doorways murmur from their direction (muffled when a gate is shut or a passage refuses you, clearer once a plate opens it), footsteps follow the chapter's floor material, and plates and sliding gates have their own sounds.
- **Physical challenges**: you walk as a body on a grid, push crates (they cross passages, mirrored and turned with them), stand on weight plates and deliver crates to pads. The solver verifies them by searching pushes.
- **Generated challenges** (title menu): seeded, five difficulties, built backwards from a hidden solution and checked by the engine (and, for the small ones, an exhaustive solver). The pause menu can show the solution.
- **Propagation**: sound and light spread through the real passages, not across the plan. Gates dull them, and rooms borrow glow from connected rooms (`src/topology/propagation.js`).
- **The Atlas** (title menu): 11 architectural phenomena (self-joined rooms, hall of mirrors, turning and reversing loops, one-way rings, shared loops, plan versus graph distance) found by building them anywhere, shown as questions until found.
- **Experiments** (Atlas screen, also in the pause menu): the game poses a prediction about your own loop (which way do you face when you come back round?). You answer; the engine walks it and judges. A correct answer is remembered once per loop.
- **Quick tools on the plan** (Select, Add room, Connect, Undo) so building never needs the side panel, which on a phone sits below the plan.
- **Cinematic moments** (Settings, on by default): a gentle lift and widening of the walk camera when you make a discovery or finish a challenge. It is layered on your own view, ends the instant you touch anything, and never plays under reduced motion.
- **Wall dressing**: every wall bay is dressed per room and wall (hanging banners, glowing sconces, niches with plinths and figures, ring reliefs, or left plain), so rooms of one style no longer repeat. Sconces cost a glow sprite each, not a light.
- **Monuments**: the grandest atrium (size 1.5) is taller, with a floor medallion, four slanted shafts of light crossing over it and a centrepiece that differs by chapter (armillary, meshed gears, nested arches, two counter-turning half-rings, a colossal gate-ring) and turns faster for a moment after you cross a passage. Built into the room generator, so it appears wherever you make such a room.
- **Multi-stage gates**: a gate can wait on several plates at once (`also`), open only while all are lit (set in the challenge editor: pick a gate, then a second plate; plates can also be sequenced with "after plate N"); The Two-Lock Vault pairs one with a toggle plate that ringing twice undoes.
- **Sequenced plates**: a plate with `after` lights only once an earlier plate is lit (The Ordered Hall).
- **A challenge editor** in the sandbox: several goals, optional objectives, plates, gates, crates, pads, heading requirements and step limits, all run on the campaign engine.
- **Graphics presets** (high, medium, low) with dynamic resolution, shadows, bloom and ACES grading; a built-in benchmark (`?bench` or Settings, Run benchmark) that produces a report. No claim is made here about real phones: the benchmark has only been run on a software renderer in development, so run it on your own device.
- **Objects**: plates (latch and toggle), gates, one-way passages, mirrors, quarter
  turns, crates, delivery gates and pads. Their state is part of the traversal.
- **Construction rules** that say why they refuse: sealed faces and forbidden links.
- **Developer overlay (F3)**: nodes, connections, object ownership, transforms,
  the walker's path, invalid constructions, the challenge verdict, and renderer
  stats; passes are tinted by recursion depth.

## Controls

| View | Controls |
| --- | --- |
| Plan | click a room to select, drag to move, click empty space to add, click two face dots to connect; Turn ¼ / Mirror / One-way edit a passage; Ctrl+Z / Shift+Ctrl+Z undo and redo |
| Walk | ← → or Q E turn, ↑ or W walk, drag to look, click the left or right edge to turn and the middle to walk |
| Model | drag or arrows orbit, wheel or + − zoom, click a room to select, F resets, Cutaway slider moves the section plane |
| Anywhere | T test, P play the route, H hint, ? keyboard panel, F3 developer overlay, Esc pause menu |

In the walk and model, passages are coloured: cyan two-way, amber one-way (chevrons
drift the way you may go), violet mirrors, green turns you, red shut (bars over a
dimmed view of what lies behind).

## How it is built

```
src/topology/    the authoritative graph: rooms, passages, transforms, traversal, analysis
src/campaign/    challenges as data, the six-chapter arc, narrative and ending
src/render3d/    WebGL: frames, materials, room architecture, portal renderer, walker
src/render/      the 2D canvas views (plan, graph, fallbacks)
src/ui/          DOM shell, the WebGL view glue, sound, debug report
src/persistence/ versioned saves and share links
src/vendor/      three.js r170 (MIT)
```

The renderer reads the graph; it never decides it. See [docs/RENDERING.md](docs/RENDERING.md)
for how the portals, mirrors and loops are drawn, [docs/SPATIAL.md](docs/SPATIAL.md) for the
model, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/GAMEPLAY.md](docs/GAMEPLAY.md)
and [docs/TESTING.md](docs/TESTING.md).

## Honest limits

- The 3D look has been inspected in headless Chromium on a *software* renderer. Frame
  times there say nothing about real GPUs. The renderer is built to be cheap (merged
  geometry, about 35 to 130 draw calls a frame, bounded recursion with adaptive quality)
  but it has not been profiled on real hardware.
- Construction works in the model view: join faces, add rooms (Add tool), drag the selected room, click an arc
  to select a passage. Its turn, mirror, direction, and a room's size and kind, are the sidebar's buttons, shared
  with the plan.
- A twisting passage does not bend the doorway's view; it turns the traveller as they
  cross, like a revolving door. A mirroring passage reflects the view and the walker
  snaps to the engine's heading on arrival.
- Objects are plates, gates, crates and pads. Gates slide open when their plate is lit, but crates cannot be
  pushed. Only six actions are rebindable.
- The soundscape is simple synthesis, not composed music.
- Your own challenges are single goals (reach, arrive facing, within N steps): no plates, crates or restrictions. Campaign challenges are data files.
- Campaign challenges are checked by planted solutions and negative cases, and by `tools/solve.mjs`, an exhaustive
  solver that proves 18 of them solvable and reports their minimum builds. The larger ones (Machine, Wheel, Spiral
  Cellar, Cupboard, Ring Hall, Last Construction) are beyond brute force, so unintended shortcuts may exist there.
  The solver also shows that many early challenges are solvable by a single passage: they are tutorials.

## License

MIT. three.js is MIT, see `src/vendor/three/LICENSE`.
