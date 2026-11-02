// The first-run introduction: three short steps that teach Plan, Walk and Model by doing them, on the very
// first challenge. It never changes the game. It reads what the player has done (portals built, steps
// walked, which view is open) and says the one thing worth saying next, so it cannot get out of step with
// the game and cannot be failed. Pure, so the logic is tested without a browser.

export const INTRO_STEPS = Object.freeze(['connect', 'walk', 'model', 'finish']);
export const INTRO_CHAPTER = 'threshold';

// Context: { active, chapterId, portals, pending, steps, view, modelSeen, facing }
//   facing    a usable doorway is straight ahead of the walker
//   pending   a face has been picked and the second is awaited
//   steps     steps the walker has taken
//   view      'plan' | 'first' | 'model'
//   modelSeen the player has opened the model since crossing
// Returns null (say nothing) or { step, index, of, text, target } where `target` names the control to point at.
export function introStep(c) {
  if (!c.active || c.chapterId !== INTRO_CHAPTER) return null;
  const of = 3;
  if (c.portals === 0) {
    if (c.view !== 'plan') return { step: 'connect', index: 1, of, text: 'Plan: this is where you build. Open the Plan.', target: 'view-plan' };
    return c.pending
      ? { step: 'connect', index: 1, of, text: 'Now a dot on the other room.', target: null }
      : { step: 'connect', index: 1, of, text: 'Plan: join the two rooms. Tap Connect, then a dot on one room.', target: 'tool-connect' };
  }
  if (!(c.steps > 0)) {
    if (c.view === 'first') {
      return c.facing
        ? { step: 'walk', index: 2, of, text: 'Walk: the doorway is ahead. Press Walk, or the up arrow.', target: 'pad-fwd' }
        : { step: 'walk', index: 2, of, text: 'Walk: turn with the arrows until you face your doorway.', target: 'pad-turn' };
    }
    return { step: 'walk', index: 2, of, text: 'You built a doorway. Now walk through it: open Walk.', target: 'view-first' };
  }
  if (!c.modelSeen) {
    return c.view === 'model'
      ? null // seen: the next call (with modelSeen) finishes
      : { step: 'model', index: 3, of, text: 'You crossed. Model: see the connection you made as an arc.', target: 'view-model' };
  }
  return { step: 'finish', index: 3, of, text: 'That is the whole idea: what is connected is not what is near. Seven small buildings push it further.', target: null };
}

// Whether a saved game has played enough that the introduction would only be in the way.
export function introNeeded({ stored, hasPlayed }) {
  return stored == null && !hasPlayed;
}


// Optional follow-on lessons. Each opens a real, editable demonstration so the
// player can walk the phenomenon and inspect the same structure in the model.
export const TUTORIAL_LESSONS = Object.freeze([
  { demoId: 'distant-neighbours', title: 'Near is not connected', concept: 'A room drawn far away can be one doorway away; a room beside you can take several passages to reach.', action: 'Compare the Lodge → Observatory route with the Lodge → Annex route in the Model.' },
  { demoId: 'endless-corridor', title: 'A room can lead to itself', concept: 'A doorway can connect two faces of the same room, making a loop without adding another room.', action: 'Walk east repeatedly, then check the Plan: the corridor is still one room.' },
  { demoId: 'turning-tower', title: 'Passages can turn you', concept: 'A quarter-turn passage changes your heading as you cross it. A loop can bring you home facing another direction.', action: 'Walk the four-room ring, then trace its green arcs in the Model.' },
  { demoId: 'hall-of-mirrors', title: 'Passages can reflect you', concept: 'A mirrored passage swaps left and right. Crossing it twice restores your original orientation.', action: 'Cross the mirrored doorway, turn, then cross again and watch your orientation return.' },
  { demoId: 'one-way-spiral', title: 'A passage can be one-way', concept: 'Connections can have direction. You may be able to continue forward but not retrace your last step.', action: 'Try to walk backwards, then follow the amber arrows around the spiral in the Model.' },
  { demoId: 'two-rooms-one-place', title: 'Two rooms can share a place', concept: 'Plan coordinates are only drawing positions. Two distinct rooms can occupy the same point.', action: 'Walk north and south from the Stair to enter two different rooms at identical coordinates.' },
]);
