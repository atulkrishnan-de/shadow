/* ============================================================================
   SHADOW — fixed isometric puzzle game about failing on purpose.
   Ground-up rewrite: no side-view physics, no chase camera, no imported
   assets. Every shape on screen is a primitive built by this file.
   Deterministic replay: every attempt is recorded tick-exact and replayed.
   Play plane: X/Z floor, Y is height (used by stairs, lifts and crushers —
   there is no jump; verticality is walked or ridden, never leapt).
   ========================================================================== */
'use strict';

const BUILD = 'ISO-1';
const TICK = 1 / 60;
const PH_TIME_BONUS = 5;
const STEP_MAX = 0.46;          // a solid this tall or shorter is a step, not a wall
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const tri = p => { p = p - Math.floor(p); return p < 0.5 ? p * 2 : 2 - p * 2; };
const ease = t => t * t * (3 - 2 * t);
const $ = s => document.querySelector(s);
const hit2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;

/* -------------------------------------------------------------------- input */
const Keys = Object.create(null);
const Pressed = Object.create(null);
let anyKeyHook = null;

addEventListener('keydown', e => {
  const k = e.code;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
  if (!Keys[k]) Pressed[k] = true;
  Keys[k] = true;
  if (anyKeyHook) { const f = anyKeyHook; anyKeyHook = null; f(); }
  Audio.unlock();
});
addEventListener('keyup', e => { Keys[e.code] = false; });
addEventListener('blur', () => { for (const k in Keys) Keys[k] = false; });

const held = {
  left: () => !!(Keys.KeyA || Keys.ArrowLeft),
  right: () => !!(Keys.KeyD || Keys.ArrowRight),
  up: () => !!(Keys.KeyW || Keys.ArrowUp),
  down: () => !!(Keys.KeyS || Keys.ArrowDown),
  use: () => !!Keys.KeyE,
  anchor: () => !!Keys.KeyQ,
};

/* -------------------------------------------------------------------- audio
   Everything is synthesised — no downloads, no latency. */
const Audio = (() => {
  const MASTER_BASE = 0.85;
  let ctx = null, master = null, ambBus = null, ready = false;
  function noiseBuffer(sec) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let NB = null;
  function unlock() {
    if (ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); ready = true; NB = noiseBuffer(2);
    master = ctx.createGain(); master.gain.value = MASTER_BASE; master.connect(ctx.destination);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.0; ambBus.connect(master);
    startAmbience();
  }
  function startAmbience() {
    const hiss = ctx.createBufferSource(); hiss.buffer = NB; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 480; hf.Q.value = 0.6;
    const hg = ctx.createGain(); hg.gain.value = 0.05;
    hiss.connect(hf).connect(hg).connect(ambBus); hiss.start();
    const rum = ctx.createOscillator(); rum.type = 'sine'; rum.frequency.value = 41;
    const rg = ctx.createGain(); rg.gain.value = 0.16;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.06; lfo.connect(lg).connect(rg.gain);
    rum.connect(rg).connect(ambBus); rum.start(); lfo.start();
    ambBus.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
    scheduleDrip();
  }
  function scheduleDrip() { if (ready) setTimeout(() => { drip(); scheduleDrip(); }, 2600 + Math.random() * 6500); }
  function drip() {
    if (!ready || ctx.state !== 'running') return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1500 + Math.random() * 700, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.25);
  }
  function tone(f, dur, type, vol, slideTo, delay) {
    if (!ready) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, freq, q, vol, type) {
    if (!ready) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = NB;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const S = {
    step(shadow) { burst(0.07, 220 + Math.random() * 120, 1.2, shadow ? 0.03 : 0.09, 'bandpass'); },
    die() { tone(140, 0.7, 'sawtooth', 0.11, 42); burst(0.5, 300, 0.4, 0.1, 'lowpass'); },
    spawnShadow() { tone(620, 0.5, 'sine', 0.05, 240); tone(311, 0.7, 'triangle', 0.04, 155, 0.04); burst(0.35, 900, 2, 0.03); },
    plate(on, r) { r = r || 1; burst(0.05, (on ? 900 : 600) * r, 3, 0.09); tone((on ? 520 : 380) * r, 0.07, 'square', 0.025); },
    button() { burst(0.04, 1400, 4, 0.08); tone(760, 0.06, 'square', 0.03, 500); },
    door() { burst(0.65, 130, 0.5, 0.13, 'lowpass'); tone(62, 0.8, 'sawtooth', 0.045, 48); },
    crush() { burst(0.4, 90, 0.6, 0.22, 'lowpass'); tone(48, 0.5, 'square', 0.07, 30); },
    laser() { tone(1760, 0.22, 'sawtooth', 0.02, 1500); },
    lift() { burst(0.5, 200, 1.4, 0.05); },
    pickup() { [660, 880, 1320].forEach((f, i) => tone(f, 0.28, 'sine', 0.05, f, i * 0.05)); burst(0.12, 2200, 2, 0.03); },
    win() { [392, 523, 659, 784].forEach((f, i) => tone(f, 1.1, 'sine', 0.05, f, i * 0.16)); },
    reveal() { tone(196, 2.2, 'sine', 0.035); tone(294, 2.2, 'sine', 0.025, 294, 0.2); },
    heart() { tone(58, 0.16, 'sine', 0.16, 34); tone(52, 0.2, 'sine', 0.12, 30, 0.19); },
    alarm() { tone(880, 0.13, 'square', 0.035, 740); tone(660, 0.13, 'square', 0.028, 560, 0.14); },
    tick(vol) { burst(0.02, 3200, 8, vol == null ? 0.02 : vol); },
  };
  let anchGain = null;
  function anchorLevel(v) {
    if (!ready) return;
    if (!anchGain) {
      anchGain = ctx.createGain(); anchGain.gain.value = 0; anchGain.connect(master);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(anchGain);
      for (const hz of [110, 164.8]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.connect(f); o.start(); }
    }
    anchGain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  }
  let klaxGain = null;
  function klaxonLevel(v) {
    if (!ready) return;
    if (!klaxGain) {
      klaxGain = ctx.createGain(); klaxGain.gain.value = 0; klaxGain.connect(master);
      const swell = ctx.createGain(); swell.gain.value = 0; swell.connect(klaxGain);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 3.2; f.connect(swell);
      for (const hz of [219, 233]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); }
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.21;
      const lg = ctx.createGain(); lg.gain.value = 0.45;
      const bias = ctx.createConstantSource(); bias.offset.value = 0.45; bias.start();
      lfo.connect(lg); lg.connect(swell.gain); bias.connect(swell.gain); lfo.start();
    }
    klaxGain.gain.setTargetAtTime(v, ctx.currentTime, 1.4);
  }
  function ambientLevel(v) { if (ready) ambBus.gain.setTargetAtTime(v, ctx.currentTime, 0.8); }
  function duck(depth, holdSec) {
    if (!ready) return;
    depth = depth == null ? 0.85 : depth; holdSec = holdSec == null ? 0.09 : holdSec;
    const t = ctx.currentTime, low = MASTER_BASE * (1 - depth);
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(low, t + 0.03); master.gain.setValueAtTime(low, t + holdSec);
    master.gain.linearRampToValueAtTime(MASTER_BASE, t + holdSec + 0.05);
  }
  return { unlock, S, ambientLevel, klaxonLevel, anchorLevel, duck, get ok() { return ready; } };
})();

/* =============================================================== renderer */
const BASE_FOG = 0.026, BASE_EXPOSURE = 1.2;
const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = BASE_EXPOSURE;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.FogExp2(0x0d1117, BASE_FOG);

/* Fixed isometric camera: a constant offset from the look-at point, elevated
   and rotated off-axis so the floor grid reads as a diamond, exactly like the
   reference frames — never a chase cam, never rotated by player facing. */
const ISO = {
  az: Math.PI * 0.235,      // azimuth around Y
  elevRad: 1.02,            // ~58° down from horizontal
  dist: 18,                 // pulled back further so more of the surroundings read
};
const CAM_DIR = new THREE.Vector3(
  Math.sin(ISO.az) * Math.cos(ISO.elevRad),
  Math.sin(ISO.elevRad),
  Math.cos(ISO.az) * Math.cos(ISO.elevRad),
).normalize();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1, 260);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* =============================================================== materials */
const PAL = {
  concrete: 0x3a3e48, concreteDark: 0x2a2e36, floor: 0x1a1c22,
  steel: 0x5a5a60, steelDark: 0x2a2a32, rust: 0x4a3528, crate: 0x5a4a30,
  purple: 0x8a6dff, purpleGlow: 0xbca6ff, amber: 0xd2993b, red: 0xff4433, green: 0x4fe0a0,
};
const M = {};
function std(color, rough, metal, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); }
M.floor = std(PAL.floor, 0.95, 0.02);
M.wall = std(PAL.concrete, 0.85, 0.15);
M.wallDark = std(PAL.concreteDark, 0.9, 0.1);
M.ceiling = std(0x0b0e12, 1.0, 0.0, { transparent: true, opacity: 0.0 });
M.steel = std(PAL.steel, 0.4, 0.6);
M.steelDark = std(PAL.steelDark, 0.6, 0.4);
M.rust = std(PAL.rust, 0.94, 0.1);
M.crate = std(PAL.crate, 0.9, 0.05);
M.step = std(0x2a2a32, 0.9, 0.05);
// A recorded attempt replaying itself: CRT scanlines, a fresnel violet rim,
// and rare glitch frames that shift geometry and tint red — a shader
// instead of a flat emissive material, since "a ghost replaying the past"
// reads better as a broken recording than as a solid tinted body.
function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uGlitch: { value: 0 }, uOpacity: { value: 0.45 },
      uColor: { value: new THREE.Color(PAL.purple) }, uGlow: { value: new THREE.Color(PAL.purpleGlow) },
    },
    vertexShader: `
      uniform float uTime; uniform float uGlitch;
      varying vec3 vNormal; varying vec3 vViewDir;
      void main() {
        vec3 pos = position;
        pos.y += sin(pos.y * 40.0 + uTime * 8.0) * 0.008;
        pos.x += uGlitch * sin(uTime * 97.0) * 0.15;
        pos.z += uGlitch * cos(uTime * 131.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uGlitch; uniform float uOpacity;
      uniform vec3 uColor; uniform vec3 uGlow;
      varying vec3 vNormal; varying vec3 vViewDir;
      void main() {
        float scan = 0.85 + 0.15 * sin(gl_FragCoord.y * 0.6 + uTime * 5.0);
        float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.0);
        vec3 col = mix(uColor, uGlow, fres);
        col = mix(col, vec3(1.0, 0.3, 0.3), uGlitch * 0.4);
        gl_FragColor = vec4(col * scan, clamp(uOpacity + fres * 0.3, 0.0, 1.0));
      }`,
  });
}
M.player = std(0x8fa2ac, 0.75, 0.1);
M.playerDark = std(0x232a2e, 0.85, 0.05);
M.keepsake = std(0xd8c39a, 0.55, 0.1, { emissive: 0xffcf94, emissiveIntensity: 0.7 });
M.glass = std(0x2a4a4a, 0.3, 0.1, { transparent: true, opacity: 0.4, emissive: 0x18302f, emissiveIntensity: 0.5 });

