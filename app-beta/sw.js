// Scribble on the web: keeps the app's files on the device so it opens instantly, also offline.
// Only the app's own files are cached; Google, Drive and the AI services are never touched here.
const VERSION = '1.3.0-c64585f0';
const CACHE = 'scribble-' + VERSION;
const FILES = ["./","avatar.js","engine.js","i18n-id.js","i18n.js","icon-180.png","icon-192.png","icon-32.png","icon-512.png","icon-maskable.png","index.html","keyboard.js","manifest.webmanifest","markdown.js","mobile.css","panel.css","panel.js","pwa.js","reconnect.js","theme.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
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
