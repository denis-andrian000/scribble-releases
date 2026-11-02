// Scribble's floating buddy: a 60fps spring-physics character with a live, expressive face.
//
// Everything visual is driven from one requestAnimationFrame loop:
//   body    -> squash/stretch, tilt, skew, hop and lean springs (underdamped = jelly wobble)
//   face    -> eyes, brows, mouth, blush, sweat, dizzy spirals: each parameter is a spring
//   mood    -> an expression picked every frame from what's happening (dragging, thinking, idle…)
const S = window.scribble;
const holder = document.getElementById('holder');
const body = document.body;
const INK = '#2B2A4C';
const NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- springs
class Spring {
  constructor(x, k = 170, d = 14) { this.x = x; this.v = 0; this.t = x; this.k = k; this.d = d; }
  step(dt) { const a = -this.k * (this.x - this.t) - this.d * this.v; this.v += a * dt; this.x += this.v * dt; }
  kick(v) { this.v += v; }
}

const B = {                                // body
  sx: new Spring(1, 260, 8.5), sy: new Spring(1, 260, 8.5),
  rot: new Spring(0, 150, 9), skew: new Spring(0, 180, 10),
  tx: new Spring(0, 160, 14), ty: new Spring(0, 220, 13),
  pivot: new Spring(1, 90, 16),            // 1 = rotate around the feet, ~0.15 = hang from the top while held
  acc: new Spring(0, 70, 4.5), accY: new Spring(0, 140, 6),   // accessory jiggle
};
const F = {                                // face
  lookX: new Spring(0, 260, 26), lookY: new Spring(0, 260, 26),
  openL: new Spring(1, 900, 55), openR: new Spring(1, 900, 55),
  eyeScale: new Spring(1, 320, 18),
  joy: new Spring(0, 400, 40), squint: new Spring(0, 400, 40), dizzy: new Spring(0, 200, 30),
  browA: new Spring(0, 260, 30), browY: new Spring(0, 260, 22), browAng: new Spring(0, 260, 24), browAsym: new Spring(0, 200, 24),
  mCurve: new Spring(0.55, 300, 26), mOpen: new Spring(0, 320, 24), mWidth: new Spring(1, 300, 24), mSide: new Spring(0, 200, 24),
  blush: new Spring(0.55, 120, 20), sweat: new Spring(0, 100, 20),
};
const ALL = [...Object.values(B), ...Object.values(F)];

// ---------------------------------------------------------------- avatar + face DOM
let cfg = {};
let svg = null, faceG = null, accG = null, face = null;
let base = { curve: 0.55, open: 0, width: 1, cat: false, noMouth: false, eyes: 'shine', blush: 0.55, eyeColor: INK };
const Life = () => window.BuddyLife;      // creature behaviours (buddy-life.js)

function mk(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}

function spiralPath(r = 6.5, turns = 2.6) {
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, a = t * turns * Math.PI * 2, rr = r * t;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
  }
  return d;
}

