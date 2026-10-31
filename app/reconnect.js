// Scribble on the web: when Google's hour-long access runs out, ask for one tap to continue syncing.
(function () {
  const G = globalThis.__scribbleNative && globalThis.__scribbleNative.google;
  if (!G || !G.reconnect) return;
  const t = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s.replace(/\{(\d)\}/g, (_, i) => a[i]));
  let shown = null;
  function show(email) {
    if (shown || !email) return;
    shown = document.createElement('div');
    shown.className = 'reconnect';
    shown.innerHTML = `<span>${t('Keep syncing with Google Drive')}</span><button type="button" class="btn">${t('Continue as {0}', email)}</button>`;
    shown.querySelector('button').addEventListener('click', async () => {
      try {
        await G.reconnect(email);
        shown.remove(); shown = null;
        if (window.scribble && window.scribble.syncNow) window.scribble.syncNow();
      } catch (e) {
        const s = shown && shown.querySelector('span');
        if (s) s.textContent = e && e.message ? e.message : t('Google sign-in failed.');
      }
    });
    document.body.append(shown);
  }
  window.addEventListener('scribble:reconnect', (e) => show(e.detail && e.detail.email));
  window.addEventListener('scribble:reconnected', () => { if (shown) { shown.remove(); shown = null; } });
})();
