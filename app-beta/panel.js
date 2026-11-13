const S = window.scribble;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------------- language ----------------
// App text follows the chosen language; the user's own notes, task names and the AI's replies stay as written.
I18n.setLang(S.lang);
const t = I18n.t;
document.documentElement.lang = I18n.lang();
const KEEP_AS_WRITTEN = ['.msg.user', '.msg.assistant', '.brief .md', '#nb-content', '#nb-preview', '#nb-text', '#nb-path', '.tname', '.t-title', '.tt-title',
  '.tt-note', '.hist-title', '.sr-title', '.sr-hit', '.sr-page', '.sr-proj', '.card-ctx', '.att-file', '.pj', '.ct', '.c-title', '.c-proj', '#ob-steps', '[data-no-i18n]'].join(', ');
I18n.watch(document, KEEP_AS_WRITTEN);
function setLanguage(l) { if (l !== I18n.lang()) S.setSettings({ lang: l }); }     // the panel reloads in the new language
$$('[data-lang]').forEach((b) => {
  b.classList.toggle('on', b.dataset.lang === I18n.lang());
  b.addEventListener('click', () => setLanguage(b.dataset.lang));
});

let currentTab = 'chat';
let busy = false;
// ticking a task off makes the little "done" sound (Settings → Buddy → Sounds)
async function updTask(id, fields) {
  const r = await S.updateTask(id, fields);
  if (fields && fields.status === 'done' && !(r && r.ok === false)) window.ScribbleSound?.play('taskDone');
  return r;
}

// ---------------- tabs ----------------
let wideMode = false;
let lastLeft = 'tasks';                 // in wide mode the chat is always docked; this is the main view
let lastWork = 'tasks';                                  // the Tasks area holds Tasks and Notebook; remember which one
function showTab(tab) {
  if (tab === 'work') tab = lastWork;
  if (tab === 'money' && !moneyOn) tab = lastWork;
  if (wideMode && tab === 'chat') { setTimeout(() => $('#input').focus(), 30); tab = lastLeft; }
  if (tab === 'tasks' || tab === 'notebook') lastWork = tab;
  if (tab !== 'chat' && tab !== 'settings') lastLeft = tab;
  currentTab = tab;
  $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab || (b.dataset.area === 'work' && tab === 'notebook')));
  $$('.area-seg button').forEach((b) => b.classList.toggle('on', b.dataset.sub === tab));
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${tab}`));
  if (tab === 'chat') setTimeout(() => $('#input').focus(), 30);
  if (tab === 'notebook') loadTree();
  if (tab === 'tasks') loadTasks();
  if (tab === 'settings') { loadSettings(); if (window.Voice) Voice.load(); loadMemory(); }
  if (tab === 'money' && window.Money) Money.show();
}
$$('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.area === 'work' ? 'work' : b.dataset.tab)));
$$('.area-seg button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.sub)));
// Money is its own area, shown once it's turned on in Settings (off for accounts made before it existed)
let moneyOn = false;
function applyMoney(on) {
  moneyOn = !!on;
  $('#nav-money').hidden = !moneyOn;
  document.body.classList.toggle('money-on', moneyOn);
  if (!moneyOn && currentTab === 'money') showTab(lastWork);
}
S.getSettings().then((s) => applyMoney(s.money)).catch(() => {});
// the buddy can open a view for you ("show me the timeline")
// The buddy presents on the left (full screen) or switches to the view (small window): tasks of one project, the
// timeline, Money filtered, or a page. A dark bar says what it's showing, with "Show everything" to clear it.
function presentBar(viewSel, html, clear) {
  document.querySelectorAll('.present-bar').forEach((b) => b.remove());
  if (!html) return;
  const b = el('div', 'present-bar');
  const s = el('span'); s.innerHTML = html;
  const x = el('button'); x.type = 'button'; x.textContent = '✕ ' + I18n.t('Show everything');
  x.addEventListener('click', () => { b.remove(); clear(); });
  b.append(s, el('span', 'sp'), x);
  const v = $(viewSel); v.insertBefore(b, v.firstChild);
}
const escH = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function clearTaskFocus() { taskFocus = null; if (window.Timeline) Timeline.focus({}); loadTasks(); }
if (S.onShowView) S.onShowView(async (opts = {}) => {
  const who = escH((await S.getAvatar().catch(() => ({}))).name || 'Scribble');
  if (opts.view === 'money') {
    lastWork = 'money'; showTab('money');
    const got = window.Money && Money.focus ? await Money.focus(opts) : {};
    const what = [got.category, got.wallet, opts.month].filter(Boolean).join(' · ');
    presentBar('#view-money', I18n.t('{0} is showing:', who) + ` <b>${escH(what || I18n.t('Money'))}</b>`, () => window.Money && Money.clearFocus && Money.clearFocus());
    return;
  }
  if (opts.view === 'page' && opts.page) { lastWork = 'notebook'; showTab('notebook'); let p = opts.page; if (!/\.md$/.test(p)) p += '.md'; setTimeout(() => openPage(p), 150); return; }
  // tasks: tree, table or timeline, maybe one project / area
  const view = opts.view === 'timeline' || opts.view === 'table' || opts.view === 'tree' ? opts.view : opts.view === 'tasks' ? null : 'timeline';
  if (view) try { localStorage.setItem(viewKey(), view); } catch {}
  if (opts.which && ['open', 'done', 'all'].includes(opts.which)) { taskFilter = opts.which; $$('#view-tasks .seg button[data-filter]').forEach((x) => x.classList.toggle('on', x.dataset.filter === taskFilter)); }
  taskFocus = opts.project || opts.area ? { project: opts.project || null, area: opts.area || null } : null;
  if (window.Timeline) Timeline.focus({ project: opts.project || '', zoom: opts.zoom || null });
  lastWork = 'tasks';
  showTab('tasks');
  if (taskFocus) presentBar('#view-tasks', I18n.t('{0} is showing:', who) + ` <b>${escH(opts.project || opts.area)}</b>`, clearTaskFocus);
  else presentBar('#view-tasks', null);
});

// A suggested move of several tasks (the Save card): in full screen the timeline on the left shows it first, striped,
// with where each task was. Dragging a striped bar changes the card; Save / Discard on either side decides.
async function previewMoves(card, cEl) {
  if (!wideMode || !window.Timeline || card.tool !== 'move_tasks' || !card.rows || !card.rows.length) return;
  const all = await S.tasks();
  const projects = [...new Set(card.rows.map((r) => (all.find((t) => t.id === r.id) || {}).project).filter(Boolean))];
  const rowsEl = [...cEl.querySelectorAll('.mv-row')];
  const changes = new Map();
  const sync = () => {
    changes.clear();
    card.rows.forEach((r, i) => { const re = rowsEl[i]; if (!re) return; const cb = re.querySelector('input[type=checkbox]'), d = re.querySelector('input[type=date]'); if (cb.checked && d.value) changes.set(r.id, { due: d.value, start: r.start || null }); });
  };
  sync();
  const who = (await S.getAvatar().catch(() => ({}))).name || 'Scribble';
  const p = {
    changes, who, project: projects.length === 1 ? projects[0] : '',
    onDrag: (id, start, due) => { const i = card.rows.findIndex((r) => r.id === id); if (i < 0 || !rowsEl[i]) return; card.rows[i].start = start; rowsEl[i].querySelector('input[type=date]').value = due; },
    onSave: () => cEl.querySelector('.card-actions .btn:not(.ghost)')?.click(),
    onDiscard: () => cEl.querySelector('.card-actions .btn.ghost')?.click(),
  };
  rowsEl.forEach((re) => re.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { sync(); Timeline.setPreview(p); })));
  try { localStorage.setItem(viewKey(), 'timeline'); } catch {}
  taskFocus = p.project ? { project: p.project } : null;
  Timeline.setPreview(p);
  lastWork = 'tasks'; showTab('tasks');
  if (p.project) presentBar('#view-tasks', I18n.t('{0} is showing:', escH(who)) + ` <b>${escH(p.project)}</b>`, clearTaskFocus);
  // the card was answered (or went away): the preview ends
  const watch = setInterval(() => { if (!cEl.isConnected || !cEl.classList.contains('open')) { clearInterval(watch); Timeline.setPreview(null); loadTasks(); } }, 400);
}
if (S.onMoneyChanged) S.onMoneyChanged(() => { if (currentTab === 'money' && window.Money) Money.show(); });
$('#btn-settings').addEventListener('click', () => showTab(currentTab === 'settings' ? (wideMode ? lastLeft : 'chat') : 'settings'));
$('#btn-close').addEventListener('click', () => S.hide());
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') { e.preventDefault(); S.setWide(!wideMode); return; }
  if (e.key === 'Escape' && !wideMode && !(currentTab === 'notebook' && !$('#nb-editor').hidden)) S.hide();
});

// ---- wide (full-screen workspace) mode ----
function applyWide(on) {
  wideMode = !!on;
  document.body.classList.toggle('wide', wideMode);
  $('#btn-wide').title = wideMode ? 'Back to the small panel (F11)' : 'Expand to full screen (F11)';
  if (wideMode && (currentTab === 'chat')) showTab(lastLeft);
  else if (!wideMode && currentTab !== 'settings') showTab(currentTab);
  if (currentTab === 'tasks') loadTasks();
}
$('#btn-wide').addEventListener('click', () => S.setWide(!wideMode));
$('header').addEventListener('dblclick', (e) => { if (!e.target.closest('button, nav')) S.setWide(!wideMode); });
S.onWide(applyWide);
S.getWide().then(applyWide);
S.onShown(({ tab } = {}) => showTab(tab || (currentTab === 'settings' ? 'chat' : currentTab)));

// external links (in rendered markdown and settings)
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-ext]');
  if (a) { e.preventDefault(); S.openExternal(a.dataset.ext); }
  // a past chat the buddy found ("the 28 Oct chat")
  const ch = e.target.closest('[data-chat]');
  if (ch) { e.preventDefault(); showTab('chat'); openPastChat(ch.dataset.chat); return; }
  // a page the buddy quoted from ("Source: [Vendor quote](page:Projects/Vendor.md)")
  const pg = e.target.closest('[data-page]');
  if (pg && !pg.classList.contains('td-pg')) { e.preventDefault(); let p = decodeURIComponent(pg.dataset.page); if (!/\.md$/.test(p)) p += '.md'; showTab('notebook'); setTimeout(() => openPage(p), 200); }
});

// ---------------- chat ----------------
const msgsEl = $('#messages');

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

let currentBrief = null, currentSuggestion = null;
function renderMessages(list) {
  msgsEl.innerHTML = '';
  if (currentBrief && !viewingOld) msgsEl.append(briefCard(currentBrief));
  for (const m of list) addMessage(m);
  markOldOptions();
  if (currentSuggestion && !viewingOld) msgsEl.append(suggestionCard(currentSuggestion));
  $('#empty').hidden = list.length > 0 || viewingOld || !!currentBrief || !!currentSuggestion;
  scrollDown();
}

// ---- routine cards ----
function briefCard(b) {
  const c = el('div', 'brief');
  const head = el('div', 'brief-head', '<span>☀️ Today</span>');
  const x = el('button', 'brief-x', '×'); x.title = 'Dismiss';
  x.addEventListener('click', async () => { await S.dismissBrief(); currentBrief = null; c.remove(); $('#empty').hidden = msgsEl.children.length > 0; });
  head.append(x);
  const body = el('div', 'md', renderMarkdown(b.text));
  const row = el('div', 'brief-actions');
  const plan = el('button', 'btn'); plan.textContent = 'Plan my day with AI';
  plan.addEventListener('click', () => send("Here's my day. Help me plan it: suggest an order for today's tasks with rough time blocks, and flag anything I should reschedule.", '☀️ Plan my day'));
  const tasks = el('button', 'btn ghost'); tasks.textContent = 'Open tasks';
  tasks.addEventListener('click', () => showTab('tasks'));
  row.append(plan);
  if (b.counts && b.counts.overdue > 0) {
    // gentle rescheduling: one tap for a realistic new plan instead of editing dates one by one
    const fix = el('button', 'btn ghost'); fix.textContent = I18n.t('🗓 Reschedule {0} late', b.counts.overdue);
    fix.addEventListener('click', () => send('Some of my tasks are late. Make me a realistic new schedule for them (reschedule_late), tell me kindly in one line, and apply it with move_tasks.', I18n.t('🗓 Reschedule late tasks')));
    row.append(fix);
  }
  row.append(tasks);
  c.append(head, body, row);
  return c;
}
function suggestionCard(sg) {
  const c = el('div', 'suggest');
  const t = el('div', 'suggest-title'); t.textContent = `📝 ${sg.title}`;
  const row = el('div', 'brief-actions');
  sg.prompts.forEach((p, i) => {
    const b = el('button', i === 0 ? 'btn' : 'btn ghost'); b.textContent = p.label;
    b.addEventListener('click', async () => { await S.dismissSuggestion(); currentSuggestion = null; c.remove(); send(p.prompt, `📝 ${p.label}`); });
    row.append(b);
  });
  const later = el('button', 'link'); later.textContent = 'Not now';
  later.addEventListener('click', async () => { await S.dismissSuggestion(); currentSuggestion = null; c.remove(); });
  row.append(later);
  c.append(t, row);
  return c;
}
S.onBrief((b) => { currentBrief = b; if (!busy && !viewingOld) loadChat(); });
S.onSuggest((sg) => { currentSuggestion = sg; if (!busy && !viewingOld) loadChat(); });

// copy a reply (e.g. the weekly report) to paste into WhatsApp or email
msgsEl.addEventListener('click', async (e) => {
  const b = e.target.closest('.copy-btn');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.parentElement.dataset.raw || ''); toast('Copied'); } catch { toast('Couldn\'t copy'); }
});

function fileChip(f) {
  if (f.kind === 'image' && f.thumb) {
    const img = el('img', 'att-thumb'); img.src = f.thumb; img.alt = f.name; img.title = f.name;
    return img;
  }
  const c = el('span', 'att-file'); c.textContent = `${f.kind === 'pdf' ? '📕' : f.kind === 'image' ? '🖼️' : '📄'} ${f.name}`;
  return c;
}

function userBubble(m) {
  const n = el('div', 'msg user');
  if (m.files && m.files.length) {
    const row = el('div', 'att-row in-msg');
    for (const f of m.files) row.append(fileChip(f));
    n.append(row);
  }
  if (m.text) { const t = el('div'); t.textContent = m.text; n.append(t); }
  return n;
}

// "[[options: A | B | C]]" at the end of a reply: choices the user can tap (which wallet, which category…)
const OPT_RE = /\n?\s*\[\[\s*options?\s*:\s*([^\]]*)\]\]\s*$/i;
function splitOptions(text) {
  const m = String(text || '').match(OPT_RE);
  if (!m) return { text, options: [] };
  return { text: text.slice(0, m.index).trim(), options: m[1].split('|').map((x) => x.trim()).filter(Boolean).slice(0, 8) };
}
function optionRow(options) {
  const row = el('div', 'opt-row');
  for (const o of options) {
    const b = el('button', 'opt' + (/^\+/.test(o) ? ' new' : ''));
    b.textContent = o;
    b.addEventListener('click', () => { if (row.classList.contains('old') || busy) return; row.classList.add('old'); b.classList.add('picked'); send(o); });
    row.append(b);
  }
  return row;
}
// only the latest question's choices can be tapped
function markOldOptions() {
  const rows = $$('#messages .opt-row');
  rows.forEach((r, i) => { let n = r.nextElementSibling, answered = false; while (n) { if (n.classList.contains('user')) answered = true; n = n.nextElementSibling; } r.classList.toggle('old', answered || i < rows.length - 1); });
}
// a money record the buddy saved: what, category, wallet, amount, the wallet's new balance; Edit and Undo
const rpFmt = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
function moneyCard(r) {
  const c = el('div', 'mcard' + (r.kind === 'transfer' ? ' transfer' : ''));
  const top = el('div', 'mcard-top');
  const info = el('div', 'mcard-info');
  const d = el('div', 'mcard-desc'); d.textContent = r.description;
  const chips = el('div', 'mcard-chips');
  if (r.category) { const ch = el('span', 'mchip cat'); ch.textContent = r.category; if (r.color) ch.style.setProperty('--c', r.color); chips.append(ch); }
  const wc = el('span', 'mchip'); wc.textContent = r.kind === 'transfer' ? `${r.wallet} → ${r.toWallet}` : r.wallet; chips.append(wc);
  if (r.planned) { const pl = el('span', 'mchip planned'); pl.textContent = `${t('planned')} · ${new Date(r.date + 'T12:00').toLocaleDateString(window.I18n ? I18n.locale() : undefined, { day: 'numeric', month: 'short' })}`; chips.append(pl); }
  info.append(d, chips);
  const amt = el('div', 'mcard-amt ' + r.kind); amt.textContent = (r.kind === 'in' ? '+' : r.kind === 'out' ? '−' : '') + rpFmt(r.amount).replace('−', '');
  top.append(info, amt);
  const foot = el('div', 'mcard-foot');
  const bal = el('span', 'mcard-bal'); bal.textContent = r.planned ? t('Counts when it happens') : r.balance ? `${r.wallet}: ${r.balance}${r.toBalance ? ` · ${r.toWallet}: ${r.toBalance}` : ''}` : '';
  const edit = el('button', 'link'); edit.textContent = t('Edit');
  edit.addEventListener('click', () => { showTab('money'); window.Money && Money.edit(r.id, r.date); });
  const undo = el('button', 'link'); undo.textContent = t('Undo');
  undo.addEventListener('click', async () => {
    const res = await S.moneyDeleteRecord(r.id);
    if (res && res.ok) { c.classList.add('undone'); bal.textContent = t('Removed'); undo.remove(); edit.remove(); }
  });
  foot.append(bal, el('span', 'spacer'), edit, undo);
  c.append(top, foot);
  return c;
}

function addMessage(m) {
  $('#empty').hidden = true;
  if (m.role === 'user') {
    msgsEl.append(userBubble(m));
  } else {
    const { text: shown, options } = splitOptions(m.text);
    if (shown) {
      const bubble = el('div', 'msg assistant md', renderMarkdown(shown));
      bubble.dataset.raw = shown;
      const cp = el('button', 'copy-btn', '⧉'); cp.title = 'Copy';
      bubble.append(cp);
      msgsEl.append(bubble);
    }
    if (m.money && m.money.length) for (const r of m.money) msgsEl.append(moneyCard(r));
    if (options.length) msgsEl.append(optionRow(options));
    if (m.tools && m.tools.length || (m.undo && m.undo.length)) {
      const t = el('div', 'tools');
      for (const label of m.tools || []) {
        const c = el('span', `tool${label.endsWith(I18n.t('(not saved)')) ? ' skipped' : ''}`);
        c.textContent = label; t.append(c);
      }
      if (m.undo && m.undo.length) {
        // everything the buddy changed in this reply, undone in one go
        const u = el('button', 'undo-run'); u.type = 'button';
        u.textContent = m.undo.length > 1 ? I18n.t('↶ Undo all {0}', m.undo.length) : I18n.t('↶ Undo');
        u.addEventListener('click', async () => {
          const r = await S.undoIds(m.undo);
          if (!r || !r.ok) { toast((r && r.error) || 'Couldn\'t undo.'); return; }
          u.replaceWith(Object.assign(el('span', 'tool skipped'), { textContent: I18n.t('Undone') }));
          if (currentTab === 'tasks') loadTasks();
        });
        t.append(u);
      }
      msgsEl.append(t);
    }
  }
}

function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }

function showError(msg, text, files, label) {
  let html;
  if (msg === 'NO_ACCOUNT') html = 'Please sign in with Google first. <button data-go="onboard">Sign in</button>';
  else if (msg === 'NO_KEY') html = 'I need an AI key before I can think. <button data-go="onboard">Set it up (1 minute)</button>';
  else html = `${msg.replace(/</g, '&lt;')}${text || files?.length ? ' <button data-retry>Try again</button>' : ''}`;
  const n = el('div', 'msg error', html);
  n.querySelector('[data-go]')?.addEventListener('click', (e) => (e.target.dataset.go === 'onboard' ? openOnboarding() : showTab('settings')));
  n.querySelector('[data-retry]')?.addEventListener('click', () => { n.remove(); msgsEl.lastElementChild?.remove(); attachments = files || []; renderAttachRow(); send(text, label); });
  msgsEl.append(n);
  scrollDown();
}

// ---- live streaming ----
let liveTools = null;
let live = null;                 // the assistant bubble currently being streamed
function insertLive(node) {
  const typing = $('.typing');
  msgsEl.insertBefore(node, typing || null);
}
function showTyping(on) { const t = $('.typing'); if (t) t.hidden = !on || $$('.card.open').length > 0; }
S.onStep(() => { live = null; liveTools = null; showTyping(true); });
S.onDelta((d) => {
  if (!busy || viewingOld) return;
  if (!live) { live = { el: el('div', 'msg assistant md'), text: '' }; insertLive(live.el); }
  live.text += d;
  live.el.innerHTML = renderMarkdown(live.text.replace(/\n?\s*\[\[[^\]]*\]?\]?\s*$/, ''));
  showTyping(false);
  scrollDown();
});
S.onTool((label) => {
  if (!liveTools) { liveTools = el('div', 'tools'); insertLive(liveTools); }
  const c = el('span', 'tool'); c.textContent = label; liveTools.append(c);
  showTyping(true);
  scrollDown();
});

async function send(text, label) {
  text = (text ?? $('#input').value).trim();
  if (viewingOld) return;
  if (!text && !attachments.length) return;
  if (busy) {
    // Replying to open proposals instead of pressing Save/Skip
    if (!text || !$$('.card.open').length) return;
    $('#input').value = '';
    autosize();
    $$('.card.open').forEach((c) => closeCard(c, 'Not saved: you replied'));
    live = null; liveTools = null;
    insertLive(userBubble({ text }));
    showTyping(true);
    scrollDown();
    await S.send(text);
    return;
  }
  const files = attachments;
  attachments = [];
  renderAttachRow();
  busy = true;
  $('#send').disabled = true;
  $('#input').value = '';
  autosize();
  addMessage({ role: 'user', text: label || text, files: files.map(({ name, kind, thumb }) => ({ name, kind, thumb })) });
  const typing = el('div', 'typing', '<span></span><span></span><span></span>');
  msgsEl.append(typing);
  scrollDown();

  const r = await S.send(text, files, label);
  typing.remove();
  live = null; liveTools = null;
  busy = false;
  $('#send').disabled = false;

  if (r.error) showError(r.error, r.text, files, label);
  else { renderMessages(r.messages); if (window.Voice && r.reply) Voice.say(r.reply); }
  setComposerHint();
  refreshUndo();
  $('#input').focus();
  return r;
}
// quick capture (Ctrl+Alt+Space) and things dropped on the buddy come in through here
if (S.onQuickSend) S.onQuickSend(async (text) => {
  if (busy || viewingOld) { S.quickResult({ error: I18n.t('Your buddy is busy with something else. Try again in a moment.') }); return; }
  if (currentTab !== 'chat' && !wideMode) showTab('chat');
  const r = await send(text);
  const lastA = r && r.messages ? [...r.messages].reverse().find((m) => m.role === 'assistant') : null;
  S.quickResult({ reply: r && r.reply, error: r && r.error ? (r.error === 'NO_KEY' || r.error === 'NO_ACCOUNT' ? I18n.t('Open Scribble to finish setting up first.') : r.error) : null, undo: lastA && lastA.undo ? lastA.undo : null });
});
if (S.onQuickFill) S.onQuickFill((text) => { showTab('chat'); $('#input').value = text; autosize(); $('#input').focus(); });
window.__onDropped = async (d) => {
  showTab('chat');
  if (d.text) { $('#input').value = ($('#input').value ? $('#input').value + '\n' : '') + d.text; autosize(); }
  const files = (d.files || []).map((f) => new File([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], f.name, { type: f.type || 'application/octet-stream' }));
  if (files.length) await addFiles(files);
  if (d.send && !busy) send(d.prompt || $('#input').value || '', d.label);
};
if (S.onDropped) S.onDropped((d) => window.__onDropped(d));

// Android: keep the home-screen widget up to date
(() => {
  const WP = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.ScribbleWidget;
  if (!WP || !S.widgetData) return;
  let t = null;
  const push = () => { clearTimeout(t); t = setTimeout(async () => { try { await WP.set(await S.widgetData()); } catch {} }, 1200); };
  S.onNotebookChanged(push);
  if (S.onMoneyChanged) S.onMoneyChanged(push);
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(); });
  push();
  setInterval(push, 15 * 60 * 1000);
})();
// Android: "Share to Scribble" from any app (text, links, pictures, PDFs) works like dropping it on the buddy
(() => {
  const SP = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.ScribbleShare;
  if (!SP) return;
  const take = async () => {
    let r; try { r = await SP.take(); } catch { return; }
    if (!r || (!r.text && !(r.files || []).length)) return;
    const files = (r.files || []).map((f) => ({ name: f.name || 'shared', type: f.type, data: f.data }));
    const text = [r.subject, r.text].filter(Boolean).join('\n').trim();
    const what = files.length ? files.map((f) => f.name).join(', ') : '';
    const prompt = files.length
      ? `I shared ${files.length === 1 ? 'this' : 'these'} with you from another app (${what})${text ? ` with this text: "${text}"` : ''}. In one or two short lines say what it is and the key facts (for a bill: who, amount, due date). Then offer what to do with it as options: for a bill, plan it as a payment, mark it paid, or just keep it; otherwise the two or three most useful actions (add task(s), save as a note, record money, summarise). Don't save anything until I pick.`
      : `I shared this with you from another app:\n\n"${text}"\n\nIn one short line say what it is. If it asks me to do things, list the tasks you'd add (with due dates if it says when). Then offer what to do as options (add the task(s), save as a note, record money, or something else that fits). Don't save anything until I pick.`;
    const label = I18n.t('📤 Shared: {0}', files.length ? what : `"${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);
    const go = () => { if (busy) { setTimeout(go, 800); return; } window.__onDropped({ files, send: true, prompt, label }); };
    setTimeout(go, 600);
  };
  SP.addListener('shared', take);
  setTimeout(take, 1500);
})();

// ---- handwriting: a writing pad for a stylus (or finger / mouse); the page goes to the AI as a picture ----
// The AI reads it and, as always, asks before saving anything. Only what it read is saved, not the drawing.
const Pad = (() => {
  const T = (s) => (window.I18n ? I18n.t(s) : s);
  const COLORS = ['#2B2A4C', '#3F6FD8', '#D6453D'];
  let root, cv, ctx, strokes = [], cur = null, tool = 'pen', color = COLORS[0], penSeen = false, dpr = 1;
  const PROMPT = 'This is my handwriting. Write out exactly what it says (keep my words and language). If it has tasks, reminders or notes, offer to save them the usual way. If a word is hard to read, give your best guess and mark it with (?).';

  function build() {
    root = el('div', 'pad');
    root.id = 'pad';
    root.hidden = true;
    root.innerHTML = `
      <div class="pad-bar">
        <button type="button" class="pad-t pad-x" data-a="cancel" title="Cancel">✕</button>
        <button type="button" class="pad-t on" data-tool="pen" title="Pen">✏️</button>
        <button type="button" class="pad-t" data-tool="eraser" title="Eraser">🧽</button>
        <span class="pad-sep"></span>
        ${COLORS.map((c, i) => `<button type="button" class="pad-c${i ? '' : ' on'}" data-color="${c}" style="--c:${c}" title="Colour"></button>`).join('')}
        <span class="pad-sep"></span>
        <button type="button" class="pad-t" data-a="undo" title="Undo">↶</button>
        <button type="button" class="pad-t" data-a="clear" title="Clear the page">🗑</button>
        <span class="pad-grow"></span>
        <button type="button" class="btn" data-a="done">Read it</button>
      </div>
      <div class="pad-paper"><canvas></canvas><p class="pad-hint">Write here with your pen or finger</p></div>`;
    document.body.append(root);
    cv = root.querySelector('canvas');
    ctx = cv.getContext('2d');
    root.querySelector('.pad-bar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) { tool = b.dataset.tool; root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); }
      if (b.dataset.color) { color = b.dataset.color; tool = 'pen'; root.querySelectorAll('.pad-c').forEach((x) => x.classList.toggle('on', x === b)); root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === 'pen')); }
      if (b.dataset.a === 'undo') { strokes.pop(); redraw(); }
      if (b.dataset.a === 'clear') { strokes = []; redraw(); }
      if (b.dataset.a === 'cancel') close();
      if (b.dataset.a === 'done') done();
    });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => cv.addEventListener(ev, up));
    window.addEventListener('resize', () => { if (!root.hidden) fit(); });
    document.addEventListener('keydown', (e) => {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); strokes.pop(); redraw(); }
    });
  }
  function fit() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    redraw();
  }
  // a pen in use: ignore the hand resting on the screen (touches) until the page is closed
  function accept(e) { if (e.pointerType === 'pen') penSeen = true; return !(penSeen && e.pointerType === 'touch'); }
  function pt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5]; }
  function down(e) {
    if (!accept(e) || (e.button && e.button !== 0)) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch {}
    cur = { id: e.pointerId, tool, color, w: tool === 'eraser' ? 26 : 3.2, pts: [pt(e)] };
    strokes.push(cur);
    root.classList.add('inked');
    redraw();
  }
  function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const x of (evs.length ? evs : [e])) cur.pts.push(pt(x));
    drawStroke(ctx, cur, dpr, cur.pts.length - evs.length - 1);
  }
  function up(e) { if (cur && e.pointerId === cur.id) cur = null; }
  function drawStroke(c, s, k, from = 0) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    c.strokeStyle = s.color; c.fillStyle = s.color;
    const P = s.pts;
    if (P.length === 1) { c.beginPath(); c.arc(P[0][0] * k, P[0][1] * k, s.w * k * (0.6 + P[0][2] * 0.8) / 2, 0, 7); c.fill(); }
    for (let i = Math.max(1, from); i < P.length; i++) {
      const [x0, y0, p0] = P[i - 1], [x1, y1, p1] = P[i];
      c.lineWidth = s.w * k * (s.tool === 'eraser' ? 1 : 0.6 + ((p0 + p1) / 2) * 0.8);
      c.beginPath(); c.moveTo(x0 * k, y0 * k); c.lineTo(x1 * k, y1 * k); c.stroke();
    }
    c.restore();
  }
  function redraw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokes.forEach((s) => drawStroke(ctx, s, dpr));
    root.classList.toggle('inked', strokes.some((s) => s.tool === 'pen'));
  }
  function open() {
    if (!root) build();
    strokes = []; cur = null; penSeen = false; tool = 'pen';
    root.hidden = false;
    document.body.classList.add('pad-open');
    requestAnimationFrame(fit);
  }
  function close() { root.hidden = true; document.body.classList.remove('pad-open'); strokes = []; }
  // the written part of the page, dark ink on white, at most 1568 px (what the AI models read best)
  function snapshot() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) if (s.tool === 'pen') for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!isFinite(x0)) return null;
    const m = 24; x0 -= m; y0 -= m; x1 += m; y1 += m;
    const w = x1 - x0, h = y1 - y0;
    const k = Math.min(2, 1568 / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
    const layer = document.createElement('canvas');           // strokes (with the eraser) on their own layer, then onto white
    layer.width = out.width; layer.height = out.height;
    const lc = layer.getContext('2d');
    lc.translate(-x0 * k, -y0 * k);
    strokes.forEach((s) => drawStroke(lc, s, k));
    const oc = out.getContext('2d');
    oc.fillStyle = '#fff'; oc.fillRect(0, 0, out.width, out.height);
    oc.drawImage(layer, 0, 0);
    const thumb = document.createElement('canvas');
    const tk = 160 / Math.max(out.width, out.height);
    thumb.width = Math.max(1, Math.round(out.width * tk)); thumb.height = Math.max(1, Math.round(out.height * tk));
    thumb.getContext('2d').drawImage(out, 0, 0, thumb.width, thumb.height);
    return { data: out.toDataURL('image/jpeg', 0.9).split(',')[1], thumb: thumb.toDataURL('image/jpeg', 0.8) };
  }
  function done() {
    const shot = snapshot();
    if (!shot) { toast(T('Write something first.')); return; }
    close();
    attachments.push({ name: 'handwriting.jpg', kind: 'image', mediaType: 'image/jpeg', data: shot.data, thumb: shot.thumb });
    renderAttachRow();
    const extra = $('#input').value.trim();
    send(extra ? `${PROMPT}\n\n${extra}` : PROMPT, extra || '✏️ ' + T('Handwritten note'));
  }
  return { open, close, snapshot, get strokes() { return strokes; } };
})();
window.__scribblePad = Pad;

// ---- attachments: paste, drop or pick screenshots, PDFs and text files ----
let attachments = [];
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg', 'sql', 'js', 'ts', 'py', 'sh', 'ps1', 'html', 'css', 'env', 'toml']);
const API_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const readAs = (file, how) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  how === 'text' ? r.readAsText(file) : r.readAsDataURL(file);
});

async function canvasFrom(bitmap, max, type, quality) {
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL(type, quality);
}

// The PDF's text, read here with PDF.js (Mozilla's PDF reader): sent instead of the PDF when a model can't read PDFs.
// Empty for scanned PDFs (pictures of pages). Loaded only the first time a PDF is attached.
let pdfjsReady = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return (pdfjsReady ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; rej(new Error('PDF reader did not load')); };
    document.head.appendChild(s);
  }));
}
async function pdfText(file, maxPages = 80, maxChars = 200000) {
  try {
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    let out = '';
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n && out.length < maxChars; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let line = '';
      for (const it of tc.items) { line += it.str; if (it.hasEOL) line += '\n'; else if (it.str && !/\s$/.test(it.str)) line += ' '; }
      out += `\n--- Page ${i} ---\n` + line.replace(/[ \t]+\n/g, '\n').trim() + '\n';
    }
    if (doc.numPages > n) out += `\n[Only the first ${n} of ${doc.numPages} pages were read.]`;
    doc.destroy();
    return out.replace(/--- Page \d+ ---\n\n/g, '').trim().length > 20 ? out.slice(0, maxChars).trim() : '';
  } catch (e) {
    console.warn('[scribble] could not read PDF text', e && e.message);
    return '';
  }
}

async function addFiles(fileList) {
  for (const file of [...fileList]) {
    if (attachments.length >= 10) { toast('Up to 10 files per message.'); break; }
    const name = file.name || `pasted-${new Date().toLocaleTimeString('en-GB').replace(/:/g, '')}.png`;
    const ext = (name.split('.').pop() || '').toLowerCase();
    try {
      if (file.type.startsWith('image/')) {
        const bmp = await createImageBitmap(file);
        let mediaType = file.type, data;
        if (API_IMAGE_TYPES.includes(file.type) && Math.max(bmp.width, bmp.height) <= 1568 && file.size < 3.5e6) {
          data = (await readAs(file)).split(',')[1];
        } else {
          data = (await canvasFrom(bmp, 1568, 'image/jpeg', 0.88)).split(',')[1];
          mediaType = 'image/jpeg';
        }
        const thumb = await canvasFrom(bmp, 160, 'image/jpeg', 0.8);
        attachments.push({ name, kind: 'image', mediaType, data, thumb });
      } else if (file.type === 'application/pdf' || ext === 'pdf') {
        if (file.size > 20e6) { toast(`${name} is over 20 MB.`); continue; }
        attachments.push({ name, kind: 'pdf', mediaType: 'application/pdf', data: (await readAs(file)).split(',')[1], text: await pdfText(file) });
      } else if (file.type.startsWith('text/') || TEXT_EXT.has(ext)) {
        if (file.size > 400e3) { toast(`${name} is too long. Keep text files under 400 KB.`); continue; }
        attachments.push({ name, kind: 'text', mediaType: 'text/plain', data: await readAs(file, 'text') });
      } else {
        toast(`Can't read .${ext || 'that'} files yet. Try a screenshot, a PDF or a text file.`);
      }
    } catch {
      toast(`Couldn't read ${name}.`);
    }
  }
  renderAttachRow();
}

