/* ============================================================================
   The Last Shift — metroidvania facility. One continuous map, countdown timer,
   persistent shadow clones replaying every run. Keepsakes extend the clock;
   abilities unlock dash. Play plane: X/Z floor, Y vertical.
   ========================================================================== */
'use strict';

const BUILD = '23:58:00';
const ASSET_V = 'metroidvania3';
const TICK = 1 / 60;
const STEP_MAX = 0.46;
const SPAWN = { x: 2, y: 0, z: 3 };
const MAX_SHADOWS = 12;
const FACILITY = { x0: -2, x1: 58, z0: -6, z1: 18, ceil: 4 };

const URL_PARAMS = new URLSearchParams(location.search);
const DEV_AUTO = URL_PARAMS.has('auto');
const DEV_DEBUG = URL_PARAMS.has('debug');
const DEV_GHOSTS = parseInt(URL_PARAMS.get('ghosts') || '0', 10) || 0;
const DEV_SKIP_INTRO = URL_PARAMS.has('skipintro');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const ease = t => t * t * (3 - 2 * t);
const $ = s => document.querySelector(s);
const hit2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;

const ZONES = [
  { id: 'intake', num: 'I', name: 'INTAKE', sub: 'you have been here before', x0: 0, x1: 10, cp: { x: 2, z: 3 } },
  { id: 'sorting', num: 'II', name: 'SORTING', sub: 'your name is already on the list', x0: 12, x1: 30, cp: { x: 13, z: 3 } },
  { id: 'press', num: 'III', name: 'PRESS ROOM', sub: 'the iterations are not free', x0: 32, x1: 44, cp: { x: 33, z: 5 } },
  { id: 'observation', num: 'IV', name: 'OBSERVATION', sub: 'the door was never locked', x0: 46, x1: 56, cp: { x: 47, z: 3 } },
];

const ENDING_LINES = [
  'NOTHING IN HERE HAS CHANGED IN FOURTEEN YEARS.',
  'EVERYTHING OUT THERE HAS.',
];

const Keys = Object.create(null);
const Pressed = Object.create(null);
let anyKeyHook = null;

addEventListener('keydown', e => {
  const k = e.code;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
  if (!Keys[k]) Pressed[k] = true;
  Keys[k] = true;
  if (k === 'Backquote') {
    G.dev = !G.dev;
    const tag = document.getElementById('devmode');
    if (tag) tag.classList.toggle('on', G.dev);
    if (G.dev && G.player) {
      G.player.alive = true; G.player.rig.group.visible = true;
      if (G.state === 'dying' || G.state === 'dead' || G.state === 'rewinding') G.state = 'play';
    }
  }
  if (anyKeyHook) { const f = anyKeyHook; anyKeyHook = null; f(); }
  Audio.unlock();
});
addEventListener('keyup', e => { Keys[e.code] = false; });
addEventListener('blur', () => { for (const k in Keys) Keys[k] = false; });
addEventListener('wheel', e => {
  e.preventDefault();
  ISO.targetDist = clamp(ISO.targetDist + e.deltaY * 0.015, 8, 30);
}, { passive: false });

const held = {
  left: () => !!(Keys.KeyA || Keys.ArrowLeft),
  right: () => !!(Keys.KeyD || Keys.ArrowRight),
  up: () => !!(Keys.KeyW || Keys.ArrowUp),
  down: () => !!(Keys.KeyS || Keys.ArrowDown),
  use: () => !!Keys.KeyE,
  fastfwd: () => !!(Keys.ShiftLeft || Keys.ShiftRight),
  dash: () => !!Pressed.Space,
};

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
    preloadSfx();
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
  // ── Sample-based SFX ──
  const SFX_PATH = 'assets/sfx/';
  const sfxBuffers = {};
  const sfxLoading = {};
  function loadSfx(name) {
    if (sfxBuffers[name] || sfxLoading[name]) return;
    sfxLoading[name] = true;
    fetch(SFX_PATH + name + '.ogg').then(r => r.arrayBuffer()).then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { sfxBuffers[name] = decoded; })
      .catch(() => {});
  }
  function playSfx(name, vol, rate) {
    if (!ready) return;
    const buf = sfxBuffers[name]; if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate || 1;
    const g = ctx.createGain(); g.gain.value = vol != null ? vol : 0.5;
    s.connect(g).connect(master); s.start();
  }
  // Preload all SFX
  function preloadSfx() {
    const names = ['step_0','step_1','step_2','step_3','step_4',
      'die','die_low','spawn_shadow','plate_on','plate_off',
      'button','door_open','door_close','crush','laser',
      'pickup','dash','ability','alarm','heart','win','reveal','tick'];
    names.forEach(loadSfx);
  }

  const S = {
    step(shadow) { playSfx('step_' + (Math.random() * 5 | 0), shadow ? 0.15 : 0.35, 0.9 + Math.random() * 0.2); },
    die() {
      playSfx('die', 0.4);
      if (!ready) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.6);
      g.gain.setValueAtTime(0.35, t);
      g.gain.linearRampToValueAtTime(0, t + 0.7);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.7);
      const ns = ctx.createBufferSource(); ns.buffer = NB;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.setValueAtTime(3000, t); nf.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.linearRampToValueAtTime(0, t + 0.5);
      ns.connect(nf).connect(ng).connect(master); ns.start(t); ns.stop(t + 0.5);
    },
    spawnShadow() { playSfx('spawn_shadow', 0.5); },
    plate(on) { playSfx(on ? 'plate_on' : 'plate_off', 0.5, 0.9 + Math.random() * 0.2); },
    button() {
      playSfx('button', 0.3);
      if (!ready) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(1100, t + 0.04);
      g.gain.setValueAtTime(0.18, t);
      g.gain.linearRampToValueAtTime(0, t + 0.12);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.12);
    },
    door() { playSfx('door_open', 0.45); },
    crush() { playSfx('crush', 0.7); },
    laser() { playSfx('laser', 0.3); },
    lift() { playSfx('door_open', 0.2, 0.6); },
    pickup() { playSfx('pickup', 0.5); },
    win() { playSfx('win', 0.5); },
    reveal() { playSfx('reveal', 0.4); },
    heart() { playSfx('heart', 0.5, 0.5); },
    alarm() { playSfx('alarm', 0.35); },
    tick(vol) { playSfx('tick', vol != null ? vol * 3 : 0.15, 1.5 + Math.random() * 0.5); },
    dash() { playSfx('dash', 0.4, 1.2); },
    abilityPickup() { playSfx('ability', 0.55); },
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
  let bgm = null, bgmGain = null;
  function startBGM() {
    if (!ready || bgm) return;
    bgm = new window.Audio('assets/ihatetuesdays-jungle-ish-beat-for-video-games-314073.mp3');
    bgm.loop = true;
    bgm.volume = 0;
    bgm.play().catch(() => {});
    const src = ctx.createMediaElementSource(bgm);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0;
    src.connect(bgmGain).connect(master);
    bgmGain.gain.setTargetAtTime(0.35, ctx.currentTime, 1.5);
    bgm.volume = 1;
  }
  function bgmLevel(v) {
    if (bgmGain) bgmGain.gain.setTargetAtTime(v, ctx.currentTime, 0.8);
  }
  return { unlock, S, ambientLevel, klaxonLevel, anchorLevel, duck, startBGM, bgmLevel, get ok() { return ready; } };
})();

const BASE_FOG = 0.032, BASE_EXPOSURE = 0.95;
const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = BASE_EXPOSURE;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c1e);
scene.fog = new THREE.FogExp2(0x101530, BASE_FOG);

const ISO = { az: Math.PI * 0.235, elevRad: 1.02, targetElevRad: 1.02, dist: 15, targetDist: 15 };
const CAM_DIR = new THREE.Vector3();
function updateCamDir() {
  CAM_DIR.set(
    Math.sin(ISO.az) * Math.cos(ISO.elevRad),
    Math.sin(ISO.elevRad),
    Math.cos(ISO.az) * Math.cos(ISO.elevRad),
  ).normalize();
}
updateCamDir();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1, 260);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const PAL = {
  concrete: 0x2c3040, concreteDark: 0x1e2232, floor: 0x1a1e2c,
  steel: 0x484e5c, steelDark: 0x1c2030, rust: 0x3a2820, crate: 0x4a3e28,
  purple: 0x8a6dff, purpleGlow: 0xbca6ff, amber: 0xd2993b, red: 0xff4433, green: 0x4fe0a0,
  cyan: 0x4fe0ff,
};
const M = {};
function std(color, rough, metal, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); }
M.floor = (function() {
  const sz = 512, c = document.createElement('canvas');
  c.width = c.height = sz;
  const ctx = c.getContext('2d');
  // Base colour
  ctx.fillStyle = '#1a1e2c';
  ctx.fillRect(0, 0, sz, sz);
  // Subtle noise / stains
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * sz, y = Math.random() * sz;
    const v = 18 + Math.random() * 14;
    ctx.fillStyle = `rgba(${v},${v+2},${v+6},${0.25 + Math.random() * 0.2})`;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // Tile grid — 4x4 tiles per texture repeat
  const tileSize = sz / 4;
  ctx.strokeStyle = 'rgba(40,46,60,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, sz); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(sz, i * tileSize); ctx.stroke();
  }
  // Inner tile seam (subtle)
  ctx.strokeStyle = 'rgba(30,34,48,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const p = i * sz / 8;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, sz); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(sz, p); ctx.stroke();
  }
  // Occasional scuff marks
  ctx.strokeStyle = 'rgba(14,16,22,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const x1 = Math.random() * sz, y1 = Math.random() * sz;
    const ang = Math.random() * Math.PI * 2, len = 8 + Math.random() * 30;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(15, 6); // 60 units / 4 tiles per repeat = 15, 24 units / 4 = 6
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // Normal map from same canvas for slight bumpiness
  const nSz = 256, nc = document.createElement('canvas');
  nc.width = nc.height = nSz;
  const nctx = nc.getContext('2d');
  nctx.fillStyle = '#8080ff'; // neutral normal
  nctx.fillRect(0, 0, nSz, nSz);
  const ntile = nSz / 4;
  // Grout lines as slight indents in normal map
  nctx.strokeStyle = 'rgba(128,128,200,0.8)';
  nctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    nctx.beginPath(); nctx.moveTo(i * ntile, 0); nctx.lineTo(i * ntile, nSz); nctx.stroke();
    nctx.beginPath(); nctx.moveTo(0, i * ntile); nctx.lineTo(nSz, i * ntile); nctx.stroke();
  }
  const nTex = new THREE.CanvasTexture(nc);
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
  nTex.repeat.set(15, 6);
  return new THREE.MeshStandardMaterial({
    map: tex, normalMap: nTex, normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.82, metalness: 0.08, color: 0xffffff
  });
})();
M.wall = std(PAL.concrete, 0.85, 0.15);
M.wallDark = std(PAL.concreteDark, 0.9, 0.1);
M.steel = std(PAL.steel, 0.4, 0.6);
M.steelDark = std(PAL.steelDark, 0.6, 0.4);
M.rust = std(PAL.rust, 0.94, 0.1);
M.crate = std(PAL.crate, 0.9, 0.05);
M.step = std(0x2a2a32, 0.9, 0.05);
M.player = std(0x8fa2ac, 0.75, 0.1);
M.playerDark = std(0x232a2e, 0.85, 0.05);
M.keepsake = std(0xd8c39a, 0.55, 0.1, { emissive: 0xffcf94, emissiveIntensity: 0.7 });
M.ability = std(0x8ae8ff, 0.4, 0.2, { emissive: 0x4fe0ff, emissiveIntensity: 0.9 });
M.glass = std(0x2a4a4a, 0.3, 0.1, { transparent: true, opacity: 0.4, emissive: 0x18302f, emissiveIntensity: 0.5 });

function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    skinning: true,
    uniforms: {
      uTime: { value: 0 }, uGlitch: { value: 0 }, uOpacity: { value: 0.45 },
      uColor: { value: new THREE.Color(PAL.purple) }, uGlow: { value: new THREE.Color(PAL.purpleGlow) },
    },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uTime; uniform float uGlitch;
      varying vec3 vNormal; varying vec3 vViewDir;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        vec3 transformed = vec3(position);
        #include <skinning_vertex>
        vec3 pos = transformed;
        pos.y += sin(pos.y * 40.0 + uTime * 8.0) * 0.008;
        pos.x += uGlitch * sin(uTime * 97.0) * 0.15;
        pos.z += uGlitch * cos(uTime * 131.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * objectNormal);
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

const GEO = { box: new THREE.BoxBufferGeometry(1, 1, 1), cyl: new THREE.CylinderBufferGeometry(1, 1, 1, 12) };

