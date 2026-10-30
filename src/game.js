// Session controller: the bridge between UI intent and topology operations.
//
// It owns the current chapter, the undo history, the selection, and the
// campaign progress. It exposes intent-level actions (addRoomAt, connectFaces,
// rotatePortal, ...) that the UI calls, and it never touches the DOM or the
// canvas. This is the seam that keeps game rules testable.

import { Structure } from './topology/graph.js';
import * as C from './topology/construction.js';
import { History } from './topology/history.js';
import { findRoute, replay, makeTraveller, step, startingLit, platesLitBy } from './topology/traversal.js';
import { rotateFace } from './topology/graph.js';
import { CHAPTERS, chapterById, chapterStructure, goalSatisfied, goalPredicate, discoveriesIn, rulesFor, bodySolution } from './campaign/chapters.js';
import { searchCycles, dimensionReport } from './topology/analysis.js';
import { describeStructure } from './topology/describe.js';
import { diagnose } from './campaign/diagnose.js';
import { initialBody, move as bodyMove, bodyContext, bodyGoalMet, replayBody, DIRS } from './topology/blocks.js';

const FACE_NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' };

export class Session {
  constructor({ chapterId = CHAPTERS[0].id, progress = { completed: [], discoveries: [] } } = {}) {
    this.progress = {
      completed: [...(progress.completed ?? [])],
      discoveries: [...(progress.discoveries ?? [])],
      attempts: { ...(progress.attempts ?? {}) }, // chapter id -> tests run
      time: { ...(progress.time ?? {}) },         // chapter id -> milliseconds spent
    };
    this.sandbox = false;
    this.challenge = null; // a goal the player set in free construction: { start, to, heading, maxSteps }
    this.feedback = null; // { kind: 'info'|'error'|'success', text }
    this.selection = null; // { type: 'room', id } | { type: 'portal', id } | null
    this.pendingFace = null; // { room, face } while connecting
    this.retarget = null;    // { portalId, end } while moving a portal end
    this.routeHighlight = null; // route from the last successful test
    this.justCompleted = null;  // id of a chapter completed since the UI last looked
    this.walk = null;           // animation state for the traveller
    this.fpPlay = null;         // first-person route playback: { faces, index }
    this.hintState = null;      // { chapter, level } for two-level hints
    this.loadChapter(chapterId);
  }

  get chapter() {
    return this.sandbox ? null : chapterById(this.chapterIdValue);
  }

  get ruleset() {
    return this.chapter?.ruleset ?? C.UNRESTRICTED;
  }

  get structure() {
    return this.history.current;
  }

  // Environment palette for the current chapter; sandbox uses the default.
  get themeName() {
    return this.chapter?.theme ?? 'slate';
  }

  // The traveller's walk along the test route. `progress` runs 0..steps.
  startWalk() {
    if (!this.routeHighlight) return false;
    this.walk = { progress: 0, steps: this.routeHighlight.faces.length };
    return true;
  }

  stopWalk() {
    this.walk = null;
  }

  loadChapter(chapterId) {
    const chapter = chapterById(chapterId) ?? CHAPTERS[0];
    this.sandbox = false;
    this.chapterIdValue = chapter.id;
    this.history = new History(chapterStructure(chapter));
    this.clearTransient();
    this.feedback = { kind: 'info', text: chapter.blurb };
  }

  startSandbox() {
    this.sandbox = true;
    this.challenge = null;
    this.chapterIdValue = null;
    this.history = new History(new Structure());
    this.clearTransient();
    this.feedback = { kind: 'info', text: 'Free construction. No goal, no limits.' };
  }

  // Replaces the construction with a loaded one. With `undoable`, and when the load
  // is for the same chapter (or free construction) as now, undo brings the old
  // construction back; otherwise the history starts again.
  loadStructure(structure, chapterId = null, { undoable = false, challenge = null } = {}) {
    const sameMode = chapterId && chapterById(chapterId)
      ? !this.sandbox && this.chapterIdValue === chapterId
      : this.sandbox && !chapterId;
    if (chapterId && chapterById(chapterId)) {
      this.sandbox = false;
      this.chapterIdValue = chapterId;
    } else {
      this.sandbox = true;
      this.chapterIdValue = null;
    }
    if (undoable && sameMode) this.history.push(structure);
    else this.history = new History(structure);
    this.challenge = this.sandbox ? challenge : null;
    this.clearTransient();
    this.feedback = { kind: 'success', text: 'Structure loaded.' };
  }