function buildFace() {
  faceG.innerHTML = '';
  const stroke = { stroke: base.eyeColor || INK, 'stroke-width': 3.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const eyeStroke = { ...stroke, stroke: base.eyeColor || INK };
  const eye = () => {
    const g = mk('g', {}, faceG);
    return {
      ball: mk('ellipse', { fill: base.eyeColor || INK }, g),
      iris: base.big ? mk('ellipse', { fill: '#fff', opacity: 0.16 }, g) : null,   // soft glow low in the eye
      hl: mk('circle', { fill: '#fff', r: 2.4 }, g),
      hl2: base.big ? mk('circle', { fill: '#fff', opacity: 0.9 }, g) : null,
      line: mk('path', eyeStroke, g),         // closed lid / happy arc / calm arc / squint chevron
      spiral: mk('path', { ...eyeStroke, 'stroke-width': 2.2, d: spiralPath() }, g),
    };
  };
  const defs = mk('defs', {}, faceG);
  const clip = mk('clipPath', { id: 'mclip' }, defs);
  face = {
    browL: mk('path', { ...stroke, 'stroke-width': 2.6 }, faceG),
    browR: mk('path', { ...stroke, 'stroke-width': 2.6 }, faceG),
    L: eye(), R: eye(),
    glasses: base.eyes === 'glasses' ? mk('g', { fill: 'none', stroke: INK, 'stroke-width': 2.6 }, faceG) : null,
    ckL: mk('ellipse', { fill: cfg.blushColor || '#FF8A80' }, faceG),
    ckR: mk('ellipse', { fill: cfg.blushColor || '#FF8A80' }, faceG),
    freckles: cfg.freckles ? (() => { const g = mk('g', {}, faceG); g.innerHTML = window.Avatar.FRECKLES(cfg); return g; })() : null,
    mouth: mk('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, faceG),
    clipPath: mk('path', {}, clip),
    tongue: mk('ellipse', { fill: '#FF8A80', 'clip-path': 'url(#mclip)' }, faceG),
    sweat: mk('path', { fill: '#8EC5FF', stroke: '#5E9EE8', 'stroke-width': 0.8, d: 'M0 -5 Q-4 1 0 3.5 Q4 1 0 -5Z' }, faceG),
  };
  if (face.glasses) {
    mk('circle', { cx: 36, cy: 46, r: 12 }, face.glasses);
    mk('circle', { cx: 64, cy: 46, r: 12 }, face.glasses);
    mk('path', { d: 'M48 45 q2 -3 4 0' }, face.glasses);
  }
}

function render(c) {
  cfg = c || {};
  holder.innerHTML = window.Avatar.build(cfg, { live: true });
  svg = holder.querySelector('#buddy');
  faceG = holder.querySelector('#face');
  accG = holder.querySelector('#acc');
  svg.style.transformOrigin = '0 0';
  const fb = { mouth: cfg.mouth, eyes: cfg.eyes, eyeColor: window.Avatar.faceInk ? window.Avatar.faceInk(cfg) : (cfg.eyeColor || INK) };
  const m = { smile: [0.55, 0, 1], grin: [0.85, 0.5, 1.05], cat: [0.6, 0, 1], flat: [0, 0, 0.85], o: [0, 0.55, 0.55], none: [0.4, 0, 1] }[fb.mouth] || [0.55, 0, 1];
  base = {
    curve: m[0], open: m[1], width: m[2],
    cat: fb.mouth === 'cat', noMouth: fb.mouth === 'none',
    eyes: fb.eyes || 'shine', eyeColor: fb.eyeColor || INK, big: fb.eyes === 'sparkle',
    blush: cfg.cheeks === false ? 0 : 0.55,
  };
  // the character pictures have their own faces, so the drawn face is only for classic buddies
  const showFace = cfg.shape !== 'image' || cfg.faceOnImage;
  if (faceG && showFace) buildFace(); else face = null;
  Life()?.onRender(cfg, svg);
  document.title = cfg.name || 'Scribble';
}

// ---------------------------------------------------------------- what's going on (inputs)
const now = () => performance.now();
const st = {
  ext: 'idle', extUntil: 0,          // from the app: thinking, asking, happy, sad
  held: false, pressed: false, hover: false, falling: false,
  vx: 0, vy: 0,                      // window velocity (px/s) while dragged or falling
  shake: 0, lastDir: 0, dizzyUntil: 0,
  surpriseUntil: 0, phewUntil: 0, giggleUntil: 0,
  cursor: { dx: 0, dy: 0, dist: 999, panelDx: 0, panelDy: 0, panelOpen: false },
  lastActivity: now(), lastCursorMove: now(),
  typingUntil: 0, nextNod: 0,
  glance: null, nextGlance: now() + 4000,
  nextBlink: now() + 2500, blinkUntil: 0, doubleBlink: false,
  asleep: false,
  yawnUntil: 0, nextYawn: 0,
  alertUntil: 0, nextAlertHop: 0,
};
const snd = (name, arg) => { try { window.ScribbleSound?.play(name, arg); } catch {} };
const activity = () => {
  Life()?.onActivity();
  if (st.asleep) { snd('wake'); st.asleep = false; st.surpriseUntil = now() + 650; B.ty.kick(-140); B.sy.kick(2.2); }
  st.lastActivity = now();
};

S.onState((s) => {
  const t = now();
  if (s === 'falling') { if (!st.falling) snd('falling'); st.falling = true; return; }
  if (s === 'landed') { st.falling = false; st.vy = 0; return; }
  if (s === 'land') return;                       // impacts come through onLand with their speed
  st.falling = false;
  Life()?.interrupt();
  if (s === 'clipped') {
    snd('clipped');
    B.ty.kick(-200); B.sy.kick(2); st.giggleUntil = t + 900;
    body.classList.remove('clip'); void body.offsetWidth; body.classList.add('clip');
    setTimeout(() => body.classList.remove('clip'), 1400);
    activity();
    return;
  }
  if (s === 'alert') {
    snd('alert');
    st.alertUntil = t + 120000;            // keeps waving until you click it (max 2 minutes)
    B.ty.kick(-260); B.sy.kick(2.6);
    body.classList.add('alert');
    setTimeout(() => { if (now() > st.alertUntil - 50) body.classList.remove('alert'); }, 120000);
    activity();
    return;
  }
  const wasWorking = st.ext === 'thinking';
  if (s === 'happy') { snd('saved'); st.ext = 'happy'; st.extUntil = t + 1400; B.ty.kick(-260); B.sy.kick(2.5); B.sx.kick(-1.5); sparkle(); }
  else if (s === 'sad') { snd('sad'); st.ext = 'sad'; st.extUntil = t + 2600; }
  else if (s === 'thinking' || s === 'asking') { if (st.ext !== s) snd(s); st.ext = s; st.extUntil = Infinity; if (s === 'asking') { B.rot.kick(-60); B.ty.kick(-120); } }
  else { if (wasWorking) snd('reply'); if (st.ext === 'thinking' || st.ext === 'asking') st.ext = 'idle'; }
  body.classList.toggle('thinking', st.ext === 'thinking');
  body.classList.toggle('asking', st.ext === 'asking');
  activity();
});

S.onMotion((m) => {
  st.vx = m.vx; st.vy = m.vy;
  if (st.held && Math.abs(m.vx) > 500) {             // count left/right reversals to detect shaking
    const dir = Math.sign(m.vx);
    if (dir && dir !== st.lastDir) { st.shake += 1; st.lastDir = dir; }
  }
});
S.onLand((impact) => {
  const k = Math.min(1, impact / 1400);
  snd('land', k);
  if (k > 0.35) setTimeout(() => snd('phew'), 450);
  B.sy.kick(-4.2 * k); B.sx.kick(3.4 * k); B.ty.kick(40 * k);
  if (k > 0.35) st.phewUntil = now() + 900;
});
S.onCursor((c) => {
  const moved = Math.abs(c.dx - st.cursor.dx) + Math.abs(c.dy - st.cursor.dy) > 3;
  st.cursor = c;
  if (moved) { st.lastCursorMove = now(); if (c.dist < 600) activity(); else st.lastActivity = Math.max(st.lastActivity, now() - 50000); }
});
S.onTyping(() => {
  st.typingUntil = now() + 1600;
  activity();
  if (now() > st.nextNod) { B.ty.kick(-70); B.rot.kick(10); st.nextNod = now() + 380; }
});
S.onPanel((open) => {
  body.classList.toggle('open', open); activity();
  if (open) { B.sy.kick(1.6); B.ty.kick(-90); st.alertUntil = 0; body.classList.remove('alert'); }
});
// Android: docked on a side of the screen, some buddies hang on to it like a tree
if (S.onEdge) S.onEdge((side) => {
  body.classList.toggle('cling-left', side === 'left');
  body.classList.toggle('cling-right', side === 'right');
  if (side && document.querySelector('#buddy[data-cling]')) snd('cling');
});
S.onAvatar((a) => { window.ScribbleSound?.configure(a); render(a); B.sy.kick(3); B.ty.kick(-150); Life()?.afterAvatar(); });

// pointer: press, drag, click, hover
// (the gesture steps are also exposed on window.__buddy.input, so the Android floating buddy can drive them from native touch)
let squishTimer = 0;
function pressStart() { dragging = false; st.pressed = true; activity(); clearTimeout(squishTimer); squishTimer = setTimeout(() => { if (st.pressed && !dragging) snd('squish'); }, 380); }
function dragBegin() {
  dragging = true;
  clearTimeout(squishTimer); snd('pickup');
  st.held = true; st.pressed = false; st.shake = 0; st.lastDir = 0;
  Life()?.interrupt();
  body.classList.add('held');
}
function dragFinish() {
  body.classList.remove('held');
  st.held = false; st.pressed = false;
  if (st.shake >= 6) { st.dizzyUntil = now() + 2200; B.rot.kick(160); snd('dizzy'); }
}
function tapped() {
  // a click: boing, then a happy blink
  clearTimeout(squishTimer); snd('tap');
  B.sy.kick(-3.4); B.sx.kick(2.8); B.ty.kick(30);
  st.giggleUntil = now() + 700;
  st.alertUntil = 0; body.classList.remove('alert');
  st.pressed = false;
  wave();
  Life()?.onClick();
}
let waveTimer = 0;
function wave() {
  body.classList.remove('wave'); void body.offsetWidth; body.classList.add('wave');
  clearTimeout(waveTimer); waveTimer = setTimeout(() => body.classList.remove('wave'), 1700);
}
let start = null, dragging = false;
holder.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  holder.setPointerCapture(e.pointerId);
  start = { x: e.screenX, y: e.screenY };
  pressStart();
});
holder.addEventListener('pointermove', (e) => {
  if (!start) return;
  if (!dragging && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 4) {
    dragBegin();
    S.dragStart();
  }
});
holder.addEventListener('pointerup', (e) => {
  if (!start) return;
  holder.releasePointerCapture(e.pointerId);
  if (dragging) { dragFinish(); S.dragEnd(); }
  else { tapped(); S.click(); }
  st.pressed = false;
  start = null; dragging = false;
});
holder.addEventListener('pointerenter', () => { snd('hover'); st.hover = true; activity(); B.sy.kick(1.2); });
holder.addEventListener('pointerleave', () => { st.hover = false; });
holder.addEventListener('contextmenu', (e) => { e.preventDefault(); S.menu(); });