function renderAttachRow() {
  const row = $('#attach-row');
  row.innerHTML = '';
  row.hidden = !attachments.length;
  attachments.forEach((a, i) => {
    const chip = el('span', 'att-chip');
    chip.append(fileChip(a));
    const x = el('button', 'att-x', '×'); x.title = 'Remove';
    x.addEventListener('click', () => { attachments.splice(i, 1); renderAttachRow(); });
    chip.append(x);
    row.append(chip);
  });
}

$('#btn-attach').addEventListener('click', () => $('#file-pick').click());
$('#btn-pen').addEventListener('click', () => Pad.open());

// ---- snip: capture an area of the screen straight into the chat ----
// Desktop app: the whole screen freezes, you drag a box. Browser: pick a screen or window to share, then drag a box.
const IS_ELECTRON = /Electron/.test(navigator.userAgent);
const NATIVE_APP = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
if (NATIVE_APP || (!IS_ELECTRON && !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia))) $('#btn-snip').hidden = true;
async function addSnip(blob) {
  const f = new File([blob], `snip-${new Date().toLocaleTimeString('en-GB').replace(/:/g, '')}.png`, { type: 'image/png' });
  await addFiles([f]);
  $('#input').focus();
}
function cropOverlay(bitmap) {
  return new Promise((resolve) => {
    const o = el('div', 'snip-ov');
    const cv = el('canvas'); cv.width = bitmap.width; cv.height = bitmap.height; cv.getContext('2d').drawImage(bitmap, 0, 0);
    const box = el('div', 'snip-box'), hint = el('div', 'snip-hint'); hint.textContent = I18n.t('Drag over the area to send to your buddy. Esc to cancel.');
    o.append(cv, box, hint); document.body.append(o);
    let a = null;
    const fit = () => cv.getBoundingClientRect();
    const end = (r) => { o.remove(); removeEventListener('keydown', key, true); resolve(r); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(null); } };
    addEventListener('keydown', key, true);
    o.addEventListener('pointerdown', (e) => { a = { x: e.clientX, y: e.clientY }; o.setPointerCapture(e.pointerId); });
    o.addEventListener('pointermove', (e) => {
      if (!a) return;
      Object.assign(box.style, { display: 'block', left: Math.min(a.x, e.clientX) + 'px', top: Math.min(a.y, e.clientY) + 'px', width: Math.abs(e.clientX - a.x) + 'px', height: Math.abs(e.clientY - a.y) + 'px' });
    });
    o.addEventListener('pointerup', (e) => {
      if (!a) return;
      const r = fit(), sx = cv.width / r.width, sy = cv.height / r.height;
      const x = Math.max(0, Math.min(a.x, e.clientX) - r.left) * sx, y = Math.max(0, Math.min(a.y, e.clientY) - r.top) * sy;
      const w = Math.min(cv.width - x, Math.abs(e.clientX - a.x) * sx), h = Math.min(cv.height - y, Math.abs(e.clientY - a.y) * sy);
      a = null;
      if (w < 8 || h < 8) { box.style.display = 'none'; return; }
      const out = el('canvas'); out.width = Math.round(w); out.height = Math.round(h);
      out.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, out.width, out.height);
      out.toBlob((b) => end(b), 'image/png');
    });
  });
}
$('#btn-snip').addEventListener('click', async () => {
  if (IS_ELECTRON && S.snip) {
    const r = await S.snip();
    if (r && r.ok) { const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)); await addSnip(new Blob([bin], { type: 'image/png' })); }
    else if (r && r.error) toast(r.error);
    return;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return; }
  try {
    const v = el('video'); v.muted = true; v.srcObject = stream; await v.play();
    await new Promise((r) => setTimeout(r, 300));
    const bmp = await createImageBitmap(v);
    stream.getTracks().forEach((t) => t.stop());
    const blob = await cropOverlay(bmp);
    if (blob) await addSnip(blob);
  } catch (e) { stream.getTracks().forEach((t) => t.stop()); toast(e.message); }
});
document.querySelectorAll('.about [data-url], .voice-box [data-url]').forEach((b) => b.addEventListener('click', () => S.openExternal(b.dataset.url)));
$('#file-pick').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#input').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
const chatView = $('#view-chat');
chatView.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('Files') || viewingOld) return;
  e.preventDefault();
  chatView.classList.add('file-over');
});
chatView.addEventListener('dragleave', (e) => { if (!chatView.contains(e.relatedTarget)) chatView.classList.remove('file-over'); });
chatView.addEventListener('drop', (e) => {
  chatView.classList.remove('file-over');
  if (!e.dataTransfer.files.length || viewingOld) return;
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

// ---- past chats ----
let viewingOld = false;
function dayLabel(iso) {
  const d = new Date(iso);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const diff = Math.round((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}

async function showHistory(on) {
  $('#history').hidden = !on;
  if (!on) return;
  const list = await S.listChats();
  const box = $('#history-list');
  box.innerHTML = '';
  if (!list.length) { box.append(el('div', 'none', 'No past chats yet.')); return; }
  let lastDay = '';
  for (const c of list) {
    const day = dayLabel(c.created);
    if (day !== lastDay) { const h = el('div', 'group-title'); h.textContent = day; box.append(h); lastDay = day; }
    const b = el('button', `hist-item${c.current ? ' on' : ''}`);
    const t = el('span', 'hist-title'); t.textContent = c.title;
    const meta = el('span', 'hist-meta');
    meta.textContent = `${new Date(c.created).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' })} · ${c.turns} message${c.turns === 1 ? '' : 's'}`;
    b.append(t, meta);
    b.addEventListener('click', () => openPastChat(c.id));
    box.append(b);
  }
}

async function openPastChat(id) {
  if (busy) return toast('Wait for the current reply first.');
  const c = await S.openChat(id);
  if (!c) return toast('Couldn\'t open that chat.');
  showHistory(false);
  viewingOld = !c.current;
  $('#old-banner').hidden = !viewingOld;
  if (viewingOld) {
    $('#old-label').textContent = `${dayLabel(c.created)}, ${new Date(c.created).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' })} · read only`;
  }
  $('#composer').classList.toggle('disabled', viewingOld);
  $('#input').disabled = viewingOld;
  renderMessages(c.messages);
  setComposerHint();
}

$('#btn-history').addEventListener('click', () => showHistory($('#history').hidden));
$('#history-close').addEventListener('click', () => showHistory(false));
$('#btn-today').addEventListener('click', async () => {
  viewingOld = false;
  $('#old-banner').hidden = true;
  $('#composer').classList.remove('disabled');
  $('#input').disabled = false;
  await loadChat();
  setComposerHint();
});

// ---- undo ----
async function refreshUndo() {
  const u = await S.lastUndo();
  const b = $('#btn-undo');
  b.hidden = !u;
  if (u) b.title = `Undo: ${u.label}`;
}
$('#btn-undo').addEventListener('click', async () => {
  const r = await S.undo();
  if (r.undone.length) toast(`Undid: ${r.undone[0]}`);
  refreshUndo();
  if (currentTab === 'notebook') loadTree();
  if (currentTab === 'tasks') loadTasks();
});
S.onNotebookChanged(() => refreshUndo());

// ---------------- confirmation cards (two-way saving) ----------------
// What the user calls the three folder levels (Settings → App → Tasks)
let LEVELS = null;
const LV_DEFAULT = { area: 'Section', category: 'Project', project: 'Sub project' };
const lv = (k) => (LEVELS && LEVELS[k]) || I18n.t(LV_DEFAULT[k]);
function loadLevels() { return S.getSettings().then((s) => { LEVELS = s.levels || null; }).catch(() => {}); }
loadLevels();
// card labels that name a level follow those names
const LV_LABEL = { Area: 'area', Category: 'category', Section: 'category', Project: 'project' };
const FIELDS = {
  capture_note: [['text', 'long', 'Note'], ['page', 'page', 'Save to']],
  append_to_page: [['content', 'long', 'Add'], ['path', 'page', 'Page'], ['heading', 'text', 'Under heading']],
  write_page: [['content', 'long', 'New content'], ['path', 'page', 'Page']],
  add_task: [['title', 'long', 'Task'], ['start', 'date', 'Start'], ['due', 'date', 'Due'], ['time', 'time', 'Time'], ['priority', 'priority', 'Priority'], ['area', 'area', 'Area'], ['project', 'project', 'Project'], ['notes', 'long', 'Notes']],
  update_task: [['status', 'status', 'Status'], ['title', 'long', 'Title'], ['start', 'date', 'Start'], ['due', 'date', 'Due'], ['time', 'time', 'Time'], ['priority', 'priority', 'Priority'], ['area', 'area', 'Area'], ['project', 'project', 'Project'], ['notes', 'long', 'Notes']],
  delete_task: [],
  create_project: [['name', 'text', 'Project'], ['area', 'area', 'Area'], ['category', 'category', 'Category'], ['goal', 'long', 'Goal']],
  create_folder: [['name', 'text', 'Folder'], ['parent', 'area', 'Inside']],
  remove_project: [['name', 'text', 'Project'], ['tasks', 'text', 'Its tasks (delete / keep)']],
  move_project: [['name', 'text', 'Project'], ['area', 'area', 'Move to'], ['category', 'category', 'Section'], ['new_name', 'text', 'New name']],
  log_project: [['entry', 'long', 'Progress'], ['name', 'project', 'Project'], ['area', 'area', 'Area (only if new)']],
};
// Which field the "options" chips fill in
const OPTION_TARGET = { capture_note: 'page', add_task: 'project', log_project: 'name' };
const SELECTS = { priority: ['low', 'medium', 'high'], status: ['todo', 'doing', 'hold', 'done', 'cancelled'] };
const SELECT_LABELS = { low: 'Low', medium: 'Medium', high: 'High', todo: 'To do', doing: 'In progress', hold: 'On hold', done: 'Done', cancelled: 'Cancelled' };
// Fields a new task can't be saved without (reports depend on them)
const REQUIRED = { add_task: ['start', 'due', 'priority'] };
const normPri = (p) => ({ normal: 'medium', med: 'medium' }[String(p || '').toLowerCase()] || String(p || '').toLowerCase());

let dlCount = 0;
function datalist(items) {
  const id = `dl${++dlCount}`;
  const d = el('datalist');
  d.id = id;
  for (const v of items) { const o = document.createElement('option'); o.value = v; d.append(o); }
  return d;
}

function renderCard(card) {
  const c = el('div', 'card open');
  c.dataset.id = card.id;
  const head = el('div', 'card-head');
  const title = el('span', 'card-title'); title.textContent = card.title;
  head.append(title);
  if (card.context) { const ctx = el('span', 'card-ctx'); ctx.textContent = card.context; head.append(ctx); }
  c.append(head);

  const L = card.lists || { pages: [], areas: [], projects: [] };
  // several tasks to new dates: one row each, untick to leave one where it is
  let moveRows = null;
  if (card.tool === 'move_tasks' && card.rows) {
    moveRows = [];
    const list = el('div', 'mv-list');
    const day = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
    for (const r of card.rows) {
      const row = el('label', 'mv-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
      const name = el('span', 'mv-t'); name.textContent = r.title;
      const from = el('span', 'mv-from'); from.textContent = day(r.from) + ' →';
      const d = el('input'); d.type = 'date'; d.value = r.due;
      row.append(cb, name, from, d);
      list.append(row);
      moveRows.push({ r, cb, d });
    }
    c.append(list);
  }
  const fields = card.tool === 'move_tasks' ? [] : FIELDS[card.tool] || Object.keys(card.input).map((k) => [k, 'text', k]);
  const onlyPresent = card.tool === 'update_task';
  const inputs = {};
  let grid = null;

  for (const [key, kind, label] of fields) {
    if (onlyPresent && card.input[key] === undefined) continue;
    const required = (REQUIRED[card.tool] || []).includes(key);
    const row = el('label', `field-row ${kind === 'long' ? 'stack' : 'cell'}${required ? ' req' : ''}`);
    const lab = el('span', 'f-label'); lab.textContent = LV_LABEL[label] ? lv(LV_LABEL[label]) : label;
    let inp;
    let val = card.input[key] ?? '';
    if (kind === 'priority') val = normPri(val);
    if (kind === 'long') {
      inp = el('textarea');
      inp.rows = val === '' ? 1 : Math.min(8, Math.max(2, String(val).split('\n').length + Math.floor(String(val).length / 44)));
    } else if (SELECTS[kind]) {
      inp = el('select');
      inp.innerHTML = (required ? '<option value="">Choose…</option>' : '')
        + SELECTS[kind].map((o) => `<option value="${o}">${SELECT_LABELS[o] || o}</option>`).join('');
      if (!val && kind === 'priority' && !required) inp.value = 'medium';
    } else {
      inp = el('input');
      inp.type = kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text';
      const list = kind === 'page' ? L.pages : kind === 'project' ? L.projects : kind === 'area' ? L.areas : kind === 'category' ? (L.categories || []) : null;
      if (list) { const d = datalist(list); row.append(d); inp.setAttribute('list', d.id); }
      if (kind === 'page' && card.tool === 'capture_note') inp.placeholder = "Today's page";
      else if (kind === 'area' || kind === 'category') inp.placeholder = 'None';
      else if (kind === 'project') inp.placeholder = 'None';
    }
    if (val !== '') inp.value = val;
    if (required) row.dataset.key = key;
    inputs[key] = inp;
    row.append(lab, inp);
    if (kind === 'long') { c.append(row); grid = null; }
    else {
      if (!grid) { grid = el('div', 'grid2'); c.append(grid); }
      grid.append(row);
    }
  }

  // One-tap alternative destinations suggested by Claude
  const target = OPTION_TARGET[card.tool];
  const opts = (card.input.options || []).filter(Boolean);
  if (target && inputs[target] && opts.length) {
    const chips = el('div', 'alt');
    const lab = el('span', 'f-label'); lab.textContent = 'Or:'; chips.append(lab);
    for (const o of opts) {
      const b = el('button', 'alt-chip'); b.type = 'button'; b.textContent = o.replace(/\.md$/, '');
      b.addEventListener('click', () => { inputs[target].value = o; inputs[target].focus(); });
      chips.append(b);
    }
    c.append(chips);
  }

  const actions = el('div', 'card-actions');
  const hint = el('span', 'card-hint'); hint.textContent = 'or reply below to change it';
  const skip = el('button', 'btn ghost'); skip.textContent = 'Skip';
  const save = el('button', 'btn'); save.textContent = card.tool === 'delete_task' ? 'Delete' : 'Save';
  actions.append(hint, skip, save);
  c.append(actions);

  // required fields: Save waits until they're filled in and the dates make sense
  const need = REQUIRED[card.tool] || [];
  const problem = el('div', 'card-problem');
  if (need.length) c.insertBefore(problem, actions);
  function validate() {
    if (!need.length) return true;
    const missing = need.filter((k) => !inputs[k] || !inputs[k].value.trim());
    const st = inputs.start?.value, du = inputs.due?.value;
    let msg = '';
    if (missing.length) msg = `Still needed: ${missing.map((k) => ({ start: 'start date', due: 'due date', priority: 'priority' }[k])).join(', ')}`;
    else if (st && du && st > du) msg = 'The start date is after the due date';
    for (const k of need) inputs[k]?.closest('.field-row')?.classList.toggle('missing', missing.includes(k) || (msg.startsWith('The start') && (k === 'start' || k === 'due')));
    problem.textContent = msg;
    problem.hidden = !msg;
    save.disabled = !!msg;
    return !msg;
  }
  for (const k of need) inputs[k]?.addEventListener('input', validate), inputs[k]?.addEventListener('change', validate);
  validate();

  save.addEventListener('click', async () => {
    if (!validate()) return;
    const input = { ...card.input };
    for (const [k, inp] of Object.entries(inputs)) {
      const v = inp.value.trim();
      if (v === '') delete input[k]; else input[k] = v;
    }
    if (moveRows) input.changes = moveRows.filter((m) => m.cb.checked && m.d.value).map((m) => ({ id: m.r.id, due: m.d.value, ...(m.r.start ? { start: m.r.start > m.d.value ? m.d.value : m.r.start } : {}), ...(m.r.time !== undefined ? { time: m.r.time } : {}) }));
    closeCard(c, `Saved${input.page || input.path ? ` to ${(input.page || input.path).replace(/\.md$/, '')}` : ''}`);
    await S.decide(card.id, { decision: 'approve', input });
  });
  skip.addEventListener('click', async () => {
    closeCard(c, 'Skipped');
    await S.decide(card.id, { decision: 'skip' });
  });
  c.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save.click(); }
  });
  return c;
}

function closeCard(c, label) {
  c.classList.remove('open');
  c.classList.add('closed');
  c.innerHTML = '';
  const t = el('span'); t.textContent = `${c.dataset.title || ''}${label}`;
  c.append(t);
  setComposerHint();
}

function setComposerHint() {
  const waiting = $$('.card.open').length > 0;
  $('#input').placeholder = viewingOld ? 'Go back to today to chat' : waiting ? 'Reply to change it, or press Save…' : 'Note it, ask it, plan it…';
  $('#send').disabled = busy && !waiting;
  const typing = $('.typing');
  if (typing) typing.hidden = waiting;
}

function showCard(card) {
  if (document.querySelector(`.card[data-id="${card.id}"]`)) return;
  const c = renderCard(card);
  setTimeout(() => previewMoves(card, c), 50);
  c.dataset.title = `${card.title}: `;
  const typing = $('.typing');
  msgsEl.insertBefore(c, typing || null);
  if (typing) typing.hidden = true;
  setComposerHint();
  scrollDown();
  c.querySelector('textarea, input')?.focus();
}
S.onApproval(showCard);

$('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });
// Phones and tablets (on-screen keyboard): Enter makes a new line and the ➜ button sends, like WhatsApp.
// With a real keyboard: Enter sends, Shift+Enter makes a new line.
const TOUCH_KEYBOARD = (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);
if (TOUCH_KEYBOARD) $('#input').setAttribute('enterkeyhint', 'enter');
$('#input').addEventListener('keydown', (e) => {
  if (TOUCH_KEYBOARD) return;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
function autosize() { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }
$('#input').addEventListener('input', autosize);
// let the buddy watch you type (throttled)
let lastTypingPing = 0;
document.addEventListener('input', () => {
  const t = Date.now();
  if (t - lastTypingPing > 250) { lastTypingPing = t; S.typing(); }
});
$$('.chips button').forEach((b) => b.addEventListener('click', async () => {
  if (b.dataset.kind) { const sg = await S.suggestNow(b.dataset.kind); await S.dismissSuggestion(); currentSuggestion = null; return send(sg.prompts[0].prompt, `📝 ${sg.prompts[0].label}`); }
  if (b.dataset.brief) { currentBrief = await S.briefNow(); return renderMessages([]); }
  if (b.dataset.meeting) { if (window.Meeting) Meeting.open(); return; }
  if (b.dataset.wins) { if (window.Wins) Wins.open(); return; }
  const label = b.textContent.trim();
  send(label.replace(/^[^\p{L}\p{N}]+/u, ''), label);   // the emoji is just for the button
}));

$('#btn-newchat').addEventListener('click', async () => {
  if (busy) return;
  await S.newChat();
  renderMessages([]);
  $('#input').focus();
});

async function loadChat() {
  const c = await S.getChat();
  $('#chat-date').textContent = new Date().toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'short' });
  viewingOld = false;
  currentBrief = c.brief || null;
  currentSuggestion = c.suggestion || null;
  renderMessages(c.messages);
  refreshUndo();
  if (c.busy) {
    busy = true;
    msgsEl.append(el('div', 'typing', '<span></span><span></span><span></span>'));
    (c.pending || []).forEach(showCard);
  }
}

// ---------------- notebook ----------------
let openPath = null;

function ago(iso) {
  const d = new Date(iso);
  const s = (Date.now() - d) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short' });
}

// ---- Notebook tree (folders, drag and drop) ----
const BUILT_IN = ['Daily', 'Projects', 'Notes'];
const FIXED = ['Inbox.md', 'Tasks.md', ...BUILT_IN];
const DRAG_TYPE = 'application/x-scribble';

function loadSet(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return new Set(Array.isArray(v) ? v : fallback); } catch { return new Set(fallback); }
}
function saveSet(key, set) { try { localStorage.setItem(key, JSON.stringify([...set])); } catch {} }
const nbCollapsed = loadSet('nbCollapsed', ['Daily']);

window.toast = toast;
function toast(msg) {
  const t = el('div', 'toast'); t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
// a change you just made: "Moved … · Undo" for 8 seconds
function undoToast(label, ids) {
  document.querySelector('.toast.undo')?.remove();
  const t = el('div', 'toast undo');
  const s = el('span'); s.textContent = label;
  const b = el('button'); b.type = 'button'; b.textContent = I18n.t('Undo');
  b.addEventListener('click', async () => {
    t.remove();
    const r = await S.undoIds(ids);
    if (!r || !r.ok) { toast((r && r.error) || 'Couldn\'t undo.'); return; }
    toast(I18n.t('Undone: {0}', r.undone[0] || label));
    if (currentTab === 'tasks') loadTasks();
  });
  t.append(s, b);
  document.body.append(t);
  setTimeout(() => t.remove(), 8000);
}
if (S.onUndoOffer) S.onUndoOffer((o) => undoToast(o.label, o.ids));

function prettyName(node) {
  if (/^Daily\/\d{4}-\d{2}-\d{2}\.md$/.test(node.path)) {
    return new Date(node.name + 'T12:00:00').toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  return node.name;
}

function sortNodes(nodes, parent) {
  const rank = (n) => {
    if (!parent) {
      if (n.path === 'Inbox.md') return 0;
      if (n.path === 'Tasks.md') return 1;
      if (n.type === 'dir' && !BUILT_IN.includes(n.name)) return 2;   // your area folders
      if (n.type === 'dir') return 3;                                    // built-ins after
      return 4;
    }
    if (/README$/i.test(n.name)) return 0;
    return n.type === 'dir' ? 1 : 2;
  };
  const order = { Projects: 0, Notes: 1, Daily: 2 };
  return nodes.slice().sort((a, b) => rank(a) - rank(b)
    || (!parent && a.type === 'dir' && b.type === 'dir' && BUILT_IN.includes(a.name) && BUILT_IN.includes(b.name) ? order[a.name] - order[b.name] : 0)
    || (parent === 'Daily' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
}

function countPages(node) {
  return node.type === 'file' ? 1 : node.children.reduce((n, c) => n + countPages(c), 0);
}

const ICON = {
  caret: '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
  folder: '<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>',
  page: '<svg viewBox="0 0 16 16"><path d="M4 2h5l3 3v9H4z M9 2v3h3"/></svg>',
  plusPage: '<svg viewBox="0 0 16 16"><path d="M4 2h5l3 3v9H4z M8 7v5 M5.5 9.5h5"/></svg>',
  plusFolder: '<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z M8 6.5v4.5 M5.8 8.8h4.4"/></svg>',
  rename: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>',
  trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10 M6.5 4.5V3h3v1.5 M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
};

function iconBtn(icon, title, fn) {
  const b = el('button', 'row-act', ICON[icon]);
  b.title = title;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

async function loadTree() {
  if (openPath && !wideMode) return openPage(openPath, true);
  if (openPath && wideMode) openPage(openPath, true);     // side by side: refresh both
  const nodes = await S.nested();
  const tree = $('#nb-tree');
  tree.innerHTML = '';
  for (const n of sortNodes(nodes, '')) tree.append(renderNode(n, 0, ''));
  const drop = el('div', 'root-drop', 'Drop here to move to the top level');
  makeDropTarget(drop, '');
  tree.append(drop);
  $('#nb-list').hidden = false;
  if (!(wideMode && openPath)) $('#nb-page').hidden = true;
  if ($('#nb-search').value.trim().length >= 2) runSearch();
}

function renderNode(node, depth, parent) {
  const wrap = el('div', 'tnode');
  const row = el('div', `trow ${node.type}`);
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.dataset.path = node.path;
  const fixed = FIXED.includes(node.path);

  if (node.type === 'dir') {
    const open = !nbCollapsed.has(node.path);
    const caret = el('span', `caret${open ? ' open' : ''}`, ICON.caret);
    const icon = el('span', `ticon ${BUILT_IN.includes(node.path) ? 'builtin' : 'area'}`, ICON.folder);
    const name = el('span', 'tname'); name.textContent = node.name;
    const count = el('span', 'tcount'); count.textContent = countPages(node) || '';
    const acts = el('span', 'tacts');
    acts.append(iconBtn('plusPage', 'New page here', () => inlineCreate(node, wrap, depth, 'page')));
    acts.append(iconBtn('plusFolder', 'New folder here', () => inlineCreate(node, wrap, depth, 'folder')));
    if (!fixed) {
      acts.append(iconBtn('rename', 'Rename', () => inlineRename(row, node)));
      acts.append(iconBtn('trash', 'Move to Recycle Bin', () => trashItem(node)));
    }
    row.append(caret, icon, name, count, acts);
    const kids = el('div', 'tkids');
    kids.hidden = !open;
    for (const c of sortNodes(node.children, node.path)) kids.append(renderNode(c, depth + 1, node.path));
    if (!node.children.length) {
      const empty = el('div', 'tempty', 'Empty: drag pages here');
      empty.style.paddingLeft = `${30 + depth * 16}px`;
      kids.append(empty);
    }
    row.addEventListener('click', () => {
      const nowOpen = kids.hidden;
      kids.hidden = !nowOpen;
      caret.classList.toggle('open', nowOpen);
      nowOpen ? nbCollapsed.delete(node.path) : nbCollapsed.add(node.path);
      saveSet('nbCollapsed', nbCollapsed);
    });
    makeDropTarget(row, node.path, () => {
      if (kids.hidden) row.click();          // hovering a closed folder while dragging opens it
    });
    wrap.append(row, kids);
  } else {
    const spacer = el('span', 'caret blank');
    const icon = el('span', 'ticon pg', node.path === 'Inbox.md' ? '📥' : node.path === 'Tasks.md' ? '✅' : ICON.page);
    const name = el('span', 'tname'); name.textContent = prettyName(node);
    const when = el('span', 'when'); when.textContent = ago(node.modified);
    const acts = el('span', 'tacts');
    if (!fixed) {
      acts.append(iconBtn('rename', 'Rename', () => inlineRename(row, node)));
      acts.append(iconBtn('trash', 'Move to Recycle Bin', () => trashItem(node)));
    }
    row.append(spacer, icon, name, when, acts);
    row.addEventListener('click', () => openPage(node.path));
    // dropping on a page means "put it in this page's folder"
    makeDropTarget(row, parent);
    wrap.append(row);
  }

  if (!fixed) {
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'nb', path: node.path }));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
      document.body.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.body.classList.remove('is-dragging'); });
  }
  return wrap;
}

function makeDropTarget(elm, destPath, onHover) {
  let timer = null;
  elm.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    elm.classList.add('drop');
    if (onHover && !timer) timer = setTimeout(onHover, 650);
  });
  elm.addEventListener('dragleave', () => { elm.classList.remove('drop'); clearTimeout(timer); timer = null; });
  elm.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    elm.classList.remove('drop'); clearTimeout(timer); timer = null;
    let data; try { data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch { return; }
    if (data.kind !== 'nb') return;
    const currentParent = data.path.includes('/') ? data.path.slice(0, data.path.lastIndexOf('/')) : '';
    if (currentParent === destPath) return;
    const r = await S.move(data.path, destPath);
    if (!r.ok) return toast(r.error);
    nbCollapsed.delete(destPath); saveSet('nbCollapsed', nbCollapsed);
    toast(`Moved to ${destPath || 'top level'}`);
    loadTree();
  });
}

