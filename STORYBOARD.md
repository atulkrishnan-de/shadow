# SHADOW — storyboard

Shot breakdown for the playable slice. Because the game is built on repetition, most of its
strongest moments are **systemic** — caused by the player, not triggered by a script. They
are boarded here exactly like cutscenes, because they have to land like cutscenes.

**Panel types:** `SCRIPTED` · `PLAYABLE` · `SYSTEMIC`

---

## Camera language

| | |
|---|---|
| **Gameplay camera** | Locked quarter-view (isometric). Damped follow with velocity lead. Never player-controlled. |
| **Entry move** | Every room opens pulled back ~55% wider and 2.4m higher, easing to gameplay framing over ~2.9s under the room card. |
| **Play rule** | The camera never cuts during an attempt. One continuous take per run. |
| **Intro camera** | **2.5D side view** (~80–90° orthographic feel). Deliberate contrast with gameplay: the incident is *watched*, the facility is *played*. Hard cuts and short push-ins only. |

---

## SEQ 00 · INTRO — 04/11
*`SCRIPTED` · 28s · side-view cinematic · establishes the incident without explaining the loop*

The player must leave this sequence knowing only: something went wrong at Hydraulic Press 3 on
the morning of 04/11/2012; the site emptied; fourteen years later it is Saturday 09:41 again —
and they are standing at Maintenance Intake. Do **not** state the anomaly, the programme, or
that he will meet himself.

**Asset language:** Sector C industrial kit already in the build — modular walls, pipes, columns,
crates, control panels, Mixamo worker. Same Press 3 silhouette the player will recognise in
Room III.

### 00.1 — Before · `SCRIPTED` · 0.0–4.5s
- **Shot** — Wide side-view of the Press 3 bay. Floor, overhead pipes, columns, the press body
  filling the right third of frame. Cool working light. Depth from parallax layers (far wall,
  mid machinery, near railing/crate).
- **Action** — Worker present left-of-centre, idle, facing the press. Breath of life only —
  shift of weight, no walk yet.
- **Audio** — Industrial room tone, distant compressor. No music.
- **On screen** — Small corner stamp only (incident report, not a title card):
  `09:41 PM` / `04 / 11 / 2012`
- **Story beat** — Ordinary morning of the containment close-attempt ([STORY.md](STORY.md) §04/11).

### 00.2 — The switch · `SCRIPTED` · 4.5–9.5s
- **Shot** — Camera eases and pushes in toward a wall isolator / safety panel beside the press.
  Keep the press readable in the same composition so cause and machine stay linked.
- **Action** — Worker walks to the panel (side-profile). Hand to the control. A clear physical
  toggle: lever drops / lamp changes state. The panel answers (light dies or flips amber→dark).
  No on-screen jargon.
- **Audio** — Footsteps, then a single mechanical clack; room tone continues.
- **On screen** — Stamp fades out by 5.5s. No explanatory text.
- **Story beat** — Interlock disabled so the trial can run without returning him ([STORY.md](STORY.md)).

### 00.3 — Something goes wrong · `SCRIPTED` · 9.5–14.0s
- **Shot** — Snap wider to hold press + floor. Brief push as the ram drops. At impact: white
  flash (1–2 frames) and a hitch of distortion/static over the *live* plate — not a solid red
  full-screen.
- **Action** — Press activates; ram descends hard. Worker reacts then is **gone** from frame
  after the flash (empty space where he stood). Red emergency fixtures in the bay pulse and
  bloom across the geometry — environmental light, scene still visible underneath.
- **Audio** — Wind-up ticks → slam. Static burst on the flash. Alarm bed under, not over.
- **On screen** — Nothing. Let the empty floor speak.
- **Story beat** — The close fails; the field locks open with him inside. No memorial, only an
  incident ([STORY.md](STORY.md)).

### 00.4 — Aftermath · `SCRIPTED` · 14.0–18.0s
- **Shot** — Same side angle, held. Press stopped low. Emergency red fades toward sodium/dark.
  Occasional lamp flicker. Fine dust / haze in volume light.
