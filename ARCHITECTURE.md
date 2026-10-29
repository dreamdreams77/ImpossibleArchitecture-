# Architecture

```
src/topology/     pure data model and rules (no DOM, no canvas)
  graph.js        Structure, Room, Portal, face geometry, serialisation
  construction.js immutable operations and validation
  traversal.js    stepping, BFS route search, replay
  history.js      undo/redo over snapshots
src/campaign/     chapters as data and goal checks (uses traversal only)
src/persistence/  versioned save format and slot storage (storage injected)
src/game.js       Session: the controller between UI intent and rules
src/render/       geometry (pure) and canvas drawing (read-only)
src/ui/app.js     DOM shell: translates pointer and keys into Session calls
tools/serve.js    static server for local play
```

## Data flow

Input → `app.js` decides an intent → `Session` method → topology operation
returns a new `Structure` or an error → `History` records it → render reads the
current structure. Nothing below the UI knows the UI exists.

## Why immutable structures

Every construction operation clones and returns a new value. This makes undo a
stack of references, makes failed operations leave state untouched, and makes
the tests simple: each assertion is about a value, not a sequence of mutations.
