// Disabled PostCooked Image Service Worker
// This service worker has been disabled due to conflicts with frontend optimization
// The frontend now uses OptimizedImage.tsx component with Canvas API compression

console.log('[SW] PostCooked Image Service Worker is disabled');

// Simply install and activate without interfering
self.addEventListener('install', (event) => {
  console.log('[SW] Installing disabled image service worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating disabled image service worker');
  event.waitUntil(
    // Clean up any old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.includes('postcooked-images')) {
            console.log('[SW] Cleaning up old image cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Don't intercept any fetch requests - let the frontend handle everything
self.addEventListener('fetch', (event) => {
  // Do nothing - let all requests pass through normally
  return;
});
