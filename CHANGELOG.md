# Changelog

## 1.0.0 — a 3D walk, six chapters, an ending

Layout
- The repository had been uploaded flat; `src/`, `tests/`, `tools/` and `docs/` are restored, so `npm test` and `npm start` work again.

Rendering
- WebGL walk and architect's model (three.js r170, vendored). Doorways show the real room beyond by recursive
  render-to-texture portals with oblique clipping; mirrored passages, quarter turns and rooms that open into
  themselves are drawn. Six chapter styles, procedural PBR materials, real room architecture, a walker that
  animates the engine's steps. The 2D views remain as a fallback where WebGL is missing.

Campaign
- Six chapters, 31 challenges (seven new), chapter cards, outros, and an ending built from the player's structure.
- New construction rule: forbidden links. Chapters may give rooms a kind and size.

Tools
- F3 developer report; `tools/e2e.mjs`; `tools/preview.html` renderer preview.

Tests: 326 pass.

Known limits are listed in the README.

## 0.30.0 — rooms that resize and turn, pads, and a pad chapter

Rooms
- **Size**: small, standard or large. The room is drawn at that size in the plan, and its doors
  and hit area follow.
- **Turn**: a room turns a quarter-turn in the plan. Its doors turn with it, but they keep their
  faces: the connections, and every route through them, do not change. The plan shows the turn;
  the logic never depends on it.
- Size and turn are undoable and saved. Old saves load as standard and unturned.
- The 3D model and the first-person view do not yet show size or turn.

Objects
- **Pads.** A crate carried into a pad room is set down there, and waits until someone comes back
  for it empty-handed. Crate positions are now part of the traveller's state, so a route may set
  a crate down and fetch it again.
- **A new chapter, XXIII. The Pad Room**, uses pads: the first crate is set down if you pass
  through the pad room carrying it, so the route must go round. The finale is now XXIV.
- The plan draws a dashed ring round each pad, and the walk shows crates where they lie.

Tests
- 293 tests pass, including the pad, size and turn tests.

Not yet, from the brief
- Key bindings cannot be changed.
- Objects are crates, pads and delivery gates. Doors do not move, mechanical devices are not built,
  and crates cannot be pushed.
- Size and turn are plan-only. The 3D model and the first-person view ignore them.
- The campaign is 24 chapters, short of the brief's 3 to 5 hours and 30 challenges, and the audio
  is a set of short cues rather than a soundscape.

## 0.29.0 — room kinds, walk speed in settings

Rooms
- **Four kinds of room**: chamber, corridor, atrium and cellar. Each is drawn differently in the
  plan: a corridor has a warm band, an atrium a gold inner court, a cellar a darker floor with
  cross-hatching. The kind changes how a room looks, never its connections. It is set from the
  Kind menu in the room section, is undoable, and is saved and shared. Old saves load as chambers.

Settings
- **Walk speed** is in the Settings view, kept in step with the sidebar control.

Tests
- 278 tests pass, including new tests for room kinds, undo, saving, and drawing every kind.

Not yet, from the brief
- Rooms cannot be resized or rotated as a whole. Size is fixed across the plan, first-person and
  3D views, and rotating a room means re-attaching its portals, which needs its own design.
- Key bindings cannot be changed.
- Objects are crates and delivery gates only. Doors do not move, mechanical devices are not built,
  and crates cannot be pushed or dropped.
- The campaign is 23 chapters, short of the brief's 3 to 5 hours and 30 challenges, and the
  audio is a set of short cues rather than a soundscape.

## 0.28.0 — delivery gates, a sealed vault, and menus

Objects
- **Delivery gates.** A passage can wait for a crate: it opens only once that crate has been
  delivered on the current route. Its state is part of the traversal, so a route must deliver
  the crate before the gate will let the traveller through. The walk, the first-person wall, the
  plan, the 3D model and the description all show it.
- **A new chapter, XXII. The Sealed Vault**, uses a delivery gate: deliver the first crate, then
  fetch the second from behind the gate. The finale is now XXIII.
- A failed test explains a gate that cannot open in time.

Menus
- **A title screen** opens at start: Continue, New game (asks before clearing progress), Chapters,
  Free construction, Settings and Credits.
- **A pause menu** opens on Escape when there is nothing to clear: Resume, Restart chapter,
  Chapters, Settings and the title screen. Escape still clears a half-finished action first.