  // A goal of the player's own, set in free construction. Tested by the same engine as
  // the campaign: a route search over the real graph.
  setChallenge({ start, to, heading = null, maxSteps = null }) {
    if (!this.sandbox) return false;
    if (!this.structure.rooms.has(start) || !this.structure.rooms.has(to)) {
      this.feedback = { kind: 'error', text: 'A challenge needs a start room and a goal room that exist.' };
      return false;
    }
    if (start === to && !heading) {
      this.feedback = { kind: 'error', text: 'Start and goal are the same room; give a heading or choose another room.' };
      return false;
    }
    this.challenge = { start, to, heading, maxSteps };
    this.routeHighlight = null;
    this.feedback = { kind: 'info', text: `Challenge set: reach ${this.structure.rooms.get(to).label || to} from ${this.structure.rooms.get(start).label || start}${heading ? `, facing ${heading}` : ''}${maxSteps ? `, in at most ${maxSteps} step${maxSteps === 1 ? '' : 's'}` : ''}. Test construction checks it.` };
    return true;
  }

  clearChallenge() {
    this.challenge = null;
    this.routeHighlight = null;
  }

  // The challenge as a chapter-shaped record, so every campaign check applies unchanged.
  challengeAsChapter() {
    const c = this.challenge;
    if (!c) return null;
    const kind = c.heading ? 'arrive' : c.maxSteps ? 'shortcut' : 'reach';
    return { id: 'sandbox-challenge', title: 'Your challenge', start: c.start, plates: [], cargo: [], pads: [], ruleset: C.UNRESTRICTED, hint: 'Join the rooms so that a route exists.', goal: { kind, to: c.to, heading: c.heading ?? undefined, maxSteps: c.maxSteps ?? undefined } };
  }

  // Starts the current chapter again. Undo brings back the construction it replaces.
  restartChapter() {
    if (this.sandbox || !this.chapter) return false;
    this.history.push(chapterStructure(this.chapter));
    this.clearTransient();
    this.feedback = { kind: 'info', text: this.chapter.blurb };
    return true;
  }

  clearTransient() {
    this.selection = null;
    this.pendingFace = null;
    this.retarget = null;
    this.routeHighlight = null;
    this.walk = null;
    this.fp = null; // the first-person walker starts again on every new structure
    this.fpPlay = null;
  }

  // Applies an operation result. Returns true if the structure changed.
  apply(result, successText = null) {
    this.fpPlay = null; // an edit ends route playback: the route no longer matches
    if (this.chapter?.physical && !result.error) this.fp = null; // a changed building starts the body, and its blocks, again
    if (result.error) {
      this.feedback = { kind: 'error', text: explain(result) };
      return false;
    }
    const changed = this.history.push(result.structure);
    if (changed && successText) this.feedback = { kind: 'info', text: successText };
    this.routeHighlight = null;
    this.walk = null;
    this.checkCompletion();
    return changed;
  }

  addRoomAt(x, y) {
    const r = C.addRoom(this.structure, { x, y, label: '' }, this.ruleset);
    if (!r.error) {
      const newest = [...r.structure.rooms.keys()].pop();
      this.selection = { type: 'room', id: newest };
    }
    return this.apply(r, 'Room added.');
  }

  // A drag is many moves but one undoable change. Between beginGesture and
  // endGesture, each move replaces the entry the gesture created.
  beginGesture() {
    this.gesturePushed = false;
  }

  endGesture() {
    this.gesturePushed = false;
  }

  // Forgets every chapter's progress. The current construction is kept.
  resetProgress() {
    this.progress = { completed: [], discoveries: [], attempts: {}, time: {} };
    this.feedback = { kind: 'info', text: 'Campaign progress cleared. Your construction is unchanged.' };
  }

