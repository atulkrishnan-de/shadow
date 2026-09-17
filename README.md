# SHADOW

A top-down quarter-view puzzle game. Every time you die, your previous attempt comes back
as a Shadow that repeats exactly what you did. You solve each room by building a
team out of your own failures.

## Run it

```
cd shadow
python3 -m http.server 8000
# open http://localhost:8000
```

`three.js` is vendored in `vendor/`, so it runs offline. Opening `index.html`
directly off the filesystem works too.

## Controls

| key | |
|---|---|
| `W` `A` `S` `D` | move (floor plane) |
| `SPACE` | jump (hold for height) |
| `E` | interact — levers and buttons |
| `R` | die now, and leave a Shadow behind |
| `1` / `2` / `3` | speed ×1 / ×2 / ×4 |
| `ESC` | pause |
| `BACKSPACE` | restart the room from scratch |

Dev entry points: `?level=3` jumps to a room, `?auto` skips the menu,
`&skipintro=1` skips the title card, `&ghosts=4` materialises Shadows for
inspecting the visuals.

The world, the event and what the player is never told: [STORY.md](STORY.md).
Shot-by-shot breakdown of the slice: [STORYBOARD.md](STORYBOARD.md).

## The four rooms

1. **INTAKE** — one plate, one door. You cannot stand on the plate *and* walk
   through the door. Let the clock run out, then walk out past yourself.
2. **SORTING** — two plates, far apart and on different levels. Two Shadows plus
   you.
3. **PRESS ROOM** — the plate that opens the door is under a hydraulic press.
   Whoever holds it does not come back. Step into the pit just after the press
   lifts; you get about three seconds of held plate before it comes down.
4. **OBSERVATION** — four Shadows: one latches the main bus, one holds the gate
   plate, one rides the lift up to kill the laser, one presses the timed door.
   Then you run it.

## How the mechanic works

Each attempt records the player's exact state every fixed 60 Hz tick — position,
velocity, facing, grounded, interaction edge. On death the tape is kept and a
Shadow replays it frame for frame from t = 0 of the next attempt. No AI, no
approximation: a Shadow does precisely what you did, so you can plan around it.
Shadows are first-class actors — they hold pressure plates, press buttons, ride
the lift and block beams. Fast-forward runs more simulation ticks per frame, so
the recording stays exact at ×4.

Rooms 1–4 are verified solvable end-to-end by a headless simulation harness that
plays each room with the intended choreography, and verified *unsolvable* with
zero Shadows.

## Assets

Recommended pipeline (downloads CC0 PBR textures + Kenney factory props):

```
python3 tools/fetch_assets.py
python3 tools/process_textures.py
~/tools/blender/blender --background --factory-startup --python tools/build_assets.py
~/tools/blender/blender --background --factory-startup --python tools/import_props.py
python3 tools/build_signs.py
```

Credits and sources: [ASSETS.md](ASSETS.md).

Procedural fallback (no downloads):

```
~/tools/blender/blender --background --factory-startup --python tools/build_assets.py
python3 tools/build_textures.py
```

- `tools/build_assets.py` → `assets/parts.glb` (27 parts, ~3.4k triangles).
  Each part is authored at the exact bounding size of the placeholder box it
  replaces, so it drops in at scale 1 with no layout change. Nothing is rigged:
  the game drives a procedural rig and Shadow replay depends on that staying
  deterministic, so these are dumb parts posed by code. Build functions speak
  game axes (y = up); the script maps them onto Blender's Z-up.
  The kit pieces (`kit_*`) are the structural vocabulary — I-beams with a real
  I cross-section, open grating, pipe flanges and brackets, valves, duct,
  cable tray, junction boxes, wall panels, railings (straight and given-up).
  `buildBackdrop()` assembles the facility from these, and `Inst` batches each
  type into one `InstancedMesh`: Room IV draws **676 objects in 12 calls**, so
  the detail pass *reduced* total draw calls from 334 to 244.
- `tools/build_signs.py` → `assets/tex/sign_*.png`. Seven weathered signs
  carrying the story text (`SECTOR C · TEMPORAL CONTAINMENT`, the disabled
  interlock, `DO NOT ENTER DURING CYCLE`). Text is drawn first and weathered
  after — paint chips, rust bleeds from the fixings, grime creeps in from the
  edges — so it reads as painted onto the facility, not composited over it.
  Signs are UV-mapped, not triplanar, and double as low-intensity emissive maps
  so the reveal stays legible after accumulated Shadows kill the lights.
- `tools/build_textures.py` → `assets/tex/*.png`. Tileable concrete, steel,
  rust and painted tin. Sampled **triplanar from world position** rather than by
  UV, because every solid is a differently-sized box and shared UVs would
  stretch — world projection gives one physical scale facility-wide. Each
  material also gets a **normal map derived from the same heightfield that
  produced its colour**, so relief and albedo can never disagree. Triplanar
  normal mapping reorients each of the three projections into world space
  (whiteout blend) before converting back to view space.

If `parts.glb` or the textures are missing, every mesh falls back to its
original box and the game still runs. Assets are an enhancement, not a
dependency.

## Files

- `index.html` — shell, HUD, menus, post-effect overlays
- `game.js` — audio synthesis, world building, entities, physics,
  recording/replay, camera, game loop
- `tools/` — asset build scripts
- `assets/` — generated meshes and textures
- `vendor/three.min.js`, `vendor/GLTFLoader.js` — three.js r128
