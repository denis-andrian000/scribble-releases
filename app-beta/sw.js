// Scribble on the web: keeps the app's files on the device so it opens instantly, also offline.
// Only the app's own files are cached; Google, Drive and the AI services are never touched here.
const VERSION = '1.26.3-b38902fc';
const CACHE = 'scribble-' + VERSION;
const FILES = ["./","avatar.js","buddy-bridge.js","buddy-life.js","buddy.js","chars.js","engine.js","i18n-id.js","i18n.js","icon-180.png","icon-192.png","icon-32.png","icon-512.png","icon-maskable.png","index.html","keyboard.js","manifest.webmanifest","markdown.js","meeting.js","mobile.css","money-view.js","page-buddy.html","panel.css","panel.js","planner.js","pwa.js","reconnect.js","rig.js","sounds.js","theme.js","timeline.js","today.css","today.js","voice.js","wins.js","brand/omniz.png","brand/omniz-dark.png"];
self.addEventListener('install', (e) => {
  // straight from the website, never the browser's own short-lived copy, so a new version is never mixed with the old one
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('scribble-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'activate') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