  // Adds time spent on the current chapter. Free construction is not timed.
  addTime(ms) {
    if (this.sandbox || !this.chapter || !(ms > 0)) return;
    const id = this.chapter.id;
    this.progress.time[id] = (this.progress.time[id] ?? 0) + ms;
  }

  // Moves the selection to the next (+1) or previous (-1) room, in id order.
  selectRoomStep(delta) {
    const ids = [...this.structure.rooms.keys()].sort();
    if (ids.length === 0) return false;
    const cur = this.selection?.type === 'room' ? ids.indexOf(this.selection.id) : -1;
    const next = ids[(cur + delta + ids.length) % ids.length];
    this.selectRoom(next);
    return true;
  }

  renameRoom(id, label) {
    return this.apply(C.renameRoom(this.structure, id, label, this.ruleset), 'Room renamed.');
  }

  setRoomKind(id, kind) {
    return this.apply(C.setRoomKind(this.structure, id, kind, this.ruleset), `Room is now a ${kind}.`);
  }

  setRoomSize(id, size) {
    const label = size < 1 ? 'small' : size > 1 ? 'large' : 'standard';
    return this.apply(C.setRoomSize(this.structure, id, size, this.ruleset), `Room is now ${label}.`);
  }

  // Turns the room in the plan. Its connections keep the same faces, so this changes
  // how the plan looks and nothing the traveller can do.
  turnRoom(id) {
    return this.apply(C.turnRoom(this.structure, id, this.ruleset), 'Room turned. Its doors keep their faces.');
  }

  describe() {
    return describeStructure(this.structure);
  }

  // Moves the room one grid step; each nudge is its own undo step.
  nudgeRoom(id, dx, dy) {
    const room = this.structure.rooms.get(id);
    if (!room) return false;
    this.beginGesture();
    const changed = this.moveRoom(id, room.x + dx, room.y + dy);
    this.endGesture();
    return changed;
  }

  moveRoom(id, x, y) {
    const result = C.moveRoom(this.structure, id, x, y, this.ruleset);
    if (result.error || !this.gesturePushed) {
      const changed = this.apply(result);
      if (!result.error && changed) this.gesturePushed = true;
      return changed;
    }
    if (result.structure === this.structure) return false;
    this.history.replaceCurrent(result.structure);
    this.routeHighlight = null;
    this.walk = null;
    this.fpPlay = null;
    this.checkCompletion();
    return true;
  }

  deleteSelection() {
    const sel = this.selection;
    if (!sel) return false;
    const result = sel.type === 'room'
      ? C.removeRoom(this.structure, sel.id, this.ruleset)
      : C.disconnect(this.structure, sel.id, this.ruleset);
    this.selection = null;
    return this.apply(result, sel.type === 'room' ? 'Room removed.' : 'Portal removed.');
  }

  // Move one end of the selected portal. The next face picked becomes its new
  // attachment point. Escape or re-selecting cancels.
  beginRetarget(end = 'b') {
    if (!this.selection || this.selection.type !== 'portal') {
      this.feedback = { kind: 'error', text: 'Select a portal first.' };
      return false;
    }
    this.retarget = { portalId: this.selection.id, end };
    this.pendingFace = null;
    this.feedback = { kind: 'info', text: `Pick the new face for the ${end === 'a' ? 'start' : 'end'} of this portal.` };
    return true;
  }

  // Connect-tool interaction: first click picks a face, second click joins.
  pickFace(room, face) {
    if (this.retarget) {
      const r = this.retarget;
      this.retarget = null;
      const result = C.retargetPortal(this.structure, r.portalId, r.end, room, face, this.ruleset);
      return this.apply(result, 'Portal moved.');
    }
    if (this.pendingFace && this.pendingFace.room === room && this.pendingFace.face === face) {
      this.pendingFace = null;
      this.feedback = { kind: 'info', text: 'Connection cancelled.' };
      return false;
    }
    if (!this.pendingFace) {
      this.pendingFace = { room, face };
      this.feedback = { kind: 'info', text: `Now choose the face to join with ${room}.${face}.` };
      return false;
    }
    const from = this.pendingFace;
    this.pendingFace = null;
    const result = C.connect(this.structure, { a: from.room, aFace: from.face, b: room, bFace: face }, this.ruleset);
    return this.apply(result, 'Portal connected.');
  }