const PROP_DEFS = {
  'lab-counter': { folder: 'lab', scale: 0.01 },
  'lab-cabinet': { folder: 'lab', scale: 0.01 },
  'lab-glasses': { folder: 'lab', scale: 0.01 },
  'lab-gloves': { folder: 'lab', scale: 0.01 },
  'lab-extinguisher': { folder: 'lab', scale: 0.01 },
  'lab-magnifier': { folder: 'lab', scale: 0.01 },
  'scifi-computer': { folder: 'scifi', file: 'Prop_Computer', ext: 'gltf' },
  'scifi-access': { folder: 'scifi', file: 'Prop_AccessPoint', ext: 'gltf' },
  'scifi-chest': { folder: 'scifi', file: 'Prop_Chest', ext: 'gltf' },
  'door-metal': { folder: 'doors', file: 'Door_Metal', ext: 'gltf' },
  'door-frame': { folder: 'doors', file: 'Door_Frame_A', ext: 'gltf' },
  'sm-crate': { folder: 'scifi-modular', file: 'Props_Crate' },
  'sm-crate-long': { folder: 'scifi-modular', file: 'Props_CrateLong' },
  'sm-computer': { folder: 'scifi-modular', file: 'Props_Computer' },
  'sm-computer-sm': { folder: 'scifi-modular', file: 'Props_ComputerSmall' },
  'sm-chest': { folder: 'scifi-modular', file: 'Props_Chest' },
  'sm-shelf': { folder: 'scifi-modular', file: 'Props_Shelf' },
  'sm-shelf-tall': { folder: 'scifi-modular', file: 'Props_Shelf_Tall' },
  'sm-capsule': { folder: 'scifi-modular', file: 'Props_Capsule' },
  'sm-pod': { folder: 'scifi-modular', file: 'Props_Pod' },
  'sm-vessel': { folder: 'scifi-modular', file: 'Props_Vessel' },
  'sm-container': { folder: 'scifi-modular', file: 'Props_ContainerFull' },
  'sm-statue': { folder: 'scifi-modular', file: 'Props_Statue' },
  'sm-column': { folder: 'scifi-modular', file: 'Column_1' },
  'sm-column2': { folder: 'scifi-modular', file: 'Column_2' },
  'sm-column-slim': { folder: 'scifi-modular', file: 'Column_Slim' },
  'sm-pipes': { folder: 'scifi-modular', file: 'Pipes' },
  'sm-vent': { folder: 'scifi-modular', file: 'Details_Vent_1' },
  'sm-plate': { folder: 'scifi-modular', file: 'Details_Plate_Large' },
  'sm-hexagon': { folder: 'scifi-modular', file: 'Details_Hexagon' },
  'sm-output': { folder: 'scifi-modular', file: 'Details_Output' },
  'sm-wall1': { folder: 'scifi-modular', file: 'Wall_1' },
  'sm-wall2': { folder: 'scifi-modular', file: 'Wall_2' },
  'sm-window': { folder: 'scifi-modular', file: 'Window_Wall_SideA' },
  'sm-door-single': { folder: 'scifi-modular', file: 'Door_Single' },
  'sm-door-wall': { folder: 'scifi-modular', file: 'DoorSingle_Wall_SideA' },
  'sm-staircase': { folder: 'scifi-modular', file: 'Staircase' },
  'sm-base': { folder: 'scifi-modular', file: 'Props_Base' },
  'sm-laser': { folder: 'scifi-modular', file: 'Props_Laser' },
  'sm-pipes-sm': { folder: 'scifi-modular', file: 'Details_Pipes_Small' },
  'sm-vent2': { folder: 'scifi-modular', file: 'Details_Vent_2' },
  'sm-plate-sm': { folder: 'scifi-modular', file: 'Details_Plate_Small' },
};
const PROPS = Object.create(null);
const PROP_PRIORITY = { 'door-metal': 1, 'door-frame': 1 };
function loadProps(priority) {
  if (typeof THREE.GLTFLoader !== 'function') return Promise.resolve();
  const loader = new THREE.GLTFLoader();
  const entries = Object.entries(PROP_DEFS).filter(([name]) =>
    priority ? PROP_PRIORITY[name] : !PROP_PRIORITY[name]
  );
  return Promise.all(entries.map(([name, def]) => new Promise(resolve => {
    loader.load('assets/' + def.folder + '/' + (def.file || name) + '.' + (def.ext || 'glb') + '?v=' + ASSET_V,
      gltf => {
        gltf.scene.traverse(o => {
          if (o.isMesh) {
            o.castShadow = false; o.receiveShadow = true;
            if (def.mat) { o.material = M[def.mat]; }
            else if (def.folder === 'scifi-modular' && o.material) {
              const c = o.material.color;
              if (c) { c.r = Math.min(1, c.r * 2.8 + 0.12); c.g = Math.min(1, c.g * 2.8 + 0.12); c.b = Math.min(1, c.b * 2.8 + 0.12); }
              o.material.metalness = 0.3; o.material.roughness = 0.6;
            }
          }
        });
        PROPS[name] = gltf.scene; resolve();
      }, undefined, (err) => { console.warn('PROP LOAD FAIL:', name, err); resolve(); });
  })));
}
const _propList = [];
function spawnProp(name, x, y, z, scale, rotY) {
  const base = PROPS[name]; if (!base) return null;
  const inst = base.clone();
  inst.traverse(o => { if (o.isMesh) o.userData.isProp = true; });
  const baseScale = (PROP_DEFS[name] && PROP_DEFS[name].scale) || 1;
  inst.scale.setScalar((scale || 1) * baseScale);
  inst.rotation.y = rotY || 0;
  inst.position.set(x, y, z);
  World.root.add(inst);
  _propList.push(inst);
  return inst;
}
function spawnWallPanel(name, x, y, z, rotY, lenScale) {
  const base = PROPS[name]; if (!base) return null;
  const inst = base.clone();
  inst.traverse(o => { if (o.isMesh) o.userData.isProp = true; });
  inst.scale.set(1, 1, lenScale || 1);
  inst.rotation.y = rotY || 0;
  inst.position.set(x, y, z);
  World.root.add(inst);
  _propList.push(inst);
  return inst;
}
function tileWallRun(x0, z0, x1, z1, y) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
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
  m.castShadow = false; m.receiveShadow = true;
  (parent || World.root).add(m);
  return m;
}

/* ── Character model cache ── */
const CharCache = { model: null, skinTex: null, shadowTex: null, ready: false };

/* ── Box crate model cache ── */
const CrateCache = { model: null, ready: false };

function loadCrateAsset() {
  if (typeof THREE.FBXLoader !== 'function') return Promise.resolve();
  const loader = new THREE.FBXLoader();
  return new Promise(r => loader.load('assets/box.fbx?v=' + ASSET_V, obj => {
    obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    CrateCache.model = obj; CrateCache.ready = true;
    console.log('Crate FBX loaded');
    r();
  }, undefined, e => { console.warn('crate fbx fail', e); r(); }));
}

function spawnCrate(w, h, d, x, y, z) {
  if (!CrateCache.ready) return box(w, h, d, M.crate, x, y, z);
  const inst = CrateCache.model.clone();
  const bb = new THREE.Box3().setFromObject(inst);
  const sz = new THREE.Vector3(); bb.getSize(sz);
  inst.scale.set(w / Math.max(sz.x, 0.01), h / Math.max(sz.y, 0.01), d / Math.max(sz.z, 0.01));
  inst.position.set(x + w / 2, y, z + d / 2);
  World.root.add(inst);
  return inst;
}

function loadCharacterAssets() {
  const loader = new THREE.GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const base = 'assets/character/';
  return Promise.all([
    new Promise(r => loader.load(base + 'mixamo_combined.glb?v=' + ASSET_V, g => {
      CharCache.model = g;
      console.log('Character loaded, animations:', g.animations.map(a => a.name));
      r();
    }, undefined, (e) => { console.warn('char model fail', e); r(); })),
  ]).then(() => {
    if (CharCache.model) CharCache.ready = true;
  });
}

function buildFigure(isShadow) {
  const g = new THREE.Group();
  let mixer = null, actions = {}, curAction = null;

  if (CharCache.ready) {
    const src = CharCache.model.scene;
    const clone = (typeof THREE.SkeletonUtils !== 'undefined') ? THREE.SkeletonUtils.clone(src) : src.clone();
    clone.scale.setScalar(0.9);
    let shadowMat = null;
    if (isShadow) {
      shadowMat = makeShadowMaterial();
      clone.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = false; o.receiveShadow = false;
          o.frustumCulled = false;
          o.material = shadowMat;
        }
      });
    } else {
      clone.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = false; o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
    }
    g.add(clone);
    let light = null;
    if (isShadow) { light = new THREE.PointLight(PAL.purple, 0.6, 3.5); light.position.set(0, 0.7, 0); g.add(light); }
    mixer = new THREE.AnimationMixer(clone);
    const clipMap = { 'Idle': 'idle', 'Run': 'run', 'Jump': 'jump' };
    for (const clip of (CharCache.model.animations || [])) {
      for (const [keyword, key] of Object.entries(clipMap)) {
        if (clip.name.includes(keyword)) {
          actions[key] = mixer.clipAction(clip);
          actions[key].clampWhenFinished = key === 'jump';
        }
      }
    }
    if (actions.idle) { actions.idle.play(); curAction = 'idle'; }
    return { group: g, mat: shadowMat, light, isShadow, baseEmissive: 1, glitchT: 0, phase: Math.random() * 6,
      legL: null, legR: null, armL: null, armR: null, noGlitch: false,
      mixer, actions, curAction, isGLTF: true };
  }

  // Fallback: procedural box figure (if GLTF failed to load)
  const bodyMat = isShadow ? makeShadowMaterial() : M.player;
  const headMat = isShadow ? bodyMat : M.playerDark;
  box(0.5, 0.62, 0.34, bodyMat, -0.25, 0.42, -0.17, g);
  box(0.3, 0.28, 0.28, headMat, -0.15, 1.04, -0.14, g);
  const armL = box(0.14, 0.5, 0.16, bodyMat, -0.36, 0.44, -0.08, g);
  const armR = box(0.14, 0.5, 0.16, bodyMat, 0.22, 0.44, -0.08, g);
  const legL = box(0.18, 0.42, 0.18, headMat, -0.19, 0.0, -0.09, g);
  const legR = box(0.18, 0.42, 0.18, headMat, 0.01, 0.0, -0.09, g);
  let light = null;
  if (isShadow) { light = new THREE.PointLight(PAL.purple, 0.6, 3.5); light.position.set(0, 0.7, 0); g.add(light); }
  return { group: g, mat: isShadow ? bodyMat : null, light, isShadow, baseEmissive: 1, glitchT: 0, phase: Math.random() * 6,
    legL, legR, armL, armR, noGlitch: false, mixer: null, actions: {}, curAction: null, isGLTF: false };
}

function poseFigure(rig, st, dt) {
  const g = rig.group;
  const spd = Math.hypot(st.vx, st.vz);

  if (spd > 0.15) g.rotation.y = damp(g.rotation.y, Math.atan2(st.vx, st.vz), 16, dt);

  if (rig.isGLTF && rig.mixer) {
    const want = spd > 0.5 ? 'run' : 'idle';
    if (want !== rig.curAction && rig.actions[want]) {
      if (rig.actions[rig.curAction]) rig.actions[rig.curAction].fadeOut(0.2);
      rig.actions[want].reset().fadeIn(0.2).play();
      rig.curAction = want;
    }
    if (rig.curAction === 'run' && rig.actions.run) {
      rig.actions.run.timeScale = Math.max(0.5, spd / 4.5);
    }
    rig.mixer.update(dt);
    if (rig.isShadow && rig.mat) {
      const farFromPlayer = G.player && ((st.x - G.player.x) * (st.x - G.player.x) + (st.z - G.player.z) * (st.z - G.player.z)) > 225;
      if (!farFromPlayer) {
        const t = performance.now() * 0.001;
        rig.mat.uniforms.uTime.value = t;
        const glitchRate = st.forceGlitch ? 0.35 : (rig.noGlitch ? 0 : 0.02);
        rig.glitchT = Math.max(0, rig.glitchT - dt);
        if (rig.glitchT <= 0 && Math.random() < glitchRate) rig.glitchT = 0.1 + Math.random() * 0.08;
        rig.mat.uniforms.uGlitch.value = rig.glitchT > 0 ? 1 : 0;
        rig.mat.uniforms.uOpacity.value = rig.baseOpacity != null ? rig.baseOpacity : 0.45;
        if (rig.light) rig.light.intensity = 0.8 * rig.baseEmissive * (1 + Math.sin(t * 3 + rig.phase) * 0.3);
      } else {
        if (rig.light) rig.light.intensity = 0;
      }
    }
    return;
  }

  rig.phase += dt * clamp(spd * 3.2, 3, 13);
  const swing = spd > 0.15 ? Math.sin(rig.phase) * clamp(spd * 0.16, 0, 0.5) : 0;
  if (rig.legL) { rig.legL.rotation.x = swing; rig.legR.rotation.x = -swing; }
  if (rig.armL) { rig.armL.rotation.x = -swing * 0.8; rig.armR.rotation.x = swing * 0.8; }
  if (rig.isShadow && rig.mat) {
    const farFromPlayer = G.player && ((st.x - G.player.x) * (st.x - G.player.x) + (st.z - G.player.z) * (st.z - G.player.z)) > 225;
    if (!farFromPlayer) {
      const t = performance.now() * 0.001;
      rig.mat.uniforms.uTime.value = t;
      const glitchRate = st.forceGlitch ? 0.35 : (rig.noGlitch ? 0 : 0.02);
      rig.glitchT = Math.max(0, rig.glitchT - dt);
      if (rig.glitchT <= 0 && Math.random() < glitchRate) rig.glitchT = 0.1 + Math.random() * 0.08;
      rig.mat.uniforms.uGlitch.value = rig.glitchT > 0 ? 1 : 0;
      rig.mat.uniforms.uOpacity.value = rig.baseOpacity != null ? rig.baseOpacity : 0.45;
      if (rig.light) rig.light.intensity = 0.8 * rig.baseEmissive * (1 + Math.sin(t * 3 + rig.phase) * 0.3);
    } else {
      if (rig.light) rig.light.intensity = 0;
    }
  }
}