- **A chapter list** shows every chapter, with a tick on the ones completed.
- **A completion card** appears once, when a chapter is first completed, and offers the next
  chapter or staying where you are.
- While a dialog is open, Tab stays inside it, Escape closes it, and the game's shortcuts wait.

Clean-up
- Hidden elements stay hidden (from 0.27.0), and the dialogs use the same rule.

Tests
- 272 tests pass, including the gate, chapter and completion tests.

Not yet, from the brief
- Objects are crates and gates only. Doors do not move, mechanical devices are not built, and
  crates cannot be pushed or dropped.
- Settings are a short list (theme, sound, volume). There is no walk-speed or key-binding setting.
- Rooms have no types and cannot be resized or rotated as a whole.

## 0.27.0 — cargo that travels through connections, and a fixed hidden toolbar

Objects
- **Crates travel through the spatial graph.** A traveller picks up a crate on arriving in
  its room while empty-handed, carries one at a time, and delivers it on arriving at the depot.
  If the depot has a required heading, the crate is accepted only when it arrives facing it,
  so the portals a crate crosses turn it, and the route must account for that.
- **A new chapter, XXI. The Freight**, uses crates: a turning passage, a depot that accepts only
  north-facing arrivals, and two trips to carry both crates. The finale is now XXII.
- The walk shows the crates: they follow the route, outlined while carried, and sit at the depot
  once delivered. Walk feedback says what each crate did ("Picked up the crate ...",
  "Delivered the crate ... facing N").
- A failed test explains the crate case when the depot is reached but the crates are not all delivered.

Clean-up
- Hidden panels stay hidden: a global `[hidden]` rule stops toolrows (such as the portal buttons)
  from showing with nothing selected.
- Traversal state now includes what is carried and delivered, so searches and replays agree.

Tests
- 264 tests pass, including nine new cargo tests and the updated chapter numbering.

Not yet, from the brief
- Crates are the only moving objects. There is no general object simulation: no doors that move,
  no mechanical devices, no crates that are pushed.
- Menus: no main menu, pause menu, settings screen, or completion screen per chapter.
- Rooms have no types and cannot be resized or rotated as a whole.

## 0.26.0 — reverse, duplicate, credits, and a gap check against the brief

Features
1. **Reverse a one-way passage**: flips the direction it may be crossed, with a Reverse
   button beside One way. Two-way and fixed passages are refused with a reason.
2. **Duplicate room**: places an empty copy one grid step away, with its label ("... copy",
   shortened to the label limit). The copy is selected, and one Undo removes it.
3. **Credits**: a panel at the foot of the controls.

Brief check (against the original brief)
Covered: construction with undo and redo, validation, one-way and fixed passages, 21
chapters, first-person, plan and 3D views, the ending, save slots, shares, sound, and the
sandbox.
Not yet, from the brief:
- No main menu, pause menu, or settings screen. Settings are the header and sidebar controls.
- No completion screen per chapter, beyond the transition buttons.
- Objects are limited to plates and gates. There is no general object simulation, and
  objects do not travel through connections.
- Rooms have no types, and cannot be resized or rotated as a whole room.
- Only some of the brief's visual and audio systems are implemented.

Tests
- 255 tests pass, including new ones for reverse and duplicate.

## 0.25.0 — a ceiling light, and a clean-up

Graphics
- **Open passages cast light on the floor and ceiling** in the first-person view: a warm
  pool on the floor and a fainter one above, so a doorway reads as a source of light.

Clean-up
- The floor-light helper is now one light-pool helper used for both floor and ceiling.
- A seeded fuzz run of 800 sessions of 400 steps passed; the dead-code scans are clean.
- Remaining work could not be listed as one set: the changelog's "Not yet" items are
  historical and done. Items were chosen by surveying the code.
- Not run here: iOS Safari (WebKit is not installed in this environment).

## 0.24.0 — eight items, room shadows, and a clean-up

Features
1. **The selected room is outlined in the 3D model**, so the inspector and the model agree.
2. **The cursor shows what a click will do** over the plan: a move over a room, a pointer
   over a face or portal, a grab over empty space, a copy cursor when adding a room.
3. **A route walk announces each step**: where it starts, then "Step n of N: now in ...".
4. **Undo and Redo say how far they go** in their tooltips.
5. **The hint button says "Show full hint"** once the nudge has been given.
6. **F centres on the selected room**, keeping the zoom. With nothing selected, F still
   fits the whole plan.
