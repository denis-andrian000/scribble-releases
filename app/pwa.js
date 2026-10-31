// Scribble on the web: works offline and installs to the home screen (service worker), and offers a reload
// when a new version has been downloaded in the background.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;     // first install: nothing to replace
      const d = document.createElement('div');
      d.className = 'upd-banner';
      const T = (s) => (window.I18n ? I18n.t(s) : s);
      d.innerHTML = `<span>${T('A new version of Scribble is ready.')}</span><button type="button" class="btn">${T('Reload')}</button>`;
      d.querySelector('button').addEventListener('click', () => { w.postMessage('activate'); });
      document.body.append(d);
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
})();