const GEO = { box: new THREE.BoxBufferGeometry(1, 1, 1), cyl: new THREE.CylinderBufferGeometry(1, 1, 1, 12) };

/* ================================================================= props
   Decoration only — a handful of Kenney factory-kit GLBs scattered around
   for set-dressing. None of these ever participate in collision; if one
   fails to load the room still plays exactly the same, just plainer. */
// name -> { folder, mat, scale }. `mat` re-tints a piece with one of our own
// materials (needed for the modular_industrial_pieces kit — converted from
// FBX, and that conversion loses its source textures, so it renders flat
// white unless given one of ours). `scale` corrects kits authored in
// centimetres (the lab kit) down to this game's ~1-unit-per-metre world.
const PROP_DEFS = {
  'pipe-large': { folder: 'props' },
  'pipe-large-bend': { folder: 'props' },
  'pipe-large-valve': { folder: 'props' },
  'cog-a': { folder: 'props' },
  'column-free': { folder: 'structure', mat: 'steel' },
  'column-cap': { folder: 'structure', mat: 'steelDark' },
  'window-a': { folder: 'structure', mat: 'glass' },
  'corner-trim': { folder: 'structure', mat: 'steelDark' },
  'lab-counter': { folder: 'lab', scale: 0.01 },
  'lab-cabinet': { folder: 'lab', scale: 0.01 },
  'lab-glasses': { folder: 'lab', scale: 0.01 },
  'lab-gloves': { folder: 'lab', scale: 0.01 },
  'lab-extinguisher': { folder: 'lab', scale: 0.01 },
  'lab-microscope': { folder: 'lab', scale: 0.01 },
  'lab-magnifier': { folder: 'lab', scale: 0.01 },
  // native glTF export (Modular SciFi MegaKit) — real textures, correct
  // scale, no FBX-conversion tinting needed like the industrial-kit pieces.
  'scifi-computer': { folder: 'scifi', file: 'Prop_Computer', ext: 'gltf' },
  'scifi-access': { folder: 'scifi', file: 'Prop_AccessPoint', ext: 'gltf' },
  'scifi-chest': { folder: 'scifi', file: 'Prop_Chest', ext: 'gltf' },
  'scifi-wall': { folder: 'scifi', file: 'WallAstra_Straight', ext: 'gltf' }, // 1.2(x, thin) x 3.0(y) x 4.0(z, length) native
};
const PROPS = Object.create(null);
function loadProps() {
  if (typeof THREE.GLTFLoader !== 'function') return Promise.resolve();
  const loader = new THREE.GLTFLoader();
  return Promise.all(Object.entries(PROP_DEFS).map(([name, def]) => new Promise(resolve => {
    loader.load('assets/' + def.folder + '/' + (def.file || name) + '.' + (def.ext || 'glb'),
      gltf => {
        gltf.scene.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            if (def.mat) o.material = M[def.mat];
          }
        });
        PROPS[name] = gltf.scene;
        resolve();
      },
      undefined,
      () => resolve()); // missing/broken prop — just skip it, never blocks the game
  })));
}
function spawnProp(name, x, y, z, scale, rotY) {
  const base = PROPS[name]; if (!base) return null;
  const inst = base.clone();
  // clone() shares geometry/material with the cached template (and every
  // other instance of this prop) — disposeTree must never touch these.
  inst.traverse(o => { if (o.isMesh) o.userData.isProp = true; });
  const baseScale = (PROP_DEFS[name] && PROP_DEFS[name].scale) || 1;
  inst.scale.setScalar((scale || 1) * baseScale);
  inst.rotation.y = rotY || 0;
  inst.position.set(x, y, z);
  World.root.add(inst);
  return inst;
}

// Wall panels tile along their local +Z axis (their native length). rotY
// aims that axis in world space; lenScale stretches the panel to close a
// span that isn't an exact multiple of its 4m native length — a uniform
// stretch reads fine on a plain paneled wall, unlike stretching a prop.
function spawnWallPanel(name, x, y, z, rotY, lenScale) {
  const base = PROPS[name]; if (!base) return null;
  const inst = base.clone();
  inst.traverse(o => { if (o.isMesh) o.userData.isProp = true; });
  inst.scale.set(1, 1, lenScale || 1);
  inst.rotation.y = rotY || 0;
  inst.position.set(x, y, z);
  World.root.add(inst);
  return inst;
}
// Tiles scifi-wall panels along a straight run from (x0,z0) to (x1,z1),
// stretching each segment slightly so the run divides evenly — purely
// visual, laid over the room's real (invisible-to-this) collision wall.
function tileWallRun(x0, z0, x1, z1, y) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const count = Math.max(1, Math.round(len / 4));
  const segLen = len / count;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    spawnWallPanel('scifi-wall', x0 + dx * t, y, z0 + dz * t, ang, segLen / 4);
  }
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(GEO.box, mat);
  m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  m.position.set(x + w / 2, y + h / 2, z + d / 2);
  m.castShadow = true; m.receiveShadow = true;
  (parent || World.root).add(m);
  return m;
}

/* =============================================================== figures */
function buildFigure(isShadow) {
  const g = new THREE.Group();
  const bodyMat = isShadow ? makeShadowMaterial() : M.player;
  const headMat = isShadow ? bodyMat : M.playerDark;
  const torso = box(0.5, 0.62, 0.34, bodyMat, -0.25, 0.42, -0.17, g);
  const head = box(0.3, 0.28, 0.28, headMat, -0.15, 1.04, -0.14, g);
  const armL = box(0.14, 0.5, 0.16, bodyMat, -0.36, 0.44, -0.08, g);
  const armR = box(0.14, 0.5, 0.16, bodyMat, 0.22, 0.44, -0.08, g);
  const legL = box(0.18, 0.42, 0.18, headMat, -0.19, 0.0, -0.09, g);
  const legR = box(0.18, 0.42, 0.18, headMat, 0.01, 0.0, -0.09, g);
  let light = null;
  if (isShadow) { light = new THREE.PointLight(PAL.purple, 0.8, 5); light.position.set(0, 0.7, 0); g.add(light); }
  return { group: g, mat: isShadow ? bodyMat : null, light, isShadow, baseEmissive: 1, glitchT: 0, phase: Math.random() * 6, legL, legR, armL, armR };
}
function poseFigure(rig, st, dt) {
  const g = rig.group;
  const spd = Math.hypot(st.vx, st.vz);
  if (spd > 0.15) g.rotation.y = damp(g.rotation.y, Math.atan2(st.vx, st.vz), 16, dt);
  rig.phase += dt * clamp(spd * 3.2, 3, 13);
  const swing = spd > 0.15 ? Math.sin(rig.phase) * clamp(spd * 0.16, 0, 0.5) : 0;
  rig.legL.rotation.x = swing; rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8; rig.armR.rotation.x = swing * 0.8;
  if (rig.isShadow && rig.mat) {
    const t = performance.now() * 0.001;
    rig.mat.uniforms.uTime.value = t;
    rig.glitchT = Math.max(0, rig.glitchT - dt);
    if (rig.glitchT <= 0 && Math.random() < 0.02) rig.glitchT = 0.1 + Math.random() * 0.08;
    rig.mat.uniforms.uGlitch.value = rig.glitchT > 0 ? 1 : 0;
    rig.mat.uniforms.uOpacity.value = rig.baseOpacity != null ? rig.baseOpacity : 0.45;
    if (rig.light) rig.light.intensity = 0.8 * rig.baseEmissive * (1 + Math.sin(t * 3 + rig.phase) * 0.3);
  }
}

/* ================================================================= levels
   Every solid is {x,y,z,w,h,d}. Solids no taller than STEP_MAX are stairs —
   walked straight up. Taller ones are walls, until the player is already
   standing above their top (a low wall becomes a railing once you're up on
   the gantry it borders). There is no jump anywhere in this game. */
