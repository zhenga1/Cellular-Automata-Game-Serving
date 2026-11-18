/* Game sound for the Cellular Automata Sandbox (sim.html, play.html, race.html).
 *
 * Everything is synthesised with Web Audio: no sound files. Two kinds of sound:
 *  - The world: every 100 ms the page asks the engine what happened since the
 *    last check (ca_sound_take / ca_sound_stat, counted in src/cell_funcs.cpp)
 *    and turns it into fire roar and crackle, hiss where fire meets water,
 *    lava rumble, running water, sliding sand and placement sounds.
 *  - Game cues the page asks for: GameAudio.cue("win" | "lose" | "start" | ...).
 *
 * Browsers only allow sound after the user has clicked or pressed a key, so the
 * audio starts on the first interaction. M mutes; the choice is remembered.
 */
(function () {
  "use strict";

  // Mirrors enum SoundStat in src/cell_funcs.h
  const S = { TICKS: 0, FIRE: 1, BURNED: 2, EXTINGUISHED: 3, LAVA: 4, LAVA_IGNITE: 5,
              WATER: 6, SAND: 7, PLACED: 8, DELETED: 9, PLACED_TYPE: 10, COUNT: 11 };
  // Mirrors enum CellType in src/cell_types.h
  const T = { WALL: 0, AIR: 1, SAND: 2, WATER: 3, FIRE: 4, SNOW: 5, GRASS: 6, TOPGRASS: 7,
              WOOD: 8, STEAM: 9, SMOKE: 10, LAVA: 11, TURF: 23 };
  const isSpawner = (t) => (t >= 12 && t <= 22) || t === 24;

  const params = new URLSearchParams(location.search);
  // In a race, only the player's side makes sound
  const disabled = params.get("race") === "solver";

  const STORE = "ca-audio";
  const settings = { muted: false, volume: 0.7 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) {} };

  let ctx = null, master = null, out = null;
  let white = null, brown = null;
  const layers = {};
  const controls = [];

  // ---------------------------------------------------------------- set-up

  function makeNoise(kind) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  function loop(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random();          // so layers sharing a buffer don't phase
    src.start(0, Math.random() * 1.5);
    return src;
  }

  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  // A looping noise bed through a filter chain into its own gain (starts silent)
  function bed(buffer, filters) {
    const g = ctx.createGain();
    g.gain.value = 0;
    let node = loop(buffer);
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(g);
    g.connect(master);
    return { gain: g, filters };
  }

  function init() {
    if (ctx || disabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createDynamicsCompressor();
    out.threshold.value = -18;
    out.ratio.value = 4;
    out.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    master.connect(out);
    white = makeNoise("white");
    brown = makeNoise("brown");

    layers.wind = bed(brown, [filter("bandpass", 320, 0.6)]);
    layers.roar = bed(brown, [filter("lowpass", 520, 0.7)]);
    layers.lava = bed(brown, [filter("lowpass", 110, 0.9)]);
    layers.water = bed(white, [filter("bandpass", 650, 0.8), filter("lowpass", 1800)]);
    layers.sand = bed(white, [filter("bandpass", 2600, 0.5), filter("lowpass", 5000)]);
    layers.hiss = bed(white, [filter("highpass", 2600, 0.5)]);

    // Slow wobble on the wind and water so they don't sound like static
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(layers.wind.filters[0].frequency);
    lfoGain.connect(layers.water.filters[0].frequency);
    lfo.start();

    setLevel("wind", 0.035, 2);
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else if (!settings.muted) ctx.resume();
    });
  }

  function unlock() {
    init();
    if (ctx && ctx.state !== "running" && !settings.muted) ctx.resume();
  }
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, unlock, { capture: true, passive: true }));

  const live = () => ctx && ctx.state === "running" && !settings.muted;

  function setLevel(name, value, seconds) {
    const l = layers[name];
    if (l) l.gain.gain.setTargetAtTime(value, ctx.currentTime, seconds || 0.25);
  }

  // ------------------------------------------------------------ one-shots

  function env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(type, f0, f1, t, dur, peak, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, peak, dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function burst(t, dur, peak, type, freq, q, sweepTo) {
    const src = ctx.createBufferSource(), f = filter(type, freq, q), g = ctx.createGain();
    src.buffer = white;
    if (sweepTo) {
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    }
    env(g, t, Math.min(0.01, dur / 4), peak, dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  function crackle(t) {
    burst(t, 0.008 + Math.random() * 0.03, 0.15 + Math.random() * 0.35,
          "bandpass", 1400 + Math.random() * 3800, 2 + Math.random() * 4);
  }

  function bubble(t, base) {
    const f = base * (0.8 + Math.random() * 0.6);
    tone("sine", f, f * 2.2, t, 0.06 + Math.random() * 0.05, 0.08);
  }

  function blorp(t) {
    tone("sine", 95, 42, t, 0.28, 0.35);
    burst(t, 0.18, 0.08, "lowpass", 400, 0.7);
  }

  function placeSound(type, t) {
    if (isSpawner(type)) {
      tone("sine", 880, 880, t, 0.12, 0.12);
      tone("sine", 1320, 1320, t + 0.07, 0.16, 0.1);
      return;
    }
    switch (type) {
      case T.AIR:      tone("sine", 900, 260, t, 0.08, 0.22); burst(t, 0.03, 0.08, "highpass", 3000); break;
      case T.WALL:     tone("sine", 150, 110, t, 0.12, 0.45); burst(t, 0.025, 0.2, "bandpass", 1800, 1); break;
      case T.TURF:     tone("sine", 170, 120, t, 0.1, 0.3); burst(t, 0.05, 0.12, "lowpass", 1500); break;
      case T.WOOD:     tone("triangle", 260, 200, t, 0.09, 0.35); burst(t, 0.02, 0.15, "bandpass", 2400, 2); break;
      case T.SAND:
      case T.SNOW:
      case T.GRASS:    burst(t, 0.14, 0.35, "lowpass", type === T.SNOW ? 2200 : 1300, 0.7); break;
      case T.WATER:    tone("sine", 280, 900, t, 0.13, 0.3); bubble(t + 0.05, 700); break;
      case T.FIRE:     burst(t, 0.35, 0.4, "bandpass", 350, 1.2, 2200); break;
      case T.LAVA:     blorp(t); break;
      case T.STEAM:
      case T.SMOKE:    burst(t, 0.3, 0.2, "highpass", 1800, 0.6); break;
      default:         tone("sine", 220, 180, t, 0.08, 0.25);
    }
  }

  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note -> Hz

  const CUES = {
    // material picked / UI tick
    select: (t) => tone("triangle", 1200, 1200, t, 0.03, 0.05),
    // a placement the level won't allow
    denied: (t) => { tone("square", 160, 140, t, 0.12, 0.08); tone("square", 120, 110, t + 0.13, 0.16, 0.08); },
    // the hazard starts
    start: (t) => { burst(t, 0.7, 0.35, "bandpass", 200, 1, 1800); tone("sine", 70, 45, t, 0.5, 0.5); },
    // a villager was lost
    warn: (t) => { [0, 0.22].forEach((d) => { tone("square", 740, 740, t + d, 0.1, 0.07); tone("square", 494, 494, t + d + 0.11, 0.1, 0.07); }); },
    win: (t) => {
      [72, 76, 79, 84].forEach((n, i) => tone("triangle", NOTE(n), NOTE(n), t + i * 0.11, 0.35, 0.22));
      [88, 91].forEach((n, i) => tone("sine", NOTE(n), NOTE(n), t + 0.45 + i * 0.08, 0.5, 0.08));
    },
    lose: (t) => {
      [69, 65, 62, 57].forEach((n, i) => tone("triangle", NOTE(n), NOTE(n) * 0.97, t + i * 0.18, 0.4, 0.2));
      tone("sine", 70, 40, t + 0.7, 0.8, 0.3);
    },
  };

  // ------------------------------------------------------------ the world

  let moduleRef = null, lastStats = null, idlePolls = 0;
  const level = { fire: 0, lava: 0, water: 0, sand: 0 };   // 0..1, last known activity
  const curve = (x, full) => Math.min(1, Math.log1p(x) / Math.log1p(full));
  const poisson = (mean) => {          // small-mean random count
    let n = 0, p = Math.exp(-mean), s = p, u = Math.random();
    while (u > s && n < 50) { n++; p *= mean / n; s += p; }
    return n;
  };

  function poll() {
    const M = moduleRef;
    if (!M || typeof M._ca_sound_take !== "function") return;
    let st;
    try {
      M._ca_sound_take();
      st = [];
      for (let i = 0; i < S.COUNT; i++) st.push(M._ca_sound_stat(i));
    } catch (e) { return; }
    lastStats = st;
    if (!live()) return;                 // counters are drained either way

    const t0 = ctx.currentTime, span = 0.1;
    if (st[S.TICKS] > 0) {
      const per = (i) => st[i] / st[S.TICKS];    // events per simulation step
      level.fire = curve(per(S.FIRE), 500);
      level.lava = curve(per(S.LAVA), 300);
      level.water = curve(per(S.WATER), 250);
      level.sand = curve(per(S.SAND), 150);
      idlePolls = 0;
    } else if (++idlePolls >= 5) {
      // No step for half a second: paused, or the level is over. A slow computer
      // can go a check or two without a step, so keep the sound through short gaps.
      level.fire = level.lava = level.water = level.sand = 0;
    }
    const { fire, lava, water, sand } = level;

    setLevel("roar", 0.4 * fire);
    setLevel("lava", 0.7 * lava, 0.5);
    setLevel("water", 0.25 * water, 0.3);
    setLevel("sand", 0.12 * sand, 0.15);

    // Crackle: more grains with more fire, and extra for every block burning up
    const crackles = poisson(Math.min(12, 18 * span * fire + 0.4 * st[S.BURNED]));
    for (let i = 0; i < crackles; i++) crackle(t0 + Math.random() * span);

    if (st[S.EXTINGUISHED] > 0) {
      const g = layers.hiss.gain.gain, peak = 0.05 + 0.18 * curve(st[S.EXTINGUISHED], 60);
      g.cancelScheduledValues(t0);
      g.setTargetAtTime(peak, t0, 0.02);
      g.setTargetAtTime(0, t0 + 0.12, 0.25);
    }

    for (let i = poisson(Math.min(3, 2 * span * water * 10)); i > 0; i--) bubble(t0 + Math.random() * span, 900);
    for (let i = poisson(Math.min(2, span * lava * 6)); i > 0; i--) blorp(t0 + Math.random() * span);
    for (let i = Math.min(3, st[S.LAVA_IGNITE]); i > 0; i--) burst(t0 + Math.random() * span, 0.25, 0.25, "bandpass", 300, 1, 1500);

    if (st[S.PLACED] + st[S.DELETED] > 0) placeSound(st[S.PLACED_TYPE], t0);
  }

  // ------------------------------------------------------------ settings UI

  const ICON_ON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>';

  function refreshControls() {
    for (const c of controls) {
      c.button.innerHTML = settings.muted ? ICON_OFF : ICON_ON;
      c.button.setAttribute("aria-pressed", String(settings.muted));
      c.button.title = settings.muted ? "Sound off (M)" : "Sound on (M)";
      c.button.setAttribute("aria-label", settings.muted ? "Turn sound on" : "Turn sound off");
      if (c.slider) { c.slider.value = Math.round(settings.volume * 100); c.slider.disabled = settings.muted; }
    }
  }

  function applyVolume() {
    if (!ctx) return;
    master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, ctx.currentTime, 0.05);
    if (!settings.muted && ctx.state !== "running") ctx.resume();
  }

  const GameAudio = {
    disabled,
    // Start reading the engine's event counts: call once the runtime is up
    // (onRuntimeInitialized), with the Emscripten Module
    attach(Module) {
      if (moduleRef) return;
      moduleRef = Module;
      if (!disabled) setInterval(poll, 100);
    },
    cue(name) {
      if (disabled) return;
      init();
      if (!live() || !CUES[name]) return;
      CUES[name](ctx.currentTime + 0.01);
    },
    setMuted(m) {
      settings.muted = !!m;
      save();
      applyVolume();
      refreshControls();
    },
    toggleMute() { GameAudio.setMuted(!settings.muted); },
    setVolume(v) {
      settings.volume = Math.max(0, Math.min(1, v));
      if (settings.volume > 0 && settings.muted) settings.muted = false;
      save();
      applyVolume();
      refreshControls();
    },
    get muted() { return settings.muted; },
    // For checking in the console: audio state and the last event counts read
    debug() {
      const names = Object.keys(S).filter((k) => k !== "COUNT");
      const stats = lastStats && Object.fromEntries(names.map((k) => [k, lastStats[S[k]]]));
      const levels = ctx && Object.fromEntries(Object.entries(layers).map(([k, l]) => [k, +l.gain.gain.value.toFixed(3)]));
      return { state: ctx ? ctx.state : "not started", muted: settings.muted, volume: settings.volume, stats, levels };
    },
    // A sound button (and optionally a volume slider) inside `container`
    mountControl(container, withSlider) {
      if (!container) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn sound-btn";
      button.addEventListener("click", () => { unlock(); GameAudio.toggleMute(); button.blur(); });
      container.appendChild(button);
      let slider = null;
      if (withSlider) {
        slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0"; slider.max = "100";
        slider.className = "sound-volume";
        slider.setAttribute("aria-label", "Sound volume");
        slider.addEventListener("input", () => { unlock(); GameAudio.setVolume(slider.value / 100); });
        container.appendChild(slider);
      }
      controls.push({ button, slider });
      refreshControls();
      if (disabled) { button.disabled = true; button.title = "The Solver's side is silent"; }
    },
  };

  // M toggles sound anywhere, except while typing in a text field
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = e.target;
    if (el && (el.tagName === "INPUT" && /^(text|search|email|number)$/i.test(el.type) || el.tagName === "TEXTAREA")) return;
    if (e.key === "m" || e.key === "M") GameAudio.toggleMute();
  });

  window.GameAudio = GameAudio;
})();
