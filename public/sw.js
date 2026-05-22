/**
 * LifeSync Service Worker
 * Cache-first for static assets, network-first for API calls.
 * Enables offline splash screen and fast repeat loads.
 */

const CACHE_NAME = 'lifesync-v1';
const OFFLINE_URL = '/offline';

// Static assets to precache
const PRECACHE_URLS = [
  '/',
  '/home',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
];

// Install: precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Don't fail install if some URLs don't exist
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls (/api/*): network-first, fallback to cache
// - Everything else: cache-first, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and browser-extension requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/')) {
    // Next.js static chunks: cache-first
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API: always try network, fallback to cache
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Pages: stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // If offline and no cache, show offline page
        return caches.match(OFFLINE_URL) || new Response('Offline', { status: 503 });
      });
      return cached || networkFetch;
    })
  );
});

// Background sync: queue failed sends when offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  // Future: sync messages queued while offline
  return Promise.resolve();
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'LifeSync', {
        body:    data.body || 'New message',
        icon:    '/icons/icon-192x192.svg',
        badge:   '/icons/icon-96x96.svg',
        tag:     data.tag || 'lifesync-notification',
        data:    data.data || {},
        actions: data.actions || [],
      })
    );
  } catch {}
});

// Notification click: open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existingClient = clientList.find(c => c.url.includes(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        existingClient.navigate(url);
      } else {
        clients.openWindow(url);
      }
    })
  );
});