  selectRoom(id) {
    this.selection = id ? { type: 'room', id } : null; // no id clears the selection
    this.feedback = null;
  }

  selectPortal(id) {
    this.selection = { type: 'portal', id };
    this.feedback = null;
  }

  rotateSelectedPortal() {
    const sel = this.selection;
    if (!sel || sel.type !== 'portal') return false;
    const p = this.structure.portals.get(sel.id);
    return this.apply(C.reshapePortal(this.structure, sel.id, { turns: p.transform.turns + 1 }, this.ruleset), 'Portal turned a quarter.');
  }

  mirrorSelectedPortal() {
    const sel = this.selection;
    if (!sel || sel.type !== 'portal') return false;
    const p = this.structure.portals.get(sel.id);
    return this.apply(C.reshapePortal(this.structure, sel.id, { mirror: !p.transform.mirror }, this.ruleset), 'Portal mirror toggled.');
  }

  // Cycles a player-built passage through two-way, one way from A, one way
  // from B. Fixed passages cannot be changed.
  reverseOneWay() {
    const sel = this.selection;
    if (!sel || sel.type !== 'portal') return false;
    const p = this.structure.portals.get(sel.id);
    if (!p || p.oneWay == null || p.fixed) {
      return this.apply(C.reverseOneWay(this.structure, sel.id, this.ruleset));
    }
    // The flipped end is where the passage may now be crossed from.
    const startEnd = p.oneWay === 'a' ? p.b : p.a;
    const from = this.structure.rooms.get(startEnd.room);
    return this.apply(
      C.reverseOneWay(this.structure, sel.id, this.ruleset),
      `Passage reversed: it may now only be crossed from ${from.label || from.id}.`,
    );
  }

  // A copy of a room, placed one grid step away. Its label is copied (shortened if
  // needed) and it has no portals: the copy is an empty room to build with.
  duplicateRoom(id) {
    const r = this.structure.rooms.get(id);
    if (!r) return false;
    const label = r.label ? `${r.label} copy`.slice(0, C.LABEL_LIMIT) : '';
    const res = C.addRoom(this.structure, { x: r.x + 1, y: r.y + 1, label }, this.ruleset);
    if (!res.error) {
      this.selection = { type: 'room', id: [...res.structure.rooms.keys()].pop() };
    }
    return this.apply(res, 'Room duplicated.');
  }

  cycleOneWay() {
    const sel = this.selection;
    if (!sel || sel.type !== 'portal') return false;
    const p = this.structure.portals.get(sel.id);
    const next = p.oneWay == null ? 'a' : p.oneWay === 'a' ? 'b' : null;
    const from = next === null ? null : this.structure.rooms.get(next === 'a' ? p.a.room : p.b.room);
    const text = next === null
      ? 'Passage is two-way again.'
      : `Passage is one way: it may only be crossed from ${from.label || from.id}.`;
    return this.apply(C.setOneWay(this.structure, sel.id, next, this.ruleset), text);
  }

  // First-person walk. The walker is a traveller in the same engine as the
  // plan's route, so walls, gates, one-way passages and plates all behave alike.
  startFirstPerson() {
    const start = this.chapter?.start && this.structure.rooms.has(this.chapter.start)
      ? this.chapter.start
      : [...this.structure.rooms.keys()][0];
    if (!start) {
      this.fp = null; // nowhere to stand: drop any walker left from a deleted room
      return false;
    }
    if (this.chapter?.physical) {
      // A physical challenge: the walker is a body on a grid, with blocks to push.
      this.fp = { ...initialBody(this.structure, this.chapter), delivered: 0, carry: -1, headings: ['N'] };
      return true;
    }
    const rules = this.chapter ? rulesFor(this.chapter) : { plates: [], cargo: [], depot: null, pads: [] };
    const t = makeTraveller(start, 'N', { cargo: rules.cargo, depot: rules.depot, pads: rules.pads });
    t.lit = startingLit(rules.plates, start);
    this.fp = t;
    return true;
  }

