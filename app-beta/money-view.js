// Money area of the panel: month totals, wallets, the records table (filters, search, click a cell to fix it),
// a form to add a record by hand, and the Wallets / Categories screens. The data and every calculation live in the
// main process (money.js); this file only shows it and sends changes back.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });     // the bridge may arrive after this file loads (Android)
  const t = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s);
  const loc = () => (window.I18n ? I18n.locale() : undefined);
  const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const state = { month: thisMonth(), wallet: '', q: '', kind: '', cat: '', data: null, editing: null, sheet: null };

  const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' }); }
  function shiftMonth(ym, d) { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); }
  const dayLabel = (d) => new Date(d + 'T12:00').toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  function toast(msg) { if (window.toast) window.toast(msg); }

  // ---- wallet badges: your own picture, or the familiar colour + initials of well-known wallets and banks (no logos)
  const BRANDS = [
    [/gopay|gojek/, '#00AED6', '#fff', 'GP'], [/\bdana\b/, '#118EEA', '#fff', 'DA'], [/\bovo\b/, '#4C3494', '#fff', 'OVO'],
    [/shopee ?pay|spay/, '#EE4D2D', '#fff', 'SP'], [/link ?aja/, '#E82127', '#fff', 'LA'], [/isaku|i\.saku/, '#E30613', '#fff', 'iS'],
    [/\bbca\b|blu by bca|\bblu\b/, '#0060AF', '#fff', 'BCA'], [/mandiri|livin/, '#003D79', '#FFB700', 'M'], [/\bbri\b|brimo/, '#00529C', '#fff', 'BRI'],
    [/\bbni\b/, '#F15A23', '#fff', 'BNI'], [/\bbsi\b|syariah indonesia/, '#00A39D', '#fff', 'BSI'], [/\bbtn\b/, '#0064A8', '#FFD200', 'BTN'],
    [/cimb|octo/, '#7B1113', '#fff', 'CN'], [/permata/, '#00843D', '#fff', 'PB'], [/\bjago\b/, '#FDB813', '#222', 'J'], [/jenius|\bbtpn\b/, '#00A6E2', '#fff', 'Je'],
    [/seabank|sea bank/, '#FF5A00', '#fff', 'SB'], [/danamon/, '#F7A600', '#222', 'D'], [/\bocbc\b/, '#E2001A', '#fff', 'OC'], [/\bmega\b/, '#F4A300', '#222', 'MG'],
    [/maybank/, '#FFC600', '#222', 'MB'], [/\buob\b/, '#0B3B8C', '#fff', 'UOB'], [/neo ?bank|\bbnc\b/, '#FFC107', '#222', 'neo'], [/allo/, '#6C2BD9', '#fff', 'Al'],
    [/flip/, '#FF6C2F', '#fff', 'F'], [/paypal/, '#003087', '#fff', 'PP'],
  ];
  function walletBadge(w, cls = '') {
    if (w.image) { const im = h('img', 'mn-badge img ' + cls); im.src = w.image; im.alt = ''; return im; }
    const n = String(w.name || '').toLowerCase();
    const b = BRANDS.find(([re]) => re.test(n));
    if (b) { const s = h('span', 'mn-badge ' + cls, b[3]); s.style.background = b[1]; s.style.color = b[2]; if (b[3].length > 2) s.classList.add('long'); return s; }
    const d = h('i', 'mn-badge dot ' + cls); d.style.background = w.color || 'var(--ink-2)'; return d;
  }
  // a picture you pick → a small square image kept with the wallet
  function pickPicture() {
    return new Promise((res) => {
      const inp = h('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return res(null);
        try {
          const bmp = await createImageBitmap(f);
          const c = document.createElement('canvas'); c.width = c.height = 96;
          const k = Math.max(96 / bmp.width, 96 / bmp.height), w = bmp.width * k, hh = bmp.height * k;
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 96, 96); x.drawImage(bmp, (96 - w) / 2, (96 - hh) / 2, w, hh);
          res(c.toDataURL('image/webp', 0.85).startsWith('data:image/webp') ? c.toDataURL('image/webp', 0.85) : c.toDataURL('image/png'));
        } catch { res(null); }
      };
      inp.click();
    });
  }

  async function show() {
    $('#mn-mlabel').textContent = monthLabel(state.month);
    let d = null;
    try { d = await S.moneyMonth(state.month); } catch {}
    state.data = d || { totals: { in: 0, out: 0, nIn: 0, nOut: 0, planned: 0 }, wallets: [], records: [], categories: [], shops: [] };
    render();
    plans();
    if (state.sheet) state.sheet();
  }

  // ---- Plans: bills coming up (and the ones that repeat), who owes you, savings goals
  async function plans() {
    const box = $('#mn-plans'); if (!box) return;
    let p = null; try { p = await S.moneyPlans(); } catch {}
    box.textContent = '';
    if (!p) return;
    const day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(window.I18n ? I18n.locale() : undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const card = (title, hint) => { const c = h('div', 'mn-card mn-plan'); const hd = h('div', 'mn-card-head'); hd.append(h('h4', '', t(title))); c.append(hd); if (hint) c.append(h('small', 'mn-plan-hint', t(hint))); return c; };
    const done = async (r) => { if (r && r.ok === false) window.toast && toast(r.error); show(); };

    const bills = card('Bills coming up', p.upcoming.length || p.recurring.length ? null : 'Tell your buddy about bills that repeat, like "BPJS 150rb every 10th from BCA".');
    for (const u of p.upcoming.slice(0, 6)) {
      const row = h('div', 'mn-prow');
      row.append(h('span', 'mn-pd', day(u.date)), h('span', 'mn-pt', (u.recurring ? '↻ ' : '') + u.description), h('b', '', rp(u.amount)));
      const b = h('button', 'link', t('Paid')); b.title = t('It happened: count it in the wallet now');
      b.addEventListener('click', async () => done(await S.moneyMarkPaid(u.id)));
      row.append(b); bills.append(row);
    }
    if (p.recurring.length) {
      const det = h('details', 'mn-rec'); det.append(h('summary', '', `${t('Repeats')} (${p.recurring.length})`));
      for (const r of p.recurring) {
        const row = h('div', 'mn-prow');
        const when = r.every === 'week' ? t('every week') : r.every === 'year' ? t('every year') : t('every month, day {0}', r.day);
        row.append(h('span', 'mn-pt', r.description), h('small', '', `${when} · ${r.wallet}`), h('b', '', r.amount));
        const x = h('button', 'link', t('Stop')); x.addEventListener('click', async () => done(await S.moneyStopRecurring(r.id)));
        row.append(x); det.append(row);
      }
      bills.append(det);
    }

    const owed = card('Owed', p.owed.length ? null : 'Split a bill with your buddy ("dinner 600rb split with Andi and Sari") and it keeps track of who owes you.');
    for (const o of p.owed) {
      const row = h('div', 'mn-prow');
      row.append(h('span', 'mn-pt', o.person), h('small', '', t(o.direction === 'i_owe' ? 'you owe' : 'owes you')), h('b', o.direction === 'i_owe' ? 'out' : 'in', o.amount_rp));
      const sel = h('select', 'mn-psel'); sel.append(new Option(t('Paid back into…'), ''));
      for (const w of state.data.wallets) sel.append(new Option(w.name, w.id));
      sel.title = t('Record the money in a wallet and clear it');
      sel.addEventListener('change', async () => { if (sel.value) done(await S.moneySettle(o.person, sel.value)); });
      row.append(sel); owed.append(row);
    }

    const goals = card('Goals', p.goals.length ? null : 'Tell your buddy what you are saving for, like "save 5 juta for a new phone by March".');
    for (const g of p.goals) {
      const row = h('div', 'mn-goal');
      const top = h('div', 'mn-prow'); top.append(h('span', 'mn-pt', g.name), h('b', '', `${g.saved} / ${g.target}`));
      const bar = h('div', 'mn-gbar'); const fill = h('i'); fill.style.width = g.percent + '%'; bar.append(fill);
      const sub = h('small', '', g.by ? t('{0}% · {1} a week until {2}', g.percent, g.per_week_needed, day(g.by)) : `${g.percent}%` + (g.wallet ? ` · ${g.wallet}` : ''));
      row.append(top, bar, sub);
      if (!g.wallet) {
        const add = h('input', 'mn-gadd'); add.placeholder = t('+ add, e.g. 200rb');
        add.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && add.value.trim()) done(await S.moneyGoal(g.id, { add: add.value.trim() })); });
        row.append(add);
      }
      goals.append(row);
    }
    box.append(bills, owed, goals);
  }

  function render() {
    const d = state.data, tot = d.totals;
    $('#mn-in').textContent = rp(tot.in);
    $('#mn-out').textContent = rp(tot.out);
    $('#mn-left').textContent = rp(tot.in - tot.out);
    $('#mn-all').textContent = rp(d.wallets.reduce((a, w) => a + (w.balance || 0), 0));
    $('#mn-in-n').textContent = tot.nIn ? `${tot.nIn} ${t(tot.nIn === 1 ? 'record' : 'records')}` : '';
    $('#mn-out-n').textContent = tot.nOut ? `${tot.nOut} ${t(tot.nOut === 1 ? 'record' : 'records')}` : '';
    $('#mn-left-n').textContent = tot.planned ? `${rp(tot.planned)} ${t('planned')}` : '';
    $('#mn-all-n').textContent = d.wallets.length ? `${d.wallets.length} ${t(d.wallets.length === 1 ? 'wallet' : 'wallets')}` : t('No wallets yet');

    // wallet chips (click to filter the table)
    const box = $('#mn-wallets');
    box.textContent = '';
    for (const w of d.wallets) {
      const b = h('button', 'mn-wallet' + (state.wallet === w.id ? ' on' : ''));
      const dot = walletBadge(w);
      const bal = h('span', w.isLow || w.balance < 0 ? 'low' : '', rp(w.balance) + (w.isLow ? ' · ' + t('running low') : ''));
      b.append(dot, h('b', '', w.name), bal);
      b.title = t('Show only this wallet');
      b.addEventListener('click', () => { state.wallet = state.wallet === w.id ? '' : w.id; render(); });
      box.append(b);
    }
    const add = h('button', 'mn-wallet add', '+ ' + t('Wallet'));
    add.addEventListener('click', () => openWallets(true));
    box.append(add);

    // filters
    const fill = (sel, first, items) => {
      const cur = sel.value;
      sel.textContent = '';
      sel.append(new Option(first, ''));
      for (const [v, l] of items) sel.append(new Option(l, v));
      sel.value = items.some(([v]) => v === cur) ? cur : '';
    };
    fill($('#mn-f-cat'), t('All categories'), d.categories.filter((c) => !c.hidden).map((c) => [c.id, c.name]));
    fill($('#mn-f-wallet'), t('All wallets'), d.wallets.map((w) => [w.id, w.name]));
    $('#mn-f-wallet').value = state.wallet;

    // records
    const q = state.q.toLowerCase();
    const rows = d.records.filter((r) =>
      (!state.wallet || r.walletId === state.wallet || r.toWalletId === state.wallet) &&
      (!state.kind || r.kind === state.kind) &&
      (!state.cat || r.categoryId === state.cat) &&
      (!q || [r.description, r.category, r.wallet, r.toWallet, String(r.amount)].join(' ').toLowerCase().includes(q)));
    const tb = $('#mn-rows');
    tb.textContent = '';
    for (const r of rows) tb.append(row(r));
    $('#mn-empty').hidden = rows.length > 0;
    reports(d);
    $('#mn-empty').querySelector('p').textContent = d.records.length ? t('Nothing matches these filters.') : t('No records this month yet.');
  }

  // ---- reports: donut by category, budgets, group-by table, 6-month trend
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const short = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : n >= 1e3 ? Math.round(n / 1e3) + ' rb' : String(n));
  function reports(d) {
    const cats = d.categories.filter((c) => c.kind === 'out' && c.spent > 0).sort((a, b) => b.spent - a.spent);
    const total = cats.reduce((a, c) => a + c.spent, 0);
    const donut = $('#mn-donut'); donut.textContent = '';
    const C = 2 * Math.PI * 60; let off = 0;
    const g = sv('g', { transform: 'rotate(-90 75 75)', fill: 'none', 'stroke-width': 22 });
    g.append(sv('circle', { cx: 75, cy: 75, r: 60, stroke: 'var(--bg-2)' }));
    for (const c of cats) { const len = (c.spent / total) * C; g.append(sv('circle', { cx: 75, cy: 75, r: 60, stroke: c.color, 'stroke-dasharray': `${len} ${C}`, 'stroke-dashoffset': -off })); off += len; }
    donut.append(g);
    const t1 = sv('text', { x: 75, y: 72, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-2)' }); t1.textContent = t('spent');
    const t2 = sv('text', { x: 75, y: 90, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: 'var(--ink)' }); t2.textContent = short(total);
    donut.append(t1, t2);
    const lg = $('#mn-legend'); lg.textContent = '';
    for (const c of cats.slice(0, 7)) { const li = h('li'); const i = h('i'); i.style.background = c.color; li.append(i, h('span', '', c.name), h('b', '', Math.round(c.spent / total * 100) + '%')); lg.append(li); }
    if (!cats.length) lg.append(h('li', 'muted', t('No spending yet.')));
    // budgets
    const bb = $('#mn-budgets'); bb.textContent = '';
    const withB = d.categories.filter((c) => c.kind === 'out' && c.budget != null && !c.hidden);
    for (const c of withB) {
      const pct = Math.min(100, c.budget ? c.spent / c.budget * 100 : 0);
      const it = h('div', 'mn-bud' + (c.spent > c.budget ? ' over' : ''));
      const top = h('div', 'mn-bud-top'); top.append(h('span', '', c.name), h('span', '', `${rp(c.spent).replace('Rp ', '')} / ${rp(c.budget).replace('Rp ', '')}`));
      const bar = h('div', 'mn-bar'); const fill = h('div'); fill.style.width = pct + '%'; fill.style.background = c.spent > c.budget ? 'var(--red)' : c.color; bar.append(fill);
      it.append(top, bar); bb.append(it);
    }
    if (!withB.length) { const p = h('p', 'mn-hint', t('Set a monthly budget on a category to see it here.')); const b = h('button', 'link', t('Categories')); b.addEventListener('click', openCategories); bb.append(p, b); }
    // group by
    const by = $('#mn-pivot').value, rows = new Map();
    for (const r of d.records.filter((r) => !r.planned && r.kind !== 'transfer')) {
      const k = by === 'wallet' ? r.wallet : by === 'day' ? r.date : (r.category || '?');
      const o = rows.get(k) || { in: 0, out: 0, n: 0 }; o[r.kind] += r.amount; o.n++; rows.set(k, o);
    }
    const pt = $('#mn-pivot-t'); pt.textContent = '';
    const hr = h('tr'); for (const x of [by === 'wallet' ? t('Wallet') : by === 'day' ? t('Date') : t('Category'), '#', t('In'), t('Out')]) hr.append(h('th', x === t('In') || x === t('Out') || x === '#' ? 'r' : '', x)); pt.append(hr);
    const keys = [...rows.keys()].sort((a, b) => (by === 'day' ? b.localeCompare(a) : rows.get(b).out - rows.get(a).out));
    for (const k of keys) { const o = rows.get(k); const tr = h('tr'); tr.append(h('td', '', by === 'day' ? dayLabel(k) : k), h('td', 'r', String(o.n)), h('td', 'r in', o.in ? short(o.in) : ''), h('td', 'r out', o.out ? short(o.out) : '')); pt.append(tr); }
    // trend
    const tr = $('#mn-trend'); tr.textContent = '';
    const max = Math.max(1, ...d.trend.map((m) => Math.max(m.in, m.out)));
    tr.append(sv('line', { x1: 10, y1: 140, x2: 430, y2: 140, stroke: 'var(--line)' }));
    d.trend.forEach((m, i) => {
      const x = 24 + i * 70, hi = (m.in / max) * 125, ho = (m.out / max) * 125;
      tr.append(sv('rect', { x, y: 140 - hi, width: 22, height: hi, rx: 3, fill: 'var(--green)' }), sv('rect', { x: x + 26, y: 140 - ho, width: 22, height: ho, rx: 3, fill: m.out > m.in ? 'var(--red)' : '#E07B39' }));
      const lb = sv('text', { x: x + 24, y: 158, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }); lb.textContent = new Date(m.month + '-15').toLocaleDateString(loc(), { month: 'short' }); tr.append(lb);
    });
    // what's left to spend (this month)
    if (d.outlook) $('#mn-left-n').textContent = `${t('Free to spend')} ${d.outlook.free_to_spend} · ≈ ${d.outlook.per_day}/${t('day')}`;
  }
  $('#mn-pivot').addEventListener('change', () => reports(state.data));

  // ---- export this month as CSV (opens in Excel / Google Sheets)
  $('#mn-export').addEventListener('click', () => {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['Date', 'Kind', 'Description', 'Category', 'Wallet', 'To wallet', 'Amount', 'Planned'].join(',')];
    for (const r of state.data.records) lines.push([r.date, r.kind, q(r.description), q(r.category), q(r.wallet), q(r.toWallet), r.kind === 'out' ? -r.amount : r.amount, r.planned ? 'yes' : ''].join(','));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Scribble money ${state.month}.csv`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  function row(r) {
    const tr = h('tr', r.kind + (r.planned ? ' planned' : '') + (state.editing === r.id ? ' hl' : ''));
    tr.dataset.id = r.id;
    const td = (cls, text, field) => { const c = h('td', cls, text); if (field) { c.dataset.f = field; c.classList.add('ed'); c.title = t('Click to change'); } return c; };
    const date = td('date', dayLabel(r.date), 'date');
    const desc = td('desc', r.description, 'description');
    if (r.planned) desc.append(h('span', 'mn-tag', t('planned')));
    if (r.source === 'receipt') desc.append(h('span', 'mn-tag', t('from receipt')));
    const sub = h('small', 'mn-sub', r.kind === 'transfer' ? `${r.wallet} → ${r.toWallet}` : r.wallet);   // narrow panel: wallet under the description
    desc.append(sub);
    const cat = r.kind === 'transfer' ? td('cat muted', t('Transfer')) : td('cat', r.category || '?', 'category');
    if (r.color && r.kind !== 'transfer') { const dot = h('i', 'mn-dot'); dot.style.background = r.color; cat.prepend(dot); }
    const wal = td('wal', r.kind === 'transfer' ? `${r.wallet} → ${r.toWallet}` : r.wallet, r.kind === 'transfer' ? null : 'wallet');
    const amt = td('r amt ' + r.kind, (r.kind === 'in' ? '+' : r.kind === 'out' ? '−' : '') + rp(r.amount), 'amount');
    const del = h('td', 'r act');
    const x = h('button', 'icon mn-del', '×'); x.title = t('Delete');
    x.addEventListener('click', async (e) => { e.stopPropagation(); const res = await S.moneyDeleteRecord(r.id); if (res.ok) { toast(t('Deleted')); show(); } });
    del.append(x);
    tr.append(date, desc, cat, wal, amt, del);
    return tr;
  }

  // ---- click a cell to change it
  $('#mn-rows').addEventListener('click', (e) => {
    const cell = e.target.closest('td.ed');
    if (!cell || cell.querySelector('input,select')) return;
    const id = cell.parentElement.dataset.id, f = cell.dataset.f;
    const r = state.data.records.find((x) => x.id === id);
    if (!r) return;
    let inp;
    if (f === 'category') {
      inp = h('select');
      for (const c of state.data.categories.filter((c) => !c.hidden && c.kind === (r.kind === 'in' ? 'in' : 'out'))) inp.append(new Option(c.name, c.id));
      inp.value = r.categoryId;
    } else if (f === 'wallet') {
      inp = h('select');
      for (const w of state.data.wallets) inp.append(new Option(w.name, w.id));
      inp.value = r.walletId;
    } else {
      inp = h('input');
      inp.type = f === 'date' ? 'date' : 'text';
      inp.value = f === 'amount' ? String(r.amount) : f === 'date' ? r.date : r.description;
      if (f === 'amount') inp.inputMode = 'numeric';
    }
    inp.className = 'mn-cell-in';
    cell.textContent = '';
    cell.append(inp);
    inp.focus();
    if (inp.select) inp.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      if (save && inp.value !== '' && inp.value !== String(f === 'amount' ? r.amount : f === 'date' ? r.date : f === 'category' ? r.categoryId : f === 'wallet' ? r.walletId : r.description)) {
        const res = await S.moneyUpdateRecord(id, { [f]: inp.value });
        if (!res.ok) toast(res.error);
      }
      show();
    };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); } });
    inp.addEventListener('blur', () => finish(true));
    if (inp.tagName === 'SELECT') inp.addEventListener('change', () => finish(true));
  });

  // ---- filters
  $('#mn-q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  $('#mn-f-kind').addEventListener('change', (e) => { state.kind = e.target.value; render(); });
  $('#mn-f-cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
  $('#mn-f-wallet').addEventListener('change', (e) => { state.wallet = e.target.value; render(); });
  $('#mn-prev').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); show(); });
  $('#mn-next').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); show(); });
  $('#mn-mlabel').addEventListener('click', () => { state.month = thisMonth(); show(); });

  // ---- sheets (Wallets, Categories, a new record): one panel over the Money screen
  function sheet(title, build) {
    closeSheet();
    const back = h('div', 'mn-sheet-back');
    const s = h('div', 'mn-sheet');
    const head = h('div', 'mn-sheet-head');
    head.append(h('h3', '', title));
    const x = h('button', 'icon', '×'); x.title = t('Close');
    x.addEventListener('click', closeSheet);
    head.append(x);
    const body = h('div', 'mn-sheet-body');
    s.append(head, body);
    back.append(s);
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeSheet(); });
    $('#view-money').append(back);
    state.sheet = () => { body.textContent = ''; build(body); };
    state.sheet();
    return body;
  }
  function closeSheet() { const b = $('.mn-sheet-back'); if (b) b.remove(); state.sheet = null; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) { e.stopPropagation(); closeSheet(); } }, true);
  const field = (label, input) => { const l = h('label', 'mn-field'); l.append(h('span', '', label), input); return l; };
  const inputEl = (type, value, ph) => { const i = h('input'); i.type = type; if (value != null) i.value = value; if (ph) i.placeholder = ph; return i; };
  const err = (box, msg) => { let e = box.querySelector('.mn-err'); if (!e) { e = h('div', 'mn-err'); box.append(e); } e.textContent = msg; };

  // Wallets
  function openWallets(addNew = false) {
    sheet(t('Wallets'), (b) => {
      b.append(h('p', 'mn-hint', t('Where your money is. Your buddy only offers these, so the same money is never recorded twice under two names.')));
      const list = h('div', 'mn-list');
      for (const w of state.data.wallets) {
        const it = h('div', 'mn-item' + (w.isLow ? ' low' : ''));
        const dot = walletBadge(w, 'big');
        const nm = h('div', 'mn-item-name');
        nm.append(h('b', '', w.name), h('small', '', t({ cash: 'Cash', bank: 'Bank account', ewallet: 'E-wallet', card: 'Credit card' }[w.type] || 'Cash') + (w.salary ? ' · ' + t('salary') : '') + (w.low != null ? ' · ' + t('warn below') + ' ' + rp(w.low) : '')));
        const bal = h('span', 'mn-item-amt', rp(w.balance));
        const ed = h('button', 'link', t('Edit'));
        ed.addEventListener('click', () => walletForm(b, w));
        it.append(dot, nm, bal, ed);
        list.append(it);
      }
      b.append(list);
      const add = h('button', 'btn', '+ ' + t('Wallet'));
      add.addEventListener('click', () => walletForm(b, null));
      b.append(add);
      if (addNew) { addNew = false; walletForm(b, null); }
    });
  }
  function walletForm(b, w) {
    const old = b.querySelector('.mn-form'); if (old) old.remove();
    const f = h('div', 'mn-form');
    f.append(h('h4', '', w ? w.name : t('New wallet')));
    const name = inputEl('text', w ? w.name : '', 'BCA, GoPay, Cash…');
    const type = h('div', 'seg small mn-types');
    let ty = w ? w.type : 'bank';
    for (const [v, l] of [['cash', 'Cash'], ['bank', 'Bank'], ['ewallet', 'E-wallet'], ['card', 'Credit card']]) {
      const x = h('button', v === ty ? 'on' : '', t(l)); x.type = 'button';
      x.addEventListener('click', () => { ty = v; [...type.children].forEach((c) => c.classList.toggle('on', c === x)); });
      type.append(x);
    }
    const bal = inputEl('text', w ? String(w.balance) : '', '2.500.000'); bal.inputMode = 'numeric';
    const low = inputEl('text', w && w.low != null ? String(w.low) : '', t('optional, e.g. 100.000')); low.inputMode = 'numeric';
    const sal = h('label', 'toggle'); const salI = inputEl('checkbox'); salI.checked = !!(w && w.salary); sal.append(salI, h('span', '', t('My salary goes here')));
    f.append(field(t('Name'), name), field(t('Type'), type), field(w ? t('Balance now') : t('Starting balance'), bal), field(t('Warn me below'), low), sal);
    if (w) {
      // your own picture for this wallet (e.g. the logo saved from your bank's site); otherwise a colour badge
      const pr = h('div', 'mn-pic-row');
      const prev = walletBadge(w, 'big');
      const set = h('button', 'link', w.image ? t('Change picture') : t('Set picture'));
      set.type = 'button';
      set.addEventListener('click', async () => { const img = await pickPicture(); if (!img) return; const r = await S.moneyUpdateWallet(w.id, { image: img }); if (!r.ok) return err(f, r.error); show(); });
      pr.append(prev, set);
      if (w.image) { const rm = h('button', 'link', t('Remove picture')); rm.type = 'button'; rm.addEventListener('click', async () => { await S.moneyUpdateWallet(w.id, { image: null }); show(); }); pr.append(rm); }
      f.append(field(t('Picture'), pr));
    }
    const row = h('div', 'mn-form-actions');
    if (w) {
      const del = h('button', 'link danger', t('Delete'));
      del.addEventListener('click', async () => { const r = await S.moneyDeleteWallet(w.id); if (!r.ok) err(f, r.error); else show(); });
      row.append(del);
    }
    row.append(h('span', 'spacer'));
    const cancel = h('button', 'btn ghost', t('Cancel')); cancel.addEventListener('click', () => f.remove());
    const save = h('button', 'btn', w ? t('Save') : t('Add wallet'));
    let forced = false;
    save.addEventListener('click', async () => {
      if (!name.value.trim()) return err(f, t('Give it a name.'));
      if (w) {
        let r = await S.moneyUpdateWallet(w.id, { name: name.value, type: ty, low: low.value.trim() || null, salary: salI.checked });
        if (r.ok && bal.value.trim() !== String(w.balance)) r = await S.moneySetBalance(w.id, bal.value);
        if (!r.ok) return err(f, r.error);
      } else {
        const r = await S.moneyAddWallet({ name: name.value, type: ty, start: bal.value || 0, low: low.value.trim() || null, salary: salI.checked, force: forced });
        if (!r.ok) return err(f, r.error);
        const res = r.result;
        if (!res.ok && res.exists) return err(f, `${t('You already have')} ${res.exists.name}.`);
        if (!res.ok && res.similar) { forced = true; save.textContent = t('Add anyway'); return err(f, `${t('This looks like')} ${res.similar.map((x) => x.name).join(', ')}. ${t('Is it really a new wallet?')}`); }
      }
      show();
    });
    row.append(cancel, save);
    f.append(row);
    b.append(f);
    name.focus();
  }

  // Categories
  function openCategories() {
    let tab = 'out';
    sheet(t('Categories'), (b) => {
      const seg = h('div', 'seg small');
      for (const [v, l] of [['out', 'Spending'], ['in', 'Income'], ['shops', 'Shops']]) {
        const x = h('button', v === tab ? 'on' : '', t(l)); x.type = 'button';
        x.addEventListener('click', () => { tab = v; state.sheet(); });
        seg.append(x);
      }
      b.append(seg);
      const list = h('div', 'mn-list');
      if (tab === 'shops') {
        b.append(h('p', 'mn-hint', t('Shops and apps that always go into the same category. Your buddy adds them when you pick a category for a shop.')));
        if (!state.data.shops.length) list.append(h('p', 'mn-hint', t('None yet.')));
        for (const s of state.data.shops) {
          const it = h('div', 'mn-item');
          const nm = h('div', 'mn-item-name'); nm.append(h('b', '', s.match), h('small', '', '→ ' + (s.category || '?')));
          const x = h('button', 'link', t('Remove'));
          x.addEventListener('click', async () => { await S.moneyForgetShop(s.id); show(); });
          it.append(nm, x); list.append(it);
        }
        b.append(list);
        return;
      }
      const cats = state.data.categories.filter((c) => c.kind === tab);
      const head = h('div', 'mn-item head'); head.append(h('i'), h('div', 'mn-item-name', t('Name')), h('span', 'mn-item-amt', monthLabel(state.month).split(' ')[0]), h('span', 'mn-item-amt', tab === 'out' ? t('Budget') : ''), h('span'));
      list.append(head);
      for (const c of cats) {
        const it = h('div', 'mn-item' + (c.hidden ? ' hidden-cat' : ''));
        const dot = h('i'); dot.style.background = c.color;
        const over = tab === 'out' && c.budget != null && c.spent > c.budget;
        const ed = h('button', 'link', t('Edit'));
        ed.addEventListener('click', () => categoryForm(b, c));
        it.append(dot, h('div', 'mn-item-name', c.name + (c.hidden ? ` (${t('hidden')})` : '')), h('span', 'mn-item-amt' + (over ? ' over' : ''), c.spent ? rp(c.spent) : '0'), h('span', 'mn-item-amt muted', tab === 'out' ? (c.budget != null ? rp(c.budget) : t('none')) : ''), ed);
        list.append(it);
      }
      b.append(list);
      const add = h('button', 'btn', '+ ' + t('Category'));
      add.addEventListener('click', () => categoryForm(b, null, tab));
      b.append(add);
    });
  }
  function categoryForm(b, c, kind = 'out') {
    const old = b.querySelector('.mn-form'); if (old) old.remove();
    const f = h('div', 'mn-form');
    f.append(h('h4', '', c ? c.name : t('New category')));
    const name = inputEl('text', c ? c.name : '');
    const budget = inputEl('text', c && c.budget != null ? String(c.budget) : '', t('optional, e.g. 1.500.000')); budget.inputMode = 'numeric';
    f.append(field(t('Name'), name));
    if ((c ? c.kind : kind) === 'out') f.append(field(t('Monthly budget'), budget));
    if (c) {
      const shops = state.data.shops.filter((s) => s.categoryId === c.id);
      if (shops.length) { const sh = h('div', 'mn-shops'); for (const s of shops) sh.append(h('span', 'mchip', s.match)); f.append(field(t('Shops that always go here'), sh)); }
      const mergeSel = h('select');
      mergeSel.append(new Option(t('Merge into…'), ''));
      for (const o of state.data.categories.filter((o) => o.id !== c.id && o.kind === c.kind)) mergeSel.append(new Option(o.name, o.id));
      mergeSel.addEventListener('change', async () => {
        if (!mergeSel.value) return;
        const r = await S.moneyMergeCategory(c.id, mergeSel.value);
        if (!r.ok) return err(f, r.error);
        toast(`${t('Moved')} ${r.result.moved} ${t('records to')} ${r.result.into.name}`);
        show();
      });
      f.append(mergeSel, h('p', 'mn-hint', t('Renaming or merging moves every past record too, so old reports stay clean.')));
    }
    const row = h('div', 'mn-form-actions');
    if (c) {
      const hide = h('button', 'link', c.hidden ? t('Show again') : t('Hide'));
      hide.addEventListener('click', async () => { await S.moneyUpdateCategory(c.id, { hidden: !c.hidden }); show(); });
      row.append(hide);
    }
    row.append(h('span', 'spacer'));
    const cancel = h('button', 'btn ghost', t('Cancel')); cancel.addEventListener('click', () => f.remove());
    const save = h('button', 'btn', c ? t('Save') : t('Add category'));
    let forced = false;
    save.addEventListener('click', async () => {
      if (!name.value.trim()) return err(f, t('Give it a name.'));
      if (c) {
        const r = await S.moneyUpdateCategory(c.id, { name: name.value, budget: budget.value.trim() || null });
        if (!r.ok) return err(f, r.error);
      } else {
        const r = await S.moneyAddCategory({ name: name.value, kind, budget: budget.value.trim() || null, force: forced });
        if (!r.ok) return err(f, r.error);
        const res = r.result;
        if (!res.ok && res.exists) return err(f, `${t('You already have')} ${res.exists.name}.`);
        if (!res.ok && res.similar) { forced = true; save.textContent = t('Add anyway'); return err(f, `${t('You already have')} ${res.similar.map((x) => x.name).join(', ')}, ${t('which sounds like the same thing. Use that, or add this anyway.')}`); }
      }
      show();
    });
    row.append(cancel, save);
    f.append(row);
    b.append(f);
    name.focus();
  }

  // A record by hand (the chat is the quick way; this is for when you'd rather type it in)
  function openAdd() {
    if (!state.data.wallets.length) { openWallets(true); return; }
    let kind = 'out';
    sheet(t('New record'), (b) => {
      const f = h('div', 'mn-form flat');
      const seg = h('div', 'seg small');
      for (const [v, l] of [['out', 'Money out'], ['in', 'Money in'], ['transfer', 'Transfer']]) {
        const x = h('button', v === kind ? 'on' : '', t(l)); x.type = 'button';
        x.addEventListener('click', () => { kind = v; state.sheet(); });
        seg.append(x);
      }
      const amount = inputEl('text', '', '45.000'); amount.inputMode = 'numeric';
      const desc = inputEl('text', '', kind === 'in' ? t('Salary, bonus…') : kind === 'transfer' ? t('Top up GoPay') : t('Lunch, Indomaret…'));
      const date = inputEl('date', new Date().toLocaleDateString('en-CA'));
      const wal = h('select'); for (const w of state.data.wallets) wal.append(new Option(`${w.name} (${rp(w.balance)})`, w.id));
      const to = h('select'); for (const w of state.data.wallets) to.append(new Option(w.name, w.id));
      if (state.data.wallets[1]) to.value = state.data.wallets[1].id;
      const cat = h('select'); for (const c of state.data.categories.filter((c) => !c.hidden && c.kind === (kind === 'in' ? 'in' : 'out'))) cat.append(new Option(c.name, c.id));
      f.append(seg, field(t('Amount'), amount), field(t('What'), desc), field(t('Date'), date), field(kind === 'in' ? t('Into wallet') : t('From wallet'), wal));
      if (kind === 'transfer') f.append(field(t('Into wallet'), to)); else f.append(field(t('Category'), cat));
      const row = h('div', 'mn-form-actions');
      row.append(h('span', 'spacer'));
      const save = h('button', 'btn', t('Save'));
      save.addEventListener('click', async () => {
        const r = await S.moneyAddRecord({ kind, amount: amount.value, description: desc.value, date: date.value, wallet: wal.value, to_wallet: kind === 'transfer' ? to.value : undefined, category: kind === 'transfer' ? undefined : cat.value });
        if (!r.ok) return err(f, r.error);
        closeSheet();
        state.month = date.value.slice(0, 7);
        show();
      });
      row.append(save);
      f.append(row);
      b.append(f);
      amount.focus();
    });
  }

  $('#mn-wallets-btn').addEventListener('click', () => openWallets());
  $('#mn-cats-btn').addEventListener('click', () => openCategories());
  $('#mn-add').addEventListener('click', openAdd);

  // from a record card in the chat: open its month and highlight it
  function edit(id, date) {
    state.editing = id;
    if (date) state.month = date.slice(0, 7);
    state.wallet = ''; state.q = ''; state.kind = ''; state.cat = '';
    $('#mn-q').value = ''; $('#mn-f-kind').value = '';
    show().then(() => { const tr = document.querySelector(`#mn-rows tr[data-id="${id}"]`); if (tr) tr.scrollIntoView({ block: 'center' }); setTimeout(() => { state.editing = null; }, 4000); });
  }

  // the buddy shows part of Money ("my food spending this month"): set the filters by name
  async function focus(f = {}) {
    if (f.month && /^\d{4}-\d{2}$/.test(f.month)) state.month = f.month;
    await show();
    const d = state.data || { categories: [], wallets: [] };
    const by = (arr, n) => { if (!n) return null; const l = String(n).toLowerCase(); return arr.find((x) => x.name.toLowerCase() === l) || arr.find((x) => x.name.toLowerCase().includes(l)) || null; };
    const c = by(d.categories, f.category), w = by(d.wallets, f.wallet);
    state.cat = c ? c.id : ''; state.wallet = w ? w.id : ''; state.kind = ['in', 'out', 'transfer'].includes(f.kind) ? f.kind : ''; state.q = '';
    if ($('#mn-f-cat')) $('#mn-f-cat').value = state.cat;
    if ($('#mn-f-kind')) $('#mn-f-kind').value = state.kind;
    if ($('#mn-q')) $('#mn-q').value = '';
    render();
    return { category: c && c.name, wallet: w && w.name };
  }
  function clearFocus() { state.cat = ''; state.wallet = ''; state.kind = ''; state.q = ''; state.month = thisMonth(); show(); }
  window.Money = { show, edit, focus, clearFocus };
})();