const GRID_SIZE = 4;
const solidGrid = {};
function gridKey(cx, cz) { return cx + ',' + cz; }
function insertSolidGrid(s) {
  const x0 = Math.floor(s.x / GRID_SIZE), x1 = Math.floor((s.x + s.w) / GRID_SIZE);
  const z0 = Math.floor(s.z / GRID_SIZE), z1 = Math.floor((s.z + s.d) / GRID_SIZE);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    const k = gridKey(gx, gz);
    (solidGrid[k] || (solidGrid[k] = [])).push(s);
  }
}
function solidsNear(x, z) {
  const k = gridKey(Math.floor(x / GRID_SIZE), Math.floor(z / GRID_SIZE));
  return solidGrid[k] || [];
}

const World = {
  root: new THREE.Group(), solids: [], ents: [], sig: {},
  lamps: [], exitZone: null, frags: [], occluders: [], built: false,
};
scene.add(World.root);

function occludingBox(w, h, d, baseMat, x, y, z) {
  const mat = baseMat.clone();
  mat.transparent = true; mat.opacity = 1;
  const m = box(w, h, d, mat, x, y, z);
  World.occluders.push(m);
  return m;
}
function disposeTree(obj) { obj.traverse(o => { if ((o.isMesh || o.isPoints) && !o.userData.isProp && o.geometry && o.geometry !== GEO.box && o.geometry !== GEO.cyl) o.geometry.dispose(); }); }
function pushSolid(s) { World.solids.push(s); insertSolidGrid(s); return s; }
function addStair(o) {
  pushSolid({ x: o[0], y: o[1], z: o[2], w: o[3], h: o[4], d: o[5] });
  if (o[6] === 'crate') spawnCrate(o[3], o[4], o[5], o[0], o[1], o[2]);
  else box(o[3], o[4], o[5], M[o[6] === 'step' ? 'step' : o[6]] || M.wall, o[0], o[1], o[2]);
}
function sealDoorway(x, doorZ, w, y, h, z0, z1) {
  const half = w / 2;
  const build = (dz0, dz1) => {
    if (dz1 - dz0 <= 0.05) return;
    pushSolid({ x: x - 0.35, y, z: dz0, w: 0.7, h, d: dz1 - dz0 });
  };
  build(z0, doorZ - half);
  build(doorZ + half, z1);
}
function wallSolid(x, y, z, w, h, d) {
  pushSolid({ x, y, z, w, h, d });
  occludingBox(w, h, d, M.wall, x, y, z);
}
function internalWall(x, z0, z1, gapZ0, gapZ1, ceil) {
  const WT = 0.4;
  if (gapZ0 > z0) wallSolid(x, 0, z0, WT, ceil, gapZ0 - z0);
  if (z1 > gapZ1) wallSolid(x, 0, gapZ1, WT, ceil, z1 - gapZ1);
}

class Plate {
  constructor(o) {
    this.o = o; this.id = o.id; this.on = false; this.depress = 0;
    const PITCH = [1, 1.26, 0.84, 1.5, 0.71];
    let hash = 0; for (let i = 0; i < this.id.length; i++) hash = (hash * 31 + this.id.charCodeAt(i)) >>> 0;
    this.pitchRatio = PITCH[hash % PITCH.length];
    const g = new THREE.Group(); World.root.add(g); this.g = g;
    const pw = o.w || 2.4, y = o.y || 0;
    const rad = pw / 2;
    g.position.set(o.x, y, o.z);
    const baseGeo = new THREE.CylinderBufferGeometry(rad + 0.2, rad + 0.2, 0.1, 24);
    const baseMesh = new THREE.Mesh(baseGeo, M.steelDark);
    baseMesh.position.y = 0.05; baseMesh.castShadow = false; baseMesh.receiveShadow = true;
    g.add(baseMesh);
    const padGeo = new THREE.CylinderBufferGeometry(rad, rad, 0.14, 24);
    this.pad = new THREE.Mesh(padGeo, M.steel);
    this.pad.position.y = 0.17; this.pad.castShadow = false; this.pad.receiveShadow = true;
    g.add(this.pad);
    const ringGeo = new THREE.TorusBufferGeometry(rad * 0.7, 0.03, 8, 32);
    ringGeo.rotateX(Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x2c4c3a }));
    this.ring.position.y = 0.25; g.add(this.ring);
    this.light = new THREE.PointLight(0x4fffb0, 0, 5, 2); this.light.position.set(0, 0.5, 0); g.add(this.light);
    this.y = y; this.footprint = { x: o.x - rad, z: o.z - rad, w: pw, d: pw };
  }
  trigger(actors) {
    const f = this.footprint; let on = false;
    for (const a of actors) {
      if (!a.alive) continue;
      if (Math.abs(a.y - this.y) > 0.6) continue;
      if (a.x > f.x - 0.2 && a.x < f.x + f.w + 0.2 && a.z > f.z - 0.2 && a.z < f.z + f.d + 0.2) { on = true; break; }
    }
    if (on && !this.on) {
      Audio.S.plate(true, this.pitchRatio);
      zoomToShowDoor(this.id);
    } else if (!on && this.on) {
      Audio.S.plate(false, this.pitchRatio);
    }
    this.on = on;
    World.sig[this.id] = on;
  }
  render(dt) {
    this.depress = damp(this.depress, this.on ? 1 : 0, 18, dt);
    this.pad.position.y = 0.17 - this.depress * 0.07;
    this.ring.material.color.setHex(this.on ? 0x4fffb0 : 0x2c4c3a);
    if (!this._lightCulled) this.light.intensity = damp(this.light.intensity, this.on ? 1.3 : 0, 10, dt);
  }
}

function zoomToShowDoor(plateId) {
  for (const e of World.ents) {
    if (!(e instanceof Door)) continue;
    if (!e.o.req || !e.o.req.includes(plateId)) continue;
    const dx = e.o.x - (G.player ? G.player.x : 0);
    const dz = e.o.z - (G.player ? G.player.z : 0);
    const dist = Math.hypot(dx, dz);
    if (dist > 3) {
      const extra = clamp(dist * 0.25, 2, 8);
      ISO.targetDist = ISO.targetDist + extra;
      setTimeout(() => { ISO.targetDist = 15; }, 1200);
    }
    break;
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
    if (fired) { Audio.S.button(); if (o.mode === 'latch') this.latched = true; World.sig[this.id] = true; this.flash = 0.25; zoomToShowDoor(this.id); }
    else World.sig[this.id] = o.mode === 'latch' ? this.latched : false;
  }
  render(dt) {
    const lit = this.latched || this.flash > 0; if (this.flash > 0) this.flash -= dt;
    this.lens.material.color.setHex(lit ? 0xffb15e : 0x4a3018);
    if (!this._lightCulled) this.light.intensity = damp(this.light.intensity, lit ? 1.4 : 0, 12, dt);
  }
}

class Door {
  constructor(o) {
    this.o = o; this.open = 0; this.target = 0; this.timer = 0; this.wasReq = false;
    const dw = o.w || 2.4, dh = 2.6, y = o.y || 0;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, y, o.z);

    const frameBase = PROPS['door-frame'];
    if (frameBase) {
      const frame = frameBase.clone();
      const fScale = dw / 4.211;
      const hScale = dh / 3.953;
      frame.scale.set(fScale, hScale, fScale);
      frame.rotation.y = Math.PI / 2;
      g.add(frame);
    } else {
      box(0.35, dh + 0.3, 0.15, M.steelDark, -0.18, 0, -dw / 2 - 0.15, g);
      box(0.35, dh + 0.3, 0.15, M.steelDark, -0.18, 0, dw / 2, g);
      box(0.35, 0.15, dw + 0.3, M.steelDark, -0.18, dh, -dw / 2 - 0.15, g);
    }

    const panelBase = PROPS['door-metal'];
    this.slabGroup = new THREE.Group(); g.add(this.slabGroup);
    if (panelBase) {
      const panel = panelBase.clone();
      const pScaleX = dw / 2.106; // model's real combined width (trim strip + body), not the 0.241 trim-only sub-piece
      const pScaleY = dh / 4.049;
      panel.scale.set(pScaleX, pScaleY, pScaleX);
      panel.rotation.y = Math.PI / 2;
      panel.position.set(0, 0, -dw / 2);
      this.slabGroup.add(panel);
    } else {
      this.slab = box(0.12, dh, dw, M.steel, -0.06, 0, -dw / 2, this.slabGroup);
    }

    this.lamp = box(0.14, 0.14, 0.3, new THREE.MeshBasicMaterial({ color: 0x802318 }), -0.07, dh + 0.16, -0.15, g);
    this.light = new THREE.PointLight(0xff4a32, 0.5, 5, 2); this.light.position.set(0, dh + 0.16, 0); g.add(this.light);
    this.dh = dh; this.dw = dw; this.y = y;
  }
  logic(dt) {
    const o = this.o; let req = o.req.every(id => !!World.sig[id]);
    if (o.timed) { if (req && !this.wasReq) this.timer = o.timed; this.wasReq = req; this.timer = Math.max(0, this.timer - dt); req = this.timer > 0; }
    if (req !== (this.target > 0.5)) Audio.S.door();
    this.target = req ? 1 : 0;
    const step = dt * 3.2;
    this.open = this.open < this.target ? Math.min(this.target, this.open + step) : Math.max(this.target, this.open - step);
  }
  solid() {
    const k = 1 - this.open; if (k <= 0.02) return null;
    return { x: this.o.x - 0.15, y: this.y, z: this.o.z - this.dw / 2, w: 0.3, h: this.dh, d: this.dw * k, __door: true };
  }
  render() {
    const slide = this.open * this.dw;
    this.slabGroup.position.z = slide;
    const c = this.open > 0.5 ? 0x53ff9a : 0x802318;
    this.lamp.material.color.setHex(c); this.light.color.setHex(c);
    if (!this._lightCulled) this.light.intensity = 0.4 + (this.o.timed && this.timer > 0 && this.timer < 3 ? (Math.sin(this.timer * 18) * 0.5 + 0.5) * 1.1 : 0.3);
  }
  isOpen() { return this.open > 0.85; }
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


class Laser {
  constructor(o) {
    this.o = o; this.active = true;
    const g = new THREE.Group(); World.root.add(g); this.g = g;
    const dx = o.x2 - o.x1, dz = o.z2 - o.z1;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const beamY = 0.7;
    g.position.set(o.x1, 0, o.z1); g.rotation.y = ang;

    const emitterMat = M.steelDark;
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    box(0.18, 0.5, 0.18, emitterMat, -0.09, beamY - 0.15, -0.15, g);
    box(0.06, 0.06, 0.06, lensMat, -0.03, beamY - 0.03, 0.03, g);
    box(0.18, 0.5, 0.18, emitterMat, -0.09, beamY - 0.15, len - 0.03, g);
    box(0.06, 0.06, 0.06, lensMat, -0.03, beamY - 0.03, len - 0.09, g);

    const beamGeo = new THREE.CylinderBufferGeometry(0.012, 0.012, len, 4, 1);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, len / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff1100 });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.y = beamY;
    g.add(this.beam);

    const glowGeo = new THREE.CylinderBufferGeometry(0.06, 0.06, len, 6, 1);
    glowGeo.rotateX(Math.PI / 2);
    glowGeo.translate(0, 0, len / 2);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.glow.position.y = beamY;
    g.add(this.glow);

    this.light = new THREE.PointLight(0xff3311, 0.6, 5, 2); this.light.position.set(0, beamY, len / 2); g.add(this.light);
    this.line = { x1: o.x1, z1: o.z1, x2: o.x2, z2: o.z2, y: beamY };
    this.ph = Math.random() * 6.28;
  }
  logic() { this.active = !World.sig[this.o.off]; }
  kills() {
    if (!this.active) return null;
    const l = this.line, x0 = Math.min(l.x1, l.x2) - 0.2, x1 = Math.max(l.x1, l.x2) + 0.2;
    const z0 = Math.min(l.z1, l.z2) - 0.2, z1 = Math.max(l.z1, l.z2) + 0.2;
    return { x: x0, y: l.y - 0.4, z: z0, w: x1 - x0, h: 0.8, d: z1 - z0 };
  }
  render(dt) {
    this.ph += dt;
    this.beam.visible = this.glow.visible = this.active;
    if (this.active) {
      const flicker = 0.9 + Math.sin(this.ph * 30) * 0.1;
      this.glow.material.opacity = 0.12 + Math.sin(this.ph * 15) * 0.06;
      this.beam.scale.set(flicker, flicker, 1);
    }
    if (!this._lightCulled) this.light.intensity = damp(this.light.intensity, this.active ? 0.6 : 0, 8, dt);
  }
}