function sparkle() {
  body.classList.remove('happy'); void body.offsetWidth; body.classList.add('happy');
  setTimeout(() => body.classList.remove('happy'), 1100);
}

// ---------------------------------------------------------------- expressions
//   joy: ^ ^ eyes · squint: > < eyes · dizzy: @ @ eyes · brows only show when they mean something
const EXPR = {
  neutral:   {},
  curious:   { eyeScale: 1.1, mCurve: 0.75, mOpen: 0.12, blush: 0.85 },
  attentive: { eyeScale: 1.06, mCurve: 0.65, blush: 0.7 },
  giggle:    { joy: 1, mCurve: 1, mOpen: 0.45, blush: 1 },
  happy:     { joy: 1, mCurve: 1, mOpen: 0.6, mWidth: 1.15, blush: 1 },
  surprised: { eyeScale: 1.3, browA: 1, browY: 1, mCurve: 0, mOpen: 0.85, mWidth: 0.6 },
  whee:      { eyeScale: 1.22, browA: 1, browY: 0.9, mCurve: 0.5, mOpen: 0.85, mWidth: 0.95, blush: 0.9 },
  falling:   { eyeScale: 1.32, browA: 1, browY: 1.1, mCurve: -0.1, mOpen: 1, mWidth: 0.7 },
  phew:      { joy: 0.6, mCurve: 0.5, mOpen: 0.2, sweat: 1 },
  pressed:   { squint: 1, mCurve: 0.7, mOpen: 0.35, mWidth: 0.9, blush: 1 },
  thinking:  { browA: 1, browY: 0.3, browAsym: 1, mCurve: -0.1, mOpen: 0, mWidth: 0.55, mSide: 4 },
  asking:    { eyeScale: 1.1, browA: 1, browY: 0.9, browAng: -0.3, mCurve: 0.1, mOpen: 0.35, mWidth: 0.5 },
  sad:       { eyeScale: 0.92, browA: 1, browY: 0.1, browAng: -1, mCurve: -0.8, mOpen: 0, sweat: 1, blush: 0.15 },
  dizzy:     { dizzy: 1, mCurve: -0.3, mOpen: 0.3, mWidth: 0.75, blush: 0.4 },
  alert:     { eyeScale: 1.2, browA: 1, browY: 1, mCurve: 0.2, mOpen: 0.55, mWidth: 0.6, blush: 0.8 },
  sleepy:    { mCurve: 0.15, mOpen: 0.12, mWidth: 0.55, blush: 0.5 },
  yawn:      { squint: 0.9, mCurve: 0, mOpen: 1, mWidth: 0.72, blush: 0.6 },
  asleep:    { mCurve: 0, mOpen: 0.25, mWidth: 0.45, blush: 0.6 },
};

