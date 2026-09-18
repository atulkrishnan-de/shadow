/* ============================================================================
   SHADOW — intro cutscene (standalone).
   Plays in the live facility with the game worker / press / lighting.
   Call: playIntroCutscene(onComplete, bridge)
   ========================================================================== */
'use strict';

const IntroCutsceneConfig = {
  enabled: true,
  totalDuration: 24,
  skipEnabled: true,
  onComplete: null,
  fadeOut: 0.4,

  locations: {
    press: { x: 36, z: 8 },
    lever: { x: 34.6, z: 5.4 },
    workerStart: { x: 33.1, z: 5.0 },
    workerAtLever: { x: 34.4, z: 5.55 },
    intake: { x: 2.2, z: 3.1 },
  },

  scenes: [
    {
      id: 'before',
      start: 0,
      duration: 4,
      look: { x: 35.2, y: 0.9, z: 7.0 },
      dist: 1.05,
      worker: { visible: true, x: 33.1, z: 5.0, facing: 0.55 },
      press: 0,
      leverLit: false,
      emergency: 0,
      stamp: [
        { t: '04 / 11 / 1960', cls: 'stamp', at: 0.2 },
        { t: '09:41 PM', cls: 'stamp-sub', at: 0.5 },
      ],
    },
    {
      id: 'action',
      start: 4,
      duration: 4.5,
      look: { x: 34.7, y: 0.9, z: 5.7 },
      dist: 0.7,
      pushAt: 2.2,
      pushLook: { x: 34.55, y: 1.0, z: 5.45 },
      pushDist: 0.55,
      worker: {
        visible: true,
        from: { x: 33.1, z: 5.0 },
        to: { x: 34.4, z: 5.55 },
        arrive: 1.5,
        facing: 0.2,
        useAt: 2.4,
      },
      press: 0,
      leverLit: true,
      pullAt: 2.6,
      emergency: 0,
      stamp: [],
      sfx: { button: 2.65 },
    },
    {
      id: 'wrong',
      start: 8.5,
      duration: 3.5,
      look: { x: 36, y: 1.0, z: 8 },
      dist: 0.9,
      pushAt: 0.6,
      pushLook: { x: 36, y: 0.7, z: 8 },
      pushDist: 0.68,
      worker: { visible: true, x: 34.4, z: 5.55, facing: 0.95, hideAt: 1.2 },
      slamAt: 0.85,
      slamDur: 0.4,
      leverLit: false,
      pulled: 1,
      emergency: 1,
      flashAt: 1.15,
      stamp: [],
      sfx: { crush: 1.2 },
    },
    {
      id: 'aftermath',
      start: 12,
      duration: 3.5,
      look: { x: 36, y: 0.85, z: 8 },
      dist: 1.1,
      worker: { visible: false },
      press: 1,
      leverLit: false,
      pulled: 1,
      emergency: 0.45,
      flicker: true,
      stamp: [],
    },
    {
      id: 'abandoned',
      start: 15.5,
      duration: 4,
      look: { x: 2.2, y: 1.0, z: 3.1 },
      dist: 1.12,
      fromLook: { x: 36, y: 0.85, z: 8 },
      fromDist: 1.1,
      blend: 1.6,
      worker: { visible: false },
      press: 1,
      leverLit: false,
      pulled: 1,
      emergency: 0,
      dim: true,
      stamp: [],
    },
    {
      id: 'present',
      start: 19.5,
      duration: 4.5,
      look: { x: 2.2, y: 1.0, z: 3.1 },
      dist: 1.12,
      worker: { visible: false },
      press: 1,
      leverLit: false,
      pulled: 1,
      emergency: 0,
      dim: true,
      veil: 0.55,
      stamp: [
        { t: '14 Years Later', cls: 'stamp', at: 0.2 },
        { t: '09:41 PM', cls: 'stamp-sub', at: 0.5 },

      ],
      sfx: { reveal: 0.4 },
    },
  ],
};

