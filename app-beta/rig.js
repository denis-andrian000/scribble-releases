// Scribble's clay characters: 2D cut-out puppets drawn on a <canvas>.
//
// Each character (src/chars.js, built by art/chars/) is a faceless clay body plus separate limbs and tail, and the
// face pieces cut from the same render (eyes, nose). Here they're put back together every frame:
//   limbs/tail -> rotate around their root (hidden behind the body) and bend softly along their length (a mesh)
//   face       -> the real eyes, squashed to blink or swapped for drawn arcs (happy, asleep, squint, dizzy),
//                 a live mouth, blush, brows and a sweat drop
//   colour     -> only the main fur is recoloured (patches, paws, beak, comb keep theirs), keeping the clay shading;
//                 patterns are printed on the fur the same way
// All positions are in the character's 512×512 box (feet at y≈490).
(function () {
  const DATA = () => window.__CHARS__ || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const loaded = {};

  function load(name) {
    if (loaded[name]) return loaded[name];
    const d = DATA()[name];
    if (!d) return Promise.reject(new Error('no character ' + name));
    loaded[name] = Promise.all(Object.entries(d.img).map(([k, src]) => new Promise((res) => {
      const i = new Image(); i.onload = () => res([k, i]); i.onerror = () => res([k, null]); i.src = src;
    }))).then((pairs) => ({ name, rig: d.rig, img: Object.fromEntries(pairs) }));
    return loaded[name];
  }

  // ---------------------------------------------------------------- colour + pattern
  function hexHsv(hex) {
    const n = parseInt(String(hex || '').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [((h / 6) + 1) % 1, mx ? d / mx : 0, mx];
  }
  function hsvRgb(h, s, v) {
    const hh = (h % 1) * 6, f = hh - Math.floor(hh), p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][Math.floor(hh) % 6];
  }
  // pattern stamped in rig units, so it lines up across the body and stays the same size on every part
  function patternCanvas(kind, w, h, scale, ox, oy) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#000';
    x.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
    const W = w / scale + ox + 80, H = h / scale + oy + 80;
    if (kind === 'dots') {
      for (let j = 0, y = -40; y < H; j++, y += 40) for (let i = 0, xx = (j % 2) * 23 - 40; xx < W; i++, xx += 46) { x.beginPath(); x.arc(xx, y, 8.5, 0, 7); x.fill(); }
    } else if (kind === 'stripes') {
      x.rotate(-0.5);
      for (let y = -600; y < 1200; y += 38) x.fillRect(-600, y, 1800, 13);
    } else if (kind === 'hearts') {
      const heart = (cx, cy, s) => { x.beginPath(); x.moveTo(cx, cy + 0.35 * s); x.bezierCurveTo(cx - 0.9 * s, cy - 0.25 * s, cx - 0.45 * s, cy - 0.85 * s, cx, cy - 0.35 * s);
        x.bezierCurveTo(cx + 0.45 * s, cy - 0.85 * s, cx + 0.9 * s, cy - 0.25 * s, cx, cy + 0.35 * s); x.fill(); };
      for (let j = 0, y = -40; y < H; j++, y += 50) for (let xx = (j % 2) * 28 - 40; xx < W; xx += 56) heart(xx, y, 15);
    }
    return x.getImageData(0, 0, w, h).data;
  }
  function skinLayer(img, rig, look, layerName) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const recolor = look.hsv, pat = look.pattern && look.pattern !== 'none';
    if (!recolor && !pat) return c;
    let d;
    try { d = x.getImageData(0, 0, c.width, c.height); } catch { return c; }
    const p = d.data, fh = rig.furHue, fs = rig.furSat || 0.6, fv = rig.furVal || 0.9;
    // where this layer sits in the rig box (patterns are laid out in rig units)
    const q = rig.q || 1;
    let pd = null;
    if (pat) {
      const part = rig.parts[layerName];
      const ox = part ? part.at[0] * 0.37 + layerName.length * 13 : 0, oy = part ? part.at[1] * 0.29 : 0;
      pd = patternCanvas(look.pattern, c.width, c.height, q, ox, oy);
    }
    const [th, ts, tv] = recolor || [fh, fs, fv];
    const ink = pat ? hexHsv(look.patColor || '#FFF4EC') : null;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, s = mx ? dl / mx : 0;
      if (s < 0.22 || mx < 0.5) continue;
      let h = dl === 0 ? 0 : mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; h = ((h / 6) + 1) % 1;
      let dh = Math.abs(h - fh); dh = Math.min(dh, 1 - dh);
      const tol = rig.furTol || 0.05, w = clamp((tol - dh) / Math.min(0.02, tol * 0.3), 0, 1) * clamp((s - 0.22) / 0.12, 0, 1) * clamp((mx - 0.5) / 0.1, 0, 1);
      if (!w) continue;
      const shade = mx / fv;                                // the clay's light and shadow at this pixel
      let [R, G, Bc] = recolor ? hsvRgb(th, clamp(s * ts / fs, 0, 1), clamp(tv * shade, 0, 1)) : [r, g, b];
      if (pd) {
        const a = pd[i + 3] / 255 * w;
        if (a > 0) { const [ir, ig, ib] = hsvRgb(ink[0], ink[1], clamp(ink[2] * (0.55 + 0.45 * shade), 0, 1)); R += (ir - R) * a; G += (ig - G) * a; Bc += (ib - Bc) * a; }
      }
      p[i] = (r + (R - r) * w) * 255; p[i + 1] = (g + (G - g) * w) * 255; p[i + 2] = (b + (Bc - b) * w) * 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  const skins = {};
  function skin(ch, cfg) {
    const rig = ch.rig;
    const col = cfg.color && String(cfg.color).toUpperCase() !== String(rig.fur).toUpperCase() ? cfg.color : null;
    const pattern = ['dots', 'stripes', 'hearts'].includes(cfg.pattern) ? cfg.pattern : 'none';
    const key = [ch.name, col, pattern, pattern !== 'none' ? cfg.patColor : ''].join('|');
    if (skins[key]) return skins[key];
    const look = { hsv: col ? hexHsv(col) : null, pattern, patColor: cfg.patColor };
    const L = {};
    for (const n of ['body', ...Object.keys(rig.parts)]) if (ch.img[n]) L[n] = skinLayer(ch.img[n], rig, look, n);
    const keys = Object.keys(skins); if (keys.length > 24) delete skins[keys[0]];
    skins[key] = L;
    return L;
  }

  // ---------------------------------------------------------------- limbs: rotate + soft bend
  function tri(g, img, W, H, s0, s1, s2, d0, d1, d2) {
    const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
    const e = (p) => { const dx = p[0] - mx, dy = p[1] - my, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 1.4, p[1] + dy / l * 1.4]; };
    const a = e(d0), b = e(d1), c = e(d2);
    g.save(); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.clip();
    const den = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
    const m11 = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / den;
    const m12 = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / den;
    const m21 = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / den;
    const m22 = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / den;
    const dx = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    const dy = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    g.transform(m11, m12, m21, m22, dx, dy); g.drawImage(img, 0, 0, W, H); g.restore();
  }
  function part(g, img, J, rot, curl) {
    if (!img || !J) return;
    const [rx, ry] = J.root, W = J.w, H = J.h, len = J.len;
    g.save();
    g.translate(J.at[0], J.at[1]);
    g.rotate(Math.atan2(J.dir[1], J.dir[0]) - Math.PI / 2 + rot);
    if (Math.abs(curl) < 0.025) { g.drawImage(img, -rx, -ry, W, H); g.restore(); return; }
    const COLS = 2, ROWS = 8, rowY = (i) => (H * i) / ROWS, center = [], ang = [];
    let cx = 0, cy = 0, prev = ry;
    for (let i = 0; i <= ROWS; i++) {
      const y = rowY(i);
      if (y <= ry) { center[i] = [0, y - ry]; ang[i] = 0; continue; }
      const a = curl * Math.pow(Math.min(1, (y - ry) / len), 1.4), seg = y - prev;
      cx += -Math.sin(a) * seg; cy += Math.cos(a) * seg; prev = y;
      center[i] = [cx, cy]; ang[i] = a;
    }
    const pt = (i, j) => { const u = (W * j) / COLS - rx, c = center[i], q = ang[i]; return [c[0] + u * Math.cos(q), c[1] + u * Math.sin(q)]; };
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
      const s00 = [(W * j) / COLS, rowY(i)], s10 = [(W * (j + 1)) / COLS, rowY(i)], s01 = [(W * j) / COLS, rowY(i + 1)], s11 = [(W * (j + 1)) / COLS, rowY(i + 1)];
      const d00 = pt(i, j), d10 = pt(i, j + 1), d01 = pt(i + 1, j), d11 = pt(i + 1, j + 1);
      tri(g, img, W, H, s00, s10, s11, d00, d10, d11); tri(g, img, W, H, s00, s11, s01, d00, d11, d01);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- face
  const INK = '#2A1812';
  function spiral(g, cx, cy, r, a0) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + t * 2.6 * Math.PI * 2, rr = r * t; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  function face(g, ch, s) {
    const R = ch.rig, I = ch.img, K = R.k || 1, MK = R.mk || K;
    const lx = (s.look?.[0] || 0) * 7 * K, ly = (s.look?.[1] || 0) * 5 * K;
    g.save();
    g.globalAlpha = clamp(s.faceAlpha ?? 1, 0, 1);
    if (g.globalAlpha < 0.02) { g.restore(); return; }
    // blush
    const bl = clamp(s.blush ?? 0.55, 0, 1);
    if (bl > 0.02 && R.blush) {
      g.fillStyle = s.blushColor || '#F48080';
      const a = g.globalAlpha; g.globalAlpha = a * clamp(0.25 + bl * 0.6, 0, 0.85);
      for (const b of R.blush) { g.beginPath(); g.ellipse(b[0] + lx * 0.3, b[1] + ly * 0.3, R.blushR[0] * (0.85 + bl * 0.25), R.blushR[1] * (0.85 + bl * 0.25), 0, 0, 7); g.fill(); }
      g.globalAlpha = a;
    }
    // eyes
    g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 4.2 * K;
    const es = s.eyeScale ?? 1, opens = s.open || [1, 1];
    [[I.eyeL, R.eyeL, R.eyes[0], opens[0], -1], [I.eyeR, R.eyeR, R.eyes[1], opens[1], 1]].forEach(([img, box, c, open, side]) => {
      const cx = c[0] + lx, cy = c[1] + ly, rr = box[2] * 0.28;
      if ((s.dizzy || 0) > 0.5) { g.lineWidth = 3 * K; spiral(g, cx, cy, box[2] * 0.36, (s.t || 0) / 300 * side); g.lineWidth = 4.2 * K; }
      else if ((s.squint || 0) > 0.5) { g.beginPath(); const d = -side; g.moveTo(cx - d * rr * 0.7, cy - rr * 0.7); g.lineTo(cx + d * rr * 0.6, cy); g.lineTo(cx - d * rr * 0.7, cy + rr * 0.7); g.stroke(); }
      else if ((s.joy || 0) > 0.5) { g.beginPath(); g.arc(cx, cy + 9 * K, 15 * K, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      else if (open < 0.16) { g.beginPath(); g.arc(cx, cy - 4 * K, 15 * K, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
      else if (img) {
        g.save(); g.translate(cx, cy); g.scale(es, es * Math.max(0.1, open));
        g.drawImage(img, box[0] - c[0], box[1] - c[1], box[2], box[3]); g.restore();
      }
    });
    // brows: only when they mean something (thinking, asking, sad, surprised)
    const ba = clamp(s.brow?.a || 0, 0, 1);
    if (ba > 0.03) {
      g.save(); g.globalAlpha *= ba; g.lineWidth = 3.4 * K;
      R.eyes.forEach((c, i) => {
        const dir = i ? -1 : 1, box = i ? R.eyeR : R.eyeL;
        const y = c[1] + ly - box[3] * 0.62 * Math.max(1, es * 0.95) - (s.brow.y || 0) * 6 * K - (i === 0 ? (s.brow.asym || 0) * 5 * K : 0);
        const inner = y + (s.brow.ang || 0) * 4 * K, outer = y - (s.brow.ang || 0) * 1.6 * K;
        const x1 = c[0] + lx - 9 * K * dir, x2 = c[0] + lx + 9 * K * dir;
        g.beginPath(); g.moveTo(x1, outer); g.quadraticCurveTo(c[0] + lx, Math.min(inner, outer) - 2.4 * K, x2, inner); g.stroke();
      });
      g.restore();
    }
    // nose / beak + mouth
    const m = s.mouth || {}, o = Math.max(0, m.o ?? 0), cu = m.c ?? 0.55, w = m.w ?? 1;
    if (R.beak && R.nose && I.nose) beak(g, R, I, clamp((o - 0.05) * 1.3, 0, 1), lx, ly);
    else {
      if (R.nose && I.nose) g.drawImage(I.nose, R.nose[0] + lx * 0.5, R.nose[1] + ly * 0.5, R.nose[2], R.nose[3]);
      const X = R.mouth[0] + lx * 0.5 + (m.side || 0) * 1.5 * MK, Y = R.mouth[1] + ly * 0.5 - 2;
      g.save(); g.translate(X, Y); g.scale(MK, MK); g.lineWidth = 3.4; g.strokeStyle = INK;
      if (o < 0.08) {
        if (cu > 0.3) { g.save(); g.scale(clamp(w, 0.6, 1.3), 1); g.beginPath(); g.arc(-5.5, 0, 5.5, 0.15, Math.PI - 0.15); g.stroke(); g.beginPath(); g.arc(5.5, 0, 5.5, 0.15, Math.PI - 0.15); g.stroke(); g.restore(); }
        else { const hw = 6 * w; g.beginPath(); g.moveTo(-hw, 2); g.quadraticCurveTo(0, 2 + cu * 9, hw, 2); g.stroke(); }
      } else if (w < 0.72 && cu < 0.4) {
        g.fillStyle = '#5A1F1A'; g.beginPath(); g.ellipse(0, 4, 4 + 3 * w, 3 + 6 * o, 0, 0, 7); g.fill();
      } else {
        const hw = 11 * clamp(w, 0.6, 1.3), dep = 5 + 11 * o, top = -1 + (cu < 0 ? 4 : 0);
        g.fillStyle = '#5A1F1A'; g.beginPath(); g.moveTo(-hw, top); g.quadraticCurveTo(0, top + 2 + Math.max(0, -cu) * -4, hw, top);
        g.quadraticCurveTo(hw * 0.82, top + dep, 0, top + dep); g.quadraticCurveTo(-hw * 0.82, top + dep, -hw, top); g.fill();
        if (o > 0.3 && cu > -0.2) { g.fillStyle = '#F07C86'; g.beginPath(); g.ellipse(0, top + dep - 3.6, hw * 0.52, 3.2 + o * 1.2, 0, 0, 7); g.fill(); }
      }
      g.restore();
    }
    // nervous sweat drop
    const sw = clamp(s.sweat || 0, 0, 1);
    if (sw > 0.02) {
      const ex = R.eyes[1][0] + R.eyeR[2] * 0.95, ey = R.eyes[1][1] - R.eyeR[3] * 0.8 + (((s.t || 0) / 90) % 14) * K;
      g.save(); g.globalAlpha *= sw; g.translate(ex, ey); g.scale(K * 1.6, K * 1.6);
      g.fillStyle = '#8EC5FF'; g.strokeStyle = '#5E9EE8'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(-4, 1, 0, 3.5); g.quadraticCurveTo(4, 1, 0, -5); g.fill(); g.stroke(); g.restore();
    }
    g.restore();
  }
  // beaked characters: the upper beak is the picture, the lower beak hinges open underneath it
  function beak(g, R, I, open, lx, ly) {
    const [bx, by, bw, bh] = R.nose, X = bx + bw / 2 + lx * 0.5, top = by + ly * 0.5;
    const BW = bw * 0.78, hinge = top + bh * 0.55, drop = open * bh * 1.5;
    if (open > 0.05) {
      g.fillStyle = '#6A2318'; g.beginPath(); g.ellipse(X, hinge + drop * 0.45, BW * 0.42, drop * 0.55 + 2, 0, 0, 7); g.fill();
      if (open > 0.5) { g.fillStyle = '#F07C86'; g.beginPath(); g.ellipse(X, hinge + drop * 0.72, BW * 0.24, drop * 0.22, 0, 0, 7); g.fill(); }
    }
    const lg = g.createLinearGradient(0, hinge + drop, 0, hinge + drop + bh * 0.55);
    lg.addColorStop(0, '#F9A53E'); lg.addColorStop(1, '#E8812A');
    g.fillStyle = lg; g.beginPath();
    g.moveTo(X - BW / 2, hinge + drop * 0.6); g.quadraticCurveTo(X, hinge + drop + bh * 0.75, X + BW / 2, hinge + drop * 0.6);
    g.quadraticCurveTo(X, hinge + drop * 0.85 + bh * 0.1, X - BW / 2, hinge + drop * 0.6); g.fill();
    g.drawImage(I.nose, bx + lx * 0.5, by + ly * 0.5, bw, bh);
  }

  // ---------------------------------------------------------------- one frame
  // s: { look:[x,y] (-1..1), open:[l,r], eyeScale, joy, squint, dizzy, blush, sweat, brow:{a,y,ang,asym},
  //      mouth:{o,c,w,side}, arms:[l,r] (radians: + lifts the left arm, − lifts the right), bend:[l,r], tail, tailBend,
  //      faceAlpha, t }
  function drawRig(canvas, ch, L, s) {
    const g = canvas.getContext('2d');
    const W = canvas.width, sc = W / 512;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, canvas.height);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.imageSmoothingQuality = 'high';
    const P = ch.rig.parts, arms = s.arms || [0, 0], bend = s.bend || [0, 0];
    if (P.tail) part(g, L.tail, P.tail, s.tail || 0, s.tailBend || 0);
    for (const n of Object.keys(P)) if (P[n].kind === 'foot') part(g, L[n], P[n], 0, 0);
    // arms hang behind the body; raised, they come in front (otherwise the big head hides them)
    const frontL = arms[0] > 0.55, frontR = arms[1] < -0.55;
    if (!frontL) part(g, L.armL, P.armL, arms[0], bend[0]);
    if (!frontR) part(g, L.armR, P.armR, arms[1], bend[1]);
    g.drawImage(L.body, 0, 0, 512, 512);
    face(g, ch, s);
    if (frontL) part(g, L.armL, P.armL, arms[0], bend[0]);
    if (frontR) part(g, L.armR, P.armR, arms[1], bend[1]);
  }

  function fit(canvas, fallback) {
    const r = canvas.getBoundingClientRect();
    const px = Math.round(Math.max(r.width, r.height) * (window.devicePixelRatio || 1)) || fallback;
    const n = clamp(px, 48, 1024);
    if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
  }

  const NEUTRAL = { look: [0, 0], open: [1, 1], eyeScale: 1, blush: 0.55, mouth: { o: 0, c: 0.55, w: 1 }, arms: [0, 0], tail: 0 };
  // a still picture (settings, onboarding, header)
  function paint(canvas, cfg, pose) {
    const name = DATA()[cfg.clay] ? cfg.clay : Object.keys(DATA())[0];
    if (!name) return Promise.resolve();
    return load(name).then((ch) => {
      fit(canvas, 256);
      const s = { ...NEUTRAL, ...(pose || {}), blush: cfg.cheeks === false ? 0 : 0.55, blushColor: cfg.blushColor };
      drawRig(canvas, ch, skin(ch, cfg), s);
      canvas.dataset.painted = '1';
    }).catch(() => {});
  }
  // the live buddy: buddy.js calls update(state) every frame
  function player(canvas, cfg) {
    const name = DATA()[cfg.clay] ? cfg.clay : Object.keys(DATA())[0];
    let ch = null, L = null, n = 0;
    const ready = load(name).then((c) => { ch = c; L = skin(c, cfg); }).catch(() => {});
    return {
      ready, name,
      get rig() { return ch && ch.rig; },
      update(s) {
        if (!ch) return;
        if ((n++ & 31) === 0) fit(canvas, 160);
        drawRig(canvas, ch, L, { blushColor: cfg.blushColor, ...s, blush: cfg.cheeks === false ? 0 : s.blush });
      },
    };
  }

  window.Rig = { load, paint, player, chars: () => DATA(), skin };
})();