7. **Escape says the walk stopped.**
8. **The header says which chapter you are on**, for example "on chapter 3".

Graphics
- **Soft shadows under the rooms in the plan**, so they sit on the page rather than in it.

Clean-up
- The walk announcement and the cursor choice each have one helper.
- Tests cover the selected-room outline and the history counts the tooltips use.
- A seeded fuzz run of 800 sessions of 400 steps passed; the dead-code scans are clean.

## 0.23.0 — eight items, a floor-light graphic, and a clean-up

Features
1. **The theme follows the device** when nothing is saved. A saved choice still wins.
2. **The view is remembered** between visits (plan, first person or 3D model).
3. **The phone panel's hidden state is remembered.**
4. **Walk and playback speed**: ½×, 1× or 2×, remembered between visits.
5. **The loop list says how many more** it leaves out beyond four.
6. **Copy notes** copies the field notes as text (undiscovered ones are marked).
7. **Click a room in the 3D model** to select it in the inspector.
8. **Saved slots name their chapter** in the picker, for example "mine · I. Threshold".

Graphics
- **Light on the floor** in front of open passages: a soft warm pool at the foot of the
  doorway, to go with the glow above it.

Bug fixes
- Selecting "no room" left a selection with an empty id. It now clears the selection.

Clean-up
- The 3D layout takes the zoom, so a click finds the room where the view draws it.
- Saved slots are described by one helper (`describe()`), with tests for unreadable saves.
- A seeded fuzz run of 800 sessions of 400 steps passed; the dead-code scans are clean.

## 0.22.0 — eight items, masonry on the walls, and a clean-up

Features
1. **Restarting a chapter is undoable.** Undo brings back the construction it replaced.
2. **Loading a save or an imported file is undoable** when it is for the same chapter
   (or free construction). A save from another chapter still starts a fresh history.
3. **Loading or importing asks first** when it would replace a non-empty construction.
4. **Saving over an existing slot asks first.**
5. **Double-click a room to rename it.** The room is selected and its name is focused.
6. **The plan describes itself** to screen readers: room and portal counts, and how to
   rename and move.
7. **The walker along the route in the 3D model** was checked in a browser: it advances
   along the route as the walk runs.
8. **The restore message says when** the construction was saved.

Graphics
- **Masonry on the first-person walls:** faint courses with staggered joints, under the
  openings, so the walls read as built rather than flat colour.

Clean-up
- Load and import share one path (`loadStructure` with an `undoable` option), and
  restart has its own method (`restartChapter`).
- A seeded fuzz run of 800 sessions of 400 steps passed; the dead-code scans are clean.

## 0.21.0 — the construction is kept, eight items, and a clean-up

Fixes
1. **The construction is saved and restored.** Before this, only progress and time were
   saved, so a reload or closed tab lost the construction in progress. It is now saved
   as you work (and when the page is hidden or closed) and restored on the next visit.
   Free construction comes back as free construction.

Features
2. **Previous chapter** button, mirroring Next.
3. **Clear all** empties a free construction, undoably. Chapters use Restart instead,
   because their fixed passages belong to the chapter.
4. **A symbols key** in the sidebar explains the plate, face, arc, one-way and gate marks.
5. **Room and portal limits in the stats line**, for example "2 of 4 rooms".
6. **The keys panel manages focus**: focus moves in, Tab stays inside, and closing
   returns focus to the button that opened it.
7. **A warning for oversized share links**, suggesting Export JSON instead of copying a
   link that would be too long to open.
8. **The chapter title is announced** to screen readers when the chapter changes.

Clean-up
- Save and restore of the construction reuse the manual-save format, so the same reader
  opens both.
- A seeded fuzz run of 800 sessions of 400 steps passed; the dead-code scans are clean.
- The stats line builds its limits with one helper instead of repeating the check.

## 0.20.0 — iOS and Android compatibility, eight items, and a clean-up

Platform fixes
1. **Sound wakes up on phones.** Audio contexts that start suspended are resumed before
   a cue plays, so cues from timers are not silent.
2. **Copying works more often.** One copy helper is used by the description, route,
   share link and progress code. It falls back to selecting a hidden field where the
   clipboard API is unavailable.