  // The walker, starting one if needed. Null only when there is no room to stand in.
  fpEnsure() {
    if (!this.fp || !this.structure.rooms.has(this.fp.room)) this.startFirstPerson();
    return this.fp;
  }

  fpTurn(dir) {
    if (!this.fpEnsure()) return false;
    this.fp = { ...this.fp, heading: rotateFace(this.fp.heading, dir === 'right' ? 1 : -1) };
    return true;
  }

  // Walk forward through the wall ahead. Returns true if the walker moved.
  fpForward() {
    if (!this.fpEnsure()) return false;
    if (this.chapter?.physical) return this.bodyStep(this.fp.heading);
    const plates = this.chapter?.plates ?? [];
    const next = step(this.structure, this.fp, this.fp.heading);
    if (!next) {
      const exit = this.structure.exit(this.fp.room, this.fp.heading);
      this.feedback = {
        kind: 'error',
        text: !exit
          ? 'A solid wall. Turn to find a way through.'
          : exit.blocked
            ? 'One way: this passage cannot be crossed from this side.'
            : exit.opensAfter != null
              ? `Shut. It opens once crate ${exit.opensAfter + 1} is delivered.`
              : `Shut. Its plate (${exit.gate + 1}) is not lit on this walk.`,
      };
      return false;
    }
    next.lit = platesLitBy(plates, next.room, next.heading, next.lit);
    this.fp = next;
    this.feedback = { kind: 'info', text: `In ${this.structure.rooms.get(next.room).label || next.room}, facing ${next.heading}.` };
    const deed = cargoEventText(this.structure, this.chapter, next.events);
    if (deed) this.feedback = { kind: 'success', text: `${deed} ${this.feedback.text}` };
    return true;
  }

  // Where each crate is right now, for drawing. Before a walk they sit at their
  // starts. During a walk they follow the walked route: a crate is with the
  // traveller while carried, at the depot once delivered, and otherwise where it lies.
  cratePositions() {
    const chapter = this.chapter;
    const crates = chapter?.cargo ?? [];
    if (!crates.length) return [];
    let state = null;
    const route = this.routeHighlight;
    if (this.walk && route) {
      const n = Math.min(route.faces.length, Math.floor(this.walk.progress));
      state = replay(this.structure, chapter.start, route.faces.slice(0, n), rulesFor(chapter)).traveller;
    }
    return crates.map((c, i) => {
      if (state && state.carry === i) return { room: state.room, carried: true };
      if (state && (state.delivered & (1 << i))) return { room: chapter.goal.to, carried: false };
      if (state) return { room: state.where[i], carried: false };
      return { room: c.room, carried: false };
    });
  }

  // Field notes for the current chapter: each optional discovery, with its text
  // once the player has found it and its title only before that.
  fieldNotes() {
    if (this.sandbox || !this.chapter) return [];
    return (this.chapter.optional ?? []).map((d) => {
      const found = this.progress.discoveries.includes(d.id);
      return { id: d.id, title: d.title, found, text: found ? d.text : null };
    });
  }

  // ---- physical play ----------------------------------------------------------------------

  get physical() {
    return !!this.chapter?.physical;
  }

