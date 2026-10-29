# The spatial model

## The central idea

A room's apparent position on the plan is for drawing only. Whether you can
walk from one room to another is decided by portals alone.

- A **Room** has an id, a plan position (`x`, `y`), a label, and a set of object ids.
- A **Portal** joins one face of room A to one face of room B. Faces are N, E, S, W.
  A portal may join a room to itself, including via two different faces.
- A portal's **transform** has `turns` (0–3 quarter-turns) and `mirror` (boolean).

## Traversal

The traveller's state is `(room, heading)`. Walking through a face follows the
portal attached to that face. On arrival, the heading is the opposite of the
entry face, rotated by the portal's turns, and reflected if the portal is mirrored.

Because the arrival heading comes from the portal, not from how you approached,
the same portal always produces the same heading. A loop with a quarter-turn
therefore returns you to its own room facing a fixed, different direction. You
cannot spin the loop to change your heading. You change it by reshaping the
portal, which is what the Twisted Stair and Closing Construction chapters ask for.

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