class Keepsake {
  constructor(o) {
    this.o = o; this.id = o.item; this.ph = Math.random() * 6.28;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, o.y || 0, o.z);
    box(0.5, 0.08, 0.5, M.steelDark, -0.25, 0, -0.25, g);
    this.item = box(0.24, 0.22, 0.06, M.keepsake, -0.12, 0.4, -0.03, g);
    this.light = new THREE.PointLight(0xffc98a, 1.2, 5.5, 2); this.light.position.set(0, 0.8, 0); g.add(this.light);
  }
  get taken() { return G.discovered.has(this.id); }
  trigger() {
    if (this.taken) return;
    const p = G.player; if (!p || !p.alive) return;
    const o = this.o;
    if (Math.hypot(p.x - o.x, p.z - o.z) > 0.9 || Math.abs(p.y - (o.y || 0)) > 0.8) return;
    G.discovered.add(this.id);
    if (o.timer) { G.baseTime += o.timer; G.time = Math.min(G.time + o.timer, G.baseTime); showBonus(o.timer); }
    Audio.S.pickup();
    if (o.text) showKeepsake(o.text);
  }
  render(dt) {
    this.ph += dt; this.g.visible = !this.taken;
    if (this.taken) { this.light.intensity = 0; return; }
    this.item.rotation.y = this.ph * 0.7; this.item.position.y = 0.4 + Math.sin(this.ph * 1.7) * 0.05;
    if (!this._lightCulled) this.light.intensity = 1.0 + Math.sin(this.ph * 2.2) * 0.25;
  }
}

class AbilityPickup {
  constructor(o) {
    this.o = o; this.id = o.ability; this.ph = Math.random() * 6.28;
    const g = new THREE.Group(); World.root.add(g); this.g = g; g.position.set(o.x, o.y || 0, o.z);
    box(0.6, 0.12, 0.6, M.steelDark, -0.3, 0, -0.3, g);
    this.core = box(0.28, 0.28, 0.28, M.ability, -0.14, 0.5, -0.14, g);
    this.light = new THREE.PointLight(0x4fe0ff, 1.6, 6, 2); this.light.position.set(0, 0.9, 0); g.add(this.light);
  }
  get taken() { return G.discovered.has('ability:' + this.id); }
  trigger() {
    if (this.taken) return;
    const p = G.player; if (!p || !p.alive) return;
    const o = this.o;
    if (Math.hypot(p.x - o.x, p.z - o.z) > 0.9 || Math.abs(p.y - (o.y || 0)) > 0.8) return;
    G.discovered.add('ability:' + this.id);
    G.abilities[this.id] = true;
    Audio.S.abilityPickup();
    showKeepsake(o.text || ('Ability unlocked: ' + this.id.toUpperCase()));
  }
  render(dt) {
    this.ph += dt; this.g.visible = !this.taken;
    if (this.taken) { this.light.intensity = 0; return; }
    this.core.rotation.y = this.ph; this.core.rotation.x = Math.sin(this.ph * 1.3) * 0.3;
    this.core.position.y = 0.5 + Math.sin(this.ph * 2) * 0.08;
    if (!this._lightCulled) this.light.intensity = 1.2 + Math.sin(this.ph * 3) * 0.35;
  }
}