function pickMood(t) {
  if (t > st.extUntil && (st.ext === 'happy' || st.ext === 'sad')) st.ext = 'idle';
  if (t < st.dizzyUntil) return 'dizzy';
  if (st.held) return st.shake >= 6 ? 'dizzy' : 'whee';
  if (st.falling) return 'falling';
  if (st.pressed) return 'pressed';
  if (st.ext === 'happy' || st.ext === 'sad' || st.ext === 'thinking' || st.ext === 'asking') return st.ext;
  if (t < st.alertUntil) {
    if (t > st.nextAlertHop) { B.ty.kick(-180); B.sy.kick(1.6); st.nextAlertHop = t + 1400; }
    return 'alert';
  }
  if (t < st.surpriseUntil) return 'surprised';
  if (t < st.phewUntil) return 'phew';
  if (t < st.giggleUntil) return 'giggle';
  const lm = Life()?.mood(t);
  if (lm) return lm;
  if (st.hover) return 'curious';
  if (t < st.typingUntil || st.cursor.panelOpen) return 'attentive';
  const idle = t - st.lastActivity;
  if (idle > 150000) { if (!st.asleep) snd('asleep'); st.asleep = true; return 'asleep'; }
  if (idle > 60000) {
    // now and then a big stretch-and-yawn
    if (t > st.nextYawn) { st.yawnUntil = t + 2600; st.nextYawn = t + 30000; snd('yawn'); }
    return t < st.yawnUntil ? 'yawn' : 'sleepy';
  }
  if (st.cursor.dist < 170) return 'curious';
  return 'neutral';
}

