const CACHE_NAME = 'sentient-marketing-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/Logo/logo.png',
  '/pwa-register.js',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('PWA: Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('PWA: Cache installation failed:', error);
      })
  );
});

// Fetch event - ONLY handle basic navigation, ignore everything else
self.addEventListener('fetch', (event) => {
  // CRITICAL: Only handle main page navigation, ignore all dev server and asset requests
  if (event.request.destination !== 'document') {
    return; // Let the browser handle images, scripts, styles, etc. normally
  }
  
  // Only handle requests to the main app page
  const url = new URL(event.request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return; // Let the browser handle other routes normally
  }
  
  // Only handle GET requests to our own domain
  if (event.request.method !== 'GET' || url.hostname !== location.hostname) {
    return;
  }
  
  // Safe navigation handling - only for main page
  event.respondWith(
    caches.match('/index.html')
      .then((response) => {
        return response || fetch(event.request);
      })
      .catch(() => {
        // Fallback to cached index.html if both cache and network fail
        return caches.match('/index.html');
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Implement background sync logic here if needed
  console.log('Background sync triggered');
}
