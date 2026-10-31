// Touch keyboards (Android): the keyboard's Enter key sends, like Enter on a computer. Android keyboards
// often deliver Enter as "insert a new line" rather than a key press, so the panel's Enter handler never sees it.
// Shift+Enter (hardware keyboard) still adds a new line. Tapping Send keeps the keyboard open, so the
// layout doesn't jump away from under your finger.
(function () {
  const input = document.querySelector('#input');
  const form = document.querySelector('#composer');
  if (!input || !form) return;
  input.setAttribute('enterkeyhint', 'send');
  let shift = false;
  input.addEventListener('keydown', (e) => { shift = e.shiftKey; });
  input.addEventListener('keyup', () => { shift = false; });
  input.addEventListener('beforeinput', (e) => {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !shift) {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
  const send = document.querySelector('#send');
  if (send) send.addEventListener('pointerdown', (e) => { if (document.activeElement === input) e.preventDefault(); });
})();
