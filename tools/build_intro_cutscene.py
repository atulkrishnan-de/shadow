# build_intro_cutscene.py
# Builds the SHADOW intro cutscene Blender scene from the game's actual assets.
#
# The scene was built interactively via Blender MCP (execute_blender_code) to match
# the exact game layout from game.js decorateFacility() / buildFacility().
# This file documents the build process for reproducibility.
#
# Output: assets/intro_cutscene.blend
#
# Game coordinate system: X horizontal, Y vertical (up), Z depth
# Blender coordinate system: X horizontal, Y depth, Z vertical (up)
# Conversion: g2b(gx, gy, gz) -> (gx, gz, gy)
#
# === SCENE STRUCTURE ===
#
# Collections:
#   Environment  — floors, walls, wall panels, overhead pipes, stairs
#   Press3       — Hydraulic Press 3 frame, ram (animated), collar, anvil, plate
#   Props        — all decorateFacility() props in exact game positions
#   Character    — Mixamo worker (animated: walk, interact, disappear)
#   Lighting     — overhead lamps, key/fill lights, emergency red, panel light
#   Camera       — orthographic side camera with cinematic keyframes
#   Library      — hidden source assets for duplication
#   Intake       — (reserved for final shot Sector I)
#
# === ASSET SOURCES ===
#
# Modular kit:  assets/scifi-modular/*.glb  (wall panels, pipes, columns, crates, etc.)
# Lab props:    assets/lab/*.glb            (extinguisher, glasses, gloves, cabinet, magnifier)
# Character:    assets/character/mixamo_combined.glb
#
# Materials match game.js PAL exactly:
#   M_floor      0x2a2e38  rough=0.95  metal=0.02
#   M_wall       0x3a3e48  rough=0.85  metal=0.15
#   M_steel      0x5a5a60  rough=0.40  metal=0.60
#   M_steelDark  0x2a2a32  rough=0.60  metal=0.40
#   M_rust       0x4a3528  rough=0.94  metal=0.10
#   M_step       0x2a2a32  rough=0.90  metal=0.05
#   M_crate      0x5a4a30  rough=0.90  metal=0.05
#
# Modular kit materials get the game's color boost: c[i] = min(1, c[i]*2.8 + 0.12)
# with metalness=0.3 and roughness=0.6.
#
# === FACILITY LAYOUT ===
#
# FACILITY = { x0: -2, x1: 58, z0: -6, z1: 18, ceil: 4 }
# Floor: 60x0.12x24 box at (x0, -0.12, z0)
# Outer walls: south, north, west, east (east split for door g3)
# Internal walls: x=14.5, 30.5, 44.5, 50, 52 with door gaps
#
# Sectors (all props at exact game positions):
#   I   Intake       x: -2  → 14.5
#   II  Sorting Lab  x: 14.5 → 30.5
#   III Press Room   x: 31.5 → 44    (main cinematic focus)
#   IV  Observation  x: 45.5 → 57
#
# Wall panels: full-length modular panels on all 4 walls + internal walls
# Overhead: piping/vents along south and north ceilings
#
# === HYDRAULIC PRESS 3 ===
#
# Position: game (36, 8), w=3.4, d=3.4, pitY=-0.42, top=2.6
# Components:
#   Frame posts (4x), top beam, hydraulic cylinder
#   Rust collar, anvil surface, pressure plate, shadow mark
#   Ram head (1.0m tall, animated)
#
# Ram animation:
#   Frame 1-228 (0-9.5s):    top position (y=2.6)
#   Frame 240 (10.0s):       windup (y=2.9)
#   Frame 252 (10.5s):       SLAM (y=pit+1.0=0.58)
#   Frame 252-672:            stays down
#
# === WORKER ANIMATION ===
#
# Mixamo character scaled to 1.7m (game scale 0.9)
# Timeline:
#   0-4.5s:    idle at (33.2, 0, 5.0) with subtle weight shift
#   4.5-7.0s:  walk to isolator panel at (32.4, 0, 0.6)
#   7.0-8.4s:  interact with panel (reach forward, pull back)
#   8.8-10.8s: react to press (turn toward press, step back)
#   11.1s:     DISAPPEAR (hide_viewport + hide_render)
#
# === LIGHTING ===
#
# Overhead lamps (11 total, matching game buildLamps):
#   Warm (0xff9944), 200W when alive, 0W when dead
#   Aftermath: dim from 200 → 60 → 30 → 20
#
# Key light: area, 450W warm amber, dims to 40W in aftermath
# Fill light: area, 180W blue-gray, dims to 20W
# Sun: directional, 0.5W cool blue
# Panel light: point, 90W amber, goes dark at 8.7s (toggle)
# Emergency red: point at press, pulses 700W/50W during incident,
#   fades to 10W in aftermath
# Emergency red 2: secondary, similar pulse pattern
#
# === CAMERA ===
#
# Type: Orthographic
# Orientation: side view (rotation X=90°), looking along +Y
# South wall hidden for "fourth wall" stage effect
#
# Shot sequence (28s @ 24fps = 672 frames):
#   SHOT 1 (0-4.5s):     Establishing — wide press bay, ortho=10
#   SHOT 2 (4.5-7.5s):   Push to panel — tight on isolator, ortho=6
#   SHOT 3 (7.5-9.5s):   Hold — panel interaction
#   SHOT 4 (9.5-10.8s):  Snap wide — press slam, ortho=10
#   SHOT 5 (10.8-14s):   Hold — incident, worker disappears
#   SHOT 6 (14-18s):     Creep — aftermath, dimming lights, ortho=9
#   SHOT 7 (18-23s):     Slow push — 14 years, ortho=8
#   SHOT 8 (23-28s):     Hard cut — Intake spawn area, ortho=8
#
# === TIMELINE MARKERS ===
#   Frame 1:   SHOT 1: Establishing
#   Frame 108: SHOT 2: Approach Panel
#   Frame 180: SHOT 3: Interaction
#   Frame 228: SHOT 4: Press Activates
#   Frame 252: SLAM
#   Frame 266: WORKER GONE
#   Frame 336: SHOT 6: Aftermath
#   Frame 432: SHOT 7: 14 Years
#   Frame 552: SHOT 8: Intake
