// Voice: the buddy says its replies out loud (OpenRouter voice models, English only for now), and its settings.
// The audio is made in the main process with the user's own key; this file plays it, a little higher for a
// cuter, smaller voice, and tells the buddy to move its mouth while it talks.
(function () {
  const $ = (s) => document.querySelector(s);
  const S = new Proxy({}, { get: (_, k) => window.scribble[k] });
  const t = (s) => (window.I18n ? I18n.t(s) : s);
  let cfg = { on: false, cute: 1.25 }, audio = null, lastClip = null;

  const ID_WORDS = /\b(aku|kamu|udah|sudah|aman|hari|ini|itu|yang|dan|ada|lagi|kok|ya|nggak|gak|tidak|saya|sisa|ribu|juta|tagihan|tugas|pagi|siang|malam|makan|pake|pakai|dong|deh|banget|untuk|dengan|dari|catat|kecatet|bisa|mau|sama|aja|juga|belum)\b/gi;
  const isEnglish = (s) => { const w = s.split(/\s+/).length; return ((s.match(ID_WORDS) || []).length / Math.max(1, w)) < 0.1; };
  // what a person would actually say: no markdown, links, choice lines or emoji
  function speakable(text) {
    return String(text || '')
      .replace(/\n?\s*\[\[[^\]]*\]\]\s*$/, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_`#>|~]+/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.')
      .trim();
  }
  function play(clip) {
    stop();
    const bytes = Uint8Array.from(atob(clip.b64), (c) => c.charCodeAt(0));
    let blob;
    if (/pcm/.test(clip.mime)) blob = wav(bytes, 24000); else blob = new Blob([bytes], { type: clip.mime });
    audio = new Audio(URL.createObjectURL(blob));
    audio.preservesPitch = false; audio.webkitPreservesPitch = false;
    audio.playbackRate = cfg.cute || 1.25;
    audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) S.voiceTalking(Math.round(audio.duration / audio.playbackRate * 1000)); });
    audio.addEventListener('ended', () => S.voiceTalking(0));
    audio.play().catch(() => {});
  }
  function stop() { if (audio) { audio.pause(); audio = null; S.voiceTalking(0); } }
  function wav(pcm, rate) {
    const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
    h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
    return new Blob([h, pcm], { type: 'audio/wav' });
  }

  // called with every new reply
  async function say(text) {
    if (!cfg.on || !cfg.hasKey) return;
    const line = speakable(text);
    if (!line || !isEnglish(line)) return;
    const r = await S.voiceSpeak(line);
    if (r && r.ok) play(r);
  }

  // ---- settings
  async function load() {
    try { cfg = await S.voiceGet(); } catch { return; }
    $('#v-on').checked = cfg.on;
    $('#v-box').hidden = !cfg.on;
    $('#v-more').hidden = !cfg.hasKey;
    $('#v-key').value = '';
    $('#v-key').placeholder = cfg.hasKey ? '•••••••• ' + t('(saved)') : 'sk-or-…';
    $('#v-cute').value = cfg.cute; $('#v-cute-val').textContent = Number(cfg.cute).toFixed(2);
    keptNote();
    if (cfg.hasKey && !$('#v-model').options.length) models();
  }
  function keptNote() {
    $('#v-forget').hidden = !cfg.kept;
    $('#v-kept-note').textContent = cfg.kept ? `${t('Keeping this voice for')} ${cfg.buddy}.` : t('Play samples until you like one, then keep it, so your buddy always sounds the same.');
  }
  async function models() {
    const list = await S.voiceModels(), sel = $('#v-model');
    sel.textContent = '';
    list.sort((a, b) => (b.free - a.free) || a.name.localeCompare(b.name));
    for (const m of list) sel.append(new Option(m.name + (m.free ? ' · ' + t('free') : ''), m.id));
    if (![...sel.options].some((o) => o.value === cfg.model)) sel.append(new Option(cfg.model, cfg.model));
    sel.value = cfg.model;
  }
  function status(msg, ok) { const e = $('#v-status'); e.textContent = msg; e.className = 'v-status' + (ok === true ? ' ok' : ok === false ? ' bad' : ''); }

  $('#v-on').addEventListener('change', async (e) => { await S.voiceSet({ on: e.target.checked }); if (!e.target.checked) stop(); load(); });
  $('#v-test').addEventListener('click', async () => {
    const key = $('#v-key').value.trim();
    status(t('Testing…'));
    const r = await S.voiceTest(key);
    if (!r.ok) return status(r.error || t('That did not work.'), false);
    if (key) await S.voiceSet({ key });
    status(t('Connected. You should hear your buddy now.'), true);
    lastClip = { ...r, text: `Hi! I'm ${cfg.buddy}. Can you hear me?` };
    await load(); play(r); $('#v-keep').disabled = false;
  });
  $('#v-model').addEventListener('change', async (e) => { await S.voiceSet({ model: e.target.value }); cfg.model = e.target.value; });
  $('#v-cute').addEventListener('input', (e) => { cfg.cute = Number(e.target.value); $('#v-cute-val').textContent = cfg.cute.toFixed(2); if (audio) audio.playbackRate = cfg.cute; });
  $('#v-cute').addEventListener('change', (e) => S.voiceSet({ cute: e.target.value }));
  $('#v-try').addEventListener('click', async () => {
    const text = `Hi, it's ${cfg.buddy}! I saved your note and added the task for Friday. Anything else?`;
    status(t('Making a sample…'));
    const r = await S.voiceSpeak(text);
    if (!r.ok) return status(r.error, false);
    status('');
    lastClip = { ...r, text }; play(r); $('#v-keep').disabled = false;
  });
  $('#v-keep').addEventListener('click', async () => { if (!lastClip) return; await S.voiceKeep(lastClip); $('#v-keep').disabled = true; await load(); status(t('Kept.'), true); });
  $('#v-forget').addEventListener('click', async () => { await S.voiceKeep(null); await load(); });

  // ---- mic button: talk instead of typing. The browser's own speech recognition when it has one (Chrome),
  // otherwise record and let OpenRouter's transcription turn it into text. The words land in the box to check first.
  const mic = $('#btn-mic'), input = $('#input');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const nativeSR = SR && !/Electron|; wv\)/.test(navigator.userAgent);
  let rec = null, chunks = [], stream = null, before = '';
  const setInput = (v) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const lang = () => ((window.I18n && I18n.lang && I18n.lang()) === 'id' ? 'id-ID' : (navigator.language || 'en-US'));
  function micOff() { mic.classList.remove('rec', 'busy'); mic.title = t('Talk instead of typing'); }
  mic.addEventListener('click', async () => {
    stop();
    if (rec) { rec.stop(); return; }
    before = input.value ? input.value.trimEnd() + ' ' : '';
    const NS = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.ScribbleSpeech;
    if (NS) {
      // Android: the phone's own speech recognition (free, no key)
      const sub = await NS.addListener('partial', (e) => setInput(before + e.text));
      rec = { stop: () => NS.stop() };
      mic.classList.add('rec'); mic.title = t('Listening… click to stop');
      try { const r = await NS.start({ lang: lang() }); if (r.text) setInput(before + r.text); }
      catch (e) {
        const m = String((e && e.message) || e);
        if (/not-allowed/.test(m)) window.toast && toast(t('Allow the microphone to talk to your buddy.'));
        else if (/no-speech/.test(m)) window.toast && toast(t("I didn't catch that. Try again?"));
        else if (/unavailable/.test(m)) window.toast && toast(t('This phone has no speech recognition. Install or turn on Google voice typing.'));
      }
      sub.remove(); rec = null; micOff(); input.focus();
      return;
    }
    if (nativeSR) {
      rec = new SR(); rec.lang = lang(); rec.interimResults = true; rec.continuous = false;
      rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; setInput(before + s); };
      rec.onerror = (e) => { if (e.error === 'not-allowed') window.toast && toast(t('Allow the microphone to talk to your buddy.')); };
      rec.onend = () => { rec = null; micOff(); input.focus(); };
      rec.start(); mic.classList.add('rec'); mic.title = t('Listening… click to stop');
      return;
    }
    if (!(await S.sttReady())) { window.toast && toast(t('To talk here, add a free Groq or Gemini key in Settings → App → AI.')); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { window.toast && toast(t('Allow the microphone to talk to your buddy.')); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((x) => x.stop()); rec = null;
      mic.classList.remove('rec'); mic.classList.add('busy'); mic.title = t('Turning it into text…');
      const blob = new Blob(chunks, { type: type || 'audio/webm' });
      let b64 = null, fmt = 'wav';
      try { b64 = await toWav16k(blob); } catch { fmt = /mp4/.test(type) ? 'mp4' : /ogg/.test(type) ? 'ogg' : 'webm'; b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); }
      const r = await S.voiceTranscribe(b64, fmt);
      micOff();
      if (r.ok && r.text) { setInput(before + r.text); input.focus(); }
      else window.toast && toast(r.error === 'nokey' ? t('To talk here, add a free Groq or Gemini key in Settings → App → AI.') : (r.error || t("I didn't catch that. Try again?")));
    };
    rec.start(); mic.classList.add('rec'); mic.title = t('Listening… click to stop');
  });


  // recordings → 16 kHz mono WAV: every speech-to-text service takes it (Gemini doesn't take WebM), and it's small enough
  async function toWav16k(blob) {
    const buf = await blob.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    let audio; try { audio = await ac.decodeAudioData(buf); } finally { try { ac.close(); } catch {} }
    const rate = 16000, len = Math.max(1, Math.ceil(audio.duration * rate));
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const w = (o, str) => [...str].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    const bytes = new Uint8Array(out.buffer); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  window.toWav16k = toWav16k;
  window.Voice = { say, stop, load };
  load();
})();