3. **No zoom when a field is focused on iOS.** Text fields and selects are 16px on
   touch screens. (The base rules were overriding this; the rule now comes last.)
4. **Dynamic viewport height** for the keys panel, so it is not hidden behind browser
   toolbars on iOS and Android.
5. **Touch screens draw at up to 2x density**, not 3x, to keep canvases light on
   high-density phones.
6. **Save image uses the share sheet** where the device offers it, so iOS and Android
   can save to Photos or Files. Otherwise it downloads as before.
7. **No pull-to-refresh** while dragging the view or the panel (overscroll is off).
8. **No autocorrect or auto-capitals** in the save-name and progress-code fields.

Clean-up
- The canvas pixel ratio is read once per resize, not once per frame, and stored in one
  place (a fault introduced during this round was caught and fixed before committing).
- Platform helpers live in `src/ui/platform.js`, with tests for the ratio, the copy
  fallback and audio resume.

Verified
- Chromium with Android device emulation, and desktop Chromium, at phone, tablet and
  desktop sizes: no horizontal scrolling, canvases sized to the screen.
- Not verified: iOS Safari. WebKit is not installed in this environment, so the iOS
  behaviour is by inspection; it should be checked on a real iPhone.

## 0.19.0 — phone and computer compatibility, eight items, and a clean-up

Compatibility (checked at 390×844 phone, 844×390 landscape phone, 820×1180 tablet,
1280×800 laptop and 1920×1080 desktop, with no horizontal scrolling at any size)
1. **The canvases refit whenever the stage changes size**, not only on a window resize:
   rotation, a header that wraps, or the controls being hidden.
2. **Bigger touch targets** on touch screens (at least 40px tall buttons, fields and
   inputs).
3. **Hide controls** on phone-width screens, so the view gets the full height. Show
   controls brings the panel back.
4. **Notch padding** (safe-area insets) on the header, with viewport-fit set.
5. **The header wraps at every width**, so its buttons never run off the edge.
6. **The brand name is hidden on phone widths** to save room in the header.
7. **A touch hint** in first-person view on touch screens: tap the left or right edge
   to turn, the middle to walk.
8. **A landscape-phone layout**: the controls sit beside the view, and the keys panel
   scrolls on short screens.

Clean-up
- A seeded fuzz run of 800 sessions of 400 steps passed; no unused exports remain.
- The window resize listener became one `refit` function, used by the stage's
  ResizeObserver when it is available.

## 0.18.0 — eight more items, and a clean-up

Features
1. **Pinch to zoom the plan** with two fingers. The view zooms about the midpoint of
   the fingers and follows it, and rooms are not moved.
2. **Pinch to zoom the 3D model**; one finger still turns it.
3. **P plays the passing route** in first person (switches to that view).
4. **W walks the passing route** in the plan. Without a passing test it says so.
5. **Escape stops** a route walk or playback.
6. **A favicon**, so the browser tab no longer requests a missing icon.
7. **A page description** for search and sharing.
8. **The inspector is keyboard-focusable** and labelled as a region, so its text can be
   read and scrolled without a mouse.

Clean-up
- Two-finger tracking lives in its own module (`src/ui/pinch.js`) with tests for the
  zoom factor, the pan, and the lift-off and coincident-finger cases.
- A seeded fuzz run of 800 sessions of 400 steps passed; no unused exports remain.

## 0.17.0 — eight more items, a phone-width fix, and a clean-up

Features
1. **Zoom the plan with + and −**, about the middle of the plan. The mouse wheel now
   keeps the point under the cursor in place.
2. **Arrow keys pan the plan** when no room is selected.
3. **Zoom the 3D model** with the wheel, or + and −. F resets the zoom with the turn.
4. **A adds a room** at the middle of the plan.
5. **F2 renames** the selected room.
6. **T tests the construction; H shows the next hint.**
7. **The saved-slot picker** lists the names already in storage and fills the name box.
8. **Phone width.** The header wraps and the chapter picker fits, so the page no longer
   scrolls sideways at 360–390 px.

Bug check
- Pressing N, E, S or W in the connect tool with nothing selected threw an error. It now
  does nothing; face picks need a selected room.

Clean-up
- The plan's keys moved into one function, `handlePlanKey`, with the arrow steps shared
  with the 3D model.
- The store can list slot names (`names()`), with tests for both storage styles.
- A seeded fuzz run of 800 sessions of 400 steps passed; no unused exports remain.

