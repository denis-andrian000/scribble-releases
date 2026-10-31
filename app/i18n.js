// App language (English / Bahasa Indonesia). English text is the key; missing translations stay English.
// Used by the main process (require) and the windows (window.I18n). In the panel, a watcher translates
// app text as it appears, so code can keep writing English. The user's own notes and the AI's replies
// are never translated.
(function (root) {
  const DICT = { id: (typeof require === 'function' ? require('./i18n-id.json') : root.__I18N_ID__) || {} };
  let lang = 'en';
  let exact = new Map(), patterns = [];

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function build() {
    exact = new Map(); patterns = [];
    const d = DICT[lang] || {};
    for (const [k, v] of Object.entries(d)) {
      if (/\{#?\d+\}/.test(k)) {
        const order = [];
        // {0} matches any text, {#0} only a number (so "{#0} tasks" never matches "Create project")
        const re = new RegExp('^' + esc(norm(k)).replace(/\\\{(#?)(\d+)\\\}/g, (_, num, n) => { order.push(Number(n)); return num ? '(\\d[\\d.,]*[kKM]?)' : '([\\s\\S]+?)'; }) + '$');
        const lit = norm(k).replace(/\{#?\d+\}/g, '');
        patterns.push({ re, order, to: v.replace(/\{#(\d+)\}/g, '{$1}'), score: lit.length + (/^\{#?\d+\}/.test(norm(k)) ? 0 : 6) });
        exact.set(norm(k).replace(/\{#(\d+)\}/g, '{$1}'), v.replace(/\{#(\d+)\}/g, '{$1}'));     // for t('{0} tasks', n)
      } else exact.set(norm(k), v);
    }
    patterns.sort((a, b) => b.score - a.score);      // most specific first: more fixed words, and fixed words at the start
  }

  // Translation of an English string, or null if there is none.
  function translate(s, depth = 0) {
    if (lang === 'en' || s == null || depth > 3) return null;
    const k = norm(s);
    if (!k) return null;
    if (exact.has(k)) return exact.get(k);
    for (const p of patterns) {
      const m = k.match(p.re);
      if (!m) continue;
      const vals = {};
      p.order.forEach((n, i) => { const g = m[i + 1]; vals[n] = translate(g, depth + 1) ?? g; });
      return p.to.replace(/\{(\d+)\}/g, (_, n) => vals[n] ?? '');
    }
    return null;
  }

  // t('Synced {0}', '2 min ago') — fills {0}, {1}… after translating
  function t(s, ...args) {
    const out = translate(s) ?? s;
    return args.length ? out.replace(/\{(\d+)\}/g, (_, n) => (args[n] ?? '')) : out;
  }

  function setLang(l) { lang = l === 'id' ? 'id' : 'en'; build(); }
  const locale = () => (lang === 'id' ? 'id-ID' : 'en-GB');

  // ---------------------------------------------------------------- live translation of a window
  // skip: CSS selector for user content that must stay as written
  function watch(doc, skip) {
    if (lang === 'en' || !doc) return;
    const seen = new WeakMap();             // text node -> the translated value we last wrote
    const ATTRS = ['placeholder', 'title', 'aria-label'];
    const skipped = (el) => !el || (skip && el.closest && el.closest(skip));
    const doText = (n) => {
      if (seen.get(n) === n.nodeValue) return;
      const p = n.parentElement;
      if (!p || skipped(p) || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return;
      const v = n.nodeValue;
      if (!/[A-Za-z]{2}/.test(v)) return;
      const tr = translate(v);
      if (tr == null) return;
      const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      const nv = lead + tr + trail;
      seen.set(n, nv);
      if (nv !== v) n.nodeValue = nv;
    };
    const doAttrs = (el) => {
      if (skipped(el)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute && el.getAttribute(a);
        const dk = `i18n${a.replace('-', '')}`;
        if (!v || !el.dataset || el.dataset[dk] === v) continue;
        const tr = translate(v);
        if (tr != null) { el.dataset[dk] = tr; el.setAttribute(a, tr); }
      }
    };
    const walk = (node) => {
      if (node.nodeType === 3) { doText(node); return; }
      if (node.nodeType !== 1) return;
      if (skipped(node)) return;
      doAttrs(node);
      const tw = doc.createTreeWalker(node, 1 | 4);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === 3) doText(n);
        else if (skipped(n)) { /* children of skipped areas are left alone */ } else doAttrs(n);
      }
    };
    walk(doc.body);
    new (root.MutationObserver)((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
    }).observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  build();
  const api = { t, translate, setLang, lang: () => lang, locale, watch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18n = api;
})(typeof window !== 'undefined' ? window : globalThis);
