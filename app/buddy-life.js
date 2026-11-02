// Creature life: what the buddy does on its own, and how its body parts move.
//
// Loaded after buddy.js and uses its springs (B body, F face), state (st) and expressions (EXPR).
//   parts   -> tail wag, ear twitch/flop, wing flap, fin flutter, paw moves, egg wobble (spring-driven, every frame)
//   actions -> little idle performances (hop, sneeze, peekaboo, tail chase, nap…) picked by temperament
//   morph   -> hatching out of the egg and growing up
// Everything is tuned to feel like a ~1-year-old: wobbly balance, short attention span, clumsy, easily delighted.
(function () {
    const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const bell = (p, a, b) => (p <= a || p >= b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));   // 0→1→0 between a and b
  const between = (p, a, b) => p >= a && p < b;

  // ------------------------------------------------------------------ extra expressions
  Object.assign(EXPR, {
    yawn:      { mCurve: 0, mOpen: 1, mWidth: 0.75, blush: 0.6 },
    stretch:   { joy: 1, mCurve: 0.3, mOpen: 0.4, mWidth: 0.7, blush: 0.8 },
    presneeze: { browA: 0.8, browY: 0.6, browAng: -0.4, mCurve: 0, mOpen: 0.3, mWidth: 0.45, blush: 0.9 },
    sniff:     { eyeScale: 1.05, mCurve: 0.4, mOpen: 0, mWidth: 0.6, blush: 0.7 },
    focus:     { eyeScale: 1.18, browA: 0.7, browY: 0.2, browAng: 0.5, mCurve: 0.3, mOpen: 0, mWidth: 0.6 },
    babble:    { eyeScale: 1.05, mCurve: 0.8, mOpen: 0.3, blush: 0.9 },
    love:      { joy: 1, mCurve: 1, mOpen: 0.3, blush: 1 },
    shy:       { joy: 0.6, mCurve: 0.6, mOpen: 0, mWidth: 0.6, blush: 1 },
    content:   { joy: 1, mCurve: 0.8, mOpen: 0, blush: 0.85 },
    bubble:    { eyeScale: 1.1, mCurve: 0, mOpen: 0.5, mWidth: 0.45, blush: 0.7 },
  });

  // ------------------------------------------------------------------ part springs
  const P = {
    tail: new Spring(0, 90, 6),            // lag from body motion
    tailAmp: new Spring(8, 40, 12),        // wag amplitude (deg)
    tailFreq: new Spring(0.6, 30, 12),     // wag speed (Hz)
    tailBase: new Spring(0, 60, 12),       // droop / perk offset
    ear: new Spring(0, 160, 7),            // both ears splaying (bounces)
    earSw: new Spring(0, 140, 7),          // both ears swinging (body rotation)
    twL: new Spring(0, 420, 14), twR: new Spring(0, 420, 14),   // single-ear twitches
    earPerk: new Spring(0, 80, 14),
    flapAmp: new Spring(0, 60, 12), flapFreq: new Spring(6, 30, 12), wingRest: new Spring(0, 90, 12),
    finAmp: new Spring(14, 40, 12), finFreq: new Spring(2.4, 30, 12),
    egg: new Spring(0, 150, 4.2),
    pawLx: new Spring(0, 140, 14), pawLy: new Spring(0, 140, 14), pawLr: new Spring(0, 160, 12),
    pawRx: new Spring(0, 140, 14), pawRy: new Spring(0, 140, 14), pawRr: new Spring(0, 160, 12),
    faceHide: new Spring(1, 300, 30),
  };
  ALL.push(...Object.values(P));

  let parts = {}, faceWrap = null, faceC = { x: 50, y: 52, s: 0.6 };
  let info = { creature: false, species: null, stage: 'egg', ears: null, temper: 'playful' };
  const phase = { tail: 0, flap: 0, fin: 0 };

  function onRender(c, svgEl) {
    parts = {};
    svgEl.querySelectorAll('[data-part]').forEach((g) => {
      parts[g.dataset.part] = { el: g, px: +g.dataset.px || 50, py: +g.dataset.py || 50, next: g.nextSibling, parent: g.parentNode };
    });
    pawsUp = false;
    sprite = svgEl.querySelector('#sprite');
    spriteWrap = svgEl.querySelector('#spriteWrap');
    spriteView = 'front';

    faceWrap = svgEl.querySelector('#faceWrap');
    const m = faceWrap && /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(faceWrap.getAttribute('transform') || '');
    faceC = m ? { x: +m[1], y: +m[2], s: +m[3] } : { x: 50, y: 52, s: 1 };
    if (faceWrap) faceWrap.dataset.base = faceWrap.getAttribute('transform') || '';
    const isC = false;
    const o = {};
    info = {
      creature: isC,
      species: isC ? c.species || null : null,
      stage: 'adult',
      ears: o.ears || null,
      temper: c.temperament || 'playful',
    };
    // a new body: clear any half-finished action so nothing references old parts
    if (act && !act.keepOnRender) endAction();
  }
  // ---- picture characters: which pose/expression to show
  let sprite = null, spriteWrap = null, spriteView = 'front';
  const MOODSET = {
    excited: ['happy', 'whee', 'babble', 'alert', 'surprised', 'falling', 'bubble', 'attentive'],
    glad: ['giggle', 'content', 'stretch', 'shy', 'pressed', 'phew'],
    love: ['love'],
    closed: ['asleep', 'sleepy', 'yawn'],
  };
  const FACES = {         // which of each animal's three expression pictures fits which feeling
    cat: { excited: 'happy', glad: 'joy', closed: 'wink', love: 'joy' },
    dog: { excited: 'happy', glad: 'joy', closed: 'wink', love: 'joy' },
    otter: { excited: 'joy', glad: 'happy', closed: 'happy', love: 'wink' },
    fish: { excited: 'happy', glad: 'joy', closed: 'joy', love: 'wink' },
    bird: { excited: 'joy', glad: 'wink', closed: 'wink', love: 'happy' },
  };
  const SIDE_ACTIONS = ['lookAround', 'sniff', 'scoot', 'pounce', 'dart', 'trip', 'shy'];
  function drawSprite(t, m) {
    const s = sprite.dataset.species;
    const sx = B.sx.x;
    let view = 'front', mirror = 1;
    if (sx < -0.45) view = 'back';
    else if (Math.abs(sx) < 0.45) view = 'side';               // mid-turn
    else if (act && SIDE_ACTIONS.includes(act.name) && Math.abs(F.lookX.x) > 0.5) { view = 'side'; mirror = F.lookX.x > 0 ? -1 : 1; }
    if (view === 'front') {
      const fc = FACES[s] || FACES.cat;
      const k = Object.keys(MOODSET).find((g) => MOODSET[g].includes(m));
      if (k) view = fc[k];
      else if (t < st.blinkUntil) view = fc.closed;
    }
    if (view !== spriteView) {
      spriteView = view;
      void s;
    }
    // the picture never gets paper-thin while turning: undo most of the horizontal squeeze
    const a = Math.abs(sx);
    const comp = Math.max(a, 0.82) / Math.max(a, 0.05);
    spriteWrap.setAttribute('transform', `translate(50 0) scale(${(mirror * comp).toFixed(3)} 1) translate(-50 0)`);
  }
  const hatchK = () => clamp(cfg.hatch || 0, 0, 1);       // how close the egg is to hatching (0..1)
  const isEgg = () => false;
  const land = () => false;
  const sp = () => (info.creature ? 'robot' : 'classic');
  // how "baby" the movement is: babies are wobblier and more excitable than grown-ups
  const babyness = () => ({ egg: 1, baby: 1, juve: 0.75, adult: 0.5 }[info.stage] ?? 0.8);

  // ------------------------------------------------------------------ bubbles, particles
  const sayEl = document.getElementById('say');
  let sayTimer = null;
  function say(text, ms = 1500) {
    if (!sayEl || !text) return;
    sayEl.textContent = text;
    sayEl.classList.remove('on'); void sayEl.offsetWidth; sayEl.classList.add('on');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => sayEl.classList.remove('on'), ms);
  }
  // x/y in the creature's own 0..100 box, converted to window pixels
  function toWin(x, y) {
    const r = holder.getBoundingClientRect();
    return { x: r.left + (x / 100) * r.width, y: r.top + (y / 100) * r.height };
  }
  function particle(kind, x, y, opts = {}) {
    const n = document.createElement('div');
    n.className = `pt ${kind}`;
    n.textContent = { heart: '♥', note: pick(['♪', '♫']), star: pick(['✦', '✧']), sweat: '💧', q: '?', bang: '!', puff: '', bubble: '', z: 'z' }[kind] ?? '';
    const p = toWin(x, y);
    n.style.left = `${p.x}px`; n.style.top = `${p.y}px`;
    n.style.setProperty('--dx', `${opts.dx ?? rnd(-14, 14)}px`);
    n.style.setProperty('--dy', `${opts.dy ?? rnd(-40, -26)}px`);
    if (opts.size) n.style.setProperty('--s', opts.size);
    if (opts.delay) n.style.animationDelay = `${opts.delay}ms`;
    document.body.append(n);
    setTimeout(() => n.remove(), 2200 + (opts.delay || 0));
  }
  const mouthPos = () => ({ x: faceC.x, y: faceC.y + 8 * faceC.s });
  const headTop = () => ({ x: faceC.x, y: faceC.y - 28 * faceC.s });
  function hearts(n = 3) { const h = headTop(); for (let i = 0; i < n; i++) particle('heart', h.x + rnd(-14, 14), h.y + rnd(-2, 8), { delay: i * 220 }); }
  function puff(n = 3) { for (let i = 0; i < n; i++) particle('puff', 50 + rnd(-22, 22), 92, { dx: rnd(-16, 16), dy: rnd(-8, -2), delay: i * 40 }); }
  function stars(n = 4) { for (let i = 0; i < n; i++) particle('star', 50 + rnd(-34, 34), rnd(20, 70), { delay: i * 90 }); }

  // ------------------------------------------------------------------ actions
  // Each action: species it works for, weight per temperament, how long, and run(p, t, a) called every frame
  // after the normal targets are set (so it only nudges what it needs). a.once(key, fn) fires fn one time.
  const ALL_LAND = ['cat', 'dog', 'otter'];
  const ANY = ['cat', 'dog', 'otter', 'fish', 'bird', 'classic'];
  const A = {
    hop: {
      who: ['cat', 'dog', 'otter', 'bird', 'classic'], dur: 1300, mood: 'giggle',
      w: { playful: 3, joyful: 2.5, curious: 1, sleepy: 0.4, shy: 0.6 },
      run(p, t, a) {
        for (const [k, at] of [['h1', 0], ['h2', 0.34], ['h3', 0.68]]) a.once(k, () => {
          if (p < at) return false;
          B.ty.kick(-(200 + Math.random() * 70)); B.sy.kick(2.4); B.sx.kick(-1.4); P.ear.kick(-90);
        });
        a.once('land', () => { if (p < 0.92) return false; puff(2); });
      },
    },
    wiggle: {
      who: ANY, dur: 2300, mood: 'happy',
      w: { playful: 2, joyful: 3.2, curious: 0.8, sleepy: 0.4, shy: 0.8 },
      start() { particle('note', headTop().x + 14, headTop().y); },
      run(p, t, a) {
        B.rot.t += Math.sin(t / 140) * 11;
        B.sy.t *= 1 + Math.abs(Math.sin(t / 140)) * 0.06;
        B.ty.t -= Math.abs(Math.sin(t / 140)) * 3;
        P.tailAmp.t = 30; P.tailFreq.t = 4.5;
        P.flapAmp.t = 18; P.flapFreq.t = 7;
        P.pawLy.t = -6 * Math.abs(Math.sin(t / 140)); P.pawRy.t = -6 * Math.abs(Math.cos(t / 140));
        a.once('n2', () => { if (p < 0.5) return false; particle('note', headTop().x - 12, headTop().y); });
      },
    },
    twirl: {                      // turns all the way around (you see its back for a moment)
      who: ANY, dur: 1100, mood: 'whee',
      w: { playful: 2, joyful: 2, curious: 0.8, sleepy: 0.3, shy: 0.6 },
      run(p) {
        const e = ease(p);
        B.sx.t = Math.cos(e * Math.PI * 2);
        B.ty.t -= bell(p, 0, 1) * 4;
        P.tailAmp.t = 22; P.tailFreq.t = 3;
      },
      end() { B.sx.x = Math.abs(B.sx.x); B.sx.kick(2); },
    },
    roll: {                       // a clumsy somersault
      who: ['cat', 'dog', 'otter', 'fish', 'classic'], dur: 1500, mood: 'whee',
      w: { playful: 2.2, joyful: 1.4, curious: 0.6, sleepy: 0.3, shy: 0.3 },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        B.pivot.t = 0.55;
        B.rot.t = a.dir * 360 * ease(clamp(p / 0.8, 0, 1));
        B.ty.t -= bell(p, 0, 0.8) * 6;
        if (p > 0.8) st.giggleUntil = Math.max(st.giggleUntil, now() + 600);
      },
      end(a) { B.rot.x -= a.dir * 360; B.rot.t = 0; B.sy.kick(-2); puff(3); },
    },
    stretch: {
      who: ANY, dur: 2000, mood: 'stretch',
      w: { playful: 0.6, joyful: 0.8, curious: 0.6, sleepy: 3, shy: 1 },
      run(p) {
        const up = bell(p, 0.05, 0.6), squash = bell(p, 0.6, 0.9);
        B.sy.t = 1 + up * 0.16 - squash * 0.1;
        B.sx.t = 1 - up * 0.09 + squash * 0.08;
        P.pawLy.t = -up * 14; P.pawRy.t = -up * 14; P.pawLx.t = -up * 3; P.pawRx.t = up * 3;
        P.wingRest.t = up * 70; P.tailBase.t = -up * 18;
        P.finAmp.t = 4;
      },
    },
    yawn: {
      who: ANY, dur: 1900, mood: 'yawn',
      w: { playful: 0.5, joyful: 0.6, curious: 0.5, sleepy: 3.2, shy: 0.8 },
      run(p) {
        const y = bell(p, 0.05, 0.85);
        F.openL.t = F.openR.t = 1 - y;
        F.mOpen.t = 0.15 + y * 0.95;
        B.sy.t = 1 + y * 0.07; B.rot.t -= y * 4;
        P.earPerk.t = -y * 10;
        P.flapAmp.t = 0; P.wingRest.t = y * 25;
      },
      end() { if (Math.random() < 0.5) setTimeout(() => B.sy.kick(1.2), 50); },
    },
    sneeze: {
      who: ANY, dur: 1600,
      w: { playful: 1, joyful: 1, curious: 1, sleepy: 1.2, shy: 0.8 },
      moodAt(p) { return p < 0.55 ? 'presneeze' : p < 0.8 ? 'surprised' : 'giggle'; },
      run(p, t, a) {
        if (p < 0.55) {
          const k = p / 0.55;
          F.openL.t = F.openR.t = 1 - k * 0.65;
          F.mOpen.t = 0.15 + k * 0.4;
          B.rot.t -= k * 6; B.sy.t = 1 + k * 0.06;
          if (k > 0.6) B.tx.t += Math.sin(t / 30) * 0.4;
        }
        a.once('achoo', () => {
          if (p < 0.55) return false;
          say('achoo!', 1100);
          B.rot.kick(-260); B.ty.kick(-160); B.sy.kick(-3); B.sx.kick(2.4);
          P.ear.kick(220); P.earSw.kick(160); P.tail.kick(250);
          const m = mouthPos();
          particle(sp() === 'fish' ? 'bubble' : 'puff', m.x - 8, m.y, { dx: -22, dy: -6 });
          particle(sp() === 'fish' ? 'bubble' : 'puff', m.x - 4, m.y + 2, { dx: -14, dy: 2 });
        });
      },
    },
    lookAround: {
      who: ANY, dur: 2600, mood: 'curious',
      w: { playful: 1, joyful: 1, curious: 3.5, sleepy: 1, shy: 1.4 },
      start(a) { a.first = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        let lx = 0;
        if (p < 0.33) lx = a.first; else if (p < 0.66) lx = -a.first; else lx = 0;
        const ly = p < 0.66 ? -0.2 : -0.6;
        F.lookX.t = lx; F.lookY.t = ly;
        B.rot.t += lx * 5; B.tx.t += lx * 1.5;
        P.earPerk.t = 10;
        a.once('t1', () => { if (p < 0.34) return false; P.twL.kick(-300); });
        a.once('t2', () => { if (p < 0.67) return false; P.twR.kick(300); if (Math.random() < 0.5) particle('q', headTop().x + 12, headTop().y); });
      },
    },
    tilt: {                       // that head tilt babies and puppies do when they hear something
      who: ANY, dur: 1700, mood: 'curious',
      w: { playful: 1, joyful: 1, curious: 3, sleepy: 0.6, shy: 2 },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; particle('q', headTop().x + a.dir * 14, headTop().y); },
      run(p, t, a) {
        const k = bell(p, 0, 1);
        B.rot.t += a.dir * 14 * k;
        F.eyeScale.t = 1 + k * 0.12;
        P.earPerk.t = 14 * k;
        P.twL.t = a.dir < 0 ? -8 * k : 0; P.twR.t = a.dir > 0 ? 8 * k : 0;
      },
      end() { P.twL.t = 0; P.twR.t = 0; },
    },
    sniff: {
      who: ['cat', 'dog', 'otter', 'bird', 'fish', 'classic'], dur: 2000,
      w: { playful: 1, joyful: 0.8, curious: 3, sleepy: 0.6, shy: 1 },
      moodAt() { return sp() === 'bird' ? 'curious' : 'sniff'; },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        const k = bell(p, 0, 1);
        F.lookX.t = a.dir * 0.8; F.lookY.t = 0.8;
        B.rot.t += a.dir * 9 * k; B.tx.t += a.dir * 2.5 * k;
        if (sp() === 'bird') {
          // pecks at the ground instead
          const pk = Math.max(0, Math.sin(p * Math.PI * 6));
          B.rot.t += a.dir * pk * 12 * k; B.sy.t = 1 - pk * 0.05;
        } else {
          B.ty.t += Math.sin(t / 45) * 0.5 * k;
          F.mSide.t = Math.sin(t / 60) * 1.2 * k;
        }
        a.once('s', () => { if (p < 0.3) return false; if (sp() !== 'bird') particle('puff', faceC.x + a.dir * 12, faceC.y + 10 * faceC.s, { dx: a.dir * 8, dy: 4 }); });
      },
    },
    peekaboo: {
      who: ANY, dur: 2100,
      w: { playful: 1.8, joyful: 1.6, curious: 0.8, sleepy: 0.4, shy: 3 },
      moodAt(p) { return p < 0.58 ? 'content' : 'giggle'; },
      run(p, t, a) {
        const hide = p < 0.58 ? clamp(p / 0.12, 0, 1) : clamp(1 - (p - 0.58) / 0.08, 0, 1);
        if (sp() === 'fish' || sprite) {
          B.sx.t = 1 - 2 * hide;          // turns its back
        } else {
          F.openL.t = F.openR.t = 1 - hide;
          coverEyes(hide);
          P.wingRest.t = -hide * 105;
        }
        B.sy.t = 1 - hide * 0.06;
        a.once('boo', () => {
          if (p < 0.6) return false;
          say(pick(['boo!', 'peek!', 'ba!']), 1100);
          B.ty.kick(-220); B.sy.kick(2.6); P.ear.kick(-160);
          F.eyeScale.kick(3);
        });
      },
    },
    babble: {
      who: ANY, dur: 1500, mood: 'babble',
      w: { playful: 1.5, joyful: 3, curious: 1.5, sleepy: 0.6, shy: 0.8 },
      start(a) {
        const word = pick(['hm-hm!', 'la la', 'ooh!', 'hehe', 'do-do-do~', 'mmm?']);
        say(word, 1500);
        if (sp() === 'bird') { particle('note', headTop().x + 12, headTop().y + 4); particle('note', headTop().x - 10, headTop().y + 2, { delay: 300 }); }
        if (sp() === 'fish') { const m = mouthPos(); particle('bubble', m.x, m.y - 4, { dx: 4 }); }
      },
      run(p, t) {
        const talk = Math.abs(Math.sin(t / 85));
        if (sp() !== 'bird') { F.mOpen.t = 0.12 + talk * 0.5; F.mWidth.t = 0.7 + talk * 0.2; }
        B.rot.t += Math.sin(t / 160) * 4;
        B.ty.t -= talk * 1.4;
        P.tailAmp.t = 16; P.tailFreq.t = 3;
        P.flapAmp.t = talk * 10;
      },
    },
    wave: {
      who: ANY, dur: 1900, mood: 'happy',
      w: { playful: 1.2, joyful: 3, curious: 1, sleepy: 0.5, shy: 1.5 },
      start() { if (Math.random() < 0.6) say(pick(['hi!', 'hiii', 'ba-ba!']), 1300); },
      run(p, t) {
        const up = clamp(p / 0.15, 0, 1) * clamp((1 - p) / 0.12, 0, 1);
        if (land() || sp() === 'classic') { raisePaw('R', up, Math.sin(t / 95) * 24 * up); }
        if (sp() === 'bird') { P.wingRest.t = 0; parts.wingR && (A._wingR = -(60 + Math.sin(t / 90) * 30) * up); }
        if (sp() === 'fish') { P.finAmp.t = 30; P.finFreq.t = 6; }
        B.rot.t -= 4 * up;
      },
      end() { A._wingR = 0; },
    },
    hearts: {
      who: ANY, dur: 2000, mood: 'love',
      w: { playful: 0.8, joyful: 3, curious: 0.6, sleepy: 0.8, shy: 1.6 },
      start() { hearts(3); },
      run(p, t) {
        B.rot.t += Math.sin(t / 260) * 6;
        B.sy.t = 1 + Math.sin(t / 130) * 0.02;
        P.tailAmp.t = 26; P.tailFreq.t = 4;
        P.pawLy.t = -5 * bell(p, 0, 1); P.pawRy.t = -5 * bell(p, 0, 1);
      },
    },
    shy: {
      who: ANY, dur: 2400, mood: 'shy',
      w: { playful: 0.2, joyful: 0.4, curious: 0.4, sleepy: 0.6, shy: 3.2 },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        const k = bell(p, 0, 1);
        F.lookX.t = -a.dir * 0.9 * k; F.lookY.t = 0.7 * k;
        B.rot.t += a.dir * 6 * k + Math.sin(t / 300) * 3 * k;
        B.sx.t = 1 - 0.05 * k; B.sy.t = 1 - 0.05 * k;
        P.earPerk.t = -16 * k; P.tailBase.t = 10 * k;
        coverCheeks(k * 0.8);
      },
    },
    tailChase: {
      who: ['cat', 'dog'], dur: 2400, mood: 'whee',
      w: { playful: 3, joyful: 1.5, curious: 1, sleepy: 0.2, shy: 0.2 },
      run(p, t) {
        const e = ease(clamp(p / 0.85, 0, 1));
        B.sx.t = Math.cos(e * Math.PI * 6);
        B.rot.t += Math.sin(e * Math.PI * 6) * 8;
        B.ty.t -= Math.abs(Math.sin(t / 90)) * 3;
        P.tailAmp.t = 40; P.tailFreq.t = 7;
      },
      end() { B.sx.x = Math.abs(B.sx.x); st.dizzyUntil = now() + 1300; B.rot.kick(120); },
    },
    pounce: {
      who: ['cat', 'dog', 'otter', 'classic'], dur: 2100,
      w: { playful: 3, joyful: 1, curious: 2, sleepy: 0.2, shy: 0.4 },
      moodAt(p) { return p < 0.55 ? 'focus' : p < 0.85 ? 'whee' : 'giggle'; },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        if (p < 0.55) {
          const k = clamp(p / 0.2, 0, 1);
          F.lookX.t = a.dir; F.lookY.t = 0.5;
          B.sy.t = 1 - 0.14 * k; B.sx.t = 1 + 0.1 * k;
          B.rot.t += a.dir * 4 * k + (p > 0.3 ? Math.sin(t / 55) * 3 : 0);   // butt wiggle
          P.tailAmp.t = p > 0.3 ? 14 : 2; P.tailFreq.t = 6;
          P.earPerk.t = 16;
        } else if (p < 0.85) {
          B.tx.t += a.dir * 9;
          P.pawLy.t = -10; P.pawRy.t = -10;
        }
        a.once('leap', () => { if (p < 0.55) return false; B.ty.kick(-380); B.sy.kick(3.2); B.sx.kick(-2); });
        a.once('land', () => { if (p < 0.85) return false; puff(3); B.sy.kick(-3); });
      },
    },
    playBow: {
      who: ['dog', 'cat', 'otter', 'classic'], dur: 1700, mood: 'happy',
      w: { playful: 2.5, joyful: 2, curious: 0.6, sleepy: 0.2, shy: 0.4 },
      start() { if (info.species === 'dog') say(pick(['arf!', 'yip!']), 1100); },
      run(p, t, a) {
        const k = bell(p, 0, 0.7);
        B.sy.t = 1 - 0.12 * k; B.sx.t = 1 + 0.08 * k;
        P.pawLy.t = 4 * k; P.pawRy.t = 4 * k; P.pawLx.t = -4 * k; P.pawRx.t = 4 * k;
        P.tailAmp.t = 38; P.tailFreq.t = 7; P.tailBase.t = -14;
        a.once('pop', () => { if (p < 0.72) return false; B.ty.kick(-240); B.sy.kick(2.4); });
      },
    },
    trip: {                       // tries to toddle, plops over, gets back up
      who: ['cat', 'dog', 'otter', 'bird', 'classic'], dur: 2300,
      w: { playful: 1.4, joyful: 1, curious: 1, sleepy: 0.6, shy: 0.6 },
      moodAt(p) { return p < 0.38 ? 'curious' : p < 0.5 ? 'surprised' : p < 0.78 ? 'phew' : 'giggle'; },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        if (p < 0.38) {
          const step = Math.abs(Math.sin(t / 110));
          B.ty.t -= step * 3; B.rot.t += Math.sin(t / 110) * 5 + a.dir * 3;
          P.pawLy.t = -step * 4; P.pawRy.t = -(1 - step) * 4;
        } else if (p < 0.78) {
          B.rot.t += a.dir * 24; B.sy.t = 0.92;
        }
        a.once('plop', () => { if (p < 0.38) return false; B.rot.kick(a.dir * 340); B.sy.kick(-3.2); puff(3); P.ear.kick(260); });
        a.once('up', () => { if (p < 0.78) return false; B.ty.kick(-160); if (Math.random() < 0.6) say('uh-oh', 1000); });
      },
    },
    scoot: {                      // toddles a little way along the bottom of the screen
      who: ANY, dur: 2600,
      w: { playful: 2.5, joyful: 1.5, curious: 3, sleepy: 0.5, shy: 0.6 },
      moodAt() { return 'curious'; },
      ok: () => !document.body.classList.contains('open') && !st.held,
      start(a) {
        a.dir = Math.random() < 0.5 ? -1 : 1;
        a.dur = 1600;
        S.walk?.(a.dir * rnd(50, 150)).then((r) => {
          if (act !== a) return;
          if (!r || !r.dx) { a.dur = 300; return; }
          a.dir = Math.sign(r.dx);
          a.dur = (now() - a.t0) + r.ms + 250;
        }).catch(() => {});
      },
      run(p, t, a) {
        const s = sp();
        F.lookX.t = a.dir * 0.8; F.lookY.t = 0;
        if (s === 'fish') {
          B.rot.t += a.dir * 6 + Math.sin(t / 200) * 3; P.finAmp.t = 26; P.finFreq.t = 6; P.tailAmp.t = 26; P.tailFreq.t = 4;
        } else if (s === 'bird') {
          const hop = Math.max(0, Math.sin(t / 95));
          B.ty.t -= hop * 6; B.rot.t += a.dir * 4; P.flapAmp.t = hop * 18;
        } else {
          const step = Math.sin(t / 105);
          B.ty.t -= Math.abs(step) * 2.6; B.rot.t += step * 4 + a.dir * 3;
          P.pawLy.t = -Math.max(0, step) * 4; P.pawRy.t = -Math.max(0, -step) * 4;
          P.tailAmp.t = 18; P.tailFreq.t = 3.2;
        }
      },
    },
    nap: {
      who: ANY, dur: 12000, mood: 'asleep', wakeable: true,
      w: { playful: 0.2, joyful: 0.3, curious: 0.2, sleepy: 2.2, shy: 0.6 },
      ok: () => now() - st.lastCursorMove > 15000,
      start() { document.body.classList.add('napping'); },
      run(p, t) {
        B.sy.t = 0.93 + Math.sin(t / 1400) * 0.02; B.sx.t = 1.04;
        B.rot.t += 4;
        P.earPerk.t = -14; P.tailAmp.t = 1; P.flapAmp.t = 0; P.finAmp.t = 3;
      },
      end() { document.body.classList.remove('napping'); },
    },
    shake: {                      // dog shaking itself dry, ears flapping
      who: ['dog', 'otter', 'bird', 'classic'], dur: 1300, mood: 'content',
      w: { playful: 1.6, joyful: 1.4, curious: 0.6, sleepy: 0.6, shy: 0.4 },
      run(p, t, a) {
        const k = bell(p, 0.05, 0.8);
        B.rot.t += Math.sin(t / 34) * 13 * k;
        B.tx.t += Math.sin(t / 34) * 1.2 * k;
        if (k > 0.3) { P.earSw.kick(Math.sin(t / 34) * 60); P.flapAmp.t = 20; }
        a.once('drops', () => { if (p < 0.3) return false; for (let i = 0; i < 4; i++) particle('sweat', 50 + rnd(-30, 30), rnd(30, 60), { dx: rnd(-24, 24), dy: rnd(-16, 4), delay: i * 60, size: 0.7 }); });
      },
    },
    groom: {                      // cat licking a paw and washing its face
      who: ['cat'], dur: 2400, mood: 'content',
      w: { playful: 0.6, joyful: 1.2, curious: 0.8, sleepy: 2, shy: 1.4 },
      run(p, t) {
        const k = bell(p, 0, 1);
        const lick = Math.sin(t / 120);
        reachPaw('L', mouthPos().x - 2, mouthPos().y + 2 + lick * 3, k);
        B.rot.t -= 5 * k;
        F.lookY.t = 0.4;
        P.tailAmp.t = 6; P.tailFreq.t = 0.8;
      },
    },
    clap: {                       // otter patting its paws together
      who: ['otter'], dur: 1800, mood: 'happy',
      w: { playful: 2, joyful: 3, curious: 1, sleepy: 0.4, shy: 0.8 },
      run(p, t, a) {
        const k = bell(p, 0, 1), c = Math.abs(Math.sin(t / 90));
        P.pawLx.t = c * 4 * k; P.pawRx.t = -c * 4 * k; P.pawLy.t = -3 * k; P.pawRy.t = -3 * k;
        B.ty.t -= c * 1.5 * k;
        a.once('sp', () => { if (p < 0.4) return false; stars(2); });
      },
    },
    flap: {                       // bird hovering on happy little wings
      who: ['bird'], dur: 1800, mood: 'whee',
      w: { playful: 3, joyful: 2.5, curious: 1.2, sleepy: 0.3, shy: 0.6 },
      run(p, t) {
        const k = bell(p, 0, 1);
        P.flapAmp.t = 42 * Math.min(1, k * 2); P.flapFreq.t = 11;
        B.ty.t -= 9 * k + Math.sin(t / 70) * 1.2 * k;
        P.tailBase.t = -10 * k;
      },
      end() { puff(2); B.sy.kick(-2); },
    },
    preen: {                      // bird tucking its head into a wing
      who: ['bird'], dur: 2200, mood: 'content',
      w: { playful: 0.6, joyful: 1, curious: 1, sleepy: 2, shy: 1.6 },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        const k = bell(p, 0, 1);
        B.rot.t += a.dir * 14 * k + Math.sin(t / 80) * 2 * k;
        A[a.dir < 0 ? '_wingL' : '_wingR'] = -38 * k;
        F.lookX.t = a.dir; F.lookY.t = 0.6;
      },
      end() { A._wingL = 0; A._wingR = 0; P.flapAmp.kick(80); },
    },
    sing: {
      who: ['bird'], dur: 2000, mood: 'babble',
      w: { playful: 1, joyful: 3, curious: 1, sleepy: 0.6, shy: 1 },
      start() { say(pick(['tweet~', 'la-la-pip', 'chirr-ip!']), 1500); },
      run(p, t, a) {
        B.rot.t += Math.sin(t / 180) * 6; B.ty.t -= Math.abs(Math.sin(t / 180)) * 2;
        F.lookY.t = -0.6;
        for (const [k, at] of [['a', 0.05], ['b', 0.35], ['c', 0.65]]) a.once(k, () => { if (p < at) return false; particle('note', headTop().x + rnd(-14, 14), headTop().y); });
      },
    },
    bubbles: {
      who: ['fish'], dur: 1800, mood: 'bubble',
      w: { playful: 1.6, joyful: 2.4, curious: 2, sleepy: 1, shy: 1.4 },
      run(p, t, a) {
        F.mOpen.t = 0.3 + Math.abs(Math.sin(t / 130)) * 0.3;
        for (const [k, at] of [['a', 0.1], ['b', 0.3], ['c', 0.5], ['d', 0.7]]) a.once(k, () => {
          if (p < at) return false;
          const m = mouthPos(); particle('bubble', m.x + rnd(-3, 3), m.y - 6, { dx: rnd(-6, 8), dy: rnd(-46, -34), size: rnd(0.6, 1.1) });
        });
      },
    },
    dart: {                       // fish zooms forward and wobbles back
      who: ['fish'], dur: 1500, mood: 'whee',
      w: { playful: 3, joyful: 1.6, curious: 2, sleepy: 0.3, shy: 0.6 },
      start(a) { a.dir = Math.random() < 0.5 ? -1 : 1; },
      run(p, t, a) {
        const k = p < 0.25 ? ease(p / 0.25) : 1 - ease((p - 0.25) / 0.75);
        F.lookX.t = a.dir;
        B.tx.t += a.dir * 10 * k; B.rot.t += a.dir * 10 * k;
        P.tailAmp.t = 34; P.tailFreq.t = 8; P.finAmp.t = 30; P.finFreq.t = 8;
        a.once('b', () => { if (p < 0.2) return false; particle('bubble', 50 - a.dir * 22, 56, { dx: -a.dir * 10, size: 0.6 }); });
      },
    },
    // ---- egg
    eggWobble: {
      who: ['egg'], dur: 1200,
      w: { playful: 3, joyful: 2, curious: 2, sleepy: 1, shy: 1.5 },
      run(p, t, a) {
        for (const [k, at, d] of [['a', 0, 1], ['b', 0.25, -1], ['c', 0.5, 1]]) a.once(k, () => { if (p < at) return false; P.egg.kick(d * (140 + hatchK() * 160)); });
      },
    },
    eggRock: {
      who: ['egg'], dur: 2400,
      w: { playful: 1, joyful: 1.5, curious: 1, sleepy: 2.5, shy: 2 },
      run(p, t) { P.egg.t = Math.sin(p * Math.PI * 4) * 9 * bell(p, 0, 1); },
      end() { P.egg.t = 0; },
    },
    eggHop: {
      who: ['egg'], dur: 1100,
      w: { playful: 2.5, joyful: 2.5, curious: 1, sleepy: 0.4, shy: 0.6 },
      run(p, t, a) {
        a.once('h', () => { B.ty.kick(-210); B.sy.kick(2); P.egg.kick(rnd(-120, 120)); });
        a.once('l', () => { if (p < 0.6) return false; puff(2); });
      },
    },
    eggPeek: {                    // a little "?" or "!" pops out of the egg
      who: ['egg'], dur: 1400,
      w: { playful: 1, joyful: 1.5, curious: 3, sleepy: 0.6, shy: 1.4 },
      start() { particle(Math.random() < 0.5 ? 'q' : 'note', 58, 22); P.egg.kick(90); },
      run() {},
    },
  };
  A.nibble = {                    // hamster munching its peanut
    who: ['hamster'], dur: 2600, mood: 'content',
    w: { playful: 1.5, joyful: 2, curious: 1.5, sleepy: 2, shy: 2 },
    start() { if (Math.random() < 0.6) say(pick(['nom nom', 'munch~', 'nom!']), 1300); },
    run(p, t) { B.ty.t -= Math.abs(Math.sin(t / 75)) * 0.6; B.rot.t += Math.sin(t / 400) * 2; F.lookY.t = 0.5; },
  };
  A.clap.noHamster = true;
  A._wingL = 0; A._wingR = 0;

  // paw helpers (offsets in svg units, relative to where the paw normally sits)
  function raisePaw(side, k, angle = 0) {
    const pt = parts['paw' + side];
    if (!pt) return;
    const s = side === 'L' ? -1 : 1;
    P['paw' + side + 'x'].t = s * 8 * k;
    P['paw' + side + 'y'].t = -(pt.py - faceC.y) * 0.75 * k;
    P['paw' + side + 'r'].t = angle - s * 30 * k;
  }
  function reachPaw(side, x, y, k) {
    const pt = parts['paw' + side];
    if (!pt) return;
    if (k > 0.25) pawsFront(true);
    P['paw' + side + 'x'].t = (x - pt.px) * k;
    P['paw' + side + 'y'].t = (y - pt.py) * k;
  }
  // paws normally sit behind the face; to cover the eyes they have to come in front of it
  let pawsUp = false;
  function pawsFront(on) {
    if (on === pawsUp) return;
    pawsUp = on;
    for (const side of ['L', 'R']) {
      const pt = parts['paw' + side];
      if (!pt) continue;
      if (on) pt.parent.append(pt.el);
      else if (pt.next && pt.next.parentNode === pt.parent) pt.parent.insertBefore(pt.el, pt.next);
    }
  }
  function coverEyes(k) {
    if (k <= 0.25) pawsFront(false);
    reachPaw('L', faceC.x - 13 * faceC.s, faceC.y - 6 * faceC.s, k);
    reachPaw('R', faceC.x + 13 * faceC.s, faceC.y - 6 * faceC.s, k);
  }
  function coverCheeks(k) {
    reachPaw('L', faceC.x - 22 * faceC.s, faceC.y + 6 * faceC.s, k);
    reachPaw('R', faceC.x + 22 * faceC.s, faceC.y + 6 * faceC.s, k);
  }

  // ------------------------------------------------------------------ choosing what to do next
  // gap between performances (ms) by temperament: babies are busy!
  const GAP = { playful: [2600, 6500], joyful: [3200, 7500], curious: [3000, 7000], sleepy: [6500, 14000], shy: [5000, 11000] };
  let act = null, nextAt = now() + 2500;
  const history = [];

  function free(t) {
    return !st.held && !st.falling && !st.pressed && !st.hover
      && !['thinking', 'asking', 'happy', 'sad'].includes(st.ext)
      && t > st.alertUntil && t > st.dizzyUntil && t > st.typingUntil && !st.asleep
      && t > (st.morphUntil || 0);
  }

  const whoFits = (a, s) => a.who.includes(s);
  function choose(t) {
    const s = sp();
    const temper = GAP[info.temper] ? info.temper : 'playful';
    const idle = t - st.lastActivity;
    const panelOpen = document.body.classList.contains('open');
    const list = [];
    for (const [name, a] of Object.entries(A)) {
      if (name[0] === '_' || !whoFits(a, s)) continue;
      if (a.ok && !a.ok()) continue;
      if (panelOpen && (name === 'scoot' || name === 'nap')) continue;
      if (idle > 60000 && !['yawn', 'stretch', 'nap', 'eggRock'].includes(name)) continue;   // drowsy: only sleepy things
      let w = a.w[temper] ?? 1;
      if (history.includes(name)) w *= history[history.length - 1] === name ? 0.08 : 0.45;   // don't repeat yourself
      // grown-ups are calmer: fewer silly bits, more poise
      if (['trip', 'roll', 'tailChase', 'peekaboo'].includes(name)) w *= babyness();
      if (w > 0) list.push([name, w]);
    }
    if (!list.length) return null;
    let r = Math.random() * list.reduce((n, [, w]) => n + w, 0);
    for (const [name, w] of list) { r -= w; if (r <= 0) return name; }
    return list[list.length - 1][0];
  }

  function startAction(name, t = now()) {
    const def = A[name];
    if (!def) return;
    endAction();
    act = { name, def, t0: t, dur: def.dur, fired: {} };
    act.once = (k, fn) => { if (act.fired[k]) return; if (fn() !== false) act.fired[k] = true; };
    def.start?.(act);
    try { window.ScribbleSound?.play(name); } catch {}
    history.push(name); if (history.length > 3) history.shift();
  }
  function endAction() {
    if (!act) return;
    const a = act; act = null;
    try { a.def.end?.(a); } catch {}
    pawsFront(false);
    for (const k of ['pawLx', 'pawLy', 'pawLr', 'pawRx', 'pawRy', 'pawRr', 'earPerk', 'tailBase', 'wingRest']) P[k].t = 0;
    const g = GAP[info.temper] || GAP.playful;
    nextAt = now() + rnd(g[0], g[1]) * (document.body.classList.contains('open') ? 1.8 : 1);
  }

  // ------------------------------------------------------------------ hooks called by buddy.js
  function mood(t) {
    if (!act) return null;
    return act.def.moodAt ? act.def.moodAt(clamp((t - act.t0) / act.dur, 0, 1)) : act.def.mood || null;
  }

  // default part motion for this species + mood, then let the action nudge it
  function update(t, dt, m) {
    if (!svg) return;
    if (act && !free(t)) {
      // held, thinking, falling… stop performing (napping wakes up)
      if (act.def.wakeable) { st.surpriseUntil = t + 600; B.ty.kick(-140); }
      endAction();
    }
    if (!act && t > nextAt && free(t)) {
      const name = choose(t);
      if (name) startAction(name, t);
      else nextAt = t + 3000;
    }

    const s = sp();
    // ---- baseline per species
    const excited = ['happy', 'giggle', 'whee', 'love', 'curious', 'alert'].includes(m);
    const low = ['sad', 'sleepy', 'asleep'].includes(m);
    let amp = 8, freq = 0.6, tb = 0;
    if (s === 'dog') { amp = excited ? 30 : 12; freq = excited ? 6 : 1.6; }
    else if (s === 'cat') { amp = excited ? 14 : 8; freq = excited ? 1.4 : 0.45; }
    else if (s === 'otter') { amp = excited ? 14 : 6; freq = excited ? 2.5 : 0.7; }
    else if (s === 'bird') { amp = excited ? 10 : 3; freq = excited ? 5 : 1; }
    else if (s === 'fish') { amp = excited ? 18 : 10; freq = excited ? 3.2 : 1.6; }
    if (low) { amp *= m === 'asleep' ? 0.05 : 0.3; freq *= 0.5; tb = s === 'dog' || s === 'cat' ? 16 : 6; }
    if (st.held) { amp = s === 'dog' ? 26 : 12; freq = 3; }
    P.tailAmp.t = amp; P.tailFreq.t = freq; P.tailBase.t = tb;

    P.flapAmp.t = st.held || st.falling ? 34 : m === 'happy' || m === 'giggle' ? 14 : 0;
    P.flapFreq.t = st.falling ? 13 : 8;
    P.wingRest.t = m === 'sad' ? -6 : 0;
    P.finAmp.t = excited ? 22 : low ? 6 : 14; P.finFreq.t = excited ? 4 : 2.2;
    P.earPerk.t = m === 'alert' || m === 'surprised' || m === 'curious' ? 10 : m === 'sad' ? -18 : m === 'sleepy' || m === 'asleep' ? -10 : 0;

    // a baby never quite stands still: a gentle, slightly unsteady sway
    if (!st.held && !st.falling) {
      const bk = babyness();
      if (s === 'fish') {
        B.ty.t += Math.sin(t / 950) * 2.4;
        B.rot.t += Math.sin(t / 1300) * 3;
      } else if (s !== 'egg') {
        B.rot.t += (Math.sin(t / 1600) * 1.6 + Math.sin(t / 690) * 0.6) * bk;
      }
    }
    if (st.held) {            // little legs dangle
      const sw = Math.sin(t / 230);
      P.pawLy.t = 4; P.pawRy.t = 4; P.pawLr.t = sw * 12; P.pawRr.t = -sw * 12;
    } else if (!act) { P.pawLy.t = 0; P.pawRy.t = 0; P.pawLr.t = 0; P.pawRr.t = 0; }

    // random ear twitches and tail flicks
    if (t > (st.nextTwitch || 0)) {
      st.nextTwitch = t + rnd(2500, 7000);
      if (!st.held && m !== 'asleep') {
        if (Math.random() < 0.5) P.twL.kick(-rnd(200, 420)); else P.twR.kick(rnd(200, 420));
        if (Math.random() < 0.35) P.tail.kick(rnd(-200, 200));
        if (s === 'bird' && Math.random() < 0.4) P.flapAmp.kick(150);
      }
    }
    // egg: occasional shiver, more as it gets closer to hatching
    if (s === 'egg' && !act && t > (st.nextShiver || 0)) {
      st.nextShiver = t + rnd(1800, 5000) * (1.2 - hatchK() * 0.6);
      P.egg.kick(rnd(-1, 1) * (40 + hatchK() * 90));
    }

    // ---- action
    if (act) {
      const p = clamp((t - act.t0) / act.dur, 0, 1);
      act.def.run(p, t, act);
      if (p >= 1) endAction();
    }

    // ---- hatching / growing
    if (t < (st.morphUntil || 0)) {
      const k = 1 - (st.morphUntil - t) / 1250;
      if (st.morphKind === 'hatch' || s === 'egg') {
        P.egg.t = Math.sin(t / 38) * (6 + k * 14);
        B.ty.t -= Math.abs(Math.sin(t / 120)) * 3 * k;
      } else {
        B.sx.t = Math.cos(k * k * Math.PI * 8);
        B.ty.t -= k * 8;
      }
    }
  }

  // move the tagged parts
  function draw(t, dt, m) {
    phase.tail += dt * P.tailFreq.x * Math.PI * 2;
    phase.flap += dt * P.flapFreq.x * Math.PI * 2;
    phase.fin += dt * P.finFreq.x * Math.PI * 2;

    // body motion leaks into the dangly bits
    const dTy = B.ty.v, dRot = B.rot.v;
    P.ear.kick(-dTy * 0.05 * dt * 60);
    P.earSw.kick(-dRot * 0.04 * dt * 60);
    P.tail.kick(-dRot * 0.05 * dt * 60);

    const rot = (name, deg, extra = '') => {
      const pt = parts[name];
      if (pt) pt.el.setAttribute('transform', `${extra}rotate(${deg.toFixed(2)} ${pt.px} ${pt.py})`);
    };
    // tail
    if (parts.tail) {
      const s = sp();
      const wag = Math.sin(phase.tail) * P.tailAmp.x;
      const k = s === 'fish' ? 0.6 : 1;
      rot('tail', (wag + P.tail.x * 0.2 + P.tailBase.x) * k);
    }
    // ears: hanging ears swing outward with a positive angle, upright ears with a negative one
    if (parts.earL || parts.earR) {
      const hanging = ['floppy', 'long'].includes(info.ears) || (info.species === 'dog' && info.ears === 'folded');
      const soft = hanging ? 1.8 : info.ears === 'folded' ? 0.5 : 1;
      const out = clamp(P.ear.x * 0.15 * soft, -35, 35);
      const perk = P.earPerk.x * (hanging ? -0.6 : 0.5);
      const sw = clamp(P.earSw.x * 0.12 * soft, -30, 30);
      const dir = hanging ? 1 : -1;
      rot('earL', dir * (out - perk) + sw + P.twL.x * 0.04);
      rot('earR', -dir * (out - perk) + sw + P.twR.x * 0.04);
    }
    // wings
    if (parts.wingL || parts.wingR) {
      const fl = Math.max(0, Math.sin(phase.flap)) * P.flapAmp.x;
      rot('wingL', fl + P.wingRest.x + A._wingL * -1);
      rot('wingR', -fl - P.wingRest.x + A._wingR);
    }
    // fins
    if (parts.finL || parts.finR) {
      const fa = Math.sin(phase.fin) * P.finAmp.x;
      rot('finL', fa);
      rot('finR', -Math.sin(phase.fin + 0.6) * P.finAmp.x);
      rot('finTop', Math.sin(phase.fin * 0.5) * P.finAmp.x * 0.35);
      rot('finBot', -Math.sin(phase.fin * 0.5 + 1) * P.finAmp.x * 0.35);
    }
    // paws
    for (const side of ['L', 'R']) {
      const pt = parts['paw' + side];
      if (!pt) continue;
      const x = P['paw' + side + 'x'].x, y = P['paw' + side + 'y'].x, r = P['paw' + side + 'r'].x;
      pt.el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r.toFixed(2)} ${pt.px} ${pt.py})`);
    }
    // egg rocks on its round bottom
    if (parts.egg) rot('egg', clamp(P.egg.x, -28, 28));

    if (sprite) drawSprite(t, m);
    // turning round: the face disappears while we see its back
    if (faceWrap) {
      P.faceHide.t = B.sx.x < 0.08 ? 0 : 1;
      faceWrap.style.opacity = clamp(P.faceHide.x, 0, 1).toFixed(2);
    }
  }

  function onActivity() {
    if (act && act.def.wakeable) { endAction(); st.surpriseUntil = now() + 650; B.ty.kick(-140); }
  }
  function interrupt() { if (act) endAction(); }
  function onClick() {
    if (isEgg()) { P.egg.kick((Math.random() < 0.5 ? -1 : 1) * 260); if (info.species) particle('star', 50 + rnd(-16, 16), 26); return; }
    if (act) endAction();
    // babies love being poked: sometimes a giggle with hearts
    if (info.creature && Math.random() < 0.35) setTimeout(() => hearts(2), 120);
  }
  function morph(kind) {
    endAction();
    st.morphUntil = now() + 1250;
    st.morphKind = kind;
    document.body.classList.add('glowing');
  }
  function afterAvatar() {
    if (st.morphUntil && now() < st.morphUntil + 1500) {
      st.morphUntil = 0;
      document.body.classList.remove('glowing');
      document.body.classList.remove('flash'); void document.body.offsetWidth; document.body.classList.add('flash');
      setTimeout(() => document.body.classList.remove('flash'), 900);
      B.sy.kick(4); B.ty.kick(-320); B.sx.kick(-2);
      stars(6); setTimeout(() => hearts(2), 300);
      st.giggleUntil = now() + 1600;

    }
  }


  window.BuddyLife = {
    onRender, update, draw, mood, onActivity, interrupt, onClick, morph, afterAvatar,
    current: () => (act ? act.name : null),
    // for testing / devtools
    play: (name) => startAction(name), actions: () => Object.keys(A).filter((k) => k[0] !== '_'), current: () => act && act.name,
    available: () => Object.entries(A).filter(([k, a]) => k[0] !== '_' && whoFits(a, sp())).map(([k]) => k),
    P, say,
  };
})();