## 0.16.0 — eight undone items, and a clean-up

Features
1. **Delete a save slot.** The Delete button removes the save with the given name,
   after a confirmation.
2. **Arrow keys nudge the selected room** in the plan, one grid step each; each step
   is its own undo.
3. **Keyboard face picks while connecting.** With a room selected and the connect tool
   on, N, E, S or W picks that face.
4. **The loop report says when its search stopped early** (budget spent or list
   capped), instead of implying the list is complete.
5. **Reduced motion stops the pulses.** Plate, shadow and opening pulses hold still;
   walking and turning still happen.
6. **Touch.** The plan, first-person and model canvases no longer scroll the page
   under a finger.
7. **Progress codes.** Copy progress to a code and restore it in another browser.
   Unknown chapter ids are dropped.
8. **Sound volume.** A slider beside the Sound button, remembered between visits.

Clean-up
- Loop search returns whether it finished (`searchCycles`); `findCycles` is a thin
  wrapper for the places that only need the list.
- Save slots gained `has()`; the progress and volume code has tests for bad input.
- The paint loop takes the reduced-motion decision in one place.
- A seeded fuzz run of 800 sessions of 400 steps passed; no unused exports remain.

## 0.15.0 — six refinements to the 3D model and its controls

Features
1. **Save image captures the 3D model.** It used to save the plan while the model
   was showing.
2. **The model keeps turning after a drag.** Letting go leaves it coasting, slowing
   and settling. Reduced motion stops it at once.
3. **Arrow keys turn the 3D model.** ← and → turn it by a fixed step.
4. **F returns the 3D model to its first turn.**
5. **The 3D model has a label.** It gives the number of rooms and portals and says how
   to turn it, for screen readers.
6. **The keys panel lists the 3D controls.**

Bug check
- Coasting, the label and the description are pure functions with tests; the browser
  check covered the keys, the label and Save image with no console errors.

## 0.14.0 — seven features, a bug check, graphics, and a clean-up

Features
1. **Smoother first-person moves and turns.** A move eases in from a slight zoom; a
   turn slides sideways as it fades in.
2. **Orbit the 3D model.** Drag the model to turn it around its vertical axis.
3. **One-way and gate marks in the 3D model.** One-way passages carry a chevron, gates
   a bar across the arc. (Already drawn; now verified in the browser.)
4. **The walker in the 3D model.** While the test route is walked, a dot travels the
   route through the blocks.
5. **Gate-crossing sound.** Passing through a gate plays its own two-note cue.
6. **Two more chapters.** XIX. The Stillwater (a gate that opens only once the Reeds
   are lit from the Pool) and XX. The Long Corridor (a one-way drop, then a mirrored
   last door that must arrive facing east). The finale is now chapter XXI.
7. **Copy route.** Copies the passing route as numbered plain-language steps.

Graphics
- Open passages in the first-person view glow softly in their own colour, breathing
  with the arrow.
- Two new screenshots: The Stillwater on its walk, and The Long Corridor in the 3D
  model.

Bug check and clean-up
- Walking into a gate and into the playback of a route both use one helper to read
  the gate before the move, so the sound is chosen the same way in both.
- Unused exports removed from the 3D model module; the transition helpers now live in
  the first-person module, where they are tested.
- The package version now matches the changelog.
- A seeded fuzz run of 800 sessions of 400 steps passed.

Not yet
- The walker along the route in the 3D model is covered by a render test but has not
  been watched in a browser.
- The drag to orbit has no inertia; it stops where the pointer stops.

## 0.13.0 — eleven features, a bug check, graphics, and a clean-up

Features
1. **Direction-aware loops.** The loop report says when a loop can be walked round
   in one direction only, or cannot be walked round at all.
2. **Diagnosis of failed tests.** "Goal not met" now names the cause: no passage to
   the goal, a plate nothing can strike, a gate that is shut, or the wrong arrival
   heading.
3. **Reset campaign progress.** Clears completion, discoveries, test counts and time.
   The construction is kept.
4. **Time per chapter.** The stats line shows time spent on the chapter (not in free
   construction).
5. **Sound cues.** Short tones for steps, bumps, plates, one-way refusals and the
   goal, made in the browser. Off until switched on; the choice is remembered.
6. **Room selection by keyboard.** `[` and `]` select the previous or next room.
7. **Screen-reader description of the first-person view.** Says what is ahead and to
   each side, and updates as the walker moves.