function inlineInput(value, onDone) {
  const inp = el('input', 'tinput');
  inp.value = value;
  let done = false;
  const finish = (ok) => { if (done) return; done = true; onDone(ok ? inp.value.trim() : null); };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', (e) => e.stopPropagation());
  return inp;
}

function inlineRename(row, node) {
  const nameEl = row.querySelector('.tname');
  const inp = inlineInput(node.name, async (v) => {
    if (!v || v === node.name) return loadTree();
    const r = await S.rename(node.path, v);
    if (!r.ok) toast(r.error);
    loadTree();
  });
  nameEl.replaceWith(inp);
  row.draggable = false;
  inp.focus(); inp.select();
}

function inlineCreate(parentNode, wrap, depth, kind) {
  const kids = wrap ? wrap.querySelector(':scope > .tkids') : null;
  if (kids && kids.hidden) wrap.querySelector(':scope > .trow').click();
  const row = el('div', `trow ${kind === 'folder' ? 'dir' : 'file'} creating`);
  row.style.paddingLeft = `${8 + (depth + 1) * 16}px`;
  row.append(el('span', 'caret blank'), el('span', 'ticon', kind === 'folder' ? ICON.folder : ICON.page));
  const inp = inlineInput('', async (v) => {
    row.remove();
    if (!v) return;
    const parent = parentNode ? parentNode.path : '';
    const r = kind === 'folder' ? await S.mkdir(parent, v) : await S.newPage(parent, v);
    if (!r.ok) return toast(r.error);
    if (kind === 'page') { openPath = null; await loadTree(); openPage(r.result); setEditing(true); }
    else loadTree();
  });
  inp.placeholder = kind === 'folder' ? 'Folder name' : 'Page name';
  row.append(inp);
  (kids || $('#nb-tree')).prepend(row);
  inp.focus();
}

async function trashItem(node) {
  const what = node.type === 'dir' ? `the folder "${node.name}" and everything in it` : `"${node.name}"`;
  if (!confirm(`Move ${what} to the Recycle Bin?`)) return;
  const r = await S.trash(node.path);
  if (!r.ok) return toast(r.error);
  toast('Moved to the Recycle Bin');
  loadTree();
}

$('#btn-newfolder').addEventListener('click', () => inlineCreate(null, null, -1, 'folder'));
$('#btn-newpage').addEventListener('click', () => inlineCreate(null, null, -1, 'page'));

// ---- page view: clickable checkboxes, images, jump to a search hit ----
let openSource = '';
let openMtime = null;
let pendingJump = null;           // { line, query } from a search result

function paintPage(target, src, pagePath) {
  target.innerHTML = renderMarkdown(src, { interactive: true });
  // local images (e.g. clipboard screenshots) come through the main process
  target.querySelectorAll('img.md-img').forEach(async (img) => {
    const url = await S.image(img.dataset.src, pagePath);
    if (url) img.src = url; else img.replaceWith(Object.assign(el('span', 'img-missing'), { textContent: `🖼 ${img.alt || img.dataset.src} (not found)` }));
  });
}

async function openPage(p, quiet) {
  const editing = !$('#nb-editor').hidden;
  if (!quiet || !editing) {
    try {
      const content = await S.read(p);
      openSource = content;
      openMtime = await S.stat(p);
      paintPage($('#nb-content'), content, p);
      if (!editing) $('#nb-text').value = content;
      $('#nb-changed').hidden = true;
    } catch {
      openPath = null;
      return loadTree();
    }
  } else if (editing && p === openPath) {
    // page changed outside Scribble while you were editing it
    const m = await S.stat(p);
    if (m && openMtime && Math.abs(m - openMtime) > 1) $('#nb-changed').hidden = false;
  }
  openPath = p;
  $('#nb-path').textContent = p.replace(/\.md$/, '');
  $('#nb-edit').hidden = p === 'Tasks.md' || editing;
  $('#nb-list').hidden = true;
  $('#nb-page').hidden = false;
  $$('#nb-tree .trow.file').forEach((r) => r.classList.toggle('current', r.dataset.path === p));
  if (pendingJump) { jumpTo(pendingJump); pendingJump = null; }
}

