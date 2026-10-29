// Plain-language description of a construction, for reading and for copying.
// Pure: it reads the structure and returns sentences, nothing else.

const FACE_WORDS = { N: 'north', E: 'east', S: 'south', W: 'west' };
const TURN_WORDS = ['no turn', 'a quarter turn', 'a half turn', 'three quarter turns'];

function roomName(structure, id) {
  const r = structure.rooms.get(id);
  return r?.label || id;
}

export function describePortal(structure, p) {
  const a = `${roomName(structure, p.a.room)}'s ${FACE_WORDS[p.a.face]} side`;
  const b = `${roomName(structure, p.b.room)}'s ${FACE_WORDS[p.b.face]} side`;
  const bits = [];
  if (p.transform.turns) bits.push(TURN_WORDS[p.transform.turns]);
  if (p.transform.mirror) bits.push('mirrored');
  if (p.oneWay) bits.push(`one way, from ${p.oneWay === 'a' ? roomName(structure, p.a.room) : roomName(structure, p.b.room)}`);
  if (p.gate !== null && p.gate !== undefined) bits.push(`gated by plate ${p.gate + 1}`);
  if (p.opensAfter != null) bits.push(`opens once crate ${p.opensAfter + 1} is delivered`);
  if (p.fixed) bits.push('architecture');
  const tail = bits.length ? ` (${bits.join(', ')})` : '';
  return `${a} joins ${b}${tail}.`;
}

export function describeStructure(structure) {
  const rooms = [...structure.rooms.values()];
  const lines = [`${rooms.length} room${rooms.length === 1 ? '' : 's'}, ${structure.portals.size} portal${structure.portals.size === 1 ? '' : 's'}.`];
  for (const r of rooms) lines.push(`${r.label || r.id}: ${structure.degree(r.id)} passage${structure.degree(r.id) === 1 ? '' : 's'}.`);
  for (const p of structure.portals.values()) lines.push(describePortal(structure, p));
  return lines.join('\n');
}
