// Minimal service worker for offline shell
// Bump cache version when updating UI/app.js so browsers don't keep stale code.
const CACHE = 'onecoffee-glb-v2';
const ASSETS = [
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Always go to network for navigations / index.html to avoid "black screen"
  // caused by stale cached HTML.
  try {
    const isIndex =
      req.url.includes('/index.html') ||
      req.url.endsWith('/index.html') ||
      req.url.endsWith('/index.html?v=');
    if (req.mode === 'navigate' || isIndex) {
      event.respondWith(fetch(req));
      return;
    }
  } catch {
    // If anything fails, fall back to normal cache behavior below.
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