function jumpTo({ line, query }) {
  const blocks = [...$('#nb-content').querySelectorAll('[data-line]')];
  let best = null;
  for (const b of blocks) if (Number(b.dataset.line) <= line - 1) best = b;
  const target = best || blocks[0];
  if (!target) return;
  target.scrollIntoView({ block: 'center' });
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 1800);
}

// Ticking a checkbox edits that line of the page (undoable). On Tasks.md it updates the task itself.
$('#nb-content').addEventListener('change', async (e) => {
  const cb = e.target.closest('.md-check');
  if (!cb) return;
  const line = Number(cb.dataset.line);
  if (openPath === 'Tasks.md') {
    const id = (openSource.split('\n')[line] || '').match(/`#(\d+)`/);
    if (id) { await updTask(Number(id[1]), { status: cb.checked ? 'done' : 'todo' }); return openPage('Tasks.md'); }
    return;
  }
  const next = toggleCheckbox(openSource, line, cb.checked);
  const r = await S.write(openPath, next, openMtime);
  if (r.conflict) toast('This page changed elsewhere. Your change was saved as a conflict copy.');
  openPage(r.conflict || openPath);
});

// ---- editor with live preview ----
let previewTimer = null;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => paintPage($('#nb-preview'), $('#nb-text').value, openPath), 90);
}
function setEditing(on) {
  $('#nb-editor').hidden = !on;
  $('#nb-content').hidden = on;
  $('#nb-edit').hidden = on || openPath === 'Tasks.md';
  if (on) {
    $('#nb-text').value = openSource;
    updatePreview();
    $('#nb-text').focus();
  } else {
    $('#nb-changed').hidden = true;
  }
}
$('#nb-text').addEventListener('input', updatePreview);
// checkboxes in the preview flip the text you're editing
$('#nb-preview').addEventListener('change', (e) => {
  const cb = e.target.closest('.md-check');
  if (!cb) return;
  $('#nb-text').value = toggleCheckbox($('#nb-text').value, Number(cb.dataset.line), cb.checked);
  updatePreview();
});
$('#nb-toggle-preview').addEventListener('click', () => {
  const hide = !$('#nb-preview').hidden;
  $('#nb-preview').hidden = hide;
  $('#nb-toggle-preview').textContent = hide ? 'Show preview' : 'Hide preview';
});
$('#nb-back').addEventListener('click', () => { openPath = null; setEditing(false); loadTree(); });
$('#nb-edit').addEventListener('click', () => setEditing(true));
$('#nb-cancel').addEventListener('click', () => { setEditing(false); openPage(openPath); });
$('#nb-save').addEventListener('click', async () => {
  const r = await S.write(openPath, $('#nb-text').value, openMtime);
  if (r.conflict) toast('This page changed elsewhere while you edited. Yours is saved as a conflict copy next to it.');
  setEditing(false);
  openPage(r.conflict || openPath);
});
$('#nb-reload').addEventListener('click', async () => {
  setEditing(false);
  await openPage(openPath);
  setEditing(true);
});
$('#nb-text').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('#nb-save').click(); }
  if (e.key === 'Escape') { e.stopPropagation(); $('#nb-cancel').click(); }
});
$('#nb-external').addEventListener('click', () => S.openPage(openPath));
$('#btn-openfolder').addEventListener('click', () => S.openFolder());

// ---- search (no API calls) ----
let searchTimer = null;
function highlight(text, q) {
  const span = el('span');
  const lower = text.toLowerCase(), ql = q.toLowerCase();
  let i = 0, j;
  while ((j = lower.indexOf(ql, i)) !== -1) {
    span.append(document.createTextNode(text.slice(i, j)));
    const m = el('mark'); m.textContent = text.slice(j, j + q.length); span.append(m);
    i = j + q.length;
  }
  span.append(document.createTextNode(text.slice(i)));
  return span;
}
async function runSearch() {
  const q = $('#nb-search').value.trim();
  $('#nb-clear').hidden = !q;
  const results = $('#nb-results');
  if (q.length < 2) { results.hidden = true; $('#nb-tree').hidden = false; return; }
  const r = await S.search(q);
  if ($('#nb-search').value.trim() !== q) return;          // a newer search is on its way
  results.innerHTML = '';
  results.hidden = false;
  $('#nb-tree').hidden = true;
  const total = r.pages.length + r.tasks.length;
  if (!total) { results.append(el('div', 'none', `Nothing matches "${q.replace(/</g, '&lt;')}".`)); return; }
  for (const pg of r.pages) {
    const g = el('div', 'sr-page');
    const head = el('button', 'sr-title');
    head.append(el('span', 'ticon pg', ICON.page), highlight(pg.path.replace(/\.md$/, ''), q));
    head.addEventListener('click', () => { pendingJump = pg.hits[0] ? { line: pg.hits[0].line, query: q } : null; openPage(pg.path); });
    g.append(head);
    for (const h of pg.hits.slice(0, 5)) {
      const b = el('button', 'sr-hit');
      const at = h.text.toLowerCase().indexOf(q.toLowerCase());
      const snippet = at > 28 ? '…' + h.text.slice(at - 22) : h.text;     // keep the match in view
      b.append(highlight(snippet, q));
      b.addEventListener('click', () => { pendingJump = { line: h.line, query: q }; openPage(pg.path); });
      g.append(b);
    }
    if (pg.hits.length > 5) { const more = el('div', 'sr-more'); more.textContent = `+${pg.hits.length - 5} more in this page`; g.append(more); }
    results.append(g);
  }
  if (r.tasks.length) {
    const g = el('div', 'sr-page');
    const h = el('div', 'group-title'); h.textContent = 'Tasks'; g.append(h);
    for (const t of r.tasks) {
      const b = el('button', 'sr-hit');
      b.append(document.createTextNode(t.status === 'done' ? '✓ ' : '○ '), highlight(t.title, q));
      if (t.project) { const p = el('span', 'sr-proj'); p.textContent = ` · ${t.area ? t.area + ' / ' : ''}${t.project}`; b.append(p); }
      b.addEventListener('click', () => showTab('tasks'));
      g.append(b);
    }
    results.append(g);
  }
}
$('#nb-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 160); });
$('#nb-search').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; runSearch(); } });
$('#nb-clear').addEventListener('click', () => { $('#nb-search').value = ''; runSearch(); $('#nb-search').focus(); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); showTab('notebook'); if (openPath) { openPath = null; setEditing(false); loadTree(); } setTimeout(() => $('#nb-search').focus(), 50); }
});


S.onNotebookChanged(() => {
  if (currentTab === 'notebook') loadTree();
  if (currentTab === 'tasks') loadTasks();
});

// ---------------- tasks (tree: Area > Project > Task, drag and drop) ----------------
let taskFilter = 'open';
// what the buddy is showing on the left ("only the Chatwoot project"); empty = everything
let taskFocus = null;
const inFocus = (t) => !taskFocus || ((!taskFocus.project || String(t.project || '').toLowerCase() === taskFocus.project.toLowerCase()) && (!taskFocus.area || String(t.area || '').toLowerCase() === taskFocus.area.toLowerCase()));
const taskCollapsed = loadSet('taskCollapsed', []);
$$('#view-tasks .seg button[data-filter]').forEach((b) => b.addEventListener('click', () => {
  taskFilter = b.dataset.filter;
  $$('#view-tasks .seg button[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
  loadTasks();
}));

function today() { return new Date().toLocaleDateString('en-CA'); }
const ord = (t) => t.order ?? t.id * 1000;

// Project pages tell us which projects exist (and in which category), even before they have tasks.
// Layout: <Area>/<Project>.md or <Area>/<Category>/<Project>.md; Projects/<Project>.md has no area.
const SKIP_PAGE = (name) => /^README$/i.test(name) || /\((conflict [^)]*|from this computer)\)$/.test(name);
function projectsFromTree(nodes) {
  const out = [];   // { area, category, project }
  for (const n of nodes) {
    if (n.type !== 'dir' || ['Daily', 'Notes', 'Inbox files'].includes(n.name)) continue;
    const area = n.name === 'Projects' ? null : n.name;
    for (const c of n.children) {
      if (c.type === 'file' && !SKIP_PAGE(c.name)) out.push({ area, category: null, project: c.name, path: c.path });
      if (c.type === 'dir' && area) {
        for (const f of c.children) if (f.type === 'file' && !SKIP_PAGE(f.name)) out.push({ area, category: c.name, project: f.name, path: f.path });
      }
    }
  }
  return out;
}
const isClosedT = (t) => t.status === 'done' || t.status === 'cancelled';
const expandedEmpty = new Set();            // "+ N projects with no open tasks" rows the user opened
const doneOpen = loadSet('doneOpen', []);   // in the Done view, groups start collapsed

