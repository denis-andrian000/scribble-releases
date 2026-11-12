// Meeting mode: your buddy listens (or you type), then turns it into a meeting page with a summary, decisions and
// action items, and offers your action items as tasks.
// Listening: Chrome and Android use their own free speech recognition; the desktop app records in chunks and uses
// OpenRouter's transcription with the key from Settings → Buddy → Voice. Typing your own notes always works.
(function () {
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });   // the bridge may arrive after this file loads
  const T = (s, ...a) => (window.I18n ? I18n.t(s, ...a) : s);
  const $ = (s) => document.querySelector(s);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const NATIVE = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.ScribbleSpeech;
  const BROWSER_SR = SR && !/Electron|; wv\)/.test(navigator.userAgent);
  const lang = () => ((window.I18n && I18n.lang && I18n.lang()) === 'id' ? 'id-ID' : (navigator.language || 'en-US'));

  let ov = null, on = false, paused = false, started = 0, tick = null, engine = null;

  function open() {
    if (ov) return;
    ov = document.createElement('div'); ov.className = 'meet-ov';
    ov.innerHTML = `<div class="meet">
      <div class="meet-head"><b></b><span class="meet-time">0:00</span><span class="meet-dot"></span></div>
      <input class="meet-title" autocomplete="off">
      <textarea class="meet-text"></textarea>
      <small class="meet-hint"></small>
      <div class="meet-btns"><button type="button" class="btn ghost" data-a="cancel"></button><span style="flex:1"></span><button type="button" class="btn ghost" data-a="pause"></button><button type="button" class="btn" data-a="done"></button></div>
    </div>`;
    document.body.append(ov);
    ov.querySelector('.meet-head b').textContent = T('Meeting notes');
    ov.querySelector('.meet-title').placeholder = T('What is the meeting about? (optional)');
    ov.querySelector('.meet-text').placeholder = T('Listening… You can also type notes here.');
    ov.querySelector('[data-a=cancel]').textContent = T('Cancel');
    ov.querySelector('[data-a=done]').textContent = T('Finish: make notes');
    ov.querySelector('[data-a=pause]').textContent = T('Pause');
    ov.addEventListener('click', onClick);
    started = Date.now(); paused = false; on = true;
    tick = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); ov && (ov.querySelector('.meet-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); }, 1000);
    listen();
  }
  function close() { on = false; stopEngine(); clearInterval(tick); ov && ov.remove(); ov = null; }
  const box = () => ov && ov.querySelector('.meet-text');
  const hint = (s) => { if (ov) ov.querySelector('.meet-hint').textContent = s; };
  const add = (s) => { const b = box(); if (!b || !s) return; b.value = (b.value ? b.value.replace(/\s+$/, '') + ' ' : '') + s.trim(); b.scrollTop = b.scrollHeight; };

  async function onClick(e) {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'cancel') { if (!box().value.trim() || confirm(T('Throw away these meeting notes?'))) close(); return; }
    if (a.dataset.a === 'pause') {
      paused = !paused; a.textContent = paused ? T('Resume') : T('Pause'); ov.classList.toggle('paused', paused);
      if (paused) stopEngine(); else listen();
      return;
    }
    if (a.dataset.a === 'done') {
      a.disabled = true; hint(T('Finishing…'));
      paused = true; stopEngine();
      await new Promise((r) => setTimeout(r, 300));
      if (engine === 'rec') await Promise.race([lastJob, new Promise((r) => setTimeout(r, 25000))]);
      const text = box().value.trim(), title = ov.querySelector('.meet-title').value.trim();
      const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
      close();
      if (!text) return;
      const prompt = `These are my notes from a meeting${title ? ` about "${title}"` : ''} today (about ${mins} min${engine && engine !== 'type' ? ', transcribed from speech, so expect some wrong words' : ''}):\n\n"""\n${text.slice(0, 30000)}\n"""\n\nWrite a meeting page "Meetings/${new Date().toLocaleDateString('en-CA')} ${title || 'Meeting'}.md" with: a short summary, the decisions, and action items (who, what, by when). Save it with write_page. Then list MY action items and offer to add them as tasks with due dates; ask before adding anyone else's. Write it in the language the meeting was in.`;
      if (window.send) window.send(prompt, `🎙 ${T('Meeting notes')}${title ? `: ${title}` : ''} (${mins} min)`);
    }
  }

  // ---- listening engines
  let rec = null, stream = null, chunkTimer = null, nativeSub = null, lastJob = Promise.resolve();
  function stopEngine() {
    try { if (rec && rec.stop) rec.stop(); } catch {}
    clearTimeout(chunkTimer);
    if (NATIVE) try { NATIVE.stop(); } catch {}
    if (nativeSub) { try { nativeSub.remove(); } catch {} nativeSub = null; }
    if (ov) ov.classList.remove('rec');
  }
  async function listen() {
    if (!on || paused) return;
    ov.classList.add('rec');
    if (NATIVE) { engine = 'android'; hint(T('Listening with your phone. Keep Scribble open during the meeting.')); return nativeLoop(); }
    if (BROWSER_SR) { engine = 'browser'; hint(T('Listening. Words appear as people talk.')); return browserLoop(); }
    let cfg = null; try { cfg = await S.voiceGet(); } catch {}
    if (!cfg || !cfg.hasKey || !navigator.mediaDevices) { engine = 'type'; ov.classList.remove('rec'); hint(T('To listen here, turn on Voice in Settings and add your OpenRouter key. You can still type your notes.')); return; }
    engine = 'rec'; hint(T('Listening. Text appears every minute or so.'));
    recorderLoop();
  }
  function browserLoop() {
    rec = new SR(); rec.lang = lang(); rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add(e.results[i][0].transcript); };
    rec.onerror = (e) => { if (e.error === 'not-allowed') { hint(T('Allow the microphone to talk to your buddy.')); on && (paused = true); } };
    rec.onend = () => { if (on && !paused) setTimeout(browserLoop, 200); };
    try { rec.start(); } catch {}
  }
  async function nativeLoop() {
    if (!nativeSub) nativeSub = await NATIVE.addListener('partial', (e) => hint('… ' + e.text));
    while (on && !paused) {
      try { const r = await NATIVE.start({ lang: lang() }); if (r && r.text) add(r.text); }
      catch (e) { if (/not-allowed/.test(String(e && e.message || e))) { hint(T('Allow the microphone to talk to your buddy.')); return; } }
    }
  }
  async function recorderLoop() {
    try { stream = stream || await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { hint(T('Allow the microphone to talk to your buddy.')); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
    const chunk = () => {
      if (!on || paused) { stream && stream.getTracks().forEach((t) => t.stop()); stream = null; return; }
      const parts = [];
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      rec.onstop = () => { lastJob = lastJob.then(() => piece()).catch(() => {}); };
      const piece = async () => {
        if (on && !paused) chunk();                       // keep listening while this piece is turned into text
        else { stream && stream.getTracks().forEach((t) => t.stop()); stream = null; }
        if (!parts.length) return;
        const blob = new Blob(parts, { type: type || 'audio/webm' });
        if (blob.size < 4000) return;
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
        const r = await S.voiceTranscribe(b64, /ogg/.test(type) ? 'ogg' : 'webm', lang().slice(0, 2));
        if (r && r.ok && r.text) add(r.text);
        else if (r && r.error) hint('⚠ ' + r.error);
      };
      rec.start();
      chunkTimer = setTimeout(() => { try { rec.state !== 'inactive' && rec.stop(); } catch {} }, 60000);
    };
    chunk();
  }

  window.Meeting = { open };
})();