const IntroCutscene = (() => {
  const CFG = IntroCutsceneConfig;
  let B = null;
  let root, stampEl, flashEl, veilEl, grainEl, skipEl;
  let running = false, finishing = false, skipArmed = false;
  let t0 = 0, elapsed = 0, active = null, snap = true;
  let worker = null, lever = null, emerg = null, crusher = null;
  let pressTop = 2.6, pressPit = -0.42;
  let saved = null, focus = { x: 36, z: 8 };
  let flashed = false, sfxDone = {};
  let keyHandler = null;

  function $(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function ensureDom() {
    if (root) return;
    const style = document.createElement('style');
    style.id = 'intro-cutscene-styles';
    style.textContent = `
#intro-cutscene{position:fixed;inset:0;z-index:30;pointer-events:none;display:none;background:transparent;
  font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif;color:#dbdfd6;user-select:none}
#intro-cutscene.on{display:block}
#intro-cutscene .veil{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .6s linear}
#intro-cutscene .grain{position:absolute;inset:-30%;opacity:.07;pointer-events:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>");
  animation:icGrain .9s steps(3) infinite}
@keyframes icGrain{0%{transform:translate(0,0)}50%{transform:translate(2%,-2%)}100%{transform:translate(-1%,1%)}}
#intro-cutscene .flash{position:absolute;inset:0;background:#eef1ea;opacity:0;pointer-events:none}
#intro-cutscene .stamps{position:absolute;inset:0;pointer-events:none}
#intro-cutscene .line{opacity:0;transition:opacity .45s ease;text-align:center;text-shadow:0 2px 16px #000}
#intro-cutscene .line.on{opacity:1}
#intro-cutscene .stamp{position:absolute;left:0;right:0;top:11%;font-size:clamp(18px,3.5vw,30px);
  font-weight:200;letter-spacing:.36em;font-variant-numeric:tabular-nums}
#intro-cutscene .stamp-sub{position:absolute;left:0;right:0;top:calc(11% + 2.3em);font-size:clamp(11px,2vw,14px);
  letter-spacing:.28em;color:#868d84}
#intro-cutscene .saturday{position:absolute;left:0;right:0;bottom:18%;font-size:clamp(20px,4vw,34px);
  font-weight:200;letter-spacing:.46em;margin-left:.46em}
#intro-cutscene .skip{position:absolute;right:22px;bottom:calc(16px + env(safe-area-inset-bottom,0px));
  font-size:10px;letter-spacing:.3em;color:#4b565c;opacity:0;transition:opacity .4s;
  pointer-events:auto;cursor:pointer;padding:8px}
#intro-cutscene .skip.on{opacity:1}`;
    document.head.appendChild(style);

    root = $(' <div id="intro-cutscene"></div> ');
    root.innerHTML = '<div class="veil"></div><div class="grain"></div><div class="flash"></div><div class="stamps"></div><div class="skip">SKIP · ESC</div>';
    document.body.appendChild(root);
    veilEl = root.querySelector('.veil');
    grainEl = root.querySelector('.grain');
    flashEl = root.querySelector('.flash');
    stampEl = root.querySelector('.stamps');
    skipEl = root.querySelector('.skip');
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t * t * (3 - 2 * t); }

  function sceneAt(t) {
    let s = CFG.scenes[0];
    for (const c of CFG.scenes) if (t >= c.start) s = c;
    return s;
  }

  function buildLever() {
    const g = new B.THREE.Group();
    const L = CFG.locations.lever;
    g.position.set(L.x, 0, L.z);
    B.World.root.add(g);
    B.box(0.7, 1.05, 0.42, B.M.steelDark, -0.35, 0, -0.21, g);
    const handle = B.box(0.08, 0.4, 0.08, B.M.steel, -0.04, 0.55, 0.18, g);
    const lens = B.box(0.2, 0.12, 0.06, new B.THREE.MeshBasicMaterial({ color: 0x3a2a14 }), -0.1, 0.92, 0.18, g);
    const light = new B.THREE.PointLight(0xffa451, 0, 4, 2);
    light.position.set(0, 1.1, 0.25);
    g.add(light);
    return { group: g, handle, lens, light, pulled: 0 };
  }

  function buildWorker() {
    const rig = B.buildFigure(false);
    B.World.root.add(rig.group);
    const s = CFG.locations.workerStart;
    rig.group.position.set(s.x, 0, s.z);
    rig.group.rotation.y = 0.55;
    return { rig, x: s.x, z: s.z, vx: 0, vz: 0 };
  }

  function saveState() {
    saved = {
      hemi: B.World.hemi ? B.World.hemi.intensity : 0.55,
      sun: B.World.sun ? B.World.sun.intensity : 0.5,
      exposure: B.renderer.toneMappingExposure,
      crusherY: crusher ? crusher.y : null,
      lamps: B.World.lamps.map(l => l.alive),
    };
  }

  function restoreState() {
    if (!saved || !B) return;
    if (B.World.hemi) B.World.hemi.intensity = saved.hemi;
    if (B.World.sun) B.World.sun.intensity = saved.sun;
    B.renderer.toneMappingExposure = saved.exposure;
    if (crusher && saved.crusherY != null) {
      crusher.y = saved.crusherY;
      crusher.head.position.y = saved.crusherY;
    }
    for (let i = 0; i < B.World.lamps.length; i++) {
      if (saved.lamps[i] != null) B.World.lamps[i].alive = saved.lamps[i];
    }
    if (B.World.keyLight) { B.World.keyLight.color.setHex(0xffa54e); B.World.keyLight.intensity = 3.5; }
    if (B.World.fillLight) { B.World.fillLight.color.setHex(0x6688aa); B.World.fillLight.intensity = 1.8; }
  }

  function cleanup() {
    if (worker) { B.World.root.remove(worker.rig.group); worker = null; }
    if (lever) { B.World.root.remove(lever.group); lever = null; }
    if (emerg) { B.World.root.remove(emerg); emerg = null; }
  }

  function setStamps(list) {
    stampEl.innerHTML = '';
    for (const line of list || []) {
      const el = document.createElement('div');
      el.className = 'line ' + line.cls;
      el.textContent = line.t;
      stampEl.appendChild(el);
      setTimeout(() => { if (running) el.classList.add('on'); }, (line.at || 0) * 1000);
    }
  }

  function enter(scene) {
    active = scene;
    snap = !scene.fromLook;
    flashed = false;
    sfxDone = {};
    setStamps(scene.stamp);
  }

  function cam(scene, lt, dt) {
    let look = { x: scene.look.x, y: scene.look.y, z: scene.look.z };
    let dist = scene.dist == null ? 1 : scene.dist;

    if (scene.fromLook && scene.blend) {
      const u = ease(clamp(lt / scene.blend, 0, 1));
      look = {
        x: lerp(scene.fromLook.x, scene.look.x, u),
        y: lerp(scene.fromLook.y, scene.look.y, u),
        z: lerp(scene.fromLook.z, scene.look.z, u),
      };
      dist = lerp(scene.fromDist, scene.dist, u);
    }

    if (scene.pushAt != null && scene.pushLook) {
      const u = ease(clamp((lt - scene.pushAt) / 1.1, 0, 1));
      if (u > 0) {
        look = {
          x: lerp(look.x, scene.pushLook.x, u),
          y: lerp(look.y, scene.pushLook.y, u),
          z: lerp(look.z, scene.pushLook.z, u),
        };
        dist = lerp(dist, scene.pushDist, u);
      }
    }

    focus.x = look.x; focus.z = look.z;
    B.lookAt(look.x, look.y, look.z, dist, (snap || scene.fromLook) ? null : dt);
    snap = false;
  }

  function applyPress(scene, lt) {
    if (!crusher) return;
    let k = scene.press || 0;
    if (scene.slamAt != null) {
      k = lt < scene.slamAt ? 0 : ease(clamp((lt - scene.slamAt) / (scene.slamDur || 0.4), 0, 1));
    }
    const y = lerp(pressTop, pressPit + 1.0, k);
    crusher.y = y;
    crusher.head.position.y = y;
    if (crusher.shadowMark) crusher.shadowMark.material.opacity = 0.1 + k * 0.4;
  }

  function applyLever(scene, lt) {
    if (!lever) return;
    let pulled = scene.pulled || 0;
    if (scene.pullAt != null) pulled = ease(clamp((lt - scene.pullAt) / 0.4, 0, 1));
    lever.handle.rotation.x = pulled * 1.1;
    const lit = !!scene.leverLit && pulled < 0.85;
    lever.lens.material.color.setHex(lit ? (pulled > 0.15 ? 0xff6644 : 0xffb15e) : 0x3a2a14);
    lever.light.intensity = lit ? 1.15 : 0.04;
  }

  function applyWorker(scene, lt, dt) {
    if (!worker) return;
    const w = scene.worker || {};
    let visible = !!w.visible;
    if (w.hideAt != null && lt >= w.hideAt) visible = false;
    worker.rig.group.visible = visible;
    if (!visible) return;

    let x = w.x != null ? w.x : worker.x;
    let z = w.z != null ? w.z : worker.z;
    let vx = 0, vz = 0;

    if (w.from && w.to) {
      const u = ease(clamp(lt / (w.arrive || 1.5), 0, 1));
      x = lerp(w.from.x, w.to.x, u);
      z = lerp(w.from.z, w.to.z, u);
      if (u < 1) {
        vx = (w.to.x - w.from.x) / (w.arrive || 1.5);
        vz = (w.to.z - w.from.z) / (w.arrive || 1.5);
      }
    }

    worker.x = x; worker.z = z;
    worker.rig.group.position.set(x, 0, z);
    if (w.facing != null) {
      const face = (w.useAt != null && lt >= w.useAt) ? w.facing : (vx || vz ? Math.atan2(vx, vz) : w.facing);
      worker.rig.group.rotation.y = lerp(worker.rig.group.rotation.y, face, 1 - Math.exp(-10 * dt));
    }
    B.poseFigure(worker.rig, { x, y: 0, z, vx, vz }, dt);
  }

  function applyLights(scene, lt, dt) {
    let emergAmt = scene.emergency || 0;
    if (scene.id === 'wrong') emergAmt *= ease(clamp(lt / 0.25, 0, 1));
    if (scene.id === 'aftermath') emergAmt = lerp(0.7, 0.25, ease(clamp(lt / scene.duration, 0, 1)));

    if (!emerg) {
      emerg = new B.THREE.PointLight(0xff2a18, 0, 16, 1.6);
      B.World.root.add(emerg);
    }
    const pulse = 0.55 + 0.45 * Math.sin(elapsed * 5.2);
    emerg.intensity = emergAmt * 5.2 * pulse;
    emerg.position.set(focus.x, 3.1, focus.z);

    if (B.World.keyLight) {
      if (emergAmt > 0.05) {
        B.World.keyLight.color.setRGB(1, 0.22 + 0.1 * pulse, 0.12);
        B.World.keyLight.intensity = 2.2 + emergAmt * 2.4 * pulse;
      } else if (scene.dim) {
        B.World.keyLight.color.setHex(0x8aa0b0);
        B.World.keyLight.intensity = 1.35;
      } else {
        B.World.keyLight.color.setHex(0xffa54e);
        B.World.keyLight.intensity = 3.2;
      }
      B.World.keyLight.position.set(focus.x, 3.5, focus.z);
    }
    if (B.World.fillLight) {
      B.World.fillLight.position.set(focus.x - 3, 2.4, focus.z + 2);
      if (emergAmt > 0.05) {
        B.World.fillLight.color.setRGB(0.55, 0.12, 0.08);
        B.World.fillLight.intensity = 1.1 * emergAmt;
      } else if (scene.dim) {
        B.World.fillLight.color.setHex(0x445566);
        B.World.fillLight.intensity = 0.65;
      } else {
        B.World.fillLight.color.setHex(0x6688aa);
        B.World.fillLight.intensity = 1.6;
      }
    }

    if (B.World.hemi) B.World.hemi.intensity = scene.dim ? 0.22 : 0.55;
    if (B.World.sun) B.World.sun.intensity = scene.dim ? 0.18 : 0.5;
    B.renderer.toneMappingExposure = scene.dim ? 0.85 : (emergAmt > 0.2 ? 1.05 : 1.2);

    for (const lamp of B.World.lamps) {
      const dx = lamp.g.position.x - focus.x, dz = lamp.g.position.z - focus.z;
      if (dx * dx + dz * dz > 220) { lamp.light.intensity = 0; continue; }
      let alive = lamp.baseAlive;
      if (scene.flicker && Math.random() < 0.05) alive = false;
      if (scene.dim) alive = lamp.baseAlive && lamp.g.position.x < 12;
      let target = alive ? (scene.dim ? 1.15 : 2.6) : 0;
      if (emergAmt > 0.3) target *= 0.45;
      lamp.baseIntensity = (lamp.baseIntensity || 0) * 0.85 + target * 0.15;
      let flick = Math.sin(elapsed * 14 + lamp.flickId) * 0.08;
      if (scene.flicker && Math.random() < 0.04) flick -= 0.4;
      lamp.light.intensity = Math.max(0, lamp.baseIntensity * (1 + flick));
    }
  }

  function applyFx(scene, lt) {
    veilEl.style.opacity = scene.veil ? String(ease(clamp(lt / 1.0, 0, 1)) * scene.veil) : '0';
    grainEl.style.opacity = scene.dim || scene.flicker ? '0.12' : '0.07';

    if (scene.flashAt != null && lt >= scene.flashAt && !flashed) {
      flashed = true;
      flashEl.style.transition = 'none';
      flashEl.style.opacity = '0.9';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flashEl.style.transition = 'opacity .4s linear';
          flashEl.style.opacity = '0';
        });
      });
      if (B.G) B.G.shake = Math.max(B.G.shake || 0, 1.2);
    }

    const sfx = scene.sfx || {};
    for (const [name, at] of Object.entries(sfx)) {
      if (lt >= at && !sfxDone[name] && B.Audio && B.Audio.S) {
        sfxDone[name] = true;
        if (name === 'button' && B.Audio.S.button) B.Audio.S.button();
        if (name === 'crush' && B.Audio.S.crush) B.Audio.S.crush();
        if (name === 'reveal' && B.Audio.S.reveal) B.Audio.S.reveal();
      }
    }
  }

  function update(dt) {
    if (!running || !B) return;
    try {
      elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= CFG.totalDuration) { finish(); return; }
      if (!skipArmed && elapsed > 1.4) { skipArmed = true; skipEl.classList.add('on'); }

      const scene = sceneAt(elapsed);
      if (!active || active.id !== scene.id) enter(scene);
      const lt = elapsed - scene.start;

      cam(scene, lt, dt);
      applyPress(scene, lt);
      applyLever(scene, lt);
      applyWorker(scene, lt, dt);
      applyLights(scene, lt, dt);
      applyFx(scene, lt);
      if (crusher) crusher.render();
    } catch (err) {
      console.error('[intro]', err);
    }
  }

  function finish() {
    if (finishing) return;
    finishing = true;
    running = false;
    if (keyHandler) { removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (skipEl) skipEl.onclick = null;
    if (root) {
      root.style.transition = 'opacity ' + CFG.fadeOut + 's linear';
      root.style.opacity = '0';
    }
    const done = CFG.onComplete;
    const bridge = B;
    setTimeout(() => {
      cleanup();
      restoreState();
      if (root) {
        root.classList.remove('on');
        root.style.opacity = '';
        root.style.transition = '';
      }
      B = null;
      finishing = false;
      if (typeof done === 'function') done();
    }, CFG.fadeOut * 1000 + 30);
  }

  function skip() {
    if (!running || !CFG.skipEnabled || !skipArmed) return;
    finish();
  }

  async function play(onComplete, ctx) {
    if (typeof onComplete === 'function') CFG.onComplete = onComplete;
    if (!CFG.enabled) { if (CFG.onComplete) CFG.onComplete(); return; }
    if (!ctx || !ctx.World || !ctx.buildFigure) {
      console.warn('[intro] missing bridge');
      if (CFG.onComplete) CFG.onComplete();
      return;
    }

    B = ctx;
    ensureDom();
    running = true;
    finishing = false;
    skipArmed = false;
    elapsed = 0;
    active = null;
    snap = true;
    sfxDone = {};

    if (B.UI) {
      if (B.UI.hud) B.UI.hud.hidden = true;
      if (B.UI.card) B.UI.card.classList.remove('on');
      if (B.UI.hint) B.UI.hint.classList.remove('on');
      if (B.UI.fade) B.UI.fade.style.opacity = '0';
    }
    if (B.setFade) B.setFade(0);
    if (B.Audio && B.Audio.ambientLevel) B.Audio.ambientLevel(0.25);

    crusher = null;
    for (let i = 0; i < B.World.ents.length; i++) {
      if (B.World.ents[i].kind === 'crusher') { crusher = B.World.ents[i]; break; }
    }
    if (crusher && crusher.o) {
      pressTop = crusher.o.top;
      pressPit = crusher.o.pitY || 0;
    }

    saveState();
    cleanup();
    worker = buildWorker();
    lever = buildLever();

    const first = CFG.scenes[0];
    B.lookAt(first.look.x, first.look.y, first.look.z, first.dist, null);
    focus.x = first.look.x; focus.z = first.look.z;

    root.style.opacity = '1';
    root.classList.add('on');
    skipEl.classList.remove('on');
    veilEl.style.opacity = '0';
    flashEl.style.opacity = '0';
    setStamps([]);

    keyHandler = e => {
      if (!running || !skipArmed) return;
      if (e.code === 'Escape') { e.preventDefault(); skip(); }
    };
    addEventListener('keydown', keyHandler);
    skipEl.onclick = e => { e.stopPropagation(); skip(); };

    t0 = performance.now();
    enter(first);
  }

  return {
    config: CFG,
    play,
    skip,
    update,
    get playing() { return running; },
    get focus() { return focus; },
  };
})();

function playIntroCutscene(onComplete, bridge) {
  const params = new URLSearchParams(location.search);
  if (params.has('skipintro') || IntroCutsceneConfig.enabled === false) {
    if (typeof onComplete === 'function') onComplete();
    return;
  }
  IntroCutscene.play(onComplete, bridge);
}

window.IntroCutsceneConfig = IntroCutsceneConfig;
window.IntroCutscene = IntroCutscene;
window.playIntroCutscene = playIntroCutscene;