- **Action** — No worker. No evacuation title cards. The bay is simply vacated — tools left,
  panel dark, press cold.
- **Audio** — Alarm thins; room tone hollows out.
- **On screen** — None.
- **Story beat** — Evacuation, insurance position, gates chained — shown as abandonment, not copy.

### 00.5 — Fourteen years of the same room · `SCRIPTED` · 18.0–23.0s
- **Shot** — Slow dissolve or graded fade on the **same set**: desaturate, kill practicals,
  leave one sick overhead. Camera creeps a half-metre closer — recognisably Press 3, older.
- **Action** — Still empty. Optional: a single drip or cable sway. The machine has not moved.
- **Audio** — Near silence; one distant metal tick.
- **On screen** — None. Time is carried by light and emptiness, not “14 YEARS LATER.”
- **Story beat** — Nothing in here has changed in fourteen years ([STORY.md](STORY.md) ending line).

### 00.6 — Saturday threshold · `SCRIPTED` · 23.0–28.0s
- **Shot** — Hard cut (or short black) into **Maintenance Intake** — the Level 1 spawn corridor —
  still side-view for one last beat, then the frame eases toward gameplay quarter-view as the
  cutscene ends.
- **Action** — Empty intake under a single working lamp. Depth past the first door sits unlit.
  He is not shown arriving; the player *becomes* him on the cut to play.
- **Audio** — Soft room tone of Intake. Optional watch tick under.
- **On screen** — Brief stamp:
  `09:41 PM` / `04 / 11 / 2026`
  then `SATURDAY`
- **Story beat** — Summoned to the condemned plant on a Saturday morning at 09:41; the door opens
  but does not walk him through ([STORY.md](STORY.md) §How he gets back).
- **Exit** — Hard cut into Room I gameplay framing (`01.1`).

**Intro rules**
- Scenes over words. No large text-only cards. No full-screen solid red.
- Before/after must share architecture so Press 3 is unmistakable.
- Do not preview Shadows, the timer, or the loop.

---

## SEQ 01 · INTAKE
*Room I · 13s loop · teaches: you cannot be in two places*

### 01.1 — Establish · `SCRIPTED` · 2.9s
- **Shot** — Camera opens 55% wider than gameplay and 2.4m high, then eases in. The room card holds over it.
- **Action** — Player idle at spawn under a single working lamp. Everything past the door is unlit.
- **Audio** — Room tone, distant compressor, one drip. No music.
- **On screen** — `ROOM I — INTAKE` / *you have been here before*

### 01.2 — The rule, stated by the room · `PLAYABLE` · ~6s
- **Shot** — Settled framing. Player centre-left, the door visible far right in the same shot; both must be readable at once.
- **Action** — Player steps on the plate. The door lifts. He steps off. It drops. He does it again. The room has explained itself with no text.
- **Audio** — Plate clunk, door servo up, door servo down.
- **On screen** — Wall text: `SECTOR C · MAINTENANCE INTAKE`

### 01.3 — The wrong note · `PLAYABLE` · ~4s
- **Shot** — No camera change. The line does the work.
- **Action** — Player crosses the mid-room fragment trigger.
- **Audio** — Low reveal tone, two notes.
- **On screen** — *You know which corridors are load-bearing. / You have never been inside this building.*

### 01.4 — The clock runs out · `SYSTEMIC` · 0.85s
- **Shot** — Under 5s the camera adds shake; vignette pulses red. At zero: white flash, hard cut, 0.85s of black.
- **Action** — He is standing on the plate when it happens — the player has worked out there is nothing else to do.
- **Audio** — Heartbeat from 5s, alarm beeps from 3s, then a low sawtooth collapse.
- **On screen** — Timer `00:00`

### 01.5 — THE FIRST SHADOW · `SYSTEMIC` · ~4s
- **Shot** — Room restarts at **the same framing as 01.1** — deliberately identical, so the only difference in frame is the figure.
- **Action** — A violet man is already walking the line he walked. It reaches the plate, settles its weight, does not look up. The door opens.
- **Audio** — Shadow spawn sting: rising sine plus filtered burst. Screen flash, brief shake.
- **On screen** — `SHADOWS × 1` · `Attempt 2`