const LEVELS = [
  {
    num: 'I', title: 'INTAKE', sub: 'you have been here before', time: 13, maxShadows: 3,
    spawn: { x: 0, z: 2 }, exit: { x: 18, z: 2 },
    bounds: { x0: -2, x1: 22, z0: -7, z1: 7 }, ceil: 8,
    hint: 'The door needs weight on the plate. You cannot be in two places.\nLet the clock run out — what you did will still be here.',
    solids: [
      [7.5, 0, -5.5, 1.5, 1.4, 1.5, 'crate'], [7.5, 0, 4, 1.6, 1.1, 1.6, 'rust'],
      [16, 0, -5.5, 1.8, 1.2, 1.8, 'crate'],
    ],
    objects: [
      { t: 'plate', id: 'p1', x: 5, z: 2, w: 2.4 },
      { t: 'door', id: 'd1', x: 11.5, z: 2, w: 1.3, req: ['p1'] },
      { t: 'keepsake', x: 15, z: -3.4, item: 'watch', text: 'Your watch.<br><span style="opacity:.55">It stopped at 09:41 and never started again.</span>' },
    ],
    frags: [
      { x: 2.5, z: 2, text: 'SECTOR C &middot; MAINTENANCE INTAKE<br><span style="opacity:.55">authorised personnel only</span>' },
      { x: 8, z: 0.5, text: 'You know which corridors are load-bearing.<br><span style="opacity:.55">You have never been inside this building.</span>' },
      { x: 12, z: -3, text: 'Fourteen years without maintenance. The lights are still on.' },
      { x: 16, z: 1.5, text: 'Nothing in here has decayed the way it should have.' },
      { x: 19, z: 2, text: 'The badge reader has not asked for a badge in fourteen years.<br><span style="opacity:.55">It still knows you regardless.</span>' },
    ],
    lamps: [[2, 6.4, 0, 1], [7, 6.4, 3, 0], [12, 6.4, -3, 1], [17, 6.4, 2, 1]],
  },
  {
    num: 'II', title: 'SORTING', sub: 'your name is already on the list', time: 15, maxShadows: 4,
    spawn: { x: 0, z: 0 }, exit: { x: 22, z: 5 },
    bounds: { x0: -2, x1: 24, z0: -2, z1: 15 }, ceil: 10,
    hint: 'Two plates. One of you. Build the team out of your failures.\nOne more plate further on. One more of you.',
    solids: [
      [8, 0, 8, 3, 0.4, 3, 'step'], [8.6, 0.4, 8.6, 1.8, 0.4, 1.8, 'step'],
      [14, 0, 3, 1.6, 1.3, 1.6, 'rust'], [3, 0, 12, 1.8, 1.1, 1.8, 'crate'],
      [18, 0, 9, 0.5, 3.2, 3, 'steelDark'],
    ],
    objects: [
      { t: 'plate', id: 'pA', x: 4, z: 0, w: 2.4 },
      { t: 'plate', id: 'pB', x: 8.6, y: 0.8, z: 8.6, w: 1.6 },
      { t: 'door', id: 'd1', x: 12.5, z: 5, w: 1.3, req: ['pA', 'pB'] },
      { t: 'plate', id: 'pC', x: 16.5, z: 13, w: 2.0 },
      { t: 'laser', x1: 20, z1: 13, x2: 20, z2: 5, off: 'pC' },
      { t: 'door', id: 'd2', x: 21.3, z: 5, w: 1.3, req: ['pC'] },
      { t: 'keepsake', x: 4, z: 12.5, item: 'photo', text: 'A photograph, face down.<br><span style="opacity:.55">You do not turn it over. You already know.</span>' },
      { t: 'keepsake', x: 15, z: 1, item: 'key', text: 'A house key, worn smooth.<br><span style="opacity:.55">There is still a house.</span>' },
    ],
    frags: [
      { x: 3, z: 0, text: 'Every door in this building asks for someone who is not here.' },
      { x: 6, z: 13, text: 'SORTING BAY 2 &mdash; <span style="opacity:.55">personal effects, unclaimed</span>' },
      { x: 10, z: 5, text: 'A badge in the tray. Your photograph.<br><span style="opacity:.55">The name is yours. The date is not.</span>' },
      { x: 18, z: 10, text: 'Two was never going to be enough.' },
      { x: 21, z: 5, text: 'Whatever happened here, it happened to someone who signed in.' },
    ],
    lamps: [[2, 8.4, 0, 1], [8, 8.4, 8, 1], [14, 8.4, 4, 0], [18, 8.4, 11, 1], [21, 8.4, 5, 1]],
  },
  {
    num: 'III', title: 'PRESS ROOM', sub: 'the iterations are not free', time: 15, maxShadows: 4,
    spawn: { x: 0, z: 2 }, exit: { x: 20, z: 8 },
    bounds: { x0: -2, x1: 22, z0: -2, z1: 14 }, ceil: 9,
    hint: 'The plate is under the press. Whatever holds it does not come back.\nOne door needs something that never lets go &mdash; hold Q as you die.',
    solids: [
      [6, 0, 5.4, 0.6, 0.42, 5.2, 'step'], [11.4, 0, 5.4, 0.6, 0.42, 5.2, 'step'],
      [16, 0, 10, 1.8, 1.3, 1.8, 'rust'],
    ],
    objects: [
      { t: 'plate', id: 'p1', x: 8, y: -0.42, z: 8, w: 2.6 },
      { t: 'crusher', x: 6.8, z: 6.4, w: 3.4, d: 3.4, pitY: -0.42, top: 6.5, period: 5.0, phase: 0.28 },
      { t: 'door', id: 'd1', x: 13.5, z: 8, w: 1.3, req: ['p1'] },
      { t: 'keepsake', x: 15, z: 10.5, item: 'letter', text: 'A letter you never posted.<br><span style="opacity:.55">The handwriting is steadier than you remember.</span>' },
      { t: 'plate', id: 'p2', x: 17.5, z: 8, w: 2.2 },
      { t: 'door', id: 'd2', x: 19.3, z: 8, w: 1.3, req: ['p2'] },
    ],
    frags: [
      { x: 3, z: 2, text: 'HYDRAULIC PRESS 3 &mdash; <span style="opacity:.55">interlock disabled for containment test 04/11</span>' },
      { x: 8, z: 2.5, text: 'Your pack is already down there.<br><span style="opacity:.55">You are still wearing yours.</span>' },
      { x: 8, z: 8, text: 'Whatever the press keeps, the field keeps.' },
      { x: 13, z: 8, text: 'It never stopped. Nobody came back to switch it off.' },
      { x: 17, z: 8, text: 'Whatever holds this one must never let go.<br><span style="opacity:.55">Some of you cannot be allowed to finish.</span>' },
    ],
    lamps: [[2, 7.4, 2, 1], [8, 7.4, 3, 0], [13, 7.4, 8, 1], [18, 7.4, 8, 1]],
  },
  {
    num: 'IV', title: 'OBSERVATION', sub: 'the door was never locked', time: 28, maxShadows: 5,
    spawn: { x: 0, z: 0 }, exit: { x: 26, z: 12 },
    bounds: { x0: -2, x1: 28, z0: -2, z1: 15 }, ceil: 15,
    deckZone: { x: 10, z: 6, w: 6, d: 6 },
    hint: 'Power. Gate. Beam. Door. Five things, one of you at a time.\nThe last one has to still be there when you arrive &mdash; hold Q as you die.',
    solids: [
      [18, 0, 4, 0.5, 7.4, 0.5, 'steelDark'],
    ],
    objects: [
      { t: 'button', id: 'pwr', x: 3, z: 0, mode: 'latch' },
      { t: 'plate', id: 'pGate', x: 6, z: 0, w: 2.6 },
      { t: 'door', id: 'g1', x: 9, z: 0, w: 1.3, req: ['pGate'] },
      { t: 'elevator', id: 'lift', x: 11, z: 2, w: 3.2, d: 2.8, top: 8, req: 'pwr' },
      { t: 'plate', id: 'pLaser', x: 12, y: 8, z: 8, w: 2.6, onDeck: true },
      { t: 'laser', x1: 14, z1: 2, x2: 14, z2: 14, off: 'pLaser' },
      { t: 'button', id: 'bDoor', x: 16, z: 0, mode: 'pulse' },
      { t: 'door', id: 'g2', x: 20, z: 8, w: 1.3, req: ['bDoor'], timed: 11 },
      { t: 'plate', id: 'pFinal', x: 23, z: 12, w: 2.4 },
      { t: 'door', id: 'g3', x: 24.7, z: 12, w: 1.3, req: ['pFinal'] },
      { t: 'keepsake', x: 26, z: 12, item: 'drawing', text: 'A drawing, in crayon.<br><span style="opacity:.55">Two figures. One of them is much taller.</span>' },
    ],
    frags: [
      { x: 3, z: -1.4, text: 'MAIN BUS &mdash; <span style="opacity:.55">containment floor / observation deck</span>' },
      { x: 11, z: 4, text: 'The lift still smells of the day it failed.' },
      { x: 12, z: 8, deck: true, text: 'This is where they watched from.<br><span style="opacity:.55">You have only ever seen it from the other side.</span>' },
      { x: 14, z: 2, text: 'SITE SURVEY 1961<br><span style="opacity:.55">anomalous interval recorded, sub-level 2</span>' },
      { x: 22, z: 12, text: 'The field has held for fourteen years.<br><span style="opacity:.55">It has only ever needed the one subject.</span>' },
      { x: 25, z: 12, text: 'The door at the end has never been locked.' },
    ],
    lamps: [[2, 7.4, 0, 1], [10, 7.4, 4, 1], [18, 7.4, 4, 1], [24, 7.4, 12, 1]],
  },
];

/* ================================================================== world */
const World = {
  root: new THREE.Group(), level: null, solids: [], ents: [], sig: {},
  lamps: [], exitZone: null, frags: [], occluders: [],
};
scene.add(World.root);

// A wall built this way gets its own material (not the shared M.wall), so it
// can fade to transparent independently of every other wall when it comes
// between the fixed camera and the player — the camera never moves to look
// around a wall, so the wall has to get out of the way instead.
function occludingBox(w, h, d, baseMat, x, y, z) {
  const mat = baseMat.clone();
  mat.transparent = true; mat.opacity = 1;
  const m = box(w, h, d, mat, x, y, z);
  World.occluders.push(m);
  return m;
}

function disposeTree(obj) { obj.traverse(o => { if ((o.isMesh || o.isPoints) && !o.userData.isProp && o.geometry && o.geometry !== GEO.box && o.geometry !== GEO.cyl) o.geometry.dispose(); }); }

function addStair(o) { World.solids.push({ x: o[0], y: o[1], z: o[2], w: o[3], h: o[4], d: o[5] }); box(o[3], o[4], o[5], M[o[6] === 'step' ? 'step' : o[6]] || M.wall, o[0], o[1], o[2]); }

// A door only blocks a narrow slab; without flanking walls the rest of the
// room's width is a free bypass around it. This closes the gap on both
// sides of a door (at its x, across the room's full z-span) so the door
// becomes a true single-file gate exactly where it stands, while the rest
// of the room — off that x — stays fully open for plates and keepsakes.
function sealDoorway(x, doorZ, w, y, h, z0, z1) {
  const half = w / 2;
  const build = (dz0, dz1) => {
    if (dz1 - dz0 <= 0.05) return;
    const s = { x: x - 0.35, y, z: dz0, w: 0.7, h, d: dz1 - dz0 };
    World.solids.push(s); occludingBox(s.w, s.h, s.d, M.wall, s.x, s.y, s.z);
  };
  build(z0, doorZ - half);
  build(doorZ + half, z1);
}

