# The spatial model

## The central idea

A room's apparent position on the plan is for drawing only. Whether you can
walk from one room to another is decided by portals alone.

- A **Room** has an id, a plan position (`x`, `y`), a label, and a set of object ids.
- A **Portal** joins one face of room A to one face of room B. Faces are N, E, S, W.
  A portal may join a room to itself, including via two different faces.
- A portal's **transform** has `turns` (0–3 quarter-turns) and `mirror` (boolean).

## Traversal

The traveller's state is `(room, heading, mirrored)`: where they are, which way they face, and their
reflection parity (whether their left and right are exchanged).

Each portal is a map between the two rooms' compasses, an element of the symmetry group of the square:

- **Straight in.** Leaving through face `f` of A, the traveller enters B through the portal's face `g`
  and faces straight into the room: the opposite of `g`.
- **Mirror.** A mirrored portal reflects across the line of travel. The traveller still walks straight
  in (a mirror never turns anyone round), but their handedness flips: `mirrored` toggles. In the walk
  view the picture is shown as its mirror image from that moment, and turning left or right goes the
  other way round the compass, so what you saw through the mirrored doorway is exactly what you see
  once through it. A second mirror restores you.
- **Turns.** The traveller is then turned by the portal's quarter turns (clockwise seen from above).

Crossing from the portal's `b` end applies the inverse map. For a plain twisted portal that means the
turn is undone on the way back (`-turns`); a reflection combined with a rotation is its own inverse, so a
mirrored twisted portal turns the same way from either end. Walking through a portal and back through it
is therefore always the identity on the traveller's frame, and a chain of crossings composes as the
product of the maps, with parity the product of their signs.

`tests/passage-algebra.test.js` checks all of this against an independent model (compass vectors and 2x2
matrices), for every face pair, turn and mirror, both directions, self-loops, random chains, and the 3D
crossing matrices the walk view uses (whose determinant is negative exactly when the portal mirrors).

Because the arrival heading comes from the portal, not from how you approached, the same portal always
produces the same heading. A loop with a quarter-turn therefore returns you to its own room facing a fixed,
different direction, and a loop with one mirror returns you as your own reflection. Goals and plates may
ask for a heading, a parity, or both.

## Verifying a construction

Goals are not scripted. `findRoute` runs a breadth-first search over
`(room, heading)` states with a visited set, so it terminates on loops. A goal
is met if a route exists that satisfies it. The Test button shows that route.

## Known simplification

Heading is tracked in room-local terms. The plan view draws rooms at their plan
positions, so two rooms can appear far apart while being one step apart. That
contradiction is the point of the Contradiction chapter. The graph overlay
shows the true topology with rooms laid out on a circle, independent of plan
position.

## Plates

A plate is a fixture in a room that lights on arrival facing a given heading.
Lit plates are part of the traversal state: two arrivals at the same room and
heading are different states if they have lit different plates. This lets the
search answer questions like "is there a single route that strikes both?"
without storing histories.

## Loop analysis

Cycles are found structurally, with no traveller involved. A loop's net twist is
the sum of its portals' quarter-turns, modulo four. Whether it reflects space is
the parity of its mirrored portals. These are the properties the optional
discoveries check.

## Dimension report

For each pair of rooms, the report compares plan distance with the shortest walk
in portal steps, ignoring heading. A pair is flagged when the plan distance is
at least 2.5 units and the walk is one step.

## Gates and fixed passages

A portal may carry a gate: the index of a plate. A gated portal can be crossed
only once that plate has been lit on the current route. Gates are object state:
they change what a traveller can do, and the search tracks them as part of the
traversal state, just as it tracks lit plates.

A fixed passage belongs to a chapter's architecture. It is pre-placed, it
occupies its faces like any portal, and it cannot be removed or reshaped.

Structural analysis (loops and the dimension report) ignores gates, because it
describes the architecture rather than a particular route.

## Headings along a route

The traveller records the heading it holds in every room it visits. The renderer
uses this to show the heading changing at each portal. This is the most direct
way the game shows that the rooms themselves do not carry a fixed orientation.

## Sightlines

For a selected room, the sightline readout lists each face, the room beyond it,
and the heading a traveller would arrive with. It is a readout of the
architecture, not a first-person view.

## Toggle plates and configurations

A toggle plate flips its state each time a traveller arrives in its room facing
its heading. A latch plate, by contrast, lights once and stays lit. A toggle can
start lit or unlit.

Toggles give a building configurations: the same rooms behave differently
depending on how often they have been entered. A gate that waits for a toggle
to be lit can only be passed after an even or odd number of arrivals, so the
search must find a route that changes the building's state before using the
gate. The Revolving House is built on this.

Plate indices are part of the state encoding. The starting state uses the full
plate list so that each plate keeps its own bit.

## Structure ignores gates

Loops, the dimension report and the sightline cards describe the architecture,
so they look through gates: a shut passage is still a passage. Only route-finding
for a particular traveller respects gates. This is why the Cistern can show its
six-unit contradiction before the shaft is open, and why its discovery waits for
the shaft to be passable as well.

## One-way passages

A portal may carry a one-way direction: `oneWay: 'a'` or `'b'` means it may only
be crossed starting from that end. Crossing from the other end is refused, whatever
plates are lit. Traversal, route search and the first-person walker all respect it.
Structural loop analysis is deliberately direction-blind: it asks whether a cycle
exists in the architecture, not whether it can be walked in one direction.
