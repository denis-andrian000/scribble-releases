// Buddy sounds: small tones made live with Web Audio (no audio files), one for each animation.
// Each buddy has its own pitch (a bear is deeper, a mouse squeakier). Settings live in the buddy's config:
//   sound: { on: true, idle: false, vol: 0.6 }   (idle = the sounds of things it does on its own)
// Used by the buddy (buddy.js, buddy-life.js) and the panel (ticking off a task).
(function () {
  // the web version's corner buddy is a frame: it uses the page's engine (the page is where the user taps, which
  // is what lets a browser play sound)
  try { if (window.parent !== window && window.parent.ScribbleSound) { window.ScribbleSound = window.parent.ScribbleSound; return; } } catch {}

  const PITCH = { bear: 0.74, panda: 0.76, koala: 0.8, dog: 0.9, frog: 0.94, otter: 1, monkey: 1, classic: 1, note: 1, blob: 1,
    chameleon: 1.04, fish: 1.12, cat: 1.1, fox: 1.08, bunny: 1.22, egg: 1.2, bird: 1.3, chick: 1.32, mouse: 1.45, axolotl: 1.15 };
  let cfg = { on: true, idle: false, vol: 0.6 }, pitch = 1, ctx = null, master = null, noiseBuf = null;
  const last = {}, played = [];   // played: the latest sounds (for the tests)

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = cfg.vol;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // browsers only allow sound after the user has touched the page: wake the engine on the first touch or key
  const unlock = () => { const c = audio(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  // ---- building blocks: a tone, a slide, a noise burst (each with a quick attack and a soft decay)
  function out(t0, g, pan) {
    const v = ctx.createGain();
    v.gain.value = 0;
    let node = v;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; v.connect(p); node = p; }
    node.connect(master);
    return v;
  }
  function envelope(v, t0, g, a, dec, d) {
    v.gain.setValueAtTime(0, t0);
    v.gain.linearRampToValueAtTime(g, t0 + a);
    v.gain.setTargetAtTime(0, t0 + a, dec / 1.1);
    v.gain.setValueAtTime(0, t0 + d + dec * 3);
  }
  function tone(at, f, d, { g = 0.4, dec = 0.12, a = 0.004, type = 'sine', h2 = 0, pan = 0, vib = 0, vibHz = 6 } = {}) {
    const t0 = ctx.currentTime + at, v = out(t0, g, pan);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * pitch, t0); o.connect(v);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibHz; lg.gain.value = f * pitch * vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + d + dec * 3); }
    if (h2) { const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.frequency.setValueAtTime(f * 2 * pitch, t0); g2.gain.value = h2; o2.connect(g2); g2.connect(v); o2.start(t0); o2.stop(t0 + d + dec * 3); }
    envelope(v, t0, g, a, dec, d);
    o.start(t0); o.stop(t0 + d + dec * 3);
    return o;
  }
  function slide(at, f0, f1, d, opts = {}) {
    const o = tone(at, f0, d, { dec: d * 0.6, ...opts });
    const t0 = ctx.currentTime + at;
    o.frequency.setValueAtTime(f0 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t0 + d);
    return o;
  }
  function noise(at, d, f, bw, { g = 0.3, dec = 0.03, a = 0.002, pan = 0, flutter = 0 } = {}) {
    const t0 = ctx.currentTime + at, v = out(t0, g, pan);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = Math.max(0.3, f / bw);
    s.connect(bp);
    if (flutter) {
      const am = ctx.createGain(); am.gain.value = 0.6; const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = flutter; lg.gain.value = 0.4; l.connect(lg); lg.connect(am.gain); l.start(t0); l.stop(t0 + d + 0.2);
      bp.connect(am); am.connect(v);
    } else bp.connect(v);
    envelope(v, t0, g, a, dec, d);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + d + dec * 3);
  }
  const wood = (at, f, g = 0.4) => { tone(at, f, 0.06, { g, dec: 0.018 }); noise(at, 0.02, f * 2, 600, { g: g * 0.3, dec: 0.008 }); };
  const sparkle = (at, g = 0.12) => [2093, 2637, 3136].forEach((f, i) => tone(at + i * 0.045, f, 0.25, { g, dec: 0.07 }));

  // ---- the sounds. idle: true = something it does on its own (played only when "while idle" is on)
  const S = {
    // reacts to you
    hover:    { gap: 1500, play: () => tone(0, 1480, 0.05, { g: 0.08, dec: 0.018 }) },
    tap:      { play: () => slide(0, 520, 1150, 0.09, { g: 0.32, dec: 0.035, a: 0.003 }) },
    squish:   { play: () => slide(0, 380, 880, 0.14, { g: 0.22, dec: 0.08, type: 'triangle' }) },
    pickup:   { play: () => slide(0, 300, 720, 0.16, { g: 0.26, dec: 0.12, a: 0.02, type: 'triangle' }) },
    dizzy:    { play: () => slide(0, 950, 420, 0.7, { g: 0.2, dec: 0.35, a: 0.02, vib: 0.3, vibHz: 13 }) },
    falling:  { gap: 1200, play: () => slide(0, 1500, 480, 0.55, { g: 0.16, dec: 0.5, a: 0.02 }) },
    land:     { gap: 250, play: (k = 0.5) => {
      slide(0, 170, 60, 0.16, { g: 0.25 + 0.3 * k, dec: 0.05, a: 0.002 });
      if (k > 0.6) { tone(0.14, 660, 0.1, { g: 0.08, dec: 0.04 }); tone(0.23, 560, 0.08, { g: 0.05, dec: 0.03 }); }
    } },
    surprised:{ play: () => slide(0, 380, 1250, 0.22, { g: 0.24, dec: 0.12, a: 0.003, vib: 0.06, vibHz: 22 }) },
    phew:     { play: () => noise(0, 0.42, 1600, 1800, { g: 0.1, dec: 0.2, a: 0.06 }) },
    thinking: { play: () => [[620, 0.14], [740, 0.1], [680, 0.08]].forEach(([f, g], i) => tone(i * 0.11, f, 0.1, { g, dec: 0.04 })) },
    asking:   { play: () => { tone(0, 660, 0.14, { g: 0.25, dec: 0.06 }); tone(0.12, 990, 0.22, { g: 0.25, dec: 0.1 }); } },
    reply:    { play: () => { tone(0, 880, 0.14, { g: 0.24, dec: 0.05, a: 0.003 }); tone(0.06, 1320, 0.14, { g: 0.24, dec: 0.06, a: 0.003 }); } },
    saved:    { play: () => { tone(0, 784, 0.5, { g: 0.28, dec: 0.16, h2: 0.25 }); tone(0.11, 1046.5, 0.64, { g: 0.28, dec: 0.24, h2: 0.25 }); } },
    clipped:  { play: () => { [1046.5, 1318.5, 1568].forEach((f, i) => tone(i * 0.09, f, 0.3, { g: 0.22, dec: i === 2 ? 0.18 : 0.1, h2: 0.2 })); tone(0.3, 2093, 0.3, { g: 0.07, dec: 0.1 }); } },
    sad:      { play: () => { tone(0, 523, 0.25, { g: 0.2, dec: 0.12, a: 0.01, type: 'triangle' }); tone(0.2, 392, 0.45, { g: 0.2, dec: 0.2, a: 0.01, type: 'triangle' }); } },
    alert:    { play: () => { tone(0, 1568, 0.09, { g: 0.22, dec: 0.03 }); tone(0.11, 1568, 0.09, { g: 0.22, dec: 0.03 }); tone(0.22, 2093, 0.3, { g: 0.24, dec: 0.12, h2: 0.15 }); } },
    taskDone: { play: () => { noise(0, 0.02, 3000, 4000, { g: 0.35, dec: 0.004, a: 0.0005 }); sparkle(0.05, 0.12); } },
    asleep:   { play: () => [[392, 1], [349, 0.8], [330, 0.6]].forEach(([f, k], i) => slide(i * 0.5, f, f * 0.85, 0.4, { g: 0.07 * k, dec: 0.25, a: 0.08, type: 'triangle' })) },
    wake:     { play: () => { slide(0, 330, 660, 0.3, { g: 0.16, dec: 0.25, a: 0.03, type: 'triangle' }); tone(0.25, 784, 0.2, { g: 0.08, dec: 0.08 }); } },
    cling:    { play: () => { noise(0, 0.03, 2500, 2000, { g: 0.12, dec: 0.01 }); slide(0.02, 500, 900, 0.1, { g: 0.2, dec: 0.06, type: 'triangle' }); } },
    // on its own (quieter)
    wave:     { idle: true, play: () => slide(0, 520, 1150, 0.09, { g: 0.12, dec: 0.035, a: 0.003 }) },
    hop:      { idle: true, play: () => { slide(0, 330, 760, 0.12, { g: 0.14, dec: 0.07 }); slide(0.2, 160, 70, 0.1, { g: 0.12, dec: 0.04 }); } },
    wiggle:   { idle: true, play: () => { for (let i = 0; i < 7; i++) tone(i * 0.06, i % 2 ? 880 : 990, 0.06, { g: 0.09, dec: 0.025 }); } },
    twirl:    { idle: true, play: () => { const o = slide(0, 500, 1500, 0.25, { g: 0.1, dec: 0.3, a: 0.03 }); o.frequency.exponentialRampToValueAtTime(500 * pitch, ctx.currentTime + 0.5); } },
    roll:     { idle: true, play: () => { [1046, 880, 740, 622].forEach((f, i) => tone(i * 0.09, f, 0.08, { g: 0.1, dec: 0.03 })); slide(0.4, 160, 60, 0.14, { g: 0.12, dec: 0.05 }); } },
    stretch:  { idle: true, play: () => { slide(0, 300, 620, 0.7, { g: 0.1, dec: 0.5, a: 0.25, type: 'triangle' }); tone(0.72, 784, 0.25, { g: 0.05, dec: 0.1 }); } },
    yawn:     { idle: true, play: () => { slide(0, 620, 330, 0.9, { g: 0.09, dec: 0.6, a: 0.2, type: 'triangle' }); noise(0, 0.9, 1200, 1400, { g: 0.03, dec: 0.5, a: 0.2 }); } },
    poof:     { play: () => { noise(0, 0.32, 700, 1200, { g: 0.24, dec: 0.16, a: 0.01 }); slide(0, 260, 110, 0.25, { g: 0.12, dec: 0.12 }); sparkle(0.12, 0.05); } },
    cough:    { play: () => [0, 0.33, 0.6].forEach((at, i) => { noise(at, 0.07, 1000 - i * 80, 900, { g: 0.17, dec: 0.05 }); tone(at, 230 - i * 15, 0.05, { g: 0.07, type: 'triangle', dec: 0.04 }); }) },
    sneeze:   { idle: true, play: () => {
      slide(0, 500, 620, 0.22, { g: 0.07, dec: 0.2, a: 0.05, type: 'triangle' }); slide(0.35, 560, 760, 0.25, { g: 0.08, dec: 0.2, a: 0.05, type: 'triangle' });
      noise(0.75, 0.18, 3200, 3000, { g: 0.16, dec: 0.07 }); slide(0.76, 900, 500, 0.1, { g: 0.07, dec: 0.05 });
    } },
    lookAround: { idle: true, play: () => { tone(0, 1175, 0.07, { g: 0.09, dec: 0.03, pan: -0.8 }); tone(0.42, 1318, 0.07, { g: 0.09, dec: 0.03, pan: 0.8 }); } },
    tilt:     { idle: true, play: () => slide(0, 600, 820, 0.16, { g: 0.1, dec: 0.1 }) },
    sniff:    { idle: true, play: () => { for (let i = 0; i < 3; i++) noise(i * 0.12, 0.06, 4200, 2500, { g: 0.08, dec: 0.025 }); } },
    peekaboo: { idle: true, play: () => { slide(0, 1200, 400, 0.2, { g: 0.07, dec: 0.15 }); slide(0.7, 520, 1150, 0.09, { g: 0.14, dec: 0.035 }); for (let i = 0; i < 5; i++) tone(0.8 + i * 0.05, 1320 + 60 * (i % 2), 0.05, { g: 0.05, dec: 0.02 }); } },
    babble:   { idle: true, play: () => { const P = [784, 880, 1046.5, 1175, 1318.5, 1568]; for (let i = 0; i < 6; i++) { const f = P[(Math.random() * P.length) | 0]; slide(i * 0.085, f, f * (Math.random() < 0.5 ? 0.9 : 1.12), 0.075, { g: 0.1, dec: 0.04, type: 'triangle' }); } } },
    hearts:   { idle: true, play: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(i * 0.09, f, 0.4, { g: 0.08 * (1 - i * 0.12), dec: 0.14 })) },
    shy:      { idle: true, play: () => { tone(0, 900, 0.12, { g: 0.05, dec: 0.06 }); tone(0.12, 700, 0.2, { g: 0.05, dec: 0.08 }); } },
    tailChase:{ idle: true, play: () => [0, 0.24, 0.44, 0.6].forEach((o) => { const x = slide(o, 500, 1100, 0.12, { g: 0.08, dec: 0.15, a: 0.02 }); x.frequency.exponentialRampToValueAtTime(500 * pitch, ctx.currentTime + o + 0.24); }) },
    pounce:   { idle: true, play: () => { slide(0, 260, 520, 0.35, { g: 0.08, dec: 0.3, a: 0.2, type: 'triangle' }); slide(0.4, 520, 1150, 0.09, { g: 0.14, dec: 0.035 }); slide(0.55, 170, 60, 0.14, { g: 0.12, dec: 0.05 }); } },
    playBow:  { idle: true, play: () => { slide(0, 440, 880, 0.12, { g: 0.12, dec: 0.08 }); slide(0.2, 520, 1040, 0.12, { g: 0.12, dec: 0.08 }); } },
    trip:     { idle: true, play: () => {
      tone(0, 1200, 0.03, { g: 0.05, dec: 0.01 }); tone(0.12, 1000, 0.03, { g: 0.05, dec: 0.01 }); slide(0.22, 900, 400, 0.25, { g: 0.06, dec: 0.2 });
      slide(0.5, 180, 60, 0.14, { g: 0.13, dec: 0.05 }); tone(0.9, 660, 0.14, { g: 0.06, dec: 0.06 }); tone(1.03, 523, 0.2, { g: 0.06, dec: 0.08 });
    } },
    scoot:    { idle: true, play: () => { for (let i = 0; i < 6; i++) tone(i * 0.14, i % 2 ? 1200 : 1000, 0.03, { g: 0.06, dec: 0.012 }); } },
    nap:      { idle: true, play: () => S.asleep.play() },
    shake:    { idle: true, play: () => { noise(0, 0.6, 2800, 3000, { g: 0.08, dec: 0.3, a: 0.01, flutter: 18 }); tone(0.62, 1760, 0.06, { g: 0.04, dec: 0.02 }); tone(0.7, 2093, 0.06, { g: 0.03, dec: 0.02 }); } },
    groom:    { idle: true, play: () => { for (let i = 0; i < 3; i++) noise(i * 0.28, 0.18, 2200, 2000, { g: 0.05, dec: 0.08, a: 0.04 }); } },
    clap:     { idle: true, play: () => { [0, 0.16, 0.32].forEach((o) => noise(o, 0.04, 2500, 3000, { g: 0.13, dec: 0.012 })); tone(0.42, 1046.5, 0.2, { g: 0.05, dec: 0.08 }); } },
    flap:     { idle: true, play: () => { for (let i = 0; i < 5; i++) noise(i * 0.13, 0.09, 700, 900, { g: 0.09, dec: 0.04, a: 0.01 }); } },
    preen:    { idle: true, play: () => noise(0, 0.5, 3000, 3000, { g: 0.04, dec: 0.25, a: 0.05 }) },
    sing:     { idle: true, play: () => [784, 880, 1046.5, 880, 1175].forEach((f, i) => tone(i * 0.17, f, 0.2, { g: 0.09, dec: 0.1, a: 0.01, type: 'triangle' })) },
    bubbles:  { idle: true, play: () => [600, 760, 680, 880].forEach((f, i) => slide(i * 0.13, f, f * 1.8, 0.07, { g: 0.1, dec: 0.04 })) },
    dart:     { idle: true, play: () => { noise(0, 0.18, 2000, 3000, { g: 0.08, dec: 0.08, a: 0.01 }); slide(0.18, 700, 500, 0.3, { g: 0.08, dec: 0.15, a: 0.01, vib: 0.05, vibHz: 14 }); } },
    eggWobble:{ idle: true, play: () => { for (let i = 0; i < 4; i++) wood(i * 0.14, i % 2 ? 620 : 560, 0.15); } },
    eggRock:  { idle: true, play: () => { for (let i = 0; i < 4; i++) wood(i * 0.32, i % 2 ? 520 : 470, 0.13); } },
    eggHop:   { idle: true, play: () => { slide(0, 350, 700, 0.1, { g: 0.12, dec: 0.06 }); wood(0.16, 500, 0.15); } },
    eggPeek:  { idle: true, play: () => { slide(0, 520, 1150, 0.09, { g: 0.13, dec: 0.035 }); tone(0.1, 1568, 0.2, { g: 0.05, dec: 0.08 }); } },
  };

  function silent() {
    try { if (window.AndroidRelay && AndroidRelay.silent && AndroidRelay.silent()) return true; } catch {}
    try { if (window.ScribbleDevice && ScribbleDevice.silent()) return true; } catch {}
    return !!globalThis.__scribbleSilent;          // the phone is on silent / vibrate (Android app)
  }
  function play(name, arg) {
    const s = S[name];
    if (!s || !cfg.on || (s.idle && !cfg.idle) || cfg.vol <= 0 || silent()) return false;
    const c = audio();
    if (!c || c.state !== 'running') { if (c) c.resume().catch(() => {}); if (!c || c.state !== 'running') return false; }
    const t = performance.now();
    if (t - (last[name] || 0) < (s.gap || 120)) return false;
    last[name] = t;
    try { s.play(arg); } catch (e) { console.warn('[sound]', name, e); return false; }
    played.push(name); if (played.length > 30) played.shift();
    return true;
  }
  function configure(av) {
    const snd = (av && av.sound) || {};
    cfg = { on: snd.on !== false, idle: !!snd.idle, vol: snd.vol == null ? 0.6 : Math.max(0, Math.min(1, Number(snd.vol))) };
    // clay characters: the chick chirps higher, the dog is a little deeper
    pitch = (av && av.kind === 'clay' ? { fox: 1.05, cat: 1.12, dog: 0.9, chicken: 1.3, bunny: 1.2, dragon: 0.82, capybara: 0.88, wolf: 0.8, axolotl: 1.15, duck: 1.1, penguin: 1.0, unicorn: 1.18, octopus: 0.95, bee: 1.35, shark: 0.85, frog: 0.9, lamb: 1.15, panda: 0.86, owl: 0.95 }[av.clay] : PITCH[av && av.shape]) || 1;
    if (master) master.gain.setTargetAtTime(cfg.vol, ctx.currentTime, 0.05);
  }
  window.ScribbleSound = { play, configure, names: Object.keys(S), has: (n) => !!S[n], get config() { return { ...cfg, pitch }; }, get state() { return ctx ? ctx.state : 'none'; }, get played() { return played.slice(); } };
})();
