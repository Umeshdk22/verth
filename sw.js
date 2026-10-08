// Verth service worker: makes Verth installable and gives a friendly offline page.
// It never caches account data; only the app shell is stored.
const CACHE = 'verth-shell-9b4626c6e3';
const SHELL = ['app.html', './', 'assets/verth.css?v=a3f9cc189a', 'assets/fonts.css?v=21274b4724', 'assets/app.js?v=75ec4aab52', 'assets/helper.js?v=5d2a327281', 'assets/site.js?v=b8456c3e5b', 'assets/splash.js?v=ca761127ff', 'assets/icon-192.png'];

self.addEventListener('install', (e) => {
  // 'reload' skips the browser's own short-term cache, so the saved copies are really the new ones.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
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

// Pages: network first (so updates arrive), falling back to the saved copy when offline or slow.
// Stamped files (assets/app.js?v=…): their address changes whenever they change, so a saved copy is
// always the right one: answered instantly. Other files under assets/ (pictures, fonts): network
// first, falling back to the saved copy offline.
const fromNetwork = (req) => fetch(req).then((res) => {
  if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).searchParams.has('share-target')) { e.respondWith(receiveShare(req)); return; }
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || req.headers.has('range')) return;
  if (url.pathname.includes('/assets/videos/')) return;
  if (url.pathname.includes('/assets/')) {
    if (url.searchParams.has('v')) e.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req)));
    else e.respondWith(fromNetwork(req).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(
    Promise.race([fromNetwork(req), new Promise((r) => setTimeout(r, 3500))])
      .then((res) => res || caches.match(req, { ignoreSearch: true }).then((hit) => hit || fromNetwork(req)))
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('app.html')))
  );
});
