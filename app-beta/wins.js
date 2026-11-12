// "My week": a card with what you finished, your streak, your busiest day and money, drawn as an image you can save or
// share (WhatsApp story, Instagram). Made on this device from your own data; nothing is sent anywhere.
(function () {
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });   // the bridge may arrive after this file loads
  const T = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s);
  const loc = () => (window.I18n && I18n.locale ? I18n.locale() : undefined);
  const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const W = 1080, H = 1350;

  // the buddy's face matches the week
  const MOODS = {
    great: { line: 'What a week! 🎉', pose: { joy: 1, mouth: { o: 0.7, c: 0.9, w: 1.15 }, arms: [1.1, -1.1], brow: { a: 1, y: 1, ang: 0 } } },
    good: { line: 'Nice work this week!', pose: { joy: 1, mouth: { o: 0.35, c: 0.8, w: 1 }, arms: [0.5, -0.2] } },
    okay: { line: 'A steady start. Keep going!', pose: { mouth: { o: 0, c: 0.65, w: 1 }, look: [0.3, -0.1] } },
    rest: { line: 'A quiet week. Rest counts too.', pose: { open: [0.1, 0.1], mouth: { o: 0, c: 0.4, w: 0.8 }, look: [0, 0.4] } },
    worried: { line: 'Good work, but spending ran high.', pose: { sweat: 0.9, brow: { a: 1, y: 0.5, ang: -1 }, mouth: { o: 0.12, c: -0.3, w: 0.7 }, look: [-0.3, 0] } },
  };
  function moodOf(st) {
    if (st.budget && st.budget.spent > st.budget.total) return 'worried';
    if (st.done >= 6 || st.streak >= 3) return 'great';
    if (st.done >= 2) return 'good';
    if (st.done === 1) return 'okay';
    return 'rest';
  }

  async function buddyImage(look, pose) {
    if (!window.Rig || !look || !look.clay) return null;
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    c.style.cssText = 'position:fixed;left:-9999px;top:0;width:512px;height:512px';
    document.body.append(c);
    try { await Rig.paint(c, { clay: look.clay, color: look.color || null, pattern: look.pattern || 'none', patColor: look.patColor, cheeks: look.cheeks, blushColor: look.blushColor }, pose); } catch {}
    c.remove();
    return c.dataset.painted === '1' ? c : null;
  }

  const FONT = (w, px) => `${w} ${px}px "Segoe UI", Inter, system-ui, sans-serif`;
  function round(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // wrap into at most `lines` lines that fit `max` px; the last one gets "…" if it still doesn't fit
  function wrap(x, text, max, lines) {
    const words = String(text).split(/\s+/), out = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (x.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] += '…'; }
    return out.map((l) => { if (x.measureText(l).width <= max) return l; while (l.length > 1 && x.measureText(l + '…').width > max) l = l.slice(0, -1); return l + '…'; });
  }

  async function draw(st) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFF1CC'); g.addColorStop(1, '#FFFBF2');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const day = (s, o) => new Date(s + 'T12:00:00').toLocaleDateString(loc(), o);
    const mood = MOODS[moodOf(st)];
    const L = 80, R = W - 80;

    // buddy (top right), keeping its own proportions, sitting on a soft shadow
    const b = await buddyImage(st.look, mood.pose);
    if (b) {
      const box = 430, k = Math.min(box / b.width, box / b.height), bw = b.width * k, bh = b.height * k;
      x.fillStyle = 'rgba(43,42,76,.08)'; x.beginPath(); x.ellipse(R - box / 2, 60 + box - 8, box * 0.32, 22, 0, 0, 7); x.fill();
      x.drawImage(b, R - box + (box - bw) / 2, 60 + (box - bh), bw, bh);
    }
    // header + what the buddy says about the week
    x.fillStyle = '#2B2A4C'; x.font = FONT(800, 44); x.fillText(T('My week'), L, 120);
    x.fillStyle = '#6B6889'; x.font = FONT(500, 32);
    x.fillText(`${day(st.from, { day: 'numeric', month: 'short' })} – ${day(st.to, { day: 'numeric', month: 'short' })}`, L, 168);
    x.fillStyle = '#2B2A4C'; x.font = FONT(700, 42);
    wrap(x, T(mood.line), W - L - 470, 3).forEach((l, i) => x.fillText(l, L, 250 + i * 54));
    // the big number
    x.font = FONT(900, 210); x.fillText(String(st.done), L - 6, 560);
    const nw = x.measureText(String(st.done)).width;
    x.font = FONT(700, 46); x.fillText(st.done === 1 ? T('task done') : T('tasks done'), L + nw + 18, 548);

    // four tiles, two by two
    const tiles = [
      ['🔥', st.streak ? T('{0}-day streak', st.streak) : T('Start a streak tomorrow')],
      ['📅', st.busiest ? T('Busiest: {0} ({1})', day(st.busiest[0], { weekday: 'long' }), st.busiest[1]) : T('A calm week')],
      ['📁', st.projects.length ? T('Moved {0} project(s) forward', st.projects.length) : T('No projects this week')],
    ];
    if (st.moneyOut != null) tiles.push(['💸', st.budget ? (st.budget.spent <= st.budget.total ? T('{0} under budget this month', rp(st.budget.total - st.budget.spent)) : T('{0} over budget this month', rp(st.budget.spent - st.budget.total))) : st.moneyOut ? T('Spent {0} this week', rp(st.moneyOut)) : T('No spending this week')]);
    else tiles.push(['✅', T('{0} still open', st.open ?? 0)]);
    const tw = (R - L - 24) / 2, th = 150;
    tiles.forEach(([icon, text], i) => {
      const tx = L + (i % 2) * (tw + 24), ty = 610 + Math.floor(i / 2) * (th + 22);
      x.fillStyle = '#FFFFFF'; round(x, tx, ty, tw, th, 26); x.fill();
      x.strokeStyle = '#E9DFC8'; x.lineWidth = 3; x.stroke();
      x.font = '50px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif'; x.fillText(icon, tx + 26, ty + 66);
      x.fillStyle = '#2B2A4C'; x.font = FONT(700, 34);
      wrap(x, text, tw - 120, 2).forEach((l, k, arr) => x.fillText(l, tx + 100, ty + (arr.length === 1 ? 88 : 66 + k * 44)));
    });

    // what got done (as many as fit above the footer)
    let y = 610 + 2 * (th + 22) + 40;
    if (st.titles.length) {
      x.fillStyle = '#6B6889'; x.font = FONT(700, 30); x.fillText(T('Done this week'), L, y); y += 52;
      x.fillStyle = '#2B2A4C'; x.font = FONT(600, 34);
      for (const t of st.titles.slice().reverse()) {
        if (y > H - 170) break;
        x.fillText(wrap(x, '✓  ' + t, R - L, 1)[0], L, y); y += 50;
      }
    }
    // footer
    x.fillStyle = '#F2B21F'; round(x, L - 10, H - 125, R - L + 20, 72, 36); x.fill();
    x.fillStyle = '#2B2A4C'; x.font = FONT(700, 32);
    const foot = st.name && st.name !== 'Scribble' ? T('Made with Scribble · {0}', st.name) : T('Made with Scribble');
    x.fillText(foot, (W - x.measureText(foot).width) / 2, H - 78);
    return c;
  }

  async function open() {
    let st; try { st = await S.weekStats(); } catch { return; }
    const c = await draw(st);
    const ov = document.createElement('div'); ov.className = 'wins-ov';
    const card = document.createElement('div'); card.className = 'wins';
    const img = document.createElement('img'); img.src = c.toDataURL('image/png'); img.alt = T('My week');
    const row = document.createElement('div'); row.className = 'wins-btns';
    const close = Object.assign(document.createElement('button'), { className: 'btn ghost', textContent: T('Close'), type: 'button' });
    const save = Object.assign(document.createElement('button'), { className: 'btn ghost', textContent: T('Save image'), type: 'button' });
    const share = Object.assign(document.createElement('button'), { className: 'btn', textContent: T('Share'), type: 'button' });
    row.append(close, save, share); card.append(img, row); ov.append(card); document.body.append(ov);
    close.onclick = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const fname = `scribble-my-week-${st.to}.png`;
    save.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const file = new File([blob], fname, { type: 'image/png' });
    const NS = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.ScribbleShare;
    if (NS) {
      // Android: the phone's share sheet (WhatsApp, Instagram, save to Gallery…)
      save.hidden = true;
      share.onclick = async () => { try { await NS.shareImage({ data: img.src.split(',')[1], name: fname, title: T('My week') }); } catch (e) { window.toast && toast(String(e.message || e)); } };
      return;
    }
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) share.hidden = true;
    share.onclick = async () => { try { await navigator.share({ files: [file], title: T('My week') }); } catch {} };
  }

  window.Wins = { open, draw };
})();