function buildFloor(L) {
  const b = L.bounds;
  box(b.x1 - b.x0, 0.12, b.z1 - b.z0, M.floor, b.x0, -0.12, b.z0);
}
function buildWalls(L) {
  const b = L.bounds, c = L.ceil || 9, WT = 0.4;
  const wallSolid = (x, y, z, w, h, d) => { World.solids.push({ x, y, z, w, h, d }); occludingBox(w, h, d, M.wall, x, y, z); };
  wallSolid(b.x0 - WT, 0, b.z0 - WT, b.x1 - b.x0 + WT * 2, c, WT);
  wallSolid(b.x0 - WT, 0, b.z1, b.x1 - b.x0 + WT * 2, c, WT);
  wallSolid(b.x0 - WT, 0, b.z0 - WT, WT, c, b.z1 - b.z0 + WT * 2);
  wallSolid(b.x1, 0, b.z0 - WT, WT, c, b.z1 - b.z0 + WT * 2);
}
function buildLamps(L) {
  World.lamps.length = 0;
  for (const lp of L.lamps) {
    const [x, y, z, alive] = lp;
    const g = new THREE.Group(); World.root.add(g); g.position.set(x, y, z);
    box(1.6, 0.12, 0.5, M.steelDark, -0.8, 0, -0.25, g);
    const tube = box(1.3, 0.08, 0.3, alive ? new THREE.MeshBasicMaterial({ color: 0xffc98a }) : M.steelDark, -0.65, -0.1, -0.15, g);
    const lt = new THREE.PointLight(0xff9944, alive ? 2.6 : 0, 15, 2); lt.position.set(0, -0.3, 0); g.add(lt);
    World.lamps.push({ alive, baseAlive: alive, tube, light: lt, flickId: World.lamps.length * 7.3 });
  }
}
function buildExit(L) {
  const ex = L.exit;
  const g = new THREE.Group(); World.root.add(g); g.position.set(ex.x, 0, ex.z);
  box(0.35, 4.2, 2.6, M.steelDark, -1.6, 0, -1.3, g);
  box(0.35, 4.2, 2.6, M.steelDark, 1.25, 0, -1.3, g);
  const glow = box(0.16, 3.8, 2.2, new THREE.MeshBasicMaterial({ color: 0x6affc0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), -1.3, 0, -1.1, g);
  const lt = new THREE.PointLight(0x5fffb4, 1.4, 9, 2); lt.position.set(0, 2, 0); g.add(lt);
  World.exitZone = { x: ex.x - 1.1, z: ex.z - 1.2, w: 2.2, d: 2.4 };
}

/* ---------------------------------------------------------------- entities */
class Plate {
  constructor(o) {
    this.o = o; this.id = o.id; this.on = false; this.depress = 0;
    const PITCH = [1, 1.26, 0.84, 1.5, 0.71];
    let hash = 0; for (let i = 0; i < this.id.length; i++) hash = (hash * 31 + this.id.charCodeAt(i)) >>> 0;
    this.pitchRatio = PITCH[hash % PITCH.length];
    const g = new THREE.Group(); World.root.add(g); this.g = g;
    const pw = o.w || 2.4, pd = o.w || 2.4, y = o.y || 0;
    g.position.set(o.x, y, o.z);
    box(pw + 0.4, 0.1, pd + 0.4, M.steelDark, -pw / 2 - 0.2, 0, -pd / 2 - 0.2, g);
    this.pad = box(pw, 0.14, pd, M.steel, -pw / 2, 0.1, -pd / 2, g);
    this.ring = box(pw * 0.7, 0.03, 0.12, new THREE.MeshBasicMaterial({ color: 0x2c4c3a }), -pw * 0.35, 0.24, pd / 2 - 0.06, g);
    this.light = new THREE.PointLight(0x4fffb0, 0, 5, 2); this.light.position.set(0, 0.5, 0); g.add(this.light);
    this.y = y; this.footprint = { x: o.x - pw / 2, z: o.z - pd / 2, w: pw, d: pd };
  }
  trigger(actors) {
    const f = this.footprint; let on = false;
    for (const a of actors) {
      if (!a.alive) continue;
      if (Math.abs(a.y - this.y) > 0.6) continue;
      if (a.x > f.x - 0.2 && a.x < f.x + f.w + 0.2 && a.z > f.z - 0.2 && a.z < f.z + f.d + 0.2) { on = true; break; }
    }
    if (on !== this.on) { this.on = on; Audio.S.plate(on, this.pitchRatio); }
    World.sig[this.id] = on;
  }
  render(dt) {
    this.depress = damp(this.depress, this.on ? 1 : 0, 18, dt);
    this.pad.position.y = 0.1 - this.depress * 0.07;
    this.ring.material.color.setHex(this.on ? 0x4fffb0 : 0x2c4c3a);
    this.light.intensity = damp(this.light.intensity, this.on ? 1.3 : 0, 10, dt);
  }
}

class Button {
  constructor(o) {
    this.o = o; this.id = o.id; this.latched = false; this.flash = 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, 0, o.z);
    box(0.9, 0.9, 0.9, M.steelDark, -0.45, 0, -0.45, g);
    this.lens = box(0.5, 0.5, 0.1, new THREE.MeshBasicMaterial({ color: 0x4a3018 }), -0.25, 0.9, -0.05, g);
    this.light = new THREE.PointLight(0xffa451, 0, 5, 2); this.light.position.set(0, 1.1, 0); g.add(this.light);
  }
  trigger(actors) {
    const o = this.o; let fired = false;
    for (const a of actors) { if (a.alive && Math.hypot(a.x - o.x, a.z - o.z) < 1.3 && a.usePress) fired = true; }
    if (fired) { Audio.S.button(); if (o.mode === 'latch') this.latched = true; World.sig[this.id] = true; this.flash = 0.25; }
    else World.sig[this.id] = o.mode === 'latch' ? this.latched : false;
  }
  render(dt) {
    const lit = this.latched || this.flash > 0; if (this.flash > 0) this.flash -= dt;
    this.lens.material.color.setHex(lit ? 0xffb15e : 0x4a3018);
    this.light.intensity = damp(this.light.intensity, lit ? 1.4 : 0, 12, dt);
  }
}

class Door {
  constructor(o) {
    this.o = o; this.open = 0; this.target = 0; this.timer = 0; this.wasReq = false;
    const dw = o.w || 1.3, dh = 2.6, y = o.y || 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, y, o.z);
    box(0.35, dh + 0.5, dw + 0.6, M.steelDark, -0.5, 0, -dw / 2 - 0.3, g);
    box(0.35, dh + 0.5, dw + 0.6, M.steelDark, 0.5, 0, -dw / 2 - 0.3, g);
    box(dw + 1.0, 0.3, dw + 0.6, M.steelDark, -0.5, dh, -dw / 2 - 0.3, g);
    this.slab = box(0.3, dh, dw, M.steel, -0.15, 0, -dw / 2, g);
    this.lamp = box(0.14, 0.14, 0.3, new THREE.MeshBasicMaterial({ color: 0x802318 }), -0.07, dh + 0.16, -0.15, g);
    this.light = new THREE.PointLight(0xff4a32, 0.5, 5, 2); this.light.position.set(0, dh + 0.16, 0); g.add(this.light);
    this.dh = dh; this.dw = dw; this.y = y;
  }
  logic(dt) {
    const o = this.o; let req = o.req.every(id => !!World.sig[id]);
    if (o.timed) { if (req && !this.wasReq) this.timer = o.timed; this.wasReq = req; this.timer = Math.max(0, this.timer - dt); req = this.timer > 0; }
    if (req !== (this.target > 0.5)) Audio.S.door();
    this.target = req ? 1 : 0;
    const step = dt * 1.7;
    this.open = this.open < this.target ? Math.min(this.target, this.open + step) : Math.max(this.target, this.open - step);
  }
  solid() {
    const k = 1 - this.open; if (k <= 0.02) return null;
    return { x: this.o.x - 0.15 - this.dw * k * 0 - 0.0, y: this.y, z: this.o.z - this.dw / 2, w: 0.3, h: this.dh, d: this.dw * k, __door: true };
  }
  render() {
    this.slab.scale.z = Math.max(0.001, this.dw * (1 - this.open));
    this.slab.position.z = -this.dw / 2 + (this.dw * (1 - this.open)) / 2;
    const c = this.open > 0.5 ? 0x53ff9a : 0x802318;
    this.lamp.material.color.setHex(c); this.light.color.setHex(c);
    this.light.intensity = 0.4 + (this.o.timed && this.timer > 0 && this.timer < 3 ? (Math.sin(this.timer * 18) * 0.5 + 0.5) * 1.1 : 0.3);
  }
}

class Crusher {
  constructor(o) {
    this.o = o; this.y = o.top; this.tickAcc = 0; this.ducked = false; this.lastK = 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, 0, o.z);
    this.head = box(o.w, 1.0, o.d, M.steel, -o.w / 2, o.top, -o.d / 2, g);
    box(o.w + 0.3, 0.16, o.d + 0.3, M.rust, -o.w / 2 - 0.15, o.top - 0.16, -o.d / 2 - 0.15, g);
    this.shadowMark = box(o.w * 0.86, 0.02, o.d * 0.86, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }), -o.w * 0.43, (o.pitY || 0) + 0.01, -o.d * 0.43, g);
  }
  logic(dt, t) {
    const o = this.o;
    const p = ((t + o.phase * 60) % (o.period * 60)) / (o.period * 60);
    let k;
    if (p < 0.55) k = 0; else if (p < 0.63) k = ease((p - 0.55) / 0.08); else if (p < 0.78) k = 1; else k = 1 - ease((p - 0.78) / 0.22);
    this.y = lerp(o.top, (o.pitY || 0) + 1.0, k);
    const near = G.player && Math.hypot(G.player.x - o.x, G.player.z - o.z) < o.w * 2 + 2;
    if (p >= 0.40 && p < 0.55 && near) {
      const windup = (p - 0.40) / 0.15; this.tickAcc += dt * (2 + windup * 9);
      if (this.tickAcc > 1) { this.tickAcc = 0; Audio.S.tick(0.015 + windup * 0.03); }
    } else this.tickAcc = 0;
    if (p >= 0.53 && p < 0.55 && near && !this.ducked) { Audio.duck(0.8, 0.08); this.ducked = true; }
    if (p < 0.53 || p >= 0.55) this.ducked = false;
    if (k === 1 && this.lastK < 1) Audio.S.crush();
    this.lastK = k;
    this.shadowMark.material.opacity = 0.1 + k * 0.35;
  }
  kills() {
    const o = this.o;
    if (this.y > (o.pitY || 0) + 1.15) return null;
    return { x: o.x - o.w * 0.4, y: (o.pitY || 0), z: o.z - o.d * 0.4, w: o.w * 0.8, h: 1.0, d: o.d * 0.8 };
  }
  render() { this.head.position.y = this.y; }
}

class Elevator {
  constructor(o) {
    this.o = o; this.y = 0; this.powered = false; this.moving = 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, 0, o.z);
    box(o.w, 0.3, o.d, M.steel, -o.w / 2, 0, -o.d / 2, g);
    box(o.w + 0.1, 0.1, o.d + 0.1, M.rust, -o.w / 2 - 0.05, 0.3, -o.d / 2 - 0.05, g);
    this.lampE = box(0.2, 0.2, 0.1, new THREE.MeshBasicMaterial({ color: 0x3a2a14 }), o.w / 2 - 0.1, 0.5, o.d / 2 - 0.05, g);
    this.light = new THREE.PointLight(0xffb15e, 0, 6, 2); this.light.position.set(0, 0.8, 0); g.add(this.light);
    this.footprint = { x: o.x - o.w / 2, z: o.z - o.d / 2, w: o.w, d: o.d };
  }
  logic(dt, actors) {
    const o = this.o, powered = !!World.sig[o.req];
    let rider = false;
    for (const a of actors) {
      if (!a.alive) continue;
      if (Math.abs(a.y - this.y) < 0.5 && a.x > this.footprint.x && a.x < this.footprint.x + this.footprint.w && a.z > this.footprint.z && a.z < this.footprint.z + this.footprint.d) { rider = true; break; }
    }
    const dir = powered && rider ? 1 : (rider ? 0 : -1);
    const prevY = this.y;
    this.y = clamp(this.y + dir * 2.2 * dt, 0, o.top);
    this.dy = this.y - prevY;
    this.powered = powered;
    if (Math.abs(this.dy) > 0.001) { this.moving += dt; if (this.moving > 0.45) { this.moving = 0; Audio.S.lift(); } }
  }
  render() {
    this.g.position.y = this.y;
    this.lampE.material.color.setHex(this.powered ? 0xffb15e : 0x3a2a14);
    this.light.intensity = damp(this.light.intensity || 0, this.powered ? 0.8 : 0, 6, TICK);
  }
}