  // One step on the grid in a compass direction (the heading is kept unless a passage turns it).
  bodyStep(dir) {
    const chapter = this.chapter;
    const ctx = bodyContext(chapter);
    const r = bodyMove(this.structure, this.fp, dir, ctx);
    this.lastBody = null;
    if (r.error) {
      const why = {
        wall: 'A wall.',
        solid: 'A pillar is in the way.',
        block: 'The block will not move: something is behind it.',
        full: 'The block on the other side has nowhere to go.',
        shut: 'The gate is shut. Something must hold its plate down.',
        oneway: 'This passage only goes the other way.',
      }[r.error] ?? 'You cannot go that way.';
      this.feedback = { kind: 'error', text: why };
      this.lastBody = { error: r.error };
      return false;
    }
    this.fp = { ...r.state, delivered: 0, carry: -1, headings: this.fp.headings, lastDir: dir };
    this.lastBody = { push: r.push ?? null, crossed: r.crossed ?? null };
    const name = (id) => this.structure.rooms.get(id)?.label || id;
    this.feedback = r.push
      ? { kind: 'info', text: r.push.to.room !== r.push.from.room ? `Pushed the block through into ${name(r.push.to.room)}.` : 'Pushed the block.' }
      : { kind: 'info', text: `In ${name(this.fp.room)}, facing ${this.fp.heading}.` };
    if (bodyGoalMet(this.fp, chapter, ctx)) {
      // Objectives earned by playing: finishing in few enough moves.
      for (const o of chapter.optional ?? []) {
        if (o.bonusMoves && this.fp.steps <= o.bonusMoves && !this.progress.discoveries.includes(o.id)) {
          this.progress.discoveries.push(o.id);
          this.feedback = { kind: 'success', text: `Discovered: ${o.title}. ${o.text}` };
        }
      }
    }
    if (bodyGoalMet(this.fp, chapter, ctx) && !this.progress.completed.includes(chapter.id)) {
      this.progress.completed.push(chapter.id);
      this.justCompleted = chapter.id;
      this.feedback = { kind: 'success', text: `${chapter.title} complete.` };
    }
    return true;
  }

  // One step backward: the opposite direction, without turning round.
  fpBack() {
    if (!this.fpEnsure() || !this.chapter?.physical) return false;
    return this.bodyStep(rotateFace(this.fp.heading, 2));
  }

  // The blocks, for drawing: where each stands now, on the grid.
  bodyBlocks() {
    if (!this.chapter?.physical) return [];
    return (this.fp ?? initialBody(this.structure, this.chapter)).blocks.map((b, i) => ({ id: `block:${i}`, room: b.room, cell: b.cell }));
  }

  // Plays the test route in the first-person view: the walker turns to each
  // exit in turn and walks through it. Needs a route from a passing test.
  fpPlayRoute() {
    if (!this.routeHighlight) return false;
    this.startFirstPerson();
    this.fpPlay = { faces: [...this.routeHighlight.faces], index: 0 };
    this.feedback = { kind: 'info', text: 'Walking the route in first person.' };
    return true;
  }

  // One step of playback. Returns true while there is more to play.
  fpPlayTick() {
    if (!this.fpPlay) return false;
    if (this.fpPlay.index >= this.fpPlay.faces.length) {
      this.fpPlay = null;
      this.feedback = { kind: 'success', text: 'The walker has reached the end of the route.' };
      return false;
    }
    const face = this.fpPlay.faces[this.fpPlay.index++];
    if (!this.fpEnsure()) {
      this.fpPlay = null;
      return false;
    }
    this.fp = { ...this.fp, heading: face };
    if (!this.fpForward()) {
      this.fpPlay = null;
      return false;
    }
    return this.fpPlay !== null;
  }

  fpStopPlay() {
    this.fpPlay = null;
  }

  // Hints come in two steps. The first press gives a nudge (the first sentence
  // of the chapter's hint); the second gives the whole hint.
  nextHint() {
    if (this.sandbox || !this.chapter) {
      this.feedback = { kind: 'info', text: 'Free construction has no hints. Build what you like and test it.' };
      return;
    }
    const id = this.chapter.id;
    const level = this.hintState?.chapter === id ? this.hintState.level : 0;
    const sentences = this.chapter.hint.split(/(?<=\.)\s+/);
    const text = level === 0 && sentences.length > 1 ? sentences[0] : this.chapter.hint;
    this.hintState = { chapter: id, level: Math.min(level + 1, 1) };
    this.feedback = { kind: 'info', text: `${level === 0 ? 'A nudge' : 'Hint'}: ${text}` };
  }

