// ALQAMI's service worker: keeps the app working in a hall with no signal.
//
// - The app's own files: from the cache when present (built files have hashed names, so a cached copy is never stale);
//   pages and the nightly data (recognition index, marker list) try the network first and fall back to the cache.
// - Moon records and searches: network first, the last answer kept for offline use.
// - Moon covers and the recognition model (Hugging Face): kept once downloaded.
// "Save for offline" in the app fills the same caches ahead of a visit (src/offline/saveOffline.ts).
const VERSION = 'v1';
const APP = `alqami-app-${VERSION}`;
const MOON = `alqami-moon-${VERSION}`;
const KEEP = new Set([APP, MOON]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('alqami-') && !KEEP.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

const scope = new URL(self.registration.scope);

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    const path = url.pathname.slice(scope.pathname.length);
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, APP).catch(() => caches.match(new URL('./', scope).href)));
    } else if (path.startsWith('data/') || path === 'nft/index.json' || path === 'offline-manifest.json' || path === 'sw.js') {
      event.respondWith(networkFirst(request, APP));
    } else if (/^(assets|models|draco|images|icons|nft|js)\//.test(path)) {
      event.respondWith(cacheFirst(request, APP));
    }
    return;
  }

  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.includes('/storage/v1/object/public/covers/')) event.respondWith(cacheFirst(request, MOON));
    else if (url.pathname.includes('/functions/v1/')) event.respondWith(networkFirst(request, MOON));
    return;
  }

  if (url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co') || url.hostname.endsWith('huggingface.co')) {
    event.respondWith(cacheFirst(request, APP));
  }
});