8. **Click to walk.** In first person, the outer thirds turn towards that side and
   the middle walks forward.
9. **3D model view.** An isometric view of the rooms as blocks, with portals as arcs
   between faces. Mirror portals are dashed; one-way and gated passages are not yet
   marked there.
10. **The Wheel (chapter XVII).** A plate struck from the north and a toggle answering
    only an arrival from the east.
11. **Two Keys (chapter XVIII).** Two fixed gates, each opened by its own key; both
    keys must be struck on one walk. The finale is now chapter XIX.

Graphics
- A soft vignette on the first-person view and the 3D model; the plan already had one.
- Soft ground shadows under the blocks in the 3D model.

Bug check
- The 3D model canvas was never sized, so it stayed blank. Found in a browser check.
- The time display said "1 min" after a few seconds. Now "under a minute".
- Time spent is saved every ten seconds, so a closed tab loses little.
- The seeded fuzz test covers progress reset, time, room selection and the new
  stats. 800 seeds x 400 steps passed.
- A render smoke test draws random constructions through every renderer with a stub
  canvas, to catch drawing crashes. It passed.
- No new crash was found by fuzzing this round. A double vignette was caught in review
  and removed.

Clean-up
- Two unused constants removed. The 3D model's block code no longer repeats the
  projection of the room's origin.

Tests: 192 passing.

## 0.12.0 — five features, a bug check, and a clean-up

Features
- **Rename rooms.** A Room section in the sidebar edits the selected room's label
  (up to 24 characters, spaces tidied).
- **Copy description.** Copies a plain-language account of the construction: each
  room's passages and each portal's face-to-face joins, turns, mirrors, one-way
  direction and gates.
- **Snap to grid (G).** Snapping is on by default; off lets rooms sit at any
  position (two decimals).
- **Light and dark pages.** The Light/Dark button switches the page colours and is
  remembered in this browser. The plan keeps its own palette in both.
- **Tests run.** The stats line counts the tests run in each chapter.

Bug check
- Light theme: the controls kept hard-coded dark backgrounds and were unreadable.
  They now use theme variables.
- After renaming a room, keyboard focus stayed in the label box, so shortcuts such
  as G were swallowed. Committing a rename now hands focus back.
- The theme button showed the wrong label after a reload in light mode. The saved
  theme now goes through the same code as the button.
- The seeded fuzz test also covers renaming, describing and the test counter.
  800 seeds x 400 steps were run once and passed.

Clean-up
- The app's private rounding helper is replaced by the shared snap function.
- New description and view helpers are pure and covered by unit tests.

Tests: 168 passing.

## 0.11.0 — five features, a bug check, and a clean-up

Features
- **Field notes.** The sidebar lists the current chapter's optional discoveries:
  titled until found, with their text once found.
- **Keyboard panel.** `?` (or the Keys button) lists every shortcut.
- **Fit view.** `F` or Fit view frames the whole construction in the plan.
- **Save image.** Saves the view on screen (plan or first person) as a PNG.
- **Reduced motion.** With the system setting on, the chapter fade and the
  first-person transition are skipped.

Bug check
- A construction with no rooms no longer crashes the first-person walker
  (`fpTurn`, `fpForward`, `fpPlayTick`, and the paint loop).
- A walker left in a room that was deleted is dropped, not kept.
- Editing during route playback ends the playback, including when a room is dragged.
- A seeded fuzz test drives random sessions (edits, undo and redo, tests, walks,
  hints, chapter changes) and checks the structure after every step. It found the
  walker bugs above. 60 seeds run in the suite; 800 seeds x 400 steps were run once
  during this round and passed.

Clean-up
- Shared drawing helpers (face directions, polygons, label truncation) moved to
  `src/render/util.js`; three private copies removed.
- Unused import removed; exports used only inside their own module are no longer exported.

Tests: 163 passing.

## 0.10.0 — six things: playback, transitions, hints, sharing, discoveries, menu

1. **Play the route in first person.** After a passing test, "Play route" walks the
   traveller through the route in the first-person view, one exit at a time.
   Manual turning or walking stops playback.
2. **Transitions in first person.** A turn or step dissolves in from a slight zoom
   instead of cutting. The background is opaque, so the old view never shows through.