  // The test route as plain text, one line per passage crossed.
  routeText() {
    const route = this.routeHighlight;
    if (!route) return null;
    const name = (id) => this.structure.rooms.get(id)?.label || id;
    const lines = route.faces.map((face, i) => {
      const from = route.trail[i];
      const to = route.trail[i + 1];
      return `${i + 1}. Leave ${name(from)} by its ${FACE_NAMES[face]} side; arrive in ${name(to)} facing ${route.headings[i + 1]}.`;
    });
    return lines.join('\n');
  }

  // Opens a construction that arrived as a share link, as a free construction.
  loadShared(structure) {
    this.loadStructure(structure, null);
    this.feedback = { kind: 'success', text: 'Shared construction loaded in free construction.' };
  }

  undo() {
    this.history.undo();
    this.clearTransient();
    this.feedback = { kind: 'info', text: 'Undone.' };
  }

  redo() {
    this.history.redo();
    this.clearTransient();
    this.feedback = { kind: 'info', text: 'Redone.' };
  }

  // Walks the shortest route from the chapter start that satisfies the goal.
  // Used by the Test button; the answer comes from the traversal engine.
  testConstruction() {
    if (!this.sandbox && this.chapter) {
      const id = this.chapter.id;
      this.progress.attempts[id] = (this.progress.attempts[id] ?? 0) + 1;
    }
    if (this.sandbox && this.challenge) {
      const pseudo = this.challengeAsChapter();
      if (!this.structure.rooms.has(pseudo.start) || !this.structure.rooms.has(pseudo.goal.to)) {
        this.challenge = null;
        this.feedback = { kind: 'error', text: 'The challenge named a room that is gone, so it was cleared.' };
        return;
      }
      if (goalSatisfied(this.structure, pseudo)) {
        this.routeHighlight = routeFor(this.structure, pseudo);
        this.feedback = { kind: 'success', text: 'Your challenge is solved by this construction.' };
      } else {
        this.routeHighlight = null;
        this.feedback = { kind: 'error', text: `Your challenge is not solved. ${diagnose(this.structure, pseudo).join(' ')}` };
      }
      return;
    }
    if (this.sandbox) {
      const rooms = [...this.structure.rooms.keys()];
      if (rooms.length === 0) {
        this.feedback = { kind: 'error', text: 'Nothing to test yet.' };
        return;
      }
      const from = rooms[0];
      let reachable = 0;
      for (const r of rooms) {
        if (r !== from && findRoute(this.structure, from, (t) => t.room === r)) reachable++;
      }
      this.feedback = { kind: 'info', text: `From ${from}, ${reachable} of ${rooms.length - 1} other rooms are reachable.` };
      return;
    }
    const chapter = this.chapter;
    if (chapter.physical) {
      const sol = bodySolution(this.structure, chapter);
      if (sol && !sol.exceeded) {
        const replay = replayBody(this.structure, chapter, sol.moves);
        const portals = [];
        let room = chapter.start;
        let st = initialBody(this.structure, chapter);
        const ctx = bodyContext(chapter);
        for (const d of sol.moves) {
          const r = bodyMove(this.structure, st, d, ctx);
          if (r.crossed) { const e = this.structure.exit(room, r.crossed.face); if (e) portals.push(e.portalId); room = r.crossed.to; }
          st = r.state;
        }
        this.routeHighlight = { faces: sol.moves, portals, trail: replay.state.trail, headings: [], delivered: 0, physical: true };
        this.feedback = { kind: 'success', text: `A solution exists: ${sol.moves.length} moves and ${replay.state.pushes} pushes. Play route shows it; or walk it yourself.` };
      } else {
        this.routeHighlight = null;
        this.feedback = { kind: 'error', text: sol?.exceeded ? 'The search for a solution gave up: the construction is very open.' : `No sequence of moves solves it yet. ${diagnose(this.structure, chapter).join(' ')}` };
      }
      return;
    }
    if (goalSatisfied(this.structure, chapter)) {
      this.feedback = { kind: 'success', text: 'The construction functions. Goal met.' };
      this.routeHighlight = routeFor(this.structure, chapter);
      return;
    }
    this.routeHighlight = null;
    this.feedback = { kind: 'error', text: `Goal not met. ${diagnose(this.structure, chapter).join(' ')}` };
  }

