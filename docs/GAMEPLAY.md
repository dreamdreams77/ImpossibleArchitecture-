# Playing

Open the game with `npm start`, then visit http://localhost:8080.

- **Select & move:** click a room to select it, drag to move it. Click a portal to select it.
- **Add room:** click empty plan space.
- **Connect faces:** click a small dot on one room's edge, then a dot on another
  room's edge. Click the same dot again to cancel.
- **Turn ¼ / Mirror:** change a selected portal's transform.
- **Test construction:** checks the current chapter's goal and highlights the route.

The campaign is six chapters of 39 challenges (see the README). Each challenge teaches one idea: a direct connection, a self-loop,
turns that change your heading, a shortcut across the plan, a mirror that
reflects you (your left and right exchange, so turn controls reverse), a machine whose plates must be struck on one route, a
hidden stair, and a final construction combining them. Free construction has
no goal.

Plates are the amber rings on rooms. A plate lights when you arrive in its room
facing the direction of its tick. Some chapters require every plate to be lit
on the same route.

Discoveries are optional. The inspector lists the loops your construction
contains, with their net turn and whether they reflect space, and warns where
the plan misleads about distance. Some loops reveal a discovery when they have
the right twist.

## Gates and fixed passages

Some passages are part of the architecture and cannot be removed. Some are
gated: they stay shut until a plate on your route has been struck. A gate is
drawn as a bar across its doorway, labelled with the plate it waits for.

## Walking the route

After a successful test, Walk the route sends a traveller along the highlighted
path. It turns to the heading it holds in each room. The arrows inside rooms
show that heading.

## Sightlines

Select a room to see what each of its faces leads to, and the heading you would
arrive with.

## Configurations

Some plates are toggles, drawn with dashed rings. Each entry from their heading
flips them. Some gates open only when a toggle is lit, so you may need to go in
and out of a room to change the building's state before passing through.

## Sightline cards

When a room is selected, a small grid appears in the sidebar. The room is in the
centre. Each side shows a wall, or the room beyond that passage with the heading
you would arrive with. A gate is drawn across its opening.

## Sealed faces and forbidden links

Some challenges seal faces or forbid two rooms from ever being joined directly. The
game says which rule refused a passage. Forbidden links make you build through a hub.

## Walking and the model

Switch to **Walk** to stand inside your building. Doorways show the real room beyond,
including loops that show themselves, mirrors that reverse the view, and gates that
stay barred until their plate is lit. **Model** shows the building from above with the
real connections drawn as arcs.