// project health: a small dot (green on track, amber at risk, red late) with the reason on hover
const HEALTH_TXT = { ok: 'On track', risk: 'At risk', late: 'Late', done: 'Done' };
function healthDot(row, tasks) {
  if (!row || !window.Planner) return;
  const today = new Date(Date.now() - (globalThis.__scribbleDayStartMs || 0)).toLocaleDateString('en-CA');
  const h = Planner.health(tasks, { today });
  if (h.state === 'done') return;
  const d = el('span', `hdot ${h.state}`); d.title = `${I18n.t(HEALTH_TXT[h.state])}: ${I18n.t(h.key, ...h.args)}`;
  const name = row.querySelector('.tname') || row;
  name.after ? name.after(d) : row.append(d);
}
async function loadTaskTree() {
  const [all, nodes] = await Promise.all([S.tasks(), S.nested()]);
  const showDone = taskFilter === 'done', showAll = taskFilter === 'all';
  const list = all.filter((t) => (showAll || (showDone ? isClosedT(t) : !isClosedT(t))) && inFocus(t));

  // area -> { loose: [], projects: Map(project -> {category, tasks}) }
  const areas = new Map();
  const catOf = new Map();
  const areaOf = (a) => { const k = a || ''; if (!areas.has(k)) areas.set(k, { loose: [], projects: new Map() }); return areas.get(k); };
  const proj = (a, p, category) => {
    const A = areaOf(a);
    const k = p.toLowerCase();
    if (!A.projects.has(k)) A.projects.set(k, { name: p, category: category ?? catOf.get(`${a || ''}|${k}`) ?? null, tasks: [] });
    return A.projects.get(k);
  };
  const pageOf = new Map();
  for (const { area, category, project, path: rel } of projectsFromTree(nodes)) {
    pageOf.set(`${area || ''}|${project.toLowerCase()}`, rel);
    catOf.set(`${area || ''}|${project.toLowerCase()}`, category);
    if (!showDone && (!taskFocus || !taskFocus.project || taskFocus.project.toLowerCase() === project.toLowerCase())) proj(area, project, category);
  }
  if (!showDone && !taskFocus) {
    areaOf('');
    for (const top of nodes) if (top.type === 'dir' && !BUILT_IN.includes(top.name) && top.name !== 'Inbox files') areaOf(top.name);
  }
  for (const t of list) {
    if (t.project) proj(t.area, t.project).tasks.push(t);
    else areaOf('').loose.push(t);          // every task needs a sub project; the ones without wait in General
  }

  const box = $('#task-list');
  box.innerHTML = '';
  if (!list.length && showDone) { box.append(el('div', 'none', 'Nothing finished yet.')); return; }
  const sortT = (ts) => (showDone
    ? ts.sort((a, b) => String(b.completed || '').localeCompare(String(a.completed || '')))
    : ts.sort((a, b) => isClosedT(a) - isClosedT(b) || (a.status === 'hold') - (b.status === 'hold') || ord(a) - ord(b)));

  const projectNode = (p, area, depth) => {
    const key = `p:${area}/${p.name}`;
    const n = groupNode(p.name, p.tasks.length, depth, key, { area: area || null, project: p.name }, 'project', showDone, { kind: 'project', name: p.name, area: area || null, rel: pageOf.get(`${area || ''}|${p.name.toLowerCase()}`) || null });
    if (!showDone && !p.category) { const w = el('span', 'lvwarn', '⚠'); w.title = I18n.t('Not inside a {0} yet. Drag it into one.', lv('category')); n.row.querySelector('.tname').after(w); }
    if (!showDone && window.Planner && p.tasks.length) healthDot(n.row, all.filter((t) => t.project && t.project.toLowerCase() === p.name.toLowerCase() && (t.area || '') === (area || '')));
    for (const t of sortT(p.tasks)) n.kids.append(taskRow(t, depth + 1));
    return n.wrap;
  };
  // projects with open tasks first; the rest tucked behind a "+ N more" row
  const appendProjects = (container, projs, area, depth, ctxKey) => {
    const busy = projs.filter((p) => p.tasks.length).sort((a, b) => a.name.localeCompare(b.name));
    const idle = projs.filter((p) => !p.tasks.length).sort((a, b) => a.name.localeCompare(b.name));
    for (const p of busy) container.append(projectNode(p, area, depth));
    if (showDone || !idle.length) return;
    const k = `idle:${ctxKey}`;
    const more = el('button', 'idle-more');
    more.style.paddingLeft = `${12 + depth * 16}px`;
    const holder = el('div');
    const paint = () => {
      const open = expandedEmpty.has(k);
      more.textContent = open ? `− Hide ${idle.length} project${idle.length > 1 ? 's' : ''} with no open tasks` : `+ ${idle.length} project${idle.length > 1 ? 's' : ''} with no open tasks`;
      holder.innerHTML = '';
      if (open) for (const p of idle) holder.append(projectNode(p, area, depth));
    };
    more.addEventListener('click', () => { expandedEmpty.has(k) ? expandedEmpty.delete(k) : expandedEmpty.add(k); paint(); });
    paint();
    container.append(more, holder);
  };

  const areaNames = [...areas.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  for (const area of areaNames) {
    const A = areas.get(area);
    const projs = [...A.projects.values()];
    const total = A.loose.length + projs.reduce((n, p) => n + p.tasks.length, 0);
    if (showDone && !total) continue;
    if (!area && !total && !projs.length) continue;
    const node = groupNode(area || 'General', total, 0, `a:${area}`, { area: area || null, project: null }, area ? 'area' : 'general', showDone, area ? { kind: 'area', name: area, area, rel: area, folder: area } : { kind: 'general', area: null, folder: 'Projects' });
    const homeless = !area && !showDone ? A.loose.filter((t) => !isClosedT(t)).length : 0;
    if (homeless) {
      const w = el('div', 'parent-warn');
      const b = el('b'); b.textContent = '⚠ ' + I18n.t('{0} task(s) have no {1}.', homeless, lv('project'));
      const p = el('span'); p.textContent = ' ' + I18n.t('Every task should sit in a {0} › {1} › {2}. Drag them in, or', lv('area'), lv('category'), lv('project'));
      const go = el('button', 'btn'); go.type = 'button'; go.textContent = '✨ ' + I18n.t('Ask the buddy to file them');
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        const prompt = I18n.t('File my tasks that have no {0}: put each one in the best-fitting {0} (inside a {1}), or suggest a new one. Show me the plan first.', lv('project'), lv('category'));
        if (typeof showTab === 'function' && !document.body.classList.contains('wide')) showTab('chat');
        window.send && window.send(prompt);
      });
      w.append(b, p, el('br'), go);
      node.kids.append(w);
    }
    for (const t of sortT(A.loose)) node.kids.append(taskRow(t, 1));
    appendProjects(node.kids, projs.filter((p) => !p.category), area, 1, `${area}/`);
    const cats = [...new Set(projs.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    for (const cat of cats) {
      const cp = projs.filter((p) => p.category === cat);
      const n = cp.reduce((s, p) => s + p.tasks.length, 0);
      if (showDone && !n) continue;
      const cn = groupNode(cat, n, 1, `c:${area}/${cat}`, null, 'category', showDone, { kind: 'category', name: cat, area, rel: `${area}/${cat}`, folder: `${area}/${cat}`, projects: cp.map((p) => p.name.toLowerCase()) });
      cn.row.title = `${cp.length} project${cp.length > 1 ? 's' : ''}`;
      appendProjects(cn.kids, cp, area, 2, `${area}/${cat}`);
      node.kids.append(cn.wrap);
    }
    if (!node.kids.children.length) {
      const empty = el('div', 'tempty', area ? 'Nothing here yet: drag tasks in' : 'No loose tasks');
      empty.style.paddingLeft = '30px';
      node.kids.append(empty);
    }
    box.append(node.wrap);
  }
  if (!list.length) box.prepend(el('div', 'none', 'No open tasks. Tell the buddy what you need to do.'));
}

// ---------------- tasks: view switch (tree / table) ----------------
const viewKey = () => (wideMode ? 'taskViewWide' : 'taskViewCompact');
function taskView() {
  try { const v = localStorage.getItem(viewKey()); if (v === 'tree' || v === 'table' || v === 'timeline') return v; } catch {}
  return wideMode ? 'table' : 'tree';
}
$$('#task-view-seg button').forEach((b) => b.addEventListener('click', () => {
  try { localStorage.setItem(viewKey(), b.dataset.view); } catch {}
  loadTasks();
}));

async function loadTasks() {
  const view = taskView();
  $$('#task-view-seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $('#task-list').hidden = view !== 'tree';
  $('#task-table').hidden = view !== 'table';
  $('#tbl-filters').hidden = view !== 'table';
  $('#task-timeline').hidden = view !== 'timeline';
  $('#task-filter-seg').hidden = view === 'timeline';
  if (view === 'timeline') return window.Timeline.render();
  if (view === 'table') return loadTaskTable();
  return loadTaskTree();
}

// ---------------- tasks: table ----------------
let tblSort = { key: null, dir: 1 };
const PRI_RANK = { high: 0, medium: 1, low: 2 };
const STATUS_LABEL = { todo: 'To do', doing: 'In progress', hold: 'On hold', done: 'Done', cancelled: 'Cancelled' };
const STATUS_RANK = { doing: 0, todo: 1, hold: 2, done: 3, cancelled: 4 };
let tblCache = null;

async function loadTaskTable() {
  const [all, nodes] = await Promise.all([S.tasks(), S.nested()]);
  const catOf = new Map();
  for (const { area, category, project } of projectsFromTree(nodes)) catOf.set(`${area || ''}|${project.toLowerCase()}`, category);
  for (const t of all) t._cat = t.project ? (catOf.get(`${t.area || ''}|${t.project.toLowerCase()}`) || '') : '';
  tblCache = all;
  // category filter options
  const cats = [...new Set(all.map((t) => t._cat).filter(Boolean))].sort();
  const sel = $('#tf-cat'); const cur = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${c.replace(/</g, '&lt;')}</option>`).join('');
  sel.value = cats.includes(cur) ? cur : '';
  $('#tf-status').hidden = taskFilter === 'done';
  renderTaskTable();
}

function renderTaskTable() {
  if (!tblCache) return;
  const showDone = taskFilter === 'done';
  const q = $('#tf-q').value.trim().toLowerCase();
  const fs = $('#tf-status').value, fp = $('#tf-pri').value, fc = $('#tf-cat').value, need = $('#tf-need').checked;
  let rows = tblCache.filter((t) => (taskFilter === 'all' || (showDone ? isClosedT(t) : !isClosedT(t))) && inFocus(t));
  if (q) rows = rows.filter((t) => `${t.title} ${t.project || ''} ${t.area || ''} ${t._cat} ${t.notes || ''}`.toLowerCase().includes(q));
  if (fs && !showDone) rows = rows.filter((t) => t.status === fs);
  if (fp) rows = rows.filter((t) => (fp === 'none' ? !PRI_RANK.hasOwnProperty(normPri(t.priority)) : normPri(t.priority) === fp));
  if (fc) rows = rows.filter((t) => t._cat === fc);
  if (need) rows = rows.filter((t) => !isClosedT(t) && missingOf(t).length);

  // sort: default is due date (open) or finished date (done)
  const key = tblSort.key || (showDone ? 'completed' : 'due');
  const dir = tblSort.key ? tblSort.dir : (showDone ? -1 : 1);
  const val = (t) => ({
    title: t.title.toLowerCase(), project: `${t._cat}|${t.project || ''}`.toLowerCase(),
    status: STATUS_RANK[t.status] ?? 9, priority: PRI_RANK[normPri(t.priority)] ?? 9,
    start: t.start || '9999', due: t.due || '9999', completed: t.completed || '',
  }[key]);
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || (PRI_RANK[normPri(a.priority)] ?? 9) - (PRI_RANK[normPri(b.priority)] ?? 9) || ord(a) - ord(b); });

  $('#tf-count').textContent = `${rows.length} task${rows.length === 1 ? '' : 's'}`;
  const cols = [
    ['title', 'Task'], ['project', lv('project')], ['status', 'Status'], ['priority', 'Priority'],
    ['start', 'Start'], ['due', 'Due'], ...(showDone ? [['completed', 'Finished']] : []),
  ];
  const table = el('table', 'ttable');
  const thead = el('thead'); const hr = el('tr');
  for (const [k, label] of cols) {
    const th = el('th'); th.dataset.k = k;
    th.textContent = label + (key === k ? (dir > 0 ? ' ▲' : ' ▼') : '');
    th.addEventListener('click', () => { tblSort = { key: k, dir: key === k ? -dir : 1 }; renderTaskTable(); });
    hr.append(th);
  }
  thead.append(hr); table.append(thead);
  const tb = el('tbody');
  const t0 = today();
  for (const t of rows) tb.append(tableRow(t, showDone, t0));
  table.append(tb);
  const box = $('#task-table');
  const scroll = box.scrollTop;
  box.innerHTML = '';
  if (!rows.length) box.append(el('div', 'none', showDone ? 'No finished tasks match.' : 'No open tasks match these filters.'));
  else box.append(table);
  box.scrollTop = scroll;
}

function cellSelect(options, value, onChange, cls = '') {
  const s = el('select', `cell-in ${cls}`);
  s.innerHTML = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  s.value = value;
  s.addEventListener('change', () => onChange(s.value, s));
  return s;
}
function cellDate(value, onChange, cls = '') {
  const i = el('input', `cell-in ${cls}`); i.type = 'date'; i.value = value || '';
  i.addEventListener('change', () => onChange(i.value, i));
  return i;
}

async function patchTask(t, patch, input) {
  const r = await updTask(t.id, patch);
  if (r && r.ok === false) { toast(r.error); renderTaskTable(); return; }
  Object.assign(t, r && r.task ? r.task : patch);
  t._cat = t._cat || '';
  input?.closest('tr')?.classList.add('saved');
  setTimeout(() => renderTaskTable(), 350);
}

function tableRow(t, showDone, t0) {
  const tr = el('tr');
  const pri = normPri(t.priority);
  const miss = isClosedT(t) ? [] : missingOf(t);
  if (!showDone && t.status !== 'hold' && t.due && t.due < t0) tr.classList.add('over');
  if (t.status === 'hold') tr.classList.add('hold');
  if (t.status === 'cancelled') tr.classList.add('cancelled');

  // task title (click to rename) + notes hint
  const tdT = el('td', 'c-title');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = isClosedT(t); cb.title = isClosedT(t) ? 'Reopen' : 'Mark done';
  cb.addEventListener('change', () => patchTask(t, { status: cb.checked ? 'done' : 'todo' }, cb));
  const title = el('span', 'tt-title'); title.textContent = t.title;
  title.title = (t.notes ? t.notes + '\n\n' : '') + 'Click to rename';
  title.addEventListener('click', () => {
    const i = el('input', 'cell-in title-in'); i.value = t.title;
    const done = (ok) => { if (ok && i.value.trim() && i.value.trim() !== t.title) patchTask(t, { title: i.value.trim() }, i); else renderTaskTable(); };
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    i.addEventListener('blur', () => done(true));
    title.replaceWith(i); i.focus(); i.select();
  });
  tdT.append(cb, title);
  if (t.notes) { const n = el('span', 'tt-note', '📝'); n.title = t.notes; tdT.append(n); }
  if (miss.length) { const w = el('span', 'tt-warn', '⚠'); w.title = `Missing: ${miss.join(', ')}`; tdT.append(w); }

  const tdP = el('td', 'c-proj');
  tdP.innerHTML = `<span class="pj"></span><span class="ct"></span>`;
  tdP.querySelector('.pj').textContent = t.project || (t.area ? `${t.area} (no project)` : 'General');
  tdP.querySelector('.ct').textContent = [t.area, t._cat].filter(Boolean).join(' · ');

  const tdS = el('td');
  tdS.append(cellSelect(Object.entries(STATUS_LABEL), t.status, (v, i) => patchTask(t, { status: v }, i), `st-${t.status}`));

  const tdPr = el('td');
  const priOpts = [['', '—'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
  tdPr.append(cellSelect(priOpts, PRI_LABEL[pri] ? pri : '', (v, i) => { if (v) patchTask(t, { priority: v }, i); }, `pri-${pri || 'none'}${miss.includes('priority') ? ' need' : ''}`));

  const tdSt = el('td'); tdSt.append(cellDate(t.start, (v, i) => { if (v) patchTask(t, { start: v }, i); }, miss.includes('start') ? 'need' : ''));
  const tdD = el('td'); tdD.append(cellDate(t.due, (v, i) => { if (v) patchTask(t, { due: v }, i); }, miss.includes('due') ? 'need' : ''));
  if (!isClosedT(t)) {
    const ti = el('input', 'cell-in cell-time'); ti.type = 'time'; ti.value = t.time || ''; ti.title = I18n.t('Time (optional)');
    ti.addEventListener('change', () => patchTask(t, { time: ti.value || null }, ti));
    tdD.append(ti);
  }
  tr.append(tdT, tdP, tdS, tdPr, tdSt, tdD);
  if (showDone) {
    const tdC = el('td', 'c-done');
    tdC.textContent = t.completed ? new Date(t.completed).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    tr.append(tdC);
  }
  return tr;
}
for (const id of ['tf-status', 'tf-pri', 'tf-cat', 'tf-need']) $('#' + id).addEventListener('change', renderTaskTable);
let tfTimer = null;
$('#tf-q').addEventListener('input', () => { clearTimeout(tfTimer); tfTimer = setTimeout(renderTaskTable, 120); });

// collapsibleDefaultClosed: in the Done view groups start closed (there can be hundreds of finished tasks)
function groupNode(label, count, depth, key, target, kind, collapsibleDefaultClosed = false, edit = null) {
  const wrap = el('div', 'tnode');
  const row = el('div', `trow dir group-${kind}`);
  row.style.paddingLeft = `${8 + depth * 16}px`;
  const store = collapsibleDefaultClosed ? doneOpen : taskCollapsed;
  const isOpen = () => (collapsibleDefaultClosed ? doneOpen.has(key) : !taskCollapsed.has(key));
  const open = isOpen();
  const caret = el('span', `caret${open ? ' open' : ''}`, ICON.caret);
  const icon = el('span', `ticon ${kind === 'project' ? 'proj' : kind === 'category' ? 'cat' : 'area'}`, kind === 'project' ? '◆' : ICON.folder);
  const name = el('span', 'tname'); name.textContent = label;
  const cnt = el('span', 'tcount'); cnt.textContent = count || '';
  row.append(caret, icon, name);
  if (edit && ['area', 'category', 'project'].includes(edit.kind)) row.append(el('span', 'lvtag', lv(edit.kind)));
  row.append(cnt);
  const kids = el('div', 'tkids');
  kids.hidden = !open;
  row.addEventListener('click', () => {
    const nowOpen = kids.hidden;
    kids.hidden = !nowOpen;
    caret.classList.toggle('open', nowOpen);
    if (collapsibleDefaultClosed) { nowOpen ? doneOpen.add(key) : doneOpen.delete(key); saveSet('doneOpen', doneOpen); }
    else { nowOpen ? taskCollapsed.delete(key) : taskCollapsed.add(key); saveSet('taskCollapsed', taskCollapsed); }
  });
  if (target) taskDropTarget(row, target, () => { if (kids.hidden) row.click(); });
  if (edit) groupEditing(row, name, edit);
  wrap.append(row, kids);
  return { wrap, kids, row };
}

// Folders (areas, categories) and projects in the Tree: ✎ or double-click renames them; drag a project onto a
// folder to move it there, drag a category onto an area. Their tasks follow along.
const NODE_DRAG = 'application/x-scribble-node';
function groupEditing(row, nameEl, edit) {
  if (edit.kind !== 'general') {
    const pen = el('button', 'tedit', '✎'); pen.type = 'button'; pen.title = I18n.t('Rename');
    const go = (e) => { e.stopPropagation(); e.preventDefault(); renameInline(nameEl, edit); };
    pen.addEventListener('click', go);
    nameEl.addEventListener('dblclick', go);
    row.insertBefore(pen, nameEl.nextSibling);
    if (edit.kind === 'project' && edit.rel) {
      const open = el('button', 'tedit', '📄'); open.type = 'button'; open.title = I18n.t('Open the project page');
      open.addEventListener('click', (e) => { e.stopPropagation(); showTab('notebook'); setTimeout(() => openPage(edit.rel), 150); });
      row.insertBefore(open, pen.nextSibling);
    }
  }
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); treeMenu(e.clientX, e.clientY, edit, nameEl); });
  if (edit.kind === 'project' || edit.kind === 'category') {
    row.draggable = true;
    row.addEventListener('dragstart', (e) => { e.stopPropagation(); e.dataTransfer.setData(NODE_DRAG, JSON.stringify(edit)); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  }
  if (edit.folder) {
    row.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(NODE_DRAG)) return;
      e.preventDefault(); row.classList.add('drop');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', async (e) => {
      if (!e.dataTransfer.types.includes(NODE_DRAG)) return;
      e.preventDefault(); e.stopPropagation(); row.classList.remove('drop');
      let d; try { d = JSON.parse(e.dataTransfer.getData(NODE_DRAG)); } catch { return; }
      if (d.kind === 'category' && edit.kind !== 'area') return toast(I18n.t('Drop a category on a folder.'));
      let r;
      if (d.rel) r = await S.move(d.rel, edit.folder);
      else r = await S.moveProjectTasks(d.name, d.area, edit.area || null);   // a project that only exists on its tasks
      if (r && r.ok === false) return toast(r.error);
      toast(I18n.t('Moved "{0}" to {1}', d.name, edit.name || I18n.t('General')));
      loadTasks();
    });
  }
}
function renameInline(nameEl, edit) {
  if (nameEl.querySelector('input')) return;
  const old = edit.name;
  const inp = el('input', 'tname-in'); inp.value = old;
  nameEl.textContent = ''; nameEl.append(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (!save || !v || v === old) { nameEl.textContent = old; return; }
    const r = edit.rel ? await S.rename(edit.rel, v) : await S.renameProjectTasks(old, edit.area, v);
    if (r && r.ok === false) { toast(r.error); nameEl.textContent = old; return; }
    loadTasks();
  };
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

function taskDropTarget(elm, target, onHover) {
  let timer = null;
  elm.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    elm.classList.add(target.beforeId ? 'drop-before' : 'drop');
    if (onHover && !timer) timer = setTimeout(onHover, 650);
  });
  elm.addEventListener('dragleave', () => { elm.classList.remove('drop', 'drop-before'); clearTimeout(timer); timer = null; });
  elm.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    elm.classList.remove('drop', 'drop-before'); clearTimeout(timer); timer = null;
    let data; try { data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch { return; }
    if (data.kind !== 'task' || data.id === target.beforeId) return;
    const r = await S.moveTask(data.id, target);
    if (!r.ok) return toast(r.error);
    loadTasks();
  });
}

const PRI_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short' });
// required fields by status: open = all three, on hold = priority only (paused, no schedule), closed = none
const requiredFor = (status) => (['done', 'cancelled'].includes(status) ? [] : status === 'hold' ? ['priority'] : ['start', 'due', 'priority']);
const missingOf = (t) => requiredFor(t.status).filter((k) => k === 'priority' ? !PRI_LABEL[normPri(t.priority)] : !/^\d{4}-\d{2}-\d{2}$/.test(t[k] || ''));
const openTaskEditors = new Set();

function taskRow(t, depth) {
  const wrap = el('div', 'task-wrap');
  const row = el('div', `task trow${isClosedT(t) ? ' done' : ''}${t.status === 'cancelled' ? ' cancelled' : ''}${t.status === 'hold' ? ' hold' : ''}`);
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.draggable = true;
  const grip = el('span', 'grip', '⋮⋮');
  grip.title = 'Drag to move';
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = isClosedT(t);
  cb.title = 'Mark done';
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', async () => { await updTask(t.id, { status: cb.checked ? 'done' : 'todo' }); loadTasks(); });
  const main = el('div', 't-main');
  const title = el('span', 't-title'); title.textContent = t.title;
  const meta = el('div', 'meta');
  const t0 = today();
  const pri = normPri(t.priority);
  const missing = missingOf(t);

  if (!isClosedT(t)) {
    // start → due, coloured by how close the deadline is
    if (t.start || t.due) {
      const cls = t.due && t.due < t0 ? 'over' : t.due === t0 ? 'today' : '';
      const p = el('span', `pill dates ${cls}`);
      const range = `${t.start ? shortDate(t.start) : '?'} → ${t.due ? shortDate(t.due) : '?'}`;
      p.textContent = t.due && t.due < t0 ? `overdue · ${range}` : t.due === t0 ? `due today · ${range}` : range;
      p.title = `Start ${t.start || 'not set'} · Due ${t.due || 'not set'}`;
      meta.append(p);
    }
  }
  if (PRI_LABEL[pri]) { const p = el('span', `pill pri-${pri}`); p.textContent = PRI_LABEL[pri]; meta.append(p); }
  if (!isClosedT(t)) {
    if (missing.length) {
      const p = el('span', 'pill need'); p.textContent = '⚠ needs details';
      p.title = `Missing: ${missing.join(', ')}. Click to fill in.`;
      p.addEventListener('click', (e) => { e.stopPropagation(); toggleEditor(); });
      meta.append(p);
    }
    if (!t.project) {
      const np = el('span', 'pill need-parent'); np.textContent = '⚠ ' + I18n.t('no {0}', lv('project'));
      np.title = t.area ? I18n.t('In {0}, but not in a {1} yet. Drag it into one.', t.area, lv('project')) : I18n.t('Not in a {0} yet. Drag it into one.', lv('project'));
      meta.append(np);
    }
    const p = el('span', `pill ${t.status}`);
    p.textContent = { doing: 'in progress', hold: 'on hold', todo: 'start' }[t.status] || 'start';
    p.title = { doing: 'Move back to to-do', hold: 'Resume (back to to-do)', todo: 'Mark in progress' }[t.status] || '';
    p.addEventListener('click', async (e) => { e.stopPropagation(); await updTask(t.id, { status: t.status === 'todo' ? 'doing' : 'todo' }); loadTasks(); });
    meta.append(p);
  } else {
    const p = el('span', `pill ${t.status === 'cancelled' ? 'cancelled' : 'closed'}`);
    const end = t.completed ? shortDate(t.completed.slice(0, 10)) : '';
    p.textContent = `${t.start ? shortDate(t.start) + ' → ' : ''}${t.status === 'cancelled' ? 'cancelled' : 'done'}${end ? ' ' + end : ''}`;
    meta.append(p);
  }
  if (t.notes) title.title = t.notes;
  main.append(title, meta);
  row.append(grip, cb, main);
  wrap.append(row);

  // click a task to edit its title, dates and priority right here
  let editor = null;
  function toggleEditor() {
    if (editor) { editor.remove(); editor = null; openTaskEditors.delete(t.id); return; }
    openTaskEditors.add(t.id);
    editor = el('div', 'task-edit');
    editor.style.marginLeft = `${30 + depth * 16}px`;
    editor.innerHTML = `
      <label class="field-row stack"><span class="f-label">Task</span><input data-k="title"></label>
      <div class="grid2">
        <label class="field-row cell"><span class="f-label">Status</span><select data-k="status"><option value="todo">To do</option><option value="doing">In progress</option><option value="hold">On hold</option><option value="done">Done</option><option value="cancelled">Cancelled</option></select></label>
        <span></span>
        <label class="field-row cell req"><span class="f-label">Start</span><input type="date" data-k="start"></label>
        <label class="field-row cell req"><span class="f-label">Due</span><input type="date" data-k="due"></label>
        <label class="field-row cell req"><span class="f-label">Priority</span><select data-k="priority"><option value="">Choose…</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      </div>
      <div class="card-problem" hidden></div>
      <div class="card-actions"><span class="spacer"></span><button class="btn ghost" data-a="cancel">Cancel</button><button class="btn" data-a="save">Save</button></div>`;
    const f = (k) => editor.querySelector(`[data-k="${k}"]`);
    f('title').value = t.title; f('start').value = t.start || ''; f('due').value = t.due || ''; f('priority').value = PRI_LABEL[pri] ? pri : '';
    f('status').value = t.status || 'todo';
    // finished tasks keep their history as it is; only open ones must have all three fields
    const need = () => requiredFor(f('status').value);
    const prob = editor.querySelector('.card-problem');
    const saveBtn = editor.querySelector('[data-a="save"]');
    const check = () => {
      const miss = need().filter((k) => !f(k).value);
      let msg = miss.length ? `Still needed: ${miss.map((k) => ({ start: 'start date', due: 'due date', priority: 'priority' }[k])).join(', ')}` : '';
      if (!msg && f('start').value && f('due').value && f('start').value > f('due').value) msg = 'The start date is after the due date';
      for (const k of ['start', 'due', 'priority']) {
        const r = f(k).closest('.field-row');
        r.classList.toggle('req', need().includes(k));
        r.classList.toggle('missing', (need().includes(k) && !f(k).value) || (msg.startsWith('The start') && k !== 'priority'));
      }
      prob.textContent = msg; prob.hidden = !msg; saveBtn.disabled = !!msg || !f('title').value.trim();
      return !saveBtn.disabled;
    };
    editor.addEventListener('input', check); editor.addEventListener('change', check);
    editor.querySelector('[data-a="cancel"]').addEventListener('click', toggleEditor);
    saveBtn.addEventListener('click', async () => {
      if (!check()) return;
      const patch = { title: f('title').value.trim(), status: f('status').value };
      for (const k of ['start', 'due', 'priority']) if (f(k).value) patch[k] = f(k).value;   // empty = leave as it is
      const r = await updTask(t.id, patch);
      if (r && r.ok === false) { prob.textContent = r.error; prob.hidden = false; return; }
      openTaskEditors.delete(t.id);
      toast('Task updated');
      loadTasks();
    });
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); saveBtn.click(); }
      if (e.key === 'Escape') { e.stopPropagation(); toggleEditor(); }
    });
    check();
    wrap.append(editor);
    (missing[0] ? f(missing[0]) : f('title')).focus();
  }
  row.addEventListener('click', (e) => { if (!e.target.closest('.pill, input')) toggleEditor(); });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); treeMenu(e.clientX, e.clientY, { kind: 'task', id: t.id, name: t.title, open: () => { if (!editor) toggleEditor(); } }); });
  if (openTaskEditors.has(t.id)) { openTaskEditors.delete(t.id); setTimeout(toggleEditor); }

  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'task', id: t.id }));
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
    document.body.classList.add('is-dragging');
  });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.body.classList.remove('is-dragging'); });
  // dropping on a task puts the dragged task just above it, in the same project
  taskDropTarget(row, { area: t.area || null, project: t.project || null, beforeId: t.id });
  return wrap;
}

// ---------------- settings ----------------
// Settings has two tabs: App (keys, notebook, routine…) and Buddy (the character)
let settingsTab = 'app';
function showSettingsTab(t) {
  settingsTab = t;
  $$('#set-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.st === t));
  $('#set-app').hidden = t !== 'app';
  $('#set-buddy').hidden = t !== 'buddy';
}
$$('#set-tabs button').forEach((b) => b.addEventListener('click', () => showSettingsTab(b.dataset.st)));
S.onShown(({ tab, sub } = {}) => { if (tab === 'settings' && sub) showSettingsTab(sub); });

async function loadSettings() {
  loadAccount();
  S.updateState().then(applyUpdate);
  loadRoutine();
  loadAI();
  const s = await S.getSettings();
  if (!s.hasKey) { showSettingsTab('app'); const d = document.querySelector('details[data-sec="a-ai"]'); if (d) d.open = true; }
  $('#s-folder').textContent = s.notebookDir;
  $('#s-gravity').checked = s.gravity;
  $('#s-confirm').checked = s.confirmSaves;
  $('#s-fallback').checked = s.autoFallback;
  $('#s-login').checked = s.openAtLogin;
  $('#s-call').checked = s.callListen; $('#s-call-row').hidden = s.platform !== 'win32';
  $('#s-money').checked = !!s.money;
  LEVELS = s.levels || null;
  for (const k of ['area', 'category', 'project']) { const i = $('#lv-' + k); if (i) { i.placeholder = I18n.t(LV_DEFAULT[k]); i.value = (s.levels && s.levels[k]) || ''; } }
  platform = s.platform;
  $('#k-panel').textContent = prettyAccel(s.shortcut);
  $('#k-panel').dataset.accel = s.shortcut;
  $('#k-capture').textContent = prettyAccel(s.captureShortcut);
  $('#k-capture').dataset.accel = s.captureShortcut;
  $('#k-quick').textContent = prettyAccel(s.quickShortcut);
  $('#k-quick').dataset.accel = s.quickShortcut;
  $('#s-capture').checked = s.captureEnabled;
  $('#k-msg').textContent = '';
  loadSync();
  $('#s-saved').textContent = '';
}
$('#s-pick').addEventListener('click', async () => { const p = await S.pickFolder(); if (p) $('#s-folder').textContent = p; });
$('#s-open').addEventListener('click', () => S.openFolder());
$('#s-save').addEventListener('click', async () => {
  const patch = { gravity: $('#s-gravity').checked, confirmSaves: $('#s-confirm').checked, openAtLogin: $('#s-login').checked, money: $('#s-money').checked, callListen: $('#s-call').checked };
  await S.setSettings(patch);
  applyMoney(patch.money);
  await loadSettings();
  $('#s-saved').textContent = 'Saved ✓';
});
// the toggles save as soon as they change (they live in different sections now)
for (const id of ['s-gravity', 's-confirm', 's-login', 's-money', 's-call']) $('#' + id).addEventListener('change', () => $('#s-save').click());

// level names save when you leave the box
for (const k of ['area', 'category', 'project']) {
  const i = $('#lv-' + k);
  if (i) i.addEventListener('change', async () => {
    const levels = {}; for (const j of ['area', 'category', 'project']) levels[j] = $('#lv-' + j).value.trim();
    await S.setSettings({ levels });
    LEVELS = Object.values(levels).some(Boolean) ? levels : null;
    toast(I18n.t('Saved ✓')); loadTasks();
  });
}
// ---------------- settings sections: each opens and closes, and stays the way you left it ----------------
const openSecs = (() => { try { return new Set(JSON.parse(localStorage.getItem('scribble.openSecs') || '["a-acct","b-look"]')); } catch { return new Set(['a-acct', 'b-look']); } })();
function wireSec(d) {
  if (d.dataset.wired) return; d.dataset.wired = '1';
  d.open = openSecs.has(d.dataset.sec);
  d.addEventListener('toggle', () => {
    if (d.open) openSecs.add(d.dataset.sec); else openSecs.delete(d.dataset.sec);
    try { localStorage.setItem('scribble.openSecs', JSON.stringify([...openSecs])); } catch {}
  });
}
function secGroup(key, title, hint) {
  const d = el('details', 'set-sec'); d.dataset.sec = key;
  const s = el('summary'); const b = el('b'); b.textContent = title; s.append(b);
  if (hint) { const h = el('small', 'set-sum-hint'); h.textContent = hint; s.append(h); }
  const body = el('div', 'set-body'); d.append(s, body); wireSec(d);
  return { d, body };
}
document.querySelectorAll('details.set-sec[data-sec]').forEach(wireSec);

// ---------------- AI connections ----------------
let aiState = null;
let aiDraft = null;          // result of the last successful test of the key in the form
// What each kind of key does for you (Settings → AI). Your buddy picks the right key for each job by itself.
const AI_ABOUT = {
  anthropic: { name: 'Claude', uses: ['Chatting'], note: 'The best at following your instructions and writing. Uses Haiku, the cheapest Claude. Paid, pay as you go.', free: false },
  gemini: { name: 'Gemini', uses: ['Chatting', 'Photos & PDFs', 'Mic & meetings'], note: 'Free tier from Google. Good all-rounder.', free: true },
  groq: { name: 'Groq', uses: ['Backup chat', 'Mic & meetings'], note: 'Free. Very fast, and the best at Bahasa Indonesia speech for the mic and meeting notes.', free: true },
  openrouter: { name: 'OpenRouter', uses: ['Chat (free models)', 'Buddy voice', 'Mic & meetings'], note: 'Free models for chat; the buddy\'s voice is pay as you go.', free: true },
};
let aiPicked = '';
async function loadAI() {
  aiState = await S.aiGet();
  const list = $('#ai-list');
  list.innerHTML = '';
  const chatConn = String(aiState.model || '').split('::')[0];
  if (!aiState.connections.length) {
    const e = el('div', 'ai-empty'); e.textContent = I18n.t('No AI connected yet. Add a key below to start chatting.');
    list.append(e);
    $('#ai-add').open = true;
  }
  for (const c of aiState.connections) {
    const about = AI_ABOUT[c.provider] || { name: c.providerLabel, uses: ['Chatting'] };
    const row = el('div', 'ai-conn');
    const head = el('div', 'ai-head');
    const name = el('b'); name.textContent = about.name;
    const hint = el('span', 'ai-prov'); hint.textContent = c.keyHint;
    head.append(name, hint);
    if (c.id === chatConn) { const m = el('span', 'ai-main'); m.textContent = I18n.t('Chats with this'); head.append(m); }
    const uses = el('div', 'ai-uses');
    for (const u of about.uses) { const t = el('span'); t.textContent = I18n.t(u); uses.append(t); }
    const st = el('span', 'ai-status');
    const acts = el('div', 'ai-acts');
    if (c.id !== chatConn && c.models.length && !/Backup/.test(about.uses[0])) {
      const use = el('button', 'link'); use.type = 'button'; use.textContent = I18n.t('Chat with this');
      use.addEventListener('click', async () => {
        if (use.disabled) return;
        use.disabled = true;
        const r = await S.aiSetModel(`${c.id}::*`);
        if (r && r.ok) toast(I18n.t('Your buddy now chats with {0}', about.name)); else use.disabled = false;
        loadAI();
      });
      acts.append(use);
    }
    const test = el('button', 'link'); test.type = 'button'; test.textContent = I18n.t('Test');
    test.addEventListener('click', async () => {
      st.textContent = I18n.t('Testing…'); st.className = 'ai-status';
      const r = await S.aiTest({ id: c.id });
      if (r.ok) { st.className = 'ai-status ok'; st.textContent = '✓ ' + I18n.t('Works'); }
      else { st.className = 'ai-status bad'; st.textContent = `✗ ${r.error}`; }
    });
    acts.append(test);
    if (!c.env) {
      const rm = el('button', 'link danger'); rm.type = 'button'; rm.textContent = I18n.t('Remove');
      rm.addEventListener('click', async () => {
        if (rm.dataset.sure) { await S.aiRemove(c.id); loadAI(); return; }
        rm.dataset.sure = '1'; rm.textContent = I18n.t('Click again to remove');
        setTimeout(() => { delete rm.dataset.sure; rm.textContent = I18n.t('Remove'); }, 3000);
      });
      acts.append(rm);
    }
    row.append(head, uses, st, acts);
    list.append(row);
  }
  // the four kinds of key you can add
  const pv = $('#ai-provider');
  if (pv.options.length < 2) for (const p of aiState.providers) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; pv.append(o); }
  const pick = $('#ai-pick'); pick.innerHTML = '';
  for (const id of ['groq', 'gemini', 'anthropic', 'openrouter']) {
    const a = AI_ABOUT[id], have = aiState.connections.some((c) => c.provider === id);
    const b = el('button', 'ai-card' + (aiPicked === id ? ' on' : '')); b.type = 'button';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = a.name + (have ? ' ✓' : '');
    b.querySelector('small').textContent = I18n.t(a.free ? 'Free' : 'Paid');
    b.addEventListener('click', () => { aiPicked = id; pv.value = id; aiFormChanged(); loadAIPick(); });
    pick.append(b);
  }
  loadAIPick();
}
function loadAIPick() {
  $$('#ai-pick .ai-card').forEach((b, i) => b.classList.toggle('on', ['groq', 'gemini', 'anthropic', 'openrouter'][i] === aiPicked));
  const box = $('#ai-about'); box.innerHTML = '';
  const a = AI_ABOUT[aiPicked];
  if (!a) { box.textContent = I18n.t('Pick which key you have. Not sure? Groq and Gemini are free and quick to get.'); return; }
  const n = el('div'); n.textContent = I18n.t(a.note);
  const u = el('div', 'ai-uses'); for (const x of a.uses) { const t = el('span'); t.textContent = I18n.t(x); u.append(t); }
  box.append(n, u);
  $('#ai-key').placeholder = I18n.t('Paste your {0} key here', a.name);
}
$('#s-fallback').addEventListener('change', () => S.setSettings({ autoFallback: $('#s-fallback').checked }));
S.onAIChanged(() => { if (currentTab === 'settings') loadAI(); });

function aiForm() {
  return { key: $('#ai-key').value.trim(), provider: $('#ai-provider').value, label: $('#ai-label').value.trim(),
    baseUrl: $('#ai-provider').value === 'custom' ? $('#ai-url').value.trim() : '',
    project: $('#ai-project').value.trim(), region: $('#ai-region').value.trim() };
}
function aiFormChanged() {
  aiDraft = null;
  $('#ai-save').disabled = !$('#ai-key').value.trim();      // Add checks the key itself
  $('#ai-result').hidden = true;
  const k = $('#ai-key').value.trim(), pv = $('#ai-provider').value;
  const isJson = k.startsWith('{');
  $('#ai-url-row').hidden = pv !== 'custom';
  $('#ai-gcp-row').hidden = pv !== 'vertex';
  const p = aiState?.providers.find((x) => x.id === pv);
  $('#ai-keylink').innerHTML = p?.keys ? t('Get a {0} key <a href="#" data-ext="{1}">here</a>.', p.label, p.keys) : '';
}
['#ai-key', '#ai-provider', '#ai-url', '#ai-project', '#ai-region'].forEach((q) => $(q).addEventListener('input', aiFormChanged));
$('#ai-provider').addEventListener('change', aiFormChanged);
$('#ai-howto').addEventListener('click', () => openOnboarding());

function showAIResult(r) {
  const box = $('#ai-result');
  box.hidden = false;
  box.className = `ai-result ${r.ok ? 'ok' : 'bad'}`;
  box.innerHTML = '';
  if (!r.ok) { box.textContent = `✗ ${r.error}`; return; }
  const h = el('div'); h.textContent = '✓ ' + I18n.t('{0} works. Press Add.', (AI_ABOUT[r.provider] || {}).name || r.providerLabel);
  box.append(h);
}
$('#ai-test').addEventListener('click', async () => {
  const f = aiForm();
  if (!f.key && f.provider !== 'custom') { showAIResult({ ok: false, error: 'Paste a key first.' }); return; }
  const b = $('#ai-test'); b.disabled = true; b.textContent = I18n.t('Testing…');
  const r = await S.aiTest(f);
  b.disabled = false; b.textContent = I18n.t('Test');
  showAIResult(r);
  if (r.ok) { aiDraft = r; $('#ai-save').disabled = false; if ($('#ai-provider').value === 'auto') { $('#ai-provider').value = r.provider; aiPicked = r.provider; loadAIPick(); } }
});
$('#ai-save').addEventListener('click', async () => {
  const b = $('#ai-save'); b.disabled = true; b.textContent = 'Adding…';
  const r = await S.aiAdd(aiForm());
  b.textContent = I18n.t('Add');
  if (!r.ok) { showAIResult(r); b.disabled = false; return; }
  ['#ai-key', '#ai-label', '#ai-url', '#ai-project', '#ai-region'].forEach((q) => { $(q).value = ''; });
  $('#ai-provider').value = 'auto'; aiPicked = '';
  aiFormChanged();
  $('#ai-add').open = false;
  toast(`${r.providerLabel} connected`);
  loadAI();
});

// ---------------- avatar customizer (Settings) ----------------
const SWATCHES = ['#FFCE47', '#FFB86B', '#FF9F6B', '#FF7A6B', '#FF8A9A', '#FFC2D4', '#C9A7FF', '#A48BFF', '#7FB3FF', '#6FD3F0',
  '#6FD3C1', '#A6E3C8', '#9BE07F', '#DCE8FF', '#F2EDE4', '#CFC7BD', '#B07D57', '#5A5F73'];
const ACC_SWATCHES = ['#5B8DEF', '#FF6B6B', '#FF5C8A', '#2E9E6A', '#FFB703', '#8E6CEF', '#2B2A4C', '#FFFFFF'];
const PAT_SWATCHES = ['#FFFFFF', '#FFF3E0', '#FFE27A', '#FF8A9A', '#7FB3FF', '#2B2A4C', '#8E8478'];
const EYE_SWATCHES = ['#2B2A4C', '#6B4423', '#2F6FD0', '#2E9E6A', '#8A4FD0', '#C2185B', '#FFE27A', '#FFFFFF'];
const OUTLINE_SWATCHES = ['#2B2A4C', '#3D7BE0', '#F06AA6', '#8A5BD6', '#8B5A3C'];
const BLUSH_SWATCHES = ['#FF8A80', '#FF6FA0', '#FF9EB5', '#FFB36B', '#C9A7FF'];
const LABELS = {
  shape: { note: 'Sticky note', blob: 'Blob', mochi: 'Mochi', cloud: 'Cloud', pebble: 'Pebble', drop: 'Drop', slime: 'Slime', bunny: 'Bunny',
    bear: 'Bear', cat: 'Cat', ghost: 'Ghost', bot: 'Robot', star: 'Star', heart: 'Heart', flower: 'Flower', octopus: 'Octopus', whale: 'Whale',
    turtle: 'Turtle', fox: 'Fox', penguin: 'Penguin', seal: 'Seal', panda: 'Panda', chick: 'Chick', axolotl: 'Axolotl', frog: 'Frog', mouse: 'Mouse', koala: 'Koala', chameleon: 'Chameleon', monkey: 'Monkey',
    toast: 'Toast', jellyfish: 'Jellyfish', dragon: 'Dragon', cactus: 'Cactus', snail: 'Snail', mushroom: 'Mushroom', image: 'My picture' },
  eyes: { shine: 'Sparkly', dots: 'Dots', happy: 'Happy', sleepy: 'Calm', glasses: 'Glasses', sparkle: 'Starry', round: 'Surprised', wink: 'Wink' },
  mouth: { smile: 'Smile', grin: 'Grin', cat: 'Kitty', flat: 'Neutral', o: 'Ooh', none: 'None' },
  pattern: { none: 'Plain', dots: 'Dots', stripes: 'Stripes', hearts: 'Hearts', sparkles: 'Sparkles', belly: 'Tummy', patch: 'Patches', soft: 'Glossy',
    checker: 'Checker', stars: 'Tiny stars', waves: 'Waves', confetti: 'Confetti', gingham: 'Gingham', clouds: 'Clouds', zigzag: 'Zigzag' },
  accessory: { none: 'None', pencil: 'Pencil', headphones: 'Headphones', cap: 'Cap', beanie: 'Beanie', party: 'Party hat', bow: 'Bow', flower: 'Flower',
    crown: 'Crown', halo: 'Halo', antenna: 'Antennae', star: 'Star clip', leaf: 'Sprout', scarf: 'Scarf',
    wizard: 'Wizard hat', specs: 'Specs', headset: 'Headset', hood: 'Hoodie', backpack: 'Backpack', rainhat: 'Rain hat', bowtie: 'Bow tie',
    wings: 'Tiny wings', catphones: 'Cat-ear phones', detective: 'Detective', chef: 'Chef hat', earmuffs: 'Earmuffs', moon: 'Moon',
    berry: 'Strawberry', peach: 'Peach', coffee: 'Coffee' },
};
let av = null;
let avSaveTimer = null;

function applyAvatarToHeader(a) {
  const logo = $('.brand .logo');
  if (logo) logo.innerHTML = Avatar.build({ ...a, accessory: a.shape === 'image' ? 'none' : a.accessory });
  const nm = $('.brand .bname');
  if (nm) nm.textContent = a.name || 'Scribble';
}

let avLocalUntil = 0;
// light: only refresh the previews (used while dragging sliders / panning, so the controls don't get rebuilt mid-drag)
function setAvatar(patch, { debounce = false, light = false } = {}) {
  av = { ...av, ...patch };
  window.ScribbleSound?.configure(av);
  avLocalUntil = Date.now() + 700;
  if (light) $$('.av-live').forEach((n) => { n.innerHTML = Avatar.build(av); });
  else renderCustomizer();
  applyAvatarToHeader(av);
  clearTimeout(avSaveTimer);
  if (debounce) avSaveTimer = setTimeout(() => S.setAvatar(av), 250); else S.setAvatar(patch);
}

function slider(label, value, min, max, step, onInput) {
  const row = el('label', 'av-slider');
  const t = el('span'); t.textContent = label;
  const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
  i.addEventListener('input', () => onInput(Number(i.value)));
  row.append(t, i);
  return row;
}

function pictureControls() {
  const wrap = el('div', 'av-sec');
  // big crop stage: drag to move, scroll to zoom
  const stageRow = el('div', 'crop-row');
  const crop = el('div', 'crop-stage av-live', Avatar.build(av));
  crop.title = 'Drag to move the picture · scroll to zoom';
  let drag = null;
  crop.addEventListener('pointerdown', (e) => { crop.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, c: { ...av.imageCrop } }; });
  crop.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const z = drag.c.zoom || 1;
    const nx = Math.max(-1, Math.min(1, drag.c.x - (e.clientX - drag.x) / (60 * z)));
    const ny = Math.max(-1, Math.min(1, drag.c.y - (e.clientY - drag.y) / (60 * z)));
    setAvatar({ imageCrop: { ...av.imageCrop, x: nx, y: ny } }, { debounce: true, light: true });
  });
  crop.addEventListener('pointerup', () => { drag = null; });
  crop.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = Math.max(1, Math.min(4, (av.imageCrop.zoom || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    setAvatar({ imageCrop: { ...av.imageCrop, zoom: z } }, { debounce: true, light: true });
    zoom.querySelector('input').value = z;
  }, { passive: false });
  const side = el('div', 'crop-side');
  const zoom = slider('Zoom', av.imageCrop.zoom || 1, 1, 4, 0.01, (v) => setAvatar({ imageCrop: { ...av.imageCrop, zoom: v } }, { debounce: true, light: true }));
  const frameSeg = el('div', 'seg small');
  for (const [k, l] of [['rounded', 'Rounded'], ['circle', 'Circle'], ['none', 'No frame']]) {
    const b = el('button', (av.imageFrame || 'rounded') === k ? 'on' : ''); b.type = 'button'; b.textContent = l;
    b.addEventListener('click', () => setAvatar({ imageFrame: k }));
    frameSeg.append(b);
  }
  const fl = el('span', 'av-h'); fl.textContent = 'Frame';
  const change = el('button', 'btn ghost'); change.type = 'button'; change.textContent = 'Choose another picture…';
  change.addEventListener('click', () => $('#av-file').click());
  const hint = el('small');
  hint.textContent = /^data:image\/gif/.test(av.image) ? 'Animated GIF: it plays on your desktop.' : 'Tip: a PNG with a transparent background + "No frame" looks like a sticker.';
  side.append(zoom, fl, frameSeg, change, hint);
  stageRow.append(crop, side);
  wrap.append(stageRow);

  // optional animated face on top of the picture
  const ft = el('label', 'toggle');
  const fc = el('input'); fc.type = 'checkbox'; fc.checked = !!av.faceOnImage;
  fc.addEventListener('change', () => setAvatar({ faceOnImage: fc.checked }));
  const fs = el('span'); fs.textContent = 'Put the animated face on my picture (eyes follow you, blinks, expressions)';
  ft.append(fc, fs);
  wrap.append(ft);
  if (av.faceOnImage) {
    const f = { x: 0, y: 0, scale: 1, ...(av.face || {}) };
    wrap.append(
      slider('Face left / right', f.x, -30, 30, 0.5, (v) => setAvatar({ face: { ...av.face, x: v } }, { debounce: true, light: true })),
      slider('Face up / down', f.y, -30, 30, 0.5, (v) => setAvatar({ face: { ...av.face, y: v } }, { debounce: true, light: true })),
      slider('Face size', f.scale, 0.4, 1.6, 0.01, (v) => setAvatar({ face: { ...av.face, scale: v } }, { debounce: true, light: true })),
    );
  }
  return wrap;
}

function optionGrid(key, values) {
  const grid = el('div', 'av-grid');
  for (const v of values) {
    const b = el('button', `av-opt${av[key] === v ? ' on' : ''}`);
    b.type = 'button';
    b.title = LABELS[key]?.[v] || v;
    const preview = { ...av, [key]: v };
    if (key === 'shape' && v === 'image') {
      b.innerHTML = av.image ? Avatar.build({ ...av, shape: 'image' }) : '<span class="av-plus">＋</span>';
    } else {
      if (preview.shape === 'image' && !(av.faceOnImage && (key === 'eyes' || key === 'mouth'))) preview.shape = 'note';
      b.innerHTML = Avatar.build(preview);
    }
    const cap = el('span', 'av-cap'); cap.textContent = LABELS[key]?.[v] || v;
    b.append(cap);
    b.addEventListener('click', () => {
      if (key === 'shape' && v === 'image' && !av.image) return $('#av-file').click();
      setAvatar({ [key]: v });
    });
    grid.append(b);
  }
  return grid;
}

function swatchRow(key, colors) {
  const row = el('div', 'av-swatches');
  // a clay character with no colour of its own is in its original colours (the first swatch)
  const cur = (av[key] || (key === 'color' && av.kind === 'clay' ? colors[0] : '')).toLowerCase();
  for (const c of colors) {
    const b = el('button', `sw${cur === c.toLowerCase() ? ' on' : ''}`);
    b.type = 'button';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => setAvatar({ [key]: c }));
    row.append(b);
  }
  const custom = el('input');
  custom.type = 'color';
  custom.value = av[key] || colors[0] || '#FFCE47';
  custom.title = 'Custom color';
  custom.className = 'sw custom';
  // while the colour picker is open only the previews update: rebuilding Settings would close the picker
  custom.addEventListener('input', () => setAvatar({ [key]: custom.value }, { debounce: true, light: true }));
  custom.addEventListener('change', () => setAvatar({ [key]: custom.value }));
  row.append(custom);
  return row;
}

function section(title, content) {
  const s = el('div', 'av-sec');
  const h = el('div', 'av-h'); h.textContent = title;
  s.append(h, content);
  return s;
}

function renderCustomizer() {
  const box = $('#avatar-editor');
  if (!box || !av) return;
  const scroll = box.closest('.settings')?.scrollTop;
  box.innerHTML = '';

  const top = el('div', 'av-top');
  const stage = el('div', 'av-stage av-live', Avatar.build(av));
  const who = el('div', 'av-who');
  const nameRow = el('label', 'field');
  nameRow.innerHTML = '<span>Name</span>';
  const name = el('input'); name.value = av.name || ''; name.maxLength = 30; name.placeholder = 'Scribble';
  name.addEventListener('change', () => setAvatar({ name: name.value.trim() || 'Scribble' }));
  nameRow.append(name);
  const toneRow = el('label', 'field');
  toneRow.innerHTML = '<span>Chat style</span>';
  const tone = el('select');
  tone.innerHTML = '<option value="mirror">Match me</option><option value="polite">Polite</option><option value="casual">Casual</option><option value="gaul">Trendy</option>';
  const LEGACY = { friendly: 'mirror', concise: 'polite', playful: 'casual' };
  tone.value = LEGACY[av.tone] || av.tone || 'mirror';
  const toneHint = el('small', 'tone-hint');
  const HINTS = { mirror: 'Your buddy copies how you write, right now: formal when you are, relaxed when you are.', polite: 'Neat and polite, no slang or emoji.', casual: 'Relaxed, like chatting with a friend.', gaul: 'Playful, like a fun friend online. It picks up the words you use, so it never sounds forced.' };
  const showHint = () => { toneHint.textContent = HINTS[tone.value] || ''; };
  showHint();
  tone.addEventListener('change', () => { showHint(); setAvatar({ tone: tone.value }); });
  toneRow.append(tone, toneHint);
  who.append(nameRow, toneRow);
  top.append(stage, who);
  box.append(top);

  // clay characters: pick one, then colour and pattern (cosmetic only: the character's rig never changes)
  const C = Avatar.clay, cur = C.name(av);
  const chars = el('div', 'av-grid tpl-grid clay-grid');
  for (const [k, c] of Object.entries(C.chars)) {
    const b = el('button', `av-opt${cur === k ? ' on' : ''}`);
    b.type = 'button'; b.title = c.label; b.dataset.clay = k;
    b.innerHTML = Avatar.build({ ...av, kind: 'clay', clay: k, color: cur === k ? av.color : null });
    const cap = el('span', 'av-cap'); cap.textContent = c.label; b.append(cap);
    b.addEventListener('click', () => { if (cur !== k) setAvatar({ kind: 'clay', clay: k, color: null }); });
    chars.append(b);
  }
  const G = { look: secGroup('b-look', 'Look', 'Character, colour, pattern, size'), move: secGroup('b-move', 'Movement & personality', 'How it moves and changes'), sound: secGroup('b-sound', 'Sounds', 'Little sounds for what it does') };
  G.look.body.append(section('Character', chars));
  G.look.body.append(section('Colour', swatchRow('color', C.chars[cur].palette)));
  const pg = el('div', 'av-grid pat-grid');
  for (const p of C.patterns) {
    const on = (av.pattern || 'none') === p;
    const b = el('button', `av-opt${on ? ' on' : ''}`);
    b.type = 'button'; b.title = LABELS.pattern?.[p] || p; b.dataset.pattern = p;
    b.innerHTML = Avatar.build({ ...av, pattern: p });
    const cap = el('span', 'av-cap'); cap.textContent = { none: 'Plain', dots: 'Dots', stripes: 'Stripes', hearts: 'Hearts' }[p]; b.append(cap);
    b.addEventListener('click', () => setAvatar({ pattern: p }));
    pg.append(b);
  }
  G.look.body.append(section('Pattern', pg));
  if (av.pattern && av.pattern !== 'none') G.look.body.append(section('Pattern colour', swatchRow('patColor', C.inks)));
  G.look.body.append(section('Size', sizeControl()));
  // change character automatically
  const rot = el('select', 'rot-sel');
  for (const [k, l] of [['off', 'Off'], ['launch', 'Each time Scribble starts'], ['hour', 'Every hour'], ['day', 'Every day']]) {
    const o = el('option'); o.value = k; o.textContent = l; if ((av.rotate || 'off') === k) o.selected = true; rot.append(o);
  }
  rot.addEventListener('change', () => setAvatar({ rotate: rot.value, rotatedAt: Date.now() }));
  const rotNote = el('small'); rotNote.textContent = 'Poof! Your buddy turns into one of the others in a cloud of smoke.';
  const rotBox = el('div'); rotBox.append(rot, rotNote);
  G.move.body.append(section('Change character automatically', rotBox));

  const tp = el('div', 'temper-grid');
  for (const [k, l, d] of TEMPERS) {
    const b = el('button', `temper${(av.temperament || 'playful') === k ? ' on' : ''}`);
    b.type = 'button';
    b.innerHTML = `<b>${l}</b><small>${d}</small>`;
    b.addEventListener('click', () => setAvatar({ temperament: k }));
    tp.append(b);
  }
  G.move.body.append(section('Personality', tp));

  // sounds: little tones for what the buddy does (sounds.js)
  {
    const snd = { on: true, idle: false, vol: 0.6, ...(av.sound || {}) };
    const sec = el('div', 'av-sec snd-sec');
    const h = el('span', 'av-h'); h.textContent = 'Sounds';
    const set = (p) => setAvatar({ sound: { ...snd, ...p } }, { light: true });
    const tog = (label, on, key) => {
      const l = el('label', 'toggle'); const i = el('input'); i.type = 'checkbox'; i.checked = on; i.id = 'snd-' + key;
      i.addEventListener('change', () => { snd[key] = i.checked; set({ [key]: i.checked }); if (key === 'on') vol.disabled = idle.querySelector('input').disabled = !i.checked; });
      const t = el('span'); t.textContent = label; l.append(i, t); return l;
    };
    const main = tog('Sounds when I use it (tap, drag, replies, saving)', snd.on, 'on');
    const idle = tog('Also when it does things on its own (hops, sneezes, naps…)', snd.idle, 'idle');
    const row = el('div', 'snd-row');
    const vl = el('span'); vl.textContent = 'Volume';
    const vol = el('input'); vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(snd.vol); vol.id = 'snd-vol';
    vol.addEventListener('change', () => { snd.vol = Number(vol.value); set({ vol: snd.vol }); setTimeout(() => window.ScribbleSound?.play('tap'), 60); });
    const test = el('button', 'btn ghost'); test.type = 'button'; test.textContent = 'Play a sound';
    test.addEventListener('click', () => { const n = ['tap', 'saved', 'taskDone', 'reply', 'surprised']; window.ScribbleSound?.play(n[(Math.random() * n.length) | 0]); });
    vol.disabled = !snd.on; idle.querySelector('input').disabled = !snd.on;
    row.append(vl, vol, test);
    const note = el('small'); note.textContent = 'Each buddy has its own voice. Quiet when your phone is on silent.';
    sec.append(h, main, idle, row, note);
    G.sound.body.append(sec);
  }

  const extra = el('div', 'av-sec');

  {
    const ck = el('label', 'toggle');
    const c = el('input'); c.type = 'checkbox'; c.checked = av.cheeks !== false;
    c.addEventListener('change', () => setAvatar({ cheeks: c.checked }));
    const t = el('span'); t.textContent = 'Rosy cheeks';
    ck.append(c, t);
    extra.append(ck);
    if (av.cheeks !== false) extra.append(swatchRow('blushColor', BLUSH_SWATCHES));
  }
  const reset = el('button', 'link'); reset.textContent = 'Reset to default buddy';
  reset.addEventListener('click', async () => { const d = await S.avatarDefaults(); setAvatar({ ...d, kind: 'clay', clay: 'fox', color: null, pattern: 'none', name: av.name }); });
  extra.append(reset);
  G.look.body.append(extra);
  box.append(G.look.d, G.move.d, G.sound.d);
  if (scroll != null) box.closest('.settings').scrollTop = scroll;
}

// personalities: which idle antics the buddy prefers
// size: any size from 60% to 250% (older versions only know small/medium/large, so that's kept up to date too)
function sizeControl() {
  const scaleOf = (a) => (Number(a.scale) > 0 ? Number(a.scale) : { s: 0.8, m: 1, l: 1.3 }[a.size] || 1);
  const sizeRow = el('div', 'av-line size-row');
  const sz = el('input'); sz.type = 'range'; sz.min = '0.6'; sz.max = '2.5'; sz.step = '0.05'; sz.value = String(scaleOf(av));
  sz.setAttribute('aria-label', 'Size');
  const szv = el('span', 'size-val'); szv.textContent = Math.round(scaleOf(av) * 100) + '%';
  const sizePatch = (v) => ({ scale: v, size: v < 0.9 ? 's' : v < 1.15 ? 'm' : 'l' });
  sz.addEventListener('input', () => { const v = Number(sz.value); szv.textContent = Math.round(v * 100) + '%'; setAvatar(sizePatch(v), { debounce: true, light: true }); });
  sz.addEventListener('change', () => setAvatar(sizePatch(Number(sz.value)), { light: true }));
  sizeRow.append(sz, szv);
  return sizeRow;
}

const TEMPERS = [
  ['playful', 'Playful', 'Hops, rolls, pounces, scoots around'],
  ['joyful', 'Joyful', 'Wiggles, waves, babbles, sends hearts'],
  ['curious', 'Curious', 'Looks around, tilts its head, explores'],
  ['sleepy', 'Sleepy', 'Yawns, stretches and naps a lot'],
  ['shy', 'Shy', 'Peekaboo, blushes, looks away'],
];


// Custom picture. Animated GIFs are kept as they are (up to 3 MB) so they keep playing;
// other images are scaled to at most 512px (enough room to zoom and pan) and keep transparency.
$('#av-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const fresh = { shape: 'image', imageCrop: { zoom: 1, x: 0, y: 0 }, face: { x: 0, y: 0, scale: 1 } };
  try {
    const bmp = await createImageBitmap(f);
    if (f.type === 'image/gif') {
      if (f.size > 3e6) { toast('That GIF is over 3 MB. Try a smaller one.'); return; }
      const data = await readAs(f);
      return setAvatar({ ...fresh, image: data, imageW: bmp.width, imageH: bmp.height });
    }
    const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    setAvatar({ ...fresh, image: c.toDataURL('image/webp', 0.9), imageW: c.width, imageH: c.height });
  } catch {
    toast('That file isn\'t an image I can use.');
  }
});

S.onAvatar((a) => {
  window.ScribbleSound?.configure(a);
  if (Date.now() < avLocalUntil) return;          // our own change echoing back
  av = a; applyAvatarToHeader(a); renderCustomizer();
});
S.getAvatar().then((a) => { window.ScribbleSound?.configure(a); av = a; applyAvatarToHeader(a); renderCustomizer(); });

// ---------------- light / dark ----------------
function showTheme(t) {
  $$('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.theme === t.theme));
  $('#btn-theme').title = t.dark ? 'Switch to light mode' : 'Switch to dark mode';
}
$('#btn-theme').addEventListener('click', async () => {
  const now = await S.getTheme();
  showTheme(await S.setTheme(now.dark ? 'light' : 'dark'));
});
$$('#s-theme button').forEach((b) => b.addEventListener('click', async () => showTheme(await S.setTheme(b.dataset.theme))));
S.onTheme(showTheme);
S.getTheme().then(showTheme);

// ---------------- usage + cost ----------------
const MODEL_NAMES = { 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5', 'claude-opus-5-5': 'Opus 5.5' };
const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
function usageBox(label, u) {
  const box = el('div', 'u-box');
  const tokens = u.input + u.output + u.cacheWrite + u.cacheRead;
  box.innerHTML = `<div class="u-k"></div><div class="u-cost"></div><div class="u-sub"></div>`;
  box.querySelector('.u-k').textContent = label;
  box.querySelector('.u-cost').textContent = `${fmtTok(tokens)} tokens`;
  const models = Object.entries(u.byModel).map(([m, v]) => `${MODEL_NAMES[m] || m}: ${v.calls} calls`).join(' · ');
  box.querySelector('.u-sub').textContent = `${u.calls} calls · ${fmtTok(u.output)} written · ${fmtTok(u.cacheRead)} cached${models ? `\n${models}` : ''}`;
  box.querySelector('.u-sub').style.whiteSpace = 'pre-line';
  return box;
}



// ---------------- shortcuts (press-to-record) ----------------
let platform = 'win32';
const prettyAccel = (a) => String(a || '').replace('CommandOrControl', platform === 'darwin' ? '⌘' : 'Ctrl').replace(/\+/g, ' + ');
function accelFrom(e) {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (!mods.length || (mods.length === 1 && mods[0] === 'Shift')) return 'NEED_MOD';
  let key = k.length === 1 ? k.toUpperCase() : k;
  if (k === ' ') key = 'Space';
  if (/^Arrow/.test(k)) key = k.slice(5);
  return [...mods, key].join('+');
}
for (const id of ['k-panel', 'k-capture', 'k-quick']) {
  const b = $('#' + id);
  b.addEventListener('click', () => { b.classList.add('recording'); b.textContent = 'Press keys…'; b.focus(); });
  b.addEventListener('blur', () => { if (b.classList.contains('recording')) { b.classList.remove('recording'); b.textContent = prettyAccel(b.dataset.accel); } });
  b.addEventListener('keydown', async (e) => {
    if (!b.classList.contains('recording')) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { b.blur(); return; }
    const a = accelFrom(e);
    if (!a) return;
    if (a === 'NEED_MOD') { $('#k-msg').textContent = 'Use Ctrl or Alt with a key.'; return; }
    b.classList.remove('recording');
    const r = await S.setSettings(id === 'k-panel' ? { shortcut: a } : id === 'k-quick' ? { quickShortcut: a } : { captureShortcut: a });
    const ok = r && r.shortcuts ? (id === 'k-panel' ? r.shortcuts.panel : id === 'k-quick' ? r.shortcuts.quick : r.shortcuts.capture) : true;
    $('#k-msg').textContent = ok ? '' : `${prettyAccel(a)} is taken by another app. Try a different one.`;
    b.dataset.accel = a;
    b.textContent = prettyAccel(a);
  });
}
$('#s-capture').addEventListener('change', async (e) => { await S.setSettings({ captureEnabled: e.target.checked }); });

// ---------------- sync & backup ----------------
async function loadSync() {
  const st = await S.syncStatus();
  $('#sync-state').textContent = st.onDrive ? 'On Google Drive ✓' : 'Only on this computer';
  $('#sync-state').classList.toggle('on', st.onDrive);
  const box = $('#sync-drive');
  box.innerHTML = '';
  if (!st.onDrive) {
    if (st.candidates.length) {
      for (const c of st.candidates) {
        const b = el('button', 'btn drive-btn'); b.type = 'button';
        b.innerHTML = '<span>Move notebook to Google Drive</span><small></small>';
        b.querySelector('small').textContent = c;
        b.addEventListener('click', () => moveToSync(c));
        box.append(b);
      }
    } else {
      const t = el('small');
      t.textContent = 'Google Drive for desktop wasn\'t found. Install it and sign in, or pick any synced folder (OneDrive, Dropbox…) below.';
      box.append(t);
    }
  } else {
    const t = el('small'); t.textContent = 'Changes sync through Drive. If a page is edited on two devices at once, Scribble keeps both versions as a conflict copy.'; box.append(t);
  }
  $('#backup-last').textContent = st.lastBackup ? st.lastBackup : 'none yet';
}
async function moveToSync(dir, mode) {
  let r = await S.syncMoveTo(dir, mode);
  if (r.needsChoice) {
    const use = confirm(`There's already a Scribble notebook at\n${r.target}\n(probably from another computer).\n\nOK = use that notebook (yours stays as a backup)\nCancel = more options`);
    if (use) r = await S.syncMoveTo(dir, 'use');
    else if (confirm('Copy this computer\'s notebook into it as well?\nPages that differ are kept side by side as "(from this computer)" copies, and tasks are merged.')) r = await S.syncMoveTo(dir, 'copy');
    else return;
  }
  if (r.ok) { toast('Notebook is now in your synced folder'); $('#s-folder').textContent = r.folder; }
  loadSync();
}
$('#sync-pick').addEventListener('click', () => moveToSync(null));
$('#backup-now').addEventListener('click', async () => { const n = await S.backupNow(); toast(n ? 'Backed up' : 'Backup failed'); loadSync(); });
$('#backup-open').addEventListener('click', () => S.backupOpen());

// ---------------- routine settings ----------------
// each field: element id → [routine key, kind]
const RFIELDS = {
  'r-brief': ['morningBrief', 'check'], 'r-btime': ['briefTime', 'time'], 'r-midday': ['midday', 'check'], 'r-mtime': ['middayTime', 'time'],
  'r-recap': ['recap', 'check'], 'r-time': ['recapTime', 'time'], 'r-weekly': ['weekly', 'check'], 'r-wday': ['weeklyDay', 'num'], 'r-to': ['reportTo', 'text'],
  'r-wstart': ['workStart', 'time'], 'r-wend': ['workEnd', 'time'], 'r-workonly': ['workOnly', 'check'],
  'r-quiet': ['quiet', 'check'], 'r-qfrom': ['quietFrom', 'time'], 'r-qto': ['quietTo', 'time'], 'r-daystart': ['dayStart', 'time'],
  'r-mevening': ['moneyEvening', 'check'], 'r-metime': ['moneyEveningTime', 'time'], 'r-mmonthly': ['moneyMonthly', 'check'],
  'r-dueahead': ['dueAhead', 'num'], 'r-timeahead': ['timeAhead', 'num'], 'r-billsahead': ['billsAhead', 'num'], 'r-budgetwarn': ['budgetWarn', 'num'],
};
const CHATTY_HINT = { quiet: 'Only the check-ins above, nothing in between.', normal: 'The check-ins, plus useful nudges: tasks due, bills coming up, budgets running out.', chatty: 'All of that, plus a friendly check-in on quiet afternoons.' };
let routineNow = null;
function paintChatty(v) {
  $$('#r-chatty button').forEach((b) => b.classList.toggle('on', b.dataset.chatty === v));
  $('#r-chatty-hint').textContent = (window.I18n ? I18n.t(CHATTY_HINT[v] || '') : CHATTY_HINT[v]) || '';
}
function paintDays(days) {
  const box = $('#r-daychips'); box.innerHTML = '';
  const loc = (window.I18n && I18n.locale && I18n.locale()) || undefined;
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const b = el('button', 'day-chip' + (days.includes(d) ? ' on' : '')); b.type = 'button'; b.dataset.noI18n = '';
    b.textContent = new Date(2026, 0, 4 + d).toLocaleDateString(loc, { weekday: 'short' });   // 4 Jan 2026 is a Sunday
    b.addEventListener('click', async () => {
      const set = new Set(routineNow.days); if (set.has(d)) set.delete(d); else set.add(d);
      if (!set.size) return;
      routineNow = await S.setRoutine({ days: [...set].sort() }); paintDays(routineNow.days);
    });
    box.append(b);
  }
}
async function loadRoutine() {
  const r = routineNow = await S.getRoutine();
  for (const [id, [k, kind]] of Object.entries(RFIELDS)) {
    const e = $('#' + id); if (!e) continue;
    if (kind === 'check') e.checked = !!r[k]; else e.value = String(r[k] ?? '');
  }
  paintDays(r.days); paintChatty(r.chatty);
  const money = !!(await S.getSettings()).money;
  $$('.r-money').forEach((x) => { x.hidden = !money; });
}
for (const [id, [k, kind]] of Object.entries(RFIELDS)) {
  const e = $('#' + id); if (!e) continue;
  e.addEventListener('change', async () => {
    let v = kind === 'check' ? e.checked : kind === 'num' ? Number(e.value) : kind === 'time' ? (e.value || ROUTINE_FALLBACK[k]) : e.value.trim();
    routineNow = await S.setRoutine({ [k]: v });
  });
}
const ROUTINE_FALLBACK = { briefTime: '05:00', middayTime: '14:00', recapTime: '17:30', workStart: '09:00', workEnd: '17:00', quietFrom: '22:00', quietTo: '07:00', dayStart: '00:00', moneyEveningTime: '21:00' };
$$('#r-chatty button').forEach((b) => b.addEventListener('click', async () => { routineNow = await S.setRoutine({ chatty: b.dataset.chatty }); paintChatty(routineNow.chatty); }));
$('#r-brief-now').addEventListener('click', async () => { currentBrief = await S.briefNow(); showTab('chat'); loadChat(); });

