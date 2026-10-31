// Scribble on the web: the "Today" page with the animated buddy in the corner.
// - Today: greeting, today's tasks (tick them off), quick note, shortcuts, recent pages
// - The buddy (desktop Scribble's own animated character, in a small frame) sits bottom-right; tap it for the chat,
//   which slides in next to it (computer) or rises as a sheet (phone). ⤢ opens the full chat, ✕ tucks it away.
// - Notebook and Tasks tabs open the full views, as in the apps.
(function () {
  const S = window.scribble;
  if (!S || !document.body.classList.contains('web')) return;
  const t = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s.replace(/\{(\d)\}/g, (_, i) => a[i]));
  const $ = (q, r = document) => r.querySelector(q);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const loadedAt = Date.now();

  // ---------------------------------------------------------------- the Today view + tab
  const chatView = $('#view-chat');
  const view = document.createElement('section');
  view.id = 'view-today';
  view.className = 'view';
  view.innerHTML = `<div class="today">
    <div class="td-hello"><div><h1 id="td-greet"></h1><p id="td-date"></p></div><div class="td-chips" id="td-chips"></div></div>
    <div class="td-grid">
      <div class="td-card td-tasks"><h3>${t("Today's tasks")}</h3><div id="td-list"></div></div>
      <div class="td-col">
        <div class="td-card"><h3>${t('Quick note')}</h3>
          <form id="td-cap" class="td-cap"><input id="td-cap-in" autocomplete="off" placeholder="${esc(t('Tell me anything worth remembering…'))}"><button class="btn" type="submit">↵</button></form>
          <small>${t('Your buddy tidies it up and asks where to save it.')}</small></div>
        <div class="td-card"><h3>${t('Shortcuts')}</h3><div class="td-sc">
          <button type="button" data-sc="plan">☀️ ${t('Plan my day')}<small>${t('Order and time blocks for today')}</small></button>
          <button type="button" data-sc="recap">📝 ${t('Write my day recap')}<small>${t("For today's daily page")}</small></button>
          <button type="button" data-sc="weekly">📊 ${t('Weekly report')}<small>${t('Ready to paste into WhatsApp or email')}</small></button>
        </div></div>
        <div class="td-card"><h3>${t('Recent pages')}</h3><div id="td-pages"></div></div>
      </div>
    </div></div>`;
  chatView.parentNode.insertBefore(view, chatView);
  const nav = $('nav');
  const tab = document.createElement('button');
  tab.dataset.tab = 'today';
  tab.textContent = t('Today');
  nav.prepend(tab);

  // the chat lives with the buddy on the web: showTab('chat') opens it instead of switching pages
  const baseShowTab = window.showTab;
  const currentPage = () => ((document.querySelector('.view.on') || {}).id || 'view-today').replace('view-', '');
  let lastMain = 'today';
  window.showTab = function (name) {
    if (name === 'chat') {
      const from = currentPage();
      if (from === 'chat' || from === 'settings') baseShowTab(lastMain);
      if (from !== 'settings' && Date.now() - loadedAt > 4000) openChat();   // closing Settings just goes back
      return;
    }
    if (name !== 'settings') lastMain = name;
    document.body.classList.remove('chat-full');
    baseShowTab(name);
    if (name === 'today') render();
  };
  tab.addEventListener('click', () => window.showTab('today'));

  async function render() {
    let acct = {}, tasks = [], tree = [];
    try { [acct, tasks, tree] = await Promise.all([S.account(), S.tasks(), S.tree()]); } catch {}
    const h = new Date().getHours();
    const first = String((acct && acct.name) || '').split(' ')[0];
    const hi = h < 11 ? t('Good morning') : h < 15 ? t('Good afternoon') : h < 19 ? t('Good evening') : t('Good night');
    $('#td-greet').textContent = first ? `${hi}, ${first}` : hi;
    $('#td-date').textContent = new Date().toLocaleDateString(window.I18n ? I18n.locale() : undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const today = day();
    const open = (tasks || []).filter((x) => !['done', 'cancelled', 'hold'].includes(x.status));
    const overdue = open.filter((x) => x.due && x.due < today);
    const dueToday = open.filter((x) => x.due === today);
    const doing = open.filter((x) => x.status === 'doing' && !(x.due && x.due <= today));
    const doneToday = (tasks || []).filter((x) => x.status === 'done' && String(x.completed || '').slice(0, 10) === today);
    const chip = (n, label, cls) => (n ? `<span class="td-chip ${cls}">${esc(t(label, n))}</span>` : '');
    $('#td-chips').innerHTML = chip(overdue.length, '{0} overdue', 'red') + chip(dueToday.length, '{0} due today', 'y') + chip(doing.length, '{0} in progress', '');
    const row = (x, when) => `<div class="td-task${x.status === 'done' ? ' done' : ''}" data-id="${x.id}">
      <button type="button" class="td-cb" aria-label="${esc(t('Done'))}"></button>
      <span class="td-t">${esc(x.title)}</span>
      ${x.priority ? `<span class="td-pill ${esc(x.priority)}">${esc(t(x.priority[0].toUpperCase() + x.priority.slice(1)))}</span>` : ''}
      ${when ? `<small>${esc(when)}</small>` : ''}</div>`;
    const ago = (d) => new Date(d + 'T00:00').toLocaleDateString(window.I18n ? I18n.locale() : undefined, { weekday: 'short' });
    let html = '';
    if (overdue.length) html += `<div class="td-grp red">${t('Overdue')}</div>` + overdue.map((x) => row(x, t('since {0}', ago(x.due)))).join('');
    if (dueToday.length) html += `<div class="td-grp">${t('Due today')}</div>` + dueToday.map((x) => row(x)).join('');
    if (doing.length) html += `<div class="td-grp">${t('In progress')}</div>` + doing.map((x) => row(x, x.due ? t('due {0}', ago(x.due)) : '')).join('');
    if (doneToday.length) html += `<div class="td-grp">${t('Done today')}</div>` + doneToday.map((x) => row(x, x.completed ? new Date(x.completed).toLocaleTimeString(window.I18n ? I18n.locale() : undefined, { hour: '2-digit', minute: '2-digit' }) : '')).join('');
    $('#td-list').innerHTML = html || `<p class="td-empty">${t('Nothing due today. Enjoy it, or tell me what you\'re working on.')}</p>`;
    const pages = (tree || []).filter((p) => p.path !== 'Inbox.md').sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, 5);
    $('#td-pages').innerHTML = pages.map((p) => `<button type="button" class="td-pg" data-path="${esc(p.path)}">${esc(p.path.replace(/\.md$/, '').replace(/\//g, ' / '))}<span>${esc(relTime(p.modified))}</span></button>`).join('') || `<p class="td-empty">${t('No pages yet.')}</p>`;
    sayOnce(overdue, dueToday);
  }
  function relTime(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return t('just now');
    if (s < 3600) return t('{0}m ago', Math.floor(s / 60));
    if (s < 86400) return t('{0}h ago', Math.floor(s / 3600));
    if (s < 172800) return t('yesterday');
    return new Date(iso).toLocaleDateString(window.I18n ? I18n.locale() : undefined, { day: 'numeric', month: 'short' });
  }

  view.addEventListener('click', async (e) => {
    const cb = e.target.closest('.td-cb');
    if (cb) {
      const row = cb.closest('.td-task');
      const done = row.classList.contains('done');
      row.classList.toggle('done', !done);
      await S.updateTask(Number(row.dataset.id), { status: done ? 'todo' : 'done' });
      if (!done) buddyEvent('buddy:state', 'happy');
      render();
      return;
    }
    const pg = e.target.closest('.td-pg');
    if (pg) { window.showTab('notebook'); setTimeout(() => window.openPage && window.openPage(pg.dataset.path), 300); return; }
    const sc = e.target.closest('[data-sc]');
    if (sc) {
      openChat();
      if (sc.dataset.sc === 'plan') return window.send("Here's my day. Help me plan it: suggest an order for today's tasks with rough time blocks, and flag anything I should reschedule.", '☀️ ' + t('Plan my day'));
      const sg = await S.suggestNow(sc.dataset.sc === 'weekly' ? 'weekly' : 'recap');
      await S.dismissSuggestion();
      const p = sg.prompts[0];
      return window.send(p.prompt, `📝 ${p.label}`);
    }
  });
  $('#td-cap').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#td-cap-in').value.trim();
    if (!v) return;
    $('#td-cap-in').value = '';
    openChat();
    window.send(v);
  });
  S.onChatReload && S.onChatReload(() => { if (currentPage() === 'today') render(); });
  if (S.onNotebookChanged) S.onNotebookChanged(() => { if (currentPage() === 'today') render(); });

  // ---------------------------------------------------------------- the buddy in the corner
  const listeners = {};
  const on = (ch) => (fn) => { (listeners[ch] = listeners[ch] || []).push(fn); return () => {}; };
  function buddyEvent(ch, data) { (listeners[ch] || []).forEach((f) => { try { f(data); } catch {} }); }
  globalThis.__toBuddy = buddyEvent;           // the app's buddy events (thinking, happy, alert, avatar…) go to the frame
  window.__buddyApi = {
    getAvatar: () => S.getAvatar(), onAvatar: S.onAvatar,
    onState: on('buddy:state'), onPanel: on('buddy:panel'), onMotion: on('buddy:motion'), onLand: on('buddy:land'),
    onCursor: on('buddy:cursor'), onTyping: on('buddy:typing'), onEdge: on('buddy:edge'),
    dragStart() {}, dragMove() {}, dragEnd() {}, menu() {}, walk: async () => ({ dx: 0, ms: 0 }),
    click: () => toggleChat(),
  };
  const frame = document.createElement('iframe');
  frame.className = 'page-buddy';
  frame.title = 'Buddy';
  frame.src = 'page-buddy.html';
  frame.setAttribute('allowtransparency', 'true');
  frame.addEventListener('load', () => setTimeout(() => buddyEvent('buddy:edge', 'right'), 300));
  document.body.append(frame);
  // its eyes follow the mouse (computer)
  let lastCur = 0;
  document.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastCur < 33) return;
    lastCur = now;
    const r = frame.getBoundingClientRect();
    const bx = r.left + r.width / 2, by = r.top + r.height * 0.55;
    const pr = chatOpen ? chatView.getBoundingClientRect() : null;
    buddyEvent('buddy:cursor', { dx: Math.round(e.clientX - bx), dy: Math.round(e.clientY - by), dist: Math.round(Math.hypot(e.clientX - bx, e.clientY - by)),
      panelDx: pr ? Math.round(pr.left + pr.width / 2 - bx) : 0, panelDy: pr ? Math.round(pr.top + pr.height * 0.75 - by) : 0, panelOpen: !!pr });
  });
  ['input', 'keydown'].forEach((ev) => document.addEventListener(ev, () => buddyEvent('buddy:typing'), { passive: true }));

  // a little speech bubble now and then
  let said = false;
  function sayOnce(overdue, dueToday) {
    if (said || chatOpen) return;
    let msg = '';
    if (overdue.length) msg = t('“{0}” is overdue. Want to plan it in?', overdue[0].title);
    else if (dueToday.length) msg = t('{0} due today. You\'ve got this ☀️', dueToday.length);
    if (!msg) return;
    said = true;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'page-say';
    b.textContent = msg;
    b.addEventListener('click', () => { b.remove(); openChat(); });
    document.body.append(b);
    setTimeout(() => b.remove(), 9000);
  }

  // ---------------------------------------------------------------- the chat, next to the buddy
  let chatOpen = false;
  const bar = document.createElement('div');
  bar.className = 'pop-bar';
  bar.innerHTML = `<span class="pop-name"></span><button type="button" class="icon" data-p="full" title="${esc(t('Open the full chat'))}">⤢</button><button type="button" class="icon" data-p="close" title="${esc(t('Close'))}">✕</button>`;
  chatView.prepend(bar);
  const dim = document.createElement('div');
  dim.className = 'pop-dim';
  dim.addEventListener('click', () => closeChat());
  document.body.append(dim);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    if (b.dataset.p === 'close') closeChat();
    else { closeChat(); document.body.classList.add('chat-full'); baseShowTab('chat'); }
  });
  S.getAvatar().then((a) => { $('.pop-name', bar).textContent = (a && a.name) || 'Scribble'; });
  S.onAvatar && S.onAvatar((a) => { $('.pop-name', bar).textContent = (a && a.name) || 'Scribble'; });
  function openChat() {
    document.querySelectorAll('.page-say').forEach((x) => x.remove());
    document.body.classList.remove('chat-full');
    if (currentPage() === 'chat') baseShowTab(lastMain);
    chatOpen = true;
    document.body.classList.add('chat-pop');
    buddyEvent('buddy:panel', true);
    setTimeout(() => { const i = $('#input'); if (i && matchMedia('(pointer: fine)').matches) i.focus(); const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; }, 60);
  }
  function closeChat() {
    chatOpen = false;
    document.body.classList.remove('chat-pop');
    buddyEvent('buddy:panel', false);
  }
  function toggleChat() { if (chatOpen) closeChat(); else openChat(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatOpen) closeChat(); });
  // leaving the full chat: back to the buddy view
  nav.addEventListener('click', () => document.body.classList.remove('chat-full'));
  window.__scribbleToday = { openChat, closeChat, render };

  // start on Today
  setTimeout(() => { if (!document.querySelector('#onboard:not([hidden])')) window.showTab('today'); else baseShowTab('today'); }, 50);
  const ob = $('#onboard');
  if (ob) new MutationObserver(() => { if (ob.hidden) { closeChat(); window.showTab('today'); } }).observe(ob, { attributes: true, attributeFilter: ['hidden'] });
})();