### 01.6 — Walking past yourself · `PLAYABLE` · ~5s
- **Shot** — Framing must hold player and Shadow together as he passes. No cut, no slow-motion. The game refuses to underline it.
- **Action** — He walks through the open door, past himself. Neither acknowledges the other.
- **Audio** — Two sets of footsteps, the Shadow's filtered and quieter.

### 01.7 — The first keepsake · `PLAYABLE` · ~4s
- **Shot** — Slight rise as he climbs the crate to the ledge. The object is lit warm — the only warm light in the room.
- **Action** — He takes his own watch off a shelf. +5s.
- **Audio** — Three ascending sine tones, warm.
- **On screen** — *Your watch. / It stopped at 09:41 and never started again.*

---

## SEQ 02 · SORTING
*Room II · 15s · teaches: build a team out of failures*

### 02.1 — Establish · `SCRIPTED` · 2.9s
- **Shot** — Entry pull-back reveals the storage racks running away into the background at z−4.
- **Action** — Rows of boxed effects, catalogued and untouched.
- **Audio** — Bigger room tone, longer reverb tail.
- **On screen** — `ROOM II — SORTING` / *your name is already on the list*

### 02.2 — Two plates, one man · `PLAYABLE` · ~20s
- **Shot** — The second plate sits on a gantry above the sight line, so the shot has to carry two working heights.
- **Action** — Shadow 1 holds the floor plate. He climbs the crate stack to the gantry plate and dies there, making Shadow 2.
- **Audio** — Two plate tones a fifth apart, so the player can hear which is held.
- **On screen** — `SHADOWS × 2`

### 02.3 — The badge · `PLAYABLE` · ~4s
- **Shot** — The photograph is deliberately small in frame, lit by a single narrow shaft. Easy to walk past.
- **Action** — Among the unclaimed effects is his own badge.
- **Audio** — Reveal tone.
- **On screen** — *A badge in the tray. Your photograph. / The name is yours. The date is not.*

---

## SEQ 03 · PRESS ROOM
*Room III · 15s · teaches: death becomes a plan*

### 03.1 — Establish, the machine is already running · `SCRIPTED` · 2.9s
- **Shot** — Pull-back is timed so the press completes **one full slam during the card**. The player learns its rhythm before they can act.
- **Action** — Hydraulic Press 3 lifts and drops into an open pit. Water below.
- **Audio** — Slam on a 5.0s cycle — low impact plus a square sub. It dominates the room tone.
- **On screen** — `ROOM III — PRESS ROOM` / *the iterations are not free*

### 03.2 — His own pack, already down there · `PLAYABLE` · ~4s
- **Shot** — Camera sits slightly high at the rim so the pit floor is visible — the only downward look in the game so far.
- **Action** — In the standing water is a canvas pack identical to the one on his back.
- **Audio** — Drip, close and wet.
- **On screen** — *Your pack is already down there. / You are still wearing yours.*

### 03.3 — The sacrifice · `SYSTEMIC` · ~6s
- **Shot** — He climbs down voluntarily. Hold on the descent — no music, only the cycle. The press fills the top of frame.
- **Action** — He stands on the plate under the hammer and waits. **The player has to choose this.** That is the whole room.
- **Audio** — Cycle tightens by proximity. One beat of silence before impact.

### 03.4 — Crossing on his own body · `PLAYABLE` · ~4s
- **Shot** — Wide enough to hold the Shadow in the pit and the open door together. The shot is the argument.
- **Action** — The Shadow climbs down and takes the plate. The door opens. He crosses above it, and is through before the hammer falls on the version of him holding it open.
- **Audio** — Door servo, running steps, slam — in that order, every time.

---

## SEQ 04 · OBSERVATION
*Room IV · 28s · four Shadows in sequence*

### 04.1 — Establish, scale · `SCRIPTED` · 2.9s
- **Shot** — The widest framing in the game. The observation deck is visible high and behind, lit green, long before it can be reached.
- **Action** — Presses, lift shaft, gantry, a laser across the far corridor, a pit beyond.
- **Audio** — Klaxon bed already faintly present.
- **On screen** — `ROOM IV — OBSERVATION` / *the door was never locked*