3. **Two-step hints.** The first press gives a nudge (the chapter hint's first
   sentence), the second gives the whole hint. Hints reset with the chapter.
4. **A new discovery in The Drop.** *A passage of your own*: build a one-way passage
   yourself.
5. **Share links.** The Share link button puts the construction in the address
   (`#c=…`), copies it to the clipboard where allowed, and opens it as free
   construction when the link is visited. Bad or oversized links are refused with a
   message, never a crash.
6. **Completed chapters are ticked** in the chapter menu.

Tests: 154 passing. New suite `tests/features.test.js` covers share round-trips and
refusals, hint steps, playback to the goal, and the new discovery.

## 0.9.0 — first-person view, one-way passages

- **First-person view.** A second view of the construction, from inside a room.
  The three walls ahead, left and right are drawn in perspective: a wall, an
  open passage (with the room beyond and the heading it delivers), a shut gate,
  or a one-way passage seen from its closed side. Turn left and right, walk
  forward through an open passage, and the walker is a traveller in the same
  engine as the plan's route: gates, plates and one-way passages all behave alike.
- **One-way passages.** A passage may be crossed from one end only. Fixed
  architecture can be one way, and the player can make their own passage one way
  (the One way button, or O), cycling two-way, one way from A, one way from B.
  Traversal, route search and the first-person walker all refuse the closed side.
  The plan draws double chevrons on one-way passages, the inspector names the
  direction, and sightline cards show "one way" for a closed face.
- New chapter XVI, *The Drop*: a one-way passage from the Vault to the Ledge. The
  direct way is closed; reach the Vault from below through the Gallery's plate.
  The finale is now chapter XVII.
- Save files carry one-way direction and are validated on load.
- Tests: 146 passing. New suites cover the first-person model and walker, one-way
  traversal, setting and clearing one-way passages, and The Drop.

Known limits: the first-person view is a still perspective with turns and steps,
not a smooth animated walk. Structural loop analysis ignores one-way direction, so
a loop that can only be walked one way still counts as a loop.

## 0.8.0 — a second act: three more chapters

- New chapters, all solved and failed by the same engine that checks the goal:
  - XIII, *The Lantern Court*: a plate that only answers an arrival from the west,
    behind a gate.
  - XIV, *The Spiral Cellar*: two plates struck in order on one route; a toggle
    that needs an arrival from the east.
  - XV, *The Mirror Archive*: a latch plate, a gated passage, and a reflected
    approach that must arrive facing west.
- The finale is now chapter XVI, *Closing Construction*.
- Tests: 130 passing, with solutions and failing constructions for each new chapter.
- The campaign is now sixteen chapters. Play time has not been measured against the
  3–5 hours in the original brief, and the brief's 3D rendering and audio are still not built.

## 0.7.0 — The Reflecting Vault, perspective sightlines, bug fixes

- New chapter XII, *The Reflecting Vault*: a toggle plate in a mirror room and a
  reflecting passage. The optional *mirror-pair* discovery checks for a reflected
  cycle. The finale is now chapter XIII, *Closing Construction*.
- Sightline cards are now a one-point perspective: floor, ceiling and side walls
  recede to a far wall that names the destination and shows the arrival heading.
  Quarter-turns appear as pips; reflecting passages have a dashed far wall; gates
  are a bar on the near edge.
- Save files are validated on load. A corrupt save with a dangling portal, a
  duplicate room id or an invalid face is rejected instead of crashing the renderer.
- Dragging a room is one undo step, not one per mouse move.
- Structural analysis is memoised per structure, so it is not recomputed on every paint.
- Cycle enumeration has a work budget as a safety net.
- Clean-up: dead code removed (`turn`, `faceDelta`, `toggleObject`, `faceCount`),
  the sightline renderer takes explicit sizes instead of patching the canvas.
- Tests: 122 passing, including regression tests for each fix, a seeded
  property test over random constructions, and a chapter-data consistency check.

## 0.6.0 — two more chapters, sightline cards, a gate fix

- The Orrery: a latch plate that forces an arrival heading, with a discovery
  for a built loop that turns the route.
- The Cistern: a gated shaft that a lever opens, across a large plan distance,
  with the discovery "Six fathoms, one step" earned only once the shaft is
  actually passable.
- Sightline cards: a 3x3 drawn view around the selected room showing walls,
  passages, arrival headings and gates. The model is a pure function and tested.