function addLighting() {
  const sun = new THREE.DirectionalLight(0x4466aa, 0.25); sun.position.set(-16, 30, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 62; sc.top = 22; sc.bottom = -10; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.03;
  World.root.add(sun); World.root.add(sun.target); World.sun = sun;
  World.hemi = new THREE.HemisphereLight(0x1a2248, 0x080810, 0.45); World.root.add(World.hemi);

  const key = new THREE.PointLight(0xffb060, 2.8, 18, 1.5);
  key.position.set(0, 3.5, 0); World.root.add(key); World.keyLight = key;
  const fill = new THREE.PointLight(0x3344aa, 1.2, 16, 1.5);
  fill.position.set(-4, 2.5, 3); World.root.add(fill); World.fillLight = fill;
}

function buildLamps(lamps) {
  World.lamps.length = 0;
  for (const lp of lamps) {
    const [x, y, z, alive] = lp;
    const g = new THREE.Group(); World.root.add(g); g.position.set(x, y, z);
    box(1.6, 0.12, 0.5, M.steelDark, -0.8, 0, -0.25, g);
    const tube = box(1.3, 0.08, 0.3, alive ? new THREE.MeshBasicMaterial({ color: 0xffb870 }) : M.steelDark, -0.65, -0.1, -0.15, g);
    const lt = new THREE.PointLight(0xffaa44, alive ? 3.5 : 0, 12, 1.8); lt.position.set(0, -0.3, 0); g.add(lt);
    World.lamps.push({ alive, baseAlive: alive, tube, light: lt, flickId: World.lamps.length * 7.3, g });
  }
}

function buildExit(x, z) {
  const g = new THREE.Group(); World.root.add(g); g.position.set(x, 0, z);
  box(0.35, 1.7, 2.6, M.steelDark, -1.6, 0, -1.3, g);
  box(0.35, 1.7, 2.6, M.steelDark, 1.25, 0, -1.3, g);
  box(0.16, 3.8, 2.2, new THREE.MeshBasicMaterial({ color: 0x6affc0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), -1.3, 0, -1.1, g);
  const lt = new THREE.PointLight(0x5fffb4, 1.4, 9, 2); lt.position.set(0, 2, 0); g.add(lt);
  World.exitZone = { x: x - 1.1, z: z - 1.2, w: 2.2, d: 2.4 };
}

function addEntity(o) {
  let e = null;
  if (o.t === 'plate') e = new Plate(o);
  else if (o.t === 'button') e = new Button(o);
  else if (o.t === 'door') {
    e = new Door(o);
    if (!o.onWall) sealDoorway(o.x, o.z, o.w || 2.4, o.y || 0, FACILITY.ceil, FACILITY.z0, FACILITY.z1);
  }
  else if (o.t === 'crusher') e = new Crusher(o);
  else if (o.t === 'laser') e = new Laser(o);
  else if (o.t === 'keepsake') e = new Keepsake(o);
  else if (o.t === 'ability') e = new AbilityPickup(o);
  if (e) { e.kind = o.t; World.ents.push(e); }
}

function decorateFacility() {
  const PI = Math.PI, H = PI / 2;

  // Helper: place a wall panel with Y-scale compressed to fit 4-unit ceiling
  function wallPanel(name, x, y, z, rotY) {
    const p = spawnProp(name, x, y, z, 1, rotY);
    if (p) p.scale.set(1, 0.74, 1); // 5.43 * 0.74 ≈ 4.0 to match ceiling
  }
  const wallTypes = ['sm-wall1', 'sm-wall2', 'sm-window', 'sm-door-wall'];
  function pickWall(i) { return wallTypes[((i * 7 + 3) % 4)]; }

  // ─── South-wall panels (z ≈ -5.8, facing north) — full length ───
  for (let x = -2; x < 58; x += 4) {
    wallPanel(pickWall(x), x, 0, -5.8, 0);
  }
  // ─── North-wall panels (z ≈ 17.8, facing south) — full length ───
  for (let x = 0; x < 58; x += 4) {
    wallPanel(pickWall(x + 1), x, 0, 17.8, PI);
  }
  // ─── West-wall panels (x ≈ -1.8, facing east) ───
  for (let z = -6; z < 18; z += 4) {
    wallPanel(pickWall(z + 10), -1.8, 0, z, H);
  }
  // ─── East-wall panels (x ≈ 57.8, facing west) ───
  for (let z = -6; z < 18; z += 4) {
    wallPanel(pickWall(z + 20), 57.8, 0, z, -H);
  }

  // ─── Overhead piping & vents along south ceiling — full length ───
  for (let x = 0; x < 58; x += 3) {
    const r = (x * 13 + 7) % 7;
    if (r < 2) spawnProp('sm-pipes', x, 2.6, -5.5, 1.2, 0);
    else if (r < 3) spawnProp('sm-pipes-sm', x, 2.8, -5.5, 1.5, 0);
    else if (r < 4) spawnProp('sm-vent', x, 2.2, -5.5, 2, 0);
    else if (r < 5) spawnProp('sm-vent2', x, 2.4, -5.5, 2, 0);
    else if (r < 6) spawnProp('sm-plate', x, 1.8, -5.5, 2.2, 0);
    else spawnProp('sm-output', x, 1.6, -5.5, 2.8, 0);
  }
  // ─── Overhead along north ceiling — full length ───
  for (let x = 1; x < 58; x += 4) {
    const r = (x * 17 + 2) % 5;
    if (r < 2) spawnProp('sm-pipes-sm', x, 2.9, 17.5, 1.4, PI);
    else if (r < 3) spawnProp('sm-vent2', x, 2.3, 17.5, 2, PI);
    else if (r < 4) spawnProp('sm-pipes', x, 2.7, 17.5, 1.3, PI);
    else spawnProp('sm-plate-sm', x, 2.0, 17.5, 2.5, PI);
  }

  // ─── Internal wall decorations (on divider walls) ───
  // Wall at x=11 (between Sector I & II)
  spawnProp('sm-door-wall', 11, 0, -4.5, 0.9, H);
  spawnProp('sm-hexagon', 11, 1.6, -1, 2.5, H);
  spawnProp('sm-plate', 11, 1.4, 8, 2, H);
  spawnProp('sm-output', 11, 1.8, 14, 2.5, H);
  // Wall at x=30.5 (between Sector II & III, door d2 gap z=4–8)
  spawnProp('sm-door-wall', 30.5, 0, -3, 0.9, -H);
  spawnProp('sm-hexagon', 30.5, 1.5, 1, 2.5, -H);
  spawnProp('sm-plate', 30.5, 1.3, 12, 2, -H);
  spawnProp('sm-output', 30.5, 1.7, 15, 2.5, -H);
  // Wall at x=44.5 (between Sector III & IV, door d3 gap z=6–10)
  spawnProp('sm-door-wall', 44.5, 0, -4, 0.9, H);
  spawnProp('sm-hexagon', 44.5, 1.5, -2, 2.5, H);
  spawnProp('sm-plate', 44.5, 1.3, 2, 2, H);
  spawnProp('sm-plate-sm', 44.5, 1.4, 12, 2, -H);
  spawnProp('sm-hexagon', 44.5, 1.6, 14, 2.5, -H);
  spawnProp('sm-door-wall', 44.5, 0, 16, 0.9, -H);
  // Wall at x=50 (inner Sector IV, door g1 gap z=4.5–7.5)
  spawnProp('sm-door-wall', 50, 0, -3, 0.9, -H);
  spawnProp('sm-hexagon', 50, 1.5, -1, 2.5, -H);
  spawnProp('sm-plate', 50, 1.3, 2, 2, H);
  spawnProp('sm-output', 50, 1.7, 10, 2.5, -H);
  spawnProp('sm-plate-sm', 50, 1.6, 13, 2, H);
  spawnProp('sm-hexagon', 50, 1.5, 15, 2.5, H);
  spawnProp('sm-door-wall', 50, 0, 16, 0.9, -H);
  // Wall at x=52 (g2 gate divider, door g2 gap z=10.8–13.2)
  spawnProp('sm-hexagon', 52, 1.5, -2, 2.5, H);
  spawnProp('sm-plate', 52, 1.3, 4, 2, H);
  spawnProp('sm-output', 52, 1.7, 8, 2.5, -H);
  spawnProp('sm-door-wall', 52, 0, -4, 0.9, H);
  spawnProp('sm-plate-sm', 52, 1.5, 15, 2, -H);

  // ════════════ SECTOR I — INTAKE (x: -2 → 11) ════════════
  // Floor props — crate stack near entrance
  spawnProp('sm-crate', 0, 0, -3, 1.2, 0.3);
  spawnProp('sm-crate', 0.9, 0, -4, 1, -0.2);
  spawnProp('sm-crate-long', 1, 0.8, -3.3, 1, 0.5);
  spawnProp('sm-crate', 1.5, 0, -2, 1, 1.1);
  spawnProp('sm-container', 0.5, 0, -1.5, 0.9, 0.4);
  // Storage shelves
  spawnProp('sm-shelf-tall', 10, 0, -4, 0.8, PI);
  spawnProp('sm-shelf', 10, 0, 16, 0.7, 0);
  spawnProp('sm-shelf-tall', 0, 0, 16, 0.7, -H);
  // Lab equipment
  spawnProp('lab-extinguisher', 4, 0, -4.5, 1, 0.4);
  spawnProp('lab-cabinet', -0.5, 0, 8, 1, H);
  // Computers & tech
  spawnProp('sm-computer-sm', 9.5, 0, 6, 0.7, PI * 0.7);
  spawnProp('sm-computer', 5, 0, 15, 0.7, PI);
  spawnProp('sm-base', 9, 0, 14, 0.8, 0.3);
  // Structural
  spawnProp('sm-column', 6, 0, 8, 0.6, 0);
  spawnProp('sm-column-slim', 2, 0, 12, 0.6, 0);
  spawnProp('sm-column-slim', 10, 0, 0, 0.6, 0);
  // Scatter
  spawnProp('sm-container', 8, 0, -3.5, 1, 0.8);
  spawnProp('sm-crate-long', 7, 0, 16, 0.9, 0.6);
  spawnProp('sm-vessel', 3, 0, 6, 1.2, 0.5);
  spawnProp('sm-base', 10, 0, 10, 0.7, 1.2);
  spawnProp('sm-laser', 10, 0, -3, 0.6, 0.9);

  // ════════════ SECTOR II — SORTING LAB (x: 11 → 30.5) ════════════
  // Lab benches / tables
  spawnProp('lab-cabinet', 18, 0, 12.6, 1, PI);
  spawnProp('lab-magnifier', 17.3, 0.75, 12.3, 1, 0.2);
  spawnProp('lab-cabinet', 28, 0, -4, 1, 0);
  // Computers
  spawnProp('sm-computer', 20, 0, 15.5, 0.8, PI);
  spawnProp('sm-computer', 16, 0, -4, 0.7, 0);
  spawnProp('sm-computer-sm', 24, 0, 15.5, 0.7, PI);
  spawnProp('sm-computer-sm', 29, 0, 3, 0.7, -H);
  // Capsule & science
  spawnProp('sm-capsule', 27, 0, 15, 0.9, 0.5);
  spawnProp('sm-capsule', 17, 0, 0, 0.8, -0.3);
  spawnProp('sm-vessel', 22, 0.84, 10.8, 1.5, 0);
  spawnProp('sm-pod', 29, 0, 13, 0.5, 0.8);
  // Shelves & storage
  spawnProp('sm-shelf', 18, 0, -4, 0.7, 0);
  spawnProp('sm-shelf-tall', 16, 0, 16, 0.7, PI);
  spawnProp('sm-crate', 25, 0, -3, 1, 0.7);
  spawnProp('sm-crate', 19, 0, -3, 0.9, -0.4);
  spawnProp('sm-crate-long', 21, 0, -4, 1, 0.2);
  spawnProp('sm-container', 28, 0, 16, 0.9, PI * 0.6);
  // Structural
  spawnProp('sm-column-slim', 20, 0, 8, 0.6, 0);
  spawnProp('sm-column-slim', 26, 0, 0, 0.6, 0);
  spawnProp('sm-column', 22, 0, 4, 0.6, 0);
  spawnProp('sm-column2', 28, 0, 8, 0.6, 0);
  // Scatter
  spawnProp('sm-base', 25, 0, 6, 0.8, 1.5);
  spawnProp('sm-laser', 23, 0, -4, 0.5, 0.3);
  spawnProp('sm-statue', 17, 0, 6, 0.5, PI * 0.7);

  // ════════════ SECTOR III — PRESS ROOM (x: 31.5 → 44) ════════════
  // Walls: west x=30.5–30.9, east x=44.5–44.9
  // Door d3 at (44.5, z=8) gap z=6–10
  // ── South-wall props (against z ≈ -5) ──
  spawnProp('sm-crate-long', 33, 0, -3, 1.1, 0.1);
  spawnProp('sm-crate', 34, 0, -4.5, 1, 0.6);
  spawnProp('sm-crate', 32.5, 0, -4, 0.9, -0.5);
  spawnProp('sm-crate-long', 40, 0, -3, 1, 0.8);
  spawnProp('sm-shelf-tall', 32, 0, -4, 0.7, 0);
  spawnProp('sm-shelf', 43, 0, -4, 0.7, 0);
  spawnProp('sm-shelf', 37, 0, -4.5, 0.7, 0);
  spawnProp('lab-extinguisher', 43, 0, -4.5, 1, -0.3);
  // ── North-wall props (against z ≈ 17) ──
  spawnProp('sm-container', 33, 0, 16, 0.9, PI * 0.4);
  spawnProp('sm-container', 40, 0, 15, 1, PI * 0.8);
  spawnProp('sm-shelf-tall', 36, 0, 16, 0.7, PI);
  spawnProp('sm-vessel', 35, 0, 15, 1.3, PI);
  spawnProp('sm-capsule', 43, 0, 15, 0.7, -0.4);
  spawnProp('sm-crate-long', 32, 0, 16, 0.9, PI * 0.3);
  spawnProp('sm-computer', 42, 0, 16, 0.7, PI);
  // ── West-wall side (against x ≈ 31.5, clear of wall 30.5–30.9) ──
  spawnProp('sm-capsule', 32, 0, 14, 0.8, 0.6);
  spawnProp('sm-computer-sm', 32, 0, 0, 0.7, H);
  spawnProp('sm-crate', 32, 0, -2, 0.9, 0.4);
  // ── East-wall side (against x ≈ 43, clear of wall 44.5–44.9) ──
  spawnProp('sm-shelf-tall', 43, 0, 0, 0.7, -H);
  spawnProp('sm-computer-sm', 43, 0, 12, 0.7, -H);
  spawnProp('sm-pod', 42, 0, -3, 0.6, 0);
  // ── Central area ──
  spawnProp('lab-glasses', 34.4, 0, 3.2, 1, 0);
  spawnProp('lab-gloves', 33.6, 0, 3.6, 1, 0.5);
  spawnProp('sm-computer', 36, 0, 14, 0.7, PI * 0.3);
  spawnProp('sm-computer-sm', 41, 0, 3, 0.7, H);
  spawnProp('sm-base', 36, 0, 1, 0.7, 0.8);
  spawnProp('sm-base', 39, 0, 10, 0.7, 1.4);
  spawnProp('sm-laser', 39, 0, 13, 0.5, PI * 0.6);
  spawnProp('sm-laser', 33, 0, 10, 0.5, 0.3);
  // Structural
  spawnProp('sm-column2', 34, 0, 12, 0.6, 0);
  spawnProp('sm-column2', 42, 0, 12, 0.6, 0);
  spawnProp('sm-column', 37, 0, 0, 0.6, 0);
  spawnProp('sm-column-slim', 33, 0, 4, 0.6, 0);
  spawnProp('sm-column-slim', 40, 0, 0, 0.6, 0);
  spawnProp('sm-column', 35, 0, 8, 0.6, 0);
  spawnProp('sm-statue', 38, 0, 0, 0.6, PI * 0.3);

  // ════════════ SECTOR IV — OBSERVATION (x: 45.5 → 57) ════════════
  // Walls: west x=44.5–44.9, inner x=50–50.4, inner x=52–52.4, east x=58
  // Doors: g1(50, z6) gap z=4.5–7.5, g2(52, z12) gap z=10.8–13.2, g3(58, z14) gap z=12.8–15.2
  // ── South-wall props (against z ≈ -5) ──
  spawnProp('sm-crate', 46, 0, -3, 1, 0.5);
  spawnProp('sm-crate', 47, 0, -4, 0.9, -0.7);
  spawnProp('sm-crate-long', 54, 0, -3, 1, 0.2);
  spawnProp('sm-shelf-tall', 48, 0, -4, 0.7, 0);
  spawnProp('sm-shelf', 55, 0, -4, 0.7, 0);
  spawnProp('sm-vessel', 49, 0, -3, 1.2, 0.3);
  spawnProp('sm-computer-sm', 46, 0, -4.5, 0.7, 0);
  // ── North-wall props (against z ≈ 17) ──
  spawnProp('sm-container', 46, 0, 16, 0.9, PI * 0.7);
  spawnProp('sm-container', 56, 0, 16, 0.8, PI * 0.3);
  spawnProp('sm-shelf-tall', 55, 0, 16, 0.7, PI);
  spawnProp('sm-shelf-tall', 53.5, 0, 16, 0.7, PI);
  spawnProp('sm-computer-sm', 47, 0, 15.5, 0.7, PI);
  spawnProp('sm-computer', 56, 0, 15, 0.7, PI);
  spawnProp('sm-crate-long', 49, 0, 16, 0.9, PI * 0.5);
  spawnProp('sm-capsule', 54, 0, 16, 0.7, PI * 0.8);
  // ── West-wall side (against x ≈ 46, clear of wall 44.5–44.9) ──
  spawnProp('sm-capsule', 46, 0, 4, 0.7, H);
  spawnProp('sm-computer-sm', 46, 0, 12, 0.7, H);
  spawnProp('sm-crate', 46, 0, 0, 0.9, 0.3);
  // ── East-wall side (against x ≈ 57, clear of building wall at 58) ──
  spawnProp('sm-shelf', 57, 0, 6, 0.7, -H);
  spawnProp('sm-shelf-tall', 57, 0, 2, 0.7, -H);
  spawnProp('sm-computer', 57, 0, 10, 0.7, -H);
  spawnProp('sm-crate-long', 57, 0, -3, 0.9, -0.2);
  // ── Sub-area A (x: 45.5–49.5, between wall 44.5 and wall 50) ──
  spawnProp('lab-counter', 48.5, 0, 3.5, 1, H);
  spawnProp('scifi-computer', 48.85, 0.7, 3.2, 1, 0.3);
  spawnProp('sm-pod', 47, 0, 0, 0.5, 0.4);
  spawnProp('sm-base', 47, 0, 8, 0.7, 0.6);
  spawnProp('sm-capsule', 48, 0, 14, 0.8, 0.3);
  spawnProp('sm-column', 48, 0, 10, 0.6, 0);
  spawnProp('sm-column-slim', 46, 0, 8, 0.6, 0);
  // ── Sub-area B (x: 50.5–51.5, narrow corridor between walls 50 and 52) ──
  spawnProp('sm-laser', 51, 0, 3, 0.4, 0.8);
  spawnProp('sm-base', 51, 0, -2, 0.5, 1.0);
  // ── Sub-area C (x: 53–57, between wall 52 and east wall 58) ──
  spawnProp('scifi-access', 53.5, 0, 2, 1, -0.6);
  spawnProp('scifi-chest', 53, 0, 0, 1, 0.2);
  spawnProp('sm-computer', 54, 0, 4, 0.7, PI * 0.4);
  spawnProp('sm-capsule', 56, 0, 8, 0.7, -0.6);
  spawnProp('sm-pod', 54, 0, 12, 0.5, 1.2);
  spawnProp('sm-statue', 55, 0, 0, 0.5, PI * 0.5);
  spawnProp('sm-base', 54, 0, 8, 0.7, 1.0);
  spawnProp('sm-laser', 56, 0, 3, 0.5, -H);
  spawnProp('sm-column', 54, 0, 10, 0.6, 0);
  spawnProp('sm-column-slim', 56, 0, 4, 0.6, 0);
  spawnProp('sm-column', 56, 0, 16, 0.6, 0);
}

function buildFacility() {
  if (World.built) return;
  World.built = true;
  const b = FACILITY, c = b.ceil, WT = 0.4;
  box(b.x1 - b.x0, 0.12, b.z1 - b.z0, M.floor, b.x0, -0.12, b.z0);
  wallSolid(b.x0 - WT, 0, b.z0 - WT, b.x1 - b.x0 + WT * 2, c, WT);
  wallSolid(b.x0 - WT, 0, b.z1, b.x1 - b.x0 + WT * 2, c, WT);
  wallSolid(b.x0 - WT, 0, b.z0 - WT, WT, c, b.z1 - b.z0 + WT * 2);
  // East wall split for final door g3 at z≈14 (gap 12.8→15.2)
  wallSolid(b.x1, 0, b.z0 - WT, WT, c, 12.8 - (b.z0 - WT));
  wallSolid(b.x1, 0, 15.2, WT, c, (b.z1 + WT) - 15.2);

  internalWall(11, b.z0, b.z1, 2, 5, c);
  internalWall(30.5, b.z0, b.z1, 4, 8, c);
  internalWall(44.5, b.z0, b.z1, 6, 10, c);
  internalWall(50, b.z0, b.z1, 4.5, 7.5, c);
  internalWall(52, b.z0, b.z1, 10.8, 13.2, c);


  for (const s of [
    [6, 0, -4, 1.5, 1.3, 1.5, 'crate'], [9, 0, 5, 1.4, 1.0, 1.4, 'rust'],
    [22, 0, 9, 3, 0.42, 3, 'step'], [22.6, 0.42, 9.6, 1.8, 0.42, 1.8, 'step'],
    [34.5, 0, 7, 0.6, 0.42, 4, 'step'], [39.4, 0, 7, 0.6, 0.42, 4, 'step'],
  ]) addStair(s);

  const objects = [
    { t: 'plate', id: 'p1', x: 8, z: 3.5, w: 2.4 },
    { t: 'door', id: 'd1', x: 11, z: 3.5, w: 2.8, req: ['p1'], onWall: true },
    { t: 'keepsake', x: 4, z: -3, item: 'watch', timer: 3, text: 'Your watch.<br><span style="opacity:.55">It stopped at 09:41 and never started again.</span>' },
    { t: 'keepsake', x: 16, z: 3.5, item: 'badge', timer: 5, text: 'A badge, still warm.<br><span style="opacity:.55">The photograph on it is yours.</span>' },

    { t: 'plate', id: 'pA', x: 20, z: 2, w: 2.4 },
    { t: 'plate', id: 'pB', x: 23, y: 0.84, z: 10, w: 1.8 },
    { t: 'door', id: 'd2', x: 30.5, z: 6, w: 2.8, req: ['pA', 'pB'], onWall: true },
    { t: 'plate', id: 'pC', x: 24, z: 15, w: 2.0 },
    { t: 'laser', x1: 26.5, z1: 2, x2: 26.5, z2: 14, off: 'pC' },
    { t: 'keepsake', x: 18, z: 13, item: 'photo', timer: 3, text: 'A photograph, face down.<br><span style="opacity:.55">You do not turn it over. You already know.</span>' },
    { t: 'keepsake', x: 26, z: 0, item: 'key', timer: 3, text: 'A house key, worn smooth.<br><span style="opacity:.55">There is still a house.</span>' },
    { t: 'ability', x: 28, z: 14, ability: 'dash', text: 'DASH — <span style="opacity:.55">Space for a short burst forward</span>' },
    { t: 'keepsake', x: 29, z: 6, item: 'fuse', timer: 5, text: 'A blown fuse, labelled SPARE.<br><span style="opacity:.55">Someone planned for this.</span>' },

    { t: 'crusher', x: 36, z: 8, w: 3.4, d: 3.4, pitY: -0.42, top: 2.6, period: 5.0, phase: 0.28 },
    { t: 'plate', id: 'pPress', x: 36, y: -0.42, z: 8, w: 2.6 },
    { t: 'plate', id: 'pHold', x: 42, z: 8, w: 2.2 },
    { t: 'door', id: 'd3', x: 44.5, z: 8, w: 2.8, req: ['pPress', 'pHold'], onWall: true },
    { t: 'keepsake', x: 34, z: 13, item: 'letter', timer: 3, text: 'A letter you never posted.<br><span style="opacity:.55">The handwriting is steadier than you remember.</span>' },
    { t: 'keepsake', x: 42, z: 12, item: 'circuit', timer: 5, text: 'A circuit board, scorched at one corner.<br><span style="opacity:.55">It still conducts.</span>' },

    { t: 'plate', id: 'pGate', x: 48, z: 6, w: 2.4 },
    { t: 'door', id: 'g1', x: 50, z: 6, w: 2.8, req: ['pGate'], onWall: true },
    { t: 'button', id: 'bDoor', x: 48, z: 14, mode: 'pulse' },
    { t: 'door', id: 'g2', x: 52, z: 12, w: 2.4, req: ['bDoor'], timed: 9, onWall: true },
    { t: 'plate', id: 'pFinal', x: 56, z: 14, w: 2.4 },
    { t: 'door', id: 'g3', x: 58, z: 14, w: 2.4, req: ['pFinal'], onWall: true },
    { t: 'keepsake', x: 56, z: 12, item: 'drawing', timer: 3, text: 'A drawing, in crayon.<br><span style="opacity:.55">Two figures. One of them is much taller.</span>' },
  ];
  for (const o of objects) addEntity(o);

  buildLamps([
    [4, 3, 0, 1], [10, 3, 3, 1],
    [18, 3, 2, 1], [24, 3, 10, 0], [28, 3, 6, 1],
    [34, 3, 4, 1], [38, 3, 8, 0], [42, 3, 8, 1],
    [47, 3, 0, 1], [50, 3, 6, 1], [54, 3, 14, 1],
  ]);

  World.frags = [
    { x: 3, z: 3, text: 'SECTOR C &middot; MAINTENANCE INTAKE<br><span style="opacity:.55">authorised personnel only</span>' },
    { x: 6, z: 1, text: 'You know which corridors are load-bearing.<br><span style="opacity:.55">You have never been inside this building.</span>' },
    { x: 9, z: -2, text: 'Fourteen years without maintenance. The lights are still on.' },
    { x: 19, z: 2, text: 'Every door in this building asks for someone who is not here.' },
    { x: 21, z: 10, text: 'A badge in the tray. Your photograph.<br><span style="opacity:.55">The name is yours. The date is not.</span>' },
    { x: 27, z: 4, text: 'Two was never going to be enough.' },
    { x: 35, z: 4, text: 'HYDRAULIC PRESS 3 &mdash; <span style="opacity:.55">interlock disabled for containment test 04/11</span>' },
    { x: 37, z: 11, text: 'Whatever the press keeps, the field keeps.' },
    { x: 41, z: 11, text: 'Whatever holds this one must never let go.' },
    { x: 47, z: 0, text: 'MAIN BUS &mdash; <span style="opacity:.55">containment corridor</span>' },
    { x: 51, z: 8, text: 'The field has held for fourteen years.<br><span style="opacity:.55">It has only ever needed the one subject.</span>' },
    { x: 54, z: 13, text: 'The door at the end has never been locked.' },
  ].map(f => ({ ...f, seen: false }));

  buildExit(56, 14);
  addLighting();
}

const PH = { R: 0.34, ACCEL: 50, FRICTION: 28, MAX: 6.0, DASH_SPEED: 12, DASH_DUR: 0.28, DASH_CD: 1.0 };

function groundAt(x, z, curY) {
  let g = 0;
  const near = solidsNear(x, z);
  for (let i = 0, n = near.length; i < n; i++) {
    const s = near[i];
    if (s.__door) continue;
    if (x <= s.x - PH.R || x >= s.x + s.w + PH.R || z <= s.z - PH.R || z >= s.z + s.d + PH.R) continue;
    const top = s.y + s.h;
    if (top <= curY + STEP_MAX + 0.02) g = Math.max(g, top);
  }
  return g;
}
function blockedAt(nx, nz, y, doors) {
  const near = solidsNear(nx, nz);
  for (let i = 0, n = near.length; i < n; i++) {
    const s = near[i];
    if (s.__door) continue;
    if (nx <= s.x - PH.R || nx >= s.x + s.w + PH.R || nz <= s.z - PH.R || nz >= s.z + s.d + PH.R) continue;
    if (s.y + s.h > y + STEP_MAX + 0.02) return true;
  }
  for (let i = 0, n = doors.length; i < n; i++) {
    const d = doors[i];
    if (nx <= d.x - PH.R || nx >= d.x + d.w + PH.R || nz <= d.z - PH.R || nz >= d.z + d.d + PH.R) continue;
    if (y < d.y + d.h - 0.02) return true;
  }
  return false;
}

class Actor {
  constructor(isShadow, tint) {
    this.isShadow = isShadow;
    this.rig = buildFigure(isShadow);
    if (isShadow) {
      this.rig.baseEmissive = tint.emissive || 1;
      this.rig.baseOpacity = tint.opacity || 0.45;
    }
    World.root.add(this.rig.group);
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.alive = true; this.usePress = false; this.useHeld = false;
    this.stepAcc = 0; this.dashT = 0; this.dashCd = 0; this.playIdx = 0;
  }
  box() { return { x: this.x - PH.R, y: this.y, z: this.z - PH.R, w: PH.R * 2, h: 1.6, d: PH.R * 2 }; }
  place(x, z) {
    this.x = x; this.z = z; this.y = groundAt(x, z, 0);
    this.vx = this.vz = 0; this.alive = true; this.rig.group.visible = true;
    this.dashT = 0; this.dashCd = 0; this.playIdx = 0;
  }
  destroy() { World.root.remove(this.rig.group); disposeTree(this.rig.group); }

  simulate(dt, input, doors) {
    this.usePress = input.usePress; this.useHeld = input.use;

    if (!this.isShadow && input.dash && G.abilities.dash && this.dashCd <= 0 && this.dashT <= 0) {
      const ang = this.rig.group.rotation.y;
      this.vx = Math.sin(ang) * PH.DASH_SPEED;
      this.vz = Math.cos(ang) * PH.DASH_SPEED;
      this.dashT = PH.DASH_DUR;
      this.dashCd = PH.DASH_CD;
      Audio.S.dash();
    }
    if (this.dashCd > 0) this.dashCd -= dt;

    if (this.dashT > 0) {
      this.dashT -= dt;
    } else {
      let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }
      const ca = Math.cos(ISO.az), sa = Math.sin(ISO.az);
      const rdx = dx * ca + dz * sa;
      const rdz = -dx * sa + dz * ca;
      dx = rdx; dz = rdz;
      if (dx !== 0) { this.vx += dx * PH.ACCEL * dt; this.vx = clamp(this.vx, -PH.MAX, PH.MAX); }
      else { const f = PH.FRICTION * dt; this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f; }
      if (dz !== 0) { this.vz += dz * PH.ACCEL * dt; this.vz = clamp(this.vz, -PH.MAX, PH.MAX); }
      else { const f = PH.FRICTION * dt; this.vz = Math.abs(this.vz) <= f ? 0 : this.vz - Math.sign(this.vz) * f; }
      const spd2 = this.vx * this.vx + this.vz * this.vz;
      if (spd2 > PH.MAX * PH.MAX) { const s = PH.MAX / Math.sqrt(spd2); this.vx *= s; this.vz *= s; }
    }

    if (G.dev) {
      this.x += this.vx * dt; this.z += this.vz * dt;
    } else {
      const nx = this.x + this.vx * dt;
      if (!blockedAt(nx, this.z, this.y, doors)) this.x = nx; else this.vx = 0;
      const nz = this.z + this.vz * dt;
      if (!blockedAt(this.x, nz, this.y, doors)) this.z = nz; else this.vz = 0;
    }
    this.y = groundAt(this.x, this.z, this.y);

    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 0.6) { this.stepAcc += spd * dt; if (this.stepAcc > 0.85) { this.stepAcc = 0; if (G.speed < 4) Audio.S.step(false); } }
    else this.stepAcc = 1.2;
  }

  playback(frame, tick) {
    this.x = frame.x; this.y = frame.y; this.z = frame.z; this.vx = frame.vx; this.vz = frame.vz;
    this.usePress = frame.u;
    this.playIdx = tick;
    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 0.6) { this.stepAcc += spd * TICK; if (this.stepAcc > 0.85) { this.stepAcc = 0; if (G.speed < 4) Audio.S.step(true); } }
  }

  record() { return { x: this.x, y: this.y, z: this.z, vx: this.vx, vz: this.vz, u: this.usePress }; }

  render(dt) {
    this.rig.group.position.set(this.x, this.y, this.z);
    const forceGlitch = !this.isShadow ? false : (G.time <= 3 && G.time > 0);
    poseFigure(this.rig, { x: this.x, z: this.z, vx: this.vx, vz: this.vz, forceGlitch }, dt);
  }
}