// ---------------- import ----------------
async function runImport() {
  const r = await S.importFile();
  if (!r || r.canceled) return;
  const box = $('#import-result');
  box.hidden = false;
  if (!r.ok) { box.textContent = r.error; box.classList.add('bad'); return; }
  box.classList.remove('bad');
  box.textContent = r.tasksAdded || r.pagesCreated
    ? `Imported ${r.tasksAdded} task${r.tasksAdded === 1 ? '' : 's'} and ${r.pagesCreated} project page${r.pagesCreated === 1 ? '' : 's'} from ${r.source}.`
      + (r.openNeedingDetails ? ` ${r.openNeedingDetails} open task${r.openNeedingDetails === 1 ? '' : 's'} still need a due date and priority: they're marked ⚠ in the Tasks tab.` : '')
      + ' A backup was made first, and ↶ Undo in the chat reverts the import.'
    : `Nothing new to import. Everything from ${r.source} is already in your notebook.`;
  refreshUndo();
}
$('#import-btn').addEventListener('click', runImport);
S.onImportStart(() => setTimeout(runImport, 300));

loadChat();


// ---------------- first-run setup: connect Gemini (free) or Claude ----------------
const GUIDES = {
  gemini: {
    title: 'Get a free Gemini key',
    url: 'https://aistudio.google.com/apikey',
    open: 'Open Google AI Studio ↗',
    steps: [
      'Click <b>Open Google AI Studio</b> below. Sign in with your normal Google (Gmail) account.',
      'First time there? Tick the box to accept the terms and click <b>Continue</b>.',
      'Already see a key in the list? Just copy that one. Otherwise click <b>Create API key</b> (top right); if it asks for a project, pick <b>Create project</b> or any project in the list, then click <b>Create key</b>.',
      'Click the <b>copy</b> icon next to your new key.',
      'Come back here. I\'ll paste it for you, or paste it into the box below yourself.',
    ],
    note: 'Free, no credit card. Google allows a limited number of requests per day on the free plan; when one model runs out I switch to another free Gemini model. On the free plan Google may use your chats to improve its products, so don\'t send passwords or confidential data.',
    looksLike: (k) => /^AIza[\w-]{20,}$/.test(k) || /^AQ\.[\w.-]{20,}$/.test(k),
  },
  anthropic: {
    title: 'Get a Claude key',
    url: 'https://platform.claude.com/settings/keys',
    open: 'Open Claude Console ↗',
    steps: [
      'Click <b>Open Claude Console</b> below and sign in, or create a free account with your email or Google.',
      'Add credit: go to <b>Settings → Billing</b> and buy credits (pay as you go, a few dollars is plenty to start). A Claude Pro subscription doesn\'t include API credit.',
      'Go to <b>Settings → API keys</b> and click <b>Create key</b>. Name it <i>Scribble</i>.',
      'Click <b>Copy</b>. Claude shows the key only once, so copy it now. It starts with <code>sk-ant-</code>.',
      'Come back here. I\'ll paste it for you, or paste it into the box below yourself.',
    ],
    note: 'You pay Anthropic directly for what you use. Set a monthly spend limit in Settings → Limits if you want a cap.',
    looksLike: (k) => /^sk-ant-[\w-]{20,}$/.test(k),
  },
};
let obPick = null;
function obBuddies() {
  const look = av && av.kind ? av : { kind: 'clay', clay: 'fox' };
  $('#ob-buddy0').innerHTML = Avatar.build(look);
  $('#ob-buddy').innerHTML = Avatar.build(look);
  $('#ob-buddy2').innerHTML = Avatar.build({ ...look, eyes: 'happy', mouth: 'grin' });
}
function obPage(name) { obBuddies(); $$('#onboard .ob-page').forEach((p) => { p.hidden = p.dataset.ob !== name; }); }
let account = { signedIn: false };
function openOnboarding(page) {
  $('#ob-who').textContent = account.signedIn ? `Signed in as ${account.email}` : '';
  $('#onboard').hidden = false;
  obPage(page || (account.signedIn ? 'choose' : 'signin'));
}
function closeOnboarding() { $('#onboard').hidden = true; obPick = null; }
$$('#onboard .ob-choice').forEach((b) => b.addEventListener('click', () => {
  obPick = b.dataset.pick;
  const g = GUIDES[obPick];
  $('#ob-title').textContent = g.title;
  $('#ob-steps').innerHTML = g.steps.map((x) => `<li>${t(x)}</li>`).join('');
  $('#ob-open').textContent = g.open;
  $('#ob-note').textContent = g.note;
  $('#ob-key').value = '';
  $('#ob-key').placeholder = obPick === 'gemini' ? 'AIza…' : 'sk-ant-…';
  $('#ob-status').hidden = true;
  $('#ob-connect').disabled = true;
  obPage('guide');
}));
$('#ob-back').addEventListener('click', () => obPage('choose'));
$('#ob-skip').addEventListener('click', () => {
  $('#ob-done-msg').textContent = 'You can add a Gemini or Claude key any time in Settings → App. Until then I can\'t chat.';
  openBuddyStep();
});

