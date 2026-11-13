// Tasks → Timeline: one bar per task from its start date to its due date, grouped by area and project.
// Full width: a Gantt chart you can drag (move a bar, or drag its ends to change the dates).
// Narrow (phone, small panel): one card per project with thin bars; tap a task to change it.
// Uses panel.js helpers: $, $$, el, updTask, isClosedT, normPri, toast, I18n, loadTasks.
(function () {
  const T = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s);
  const DAY = 86400000;
  const ZOOM = { week: 36, month: 13, quarter: 4.5 };            // px per day
  const store = {
    get(k, d) { try { const v = localStorage.getItem('scribble.tl.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('scribble.tl.' + k, JSON.stringify(v)); } catch {} },
  };
  let zoom = store.get('zoom', 'month');
  let showDone = store.get('done', false);
  let onlyProject = '';
  const collapsed = new Set(store.get('collapsed', []));
  let all = [];
  // a plan the buddy suggested but nothing is saved yet: id → { start, due }, shown as striped bars
  let preview = null;
  const eff = (t) => {
    const c = preview && preview.changes.get(t.id);
    if (!c) return t;
    return { ...t, due: c.due, start: c.start || (t.start && t.start <= c.due ? t.start : c.due) };
  };

  const d2n = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / DAY);            // date → day number
  const n2d = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const todayStr = () => new Date(Date.now() - (globalThis.__scribbleDayStartMs || 0)).toLocaleDateString('en-CA');
  const loc = () => (window.I18n && I18n.locale ? I18n.locale() : undefined);
  const fmt = (s, o = { day: 'numeric', month: 'short' }) => new Date(s + 'T12:00:00').toLocaleDateString(loc(), o);
  const STATUS = { todo: 'To do', doing: 'In progress', hold: 'On hold', done: 'Done', cancelled: 'Cancelled' };

  function span(t) {                    // [startDay, endDay] or null when it has no dates
    if (!t.due && !t.start) return null;
    const a = d2n(t.start || t.due), b = d2n(t.due || t.start);
    return [Math.min(a, b), Math.max(a, b)];
  }
  function kind(t, today) {
    if (t.status === 'done') return 'done';
    if (t.status === 'cancelled') return 'cancelled';
    if (t.status === 'hold') return 'hold';
    if (t.due && t.due < today) return 'late';
    return t.status === 'doing' ? 'doing' : 'todo';
  }
  function label(t, k, today) {
    if (k === 'late') { const n = d2n(today) - d2n(t.due); return n === 1 ? T('1 day late') : T('{0} days late', n); }
    return T(STATUS[t.status] || 'To do');
  }

  // Section (area) → Project (category folder) → Sub project → tasks, the same as the Tree.
  // Tasks with no sub project wait in General.
  let catOf = new Map();
  const LV = (k) => (typeof lv === 'function' ? lv(k) : ({ area: 'Section', category: 'Project', project: 'Sub project' })[k]);
  const catFor = (a, p) => (p ? catOf.get(`${a}|${p.toLowerCase()}`) || '' : '');
  function groups(list) {
    const areas = new Map();
    for (const t of list) {
      const p = t.project || '', a = p ? t.area || '' : '';
      if (!areas.has(a)) areas.set(a, new Map());
      const ps = areas.get(a);
      if (!ps.has(p)) ps.set(p, []);
      ps.get(p).push(t);
    }
    const out = [...areas.entries()].sort((x, y) => (x[0] === '') - (y[0] === '') || x[0].localeCompare(y[0]));
    return out.map(([a, ps]) => [a, [...ps.entries()].map(([p, ts]) => [p, ts, catFor(a, p)])
      .sort((x, y) => (x[0] === '') - (y[0] === '') || (x[2] === '') - (y[2] === '') || x[2].localeCompare(y[2]) || x[0].localeCompare(y[0]))]);
  }
  const byStart = (x, y) => ((span(x) || [1e9])[0] - (span(y) || [1e9])[0]) || String(x.due || '').localeCompare(String(y.due || ''));

  async function render() {
    const box = $('#task-timeline');
    const [ts, nodes] = await Promise.all([S.tasks(), S.nested ? S.nested().catch(() => []) : []]);
    all = ts;
    catOf = new Map();
    if (typeof projectsFromTree === 'function') for (const { area, category, project } of projectsFromTree(nodes || [])) catOf.set(`${area || ''}|${project.toLowerCase()}`, category || '');
    const today = todayStr();
    const projects = [...new Set(all.filter((t) => t.project).map((t) => t.project))].sort();
    if (onlyProject && !projects.includes(onlyProject)) onlyProject = projects.find((p) => p.toLowerCase() === onlyProject.toLowerCase()) || '';
    const visible = all.filter((t) => (showDone || !isClosedT(t)) && (!onlyProject || t.project === onlyProject));
    const dated = visible.filter((t) => span(eff(t))), undated = visible.filter((t) => !span(eff(t)));

    box.innerHTML = '';
    // toolbar: zoom · today · project · show done
    const bar = el('div', 'tl-bar');
    const zs = el('div', 'seg small');
    for (const z of ['week', 'month', 'quarter']) {
      const b = el('button', z === zoom ? 'on' : ''); b.type = 'button'; b.textContent = T(z[0].toUpperCase() + z.slice(1));
      b.addEventListener('click', () => { zoom = z; store.set('zoom', z); render(); });
      zs.append(b);
    }
    const tb = el('button', 'tl-today'); tb.type = 'button'; tb.textContent = T('Today');
    tb.addEventListener('click', () => scrollToday(true));
    const ps = el('select', 'tl-psel');
    ps.innerHTML = ''; { const o = el('option'); o.value = ''; o.textContent = T('All: {0}', LV('project')); ps.append(o); }
    for (const p of projects) { const o = el('option'); o.value = p; o.textContent = p; ps.append(o); }
    ps.value = onlyProject;
    ps.addEventListener('change', () => { onlyProject = ps.value; render(); });
    const dl = el('label', 'tl-done'); const dc = el('input'); dc.type = 'checkbox'; dc.checked = showDone;
    dc.addEventListener('change', () => { showDone = dc.checked; store.set('done', showDone); render(); });
    dl.append(dc, document.createTextNode(' ' + T('Show done')));
    bar.append(zs, tb, el('span', 'tl-sp'), ps, dl);
    box.append(bar);
    if (preview) {
      const pb = el('div', 'tl-preview');
      const s = el('span'); s.textContent = T('👀 Preview from {0}, not saved yet: {1} task(s) get new dates', preview.who || 'your buddy', preview.changes.size);
      const d = el('button', 'btn ghost'); d.type = 'button'; d.textContent = T('Discard'); d.addEventListener('click', () => preview && preview.onDiscard && preview.onDiscard());
      const ok = el('button', 'btn'); ok.type = 'button'; ok.textContent = T('Save all'); ok.addEventListener('click', () => preview && preview.onSave && preview.onSave());
      pb.append(s, el('span', 'tl-sp'), d, ok);
      box.append(pb);
    }

    if (!dated.length && !undated.length) { box.append(el('div', 'none', T('No open tasks. Tell the buddy what you need to do.'))); return; }
    const narrow = box.clientWidth < 620;
    if (dated.length) (narrow ? cards : gantt)(box, dated, today);
    else box.append(el('div', 'none', T('None of these tasks have dates yet.')));
    if (undated.length) {
      const u = el('details', 'tl-undated');
      const s = el('summary'); s.textContent = T('No dates yet ({0})', undated.length); u.append(s);
      for (const t of undated.sort((a, b) => a.title.localeCompare(b.title))) {
        const r = el('button', 'tl-urow'); r.type = 'button';
        r.textContent = t.title + (t.project ? ` · ${t.project}` : '');
        r.addEventListener('click', (e) => pop(t, e.currentTarget));
        u.append(r);
      }
      box.append(u);
    }
    legend(box);
    // previewing: bring the suggested dates into view; otherwise around today
    const firstDraft = preview && scroller && scroller.querySelector('.tl-draft');
    if (firstDraft) scroller.scrollTo({ left: Math.max(0, firstDraft.offsetLeft - 240 - 7 * pxDay) }); else scrollToday(false);
  }

  function legend(box) {
    const l = el('div', 'tl-legend');
    for (const [k, s] of [['todo', 'To do'], ['doing', 'In progress'], ['hold', 'On hold'], ['done', 'Done'], ['late', 'Late']]) {
      const i = el('span'); i.innerHTML = `<i class="tl-k ${k}"></i>`; i.append(T(s)); l.append(i);
    }
    const d = el('span'); d.innerHTML = '<i class="tl-k dia"></i>'; d.append(T('One-day task')); l.append(d);
    box.append(l);
  }

  // ---------------- full width: Gantt ----------------
  let scroller = null, pxDay = 13, day0 = 0;
  function gantt(box, list, today) {
    pxDay = ZOOM[zoom];
    const t0 = d2n(today);
    let lo = t0 - 14, hi = t0 + 45;
    for (const t of list) for (const s of [span(eff(t)), span(t)]) if (s) { lo = Math.min(lo, s[0] - 5); hi = Math.max(hi, s[1] + 10); }
    const minDays = Math.ceil((box.clientWidth - 240) / pxDay) + 2;
    if (hi - lo < minDays) hi = lo + minDays;
    day0 = lo;
    const W = (hi - lo + 1) * pxDay;
    const x = (n) => (n - lo) * pxDay;

    const g = el('div', 'tl-gantt'); scroller = g;
    g.style.setProperty('--tl-w', W + 'px');
    // header
    const head = el('div', 'tl-row tl-head');
    const hn = el('div', 'tl-name'); hn.textContent = `${LV('project')} / ${T('task')}`;
    const hl = el('div', 'tl-lane');
    for (let n = lo; n <= hi; n++) {
      const d = new Date(n * DAY), dow = d.getUTCDay(), dom = d.getUTCDate();
      const tick = zoom === 'week' ? true : zoom === 'month' ? dow === 1 : dom === 1;
      if (zoom === 'week' && (dow === 0 || dow === 6)) { const w = el('div', 'tl-wkend'); w.style.left = x(n) + 'px'; w.style.width = pxDay + 'px'; hl.append(w); }
      if (!tick) continue;
      const c = el('div', 'tl-tick'); c.style.left = x(n) + 'px';
      const iso = n2d(n);
      const mon = fmt(iso, { month: 'short' });
      if (zoom === 'quarter') c.innerHTML = `<b></b>`, c.firstChild.textContent = dom === 1 && d.getUTCMonth() === 0 ? fmt(iso, { month: 'short', year: 'numeric' }) : mon;
      else { c.innerHTML = '<b></b><span></span>'; c.firstChild.textContent = zoom === 'week' ? (dom === 1 || dow === 1 ? fmt(iso, { day: 'numeric', month: 'short' }) : '') : (dom <= 7 ? fmt(iso, { month: 'long' }) : ''); c.lastChild.textContent = zoom === 'week' ? fmt(iso, { weekday: 'narrow' }) : fmt(iso); }
      hl.append(c);
    }
    head.append(hn, hl); g.append(head);

    const body = el('div', 'tl-body');
    const now = el('div', 'tl-now'); now.style.left = (240 + x(t0) + pxDay / 2) + 'px'; now.innerHTML = `<b>${T('Today')}</b>`;
    body.append(now);
    const grid = el('div', 'tl-grid'); grid.style.backgroundSize = `${(zoom === 'quarter' ? 30 : 7) * pxDay}px 100%`;
    grid.style.backgroundPosition = `${240 + x(lo + ((8 - new Date(lo * DAY).getUTCDay()) % 7))}px 0`;
    body.append(grid);

    for (const [area, projects] of groups(list)) {
      const ar = el('div', 'tl-row tl-area'); const an = el('div', 'tl-name'); an.textContent = area || T('General'); ar.append(an, el('div', 'tl-lane')); body.append(ar);
      let lastCat = null;
      for (const [proj, tasks, cat] of projects) {
        const key = `${area}|${proj}`;
        if (proj && cat && cat !== lastCat) {
          const cr = el('div', 'tl-row tl-cat'); const cn = el('div', 'tl-name'); cn.textContent = '🗂 ' + cat; cn.title = `${LV('category')}: ${cat}`;
          cr.append(cn, el('div', 'tl-lane')); body.append(cr);
        }
        lastCat = cat;
        if (!proj) {
          const wr = el('div', 'tl-row tl-proj tl-nop'); const wn = el('div', 'tl-name'); wn.textContent = '⚠ ' + T('no {0}', LV('project'));
          wn.title = T('Not in a {0} yet. Drag it into one.', LV('project'));
          wr.append(wn, el('div', 'tl-lane')); body.append(wr);
        }
        if (proj) {
          const everything = all.filter((t) => t.project === proj && (t.area || '') === area);
          const done = everything.filter((t) => t.status === 'done').length;
          const live = everything.filter((t) => t.status !== 'cancelled');
          const pct = live.length ? Math.round(done / live.length * 100) : 0;
          const ss = everything.map((t) => span(eff(t))).filter(Boolean);
          const pr = el('div', 'tl-row tl-proj');
          const pn = el('button', 'tl-name'); pn.type = 'button';
          pn.innerHTML = `<span class="tl-car">${collapsed.has(key) ? '▸' : '▾'}</span><span class="tl-pn"></span><span class="tl-pct">${pct}%</span>`;
          pn.querySelector('.tl-pn').textContent = proj; pn.title = `${LV('project')}: ${proj}`;
          if (cat) pn.classList.add('in');
          if (window.Planner) {
            const h = Planner.health(everything, { today });
            if (h.state !== 'done') { const d = el('span', `hdot ${h.state}`); d.title = `${T({ ok: 'On track', risk: 'At risk', late: 'Late' }[h.state])}: ${T(h.key, ...h.args)}`; pn.querySelector('.tl-pn').after(d); }
          }
          pn.addEventListener('click', () => { collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key); store.set('collapsed', [...collapsed]); render(); });
          const pl = el('div', 'tl-lane');
          if (ss.length) {
            const a = Math.min(...ss.map((s) => s[0])), b = Math.max(...ss.map((s) => s[1]));
            const sb = el('div', 'tl-sum'); sb.style.left = x(a) + 'px'; sb.style.width = (b - a + 1) * pxDay + 'px';
            sb.innerHTML = `<i style="width:${pct}%"></i>`; sb.title = `${proj}: ${fmt(n2d(a))} → ${fmt(n2d(b))} · ${pct}%`;
            pl.append(sb);
          }
          pr.append(pn, pl); body.append(pr);
          if (collapsed.has(key)) continue;
        }
        for (const t of tasks.sort(byStart)) body.append(taskRow(t, today, x, proj ? (cat ? 2 : 1) : 1));
      }
    }
    g.append(body);
    box.append(g);
  }

  function taskRow(t, today, x, indent) {
    const r = el('div', 'tl-row tl-task');
    const n = el('button', 'tl-name' + (indent === 2 ? ' in2' : indent ? ' in' : '')); n.type = 'button'; n.textContent = t.title; n.title = t.title;
    n.addEventListener('click', (e) => pop(t, e.currentTarget));
    const lane = el('div', 'tl-lane');
    if (preview && preview.changes.has(t.id)) return previewRow(t, today, x, r, n, lane);
    const [a, b] = span(t), k = kind(t, today);
    const one = a === b;
    const bar = el('div', `tl-b ${k}${one ? ' dia' : ''}`);
    const place = (s, e) => { bar.style.left = x(s) + 'px'; bar.style.width = (one ? pxDay : (e - s + 1) * pxDay) + 'px'; };
    place(a, b);
    if (!one) { const tx = el('span'); tx.textContent = label(t, k, today); bar.append(tx); }
    else { const tx = el('span', 'tl-dlab'); tx.textContent = t.title; bar.append(tx); }
    bar.title = `${t.title}\n${t.start ? fmt(t.start) : '?'} → ${t.due ? fmt(t.due) : '?'}${t.time ? ' ' + t.time : ''} · ${label(t, k, today)}${t.priority ? ' · ' + T(cap(normPri(t.priority) || '')) : ''}\n${T('Drag to move, drag the ends to change the dates. Click to open.')}`;
    if (!isClosedT(t)) {
      if (!one) bar.append(el('i', 'tl-h l'), el('i', 'tl-h r'));
      drag(bar, t, a, b, place);
    } else bar.addEventListener('click', (e) => pop(t, bar, e));
    lane.append(bar);
    r.append(n, lane);
    return r;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // a task the buddy wants to move: where it was (dashed) and where it would go (striped, draggable)
  function previewRow(t, today, x, r, n, lane) {
    const old = span(t);
    if (old) {
      const g = el('div', 'tl-b tl-ghost'); g.style.left = x(old[0]) + 'px'; g.style.width = (old[1] - old[0] + 1) * pxDay + 'px';
      g.title = T('Now: {0} → {1}', t.start ? fmt(t.start) : '?', t.due ? fmt(t.due) : '?');
      lane.append(g);
    }
    const e = eff(t), [a, b] = span(e);
    const bar = el('div', 'tl-b tl-draft');
    const place = (s, en) => { bar.style.left = x(s) + 'px'; bar.style.width = (en - s + 1) * pxDay + 'px'; bar.firstChild && (bar.firstChild.textContent = `${fmt(n2d(s))} → ${fmt(n2d(en))}`); };
    bar.append(el('span'));
    place(a, b);
    bar.append(el('i', 'tl-h l'), el('i', 'tl-h r'));
    bar.title = T('Suggested by your buddy. Drag to adjust before saving.');
    drag(bar, t, a, b, place, (s, en) => { preview.changes.set(t.id, { start: n2d(s), due: n2d(en) }); if (preview.onDrag) preview.onDrag(t.id, n2d(s), n2d(en)); render(); });
    lane.append(bar);
    r.classList.add('tl-changed');
    r.append(n, lane);
    return r;
  }

  function drag(bar, t, a, b, place, commit = null) {
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'm';
      const x0 = e.clientX; let s = a, en = b, moved = false;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dd = Math.round((ev.clientX - x0) / pxDay);
        if (Math.abs(ev.clientX - x0) > 3) moved = true;
        if (mode === 'm') { s = a + dd; en = b + dd; }
        else if (mode === 'l') { s = Math.min(a + dd, b); en = b; }
        else { s = a; en = Math.max(b + dd, a); }
        place(s, en); bar.classList.add('dragging');
        bar.dataset.tip = `${fmt(n2d(s))} → ${fmt(n2d(en))}`;
      };
      const up = async () => {
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        bar.classList.remove('dragging'); delete bar.dataset.tip;
        if (!moved) { if (!commit) pop(t, bar); return; }
        if (s === a && en === b) return;
        if (commit) return commit(s, en);
        const patch = { start: n2d(s), due: n2d(en) };
        const r = await updTask(t.id, patch);
        if (r && r.ok === false) toast(r.error);   // a good change shows its own toast with Undo
        render();
      };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  }

  function scrollToday(smooth) {
    if (!scroller || !scroller.isConnected) return;
    const left = Math.max(0, (d2n(todayStr()) - day0 - (zoom === 'week' ? 3 : zoom === 'month' ? 12 : 30)) * pxDay);
    scroller.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---------------- narrow: one card per project ----------------
  function cards(box, list, today) {
    const t0 = d2n(today);
    for (const [area, projects] of groups(list)) {
      if (area || groups(list).length > 1) { const h = el('div', 'tl-carea'); h.textContent = area || T('General'); box.append(h); }
      let lastCat = null;
      for (const [proj, tasks, cat] of projects) {
        if (proj && cat && cat !== lastCat) { const h = el('div', 'tl-ccat'); h.textContent = '🗂 ' + cat; box.append(h); }
        lastCat = cat;
        const ss = tasks.map(span);
        let a = Math.min(...ss.map((s) => s[0]), t0), b = Math.max(...ss.map((s) => s[1]), t0);
        if (b - a < 13) b = a + 13;
        const len = b - a + 1, pc = (n) => ((n - a) / len * 100).toFixed(2) + '%';
        const c = el('div', 'tl-card');
        const everything = all.filter((t) => (t.project || '') === proj && (t.area || '') === area && t.status !== 'cancelled');
        const pct = everything.length ? Math.round(everything.filter((t) => t.status === 'done').length / everything.length * 100) : 0;
        const ends = Math.max(...ss.map((s) => s[1]));
        const h = el('div', 'tl-ch'); h.innerHTML = '<b></b><span></span>';
        h.firstChild.textContent = proj || '⚠ ' + T('no {0}', LV('project'));
        h.lastChild.textContent = T('{0}% · ends {1}', pct, fmt(n2d(ends)));
        c.append(h);
        const ax = el('div', 'tl-cax');
        for (let i = 0; i < 4; i++) { const n = Math.round(a + (len - 1) * i / 3); const s = el('span'); s.style.left = pc(n); s.textContent = fmt(n2d(n)); ax.append(s); }
        c.append(ax);
        const lanes = el('div', 'tl-clanes');
        const now = el('div', 'tl-cnow'); now.style.left = pc(t0 + 0.5); lanes.append(now);
        for (const t of tasks.sort(byStart)) {
          const [s, e] = span(t), k = kind(t, today);
          const r = el('button', 'tl-cl'); r.type = 'button';
          const tl = el('span', 'tl-ct'); tl.textContent = t.title + (k === 'late' ? ` · ${label(t, k, today)}` : '');
          const bb = el('i', `tl-cb ${k}`); bb.style.left = pc(s); bb.style.width = `max(8px, ${((e - s + 1) / len * 100).toFixed(2)}%)`;
          r.append(tl, bb);
          r.addEventListener('click', () => pop(t, r));
          lanes.append(r);
        }
        c.append(lanes);
        box.append(c);
      }
    }
  }

  // ---------------- a small sheet to change one task ----------------
  function pop(t, anchor) {
    document.querySelector('.tl-pop')?.remove();
    const p = el('div', 'tl-pop');
    const h = el('b'); h.textContent = t.title;
    const sub = el('small'); sub.textContent = [t.area, t.project].filter(Boolean).join(' · ');
    const row = (lab, input) => { const l = el('label'); const s = el('span'); s.textContent = T(lab); l.append(s, input); return l; };
    const st = el('input'); st.type = 'date'; st.value = t.start || '';
    const du = el('input'); du.type = 'date'; du.value = t.due || '';
    const tm = el('input'); tm.type = 'time'; tm.value = t.time || '';
    const ss = el('select'); for (const [v, s] of Object.entries(STATUS)) { const o = el('option'); o.value = v; o.textContent = T(s); ss.append(o); } ss.value = t.status || 'todo';
    const pr = el('select'); for (const v of ['low', 'medium', 'high']) { const o = el('option'); o.value = v; o.textContent = T(cap(v)); pr.append(o); } pr.value = normPri(t.priority) || 'medium';
    const btns = el('div', 'tl-pbtns');
    const cancel = el('button', 'ghost'); cancel.type = 'button'; cancel.textContent = T('Cancel');
    const save = el('button', 'primary'); save.type = 'button'; save.textContent = T('Save');
    btns.append(cancel, save);
    p.append(h, sub, row('Start', st), row('Due', du), row('Time', tm), row('Status', ss), row('Priority', pr), btns);
    cancel.addEventListener('click', () => p.remove());
    save.addEventListener('click', async () => {
      const patch = {};
      if (st.value && st.value !== t.start) patch.start = st.value;
      if (du.value && du.value !== t.due) patch.due = du.value;
      if ((tm.value || null) !== (t.time || null)) patch.time = tm.value || null;
      if (ss.value !== t.status) patch.status = ss.value;
      if (pr.value !== normPri(t.priority)) patch.priority = pr.value;
      p.remove();
      if (!Object.keys(patch).length) return;
      const r = await updTask(t.id, patch);
      if (r && r.ok === false) toast(r.error);
      render();
    });
    document.body.append(p);
    const rc = anchor.getBoundingClientRect(), pw = Math.min(290, window.innerWidth - 24);
    p.style.width = pw + 'px';
    p.style.left = Math.max(12, Math.min(rc.left, window.innerWidth - pw - 12)) + 'px';
    const below = rc.bottom + 6, ph = p.offsetHeight;
    p.style.top = (below + ph < window.innerHeight - 8 ? below : Math.max(8, rc.top - ph - 6)) + 'px';
    setTimeout(() => {
      const off = (e) => { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('pointerdown', off, true); } };
      document.addEventListener('pointerdown', off, true);
    });
  }

  // the buddy opened the timeline: one project (or all), maybe a zoom
  function focus({ project = '', zoom: z = null } = {}) {
    onlyProject = project || '';
    if (z && ZOOM[z]) { zoom = z; store.set('zoom', z); }
    if (project) {
      const hit = all.find((t) => String(t.project || '').toLowerCase() === project.toLowerCase());
      if (hit) onlyProject = hit.project;
    }
  }
  // the buddy's suggested dates, shown before anything is saved (null clears it)
  function setPreview(p) { preview = p && p.changes && p.changes.size ? p : null; if (p && 'project' in p) onlyProject = p.project || ''; const box = $('#task-timeline'); if (box && !box.hidden) render(); }
  window.Timeline = { render, focus, setPreview, hasPreview: () => !!preview };
})();
