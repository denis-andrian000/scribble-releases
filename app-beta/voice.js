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

  window.Voice = { say, stop, load };
  load();
})();
