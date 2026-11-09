// Money area of the panel: month totals, wallets, the records table (filters, search, click a cell to fix it),
// a form to add a record by hand, and the Wallets / Categories screens. The data and every calculation live in the
// main process (money.js); this file only shows it and sends changes back.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });     // the bridge may arrive after this file loads (Android)
  const t = (s) => (window.I18n ? I18n.t(s) : s);
  const loc = () => (window.I18n ? I18n.locale() : undefined);
  const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const state = { month: thisMonth(), wallet: '', q: '', kind: '', cat: '', data: null, editing: null, sheet: null };

  const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' }); }
  function shiftMonth(ym, d) { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); }
  const dayLabel = (d) => new Date(d + 'T12:00').toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  function toast(msg) { if (window.toast) window.toast(msg); }

  async function show() {
    $('#mn-mlabel').textContent = monthLabel(state.month);
    let d = null;
    try { d = await S.moneyMonth(state.month); } catch {}
    state.data = d || { totals: { in: 0, out: 0, nIn: 0, nOut: 0, planned: 0 }, wallets: [], records: [], categories: [], shops: [] };
    render();
    if (state.sheet) state.sheet();
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
      const dot = h('i'); dot.style.background = w.color || 'var(--ink-2)';
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
    $('#mn-empty').querySelector('p').textContent = d.records.length ? t('Nothing matches these filters.') : t('No records this month yet.');
  }

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
        const dot = h('i'); dot.style.background = w.color;
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

  window.Money = { show, edit };
})();