class Keepsake {
  constructor(o) {
    this.o = o; this.taken = false; this.ph = Math.random() * 6.28;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, o.y || 0, o.z);
    box(0.5, 0.08, 0.5, M.steelDark, -0.25, 0, -0.25, g);
    this.item = box(0.24, 0.22, 0.06, M.keepsake, -0.12, 0.4, -0.03, g);
    this.light = new THREE.PointLight(0xffc98a, 1.2, 5.5, 2); this.light.position.set(0, 0.8, 0); g.add(this.light);
  }
  trigger() {
    if (this.taken) return;
    const p = G.player; if (!p || !p.alive) return;
    const o = this.o;
    if (Math.hypot(p.x - o.x, p.z - o.z) > 0.9 || Math.abs(p.y - (o.y || 0)) > 0.8) return;
    this.taken = true; G.bonus += PH_TIME_BONUS; Audio.S.pickup(); showBonus(PH_TIME_BONUS);
    if (o.text) showKeepsake(o.text);
  }
  render(dt) {
    this.ph += dt; this.g.visible = !this.taken; if (this.taken) { this.light.intensity = 0; return; }
    this.item.rotation.y = this.ph * 0.7; this.item.position.y = 0.4 + Math.sin(this.ph * 1.7) * 0.05;
    this.light.intensity = 1.0 + Math.sin(this.ph * 2.2) * 0.25;
  }
}

class Laser {
  constructor(o) {
    this.o = o; this.active = true;
    const g = new THREE.Group(); World.root.add(g); this.g = g;
    const len = Math.hypot(o.x2 - o.x1, o.z2 - o.z1);
    const ang = Math.atan2(o.x2 - o.x1, o.z2 - o.z1);
    g.position.set(o.x1, 0.9, o.z1); g.rotation.y = ang;
    this.beam = box(0.08, 0.08, len, new THREE.MeshBasicMaterial({ color: 0xff6a4a }), -0.04, -0.04, 0, g);
    this.halo = box(0.4, 0.4, len, new THREE.MeshBasicMaterial({ color: 0xff2d12, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }), -0.2, -0.2, 0, g);
    this.light = new THREE.PointLight(0xff4a32, 1.0, 7, 2); this.light.position.set(0, 0, len / 2); g.add(this.light);
    this.line = { x1: o.x1, z1: o.z1, x2: o.x2, z2: o.z2, y: 0.9 };
  }
  logic() { this.active = !World.sig[this.o.off]; }
  kills() {
    if (!this.active) return null;
    const l = this.line, x0 = Math.min(l.x1, l.x2) - 0.3, x1 = Math.max(l.x1, l.x2) + 0.3;
    const z0 = Math.min(l.z1, l.z2) - 0.3, z1 = Math.max(l.z1, l.z2) + 0.3;
    return { x: x0, y: l.y - 0.5, z: z0, w: x1 - x0, h: 1.0, d: z1 - z0 };
  }
  render(dt) {
    this.beam.visible = this.halo.visible = this.active;
    const flick = 0.85 + Math.random() * 0.3;
    this.beam.scale.set(flick, flick, 1); this.halo.scale.set(flick, flick, 1);
    this.light.intensity = damp(this.light.intensity, this.active ? 1.0 : 0, 8, dt);
  }
}

function resetWorldRoot() {
  disposeTree(World.root); scene.remove(World.root);
  for (const m of World.occluders) m.material.dispose();
  World.root = new THREE.Group(); scene.add(World.root);
  World.solids = []; World.ents = []; World.sig = {}; World.frags = []; World.occluders = [];
}
function addLighting() {
  const sun = new THREE.DirectionalLight(0x9fc0e0, 0.5); sun.position.set(-16, 30, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -18; sc.near = 1; sc.far = 100;
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
  World.root.add(sun); World.root.add(sun.target); World.sun = sun;
  World.hemi = new THREE.HemisphereLight(0x2b3d4e, 0x08090c, 0.32); World.root.add(World.hemi);
}

function buildLevel(idx) {
  resetWorldRoot();
  const L = LEVELS[idx]; World.level = L;
  buildFloor(L); buildWalls(L);
  for (const s of (L.solids || [])) addStair(s);
  buildLamps(L); buildExit(L);
  for (const o of L.objects) {
    let e = null;
    if (o.t === 'plate') e = new Plate(o);
    else if (o.t === 'button') e = new Button(o);
    else if (o.t === 'door') { e = new Door(o); sealDoorway(o.x, o.z, o.w || 1.3, o.y || 0, L.ceil || 9, L.bounds.z0, L.bounds.z1); }
    else if (o.t === 'crusher') e = new Crusher(o);
    else if (o.t === 'elevator') e = new Elevator(o);
    else if (o.t === 'laser') e = new Laser(o);
    else if (o.t === 'keepsake') e = new Keepsake(o);
    if (e) { e.kind = o.t; World.ents.push(e); }
  }
  World.frags = L.frags.map(f => ({ ...f, seen: false }));
  decorateRoom(idx);
  addLighting();
}

// Story-matched set-dressing per room — pure decoration, placed clear of
// plates/doors/hazards so nothing here ever affects a puzzle.
function decorateRoom(idx) {
  if (idx === 0) { // INTAKE — mundane maintenance, one safety fixture
    spawnProp('lab-extinguisher', 2, 0, -5.5, 1, 0.4);
  } else if (idx === 1) { // SORTING — the effects shelf the frags describe
    spawnProp('lab-cabinet', 6, 0, 12.6, 1, Math.PI);
    spawnProp('lab-magnifier', 5.3, 0.75, 12.3, 1, 0.2);
  } else if (idx === 2) { // PRESS ROOM — safety gear nobody used
    spawnProp('lab-glasses', 3.4, 0, 3.2, 1, 0);
    spawnProp('lab-gloves', 2.6, 0, 3.6, 1, 0.5);
  } else if (idx === 3) { // OBSERVATION — the desk on the deck, watching the floor
    spawnProp('lab-counter', 10.5, 8, 8.5, 1, Math.PI / 2);
    spawnProp('scifi-computer', 10.85, 8.7, 8.2, 1, 0.3); // the dead monitor
    spawnProp('scifi-access', 14, 8, 10, 1, -0.6);
    spawnProp('scifi-chest', 13, 8, 6.8, 1, 0.2);
  }
}

/* ==================================================================== hub
   The building between rooms: a tall industrial atrium, two floors, two
   room doors per floor, a locked stair gate. No timer, no Shadows here —
   it is the only place in the game the player can simply walk around. */
class HubDoor {
  constructor(o) {
    this.o = o; this.unlocked = !o.need; this.open = this.unlocked ? 1 : 0;
    const dw = o.w || 1.6, dh = 2.6, y = o.y || 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, y, o.z);
    box(0.3, dh + 0.5, dw + 0.5, M.steelDark, -0.45, 0, -dw / 2 - 0.25, g);
    box(0.3, dh + 0.5, dw + 0.5, M.steelDark, 0.45, 0, -dw / 2 - 0.25, g);
    box(dw + 0.9, 0.3, dw + 0.5, M.steelDark, -0.45, dh, -dw / 2 - 0.25, g);
    this.slab = box(0.26, dh, dw, M.steel, -0.13, 0, -dw / 2, g);
    this.lamp = box(0.14, 0.14, 0.3, new THREE.MeshBasicMaterial({ color: 0x802318 }), -0.07, dh + 0.16, -0.15, g);
    this.light = new THREE.PointLight(0xff4a32, 0.5, 5, 2); this.light.position.set(0, dh + 0.16, 0); g.add(this.light);
    this.dh = dh; this.dw = dw; this.y = y;
  }
  refresh() { if (!this.unlocked) this.unlocked = !this.o.need || this.o.need.every(k => G.keys.has(k)); }
  logic(dt) {
    const target = this.unlocked ? 1 : 0;
    if (target !== this.open && this.open === 0) Audio.S.door();
    this.open = this.open < target ? Math.min(target, this.open + dt * 1.4) : Math.max(target, this.open - dt * 1.4);
  }
  solid() { if (this.open > 0.98) return null; return { x: this.o.x - 0.13, y: this.y, z: this.o.z - this.dw / 2, w: 0.26, h: this.dh, d: this.dw, __door: true }; }
  triggered(p) {
    if ((!this.unlocked && !G.dev) || !p) return false;
    // tight — a real step through the doorway, not just walking nearby
    return Math.abs(p.x - this.o.x) < this.dw * 0.42 && Math.abs(p.z - this.o.z) < 0.45 && Math.abs(p.y - this.y) < 0.6;
  }
  render() {
    // slides sideways into the frame, like the room doors, instead of
    // just vanishing the instant it unlocks
    this.slab.scale.z = Math.max(0.001, this.dw * (1 - this.open));
    this.slab.position.z = -this.dw / 2 + (this.dw * (1 - this.open)) / 2;
    const c = this.unlocked ? 0x53ff9a : 0x802318;
    this.lamp.material.color.setHex(c); this.light.color.setHex(c); this.light.intensity = 0.45;
  }
}

// Everything below is also the shape the level builder (builder.html) reads
// and writes as levels.json — floors/stairs/doors are arrays so the hub can
// grow past two floors without touching this file.
const HUB = {
  bounds: { x0: -3, x1: 25, z0: -7, z1: 7 }, ceil: 13,
  spawn: { x: 1, z: 0 },
  floors: [
    { y: 4.6, bounds: { x0: 8, x1: 25, z0: -7, z1: -3.4 } },
  ],
  stairs: [
    { x0: 13, z0: -3.4, w: 2.6, steps: 11, rise: 0.44, run: 1.05, fromY: 0 },
  ],
  doors: [
    { need: null, x: 6, y: 0, z: 6.2, w: 1.7, to: 0 },
    { need: ['k0'], x: 18, y: 0, z: 6.2, w: 1.7, to: 1 },
    // ordered along the walkway in the order the player actually reaches
    // them coming off the stairs (x descending) — a locked door must never
    // sit between the stairs and one that's already open.
    { need: ['k0', 'k1'], x: 20, y: 4.6, z: -6.2, w: 1.7, to: 2 },
    { need: ['k0', 'k1', 'k2'], x: 12, y: 4.6, z: -6.2, w: 1.7, to: 3 },
  ],
  lamps: [[2, 9.4, -3, 1], [10, 9.4, 4, 1], [16, 9.4, -3, 1], [22, 9.4, 4, 1], [16, 8.4, -3, 1]],
};

// A sloped top rail plus two vertical end posts, run straight from the
// bottom tread to the top tread along one edge of the walkway. The posts
// are placed in world space (not inside the rotated rail group) so they
// stay vertical instead of leaning with the slope.
function buildHandrail(st) {
  const RUN = st.run || 1.05;
  const lowI = st.flip ? st.steps - 1 : 0;
  const highI = st.flip ? 0 : st.steps - 1;
  const lowX = st.x0 + lowI * RUN + RUN / 2;
  const highX = st.x0 + highI * RUN + RUN / 2;
  const railZ = st.z0 + 0.18;
  const lowTreadY = (st.fromY || 0) + st.rise;
  const highTreadY = (st.fromY || 0) + st.rise * st.steps;
  const railH = 0.9;
  box(0.06, railH, 0.06, M.steelDark, lowX - 0.03, lowTreadY, railZ - 0.03);
  box(0.06, railH, 0.06, M.steelDark, highX - 0.03, highTreadY, railZ - 0.03);
  const dx = highX - lowX, dy = highTreadY - lowTreadY;
  const len = Math.hypot(dx, dy);
  const g = new THREE.Group(); World.root.add(g);
  g.position.set(lowX, lowTreadY + railH, railZ);
  g.rotation.z = Math.atan2(dy, dx);
  box(len, 0.07, 0.07, M.steelDark, 0, -0.035, -0.035, g);
}