// ---- step 3: make the buddy yours (look, name, personality) ----
function renderBuddyStep() {
  $('#ob-bd-preview').innerHTML = Avatar.build(av);
  const grid = $('#ob-tpl');
  grid.innerHTML = '';
  const C = Avatar.clay, cur = C.name(av);
  for (const [k, c] of Object.entries(C.chars)) {
    const b = el('button', `ob-tpl-opt${cur === k ? ' on' : ''}`);
    b.type = 'button'; b.title = c.label; b.dataset.clay = k;
    b.innerHTML = Avatar.build({ ...av, kind: 'clay', clay: k, color: cur === k ? av.color : null });
    const cap = el('span'); cap.textContent = c.label;
    b.append(cap);
    b.addEventListener('click', () => { setAvatar({ kind: 'clay', clay: k, color: null }); renderBuddyStep(); });
    grid.append(b);
  }
  const tp = $('#ob-temper');
  tp.innerHTML = '';
  for (const [k, l, d] of TEMPERS) {
    const b = el('button', `ob-chip${(av.temperament || 'playful') === k ? ' on' : ''}`);
    b.type = 'button'; b.textContent = l; b.title = d;
    b.addEventListener('click', () => { setAvatar({ temperament: k }); renderBuddyStep(); });
    tp.append(b);
  }
}
function openBuddyStep() {
  $('#ob-bd-name').value = av.name && av.name !== 'Scribble' ? av.name : '';
  renderBuddyStep();
  obPage('buddy');
}
$('#ob-bd-name').addEventListener('input', () => setAvatar({ name: $('#ob-bd-name').value.trim() || 'Scribble' }, { debounce: true, light: true }));
$('#ob-bd-next').addEventListener('click', async () => {
  clearTimeout(avSaveTimer); await S.setAvatar(av);
  await S.setSettings({ onboarded: true, money: true });
  applyMoney(true);
  const nm = av.name || 'Scribble';
  $('#ob-done-title').textContent = `Say hi to ${nm}!`;
  obPage('done');
});