function setTargets(mood, t) {
  const e = EXPR[mood];
  const def = {
    eyeScale: 1, joy: base.eyes === 'happy' ? 1 : 0, squint: 0, dizzy: 0,
    browA: 0, browY: 0, browAng: 0, browAsym: 0,
    mCurve: base.curve, mOpen: base.open, mWidth: base.width, mSide: 0,
    blush: base.blush, sweat: 0,
  };
  for (const k of Object.keys(def)) {
    let v = e[k] ?? def[k];
    if (k === 'blush' && base.blush === 0) v = mood === 'happy' || mood === 'giggle' || mood === 'pressed' ? 0.5 : 0;
    F[k].t = v;
  }

  // eyelids: blinking, drowsiness, sleep
  let open = 1;
  if (mood === 'sleepy') open = 0.38 + 0.08 * Math.sin(t / 900);
  if (mood === 'asleep') open = 0.02;
  if (t > st.nextBlink && !['asleep', 'dizzy', 'happy', 'giggle', 'pressed'].includes(mood)) {
    st.blinkUntil = t + (mood === 'sleepy' ? 260 : 110);
    st.doubleBlink = Math.random() < 0.22;
    st.nextBlink = t + (st.doubleBlink ? 260 : 1800 + Math.random() * 4200);
  }
  if (t < st.blinkUntil) open = 0;
  F.openL.t = open;
  F.openR.t = base.eyes === 'wink' && !['surprised', 'whee', 'falling'].includes(mood) ? 0 : open;

  // where to look
  let lx = 0, ly = 0;
  const c = st.cursor;
  if (mood === 'thinking') { lx = 0.55 + 0.25 * Math.sin(t / 700); ly = -0.85; }
  else if (mood === 'asleep') { lx = 0; ly = 0.2; }
  else if (st.held || st.falling) { lx = Math.max(-1, Math.min(1, st.vx / 900)); ly = Math.max(-1, Math.min(1, st.vy / 900)); }
  else if (t < st.typingUntil && c.panelOpen) { lx = norm(c.panelDx); ly = norm(c.panelDy); }
  else {
    lx = norm(c.dx); ly = norm(c.dy);
    // cursor parked for a while: look around on our own now and then
    if (t - st.lastCursorMove > 3500 && !st.hover) {
      if (t > st.nextGlance) {
        st.glance = { x: Math.random() * 2 - 1, y: Math.random() * 1.2 - 0.7, until: t + 700 + Math.random() * 900 };
        st.nextGlance = t + 2500 + Math.random() * 4000;
      }
      if (st.glance && t < st.glance.until) { lx = st.glance.x; ly = st.glance.y; }
    }
  }
  F.lookX.t = lx; F.lookY.t = ly;

  // body pose
  const lean = st.hover ? F.lookX.x : 0;
  B.tx.t = lean * 2.5;
  B.pivot.t = st.held ? 0.12 : 1;
  if (st.held) {
    B.rot.t = clamp(-st.vx * 0.022, -28, 28);           // dangles behind the direction you drag
    B.skew.t = clamp(st.vx * 0.006, -10, 10);
    const sp = Math.min(Math.hypot(st.vx, st.vy) * 0.00022, 0.22);
    B.sy.t = 1 + sp * (Math.abs(st.vy) > Math.abs(st.vx) ? 1 : -0.4);
    B.sx.t = 1 + sp * (Math.abs(st.vx) >= Math.abs(st.vy) ? 0.6 : -0.5);
  } else if (st.falling) {
    B.rot.t = 0; B.skew.t = 0;
    const sp = Math.min(st.vy * 0.00025, 0.25);
    B.sy.t = 1 + sp; B.sx.t = 1 - sp * 0.6;
  } else {
    let rot = lean * 4;
    if (mood === 'thinking') rot += Math.sin(t / 650) * 5;
    if (mood === 'asking') rot -= 9;
    if (mood === 'dizzy') rot += Math.sin(t / 120) * 7;
    if (mood === 'sad') rot += 0;
    B.rot.t = rot;
    B.skew.t = 0;
    B.sy.t = mood === 'pressed' ? 0.86 : mood === 'sad' ? 0.95 : 1;
    B.sx.t = mood === 'pressed' ? 1.1 : 1;
  }
  B.ty.t = mood === 'sad' ? 2.5 : 0;
  body.classList.toggle('zzz', mood === 'asleep');
  body.classList.toggle('mood-yawn', mood === 'yawn');
  body.classList.toggle('mood-happy', mood === 'happy');
  body.classList.toggle('mood-thinking', mood === 'thinking');
  return mood;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (d) => clamp(d / 260, -1, 1);

// ---------------------------------------------------------------- per-frame drawing
function drawFace(t, mood) {
  if (!face) return;
  const lx = F.lookX.x, ly = F.lookY.x;
  faceG.setAttribute('transform', `translate(${(lx * 2.4).toFixed(2)} ${(ly * 1.8).toFixed(2)})`);
  const sc = F.eyeScale.x;
  const style = base.eyes;
  const shiny = style === 'shine' || style === 'glasses' || style === 'wink' || style === 'sparkle' || style === 'round';
  const R = style === 'dots' ? 4.6 : style === 'round' ? 6 : base.big ? 8.2 : 7, RY = style === 'dots' ? 4.6 : style === 'round' ? 6 : base.big ? 9.8 : 8.5;
  const wide = F.eyeScale.t > 1.15;     // surprise etc. overrides drawn-on eye styles
  if (face.glasses) face.glasses.setAttribute('transform', `translate(${(lx * 1.6).toFixed(2)} ${(ly * 1.6).toFixed(2)})`);

  const ex = base.big ? 15 : 14, ey = base.big ? 47 : 46;
  [['L', 50 - ex, F.openL.x], ['R', 50 + ex, F.openR.x]].forEach(([side, cx, open]) => {
    const e = face[side];
    const ox = cx + lx * 1.6, oy = ey + ly * 1.6;
    let mode = 'ball';
    if (F.dizzy.x > 0.5) mode = 'spiral';
    else if (F.squint.x > 0.5) mode = 'squint';
    else if (F.joy.x > 0.5 && !wide) mode = 'joy';
    else if (style === 'sleepy' && !wide) mode = 'calm';
    else if (open < 0.16) mode = 'closed';

    e.ball.style.display = mode === 'ball' ? '' : 'none';
    e.hl.style.display = mode === 'ball' && shiny && open > 0.45 ? '' : 'none';
    if (e.hl2) e.hl2.style.display = e.hl.style.display;
    if (e.iris) e.iris.style.display = mode === 'ball' && open > 0.45 ? '' : 'none';
    e.spiral.style.display = mode === 'spiral' ? '' : 'none';
    e.line.style.display = ['joy', 'calm', 'closed', 'squint'].includes(mode) ? '' : 'none';

    if (mode === 'ball') {
      e.ball.setAttribute('cx', ox.toFixed(2)); e.ball.setAttribute('cy', oy.toFixed(2));
      e.ball.setAttribute('rx', (R * sc).toFixed(2)); e.ball.setAttribute('ry', (RY * sc * Math.max(0.12, open)).toFixed(2));
      e.hl.setAttribute('cx', (ox + 2 - lx * 0.9).toFixed(2)); e.hl.setAttribute('cy', (oy - 3 * open).toFixed(2));
      e.hl.setAttribute('r', ((base.big ? 3.1 : 2.4) * sc).toFixed(2));
      if (base.big) {
        e.hl.setAttribute('cx', (ox + 2.6 - lx * 0.9).toFixed(2)); e.hl.setAttribute('cy', (oy - 3.8 * open).toFixed(2));
        e.hl2.setAttribute('cx', (ox - 2.6 - lx * 0.5).toFixed(2)); e.hl2.setAttribute('cy', (oy + 4.4 * open).toFixed(2));
        e.hl2.setAttribute('r', (1.4 * sc).toFixed(2));
        e.iris.setAttribute('cx', ox.toFixed(2)); e.iris.setAttribute('cy', (oy + 2.5 * open).toFixed(2));
        e.iris.setAttribute('rx', (5.6 * sc).toFixed(2)); e.iris.setAttribute('ry', (5 * sc * Math.max(0.12, open)).toFixed(2));
      }
    } else if (mode === 'spiral') {
      e.spiral.setAttribute('transform', `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) rotate(${((t / 3) % 360) * (side === 'L' ? 1 : -1)})`);
    } else {
      let d;
      if (mode === 'joy') d = `M${ox - 7} ${oy + 3} q7 -10 14 0`;
      else if (mode === 'calm') d = `M${ox - 7} ${oy - 1} q7 7 14 0`;
      else if (mode === 'squint') d = side === 'L' ? `M${ox - 5} ${oy - 5} l9 5 l-9 5` : `M${ox + 5} ${oy - 5} l-9 5 l9 5`;
      else d = `M${ox - 7} ${oy + 1} q7 3 14 0`;
      e.line.setAttribute('d', d);
    }
  });

  // brows
  const ba = F.browA.x;
  [['browL', 36, 1], ['browR', 64, -1]].forEach(([k, cx, dir]) => {
    const el = face[k];
    el.style.opacity = clamp(ba, 0, 1).toFixed(2);
    if (ba < 0.02) return;
    const y = 46 - 13.5 * Math.max(1, sc * 0.95) - F.browY.x * 4 - (dir === 1 ? F.browAsym.x * 3.5 : 0) + ly * 1.2;
    const inner = y + F.browAng.x * 3, outer = y - F.browAng.x * 1.2;
    const x1 = cx - 6 * dir, x2 = cx + 6 * dir;   // outer → inner
    el.setAttribute('d', `M${(x1 + lx * 1.6).toFixed(2)} ${outer.toFixed(2)} Q${(cx + lx * 1.6).toFixed(2)} ${(Math.min(inner, outer) - 1.6).toFixed(2)} ${(x2 + lx * 1.6).toFixed(2)} ${inner.toFixed(2)}`);
  });

  // cheeks
  const bl = clamp(F.blush.x, 0, 1);
  const ck = base.big ? 1.3 : 1;
  for (const [k, cx] of [['ckL', base.big ? 23 : 25], ['ckR', base.big ? 77 : 75]]) {
    face[k].setAttribute('cx', cx); face[k].setAttribute('cy', base.big ? 59 : 58);
    face[k].setAttribute('rx', ((4.5 + bl * 1.5) * ck).toFixed(2)); face[k].setAttribute('ry', ((2.6 + bl * 0.8) * ck).toFixed(2));
    face[k].style.opacity = (bl * 0.62).toFixed(2);
  }

  // mouth
  const c = F.mCurve.x, o = Math.max(0, F.mOpen.x), w = F.mWidth.x;
  const mx = 50 + F.mSide.x, y0 = 60, half = 6 * w;
  const m = face.mouth;
  const hideMouth = base.noMouth && o < 0.3;
  m.style.display = hideMouth ? 'none' : '';
  face.tongue.style.display = 'none';
  if (!hideMouth) {
    if (base.cat && o < 0.15 && c > 0.25 && Math.abs(F.mSide.x) < 1) {
      m.setAttribute('d', `M${mx - 8} ${y0 - 2} q4 ${3 + c * 3} 8 0 q4 ${3 + c * 3} 8 0`);
      m.setAttribute('fill', 'none'); m.setAttribute('stroke', base.eyeColor || INK); m.setAttribute('stroke-width', 2.8);
    } else if (o < 0.08) {
      m.setAttribute('d', `M${(mx - half).toFixed(2)} ${y0} Q${mx.toFixed(2)} ${(y0 + c * 8).toFixed(2)} ${(mx + half).toFixed(2)} ${y0}`);
      m.setAttribute('fill', 'none'); m.setAttribute('stroke', base.eyeColor || INK); m.setAttribute('stroke-width', 3);
    } else {
      const top = y0 - o * 1.5 + c * 1.5, ctrlTop = top + c * 4;
      const ctrlBot = Math.max(ctrlTop + 3, top + c * 7 + o * 12);
      const d = `M${(mx - half).toFixed(2)} ${top.toFixed(2)} Q${mx.toFixed(2)} ${ctrlTop.toFixed(2)} ${(mx + half).toFixed(2)} ${top.toFixed(2)} Q${mx.toFixed(2)} ${ctrlBot.toFixed(2)} ${(mx - half).toFixed(2)} ${top.toFixed(2)}Z`;
      m.setAttribute('d', d);
      m.setAttribute('fill', base.eyeColor || INK); m.setAttribute('stroke', base.eyeColor || INK); m.setAttribute('stroke-width', 1.6);
      face.clipPath.setAttribute('d', d);
      if (o > 0.3 && c > -0.2) {
        face.tongue.style.display = '';
        face.tongue.setAttribute('cx', mx.toFixed(2));
        face.tongue.setAttribute('cy', ((top + ctrlBot) / 2 + o * 3.5).toFixed(2));
        face.tongue.setAttribute('rx', (half * 0.6).toFixed(2));
        face.tongue.setAttribute('ry', (o * 3.2).toFixed(2));
      }
    }
  }

  // nervous sweat drop slides down
  const sw = clamp(F.sweat.x, 0, 1);
  face.sweat.style.opacity = sw.toFixed(2);
  if (sw > 0.02) face.sweat.setAttribute('transform', `translate(80 ${(26 + ((t / 90) % 14)).toFixed(2)}) scale(${(0.8 + sw * 0.4).toFixed(2)})`);
}

// ---------------------------------------------------------------- the loop
let last = now(), prevRot = 0, prevTy = 0, frames = 0, fpsT = now();
window.__fps = 0;

function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const mood = setTargets(pickMood(t), t);
  Life()?.update(t, dt, mood);

  // fixed sub-steps keep stiff springs stable at any frame rate
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) for (const s of ALL) s.step(h);

  // accessory lags behind the body's motion
  const dRot = B.rot.x - prevRot, dTy = B.ty.x - prevTy;
  prevRot = B.rot.x; prevTy = B.ty.x;
  B.acc.kick(-dRot * 9 - (B.sx.v - B.sy.v) * 0.6);
  B.accY.kick(-dTy * 7);

  if (svg) {
    // breathing (slower and deeper when asleep)
    const slow = mood === 'asleep' ? 2.2 : 1;
    const br = Math.sin((t / 1000) * (Math.PI * 2) / (3.2 * slow));
    const amp = st.held || st.falling ? 0.2 : mood === 'asleep' ? 1.4 : 1;
    const W = holder.clientWidth || 76;
    const k = W / 76;                                    // springs are tuned in 76px units
    const px = W / 2, py = clamp(B.pivot.x, 0.05, 1) * W;
    const sx = B.sx.x * (1 - br * 0.009 * amp), sy = B.sy.x * (1 + br * 0.016 * amp);
    const ty = (B.ty.x + br * -1.8 * amp) * k;
    svg.style.transform =
      `translate(${(B.tx.x * k).toFixed(2)}px, ${ty.toFixed(2)}px) translate(${px}px, ${py.toFixed(2)}px) ` +
      `rotate(${B.rot.x.toFixed(2)}deg) skewX(${B.skew.x.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) ` +
      `translate(${-px}px, ${(-py).toFixed(2)}px)`;
    if (accG) accG.setAttribute('transform', `rotate(${clamp(B.acc.x, -25, 25).toFixed(2)} 50 40) translate(0 ${clamp(B.accY.x * 0.15, -4, 4).toFixed(2)})`);
    drawFace(t, mood);
    Life()?.draw(t, dt, mood);
  }

  frames++;
  if (t - fpsT >= 1000) { window.__fps = frames; frames = 0; fpsT = t; }
  requestAnimationFrame(frame);
}

// handy for debugging from devtools
window.__buddy = { st, B, F, input: { press: pressStart, dragStart: dragBegin, dragEnd: () => { dragFinish(); dragging = false; }, click: () => { tapped(); dragging = false; }, cancel: () => { st.pressed = false; dragging = false; } } };

S.getAvatar().then((a) => { window.ScribbleSound?.configure(a); render(a); requestAnimationFrame(frame); });
