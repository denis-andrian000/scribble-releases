// Light/dark on Android: the panel's styles switch with "prefers-color-scheme", which follows the phone's
// setting and can't be changed by the app. So the app's choice is applied by turning those dark-mode
// style blocks on or off directly (they stay recognisable, so switching back and forth works).
(function () {
  const S = window.scribble;
  if (!S || !S.getTheme) return;
  const ON = '(prefers-color-scheme: dark), (min-width: 0px)';
  const OFF = '(prefers-color-scheme: dark) and (max-width: 0px)';
  function walk(rules, dark) {
    for (const r of rules) {
      if (typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule && /prefers-color-scheme:\s*dark/.test(r.media.mediaText)) {
        const want = dark ? ON : OFF;
        if (r.media.mediaText !== want) r.media.mediaText = want;
      }
      if (r.cssRules) walk(r.cssRules, dark);
    }
  }
  function apply(t) {
    const dark = !!(t && t.dark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (rules) walk(rules, dark);
    }
  }
  S.getTheme().then(apply);
  S.onTheme(apply);
  window.__applyTheme = apply;
})();