// Pure set-dressing along the open ground-floor strip — kept away from the
// stairs, floors and doors, whose footprints are handled elsewhere.
function decorateHub() {
  const b = HUB.bounds;
  const cz = 0; // clear middle strip, well outside the stair/floor z-bands
  spawnProp('pipe-large', b.x0 + 2.2, 0, cz - 3, 1, Math.PI / 2);
  spawnProp('pipe-large-bend', b.x1 - 3, 0, cz - 3, 1, 0);
  spawnProp('cog-a', (b.x0 + b.x1) / 2, 0.02, cz + 4, 1.4, 0);
  spawnProp('pipe-large-valve', b.x0 + 2.2, 0, cz + 3, 1, 0);

  // corner columns, real geometry instead of plain boxes — column-free is
  // ~3 units tall natively, stacked twice plus a cap to reach toward the
  // ceiling
  for (const cx of [b.x0 + 0.6, b.x1 - 0.6]) for (const cz2 of [b.z0 + 0.6, b.z1 - 0.6]) {
    spawnProp('column-free', cx, 0, cz2, 1, 0);
    spawnProp('column-free', cx, 3, cz2, 1, 0);
    spawnProp('column-cap', cx, 6, cz2, 1, 0);
  }
  // a couple of windows on the long walls for atmosphere
  spawnProp('window-a', (b.x0 + b.x1) / 2 - 6, 3.5, b.z0 + 0.05, 1, 0);
  spawnProp('window-a', (b.x0 + b.x1) / 2 + 6, 3.5, b.z0 + 0.05, 1, 0);
}

// Two rows of real modular wall panels laid over the (still invisible-proof)
// collision walls buildWalls() already made — visual only, so if the panels
// fail to load the room is still fully enclosed and playable, just plainer.
function buildHubWallFacade(b) {
  const T = 0.6; // half the panel's native thickness — lines its inner face up with the collision wall
  for (const y of [0, 3.03]) {
    tileWallRun(b.x0, b.z0 - T, b.x1, b.z0 - T, y);
    tileWallRun(b.x0, b.z1 + T, b.x1, b.z1 + T, y);
    tileWallRun(b.x0 - T, b.z0, b.x0 - T, b.z1, y);
    tileWallRun(b.x1 + T, b.z0, b.x1 + T, b.z1, y);
  }
}

function buildHub() {
  resetWorldRoot();
  World.level = HUB;
  const b = HUB.bounds;
  buildFloor({ bounds: b });
  buildWalls({ bounds: b, ceil: HUB.ceil });
  buildHubWallFacade(b);

  // stairs — literal runs of steps, auto-walked, no jump anywhere in this game.
  for (const st of (HUB.stairs || [])) {
    const RUN = st.run || 1.05;
    // "flip" mirrors which end is the base and which is the landing, so a
    // stair built against the opposite wall can climb toward the room's
    // interior instead of dead-ending into that wall.
    //
    // Each tread is built as a thin band (one rise tall) sitting at its own
    // height, not a full column down to the ground — a full column made the
    // tallest tread a solid wall that hid every shorter one behind it from
    // most camera angles, so the whole staircase read as one monolith
    // instead of visible ascending steps. The collision top (fromY + top)
    // is unchanged, only what's rendered below it.
    for (let i = 0; i < st.steps; i++) {
      const top = st.flip ? st.rise * (st.steps - i) : st.rise * (i + 1);
      const bandY = (st.fromY || 0) + top - st.rise;
      addStair([st.x0 + i * RUN, bandY, st.z0, RUN + 0.05, st.rise, st.w, 'step']);
    }
    buildHandrail(st);
  }
  // each upper floor is its own walkable slab, matching whatever stair
  // climbed to reach it — add as many as you like.
  for (const fl of (HUB.floors || [])) {
    const fb = fl.bounds;
    World.solids.push({ x: fb.x0, y: fl.y, z: fb.z0, w: fb.x1 - fb.x0, h: 0.1, d: fb.z1 - fb.z0 });
    box(fb.x1 - fb.x0, 0.14, fb.z1 - fb.z0, M.floor, fb.x0, fl.y - 0.14, fb.z0);
  }

  // corner columns and other set-dressing are real GLB geometry now (see
  // decorateHub) — open to the top, no roof trusses capping the view down
  // into the building.
  decorateHub();

  buildLamps({ lamps: HUB.lamps || [] });

  // Hub doors need no flanking seal — unlike a puzzle room's single corridor,
  // walking around one just puts you elsewhere in the same open hub floor;
  // there is nothing on the far side to bypass into until it unlocks.
  World.hubDoors = HUB.doors.map(o => { const e = new HubDoor(o); World.ents.push(e); return e; });
  addLighting();
}

/* ============================================================ actor / sim */
const PH = { R: 0.34, ACCEL: 46, FRICTION: 40, MAX: 5.2 };

function groundAt(x, z, curY) {
  let g = 0;
  for (const s of World.solids) {
    if (s.__door) continue;
    if (x <= s.x - PH.R || x >= s.x + s.w + PH.R || z <= s.z - PH.R || z >= s.z + s.d + PH.R) continue;
    const top = s.y + s.h;
    if (top <= curY + STEP_MAX + 0.02) g = Math.max(g, top);
  }
  for (const e of World.ents) {
    if (e.kind !== 'elevator') continue;
    const f = e.footprint;
    if (x <= f.x || x >= f.x + f.w || z <= f.z || z >= f.z + f.d) continue;
    const top = e.y + 0.3;
    if (Math.abs(top - curY) < 1.0) g = Math.max(g, top);
  }
  return g;
}
function blockedAt(nx, nz, y, doors) {
  for (const s of World.solids) {
    if (s.__door) continue;
    if (nx <= s.x - PH.R || nx >= s.x + s.w + PH.R || nz <= s.z - PH.R || nz >= s.z + s.d + PH.R) continue;
    if (s.y + s.h > y + STEP_MAX + 0.02) return true;
  }
  for (const d of doors) {
    if (nx <= d.x - PH.R || nx >= d.x + d.w + PH.R || nz <= d.z - PH.R || nz >= d.z + d.d + PH.R) continue;
    if (y < d.y + d.h - 0.02) return true;
  }
  return false;
}

class Actor {
  constructor(isShadow, tint) {
    this.isShadow = isShadow;
    this.rig = buildFigure(isShadow);
    if (isShadow) { this.rig.baseEmissive = tint.emissive || 1; this.rig.baseOpacity = tint.opacity || 0.45; }
    World.root.add(this.rig.group);
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.alive = true; this.usePress = false; this.useHeld = false; this.anchorHeld = false;
    this.stepAcc = 0;
  }
  box() { return { x: this.x - PH.R, y: this.y, z: this.z - PH.R, w: PH.R * 2, h: 1.6, d: PH.R * 2 }; }
  place(x, z) { this.x = x; this.z = z; this.y = groundAt(x, z, 0); this.vx = this.vz = 0; this.alive = true; this.rig.group.visible = true; }
  destroy() { World.root.remove(this.rig.group); disposeTree(this.rig.group); }

  simulate(dt, input, doors) {
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }
    if (dx !== 0) { this.vx += dx * PH.ACCEL * dt; this.vx = clamp(this.vx, -PH.MAX, PH.MAX); }
    else { const f = PH.FRICTION * dt; this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f; }
    if (dz !== 0) { this.vz += dz * PH.ACCEL * dt; this.vz = clamp(this.vz, -PH.MAX, PH.MAX); }
    else { const f = PH.FRICTION * dt; this.vz = Math.abs(this.vz) <= f ? 0 : this.vz - Math.sign(this.vz) * f; }

    this.usePress = input.usePress; this.useHeld = input.use; this.anchorHeld = !!input.anchor;

    if (G.dev) {
      // dev room-jump: noclip — walk straight through walls and locked
      // doors to look at everything, nothing here should ever block you
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    } else {
      const nx = this.x + this.vx * dt;
      if (!blockedAt(nx, this.z, this.y, doors)) this.x = nx; else this.vx = 0;
      const nz = this.z + this.vz * dt;
      if (!blockedAt(this.x, nz, this.y, doors)) this.z = nz; else this.vz = 0;
    }
    this.y = groundAt(this.x, this.z, this.y);

    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 0.6) { this.stepAcc += spd * dt; if (this.stepAcc > 1.55) { this.stepAcc = 0; if (G.speed < 4) Audio.S.step(false); } }
    else this.stepAcc = 1.2;
  }
  playback(frame) {
    this.x = frame.x; this.y = frame.y; this.z = frame.z; this.vx = frame.vx; this.vz = frame.vz;
    this.usePress = frame.u; this.anchorHeld = !!frame.a;
    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 0.6) { this.stepAcc += spd * TICK; if (this.stepAcc > 1.55) { this.stepAcc = 0; if (G.speed < 4) Audio.S.step(true); } }
  }
  record() { return { x: this.x, y: this.y, z: this.z, vx: this.vx, vz: this.vz, u: this.usePress, a: this.anchorHeld }; }
  render(dt) {
    this.rig.group.position.set(this.x, this.y, this.z);
    poseFigure(this.rig, { vx: this.vx, vz: this.vz }, dt);
  }
}

function shadowTint(age) { return { emissive: Math.max(0.48, 1.05 - age * 0.16), opacity: Math.max(0.46, 0.76 - age * 0.06) }; }

/* ================================================================ game FSM */
const G = {
  state: 'menu', scene: 'hub', level: 0, tapes: [], attempt: 1, tick: 0, rec: [], keys: new Set(),
  player: null, shadows: [], time: 0, bonus: 0, speed: 1, shake: 0, camPull: 1, trans: null, dev: false,
  timers: { intro: 0, death: 0, win: 0 }, deathCause: '', flashT: 0, alarm: 0, heart: 0, cue10: false, cue5: false, cue3: false,
};

const UI = {
  hud: $('#hud'), time: $('#time'), bonus: $('#bonus'), shadowcount: $('#shadowcount'), attempt: $('#attempt'),
  speed: $('#speed'), hint: $('#hint'), frag: $('#frag'), keepsake: $('#keepsake'), anchor: $('#anchor'),
  card: $('#roomcard'), menu: $('#menu'), pause: $('#pause'), ending: $('#ending'), vignette: $('#vignette'),
  flash: $('#flash'), fade: $('#fade'), loading: $('#loading'), dbg: $('#dbg'), build: $('#build'),
  devmode: $('#devmode'),
};
if (UI.build) UI.build.textContent = BUILD;