// ---- Google sign-in (required) ----
function signStatus(kind, text) { const st = $('#ob-sign-status'); st.hidden = !text; st.className = `ob-status ${kind}`; st.textContent = text; }
let authUrl = '', helpTimer = null;
S.onAuthUrl(({ url, failed } = {}) => {
  authUrl = url || authUrl;
  clearTimeout(helpTimer);
  if (failed) showSignHelp("Windows couldn't open your browser. Copy the link and paste it into Chrome or Edge:");
  else helpTimer = setTimeout(() => showSignHelp("Browser didn't open?"), 3000);
});
function showSignHelp(text) { $('#ob-help-txt').textContent = text; $('#ob-sign-help').hidden = false; }
$('#ob-open-again').addEventListener('click', async () => {
  if (!authUrl) return;
  const ok = await S.openAuth(authUrl);
  if (!ok) showSignHelp("Windows still couldn't open a browser. Use Copy link instead:");
});
$('#ob-copy-link').addEventListener('click', async () => {
  if (!authUrl) return;
  await S.copyAuth(authUrl);
  $('#ob-copy-link').textContent = 'Copied ✓';
  setTimeout(() => { $('#ob-copy-link').textContent = 'Copy link'; }, 2500);
});
$('#ob-cancel').addEventListener('click', () => S.cancelSignIn());
$('#ob-google').addEventListener('click', async () => {
  const b = $('#ob-google');
  b.disabled = true;
  signStatus('', 'Your browser is opening. Pick your Google account there, then come back here.');
  const r = await S.signIn();
  b.disabled = false;
  clearTimeout(helpTimer);
  $('#ob-sign-help').hidden = true;
  if (!r.ok) { signStatus(r.cancelled ? '' : 'bad', r.cancelled ? '' : `✗ ${r.error}`); return; }
  signStatus('', '');
  av = await S.getAvatar(); applyAvatarToHeader(av); renderCustomizer();
  account = { signedIn: true, email: r.email, name: r.name, picture: r.picture };
  applyAccount();
  // an account that was set up before (on any device) goes straight to "welcome back", even without an AI key here
  const known = r.hasAI || (await S.getSettings().catch(() => ({}))).onboarded;
  if (known) {
    const first = String(r.name || '').split(' ')[0];
    $('#ob-done-title').textContent = 'All set!';
    $('#ob-done-msg').textContent = `Welcome back${first ? ', ' + first : ''}! Your notes, tasks and settings are synced from your Google Drive.` + (r.setAside ? ` The notes that were on this computer for ${r.setAside} were put aside in a separate folder.` : '') + (r.hasAI ? '' : ' Add an AI key in Settings → App so I can chat.');
    obPage('done');
  } else {
    $('#ob-who').textContent = `Signed in as ${r.email}` + (r.setAside ? ` · notes from ${r.setAside} were put aside in a separate folder` : '');
    obPage('choose');
  }
  loadChat();
  if (currentTab === 'settings') loadSettings();
});

// ---- Updates (over the air from GitHub Releases) ----
function applyUpdate(u) {
  if (!u) return;
  $('#upd-ver').textContent = `Scribble ${u.current}`;
  const msg = $('#upd-msg'), bar = $('#upd-bar'), chk = $('#upd-check'), ins = $('#upd-install');
  bar.hidden = u.status !== 'downloading';
  bar.firstElementChild.style.width = `${u.progress || 0}%`;
  ins.hidden = u.status !== 'ready';
  chk.hidden = u.status === 'ready';
  chk.disabled = u.status === 'checking' || u.status === 'downloading' || u.status === 'dev';
  msg.className = u.status === 'error' ? 'bad' : u.status === 'ready' ? 'ok' : '';
  msg.textContent = {
    dev: 'Running from source: updates work in the installed app.',
    idle: 'Updates install automatically.',
    checking: 'Checking for updates…',
    latest: `You're on the latest version${u.checkedAt ? ` · checked ${ago(u.checkedAt)}` : ''}.`,
    downloading: `Downloading version ${u.version}… ${u.progress || 0}%`,
    ready: `Version ${u.version} is ready. Restart to update, or it installs next time you quit.`,
    error: u.error || 'Update check failed.',
  }[u.status] || '';
}
S.onUpdate(applyUpdate);
S.updateState().then(applyUpdate);
$('#upd-check').addEventListener('click', async () => applyUpdate(await S.checkUpdate()));
$('#upd-install').addEventListener('click', async () => { $('#upd-install').textContent = 'Restarting…'; await S.installUpdate(); });

// ---- Account section in Settings → App ----
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 50) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleString();
}
function syncText(st) {
  if (!st) return '';
  if (st.state === 'syncing') return 'Syncing…';
  if (st.state === 'offline') return 'Offline. Will sync when you\'re back online.';
  if (st.state === 'error') return `Sync problem: ${st.error}`;
  if (st.last) return `Synced ${ago(st.last)}`;
  return '';
}
function applyAccount(st) {
  if (!account.signedIn) return;
  $('#acct-name').textContent = account.name || account.email;
  $('#acct-email').textContent = account.email;
  const pic = $('#acct-pic');
  if (account.picture) { pic.src = account.picture; pic.hidden = false; } else pic.hidden = true;
  if (st !== undefined) {
    const el = $('#acct-sync');
    el.textContent = syncText(st);
    el.classList.toggle('bad', !!st && st.state === 'error');
  }
}
async function loadAccount() {
  const a = await S.account();
  account = a;
  applyAccount(a.sync);
}
S.onSyncStatus((st) => {
  applyAccount(st);
  if (st && st.state !== 'syncing') { $('#ob-sync').hidden = true; $('#acct-bar').hidden = true; obRecheck(); }
});
// live progress: a slim bar at the top of setup, and in Settings → App → Account
S.onSyncProgress((p) => {
  if (!p || !p.total) return;
  const pct = Math.round((p.done / p.total) * 100);
  const busy = p.done < p.total;
  const txt = busy ? `Syncing your notes with Google Drive… ${p.done} of ${p.total} files` : 'Notes synced ✓';
  $('#ob-sync').hidden = !busy || p.total < 15;
  $('#ob-sync-txt').textContent = txt;
  $('#ob-sync .upd-bar i').style.width = `${pct}%`;
  $('#acct-bar').hidden = !busy;
  $('#acct-bar i').style.width = `${pct}%`;
  if (busy) $('#acct-sync').textContent = `Syncing ${p.done} of ${p.total} files…`;
});
S.onAccount((a) => {
  account = a || { signedIn: false };
  if (!account.signedIn) {
    openOnboarding('signin');
    if (a?.reason === 'expired') signStatus('warn', 'Your Google sign-in expired or was removed. Please sign in again.');
  } else applyAccount();
});
S.onChatReload(() => { if (!busy) loadChat(); });
// back to Scribble: pick up what was done on other devices
window.addEventListener('focus', () => S.syncFocus && S.syncFocus());
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.syncFocus) S.syncFocus(); });
S.onSettingsChanged(() => { obRecheck(); S.getSettings().then((s) => applyMoney(s.money)).catch(() => {}); if (currentTab === 'settings') loadSettings(); });
S.onAIChanged(() => obRecheck());
$('#acct-sync-now').addEventListener('click', async () => {
  $('#acct-sync').textContent = 'Syncing…';
  const st = await S.syncNow();
  applyAccount(st);
});
$('#acct-out').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!b.dataset.sure) {
    b.dataset.sure = '1'; b.textContent = 'Click again to sign out';
    setTimeout(() => { delete b.dataset.sure; b.textContent = 'Sign out'; }, 3500);
    return;
  }
  b.textContent = 'Saving to Drive…';
  await S.signOut();
  b.textContent = 'Sign out'; delete b.dataset.sure;
  account = { signedIn: false };
  openOnboarding('signin');
});
$('#ob-open').addEventListener('click', () => S.openExternal(GUIDES[obPick].url));
function obStatus(kind, text) { const st = $('#ob-status'); st.hidden = false; st.className = `ob-status ${kind}`; st.textContent = text; }
$('#ob-key').addEventListener('input', () => {
  const k = $('#ob-key').value.trim();
  $('#ob-connect').disabled = !k;
  if (k && obPick && !GUIDES[obPick].looksLike(k)) obStatus('warn', obPick === 'gemini' ? "That doesn't look like a Gemini key (they usually start with AIza). I'll try it anyway." : "That doesn't look like a Claude key (they start with sk-ant-). I'll try it anyway.");
  else $('#ob-status').hidden = true;
});
// Copied the key in the browser? Pick it up from the clipboard when the user comes back.
window.addEventListener('focus', async () => {
  if ($('#onboard').hidden || !obPick || $('#ob-key').value.trim()) return;
  const k = await S.clipboardKey();
  if (k && GUIDES[obPick].looksLike(k)) {
    $('#ob-key').value = k;
    $('#ob-connect').disabled = false;
    obStatus('ok', 'Found your key on the clipboard. Click Connect.');
  }
});
async function obConnect() {
  const key = $('#ob-key').value.trim();
  if (!key) return;
  const b = $('#ob-connect');
  b.disabled = true; b.textContent = 'Connecting…';
  obStatus('', 'Checking your key with ' + (obPick === 'gemini' ? 'Google' : 'Anthropic') + '…');
  const r = await S.aiAdd({ key, provider: obPick, makeActive: true });
  b.textContent = 'Connect';
  if (!r.ok) {
    b.disabled = false;
    obStatus('bad', `✗ ${friendlyKeyError(r.error)}`);
    return;
  }
  $('#ob-done-msg').textContent = `${r.providerLabel} is connected. I'll use ${r.models[0]?.label || 'it'}${obPick === 'gemini' ? ' and switch between free Gemini models if one hits its daily limit' : ''}.`;
  openBuddyStep();
  if (currentTab === 'settings') loadAI();
}
$('#ob-connect').addEventListener('click', obConnect);
$('#ob-key').addEventListener('keydown', (e) => { if (e.key === 'Enter') obConnect(); });
$('#ob-start').addEventListener('click', () => { closeOnboarding(); S.setSettings({ onboarded: true }); showTab('chat'); });
// Setup opened by itself at start (no AI key here yet), but the account's settings then arrive from Drive with a
// key or "already set up": close it again instead of asking an existing user to set up a new buddy.
let obAuto = false;
async function obRecheck() {
  if (!obAuto || $('#onboard').hidden || !account.signedIn) return;
  const cur = [...$$('#onboard .ob-page')].find((x) => !x.hidden)?.dataset.ob;
  if (cur !== 'choose') { obAuto = false; return; }
  const s = await S.getSettings();
  if (s.hasKey || s.onboarded) { obAuto = false; closeOnboarding(); }
}
function friendlyKeyError(e) {
  const m = String(e || '');
  if (/rejected|invalid|401|403|API key not valid|permission/i.test(m)) return "That key didn't work. Copy it again (the whole key) and paste it here.";
  if (/credit|balance|billing|402/i.test(m)) return 'The key works, but the account has no credit yet. Add credit in Settings → Billing, then try again.';
  if (/reach|timed out|ENOTFOUND|ECONN/i.test(m)) return "I couldn't reach the internet. Check your connection and try again.";
  if (/location|region|country/i.test(m)) return "Google's free plan isn't available in your country. Try the Claude option instead.";
  return m;
}
// add-a-key in Settings can restart the guided setup too
// Start: signing in is required; after that, a key if there's none yet.
Promise.all([S.account(), S.getSettings()]).then(([a, s]) => {
  account = a;
  applyAccount(a.sync);
  if (!a.signedIn) openOnboarding('signin');
  else if (!s.hasKey && !s.onboarded) { openOnboarding('choose'); obAuto = true; }
  else if (!s.onboarded) S.setSettings({ onboarded: true });      // set up before this flag was saved: remember it (follows the account)
});

// ---------------- Settings → Buddy → Memory ----------------
async function loadMemory() {
  if (!S.memoryGet) return;
  const m = await S.memoryGet();
  $('#m-on').checked = !!m.on; $('#m-chats').checked = !!m.chats; $('#m-chats').disabled = !m.on;
  const sel = $('#m-sec'); sel.innerHTML = '';
  for (const [k, t] of m.sections) sel.append(new Option(t, k));
  const ICON = { about: '🙋', prefs: '💬', people: '👥', work: '🔧' };
  const box = $('#m-list'); box.innerHTML = '';
  let n = 0;
  for (const [k, title] of m.sections) {
    const facts = m.facts[k] || [];
    n += facts.length;
    const sec = el('div', 'm-sec');
    const h = el('div', 'm-h'); h.textContent = `${ICON[k] || '•'} ${title}`; const c = el('small'); c.textContent = facts.length || ''; h.append(c);
    sec.append(h);
    if (!facts.length) { const e = el('div', 'm-empty'); e.textContent = I18n.t('Nothing yet.'); sec.append(e); }
    for (const f of facts) {
      const row = el('div', 'm-row');
      const tx = el('span'); tx.textContent = f.text;
      const d = el('em'); d.textContent = f.date ? new Date(f.date + 'T12:00:00').toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short' }) : '';
      const x = el('button', 'm-x', '✕'); x.type = 'button'; x.title = I18n.t('Forget this');
      x.addEventListener('click', async () => { await S.memoryRemove(f.text); loadMemory(); });
      row.append(tx, d, x); sec.append(row);
    }
    box.append(sec);
  }
  $('#m-sum').textContent = n ? I18n.t('{0} things your buddy knows about you', n) : I18n.t('What your buddy knows about you');
}
if ($('#m-on')) {
  $('#m-on').addEventListener('change', async () => { await S.memorySet({ on: $('#m-on').checked }); loadMemory(); });
  $('#m-chats').addEventListener('change', async () => { await S.memorySet({ chats: $('#m-chats').checked }); });
  const addMem = async () => { const t = $('#m-text').value.trim(); if (!t) return; const r = await S.memoryAdd($('#m-sec').value, t); if (r && r.saved === false && r.note) toast(r.note); $('#m-text').value = ''; loadMemory(); };
  $('#m-add').addEventListener('click', addMem);
  $('#m-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMem(); } });
  $('#m-clear').addEventListener('click', async () => { if (!confirm(I18n.t('Forget everything your buddy knows about you? You can undo it right after.'))) return; await S.memoryClear(); loadMemory(); });
  S.onNotebookChanged(() => { if (currentTab === 'settings') loadMemory(); });
}

// ---------------- Tree: right-click (or "+ New") to add folders, sections, projects and tasks right there ----------------
function ctxMenu(x, y, items) {
  document.querySelector('.ctx-menu')?.remove();
  const m = el('div', 'ctx-menu');
  for (const it of items) {
    if (it === '-') { m.append(el('div', 'ctx-sep')); continue; }
    const b = el('button'); b.type = 'button'; b.textContent = it.label;
    b.addEventListener('click', () => { m.remove(); it.fn(); });
    m.append(b);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => { const off = (e) => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }; addEventListener('pointerdown', off, true); });
}
// a small form at the pointer: [{ key, label, type, value, options }] → values, or null when cancelled
function askForm(x, y, title, fields, okLabel) {
  return new Promise((resolve) => {
    document.querySelector('.ask-form')?.remove();
    const f = el('form', 'ask-form');
    const h = el('b'); h.textContent = title; f.append(h);
    const ins = {};
    for (const d of fields) {
      const l = el('label'); const s = el('span'); s.textContent = d.label; l.append(s);
      let i;
      if (d.options) { i = el('select'); for (const [v, t] of d.options) i.append(new Option(t, v)); }
      else { i = el('input'); i.type = d.type || 'text'; }
      if (d.value || !d.options) i.value = d.value || ''; ins[d.key] = i; l.append(i); f.append(l);
    }
    const row = el('div', 'ask-btns');
    const no = el('button', 'btn ghost'); no.type = 'button'; no.textContent = I18n.t('Cancel');
    const ok = el('button', 'btn'); ok.type = 'submit'; ok.textContent = okLabel || I18n.t('Add'); if (okLabel) ok.classList.add('btn-danger');
    row.append(no, ok); f.append(row);
    document.body.append(f);
    const r = f.getBoundingClientRect();
    f.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; f.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    const end = (v) => { f.remove(); resolve(v); };
    no.addEventListener('click', () => end(null));
    f.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(null); } });
    f.addEventListener('submit', (e) => { e.preventDefault(); const v = {}; for (const [k, i] of Object.entries(ins)) v[k] = i.value.trim(); if (!v[fields[0].key]) return; end(v); });
    ins[fields[0].key].focus();
  });
}
const plusDays = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString('en-CA'); };
async function newTaskAt(x, y, where) {
  const v = await askForm(x, y, where.project ? I18n.t('New task in {0}', where.project) : I18n.t('New task'), [
    { key: 'title', label: I18n.t('Task') },
    { key: 'start', label: I18n.t('Start'), type: 'date', value: plusDays(0) },
    { key: 'due', label: I18n.t('Due'), type: 'date', value: plusDays(7) },
    { key: 'priority', label: I18n.t('Priority'), value: 'medium', options: [['low', I18n.t('Low')], ['medium', I18n.t('Medium')], ['high', I18n.t('High')]] },
  ]);
  if (!v) return;
  const r = await S.addTaskManual({ ...v, project: where.project || null, area: where.area || null });
  if (r && r.ok === false) return toast(r.error);
  loadTasks();
}
async function newProjectAt(x, y, area, category) {
  const v = await askForm(x, y, I18n.t('New {0}', lv('project')), [{ key: 'name', label: I18n.t('Name') }]);
  if (!v) return;
  const r = await S.createProject(v.name, area || null, category || null);
  if (r && r.ok === false) return toast(r.error);
  loadTasks();
}
async function newFolderAt(x, y, parent, title) {
  const v = await askForm(x, y, title, [{ key: 'name', label: I18n.t('Name') }]);
  if (!v) return;
  const r = await S.mkdir(parent || '', v.name);
  if (r && r.ok === false) return toast(r.error);
  loadTasks();
}
function treeMenu(x, y, edit, nameEl) {
  const T = I18n.t, items = [];
  if (edit.kind === 'project') {
    items.push({ label: '➕ ' + T('New task here'), fn: () => newTaskAt(x, y, { project: edit.name, area: edit.area }) });
    if (edit.rel) items.push({ label: '📄 ' + T('Open the project page'), fn: () => { showTab('notebook'); setTimeout(() => openPage(edit.rel), 150); } });
    items.push('-', { label: '✎ ' + T('Rename'), fn: () => renameInline(nameEl, edit) });
    items.push({ label: '🗑 ' + T('Delete'), fn: () => removeAt(x, y, edit) });
  } else if (edit.kind === 'category') {
    items.push({ label: '◆ ' + T('New {0} here', lv('project')), fn: () => newProjectAt(x, y, edit.area, edit.name) });
    items.push('-', { label: '✎ ' + T('Rename'), fn: () => renameInline(nameEl, edit) });
    items.push({ label: '🗑 ' + T('Delete'), fn: () => removeAt(x, y, edit) });
  } else if (edit.kind === 'task') {
    items.push({ label: '✎ ' + T('Edit'), fn: () => edit.open() });
    items.push({ label: '✓ ' + T('Mark done'), fn: async () => { await updTask(edit.id, { status: 'done' }); loadTasks(); } });
    items.push('-', { label: '🗑 ' + T('Delete'), fn: () => removeAt(x, y, edit) });
  } else if (edit.kind === 'area') {
    items.push({ label: '🗂 ' + T('New {0} here', lv('category')), fn: () => newFolderAt(x, y, edit.area, T('New {0} in {1}', lv('category'), edit.name)) });
    items.push({ label: '◆ ' + T('New {0} here', lv('project')), fn: () => newProjectAt(x, y, edit.area, null) });
    items.push('-', { label: '📁 ' + T('New {0}', lv('area')), fn: () => newFolderAt(x, y, '', T('New {0}', lv('area'))) });
    items.push({ label: '✎ ' + T('Rename'), fn: () => renameInline(nameEl, edit) });
    items.push({ label: '🗑 ' + T('Delete'), fn: () => removeAt(x, y, edit) });
  } else {
    items.push({ label: '📁 ' + T('New {0}', lv('area')), fn: () => newFolderAt(x, y, '', T('New {0}', lv('area'))) });
    items.push({ label: '◆ ' + T('New {0}', lv('project')), fn: () => newProjectAt(x, y, null, null) });
    items.push({ label: '➕ ' + T('New task'), fn: () => newTaskAt(x, y, {}) });
  }
  ctxMenu(x, y, items);
}
// Delete from the tree. A task goes straight away (Undo is in the toast); a project or folder with tasks asks
// whether its tasks go too.
async function removeAt(x, y, edit) {
  const T = I18n.t;
  let what = { kind: edit.kind, id: edit.id, name: edit.name, area: edit.area || null, rel: edit.rel || null };
  if (edit.kind !== 'task') {
    const all = await S.tasks();
    const low = (v) => String(v || '').toLowerCase();
    const n = edit.kind === 'project' ? all.filter((t) => low(t.project) === low(edit.name) && (t.area || null) === (edit.area || null)).length
      : edit.kind === 'area' ? all.filter((t) => (t.area || null) === edit.area).length
      : all.filter((t) => (t.area || null) === (edit.area || null) && t.project && (edit.projects || []).includes(low(t.project))).length;
    const fields = n
      ? [{ key: 'tasks', label: T('Its {0} task(s)', n), options: [['keep', edit.kind === 'project' ? T('Keep them as loose tasks') : edit.kind === 'area' ? T('Keep them (move to General)') : T('Keep them')], ['delete', T('Delete them too')]] }]
      : [{ key: 'tasks', label: T('Nothing else is inside.'), options: [['keep', T('Delete it')]] }];
    const v = await askForm(x, y, T('Delete {0}?', edit.name), fields, T('Delete'));
    if (!v) return;
    what.tasks = v.tasks;
  }
  const r = await S.treeRemove(what);
  if (!r || !r.ok) { toast(r && r.error || T('Couldn\'t delete that.')); return; }
  loadTasks();
  if (edit.kind !== 'task') loadTree && loadTree();
}
// right-click on empty space in the tree, and a "+ New" button for touch screens
$('#task-list').addEventListener('contextmenu', (e) => { if (e.target.closest('.trow')) return; e.preventDefault(); treeMenu(e.clientX, e.clientY, { kind: 'general' }); });
if ($('#task-new')) $('#task-new').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); treeMenu(r.left, r.bottom + 4, { kind: 'general' }); });
