# 4D-MC

A first-person voxel sandbox in **four spatial dimensions**. You mine, craft and
build the way you would expect — and then you hold **F**, turn the scroll wheel,
and the world flows around you as you slide along an axis that was always there.

Zero dependencies. Pure WebGL2 and ES modules. Every texture, sound and world is
generated at runtime; there is not a single asset file in the repository.

```bash
npm start          # or: python3 -m http.server 8080
# then open http://localhost:8080/
```

> Needs WebGL2 — any recent Chrome, Edge, Firefox or Safari.
> A module-aware HTTP server is required; opening `index.html` from disk will not work.

---

## The fourth dimension, concretely

The world is a 4D field of voxels, `block(x, y, z, w)`, cyclic in `w` with eight
layers. You can only ever see a three-dimensional cross-section of it. The
interesting choice is *which* cross-section.

4D-MC does **not** put you on a flat `w = constant` hyperplane. It puts you on a
**tilted** one:

```
w_visible(x, z) = w_player + shear.x · x + shear.z · z
```

Consequences, all of which you can see on screen:

* **The slice sweeps diagonally.** Integer bands of that function stripe the
  world at an angle. Each band shows a different layer of the 4D field, so the
  landscape reads as a series of shallow diagonal terraces.
* **Blocks get cut.** A band boundary is a vertical plane that slices straight
  through individual voxels. A cube caught on a seam renders as a wedge, a
  prism, a triangle — whatever polygon the plane leaves behind. This is the
  literal geometry of a hyperplane cutting a tesseract, not an effect.
* **Matter fades in and out.** Scroll `w` and the bands sweep sideways. Blocks
  grow from a sliver, swell to full cubes, thin back to a sliver and vanish.
* **Cross-sections are visible.** Where a block's neighbour along `w` is empty,
  the exposed cut face is drawn as a distinct cross-section surface: flatter,
  desaturated, with a faint interference banding, so you can always tell a real
  block face from a slice through one.
* **What you see is what you touch.** Collision, ray-casting, entity visibility
  and block placement all sample through the same function. The wedge you can
  see is exactly the wedge you bump into.

Set the shear strength to taste in Settings — from *Flat Slices* (layers swap
wholesale) through *Standard* to *Extreme* (barely a cube left intact).

### Travelling

Hold **F**. The crosshair opens into a hyper-cross, a violet interference wash
crosses the screen, and the scroll wheel now drives `w` instead of the hotbar.
Motion is damped and deliberately slow — roughly a fifth of a slice per notch —
so the world flows rather than snapping. Press **G** to phase-lock to the
nearest whole slice.

If a shift would leave your body inside solid matter, the travel *stalls* rather
than teleporting you into a wall, and the compass reads **PHASE BLOCKED**. Small
obstructions are ridden over, the way you would step up a kerb.

### The Tesseract Compass

Bottom right. A wireframe tesseract whose `x–w` rotation is driven by your
actual position along the fourth axis, cut by a sweeping blade that marks the
current hyperplane — a genuine cross-section readout rather than decoration.
Below it, a horizontal ladder of the eight layers with a marker riding smoothly
between them, plus a numeric `W` value. A second, wider slice ribbon runs along
the top of the screen showing the bands to either side of you.

---

## Controls

| | |
|---|---|
| **WASD** | Move · **Space** jump · **Shift** sneak · **Ctrl** sprint |
| **Mouse** | Look · **LMB** mine / attack · **RMB** place / use / talk |
| **F** *(hold)* | Hyperslice travel — scroll to move through the fourth dimension |
| **G** | Phase-lock to the nearest whole slice |
| **E** | Inventory (4×4 Hypercraft Matrix) |
| **Q** | Drop held item · **Shift+Q** drop the whole stack |
| **1–9** / wheel | Hotbar |
| **H** | Toggle seam shimmer |
| **F3** | Debug overlay · **F1** hide HUD · **F2** screenshot · **F5** toggle flight (creative) |
| **Esc** | Pause |

Inventory: **left click** takes or places a stack, **right click** splits or
places one, **shift-click** shunts a stack between panes, **Q** drops.

---

## What's in it

**World.** 4D terrain from cyclic gradient noise: continents, erosion and
ridged mountains are shared across slices, while a bounded *drift* field lifts
and lowers the land a metre or two per layer — which is what carves the diagonal
terracing. Thirteen biomes including two that only exist in the fourth
dimension: the **Hyperflats** (hyperstone ground, violet blooms, lumen growths)
and the **Rift Barrens**. 4D cave systems that tunnel between slices. Ore veins,
trees, flowers, lakes, day/night with a drifting sun, moon, stars and a slice
aurora.

**Structures.** Supply caches (buried stone rooms with a chest of starting
gear), hyperkeeps (slate vaults built around a rift core, guarded by a Warden
of Slices), rift spires that pierce several layers at once, and surface camps
where NPCs live. Every new world also places a starter chest at spawn.

