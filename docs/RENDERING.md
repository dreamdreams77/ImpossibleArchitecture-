# Rendering

The renderer draws the graph. It never decides it.

## Frames and portals (`src/render3d/frames.js`)

Every room has its own local frame (origin at the floor centre, north is -z). A
doorway frame sits on the portal surface, the outer plane of the wall thickness, with
+z pointing out of the room. Crossing a passage maps room A's frame onto room B's:

    T = FB . Ry(pi) . S . FA^-1

`S` flips the doorway's x axis when the passage mirrors. A reflected traveller (an odd number of
mirrored crossings) sees the whole picture flipped left to right in the final post pass, and
drag-to-look is inverted to match. Quarter turns do not move the
view: they turn the traveller, as the engine's entry heading says. Tests pin this to
`Structure.exit` for every face pair, turn count and mirror setting, and check that
chained crossings compose and invert.

## Walk mode (`world.js`)

Each doorway shows the destination room, rendered into a texture. Instead of moving
the camera, the renderer places the destination room behind the doorway
(`Wb = Wc . T^-1`), clips it at the doorway's surface with an oblique near plane, and
draws it from the traveller's own camera. This keeps mirrored passages shaded
correctly (the room's matrix has negative determinant, so three.js flips winding) and
lets the same room be placed several times in one frame, which is what a passage that
leads back into its own room needs.

Recursion is bounded by quality: depth 3 / 2 / 1, a per-frame pass budget, and at most
3 / 2 / 2 visible doorways expanded per level, nearest and most central first. Passes
use half-float render targets, MSAA where allowed, and shrinking resolution by depth.
Beyond the limit a doorway shows a fogged fallback. Only the room being drawn is
visible in each pass; four point lights are re-aimed per pass so the shader never
recompiles. The quality setting adapts down automatically if frames stay slow.

## Overview (model) mode

Rooms sit at their plan positions (rooms that would overlap are pushed apart), cut by a
horizontal section plane. A drafting grid is scaled to plan units. Every passage is an
arc between its two doorways, coloured by kind, with dashes flowing in the direction
of travel, so the real connections can be read against the plan.

## Surfaces and light

Materials are physically based and generated in the browser: ashlar stone, board-formed
concrete, brushed metal, glazed tile, plaster, polished dark stone, grating, each with
albedo, bump and roughness maps (`textures.js`), reflection from a per-style
environment map, and baked height-based ambient occlusion in vertex colours.
Six styles (`styles.js`) give the six chapters their own materials, light, scale,
fog and architectural features (clerestory, arcades, colossal piers, oculus, rails and
gears, split warm/cool light with a seam). Room kinds (chamber, corridor, atrium,
cellar) change height and the ceiling: coffers, barrel vault, groins, a mezzanine.
There is no real-time shadow mapping and no bloom pass; light shafts and glows are
additive geometry.

## Walker (`walker.js`)

Turns the engine's discrete steps into motion: stride to the doorway, apply the same
transform the renderer uses, walk in to the middle, turn to the engine's heading. It
always ends at the engine's room and heading (tested, including random structures).