function shadowTint(age) {
  return {
    emissive: Math.max(0.48, 1.05 - age * 0.12),
    opacity: Math.max(0.46, 0.76 - age * 0.05),
  };
}

function tapeAnchored() { return false; }

function trimTapes() {
  while (G.tapes.length > MAX_SHADOWS) {
    let idx = -1;
    for (let i = 0; i < G.tapes.length; i++) {
      if (!tapeAnchored(G.tapes[i])) { idx = i; break; }
    }
    if (idx < 0) break;
    G.tapes.splice(idx, 1);
  }
}

const G = {
  state: 'menu', tick: 0, rec: [], tapes: [], loop: 1,
  player: null, shadows: [], time: 8, baseTime: 8,
  abilities: { dash: false },
  discovered: new Set(),
  zonesSeen: new Set(),
  checkpoint: null,
  speed: 1, shake: 0, camPull: 0, dev: DEV_DEBUG, timerStarted: false,
  timers: { intro: 0, death: 0, zoneCard: 0 }, deathCause: '', flashT: 0,
  heart: 0, cue5: false, cue3: false, hintShown: false,
};

const UI = {
  hud: $('#hud'), time: $('#time'), bonus: $('#bonus'), shadowcount: $('#shadowcount'), attempt: $('#attempt'),
  speed: $('#speed'), hint: $('#hint'), frag: $('#frag'), keepsake: $('#keepsake'), deathprompt: $('#deathprompt'),
  card: $('#roomcard'), menu: $('#menu'), pause: $('#pause'), ending: $('#ending'), vignette: $('#vignette'),
  flash: $('#flash'), fade: $('#fade'), loading: $('#loading'), dbg: $('#dbg'), build: $('#build'),
};
if (UI.build) UI.build.textContent = BUILD + ' · ' + ASSET_V;