**Blocks & items.** 81 blocks and 156 items — the full wood → planks → sticks →
tools chain, six tool tiers (wood, stone, iron, gold, diamond, **hyper**) across
five tool types, four armour sets, ores, ten wool colours, glass, bookshelves,
farmland and crops, doors, ladders, torches, lanterns, chests, furnaces, plus
4D-native materials: hyperstone, tesseract ore, rift stone, phase anchors,
lumenstone, hyperglass and hyperchests.

**Crafting.** A 4×4 *Hypercraft Matrix* in your pack; place a **Hyperbench** for
5×5. Eighty recipes, shaped and shapeless, matched by bounding box so a 2×2
recipe works in any grid. Furnace smelting with real fuel values and a recipe
book that lists what you can make right now and lays it out for you.

**Creatures.** Eighteen mob types. Eleven are ordinary three-dimensional
residents — pigs, cows, sheep, chickens, dune hoppers, inkfins, husk-walkers,
bonefiddlers, silkstalkers, bloaters, gelids. Seven are **native to the fourth
dimension** and drift along `w`, so you only ever see the part of them that
intersects your slice: Phase Wraiths, Kata Drifters, Tessellites, Null Crawlers,
Hyperslugs, the Warden of Slices, and the Echo — which copies your movements
from the slice next door.

**NPCs.** Eleven kinds with their own dialogue and trade tables: farmer,
blacksmith, librarian, butcher, mason, Cartographer of Slices, the Weaver, the
Slice Hermit, a wandering tinker, an archivist and the Rift Warden.

**Survival.** Health, energy, breath, armour, fall damage, drowning, lava,
tool durability and harvest tiers, hunger drain and regeneration, XP and levels,
mob spawning by light level, biome and slice, creepers that actually crater the
terrain, and a death screen that scatters your inventory where you fell.

**Interface.** A start menu over a live, slowly-scrolling slice of a real world.
Singleplayer world manager with named worlds, text seeds, game mode, world type
and shear preset. Settings for video, controls, audio and the fourth dimension,
with rebindable keys. And a HUD built for this game rather than borrowed from
another: chamfered obsidian plates, a hotbar on a shallow rail, vital signs as
segmented arcs down the left edge, the slice ribbon along the top and the
Tesseract Compass bottom right.

**Everything generated.** 237 textures painted pixel by pixel at load from a
tiny seeded drawing library — early-beta in spirit, with cooler shadows and a
faint violet cast of its own. Inventory icons are baked as isometric cubes.
Sound is synthesised through WebAudio: material-aware footsteps, tool impacts,
mob voices, and a hyperdrone whose pitch tracks your position along `w`.

---

## How it is built

```
index.html            entry point
styles/ui.css         the whole interface
src/
  core/               math, cyclic 4D noise, WebGL2 helpers, input, audio
  world/
    slice.js          ← the hyperslice: the single source of truth for w
    blocks.js items.js biomes.js
    painter.js blockTextures.js itemTextures.js mobTextures.js atlas.js
    chunk.js worldgen.js world.js
  render/
    shaders.js        ← band clipping and vertex-shader cross-section caps
    mesher.js renderer.js particles.js
  game/
    physics.js player.js entities.js mobs.js
    inventory.js recipes.js save.js game.js
  ui/                 hud.js menu.js inventoryUI.js
tools/                dev server and texture/world preview pages
```

Three details worth knowing if you read the code:

1. **Meshing is per (chunk, w-layer).** Each chunk builds a separate mesh for
   every layer whose band crosses it — usually three to five. The fragment
   shader computes `e = uBase + dot(uShear, worldPos.xz)` and discards anything
   outside `[0, 1)`. Because adjacent bands tile the plane exactly, there are no
   gaps, and the trim is what produces the wedges.

2. **Cross-section caps are positioned in the vertex shader.** A cap is one quad
   per exposed voxel face along `w`. The vertex shader intersects the moving
   band-boundary plane with that voxel's footprint and emits the resulting
   segment; when the boundary misses the voxel the quad collapses to zero area
   and costs nothing. No remeshing while you scroll — travel stays smooth at any
   speed.

3. **Nothing is cached twice.** `Slice` owns the shear maths. Rendering,
   collision, ray-casting and entity visibility all call into it, which is why
   the visuals and the physics cannot drift apart.

Worlds are stored in `localStorage` as a seed plus a delta of everything you
changed, so saves stay small however far you roam.

## Development

```bash
npm start                                   # dev server on :8080
open http://localhost:8080/tools/preview/textures.html      # texture sheet
open http://localhost:8080/tools/preview/textures.html?mode=icon
open http://localhost:8080/tools/preview/world.html?rd=4&shear=strong
```

The world preview accepts `seed`, `rd`, `shear`, `w`, `px`/`py`/`pz`,
`yaw`/`pitch`, `fog`, `time`, `caps=0`, `solid=0` and `dbg=1..5` for shader
debug views.