function clearActors() { if (G.player) G.player.destroy(); for (const s of G.shadows) s.destroy(); G.player = null; G.shadows = []; }
function resetEntities() {
  World.sig = {};
  for (const e of World.ents) {
    if (e instanceof Door) { e.open = 0; e.target = 0; e.timer = 0; e.wasReq = false; }
    if (e instanceof Button) { e.latched = false; e.flash = 0; }
    if (e instanceof Plate) { e.on = false; e.depress = 0; }
    if (e instanceof Elevator) { e.y = 0; }
    if (e instanceof Crusher) { e.y = e.o.top; e.lastK = 0; }
    if (e instanceof Keepsake) e.taken = false;
  }
}
function applyTension() {
  const n = G.tapes.length;
  for (const l of World.lamps) l.alive = l.baseAlive;
  const working = World.lamps.filter(l => l.baseAlive).length;
  const budget = Math.min(n, Math.max(0, working - 1));
  let killed = 0;
  for (let i = World.lamps.length - 1; i >= 0 && killed < budget; i--) if (World.lamps[i].baseAlive) { World.lamps[i].alive = false; killed++; }
  scene.fog.density = BASE_FOG * (1 + 0.15 * n);
  renderer.toneMappingExposure = Math.max(0.85, BASE_EXPOSURE - 0.035 * n);
  if (World.hemi) World.hemi.intensity = Math.max(0.18, 0.32 - 0.025 * n);
  Audio.klaxonLevel(Math.min(0.05, 0.015 * n));
}

function startAttempt() {
  const L = World.level;
  clearActors(); resetEntities();
  G.tick = 0; G.rec = []; G.cue10 = G.cue5 = G.cue3 = false; G.heart = 0; G.alarm = 0; G.bonus = 0;
  UI.vignette.classList.remove('alarm');
  G.player = new Actor(false); G.player.place(L.spawn.x, L.spawn.z);
  const n = G.tapes.length;
  G.shadows = G.tapes.map((tape, i) => {
    const a = new Actor(true, shadowTint(n - 1 - i)); a.tape = tape; a.place(tape[0].x, tape[0].z); a.y = tape[0].y; return a;
  });
  applyTension(); updateHUD();
}
function killPlayer(cause) {
  if (G.state !== 'play') return;
  if (G.dev) return; // dev room-jump: no timer, no hazards, no death — just looking around
  G.state = 'dying'; G.deathCause = cause; G.timers.death = 0; G.shake = 1.0;
  Audio.S.die(); flash(0.14);
  G.player.alive = false; G.player.rig.group.visible = false;
}
function commitDeath() {
  const L = World.level; const wasEmpty = G.tapes.length === 0;
  if (G.rec.length > 8) {
    G.tapes.push(G.rec); if (G.tapes.length > L.maxShadows) G.tapes.shift();
    Audio.S.spawnShadow(); flash(0.10); G.shake = Math.max(G.shake, 0.8);
    if (wasEmpty) G.camPull = Math.max(G.camPull, 0.5);
  }
  G.attempt++; startAttempt(); G.state = 'play';
}
function loadLevel(i) {
  G.level = i; buildLevel(i); G.tapes = []; G.attempt = 1; startAttempt();
  const L = LEVELS[i];
  $('#roomcard .n').textContent = 'ROOM ' + L.num; $('#roomcard .t').textContent = L.title; $('#roomcard .s').textContent = L.sub;
  UI.card.classList.add('on'); UI.hint.innerHTML = L.hint.replace(/\n/g, '<br>');
  G.state = 'intro'; G.timers.intro = 0; G.camPull = 0.6; Audio.S.reveal(); setFade(0);
}

/* --------------------------------------------------------- room ↔ hub flow
   Walking through a doorway never cuts — it dollies in, cuts to black, and
   the world underneath is swapped while the screen is dark, then the same
   dolly eases back out to the normal framing on the other side. */
function beginTransition(swapFn, nextState) {
  G.trans = { phase: 'in', t: 0, durIn: 0.42, durOut: 0.6, swapFn, nextState };
  G.state = 'trans';
}
function transitionZoomFactor() {
  const t = G.trans; if (!t) return 1;
  if (t.phase === 'in') return lerp(1, 0.6, ease(clamp(t.t / t.durIn, 0, 1)));
  if (t.phase === 'out') return lerp(0.6, 1, ease(clamp(t.t / t.durOut, 0, 1)));
  return 0.6;
}
function updateTransition(dt) {
  const t = G.trans; if (!t) return;
  t.t += dt;
  if (t.phase === 'in') {
    setFade(clamp(t.t / t.durIn, 0, 1));
    if (t.t >= t.durIn) { t.swapFn(); t.phase = 'out'; t.t = 0; }
  } else {
    setFade(clamp(1 - t.t / t.durOut, 0, 1));
    if (t.t >= t.durOut) { setFade(0); G.state = t.nextState; G.trans = null; }
  }
}

function enterRoom(idx) {
  beginTransition(() => {
    buildLevel(idx);
    G.scene = 'room'; G.level = idx; G.tapes = []; G.attempt = 1; startAttempt();
    const L = LEVELS[idx];
    $('#roomcard .n').textContent = 'ROOM ' + L.num; $('#roomcard .t').textContent = L.title; $('#roomcard .s').textContent = L.sub;
    UI.card.classList.add('on'); UI.hint.innerHTML = L.hint.replace(/\n/g, '<br>');
    G.timers.intro = 0; G.camPull = 0.4;
    camTarget.set(L.spawn.x, G.player.y + 1, L.spawn.z);
    Audio.S.reveal();
  }, 'intro');
}
function returnToHub(fromIdx) {
  const d = HUB.doors[fromIdx];
  beginTransition(() => {
    G.keys.add('k' + fromIdx);
    buildHub();
    G.scene = 'hub';
    G.player = new Actor(false);
    const bz = d.y ? d.z + 1.8 : d.z - 1.8;
    G.player.place(d.x, bz); G.player.y = d.y || 0;
    G.shadows = []; G.tapes = [];
    camTarget.set(d.x, G.player.y + 1, bz);
    UI.hud.hidden = true; UI.hint.classList.remove('on'); UI.frag.classList.remove('on'); UI.keepsake.classList.remove('on');
    G.camPull = 0;
  }, 'play');
}

function stepHub(dt) {
  const input = { left: held.left(), right: held.right(), up: held.up(), down: held.down(), use: held.use(), usePress: !!Pressed.KeyE, anchor: false };
  const doors = [];
  for (const e of World.ents) if (e instanceof HubDoor) { e.refresh(); e.logic(dt); const s = e.solid(); if (s) doors.push(s); }
  G.player.simulate(dt, input, doors);
  Pressed.KeyE = false;
  for (const e of World.ents) if (e instanceof HubDoor && e.triggered(G.player)) { enterRoom(e.o.to); break; }
}

function currentDoors() { const out = []; for (const e of World.ents) if (e instanceof Door) { const s = e.solid(); if (s) out.push(s); } return out; }

function stepSim(dt) { if (G.scene === 'hub') stepHub(dt); else stepRoom(dt); }

function stepRoom(dt) {
  const L = World.level;
  G.tick++;
  const doors = currentDoors();
  const allActors = [G.player, ...G.shadows];

  const input = {
    left: held.left(), right: held.right(), up: held.up(), down: held.down(),
    use: held.use(), usePress: !!Pressed.KeyE, anchor: held.anchor(),
  };
  G.player.simulate(dt, input, doors);
  Pressed.KeyE = false;

  for (const s of G.shadows) {
    if (!s.alive) continue;
    if (G.tick - 1 < s.tape.length) s.playback(s.tape[G.tick - 1]);
    // else: tape exhausted. If its final recorded frame anchored, it freezes
    // in place for the rest of the attempt; otherwise it vanishes.
    else if (!(s.tape.length && s.tape[s.tape.length - 1].a)) { s.alive = false; s.rig.group.visible = false; }
  }

  for (const e of World.ents) {
    if (e instanceof Plate) e.trigger(allActors);
    else if (e instanceof Button) e.trigger(allActors);
    else if (e instanceof Elevator) e.logic(dt, allActors);
    else if (e instanceof Crusher) e.logic(dt, G.tick);
    else if (e instanceof Laser) e.logic();
  }
  for (const e of World.ents) if (e instanceof Door) e.logic(dt);

  for (const e of World.ents) {
    let kz = null;
    if (e instanceof Crusher) kz = e.kills();
    else if (e instanceof Laser) kz = e.kills();
    if (!kz) continue;
    if (G.player.alive && hit2({ x: G.player.x - PH.R, z: G.player.z - PH.R, w: PH.R * 2, d: PH.R * 2 }, kz) && Math.abs(G.player.y - kz.y) < kz.h + 0.4) {
      killPlayer('hazard');
    }
  }

  for (const e of World.ents) if (e instanceof Keepsake) e.trigger();

  for (const f of World.frags) {
    if (f.seen) continue;
    const inDeck = !!f.deck;
    if (inDeck !== isPlayerOnDeck()) continue;
    if (Math.hypot(G.player.x - f.x, G.player.z - f.z) < 1.8) { f.seen = true; showFrag(f.text); }
  }

  if (G.player.alive) {
    const ez = World.exitZone;
    if (G.player.x > ez.x && G.player.x < ez.x + ez.w && G.player.z > ez.z && G.player.z < ez.z + ez.d) winRoom();
  }

  G.rec.push(G.player.record());

  if (!G.dev) {
    G.time -= dt;
    if (G.time <= 10 && !G.cue10) { G.cue10 = true; }
    if (G.time <= 5 && !G.cue5) { G.cue5 = true; UI.vignette.classList.add('alarm'); Audio.S.alarm(); }
    if (G.time <= 3 && !G.cue3) { G.cue3 = true; }
    if (G.time <= 5 && G.time > 0) { G.heart += dt; if (G.heart > 0.55) { G.heart = 0; Audio.S.heart(); } }
    if (G.time <= 0 && G.player.alive) killPlayer('timeout');
  }

  const anchoring = G.player.alive && G.player.anchorHeld;
  UI.anchor.classList.toggle('on', anchoring); Audio.anchorLevel(anchoring ? 0.06 : 0);
  if (Keys.KeyR && G.player.alive) killPlayer('chose');

  if (L.deckZone) Audio.ambientLevel(isPlayerOnDeck() ? 0.24 : 0.5);
}
function isPlayerOnDeck() {
  const L = World.level; if (!L.deckZone || !G.player) return false;
  const d = L.deckZone;
  return G.player.x > d.x && G.player.x < d.x + d.w && G.player.z > d.z && G.player.z < d.z + d.d && G.player.y > 3;
}

function winRoom() {
  G.state = 'won'; G.timers.win = 0; Audio.S.win();
  const idx = G.level;
  setTimeout(() => {
    if (idx < LEVELS.length - 1) returnToHub(idx);
    else startEnding();
  }, 900);
}

