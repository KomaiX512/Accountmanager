// FRESH CONTENT SERVICE WORKER - No App Caching, Always Network First
// This service worker ensures the PWA behaves like a website with fresh content

const CACHE_NAME = 'pwa-minimal-cache';
const PWA_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install - Only cache PWA manifest and icons (required for install)
self.addEventListener('install', (event) => {
  console.log('PWA: Installing service worker - minimal caching mode');
  self.skipWaiting(); // Take control immediately
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('PWA: Caching only essential PWA files');
        return cache.addAll(PWA_ASSETS);
      })
      .catch((error) => {
        console.error('PWA: Failed to cache PWA assets:', error);
      })
  );
});

// Fetch - ALWAYS NETWORK FIRST for fresh content
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For PWA manifest and icons only - use cache first (required for PWA functionality)
  if (PWA_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          return cachedResponse || fetch(event.request);
        })
    );
    return;
  }
  
  // For ALL other requests (HTML, JS, CSS, API, etc.) - ALWAYS use network first
  // This ensures fresh content like a website
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Return fresh response - no caching of app content
        return response;
      })
      .catch((error) => {
        console.log('PWA: Network failed for:', url.pathname);
        // If network fails, show a simple offline message
        if (event.request.headers.get('accept').includes('text/html')) {
          return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Offline</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1a1a32; color: white; }
                .offline-message { max-width: 400px; margin: 0 auto; }
                .retry-btn { background: #00ffcc; color: #1a1a32; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="offline-message">
                <h1>You're Offline</h1>
                <p>Please check your internet connection and try again.</p>
                <button class="retry-btn" onclick="window.location.reload()">Retry</button>
              </div>
            </body>
            </html>
          `, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html' }
          });
        }
        throw error;
      })
  );
});

// Activate - Clean up and take control
self.addEventListener('activate', (event) => {
  console.log('PWA: Service worker activated - fresh content mode');
  
  event.waitUntil(
    Promise.all([
      // Clean up any old caches
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
      // Take control immediately
      self.clients.claim()
    ])
  );
});

// Message handling for manual cache clearing
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('PWA: Cache cleared manually');
    });
  }
});
