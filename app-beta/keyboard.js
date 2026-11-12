// Touch keyboards (Android, phones): Enter makes a new line and the ➜ button sends, like WhatsApp.
// (With a real keyboard the panel's own Enter handler sends, and Shift+Enter makes a new line.)
// Tapping Send keeps the keyboard open, so the layout doesn't jump away from under your finger.
(function () {
  const input = document.querySelector('#input');
  if (!input) return;
  input.setAttribute('enterkeyhint', 'enter');
  const send = document.querySelector('#send');
  if (send) send.addEventListener('pointerdown', (e) => { if (document.activeElement === input) e.preventDefault(); });
})();
