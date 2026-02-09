// HoldPoint Service Worker v2.0
const CACHE_NAME = 'holdpoint-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js?v=2',
  './js/app.js?v=2',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.json'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing HoldPoint service worker');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for Supabase, Google Sheets, and other API calls
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for app assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached version, but also fetch updated version in background
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        return cached;
      }
      // Not in cache, fetch from network
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
