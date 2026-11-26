/* Простой офлайн-кэш статики (PWA-lite). */
const CACHE = 'domostroy-v1';
const ASSETS = [
  'index.html',
  'auth.html',
  'styles.css',
  'manifest.webmanifest',
  'js/config.js',
  'js/supabase.js',
  'js/app.js',
  'js/auth.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