function fmtTime(t) {
  t = Math.max(0, t);
  return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
}

function clearActors() {
  if (G.player) G.player.destroy();
  for (const s of G.shadows) s.destroy();
  G.player = null; G.shadows = [];
}

function resetEntities() {
  World.sig = {};
  for (const e of World.ents) {
    if (e instanceof Door) { e.open = 0; e.target = 0; e.timer = 0; e.wasReq = false; }
    if (e instanceof Button) { e.latched = false; e.flash = 0; }
    if (e instanceof Plate) { e.on = false; e.depress = 0; }
    if (e instanceof Crusher) { e.y = e.o.top; e.lastK = 0; }
  }
}

function applyTension() {
  const n = G.tapes.length;
  for (const l of World.lamps) l.alive = l.baseAlive;
  const extra = Math.max(0, n - 2);
  let killed = 0;
  for (let i = World.lamps.length - 1; i >= 0 && killed < extra; i--) {
    if (World.lamps[i].baseAlive) { World.lamps[i].alive = false; killed++; }
  }
  scene.fog.density = BASE_FOG * (1 + 0.10 * n);
  renderer.toneMappingExposure = Math.max(0.7, BASE_EXPOSURE - 0.02 * n);
  if (World.hemi) World.hemi.intensity = Math.max(0.2, 0.45 - 0.018 * n);
  Audio.klaxonLevel(Math.min(0.06, 0.012 * n));
}

function syncAbilities() {
  G.abilities.dash = G.discovered.has('ability:dash');
}

function makeTestTapes(n) {
  const tapes = [];
  for (let i = 0; i < n; i++) {
    const frames = [];
    for (let t = 0; t < 120 + i * 30; t++) {
      frames.push({ x: SPAWN.x + Math.sin(t * 0.05 + i) * 2, y: 0, z: SPAWN.z + t * 0.04 + i * 0.3, vx: 0.5, vz: 0.5, u: false, a: false });
    }
    tapes.push(frames);
  }
  return tapes;
}

function startRun() {
  clearActors(); resetEntities(); syncAbilities();
  G.tick = 0; G.rec = [];
  G.cue5 = G.cue3 = false; G.heart = 0;
  G.time = G.baseTime; G.timerStarted = false;
  UI.vignette.style.background = '';

  const sp = G.checkpoint || SPAWN;
  G.player = new Actor(false);
  G.player.place(sp.x, sp.z);

  const n = G.tapes.length;
  G.shadows = G.tapes.map((tape, i) => {
    const a = new Actor(true, shadowTint(n - 1 - i));
    a.tape = tape;
    a.place(sp.x, sp.z);
    a.y = groundAt(sp.x, sp.z, 0);
    return a;
  });

  applyTension(); updateHUD();
  checkZoneEntry(true);
}

function killPlayer(cause) {
  if (G.state !== 'play' || G.dev) return;
  G.state = 'dying'; G.deathCause = cause; G.timers.death = 0; G.shake = 1.0;
  Audio.S.die(); flash(0.14);
  G.player.alive = false;

  const rig = G.player.rig;
  if (rig.isGLTF && !rig.isShadow) {
    rig._origMats = [];
    const glitchMat = makeShadowMaterial();
    glitchMat.uniforms.uColor.value.set(0xff2222);
    glitchMat.uniforms.uGlow.value.set(0xff4444);
    glitchMat.uniforms.uOpacity.value = 0.7;
    glitchMat.uniforms.uGlitch.value = 1;
    rig.group.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        rig._origMats.push({ mesh: o, mat: o.material });
        o.material = glitchMat;
      }
    });
    rig._glitchMat = glitchMat;
  }
}

function commitDeath() {
  const wasEmpty = G.tapes.length === 0;
  if (G.rec.length > 8) {
    G.tapes.push(G.rec.slice());
    trimTapes();
    Audio.S.spawnShadow(); flash(0.10); G.shake = Math.max(G.shake, 0.8);
    if (wasEmpty) G.camPull = Math.max(G.camPull, 0.5);
  }
  G.loop++;
  startRun();
  G.state = 'play';
}

function checkZoneEntry(silent) {
  if (!G.player) return;
  for (const z of ZONES) {
    if (G.player.x >= z.x0 && G.player.x <= z.x1 && !G.zonesSeen.has(z.id)) {
      G.zonesSeen.add(z.id);
      if (z.cp) G.checkpoint = { x: z.cp.x, z: z.cp.z };
      if (!silent) showZoneCard(z);
    }
  }
}

function showZoneCard(z) {
  $('#roomcard .n').textContent = 'SECTOR ' + z.num;
  $('#roomcard .t').textContent = z.name;
  $('#roomcard .s').textContent = z.sub;
  UI.card.classList.add('on');
  G.timers.zoneCard = 1.4;
}

function hazardKill(actor, kz) {
  if (!actor.alive) return false;
  const b = { x: actor.x - PH.R, z: actor.z - PH.R, w: PH.R * 2, d: PH.R * 2 };
  if (hit2(b, kz) && Math.abs(actor.y - kz.y) < kz.h + 0.4) {
    actor.alive = false; actor.rig.group.visible = false;
    return true;
  }
  return false;
}

const _doorBuf = []; const _actorBuf = [];
function stepSim(dt) {
  _doorBuf.length = 0;
  for (let i = 0, n = World.ents.length; i < n; i++) { const e = World.ents[i]; if (e instanceof Door) { const s = e.solid(); if (s) _doorBuf.push(s); } }
  const doors = _doorBuf;
  _actorBuf.length = 0; _actorBuf.push(G.player);
  for (let i = 0, n = G.shadows.length; i < n; i++) if (G.shadows[i].alive) _actorBuf.push(G.shadows[i]);
  const allActors = _actorBuf;

  const input = {
    left: held.left(), right: held.right(), up: held.up(), down: held.down(),
    use: held.use(), usePress: !!Pressed.KeyE, dash: held.dash(),
  };
  if (input.dash) Pressed.Space = false;

  if (!G.timerStarted && (input.left || input.right || input.up || input.down || input.dash)) {
    G.timerStarted = true;
  }

  if (G.timerStarted) G.tick++;

  G.player.simulate(dt, input, doors);
  Pressed.KeyE = false;

  for (const s of G.shadows) {
    if (!s.alive) continue;
    if (!G.timerStarted) continue;
    const tickIdx = G.tick - 1;
    if (tickIdx < s.tape.length) s.playback(s.tape[tickIdx], tickIdx);
    else if (tapeAnchored(s.tape)) {
      s.playback(s.tape[s.tape.length - 1], s.tape.length - 1);
    } else {
      s.alive = false; s.rig.group.visible = false;
    }
  }

  for (const e of World.ents) {
    if (e instanceof Plate) e.trigger(allActors);
    else if (e instanceof Button) e.trigger(allActors);
    else if (e instanceof Crusher) e.logic(dt, G.tick);
    else if (e instanceof Laser) e.logic();
  }
  for (const e of World.ents) if (e instanceof Door) e.logic(dt);

  for (const e of World.ents) {
    let kz = null;
    if (e instanceof Crusher) kz = e.kills();
    else if (e instanceof Laser) kz = e.kills();
    if (!kz) continue;
    if (G.player.alive && hazardKill(G.player, kz)) killPlayer('hazard');
    for (const s of G.shadows) if (s.alive) hazardKill(s, kz);
  }

  for (const e of World.ents) {
    if (e instanceof Keepsake || e instanceof AbilityPickup) e.trigger();
  }

  for (const f of World.frags) {
    if (f.seen) continue;
    if (Math.hypot(G.player.x - f.x, G.player.z - f.z) < 1.8) { f.seen = true; showFrag(f.text); }
  }

  checkZoneEntry(false);

  if (G.player.alive) {
    const ez = World.exitZone;
    const g3 = World.ents.find(e => e instanceof Door && e.o.id === 'g3');
    if (ez && g3 && g3.isOpen() &&
      G.player.x > ez.x && G.player.x < ez.x + ez.w &&
      G.player.z > ez.z && G.player.z < ez.z + ez.d) {
      startEnding();
    }
  }

  G.rec.push(G.player.record());

  if (!G.dev && G.timerStarted) {
    G.time -= dt;
    if (G.time < 4 && G.time > 0) {
      const urgency = 1 - G.time / 4;
      const r = Math.round(60 + urgency * 90);
      const a1 = (0.15 + urgency * 0.25).toFixed(2);
      const a2 = (0.4 + urgency * 0.25).toFixed(2);
      const inner = Math.round(55 - urgency * 15);
      const mid = Math.round(80 - urgency * 10);
      UI.vignette.style.background =
        'radial-gradient(ellipse 80% 72% at 50% 52%, rgba(0,0,0,0) ' + inner + '%, rgba(' + r + ',0,0,' + a1 + ') ' + mid + '%, rgba(0,0,0,' + a2 + ') 100%)';
    }
    if (G.time <= 4 && !G.cue5) { G.cue5 = true; Audio.S.alarm(); }
    if (G.time <= 3 && !G.cue3) G.cue3 = true;
    if (G.time <= 4 && G.time > 0) { G.heart += dt; if (G.heart > 0.55) { G.heart = 0; Audio.S.heart(); } }
    if (G.time <= 0 && G.player.alive) killPlayer('timeout');
  }
}

function flash(v) { G.flashT = v; }
function setFade(v) { UI.fade.style.opacity = v; }
function showFrag(html) { UI.frag.innerHTML = html; UI.frag.classList.add('on'); clearTimeout(showFrag._t); showFrag._t = setTimeout(() => UI.frag.classList.remove('on'), 3000); }
function showKeepsake(html) { UI.keepsake.innerHTML = html; UI.keepsake.classList.add('on'); clearTimeout(showKeepsake._t); showKeepsake._t = setTimeout(() => UI.keepsake.classList.remove('on'), 4000); }
function showBonus(n) { UI.bonus.textContent = '+' + n + 's'; UI.bonus.classList.remove('on'); void UI.bonus.offsetWidth; UI.bonus.classList.add('on'); }

function updateHUD() {
  UI.time.textContent = fmtTime(G.time) + ' / ' + fmtTime(G.baseTime);
  UI.time.classList.toggle('low', G.time <= 6 && G.time > 4);
  UI.time.classList.toggle('crit', G.time <= 4);
  UI.shadowcount.textContent = '× ' + G.shadows.filter(s => s.alive).length;
  UI.attempt.textContent = 'LOOP ' + G.loop;
  if (DEV_DEBUG && UI.dbg) {
    UI.dbg.style.display = 'block';
    UI.dbg.textContent = 'x:' + G.player.x.toFixed(2) + ' y:' + G.player.y.toFixed(2) + ' z:' + G.player.z.toFixed(2) +
      '\ntick:' + G.tick + ' baseTime:' + G.baseTime + ' tapes:' + G.tapes.length;
  }
}

const camTarget = new THREE.Vector3();
let camPos = new THREE.Vector3();

function updateCamera(dt) {
  if (!G.player) return;
  const b = FACILITY;
  const pull = damp(G.camPull, 0, 1.4, dt); G.camPull = pull;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  let tx = lerp(G.player.x, cx, pull * 0.12);
  let tz = lerp(G.player.z, cz, pull * 0.12);
  tx = clamp(tx, b.x0 + 4, b.x1 - 4);
  tz = clamp(tz, b.z0 + 3, b.z1 - 3);
  camTarget.x = damp(camTarget.x, tx, 12, dt);
  camTarget.y = damp(camTarget.y, G.player.y + 1.0, 10, dt);
  camTarget.z = damp(camTarget.z, tz, 12, dt);
  ISO.dist = damp(ISO.dist, ISO.targetDist, 6, dt);
  if (Keys.BracketLeft) ISO.targetElevRad = clamp(ISO.targetElevRad + 1.2 * dt, 0.15, 1.45);
  if (Keys.BracketRight) ISO.targetElevRad = clamp(ISO.targetElevRad - 1.2 * dt, 0.15, 1.45);
  ISO.elevRad = damp(ISO.elevRad, ISO.targetElevRad, 8, dt);
  updateCamDir();
  const dist = ISO.dist * (1 + pull * 0.12);
  const shakeAmt = G.shake * 0.18;
  camPos.copy(camTarget).addScaledVector(CAM_DIR, dist);
  camPos.x += (Math.random() - 0.5) * shakeAmt; camPos.y += (Math.random() - 0.5) * shakeAmt;
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  updateWallOcclusion(dt);
}

