const CACHE_NAME = 'sentient-marketing-v1';

// Install event - minimal caching
self.addEventListener('install', (event) => {
  console.log('PWA: Service Worker installing');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('PWA: Opened cache');
        // Only cache essential PWA files, not app assets
        return cache.addAll([
          '/',
          '/index.html',
          '/manifest.json',
          '/icons/icon-192x192.png'
        ]);
      })
      .catch((error) => {
        console.error('PWA: Cache installation failed:', error);
      })
  );
});

// Fetch event - COMPLETELY NON-INTERFERING
self.addEventListener('fetch', (event) => {
  // CRITICAL: Let ALL requests pass through normally - don't interfere with app loading
  // Only handle very specific PWA-related requests
  const url = new URL(event.request.url);
  
  // Only handle requests to our own domain
  if (url.hostname !== location.hostname) {
    return;
  }
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // ONLY handle PWA-specific files, ignore all app assets
  if (url.pathname === '/manifest.json' || 
      url.pathname === '/icons/icon-192x192.png' ||
      url.pathname === '/') {
    
    // Handle PWA files with cache-first strategy
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
        .catch(() => {
          // Fallback to network
          return fetch(event.request);
        })
    );
  }
  
  // For all other requests (CSS, JS, images, API calls), let the browser handle normally
  // This ensures the app loads without any interference
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('PWA: Service Worker activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('PWA: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Skip background sync for now to avoid interference
// self.addEventListener('sync', (event) => {
//   if (event.tag === 'background-sync') {
//     event.waitUntil(doBackgroundSync());
// }
// });

// function doBackgroundSync() {
//   console.log('Background sync triggered');
// }
