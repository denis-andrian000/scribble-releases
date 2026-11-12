// "My week": a card with what you finished, your streak, your busiest day and money, drawn as an image you can save or
// share (WhatsApp story, Instagram). Made on this device from your own data; nothing is sent anywhere.
(function () {
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });   // the bridge may arrive after this file loads
  const T = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s);
  const loc = () => (window.I18n && I18n.locale ? I18n.locale() : undefined);
  const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const W = 1080, H = 1350;

  async function buddyImage(look) {
    if (!window.Rig || !look || !look.clay) return null;
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    c.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:400px';
    document.body.append(c);
    try { await Rig.paint(c, { clay: look.clay, color: look.color || null, pattern: look.pattern || 'none', patColor: look.patColor, cheeks: look.cheeks, blushColor: look.blushColor }); } catch {}
    c.remove();
    return c.dataset.painted === '1' ? c : null;
  }

  function round(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function fitText(x, s, max, size, weight = 800) { let f = size; do { x.font = `${weight} ${f}px "Segoe UI", Inter, system-ui, sans-serif`; f -= 2; } while (x.measureText(s).width > max && f > 18); return s; }

  async function draw(st) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFF4D6'); g.addColorStop(1, '#FFFBF2');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // header
    const day = (s, o) => new Date(s + 'T12:00:00').toLocaleDateString(loc(), o);
    x.fillStyle = '#2B2A4C';
    x.font = '700 40px "Segoe UI", Inter, system-ui, sans-serif';
    x.fillText(T('My week'), 80, 120);
    x.fillStyle = '#6B6889'; x.font = '500 32px "Segoe UI", Inter, system-ui, sans-serif';
    x.fillText(`${day(st.from, { day: 'numeric', month: 'short' })} – ${day(st.to, { day: 'numeric', month: 'short' })}`, 80, 170);
    // big number
    x.fillStyle = '#2B2A4C'; x.font = '900 260px "Segoe UI", Inter, system-ui, sans-serif';
    x.fillText(String(st.done), 70, 450);
    const nw = x.measureText(String(st.done)).width;
    x.font = '700 48px "Segoe UI", Inter, system-ui, sans-serif';
    x.fillText(st.done === 1 ? T('task done') : T('tasks done'), 90 + nw, 440);
    // buddy
    const b = await buddyImage(st.look);
    if (b) x.drawImage(b, W - 440, 60, 380, 380);
    // tiles
    const tiles = [
      ['🔥', st.streak ? T('{0}-day streak', st.streak) : T('Start a streak tomorrow')],
      ['📅', st.busiest ? T('Busiest: {0} ({1})', day(st.busiest[0], { weekday: 'long' }), st.busiest[1]) : T('A calm week')],
      ['📁', st.projects.length ? T('Moved {0} project(s) forward', st.projects.length) : T('No projects this week')],
    ];
    if (st.moneyOut != null) tiles.push(['💸', st.budget ? (st.budget.spent <= st.budget.total ? T('{0} under budget this month', rp(st.budget.total - st.budget.spent)) : T('{0} over budget this month', rp(st.budget.spent - st.budget.total))) : T('Spent {0} this week', rp(st.moneyOut))]);
    let y = 520;
    for (const [icon, text] of tiles) {
      x.fillStyle = '#FFFFFF'; round(x, 70, y, W - 140, 120, 28); x.fill();
      x.strokeStyle = '#E9DFC8'; x.lineWidth = 3; x.stroke();
      x.font = '56px "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; x.fillText(icon, 105, y + 82);
      x.fillStyle = '#2B2A4C'; fitText(x, text, W - 330, 44, 700); x.fillText(text, 200, y + 76);
      y += 145;
    }
    // finished
    if (st.titles.length) {
      x.fillStyle = '#6B6889'; x.font = '600 32px "Segoe UI", Inter, system-ui, sans-serif';
      x.fillText(T('Done this week'), 80, y + 40);
      x.fillStyle = '#2B2A4C';
      st.titles.slice(-4).forEach((s, i) => { const t = '✓  ' + s; fitText(x, t, W - 160, 34, 600); x.fillText(t.length > 60 ? t.slice(0, 58) + '…' : t, 80, y + 95 + i * 50); });
    }
    // footer
    x.fillStyle = '#F2B21F'; round(x, 70, H - 120, W - 140, 70, 35); x.fill();
    x.fillStyle = '#2B2A4C'; x.font = '700 32px "Segoe UI", Inter, system-ui, sans-serif';
    const foot = T('Made with Scribble · {0}', st.name); x.fillText(foot, (W - x.measureText(foot).width) / 2, H - 74);
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

  window.Wins = { open };
})();
