// Builds the buddy's SVG from avatar settings. Used by the floating buddy and the customizer preview.
(function () {
  const INK = '#2B2A4C';

  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
    const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  const esc = (s) => String(s).replace(/[&"<>]/g, (ch) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[ch]));

  // Each shape: sil = the body outline (used for the fill, patterns and the optional outline),
  // back = drawn behind the body (ears…), extra = details on top, top = where the head starts (hats sit there).
  function starPath(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r : R;
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    return d + 'Z';
  }
  const SHAPES = {
    note: {
      sil: 'M14 12 h72 a6 6 0 0 1 6 6 v52 l-22 22 h-56 a6 6 0 0 1 -6 -6 v-68 a6 6 0 0 1 6 -6z', top: 12,
      extra: (c) => `<path d="M8 22 h84" stroke="${shade(c, -0.08)}" stroke-width="2" opacity=".6"/>
        <g class="corner"><path d="M92 70 l-22 22 v-16 a6 6 0 0 1 6 -6z" fill="${shade(c, -0.15)}"/></g>
        <path d="M20 78 h34 M20 84 h26" stroke="${shade(c, -0.1)}" stroke-width="2" stroke-linecap="round"/>`,
    },
    blob: {
      sil: 'M50 10 C79 10 93 31 93 57 C93 81 74 93 50 93 C26 93 7 81 7 57 C7 31 21 10 50 10Z', top: 10,
      extra: (c) => `<ellipse cx="34" cy="24" rx="10" ry="5" fill="#fff" opacity=".35" transform="rotate(-20 34 24)"/>
        <path d="M22 86 Q50 96 78 86" stroke="${shade(c, -0.15)}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`,
    },
    mochi: {
      sil: 'M50 20 C80 20 95 36 95 62 C95 84 78 93 50 93 C22 93 5 84 5 62 C5 36 20 20 50 20Z', top: 20,
      extra: () => `<ellipse cx="28" cy="34" rx="11" ry="5" fill="#fff" opacity=".4" transform="rotate(-18 28 34)"/>`,
    },
    cloud: {
      sil: 'M24 88 C10 88 4 76 10 66 C2 56 10 40 26 44 C26 26 46 18 58 30 C70 18 92 28 88 46 C98 52 98 72 86 80 C86 90 74 92 66 88 C58 94 44 94 36 88 C32 90 26 90 24 88Z', top: 24,
      extra: () => `<ellipse cx="44" cy="34" rx="9" ry="4" fill="#fff" opacity=".55" transform="rotate(-15 44 34)"/>`,
    },
    pebble: {
      sil: 'M50 8 C74 8 88 34 88 58 C88 80 72 94 50 94 C28 94 12 80 12 58 C12 34 26 8 50 8Z', top: 8,
      extra: () => `<ellipse cx="36" cy="22" rx="8" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 36 22)"/>`,
    },
    drop: {
      sil: 'M50 4 C60 22 88 42 88 64 C88 83 71 94 50 94 C29 94 12 83 12 64 C12 42 40 22 50 4Z', top: 18,
      extra: () => `<path d="M30 52 Q30 38 42 28" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>`,
    },
    slime: {
      sil: 'M14 70 C14 34 30 14 50 14 C70 14 86 34 86 70 C86 78 90 84 94 90 Q94 94 88 94 H12 Q6 94 6 90 C10 84 14 78 14 70Z', top: 14,
      extra: (c) => `<ellipse cx="34" cy="26" rx="9" ry="4.5" fill="#fff" opacity=".45" transform="rotate(-25 34 26)"/>
        <path d="M70 92 q3 6 0 8 q-3 -2 0 -8" fill="${shade(c, -0.05)}"/>`,
    },
    bunny: {
      sil: 'M50 26 C78 26 92 44 92 64 C92 84 74 94 50 94 C26 94 8 84 8 64 C8 44 22 26 50 26Z', top: 17,
      back: (c) => `<ellipse cx="33" cy="16" rx="8.5" ry="19" fill="${c}" transform="rotate(-10 33 16)"/>
        <ellipse cx="33" cy="17" rx="4" ry="13" fill="#FFB3C1" transform="rotate(-10 33 17)"/>
        <ellipse cx="67" cy="16" rx="8.5" ry="19" fill="${c}" transform="rotate(10 67 16)"/>
        <ellipse cx="67" cy="17" rx="4" ry="13" fill="#FFB3C1" transform="rotate(10 67 17)"/>`,
      extra: () => `<ellipse cx="30" cy="38" rx="8" ry="4" fill="#fff" opacity=".35" transform="rotate(-25 30 38)"/>`,
    },
    bear: {
      sil: 'M50 16 C78 16 93 36 93 60 C93 82 75 94 50 94 C25 94 7 82 7 60 C7 36 22 16 50 16Z', top: 16,
      back: (c) => `<circle cx="20" cy="22" r="13" fill="${c}"/><circle cx="20" cy="22" r="6.5" fill="${shade(c, -0.18)}"/>
        <circle cx="80" cy="22" r="13" fill="${c}"/><circle cx="80" cy="22" r="6.5" fill="${shade(c, -0.18)}"/>`,
      extra: (c) => `<ellipse cx="50" cy="66" rx="13" ry="9" fill="#fff" opacity=".35"/>`,
    },
    cat: {
      sil: 'M14 34 L18 6 L38 22 Q50 18 62 22 L82 6 L86 34 C92 46 92 60 88 72 C82 88 66 94 50 94 C34 94 18 88 12 72 C8 60 8 46 14 34Z', top: 12,
      extra: (c) => `<path d="M21 26 L22 14 L32 22Z M79 26 L78 14 L68 22Z" fill="#FF8A80" opacity=".6"/>
        <path d="M6 58 h14 M6 64 h14 M80 58 h14 M80 64 h14" stroke="${shade(c, -0.3)}" stroke-width="1.6" stroke-linecap="round"/>`,
    },
    ghost: {
      sil: 'M16 52 C16 26 31 9 50 9 C69 9 84 26 84 52 V88 l-8.5 -7 -8.5 7 -8.5 -7 -8.5 7 -8.5 -7 -8.5 7 -8.5 -7 -8.5 7Z', top: 9,
      extra: () => `<ellipse cx="35" cy="22" rx="8" ry="4" fill="#fff" opacity=".35" transform="rotate(-25 35 22)"/>`,
    },
    bot: {
      sil: 'M26 18 h48 a16 16 0 0 1 16 16 v40 a16 16 0 0 1 -16 16 h-48 a16 16 0 0 1 -16 -16 v-40 a16 16 0 0 1 16 -16z', top: 10,
      back: (c) => `<line x1="50" y1="18" x2="50" y2="7" stroke="${shade(c, -0.25)}" stroke-width="3"/><circle cx="50" cy="6" r="4" fill="${shade(c, -0.25)}"/>
        <rect x="4" y="44" width="7" height="18" rx="3" fill="${shade(c, -0.2)}"/><rect x="89" y="44" width="7" height="18" rx="3" fill="${shade(c, -0.2)}"/>`,
      extra: () => `<rect x="18" y="30" width="64" height="44" rx="12" fill="#fff" opacity=".28"/>`,
    },
    star: {
      sil: starPath(50, 57, 47, 25), top: 12, round: 12,
      extra: () => `<ellipse cx="38" cy="30" rx="6" ry="3" fill="#fff" opacity=".45" transform="rotate(-30 38 30)"/>`,
    },
    heart: {
      sil: 'M50 93 C30 79 5 63 5 38 C5 21 18 11 31 11 C40 11 46 16 50 23 C54 16 60 11 69 11 C82 11 95 21 95 38 C95 63 70 79 50 93Z', top: 14,
      extra: () => `<ellipse cx="27" cy="25" rx="8" ry="4" fill="#fff" opacity=".45" transform="rotate(-30 27 25)"/>`,
    },
    flower: {
      sil: 'M18 56 a32 32 0 1 0 64 0 a32 32 0 1 0 -64 0Z', top: 20,
      back: (c) => [0, 60, 120, 180, 240, 300].map((a) => { const x = 50 + Math.cos((a - 90) * Math.PI / 180) * 34, y = 56 + Math.sin((a - 90) * Math.PI / 180) * 34; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="${shade(c, 0.12)}"/>`; }).join(''),
      extra: () => `<ellipse cx="38" cy="36" rx="7" ry="3.5" fill="#fff" opacity=".4" transform="rotate(-25 38 36)"/>`,
    },
    octopus: {
      sil: 'M14 62 C14 30 30 12 50 12 C70 12 86 30 86 62 C86 70 92 76 95 84 C89 89 83 84 79 79 C77 87 72 93 64 92 C61 87 60 83 58 81 C56 89 52 95 46 93 C42 87 42 83 40 81 C36 89 30 93 24 91 C22 85 22 81 22 79 C17 84 11 88 5 85 C8 77 14 70 14 62Z', top: 12,
      extra: (c) => `<ellipse cx="34" cy="24" rx="9" ry="4.5" fill="#fff" opacity=".4" transform="rotate(-25 34 24)"/>
        <g fill="${shade(c, -0.12)}" opacity=".6"><circle cx="20" cy="40" r="2.5"/><circle cx="80" cy="40" r="2.5"/><circle cx="74" cy="28" r="2"/></g>`,
    },
    whale: {
      sil: 'M50 26 C80 26 96 42 96 62 C96 82 78 92 50 92 C22 92 4 82 4 62 C4 42 20 26 50 26Z', top: 26,
      back: (c) => `<path d="M82 46 C86 34 92 28 98 26 C96 34 94 40 90 46 C94 44 98 46 99 50 C94 52 88 52 84 52Z" fill="${shade(c, -0.12)}"/>`,
      extra: () => `<path d="M50 24 v-8 M50 17 q-7 -7 -12 -2 M50 17 q7 -7 12 -2" stroke="#8FD3FF" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="28" cy="40" rx="9" ry="4" fill="#fff" opacity=".4" transform="rotate(-20 28 40)"/>`,
    },
    turtle: {
      sil: 'M50 16 C72 16 84 32 84 52 C84 72 70 84 50 84 C30 84 16 72 16 52 C16 32 28 16 50 16Z', top: 16,
      back: (c) => `<ellipse cx="22" cy="88" rx="9" ry="6" fill="${c}"/><ellipse cx="78" cy="88" rx="9" ry="6" fill="${c}"/>
        <ellipse cx="50" cy="66" rx="48" ry="28" fill="${shade(c, -0.3)}"/>
        <path d="M14 66 h72 M30 50 l8 16 l-8 16 M70 50 l-8 16 l8 16" stroke="${shade(c, -0.42)}" stroke-width="2" fill="none" opacity=".7"/>`,
      extra: () => `<ellipse cx="36" cy="26" rx="8" ry="4" fill="#fff" opacity=".4" transform="rotate(-25 36 26)"/>`,
    },
    fox: {
      sil: 'M8 14 L32 28 Q50 22 68 28 L92 14 L88 48 C90 74 72 92 50 92 C28 92 10 74 12 48Z', top: 22,
      extra: (c) => `<path d="M14 18 L28 28 L18 34Z M86 18 L72 28 L82 34Z" fill="${shade(c, -0.35)}" opacity=".7"/>
        <path d="M13 56 C26 58 40 62 50 76 C60 62 74 58 87 56 C84 78 68 92 50 92 C32 92 16 78 13 56Z" fill="#fff"/>`,
    },
    penguin: {
      sil: 'M50 8 C76 8 90 32 90 58 C90 82 74 94 50 94 C26 94 10 82 10 58 C10 32 24 8 50 8Z', top: 8,
      back: () => `<ellipse cx="36" cy="95" rx="9" ry="4" fill="#FFB347"/><ellipse cx="64" cy="95" rx="9" ry="4" fill="#FFB347"/>`,
      extra: () => `<path d="M50 30 C42 21 22 25 22 48 C22 70 36 86 50 86 C64 86 78 70 78 48 C78 25 58 21 50 30Z" fill="#fff"/>
        <path d="M46 49 L54 49 L50 55Z" fill="#FFB347" stroke="#FFB347" stroke-width="2" stroke-linejoin="round"/>`,
    },
    seal: {
      sil: 'M50 20 C78 20 92 38 92 60 C92 82 76 92 50 92 C24 92 8 82 8 60 C8 38 22 20 50 20Z', top: 20,
      back: (c) => `<ellipse cx="12" cy="80" rx="12" ry="6" fill="${shade(c, -0.12)}" transform="rotate(-25 12 80)"/><ellipse cx="88" cy="80" rx="12" ry="6" fill="${shade(c, -0.12)}" transform="rotate(25 88 80)"/>`,
      extra: (c) => `<ellipse cx="32" cy="32" rx="9" ry="4" fill="#fff" opacity=".45" transform="rotate(-25 32 32)"/>
        <g fill="${shade(c, -0.35)}" opacity=".7"><circle cx="40" cy="62" r="1.1"/><circle cx="37" cy="65" r="1.1"/><circle cx="60" cy="62" r="1.1"/><circle cx="63" cy="65" r="1.1"/></g>`,
    },
    panda: {
      sil: 'M50 16 C78 16 93 36 93 60 C93 82 75 94 50 94 C25 94 7 82 7 60 C7 36 22 16 50 16Z', top: 16,
      back: () => `<circle cx="20" cy="22" r="13" fill="#3A3A48"/><circle cx="80" cy="22" r="13" fill="#3A3A48"/>`,
      extra: () => `<ellipse cx="35" cy="47" rx="11" ry="13" fill="#3A3A48" transform="rotate(25 35 47)"/><ellipse cx="65" cy="47" rx="11" ry="13" fill="#3A3A48" transform="rotate(-25 65 47)"/>`,
      eyeInk: '#FFFFFF',
    },
    chick: {
      sil: 'M50 14 C76 14 90 34 90 58 C90 80 74 92 50 92 C26 92 10 80 10 58 C10 34 24 14 50 14Z', top: 14,
      back: (c) => `<path d="M46 16 q-6 -10 2 -12 q-1 6 4 8 q2 -8 9 -6 q-6 4 -7 12Z" fill="${shade(c, -0.1)}"/>
        <ellipse cx="9" cy="62" rx="7" ry="12" fill="${shade(c, -0.08)}" transform="rotate(20 9 62)"/><ellipse cx="91" cy="62" rx="7" ry="12" fill="${shade(c, -0.08)}" transform="rotate(-20 91 62)"/>`,
      extra: () => `<path d="M45.5 50 L54.5 50 L50 57Z" fill="#FF9F43" stroke="#FF9F43" stroke-width="2" stroke-linejoin="round"/>
        <ellipse cx="32" cy="28" rx="8" ry="4" fill="#fff" opacity=".45" transform="rotate(-25 32 28)"/>`,
    },
    axolotl: {
      sil: 'M50 22 C80 22 94 40 94 60 C94 82 76 92 50 92 C24 92 6 82 6 60 C6 40 20 22 50 22Z', top: 22,
      back: (c) => [-1, 1].map((sd) => [[-26, 0], [-10, 6], [8, 10]].map(([a, d]) => { const x = 50 + sd * 40, y = 40 + d; return `<ellipse cx="${x + sd * 10}" cy="${y + a / 3}" rx="12" ry="4.5" fill="${shade(c, -0.18)}" transform="rotate(${sd * a} ${x} ${y})"/>`; }).join('')).join(''),
      extra: () => `<ellipse cx="32" cy="34" rx="9" ry="4" fill="#fff" opacity=".45" transform="rotate(-20 32 34)"/>`,
    },
    frog: {
      sil: 'M50 30 C80 30 94 46 94 64 C94 84 76 92 50 92 C24 92 6 84 6 64 C6 46 20 30 50 30Z', top: 14,
      back: (c) => `<circle cx="32" cy="32" r="15" fill="${c}"/><circle cx="68" cy="32" r="15" fill="${c}"/>`,
      extra: (c) => `<ellipse cx="50" cy="80" rx="24" ry="10" fill="#fff" opacity=".25"/>`,
      face: { dy: -12, s: 1.05 },
    },
    mouse: {
      sil: 'M50 24 C76 24 90 42 90 62 C90 82 74 92 50 92 C26 92 10 82 10 62 C10 42 24 24 50 24Z', top: 24,
      back: (c) => `<circle cx="20" cy="26" r="16" fill="${c}"/><circle cx="20" cy="26" r="9" fill="#FFB3C1"/><circle cx="80" cy="26" r="16" fill="${c}"/><circle cx="80" cy="26" r="9" fill="#FFB3C1"/>`,
      extra: () => `<ellipse cx="50" cy="56" rx="3" ry="2.2" fill="#FF7A9A"/>`,
    },
    toast: {
      sil: 'M14 42 C4 40 4 24 14 16 C26 6 42 8 50 14 C58 8 74 6 86 16 C96 24 96 40 86 42 V86 a8 8 0 0 1 -8 8 H22 a8 8 0 0 1 -8 -8Z', top: 10,
      extra: () => `<path d="M22 44 C14 42 14 30 22 24 C30 17 42 18 50 23 C58 18 70 17 78 24 C86 30 86 42 78 44 V82 a5 5 0 0 1 -5 5 H27 a5 5 0 0 1 -5 -5Z" fill="#FFE9BF"/>`,
    },
    jellyfish: {
      sil: 'M10 60 C10 30 28 14 50 14 C72 14 90 30 90 60 C84 66 78 62 72 66 C66 62 60 66 50 64 C40 66 34 62 28 66 C22 62 16 66 10 60Z', top: 14,
      back: (c) => [24, 38, 50, 62, 76].map((x, i) => `<path d="M${x} 62 q${i % 2 ? 6 : -6} 8 0 16 q${i % 2 ? -6 : 6} 8 0 16" stroke="${shade(c, -0.1)}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>`).join(''),
      extra: () => `<ellipse cx="32" cy="28" rx="10" ry="4.5" fill="#fff" opacity=".5" transform="rotate(-25 32 28)"/>`,
    },
    koala: {
      sil: 'M50 24 C77 24 90 41 90 61 C90 82 74 92 50 92 C26 92 10 82 10 61 C10 41 23 24 50 24Z', top: 24,
      back: (c) => `<circle cx="17" cy="33" r="17" fill="${c}"/><circle cx="17" cy="34" r="10" fill="${shade(c, 0.45)}"/>
        <circle cx="83" cy="33" r="17" fill="${c}"/><circle cx="83" cy="34" r="10" fill="${shade(c, 0.45)}"/>
        <path d="M3 30 q-3 -2 -1 -6 M6 22 q-2 -3 1 -6 M97 30 q3 -2 1 -6 M94 22 q2 -3 -1 -6" stroke="${shade(c, 0.5)}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      extra: (c) => `<ellipse cx="50" cy="84" rx="16" ry="6" fill="#fff" opacity=".3"/>
        <path d="M50 44 C57 44 59 50 58 55 C57 60 54 62 50 62 C46 62 43 60 42 55 C41 50 43 44 50 44Z" fill="${shade(c, -0.55)}"/>
        <ellipse cx="47" cy="49" rx="2.4" ry="1.6" fill="#fff" opacity=".45" transform="rotate(-20 47 49)"/>`,
      face: { dy: 2 }, cling: true,
    },
    chameleon: {
      sil: 'M50 18 C63 18 74 25 80 36 C89 43 93 54 91 67 C89 84 74 92 50 92 C26 92 11 84 9 67 C7 54 11 43 20 36 C26 25 37 18 50 18Z', top: 18,
      tail: 'spiral', cling: true,
      extra: (c) => `<path d="M27 34 Q50 2 73 34 Q50 24 27 34Z" fill="${shade(c, -0.14)}"/>
        <path d="M38 23 l-1 -5 M50 19 v-6 M62 23 l1 -5" stroke="${shade(c, -0.14)}" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="50" cy="82" rx="22" ry="8" fill="${shade(c, 0.4)}" opacity=".85"/>
        <path d="M36 79 v6 M44 77 v9 M50 76 v10 M56 77 v9 M64 79 v6" stroke="${shade(c, 0.15)}" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="36" cy="46" r="13" fill="${shade(c, -0.08)}"/><circle cx="64" cy="46" r="13" fill="${shade(c, -0.08)}"/>
        <circle cx="36" cy="46" r="10" fill="none" stroke="${shade(c, 0.3)}" stroke-width="1.6"/><circle cx="64" cy="46" r="10" fill="none" stroke="${shade(c, 0.3)}" stroke-width="1.6"/>`,
    },
    monkey: {
      sil: 'M50 18 C77 18 89 37 89 59 C89 82 73 92 50 92 C27 92 11 82 11 59 C11 37 23 18 50 18Z', top: 18,
      back: (c) => `<circle cx="11" cy="54" r="12" fill="${c}"/><circle cx="11" cy="54" r="7" fill="#F6D4B3"/>
        <circle cx="89" cy="54" r="12" fill="${c}"/><circle cx="89" cy="54" r="7" fill="#F6D4B3"/>`,
      extra: (c) => `<path d="M50 36 C57 28 75 29 77 42 C79 51 76 56 72 60 C77 68 70 86 50 86 C30 86 23 68 28 60 C24 56 21 51 23 42 C25 29 43 28 50 36Z" fill="#F6D4B3"/>
        <path d="M44 19 q3 -11 11 -6 q-5 1 -4 7Z" fill="${shade(c, -0.15)}"/>
        <circle cx="47" cy="55" r="1.3" fill="${shade(c, -0.4)}"/><circle cx="53" cy="55" r="1.3" fill="${shade(c, -0.4)}"/>`,
      face: { dy: 2 }, tail: 'curl', cling: true,
    },
    dragon: {
      sil: 'M50 18 C78 18 92 38 92 60 C92 82 76 92 50 92 C24 92 8 82 8 60 C8 38 22 18 50 18Z', top: 18,
      back: (c) => `<path d="M10 52 C-2 40 -2 26 4 20 C8 30 14 34 20 36Z M90 52 C102 40 102 26 96 20 C92 30 86 34 80 36Z" fill="${shade(c, -0.22)}"/>
        <path d="M32 22 L28 8 L40 18Z M68 22 L72 8 L60 18Z" fill="#FFE08A"/>
        <path d="M44 18 l6 -9 l6 9Z" fill="${shade(c, -0.18)}"/>`,
      extra: (c) => `<ellipse cx="50" cy="80" rx="20" ry="10" fill="#FFF3C4" opacity=".7"/><ellipse cx="32" cy="30" rx="8" ry="4" fill="#fff" opacity=".4" transform="rotate(-25 32 30)"/>`,
    },
    cactus: {
      sil: 'M32 14 h36 a18 18 0 0 1 18 18 v54 a8 8 0 0 1 -8 8 h-56 a8 8 0 0 1 -8 -8 v-54 a18 18 0 0 1 18 -18z', top: 14,
      back: (c) => `<rect x="0" y="40" width="16" height="30" rx="8" fill="${c}"/><rect x="84" y="34" width="16" height="30" rx="8" fill="${c}"/>`,
      extra: (c) => `<g stroke="${shade(c, -0.3)}" stroke-width="1.6" stroke-linecap="round" opacity=".6"><path d="M24 30 l-3 -2 M30 76 l-3 2 M76 30 l3 -2 M72 80 l3 2 M50 24 v-3 M22 52 l-3 0 M78 54 l3 0"/></g>`,
    },
    snail: {
      sil: 'M46 30 C70 30 84 44 84 62 C84 82 68 92 46 92 C24 92 10 82 10 62 C10 44 22 30 46 30Z', top: 26,
      back: () => `<circle cx="72" cy="44" r="27" fill="#FF8A80"/><circle cx="72" cy="44" r="22" fill="#FFB86B"/><circle cx="72" cy="44" r="17" fill="#FFE27A"/>
        <circle cx="72" cy="44" r="12" fill="#9BE07F"/><circle cx="72" cy="44" r="7" fill="#7FB3FF"/><circle cx="72" cy="44" r="3" fill="#A48BFF"/>`,
      extra: () => `<path d="M34 32 Q30 20 26 14 M50 31 Q52 19 56 14" stroke="#2B2A4C" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="26" cy="13" r="3" fill="#2B2A4C"/><circle cx="56" cy="13" r="3" fill="#2B2A4C"/>`,
      face: { dx: -4, dy: 4, s: 0.92 },
    },
    mushroom: {
      sil: 'M28 44 h44 v38 a12 12 0 0 1 -12 12 h-20 a12 12 0 0 1 -12 -12z', top: 6,
      back: () => '',
      extra: (c) => `<path d="M6 46 C6 20 26 6 50 6 C74 6 94 20 94 46 C94 52 88 54 80 52 C66 49 34 49 20 52 C12 54 6 52 6 46Z" fill="${c}"/>
        <g fill="#fff" opacity=".9"><circle cx="30" cy="24" r="6"/><circle cx="60" cy="16" r="4.5"/><circle cx="76" cy="34" r="5"/><circle cx="46" cy="36" r="3.5"/></g>`,
      body: '#FFF3E0',            // the stalk is cream; "colour" paints the cap
      face: { dy: 18, s: 0.8 },   // face sits lower, on the stalk
    },
  };

  // Patterns are clipped to the body outline. pc = pattern colour.
  const PATTERNS = {
    none: () => '',
    dots: (pc) => { let o = ''; for (let y = 8; y < 100; y += 13) for (let x = (y / 13) % 2 ? 4 : 10.5; x < 100; x += 13) o += `<circle cx="${x}" cy="${y}" r="2.8"/>`; return `<g fill="${pc}" opacity=".5">${o}</g>`; },
    stripes: (pc) => { let o = ''; for (let x = -100; x < 120; x += 16) o += `<rect x="${x}" y="-20" width="7" height="160" transform="rotate(30 ${x} 0)"/>`; return `<g fill="${pc}" opacity=".35">${o}</g>`; },
    hearts: (pc) => [[20, 24], [78, 30], [16, 74], [84, 78], [50, 88], [66, 14]].map(([x, y]) => `<path d="M${x} ${y + 3} l-4 -4 a2.6 2.6 0 0 1 4 -3.2 a2.6 2.6 0 0 1 4 3.2z" fill="${pc}" opacity=".7"/>`).join(''),
    sparkles: (pc) => [[22, 26, 4], [80, 22, 3], [14, 70, 3], [86, 74, 4], [64, 88, 3], [36, 86, 2.5]].map(([x, y, r]) => `<path d="M${x} ${y - r * 1.6} Q${x} ${y} ${x + r * 1.6} ${y} Q${x} ${y} ${x} ${y + r * 1.6} Q${x} ${y} ${x - r * 1.6} ${y} Q${x} ${y} ${x} ${y - r * 1.6}Z" fill="${pc}" opacity=".85"/>`).join(''),
    belly: (pc) => `<ellipse cx="50" cy="92" rx="30" ry="22" fill="${pc}" opacity=".8"/>`,
    patch: (pc) => `<ellipse cx="10" cy="80" rx="20" ry="16" fill="${pc}" opacity=".75"/><ellipse cx="92" cy="24" rx="16" ry="14" fill="${pc}" opacity=".75"/><ellipse cx="66" cy="96" rx="12" ry="8" fill="${pc}" opacity=".75"/>`,
    soft: () => `<rect x="0" y="0" width="100" height="100" fill="url(#__soft)"/>`,
    checker: (pc) => { let o = ''; for (let y = 0; y < 100; y += 10) for (let x = (y / 10) % 2 ? 10 : 0; x < 100; x += 20) o += `<rect x="${x}" y="${y}" width="10" height="10"/>`; return `<g fill="${pc}" opacity=".32">${o}</g>`; },
    stars: (pc) => { let o = ''; for (let y = 10; y < 100; y += 18) for (let x = (y / 18) % 2 ? 6 : 15; x < 100; x += 18) o += `<path d="${starPath(x, y, 3.6, 1.6)}"/>`; return `<g fill="${pc}" opacity=".75">${o}</g>`; },
    waves: (pc) => { let o = ''; for (let y = 14; y < 104; y += 16) o += `<path d="M-4 ${y} q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="${pc}" stroke-width="5" fill="none"/>`; return `<g opacity=".35">${o}</g>`; },
    confetti: () => { const C = ['#FF8A9A', '#FFCE47', '#7FB3FF', '#9BE07F', '#C9A7FF']; let o = '', k = 0; for (let y = 8; y < 100; y += 12) for (let x = (y / 12) % 2 ? 4 : 11; x < 100; x += 14) { k++; o += `<rect x="${x}" y="${y}" width="5" height="2.4" rx="1.2" fill="${C[k % 5]}" transform="rotate(${(k * 47) % 180} ${x + 2.5} ${y + 1.2})"/>`; } return `<g opacity=".85">${o}</g>`; },
    gingham: (pc) => { let o = ''; for (let i = 0; i < 100; i += 12) o += `<rect x="${i}" y="0" width="6" height="100"/><rect x="0" y="${i}" width="100" height="6"/>`; return `<g fill="${pc}" opacity=".22">${o}</g>`; },
    clouds: () => [[22, 26], [74, 20], [16, 76], [80, 72], [50, 92]].map(([x, y]) => `<path d="M${x - 9} ${y + 3} a4 4 0 0 1 2 -7 a5 5 0 0 1 9 -2 a4 4 0 0 1 7 3 a3.5 3.5 0 0 1 0 6Z" fill="#fff" opacity=".85"/>`).join(''),
    zigzag: (pc) => { let o = ''; for (let y = 8; y < 108; y += 14) o += `<path d="M-4 ${y} l7 -6 l7 6 l7 -6 l7 6 l7 -6 l7 6 l7 -6 l7 6 l7 -6 l7 6 l7 -6 l7 6 l7 -6 l7 6 l7 -6" stroke="${pc}" stroke-width="3.4" fill="none"/>`; return `<g opacity=".4">${o}</g>`; },
  };

  const EYES = {
    shine: (e) => `
      <ellipse class="eye" cx="36" cy="46" rx="7" ry="8.5" fill="${e}"/>
      <ellipse class="eye" cx="64" cy="46" rx="7" ry="8.5" fill="${e}"/>
      <circle class="pupil" id="p1" cx="38" cy="43" r="2.4" fill="#fff"/>
      <circle class="pupil" id="p2" cx="66" cy="43" r="2.4" fill="#fff"/>`,
    dots: (e) => `
      <circle class="eye" cx="36" cy="46" r="4.6" fill="${e}"/>
      <circle class="eye" cx="64" cy="46" r="4.6" fill="${e}"/>`,
    happy: (e) => `
      <path class="eye" d="M29 49 q7 -10 14 0 M57 49 q7 -10 14 0" stroke="${e}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    sleepy: (e) => `
      <path class="eye" d="M29 45 q7 7 14 0 M57 45 q7 7 14 0" stroke="${e}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    glasses: (e) => EYES.shine(e) + `
      <g fill="none" stroke="${INK}" stroke-width="2.6">
        <circle cx="36" cy="46" r="12"/><circle cx="64" cy="46" r="12"/><path d="M48 45 q2 -3 4 0"/>
      </g>`,
    sparkle: (e) => `
      <ellipse class="eye" cx="36" cy="47" rx="8.2" ry="9.8" fill="${e}"/>
      <ellipse class="eye" cx="64" cy="47" rx="8.2" ry="9.8" fill="${e}"/>
      <circle cx="38.6" cy="43.2" r="3.1" fill="#fff"/><circle cx="66.6" cy="43.2" r="3.1" fill="#fff"/>
      <circle cx="33.4" cy="51.6" r="1.4" fill="#fff"/><circle cx="61.4" cy="51.6" r="1.4" fill="#fff"/>`,
    round: (e) => `
      <circle class="eye" cx="36" cy="46" r="6" fill="${e}"/><circle class="eye" cx="64" cy="46" r="6" fill="${e}"/>
      <circle cx="37.6" cy="44" r="1.8" fill="#fff"/><circle cx="65.6" cy="44" r="1.8" fill="#fff"/>`,
    wink: (e) => `
      <ellipse class="eye" cx="36" cy="46" rx="7" ry="8.5" fill="${e}"/>
      <circle class="pupil" id="p1" cx="38" cy="43" r="2.4" fill="#fff"/>
      <path class="eye" d="M57 47 q7 -6 14 0" stroke="${e}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
  };

  const MOUTHS = {
    smile: (e = INK) => `<path class="mouth" d="M44 59 q6 6 12 0" stroke="${e}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    grin: (e = INK) => `<path class="mouth" d="M41 57 h18 q0 11 -9 11 q-9 0 -9 -11z" fill="${e}"/><path d="M45 64 q5 3 10 0" stroke="#FF8A80" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cat: (e = INK) => `<path class="mouth" d="M42 58 q4 5 8 0 q4 5 8 0" stroke="${e}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
    flat: (e = INK) => `<path class="mouth" d="M45 61 h10" stroke="${e}" stroke-width="3" stroke-linecap="round"/>`,
    o: (e = INK) => `<ellipse class="mouth" cx="50" cy="61" rx="4" ry="5" fill="${e}"/>`,
    none: () => '',
  };

  // hats etc. are drawn for a head starting at y≈8 and moved down to the shape's own top
  const ON_HEAD = new Set(['cap', 'bow', 'crown', 'leaf', 'party', 'beanie', 'flower', 'antenna', 'halo', 'star', 'wizard', 'rainhat', 'detective', 'chef', 'moon', 'peach', 'catphones', 'earmuffs', 'headphones', 'headset']);
  const AT_FACE = new Set(['specs']);           // follows the face when a shape moves it
  const ACCESSORIES = {
    none: () => '',
    pencil: (a) => `
      <g transform="translate(78 4) rotate(35)">
        <rect x="0" y="0" width="6" height="22" rx="1.5" fill="${a}"/>
        <rect x="0" y="0" width="6" height="4" rx="1.5" fill="#FF8A80"/>
        <path d="M0 22 l3 6 l3 -6z" fill="#F4D9B0"/><path d="M2 26 l1 2 l1 -2z" fill="${INK}"/>
      </g>`,
    headphones: (a) => `
      <path d="M13 50 V40 Q13 6 50 6 Q87 6 87 40 V50" fill="none" stroke="${shade(a, -0.25)}" stroke-width="5" stroke-linecap="round"/>
      <rect x="4" y="40" width="14" height="24" rx="6" fill="${a}"/>
      <rect x="82" y="40" width="14" height="24" rx="6" fill="${a}"/>`,
    cap: (a) => `
      <path d="M24 26 Q24 3 50 3 Q76 3 76 26 Z" fill="${a}"/>
      <path d="M70 22 h22 q4 0 1 5 h-25z" fill="${shade(a, -0.2)}"/>
      <circle cx="50" cy="4" r="3" fill="${shade(a, -0.2)}"/>`,
    beanie: (a) => `
      <path d="M22 24 Q22 0 50 0 Q78 0 78 24 Z" fill="${a}"/>
      <rect x="19" y="20" width="62" height="9" rx="4.5" fill="${shade(a, -0.18)}"/>
      <path d="M30 22 v6 M38 22 v6 M46 22 v6 M54 22 v6 M62 22 v6 M70 22 v6" stroke="${shade(a, -0.3)}" stroke-width="1.4"/>
      <circle cx="50" cy="-1" r="5" fill="#fff"/>`,
    party: (a) => `
      <path d="M36 18 L50 -14 L64 18Z" fill="${a}"/>
      <path d="M41 6 L59 6 M38 13 L62 13" stroke="#fff" stroke-width="2.4" opacity=".8"/>
      <circle cx="50" cy="-15" r="4" fill="#FFCE47"/>`,
    bow: (a) => `
      <path d="M26 14 L12 5 V23Z M26 14 L40 5 V23Z" fill="${a}"/>
      <circle cx="26" cy="14" r="4.5" fill="${shade(a, -0.2)}"/>`,
    flower: (a) => `
      <g transform="translate(70 10)">
        ${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-6" rx="4.2" ry="6" fill="${a}" transform="rotate(${r})"/>`).join('')}
        <circle r="3.6" fill="#FFCE47"/>
      </g>`,
    crown: () => `
      <path d="M30 18 L32 2 L41 11 L50 0 L59 11 L68 2 L70 18Z" fill="#FFC83D" stroke="#E0A400" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="50" cy="11" r="2.4" fill="#FF6B6B"/>`,
    halo: () => `<ellipse cx="50" cy="-2" rx="20" ry="5" fill="none" stroke="#FFD24D" stroke-width="3.5"/><ellipse cx="50" cy="-2" rx="20" ry="5" fill="none" stroke="#FFF3B0" stroke-width="1"/>`,
    antenna: (a) => `
      <path d="M40 12 Q36 0 30 -6 M60 12 Q64 0 70 -6" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="-7" r="4" fill="${a}"/><circle cx="70" cy="-7" r="4" fill="${a}"/>`,
    star: (a) => `<path d="M72 2 l3 6.5 l7 .8 l-5.2 4.8 l1.5 7 l-6.3 -3.6 l-6.3 3.6 l1.5 -7 l-5.2 -4.8 l7 -.8z" fill="${a}" stroke="${shade(a, -0.25)}" stroke-width="1"/>`,
    leaf: (a) => `
      <path d="M50 12 Q50 2 58 -2" stroke="${shade(a, -0.3)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M57 0 Q72 -2 74 10 Q60 14 57 0Z" fill="${a}"/>`,
    scarf: (a) => `
      <path d="M14 76 Q50 88 86 76 L86 84 Q50 96 14 84Z" fill="${a}"/>
      <path d="M66 84 l4 14 l8 -2 l-4 -14z" fill="${shade(a, -0.15)}"/>
      <path d="M20 79 v5 M30 82 v5 M40 84 v5 M50 85 v5 M60 84 v5 M70 82 v5 M80 79 v5" stroke="${shade(a, -0.25)}" stroke-width="1.2" opacity=".6"/>`,
    wizard: (a) => `
      <path d="M26 20 L54 -22 L74 20Z" fill="${a}"/>
      <ellipse cx="50" cy="20" rx="32" ry="6" fill="${shade(a, -0.2)}"/>
      <path d="${starPath(52, 2, 5, 2.2)}" fill="#FFE27A"/><circle cx="44" cy="12" r="1.6" fill="#FFE27A"/>`,
    specs: (a) => `<g fill="none" stroke="${a}" stroke-width="2.6"><circle cx="36" cy="46" r="11"/><circle cx="64" cy="46" r="11"/><path d="M47 45 q3 -3 6 0 M25 44 l-9 -3 M75 44 l9 -3"/></g>`,
    headset: (a) => `
      <path d="M13 50 V40 Q13 6 50 6 Q87 6 87 40 V50" fill="none" stroke="${shade(a, -0.3)}" stroke-width="4" stroke-linecap="round"/>
      <rect x="5" y="40" width="12" height="20" rx="5" fill="${a}"/><rect x="83" y="40" width="12" height="20" rx="5" fill="${a}"/>
      <path d="M11 58 Q14 72 38 70" stroke="${shade(a, -0.3)}" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="39" cy="70" r="3.4" fill="${shade(a, -0.3)}"/>`,
    hood: (a) => `<path d="M12 70 C8 38 26 12 50 12 C74 12 92 38 88 70" fill="none" stroke="${a}" stroke-width="8" stroke-linecap="round"/>
      <path d="M40 80 l-4 14 M60 80 l4 14" stroke="${shade(a, -0.2)}" stroke-width="2.4" stroke-linecap="round"/><circle cx="36" cy="95" r="2.6" fill="${shade(a, -0.2)}"/><circle cx="64" cy="95" r="2.6" fill="${shade(a, -0.2)}"/>`,
    backpack: (a) => `<path d="M26 66 C24 76 24 86 26 94 M74 66 C76 76 76 86 74 94" stroke="${a}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="22" y="78" width="8" height="5" rx="1.5" fill="${shade(a, -0.25)}"/><rect x="70" y="78" width="8" height="5" rx="1.5" fill="${shade(a, -0.25)}"/>`,
    rainhat: (a) => `<path d="M30 18 Q30 0 50 0 Q70 0 70 18Z" fill="${a}"/><path d="M12 22 Q50 8 88 22 Q90 26 84 26 Q50 16 16 26 Q10 26 12 22Z" fill="${shade(a, -0.12)}"/>`,
    bowtie: (a) => `<path d="M50 84 L36 77 V91Z M50 84 L64 77 V91Z" fill="${a}"/><circle cx="50" cy="84" r="3.6" fill="${shade(a, -0.25)}"/>`,
    wings: () => `<g fill="#fff" stroke="#DDE6F5" stroke-width="1.2"><path d="M8 54 C-6 46 -6 30 4 26 C8 36 12 42 16 46 C10 46 6 50 8 54Z"/><path d="M92 54 C106 46 106 30 96 26 C92 36 88 42 84 46 C90 46 94 50 92 54Z"/></g>`,
    catphones: (a) => `
      <path d="M22 18 L24 2 L36 12Z M78 18 L76 2 L64 12Z" fill="${a}"/><path d="M25 13 L26 6 L31 11Z M75 13 L74 6 L69 11Z" fill="#FFB3C1"/>
      <path d="M13 50 V40 Q13 6 50 6 Q87 6 87 40 V50" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round"/>
      <rect x="4" y="40" width="14" height="24" rx="6" fill="${a}"/><rect x="82" y="40" width="14" height="24" rx="6" fill="${a}"/>`,
    detective: (a) => `<path d="M28 20 Q28 2 50 2 Q72 2 72 20Z" fill="${a}"/><path d="M14 20 Q50 12 86 20 Q86 25 80 24 Q50 18 20 24 Q14 25 14 20Z" fill="${shade(a, -0.2)}"/><rect x="29" y="14" width="42" height="4" fill="${shade(a, -0.35)}"/>`,
    chef: () => `<path d="M32 22 C20 22 18 6 30 6 C30 -4 46 -6 50 2 C54 -6 70 -4 70 6 C82 6 80 22 68 22Z" fill="#fff" stroke="#E4E8F0" stroke-width="1.2"/><rect x="32" y="18" width="36" height="8" rx="2" fill="#fff" stroke="#E4E8F0" stroke-width="1.2"/>`,
    earmuffs: (a) => `<path d="M14 46 Q14 6 50 6 Q86 6 86 46" fill="none" stroke="${shade(a, -0.3)}" stroke-width="3.4"/>
      <circle cx="12" cy="48" r="10" fill="${a}"/><circle cx="88" cy="48" r="10" fill="${a}"/><circle cx="12" cy="48" r="5" fill="#fff" opacity=".45"/><circle cx="88" cy="48" r="5" fill="#fff" opacity=".45"/>`,
    moon: () => `<path d="M30 2 A13 13 0 1 0 44 20 A10 10 0 1 1 30 2Z" fill="#FFE27A"/>`,
    berry: () => `<g transform="translate(62 72)"><path d="M0 6 C0 0 14 0 14 6 C14 14 9 20 7 21 C5 20 0 14 0 6Z" fill="#FF5C6E"/><path d="M2 3 L7 -2 L12 3 L7 1Z" fill="#4CAF7A"/><g fill="#FFE27A"><circle cx="4" cy="8" r=".9"/><circle cx="9" cy="7" r=".9"/><circle cx="6" cy="13" r=".9"/><circle cx="10" cy="12" r=".9"/></g></g>`,
    peach: () => `<circle cx="56" cy="8" r="9" fill="#FFB38A"/><path d="M56 0 q-3 8 0 16" stroke="#F08A6B" stroke-width="1.2" fill="none" opacity=".7"/><path d="M57 -1 Q66 -6 70 0 Q62 4 57 -1Z" fill="#6CC46A"/>`,
    coffee: (a) => `
      <g transform="translate(74 66)">
        <path d="M0 4 h16 v12 a6 6 0 0 1 -6 6 h-4 a6 6 0 0 1 -6 -6z" fill="${a}"/>
        <path d="M16 8 q6 0 6 5 q0 5 -6 5" fill="none" stroke="${a}" stroke-width="2.5"/>
        <path d="M5 0 q-2 -4 1 -6 M10 0 q-2 -4 1 -6" stroke="#9AA0B4" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </g>`,
  };

  // Ready-made looks. Picking one sets everything below; the name stays yours.
  const TEMPLATES = [
    { id: 'scribble', label: 'Scribble', shape: 'note', color: '#FFCE47', eyes: 'shine', mouth: 'smile', accessory: 'pencil', accColor: '#5B8DEF', pattern: 'none', outline: false },
    { id: 'mochi', label: 'Mint Mochi', shape: 'mochi', color: '#A6E3C8', eyes: 'shine', mouth: 'cat', accessory: 'leaf', accColor: '#4CAF7A', pattern: 'belly', patColor: '#FFFFFF' },
    { id: 'cloud', label: 'Cloud Nine', shape: 'cloud', color: '#DCE8FF', eyes: 'sleepy', mouth: 'smile', accessory: 'halo', pattern: 'none', blushColor: '#FF9EB5' },
    { id: 'bunny', label: 'Berry Bunny', shape: 'bunny', color: '#FFC2D4', eyes: 'shine', mouth: 'grin', accessory: 'bow', accColor: '#FF5C8A', pattern: 'dots', patColor: '#FFFFFF' },
    { id: 'bear', label: 'Choco Bear', shape: 'bear', color: '#B07D57', eyes: 'dots', mouth: 'cat', accessory: 'scarf', accColor: '#E85D5D', pattern: 'none' },
    { id: 'ghost', label: 'Night Ghost', shape: 'ghost', color: '#A48BFF', eyes: 'happy', mouth: 'o', accessory: 'party', accColor: '#FF7AB8', pattern: 'sparkles', patColor: '#FFE27A' },
    { id: 'bot', label: 'Bolt Bot', shape: 'bot', color: '#7FB3FF', eyes: 'glasses', mouth: 'flat', accessory: 'headphones', accColor: '#2B2A4C', pattern: 'stripes', patColor: '#FFFFFF' },
    { id: 'drop', label: 'Sunny Drop', shape: 'drop', color: '#6FD3F0', eyes: 'shine', mouth: 'smile', accessory: 'flower', accColor: '#FFFFFF', pattern: 'soft' },
    { id: 'shroom', label: 'Shroomie', shape: 'mushroom', color: '#FF7A6B', eyes: 'shine', mouth: 'smile', accessory: 'none', pattern: 'none' },
    { id: 'kitty', label: 'Kitty Café', shape: 'cat', color: '#F2A65A', eyes: 'wink', mouth: 'cat', accessory: 'coffee', accColor: '#FFFFFF', pattern: 'patch', patColor: '#FFF3E0' },
    { id: 'slime', label: 'Lime Slime', shape: 'slime', color: '#A3E46B', eyes: 'happy', mouth: 'grin', accessory: 'beanie', accColor: '#5B8DEF', pattern: 'soft' },
    { id: 'pebble', label: 'Pebble', shape: 'pebble', color: '#CFC7BD', eyes: 'dots', mouth: 'flat', accessory: 'antenna', accColor: '#FF8A5B', pattern: 'dots', patColor: '#8E8478' },
    { id: 'seal', label: 'Starry Seal', shape: 'seal', color: '#8EC9FF', eyes: 'sparkle', mouth: 'cat', accessory: 'star', accColor: '#FFE27A', pattern: 'stars', patColor: '#FFFFFF' },
    { id: 'panda', label: 'Peach Panda', shape: 'panda', color: '#FFF1F1', eyes: 'shine', mouth: 'smile', accessory: 'peach', pattern: 'none', blushColor: '#FF6FA0' },
    { id: 'chick', label: 'Lemon Chick', shape: 'chick', color: '#FFE066', eyes: 'shine', mouth: 'none', accessory: 'none', pattern: 'soft' },
    { id: 'axolotl', label: 'Lavender Axolotl', shape: 'axolotl', color: '#D3BFFF', eyes: 'dots', mouth: 'smile', accessory: 'none', pattern: 'soft', blushColor: '#FF6FA0' },
    { id: 'frog', label: 'Matcha Frog', shape: 'frog', color: '#9ED97A', eyes: 'happy', mouth: 'grin', accessory: 'none', pattern: 'none' },
    { id: 'mouse', label: 'Strawberry Mouse', shape: 'mouse', color: '#FFC6D9', eyes: 'sparkle', mouth: 'cat', accessory: 'berry', pattern: 'none' },
    { id: 'toast', label: 'Toast Pal', shape: 'toast', color: '#E3A15E', eyes: 'shine', mouth: 'smile', accessory: 'none', pattern: 'none' },
    { id: 'moonkitty', label: 'Moon Kitty', shape: 'cat', color: '#3E3A6E', eyes: 'happy', eyeColor: '#FFE27A', mouth: 'cat', accessory: 'moon', pattern: 'stars', patColor: '#FFE27A', blushColor: '#FF6FA0' },
    { id: 'jelly', label: 'Jellyfish', shape: 'jellyfish', color: '#A8D8FF', eyes: 'shine', mouth: 'smile', accessory: 'bow', accColor: '#FFFFFF', pattern: 'soft' },
    { id: 'dragon', label: 'Little Dragon', shape: 'dragon', color: '#9BE07F', eyes: 'happy', mouth: 'grin', accessory: 'none', pattern: 'none' },
    { id: 'cactus', label: 'Cactus Buddy', shape: 'cactus', color: '#6CC46A', eyes: 'dots', mouth: 'smile', accessory: 'flower', accColor: '#FF8AB0', pattern: 'none' },
    { id: 'snail', label: 'Rainbow Snail', shape: 'snail', color: '#FFD9C2', eyes: 'shine', mouth: 'smile', accessory: 'none', pattern: 'none' },
    { id: 'koala', label: 'Gumtree Koala', shape: 'koala', color: '#A7A6B8', eyes: 'shine', mouth: 'smile', accessory: 'leaf', accColor: '#5FAF78', pattern: 'none', blushColor: '#FF9EB5' },
    { id: 'chameleon', label: 'Leafy Chameleon', shape: 'chameleon', color: '#7FD06B', eyes: 'dots', mouth: 'smile', accessory: 'none', pattern: 'soft', blushColor: '#FFB86B' },
    { id: 'monkey', label: 'Cheeky Monkey', shape: 'monkey', color: '#9C6B4E', eyes: 'shine', mouth: 'grin', accessory: 'none', pattern: 'none', blushColor: '#FF8A80' },
  ];
  const TEMPLATE_DEFAULTS = { pattern: 'none', patColor: '#FFFFFF', eyeColor: INK, blushColor: '#FF8A80', outline: false, outlineColor: INK, cheeks: true, freckles: false, accColor: '#5B8DEF' };

  // where the face sits on a shape (most shapes: the standard spot)
  function faceTransform(cfg) {
    const f = (SHAPES[cfg.shape] || {}).face;
    if (!f) return '';
    return `translate(${f.dx || 0} ${f.dy || 0}) translate(50 50) scale(${f.s || 1}) translate(-50 -50)`;
  }
  // face ink: the eye colour you picked, unless the shape needs light eyes (panda patches) and you kept the default
  function faceInk(cfg) {
    const sh = SHAPES[cfg.shape] || {};
    const e = cfg.eyeColor || INK;
    return sh.eyeInk && e.toLowerCase() === INK.toLowerCase() ? sh.eyeInk : e;
  }
  const FRECKLES = (cfg) => { const c = shade(cfg.color && /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : '#C98A5B', -0.4); return `<g fill="${c}" opacity=".6"><circle cx="22" cy="55" r="1"/><circle cx="26" cy="53.5" r="1"/><circle cx="25" cy="57.5" r="1"/><circle cx="78" cy="55" r="1"/><circle cx="74" cy="53.5" r="1"/><circle cx="75" cy="57.5" r="1"/></g>`; };

  // ---- arms, feet and tails (every classic shape; cfg.limbs === false turns them off, cfg.tail 'none' hides the tail) ----
  // Drawn in the same 100x100 space. Pivots (shoulders, hips, tail root) are fixed so buddy.html can animate them.
  const NO_LIMBS = new Set(['octopus', 'jellyfish', 'snail']);
  const TAILS = { cat: 'thin', mouse: 'thin', fox: 'fluffy', bunny: 'puff', bear: 'stub', panda: 'stub', dragon: 'spike', axolotl: 'thin' };
  const TAIL_DRAW = {
    thin: (c, d) => `<path d="M21 82 C9 85 3 77 5 68 C6 62 11 60 13 64" stroke="${d}" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M21 82 C9 85 3 77 5 68 C6 62 11 60 13 64" stroke="${c}" stroke-width="4.2" fill="none" stroke-linecap="round"/>`,
    fluffy: (c, d) => `<path d="M24 80 C6 88 -3 72 2 57 C4 49 13 47 15 53 C11 62 15 72 24 74Z" fill="${c}" stroke="${d}" stroke-width="1.2"/><path d="M2 57 C4 49 13 47 15 53 C11 55 6 57 2 57Z" fill="#fff"/>`,
    puff: (c, d) => `<circle cx="13" cy="80" r="8" fill="${shade(c, 0.55)}" stroke="${d}" stroke-width="1"/>`,
    stub: (c, d) => `<circle cx="15" cy="83" r="5.5" fill="${c}" stroke="${d}" stroke-width="1.2"/>`,
    spike: (c, d) => `<path d="M22 80 C9 87 2 80 4 71 L-2 64 L8 66 C8 72 13 76 22 74Z" fill="${c}" stroke="${d}" stroke-width="1.2"/>`,
    curl: (c, d) => `<path d="M21 83 C3 90 -3 70 8 62 C16 56 23 64 18 68 C14 71 10 67 12 64" stroke="${d}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M21 83 C3 90 -3 70 8 62 C16 56 23 64 18 68 C14 71 10 67 12 64" stroke="${c}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`,
    spiral: (c, d) => `<path d="M22 82 C5 86 -1 70 7 62 C14 56 23 63 19 69 C16 73 11 70 12 66" stroke="${d}" stroke-width="8.6" fill="none" stroke-linecap="round"/><path d="M22 82 C5 86 -1 70 7 62 C14 56 23 63 19 69 C16 73 11 70 12 66" stroke="${shade(c, -0.12)}" stroke-width="6.4" fill="none" stroke-linecap="round"/>`,
  };
  function limbs(cfg, sh, color) {
    if (NO_LIMBS.has(cfg.shape)) return { back: '', front: '' };
    const c = sh.body || color, d = shade(c, -0.3), f = shade(c, -0.1);
    const kind = cfg.tail === 'none' || cfg.tail === false ? null : (sh.tail || TAILS[cfg.shape]);
    const tail = kind && TAIL_DRAW[kind] ? `<g id="tail">${TAIL_DRAW[kind](c, d)}</g>` : '';
    const foot = (id, x) => `<g id="${id}" class="foot"><ellipse cx="${x}" cy="92.5" rx="9" ry="5.5" fill="${f}" stroke="${d}" stroke-width="1.2"/></g>`;
    const arm = (id, x, dir) => `<g id="${id}" class="arm"><path d="M${x} 58 Q${x - 7 * dir} 65 ${x - 6 * dir} 71" stroke="${d}" stroke-width="9.4" fill="none" stroke-linecap="round"/><path d="M${x} 58 Q${x - 7 * dir} 65 ${x - 6 * dir} 71" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="${x - 6 * dir}" cy="72" r="4.6" fill="${c}" stroke="${d}" stroke-width="1.2"/></g>`;
    const feet = cfg.feet === false ? '' : `<g id="feet">${foot('footL', 35)}${foot('footR', 65)}</g>`;
    const arms = cfg.arms === false ? '' : `<g id="arms">${arm('armL', 17, 1)}${arm('armR', 83, -1)}</g>`;
    return { back: `${tail}${feet}`, front: arms };
  }

  let uid = 0;
  // opts.live: leave the face empty (the floating buddy draws an animated one) and wrap the accessory so it can jiggle.
  function build(cfg = {}, opts = {}) {
    const color = cfg.color || '#FFCE47';
    const acc = cfg.accColor || '#5B8DEF';
    if (cfg.shape === 'image' && cfg.image) return buildImage(cfg, opts, acc);
    const sh = SHAPES[cfg.shape] || SHAPES.note;
    const id = `b${++uid}`;
    const fill = sh.body || color;
    const pat = (PATTERNS[cfg.pattern] || PATTERNS.none)(cfg.patColor || '#FFFFFF').replace('url(#__soft)', `url(#${id}s)`);
    const oc = cfg.outlineColor || INK;
    // rounded shapes (star) get their outline as a wider stroke underneath, so corners stay soft
    const outline = cfg.outline && !sh.round ? `<path d="${sh.sil}" fill="none" stroke="${oc}" stroke-width="2.6" stroke-linejoin="round"/>` : '';
    const under = cfg.outline && sh.round ? `<path d="${sh.sil}" fill="${oc}" stroke="${oc}" stroke-width="${sh.round + 5.2}" stroke-linejoin="round"/>` : '';
    const lb = limbs(cfg, sh, color);
    const body = `
      <defs>
        <clipPath id="${id}"><path d="${sh.sil}"/></clipPath>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
      </defs>
      ${lb.back}${sh.back ? sh.back(color) : ''}${under}
      <path d="${sh.sil}" fill="${fill}"${sh.round ? ` stroke="${fill}" stroke-width="${sh.round}" stroke-linejoin="round"` : ''}/>
      <g clip-path="url(#${id})">${pat}</g>
      ${sh.extra ? sh.extra(color) : ''}
      ${outline}
      ${lb.front}`;
    const ec = faceInk(cfg), bc = cfg.blushColor || '#FF8A80';
    const eyes = (EYES[cfg.eyes] || EYES.shine)(ec);
    const mouth = (MOUTHS[cfg.mouth] || MOUTHS.smile)(ec);
    const cheeks = (cfg.cheeks === false ? '' : `
      <ellipse cx="25" cy="58" rx="5" ry="3" fill="${bc}" opacity=".55"/>
      <ellipse cx="75" cy="58" rx="5" ry="3" fill="${bc}" opacity=".55"/>`) + (cfg.freckles ? FRECKLES(cfg) : '');
    const ft = faceTransform(cfg);
    const faceT = ft ? ` transform="${ft}"` : '';
    const dy = ON_HEAD.has(cfg.accessory) ? Math.max(0, (sh.top || 8) - 8) : 0;
    const accSvg = (ACCESSORIES[cfg.accessory] || ACCESSORIES.none)(acc);
    const accWrapped = AT_FACE.has(cfg.accessory) && ft ? `<g transform="${ft}">${accSvg}</g>` : dy ? `<g transform="translate(0 ${dy})">${accSvg}</g>` : accSvg;
    const cl = sh.cling && cfg.arms !== false && !NO_LIMBS.has(cfg.shape) ? ' data-cling="1"' : '';
    if (opts.live) {
      return `<svg id="buddy" viewBox="0 0 100 100" aria-label="${esc(cfg.name || 'Buddy')}"${cl}><g id="rig">
        ${body}
        <g${faceT}><g id="face"></g></g>
        <g id="acc">${accWrapped}</g>
      </g></svg>`;
    }
    return `<svg id="buddy" viewBox="0 0 100 100" aria-label="${esc(cfg.name || 'Buddy')}"${cl}><g id="rig">
      ${body}
      <g${faceT}><g id="face">
        ${eyes}
        ${cheeks}
        ${mouth}
      </g></g>
      ${accWrapped}
    </g></svg>`;
  }

  // Picture avatars: pan/zoom crop, a frame (rounded, circle or none), optional animated face on top.
  function buildImage(cfg, opts, acc) {
    const id = `c${++uid}`;
    const W0 = cfg.imageW || 1, H0 = cfg.imageH || 1;
    const crop = { zoom: 1, x: 0, y: 0, ...(cfg.imageCrop || {}) };
    const frame = cfg.imageFrame || 'rounded';
    // "cover" the 92x92 box, then zoom; pan (-1..1) moves across whatever overflows
    const k = (92 / Math.min(W0, H0)) * crop.zoom;
    const w = W0 * k, h = H0 * k;
    const x = 50 - w / 2 - (crop.x * (w - 92)) / 2;
    const y = 50 - h / 2 - (crop.y * (h - 92)) / 2;
    const clip = frame === 'circle' ? `<circle cx="50" cy="50" r="46"/>`
      : frame === 'none' ? `<rect x="-20" y="-20" width="140" height="140"/>`
      : `<rect x="4" y="4" width="92" height="92" rx="22"/>`;
    const f = { x: 0, y: 0, scale: 1, ...(cfg.face || {}) };
    const faceT = `translate(${f.x} ${f.y}) translate(50 50) scale(${f.scale}) translate(-50 -50)`;
    let face = '';
    if (cfg.faceOnImage) {
      face = opts.live
        ? `<g id="faceWrap" transform="${faceT}"><g id="face"></g></g>`
        : `<g id="faceWrap" transform="${faceT}"><g id="face">${(EYES[cfg.eyes] || EYES.shine)(cfg.eyeColor || INK)}${cfg.cheeks === false ? '' : `<ellipse cx="25" cy="58" rx="5" ry="3" fill="${cfg.blushColor || '#FF8A80'}" opacity=".55"/><ellipse cx="75" cy="58" rx="5" ry="3" fill="${cfg.blushColor || '#FF8A80'}" opacity=".55"/>`}${(MOUTHS[cfg.mouth] || MOUTHS.smile)()}</g></g>`;
    }
    return `<svg id="buddy" viewBox="0 0 100 100" aria-label="${esc(cfg.name || 'Buddy')}">
      <defs><clipPath id="${id}">${clip}</clipPath></defs>
      <image href="${esc(cfg.image)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="none" clip-path="url(#${id})"/>
      ${face}
      <g id="acc">${(ACCESSORIES[cfg.accessory] || ACCESSORIES.none)(acc)}</g>
    </svg>`;
  }

  window.Avatar = {
    build,
    shapes: Object.keys(SHAPES),
    eyes: Object.keys(EYES),
    mouths: Object.keys(MOUTHS),
    accessories: Object.keys(ACCESSORIES),
    patterns: Object.keys(PATTERNS),
    templates: TEMPLATES,
    applyTemplate: (t) => { const { id, label, ...look } = t; return { ...TEMPLATE_DEFAULTS, ...look }; },
    faceTransform, faceInk, FRECKLES,
    hasLimbs: (shape) => !!SHAPES[shape] && !NO_LIMBS.has(shape),
    hasTail: (shape) => !!SHAPES[shape] && !NO_LIMBS.has(shape) && !!((SHAPES[shape] || {}).tail || TAILS[shape]),
    clings: (shape) => !!(SHAPES[shape] || {}).cling,
  };
})();