- Fixed: the dimension report hid contradictions behind shut gates, which
  contradicted the documented rule that structure ignores gates. Regression test added.
- Chapters renumbered (the finale is now XII).
- 111 automated tests.

## 0.5.0 — configurations: toggle plates

- Toggle plates: each arrival facing the plate's heading flips its state. A
  toggle can start lit or unlit. The building now has configurations that
  change as you walk through it, which the brief asked for.
- The Revolving House: a chapter in which the Drum's state decides whether a
  gate opens, and the solution walks back and forth through one passage.
- Fixed a bug in the starting-state calculation: filtering the plate list
  shifted bit positions. A test now pins each plate to its own bit.
- Chapter numbering corrected (two chapters had been numbered VII).
- 101 automated tests.

## 0.4.0 — tests that search, connection editing, finale, screenshots

- Property-style tests: 120 seeded random constructions with loops, turns,
  mirrors and gates. Invariants checked: reachability matches connectivity
  when no gates are present; every route replays to its goal; cycles are closed
  walks; gated portals are never crossed without their plate; serialisation
  round-trips exactly. A guard test checks the generator covers the cases.
- Connection editing: move one end of a selected portal to another face. The
  portal keeps its transform and gate. Validated like any other construction.
- The finale now combines every mechanic: a plate, a gate, a half-turn
  passage, a required arrival heading, and a discovery (The Closed Ring).
- Goal logic is one predicate shared by the goal check and the walked route,
  so they cannot disagree. A test checks the agreement for every chapter.
- Hint button in the sidebar.
- Screenshots in docs/screenshots, generated from the running game by
  tools/capture-screenshots.mjs.
- 96 automated tests.

## 0.3.0 — object state, sightlines, architectural rendering

- Gated portals: a passage whose gate opens only when a plate has been struck
  on the current route. Gates are object state that the traversal search tracks.
- Fixed passages: part of a chapter's architecture, pre-placed, and protected
  from removal or reshaping.
- Sightlines: for a selected room, what each face leads to and the heading a
  traveller would arrive with.
- Walk the route: an animated traveller follows the test route and turns to
  the held heading at each room.
- Renderer rewritten: walls broken at doorways, hatched floors, glowing portals,
  mirror echoes, gate glyphs, heading arrows along the route.
- Per-chapter environment themes (slate, ash, dusk, verdigris, copper) and a
  fade transition when a chapter opens.
- New chapter: The Sealed Wing.
- 78 automated tests.

Not yet: three-dimensional rendering, audio, and a rendered view from inside a
room. The sightline panel is a readout, not a first-person view.

## 0.2.0 — depth: machines, loop analysis, discoveries

- Pressure plates: fixtures that light when a traveller arrives in their room
  facing a given direction. The traversal search tracks which plates are lit as
  part of its state, so a goal can require a single route that strikes several.
- Loop analysis: every cycle in a construction is reported with its length,
  net quarter-turn (mod 4), and whether it reflects space.
- Dimension report: pairs of rooms whose plan distance is large but whose walk
  is one step are flagged in the inspector.
- Optional discoveries per chapter, recorded in progress when first met.
- Three new chapters: The Mirrored Gallery (mirror required), The Machine
  (plates on one route), The Hidden Stair (a half-turn loop reveals a room).
- Graph overlay moved to the top right so it no longer hides route highlights.
- 65 automated tests, including solutions for each new chapter and failing
  constructions that must not pass.

## 0.1.0 — first playable slice of the campaign

- Spatial topology model: rooms, portals, face-to-face connections, quarter-turn
  and mirror transforms on portals, object state on rooms.
- Traversal engine: stepwise movement, breadth-first route search over
  (room, heading) states, route replay.
- Construction logic: immutable operations with rule validation (face occupancy,
  self-portals, per-chapter limits, sealed faces).
- Undo/redo via immutable snapshots.
- Five campaign chapters, goals checked by the traversal engine.
- Plan view with portal curves that show their transforms, a graph overlay for
  inspecting the topology, route highlighting for tests.
- Save slots in local storage, JSON export and import, versioned save format.
- Free-construction sandbox.
- 44 automated tests across topology, campaign, persistence, session and geometry.

Known limits: the campaign is still short (twelve chapters; play time not measured), not
the 3–5 hours in the original brief. There is no 3D rendering, no audio, and no
animated walkthrough of traversal. These are planned work, not implied features.
