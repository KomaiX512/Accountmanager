// Dynamic cache name with timestamp to force updates
const CACHE_VERSION = Date.now();
const CACHE_NAME = `sentient-marketing-v${CACHE_VERSION}`;

// Install event - minimal caching with immediate activation
self.addEventListener('install', (event) => {
  console.log('PWA: Service Worker installing with version:', CACHE_VERSION);
  // Skip waiting to immediately activate new service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('PWA: Opened cache with version:', CACHE_VERSION);
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

// Fetch event - NETWORK FIRST for app updates
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle requests to our own domain
  if (url.hostname !== location.hostname) {
    return;
  }
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For app assets (JS, CSS, images), use network-first strategy to get updates
  if (url.pathname.includes('/assets/') || 
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html')) {
    
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If network request succeeds, update cache and return response
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For PWA-specific files, use cache-first strategy
  if (url.pathname === '/manifest.json' || 
      url.pathname === '/icons/icon-192x192.png') {
    
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
        .catch(() => {
          return fetch(event.request);
        })
    );
  }
  
  // For all other requests, let the browser handle normally
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('PWA: Service Worker activating with version:', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('PWA: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ])
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
