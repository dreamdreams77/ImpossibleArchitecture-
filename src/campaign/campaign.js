// The campaign: six chapters, each an architectural discipline, each a short run
// of challenges. This file is the arc: what order things are learned in, what
// each chapter says when it opens and when it is finished, and what the ending
// says about the building the player actually made. Challenges themselves are
// data in chapters.js and extra.js; this file only arranges them.

export const PREMISE = 'In the Concordance, space is not a place but an agreement. Every room agrees which others are its neighbours, and a building is nothing more than the set of its agreements. You are an architect of those agreements.';

export const DISCIPLINES = Object.freeze([
  {
    no: 1,
    id: 'first-connection',
    title: 'The First Connection',
    style: 'threshold',
    theme: 'slate',
    intro: 'A building is not its walls but its agreements. Begin with the smallest one: two rooms that agree to be neighbours, wherever the plan draws them.',
    outro: 'Two rooms, one doorway: the whole of architecture, once. A passage joins any face to any face, and the plan was only ever a drawing.',
    challenges: ['threshold', 'the-two-doors', 'twisted-stair', 'the-far-wing', 'mirrored-gallery'],
  },
  {
    no: 2,
    id: 'architecture-of-return',
    title: 'The Architecture of Return',
    style: 'return',
    theme: 'ash',
    intro: 'A passage that leads back to its own beginning is not a mistake. It is how a room remembers where it has been, and what it turned you into on the way.',
    outro: 'A loop is not a corridor that circles. It is a relationship that changes you each time you complete it, and now you can build the change you want.',
    challenges: ['returning-hall', 'the-turned-nave', 'hidden-stair', 'the-orrery', 'spiral-cellar'],
  },
  {
    no: 3,
    id: 'rooms-that-should-not-fit',
    title: 'The Rooms That Should Not Fit',
    style: 'monument',
    theme: 'dusk',
    intro: 'The plan says the cupboard is small. The building does not read plans. Here, how far apart two rooms are drawn tells you nothing about how far apart they are.',
    outro: 'You have stopped asking where a room is and begun asking what it is joined to. That is the whole of topology, and it is enough to put a house in a cupboard.',
    challenges: ['contradiction', 'the-cistern', 'the-long-corridor', 'reflecting-vault', 'the-cupboard'],
  },
  {
    no: 4,
    id: 'mechanical-interior',
    title: 'The Mechanical Interior',
    style: 'mechanical',
    theme: 'copper',
    intro: 'Some rooms do things. The building has hands now: plates that wait to be struck, gates that wait to be opened, crates that must be carried and set down.',
    outro: 'A mechanism is a route taken in the right order, facing the right way. Your constructions no longer only connect: they work.',
    challenges: ['the-machine', 'sealed-wing', 'the-first-push', 'revolving-house', 'the-wheel', 'the-weighted-gate', 'the-freight', 'the-pad-room'],
  },
  {
    no: 5,
    id: 'structure-with-two-truths',
    title: 'The Structure With Two Truths',
    style: 'twotruths',
    theme: 'verdigris',
    intro: 'A building can hold two readings at once, and they may compete. Some passages never open back; some rooms must never touch. Choose how, and live with both.',
    outro: 'You have built structures that agree with themselves in two ways at once. Nothing is left to learn except how to use all of it together.',
    challenges: ['lantern-court', 'two-keys', 'the-stillwater', 'the-drop', 'mirror-archive', 'the-long-push', 'the-seam'],
  },
  {
    no: 6,
    id: 'last-construction',
    title: 'The Last Construction',
    style: 'final',
    theme: 'dusk',
    intro: 'Everything you know, in one building. Loops and turns, mirrors and gates, plates and crates. When it stands, it opens the Concordance.',
    outro: 'It stands.',
    challenges: ['the-sealed-vault', 'the-ring-hall', 'the-moving-day', 'final-construction', 'the-last-construction'],
  },
]);

export const ORDER = Object.freeze(DISCIPLINES.flatMap((d) => d.challenges));

export function disciplineOf(challengeId) {
  return DISCIPLINES.find((d) => d.challenges.includes(challengeId)) ?? null;
}

// The position of a challenge within its chapter, 1-based, and the chapter's size.
export function placeInChapter(challengeId) {
  const d = disciplineOf(challengeId);
  if (!d) return null;
  return { chapter: d, index: d.challenges.indexOf(challengeId) + 1, of: d.challenges.length };
}

export function isFirstOfChapter(challengeId) {
  const p = placeInChapter(challengeId);
  return !!p && p.index === 1;
}

export function isLastOfChapter(challengeId) {
  const p = placeInChapter(challengeId);
  return !!p && p.index === p.of;
}

// What the player's own final building says about them. Every figure comes from
// the structure and the progress record, so the ending cannot be the same twice.
export function endingFor(structure, progress = { completed: [], discoveries: [] }, { timeMs = 0 } = {}) {
  const portals = [...structure.portals.values()];
  const player = portals.filter((p) => !p.fixed);
  const turning = player.filter((p) => (p.transform.turns ?? 0) !== 0).length;
  const mirrored = player.filter((p) => p.transform.mirror).length;
  const selfLinks = player.filter((p) => p.a.room === p.b.room).length;
  let widest = 0;
  let widestPair = null;
  const ids = [...structure.rooms.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = structure.apparentDistance(ids[i], ids[j]);
      if (d > widest) { widest = d; widestPair = [ids[i], ids[j]]; }
    }
  }
  const name = (id) => structure.rooms.get(id)?.label || id;
  const minutes = Math.max(1, Math.round(timeMs / 60000));
  const lines = [
    'The last crate is set down facing east, and the Depot answers.',
    `You built it from ${structure.rooms.size} rooms and ${player.length} passages of your own.`,
  ];
  if (turning) lines.push(`${turning} of them turn whoever crosses.`);
  if (mirrored) lines.push(`${mirrored} reflect them.`);
  if (selfLinks) lines.push(`${selfLinks} lead a room back into itself.`);
  if (widestPair) lines.push(`${name(widestPair[0])} and ${name(widestPair[1])} are drawn ${widest.toFixed(1)} units apart on the plan. In the building they are neighbours of neighbours.`);
  lines.push(`Across the Concordance you found ${progress.discoveries.length} hidden thing${progress.discoveries.length === 1 ? '' : 's'}, in about ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  return {
    heading: 'It stands.',
    lines,
    closing: 'A building is a system of possible experiences. Change its topology and you change what it means. You have changed what the Concordance means, and every room you ever joined is now a neighbour of the next.',
  };
}