### 04.2 — The survey line · `PLAYABLE` · ~4s
- **Shot** — No move. The line sits next to an active laser the player cannot yet pass.
- **Action** — He reads a survey plate older than everyone involved.
- **Audio** — Beam hum.
- **On screen** — `SITE SURVEY 1961` / *anomalous interval recorded, sub-level 2*

### 04.3 — The other side of the glass · `PLAYABLE` · ~5s
- **Shot** — **The reversal.** First shot in the game framed from the deck looking down at the floor. Everything below is where he has always been.
- **Action** — He stands in the room he has been watched from. A dead monitor, a cold desk, a photograph someone left in a hurry.
- **Audio** — Room tone thins. The floor noise is suddenly distant.
- **On screen** — *This is where they watched from. / You have only ever seen it from the other side.*

### 04.4 — Four of him working at once · `SYSTEMIC` · ~20s
- **Shot** — Held wide. Four violet figures at four working heights, each on its own task, none aware of the others. The room is at its darkest — most fixtures burned out by accumulated Shadows, so **they are the main light source.**
- **Action** — One throws the bus lever. One holds the gate plate. One rides the lift and kills the beam. One presses the timed door. He runs the gap they open.
- **Audio** — Klaxon at full. Four sets of filtered footsteps, out of phase.
- **On screen** — `SHADOWS × 4` · `Attempt 5`

### 04.5 — The last door · `PLAYABLE` · ~4s
- **Shot** — Frame holds the exit and, behind him, the accumulated Shadows still finishing their tasks.
- **Action** — He reaches the door.
- **Audio** — Win chord, four notes. Everything else drops away.
- **On screen** — *The door at the end has never been locked.*

---

## SEQ 05 · ENDING
*Scripted · timings are exact, taken from the build*

### 05.1 — The count · `SCRIPTED` · 0–5.5s
- **Shot** — Camera eases back 26 units and up 7 over 5.5s. Every Shadow it took is standing on one floor, still lit, still finishing.
- **Action** — He is among them. No dialogue. Nothing is explained.
- **Audio** — Ambience drops to 18%. Klaxon fades out.

### 05.2 — He keeps walking · `SCRIPTED` · 2.6–6.2s
- **Shot** — Overlaps the pull-back. He walks forward at 1.7 m/s while the camera recedes — he gets smaller and keeps going.
- **Action** — The Shadows do not follow. They are not watching him.
- **Audio** — Footsteps alone.

### 05.3 — Fade · `SCRIPTED` · 5.8s
- **Shot** — Slow fade to black over 2.6s. Hold.
- **Audio** — Silence.

### 05.4 — Card 1 · `SCRIPTED` · 8.6–14.0s
- **Shot** — Black. Letterspaced condensed caps, centred, 2s fade in.
- **On screen** — `NOTHING IN HERE HAS CHANGED IN FOURTEEN YEARS.`

### 05.5 — Card 2 · `SCRIPTED` · 16.4–22.0s
- **Shot** — Same treatment. The two cards never share the screen.
- **On screen** — `EVERYTHING OUT THERE HAS.`

### 05.6 — Title · `SCRIPTED` · 24.6s
- **Shot** — Title fades up over 3s in violet and holds. No credits roll, no button prompt.
- **Audio** — Two sustained sine tones, a fifth apart.
- **On screen** — `SHADOW`

---

## Note for the team

Panels **01.5**, **03.3** and **04.4** carry the whole game, and none of them is a cutscene.
They are produced by the player choosing to fail. Nothing in the build triggers them, and
nothing should be added that does — if a script ever has to force any of these, the mechanic
has stopped working.

**SEQ 00** is the only fully scripted open. It is side-view on purpose; gameplay returns to
quarter-view so the player feels the shift from *witness* to *operator*.

Story and world detail: [STORY.md](STORY.md).
Authoring reference for the intro set: `assets/intro_cutscene.blend` (built from kit pieces in
`assets/`).
