// Verth service worker: makes Verth installable and gives a friendly offline page.
// It never caches account data; only the app shell is stored.
const CACHE = 'verth-shell-v9';
const SHELL = ['app.html', 'assets/verth.css', 'assets/fonts.css', 'assets/app.js', 'assets/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so updates always arrive; fall back to the cached shell only when offline.
// "Share → Verth" from WhatsApp, Gallery or Messages. A shared picture is kept in a private cache
// for the app to pick up; shared text goes into the address, as before. Nothing is uploaded.
async function receiveShare(req) {
  const form = await req.formData();
  const q = new URLSearchParams();
  for (const k of ['share_title', 'share_text', 'share_url']) { const v = form.get(k); if (typeof v === 'string' && v) q.set(k, v.slice(0, 4000)); }
  const file = form.get('share_image');
  if (file && typeof file !== 'string' && file.size && /^image\//.test(file.type) && file.size < 15 * 1024 * 1024) {
    const c = await caches.open('verth-share');
    await c.put('shared-image', new Response(file, { headers: { 'content-type': file.type } }));
    q.set('shared_image', '1');
  }
  return Response.redirect('app.html' + (q.toString() ? '?' + q : '') + '#scan', 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).searchParams.has('share-target')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (SHELL.some((p) => req.url.endsWith(p)) || req.url.includes('/assets/fonts/'))) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('app.html')))
  );
});