let occFrame = 0;
function updateWallOcclusion(dt) {
  if (!G.player || !World.occluders.length) return;
  occFrame++;
  if (occFrame % 6 !== 0) return;
  const px = G.player.x, pz = G.player.z, py = G.player.y + 0.95;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (const m of World.occluders) {
    const wp = m.position;
    const mx = wp.x, mz = wp.z;
    const onLine = (mx - cx) * (pz - cz) - (mz - cz) * (px - cx);
    const between = (mx - cx) * (px - cx) + (mz - cz) * (pz - cz) > 0 &&
                    (mx - px) * (cx - px) + (mz - pz) * (cz - pz) > 0;
    const blocking = between && Math.abs(onLine) < 4.0 && wp.y < py + 4;
    const target = blocking ? 0.1 : 1;
    m.material.opacity = damp(m.material.opacity, target, 10, dt);
  }
}

function startEnding() {
  G.state = 'ending';
  UI.hud.hidden = true; UI.hint.classList.remove('on'); UI.frag.classList.remove('on'); UI.keepsake.classList.remove('on');
  Audio.S.win(); Audio.ambientLevel(0.18); Audio.klaxonLevel(0); Audio.bgmLevel(0.08);
  $('#e1').textContent = ENDING_LINES[0];
  setTimeout(() => { UI.ending.classList.add('on'); $('#e1').classList.add('on'); }, 1200);
  setTimeout(() => {
    $('#e1').classList.remove('on');
    setTimeout(() => { $('#e1').textContent = ENDING_LINES[1]; $('#e1').classList.add('on'); }, 900);
  }, 7000);
  setTimeout(() => { $('#e1').classList.remove('on'); $('#etitle').classList.add('on'); }, 14500);
}

function beginFromMenu() {
  UI.menu.classList.remove('on');
  G.state = 'cutscene';
  setFade(0);
  if (Audio.ok) Audio.ambientLevel(0);
  const play = (typeof playIntroCutscene === 'function') ? playIntroCutscene : (cb) => cb && cb();
  if (DEV_SKIP_INTRO) { startGame(); return; }
  play(startGame, getIntroBridge());
}

function getIntroBridge() {
  return {
    THREE, scene, camera, renderer, World, G, PAL, M, GEO, ISO, CAM_DIR, SPAWN,
    buildFigure, poseFigure, box, UI, Audio, setFade,
    lookAt(x, y, z, distScale, dt) {
      const targetDist = ISO.dist * (distScale == null ? 1 : distScale);
      if (dt == null) {
        camTarget.set(x, y, z);
        camPos.copy(camTarget).addScaledVector(CAM_DIR, targetDist);
      } else {
        camTarget.x = damp(camTarget.x, x, 7, dt);
        camTarget.y = damp(camTarget.y, y, 7, dt);
        camTarget.z = damp(camTarget.z, z, 7, dt);
        const cur = camera.position.distanceTo(camTarget);
        const dist = damp(cur, targetDist, 5, dt);
        camPos.copy(camTarget).addScaledVector(CAM_DIR, dist);
      }
      if (G.shake > 0) {
        const s = G.shake * 0.18;
        camPos.x += (Math.random() - 0.5) * s;
        camPos.y += (Math.random() - 0.5) * s;
      }
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      G.shake = Math.max(0, G.shake - (dt || 0.016) * 1.6);
    },
  };
}

function startGame() {
  UI.menu.classList.remove('on');
  buildFacility();
  Audio.startBGM();
  if (DEV_GHOSTS > 0) G.tapes = makeTestTapes(DEV_GHOSTS);
  startRun();
  G.state = 'intro'; G.timers.intro = 0; G.camPull = 0.5;
  UI.card.classList.add('on');
  $('#roomcard .n').textContent = 'FACILITY';
  $('#roomcard .t').textContent = 'THE LAST SHIFT';
  $('#roomcard .s').textContent = 'one map · many of you';
  if (!G.hintShown) {
    UI.hint.innerHTML = 'The clock runs out. What you did comes back and does it again.<br>Find keepsakes. Leave Shadows. You will not get through alone.';
    UI.hint.classList.add('on');
    G.hintShown = true;
    setTimeout(() => UI.hint.classList.remove('on'), 8000);
  }
  UI.hud.hidden = false;
  Audio.S.reveal();
  Audio.ambientLevel(0.5);
  setFade(0);
}

function fullRestart() {
  G.tapes = []; G.loop = 1;
  G.checkpoint = null;
  G.zonesSeen.clear();
  syncAbilities();
  for (const f of World.frags) f.seen = false;
  UI.deathprompt.style.opacity = '0';
  startRun();
}

let last = performance.now(), _simAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;

  G.speed = (Keys.ShiftLeft || Keys.ShiftRight) && G.state === 'play' ? 2 : 1;
  UI.speed.classList.toggle('on', G.speed > 1);
  if (G.speed > 1) UI.speed.textContent = 'FAST FORWARD ×' + G.speed;

  if (G.timers.zoneCard > 0) {
    G.timers.zoneCard -= dt;
    if (G.timers.zoneCard <= 0) UI.card.classList.remove('on');
  }

  if (G.state === 'menu') {
    for (const k in Pressed) if (Pressed[k]) { Pressed[k] = false; beginFromMenu(); break; }
  } else if (G.state === 'cutscene') {
    if (typeof IntroCutscene !== 'undefined' && IntroCutscene.update) IntroCutscene.update(dt);
  } else if (G.state === 'intro') {
    G.timers.intro += dt;
    if (G.timers.intro > 1.2) { UI.card.classList.remove('on'); G.state = 'play'; }
    updateCamera(dt);
  } else if (G.state === 'play') {
    if (Pressed.Escape) { Pressed.Escape = false; G.state = 'pause'; UI.pause.classList.add('on'); }
    else if (Pressed.Backspace) { Pressed.Backspace = false; fullRestart(); }
    else {
      _simAcc += dt * G.speed;
      const maxSteps = 6;
      let steps = 0;
      while (_simAcc >= TICK && steps < maxSteps) { stepSim(TICK); _simAcc -= TICK; steps++; if (G.state !== 'play') break; }
      if (_simAcc > TICK * maxSteps) _simAcc = 0;
      updateCamera(dt); updateHUD();
    }
  } else if (G.state === 'dying') {
    G.timers.death += dt;
    const rig = G.player.rig;
    if (rig._glitchMat) {
      const t = performance.now() * 0.001;
      rig._glitchMat.uniforms.uTime.value = t;
      rig._glitchMat.uniforms.uGlitch.value = 1;
      rig._glitchMat.uniforms.uOpacity.value = 0.7 - G.timers.death * 0.6;
    }
    if (rig.mixer) rig.mixer.update(dt);
    if (G.timers.death > 0.6) {
      rig.group.visible = false;
      G.state = 'rewinding';
      G.rewindIdx = G.rec.length - 1;
      G.rewindSpeed = 16;
    }
    updateCamera(dt);
  } else if (G.state === 'rewinding') {
    const stepsPerFrame = Math.ceil(G.rewindSpeed * dt * 60);
    for (let i = 0; i < stepsPerFrame && G.rewindIdx > 0; i++) {
      G.rewindIdx--;
    }
    G.rewindSpeed = Math.min(G.rewindSpeed + dt * 30, 80);

    const frame = G.rec[G.rewindIdx];
    if (frame) {
      G.player.x = frame.x; G.player.y = frame.y; G.player.z = frame.z;
      G.player.vx = 0; G.player.vz = 0;
      G.player.rig.group.position.set(frame.x, frame.y, frame.z);
      G.player.rig.group.visible = true;
      if (G.player.rig._glitchMat) {
        G.player.rig._glitchMat.uniforms.uTime.value = performance.now() * 0.001;
        G.player.rig._glitchMat.uniforms.uOpacity.value = 0.35;
      }
    }

    for (const s of G.shadows) {
      if (!s.alive) continue;
      const si = Math.min(G.rewindIdx, s.tape.length - 1);
      if (si >= 0) s.playback(s.tape[si], si);
    }

    updateCamera(dt);
    if (G.rewindIdx <= 0) {
      G.state = 'dead';
      UI.deathprompt.style.opacity = '1';
      UI.vignette.style.background = '';
    }
  } else if (G.state === 'dead') {
    if (Pressed.KeyR) { Pressed.KeyR = false; UI.deathprompt.style.opacity = '0'; commitDeath(); }
    updateCamera(dt);
  } else if (G.state === 'pause') {
    if (Pressed.Escape) { Pressed.Escape = false; G.state = 'play'; UI.pause.classList.remove('on'); }
    else if (Pressed.Backspace) { Pressed.Backspace = false; UI.pause.classList.remove('on'); fullRestart(); G.state = 'play'; }
  } else if (G.state === 'ending') {
    updateCamera(dt);
  }

  if (G.flashT > 0) { UI.flash.style.opacity = G.flashT; G.flashT = damp(G.flashT, 0, 10, dt); if (G.flashT < 0.01) { G.flashT = 0; UI.flash.style.opacity = 0; } }
  else UI.flash.style.opacity = 0;

  const focus = (G.state === 'cutscene' && typeof IntroCutscene !== 'undefined' && IntroCutscene.focus)
    ? IntroCutscene.focus
    : { x: G.player ? G.player.x : 0, z: G.player ? G.player.z : 0 };
  const px = focus.x, pz = focus.z;
  for (const e of World.ents) {
    if (e.light) {
      const ex = e.g ? e.g.position.x : e.o.x, ez = e.g ? e.g.position.z : e.o.z;
      const dist2 = (ex - px) * (ex - px) + (ez - pz) * (ez - pz);
      e._lightCulled = G.state !== 'cutscene' && dist2 > 225;
      if (e._lightCulled) { e.light.intensity = 0; }
    }
    if (G.state !== 'cutscene') e.render(dt);
  }
  if (G.player) G.player.render(dt);
  for (const s of G.shadows) if (s.alive) s.render(dt);

  if (G.state !== 'cutscene' && G.player && World.keyLight) {
    World.keyLight.position.set(px, 3.5, pz);
    World.fillLight.position.set(px - 4, 2.5, pz + 3);
  }
  if (G.state !== 'cutscene' && G.tick % 3 === 0) {
    const tNow = now * 0.001;
    for (const l of World.lamps) {
      const dx = l.g.position.x - px, dz = l.g.position.z - pz;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 400) { l.light.intensity = 0; continue; }
      const target = l.alive ? 2.6 : 0;
      l.baseIntensity = damp(l.baseIntensity || 0, target, 4, dt);
      let flick = Math.sin(tNow * 15 + l.flickId) * 0.1 + Math.sin(tNow * 23 + l.flickId * 1.8) * 0.05;
      if (Math.random() < 0.02) flick -= 0.3;
      l.light.intensity = Math.max(0, l.baseIntensity * (1 + flick));
    }
  }

  // Distance-based prop culling — check a batch each frame
  if (_propList.length > 0 && G.player) {
    const CULL_DIST2 = 20 * 20;
    const batch = Math.min(32, _propList.length);
    if (typeof frame._propIdx === 'undefined') frame._propIdx = 0;
    for (let i = 0; i < batch; i++) {
      const idx = (frame._propIdx + i) % _propList.length;
      const p = _propList[idx];
      const dx = p.position.x - px, dz = p.position.z - pz;
      p.visible = (dx * dx + dz * dz) < CULL_DIST2;
    }
    frame._propIdx = (frame._propIdx + batch) % _propList.length;
  }

  for (const k in Pressed) Pressed[k] = false;
  renderer.render(scene, camera);
}

(async () => {
  await Promise.all([loadProps(true), loadCharacterAssets(), loadCrateAsset()]);
  buildFacility();
  camTarget.set(SPAWN.x, 1, SPAWN.z);
  camPos.copy(camTarget).addScaledVector(CAM_DIR, ISO.dist);
  camera.position.copy(camPos); camera.lookAt(camTarget);
  setFade(0);
  UI.loading.style.display = 'none';
  if (DEV_AUTO) beginFromMenu();
  requestAnimationFrame(frame);
  loadProps(false).then(() => decorateFacility());
})();