  checkCompletion() {
    if (this.sandbox || !this.chapter) return;
    const chapter = this.chapter;
    const found = discoveriesIn(this.structure, chapter);
    for (const id of found) {
      if (!this.progress.discoveries.includes(id)) {
        this.progress.discoveries.push(id);
        const d = chapter.optional.find((o) => o.id === id);
        this.feedback = { kind: 'success', text: `Discovered: ${d.title}. ${d.text}` };
      }
    }
    if (!chapter.physical && goalSatisfied(this.structure, chapter) && !this.progress.completed.includes(chapter.id)) {
      this.progress.completed.push(chapter.id);
      this.justCompleted = chapter.id; // read once by the UI, which shows the completion card
      this.feedback = { kind: 'success', text: `${chapter.title} complete.` };
    }
  }

  // Read-only analysis for the inspector: loops and plan-versus-building distances.
  // Memoised per structure: the panel refreshes on every pointer move, but the
  // analysis only needs recomputing when the construction changes.
  analysis() {
    const s = this.structure;
    if (this.analysisCache && this.analysisCache.structure === s) return this.analysisCache.value;
    const loops = searchCycles(s);
    const value = {
      loops: loops.cycles,
      loopsComplete: loops.complete,
      loopsReason: loops.reason,
      distances: dimensionReport(s).filter((d) => d.reachable),
    };
    this.analysisCache = { structure: s, value };
    return value;
  }

  previousChapterId() {
    if (this.sandbox) return null;
    const i = CHAPTERS.findIndex((c) => c.id === this.chapterIdValue);
    return i > 0 ? CHAPTERS[i - 1].id : null;
  }

  // Empties a free construction. Undoable. Chapters are restarted instead, since
  // their fixed passages are part of the chapter.
  clearConstruction() {
    if (!this.sandbox) return false;
    this.selection = null;
    this.pendingFace = null;
    this.retarget = null;
    return this.apply({ structure: new Structure() }, 'Cleared. Undo brings it back.');
  }

  nextChapterId() {
    if (this.sandbox) return null;
    const i = CHAPTERS.findIndex((c) => c.id === this.chapterIdValue);
    return CHAPTERS[i + 1]?.id ?? null;
  }

  isFinished() {
    return CHAPTERS.every((c) => this.progress.completed.includes(c.id));
  }
}

// The route the traveller takes to satisfy the goal, as faces to walk and the
// portal ids crossed, so the renderer can highlight the actual path.
// The route the traveller takes to satisfy the goal: the faces walked, the
// portals crossed, the rooms visited, and the heading held at each room. The
// renderer uses these to animate the traveller turning at every portal.
export function routeFor(structure, chapter) {
  const pred = goalPredicate(chapter);
  if (!pred) return null;
  const rules = rulesFor(chapter);
  const faces = findRoute(structure, chapter.start, pred, rules);
  if (!faces) return null;
  const result = replay(structure, chapter.start, faces, rules);
  const t = result.traveller;
  return { faces, portals: t.portals ?? [], trail: t.trail, headings: t.headings, delivered: t.delivered ?? 0 };
}

// A plain sentence for what a crate did on the last arrival, or '' if nothing happened.
export function cargoEventText(structure, chapter, events = []) {
  const crates = chapter?.cargo ?? [];
  const name = (room) => structure.rooms.get(room)?.label || room;
  return events.map((e) => {
    const crate = crates[e.index]?.name ?? 'crate';
    if (e.type === 'pickup') return `Picked up the ${crate} in ${name(e.room)}.`;
    if (e.type === 'setdown') return `Set the ${crate} down in ${name(e.room)}. It waits there until you come back for it.`;
    return `Delivered the ${crate} to ${name(e.room)}, facing ${e.heading}.`;
  }).join(' ');
}

function explain(result) {
  if (result.violations?.length) {
    return result.violations[0].message;
  }
  return result.message ?? 'That construction is not allowed.';
}