function flash(v) { G.flashT = v; }
function setFade(v) { UI.fade.style.opacity = v; }
function showFrag(html) { UI.frag.innerHTML = html; UI.frag.classList.add('on'); clearTimeout(showFrag._t); showFrag._t = setTimeout(() => UI.frag.classList.remove('on'), 5200); }
function showKeepsake(html) { UI.keepsake.innerHTML = html; UI.keepsake.classList.add('on'); clearTimeout(showKeepsake._t); showKeepsake._t = setTimeout(() => UI.keepsake.classList.remove('on'), 5600); }
function showBonus(n) { UI.bonus.textContent = '+' + n + 's'; UI.bonus.classList.remove('on'); void UI.bonus.offsetWidth; UI.bonus.classList.add('on'); }

function updateHUD() {
  const t = Math.max(0, G.time);
  UI.time.textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  UI.time.classList.toggle('low', t <= 10 && t > 5);
  UI.time.classList.toggle('crit', t <= 5);
  UI.shadowcount.textContent = '× ' + G.shadows.filter(s => s.alive).length;
  UI.attempt.textContent = 'Attempt ' + G.attempt;
}

/* ================================================================= camera */
const camTarget = new THREE.Vector3(); let camPos = new THREE.Vector3();
function updateCamera(dt) {
  if (!G.player) return;
  const L = World.level;
  const pull = damp(G.camPull, 0, 1.4, dt); G.camPull = pull;
  const cx = (L.bounds.x0 + L.bounds.x1) / 2, cz = (L.bounds.z0 + L.bounds.z1) / 2;
  // a small emphasis pull, never a wide reveal — the room is never shown whole
  const tx = lerp(G.player.x, cx, pull * 0.18), tz = lerp(G.player.z, cz, pull * 0.18);
  camTarget.x = damp(camTarget.x, tx, 6, dt);
  camTarget.y = damp(camTarget.y, G.player.y + 1.0, 6, dt);
  camTarget.z = damp(camTarget.z, tz, 6, dt);
  let dist = ISO.dist * (1 + pull * 0.15);
  dist *= transitionZoomFactor();
  const shakeAmt = G.shake * 0.18;
  camPos.copy(camTarget).addScaledVector(CAM_DIR, dist);
  camPos.x += (Math.random() - 0.5) * shakeAmt; camPos.y += (Math.random() - 0.5) * shakeAmt;
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  updateWallOcclusion(dt);
}

// The camera never orbits, so if a wall sits between it and the player there
// is no "looking around it" — the wall has to fade instead. Ray from the
// camera to the player each frame; anything hit first is between the two
// and gets faded down, everything else eases back to fully opaque.
const occRay = new THREE.Raycaster();
const occTarget = new THREE.Vector3();
let occHitting = new Set();
function updateWallOcclusion(dt) {
  if (!G.player || !World.occluders.length) return;
  occTarget.set(G.player.x, G.player.y + 0.95, G.player.z);
  const dir = occTarget.clone().sub(camera.position);
  const dist = dir.length();
  dir.normalize();
  occRay.set(camera.position, dir);
  occRay.near = 0.1; occRay.far = Math.max(0.2, dist - 0.5);
  const hits = occRay.intersectObjects(World.occluders, false);
  occHitting = new Set(hits.map(h => h.object));
  for (const m of World.occluders) {
    const target = occHitting.has(m) ? 0.12 : 1;
    m.material.opacity = damp(m.material.opacity, target, 12, dt);
  }
}

/* =================================================================== ending */
function startEnding() {
  G.state = 'ending';
  UI.hud.hidden = true; UI.hint.classList.remove('on'); UI.frag.classList.remove('on'); UI.keepsake.classList.remove('on');
  Audio.ambientLevel(0.18); Audio.klaxonLevel(0);
  $('#e1').textContent = 'NOTHING IN HERE HAS CHANGED IN FOURTEEN YEARS.';
  setTimeout(() => { UI.ending.classList.add('on'); $('#e1').classList.add('on'); }, 1200);
  setTimeout(() => {
    $('#e1').classList.remove('on');
    setTimeout(() => { $('#e1').textContent = 'EVERYTHING OUT THERE HAS.'; $('#e1').classList.add('on'); }, 900);
  }, 7000);
  setTimeout(() => { $('#e1').classList.remove('on'); $('#etitle').classList.add('on'); }, 14500);
}

/* ===================================================================== loop */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;

  if (Keys.Digit1) G.speed = 1; if (Keys.Digit2) G.speed = 2; if (Keys.Digit3) G.speed = 4;
  UI.speed.classList.toggle('on', G.speed > 1);
  if (G.speed > 1) UI.speed.textContent = 'FAST FORWARD ×' + G.speed;
  if (UI.devmode) UI.devmode.classList.toggle('on', G.dev && G.state !== 'menu');

  if (G.state === 'menu') {
    if (!checkDevRoomJump()) {
      for (const k in Pressed) if (Pressed[k]) { Pressed[k] = false; startGame(); break; }
    }
  } else if (G.state === 'intro') {
    G.timers.intro += dt;
    if (G.timers.intro > 2.9) { UI.card.classList.remove('on'); UI.hud.hidden = false; UI.hint.classList.add('on'); G.state = 'play'; G.time = World.level.time + G.bonus; }
    updateCamera(dt);
  } else if (G.state === 'play') {
    if (Pressed.Escape) { Pressed.Escape = false; G.state = 'pause'; UI.pause.classList.add('on'); }
    else if (Pressed.Backspace && G.scene === 'room') { Pressed.Backspace = false; loadLevel(G.level); }
    else {
      const steps = G.scene === 'room' ? G.speed : 1;
      for (let i = 0; i < steps; i++) { G.time += G.bonus; G.bonus = 0; stepSim(TICK); if (G.state !== 'play') break; }
      updateCamera(dt); if (G.scene === 'room') updateHUD();
    }
  } else if (G.state === 'trans') {
    updateTransition(dt); updateCamera(dt);
  } else if (G.state === 'dying') {
    G.timers.death += dt;
    if (G.timers.death > 0.65) commitDeath();
    updateCamera(dt);
  } else if (G.state === 'won') {
    updateCamera(dt);
  } else if (G.state === 'pause') {
    if (checkDevRoomJump()) { /* handled */ }
    else if (Pressed.Escape) { Pressed.Escape = false; G.state = 'play'; UI.pause.classList.remove('on'); }
    else if (Pressed.KeyR && G.scene === 'room') { Pressed.KeyR = false; UI.pause.classList.remove('on'); killPlayer('chose'); G.state = 'dying'; }
    else if (Pressed.Backspace && G.scene === 'room') { Pressed.Backspace = false; UI.pause.classList.remove('on'); loadLevel(G.level); }
  }

  if (G.flashT > 0) { UI.flash.style.opacity = G.flashT; G.flashT = damp(G.flashT, 0, 10, dt); if (G.flashT < 0.01) { G.flashT = 0; UI.flash.style.opacity = 0; } }
  else UI.flash.style.opacity = 0;

  for (const e of World.ents) e.render(dt);
  if (G.player) G.player.render(dt);
  for (const s of G.shadows) if (s.alive) s.render(dt);
  const tNow = now * 0.001;
  for (const l of World.lamps) {
    const target = l.alive ? 2.6 : 0;
    l.baseIntensity = damp(l.baseIntensity || 0, target, 4, dt);
    let flick = Math.sin(tNow * 15 + l.flickId) * 0.1 + Math.sin(tNow * 23 + l.flickId * 1.8) * 0.05;
    if (Math.random() < 0.02) flick -= 0.3;
    l.light.intensity = Math.max(0, l.baseIntensity * (1 + flick));
  }

  for (const k in Pressed) Pressed[k] = false;
  renderer.render(scene, camera);
}

function startGame() {
  UI.menu.classList.remove('on');
  G.scene = 'hub'; G.keys = new Set();
  buildHub(); World.level = HUB;
  G.player = new Actor(false); G.player.place(HUB.spawn.x, HUB.spawn.z);
  G.shadows = []; G.tapes = [];
  G.state = 'play'; G.camPull = 0; G.dev = false;
  UI.hud.hidden = true; UI.hint.classList.remove('on');
  Audio.S.reveal();
}

// Dev-only: jump straight into any room from the menu or pause screen,
// skipping the hub and any key requirements, so content can be checked
// without replaying everything leading up to it. Digit1..Digit9 map to
// LEVELS[0..8] — works no matter how many rooms the level builder adds.
const DEV_ROOM_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
function checkDevRoomJump() {
  for (let i = 0; i < DEV_ROOM_KEYS.length; i++) {
    if (Pressed[DEV_ROOM_KEYS[i]] && i < LEVELS.length) { Pressed[DEV_ROOM_KEYS[i]] = false; devJumpToRoom(i); return true; }
  }
  if (Pressed.Digit0) { Pressed.Digit0 = false; devGoToHub(); return true; }
  return false;
}
function devJumpToRoom(idx) {
  UI.menu.classList.remove('on'); UI.pause.classList.remove('on');
  if (!G.player) { G.player = new Actor(false); G.player.place(0, 0); G.shadows = []; G.tapes = []; G.keys = new Set(); }
  for (let i = 0; i < idx; i++) G.keys.add('k' + i); // so a later hub visit still makes sense
  G.state = 'play'; G.dev = true;
  enterRoom(idx);
}
function devGoToHub() {
  UI.menu.classList.remove('on'); UI.pause.classList.remove('on');
  G.dev = true;
  beginTransition(() => {
    G.scene = 'hub'; buildHub(); World.level = HUB;
    if (!G.player) G.player = new Actor(false);
    G.player.place(HUB.spawn.x, HUB.spawn.z);
    G.shadows = []; G.tapes = [];
    UI.hud.hidden = true; UI.hint.classList.remove('on'); UI.frag.classList.remove('on'); UI.keepsake.classList.remove('on');
    G.camPull = 0;
  }, 'play');
}

// Rooms and the hub are loaded from levels.json when present (that's what
// builder.html reads and writes) so the map can grow without editing this
// file at all; the arrays above are only the fallback if it's missing.
async function loadLevelData() {
  try {
    const res = await fetch('levels.json?v=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.rooms) && data.rooms.length) { LEVELS.length = 0; LEVELS.push(...data.rooms); }
    if (data.hub) Object.assign(HUB, data.hub);
  } catch (e) { console.warn('levels.json not found, using built-in rooms', e); }
}

(async () => {
  await Promise.all([loadLevelData(), loadProps()]);
  buildHub();
  World.level = HUB;
  camTarget.set(HUB.spawn.x, 1, HUB.spawn.z);
  camPos.copy(camTarget).addScaledVector(CAM_DIR, ISO.dist);
  camera.position.copy(camPos); camera.lookAt(camTarget);
  setFade(0);
  UI.loading.style.display = 'none';
  requestAnimationFrame(frame);
})();
