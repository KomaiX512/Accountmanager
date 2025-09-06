// Google-Level Service Worker with Intelligent Caching
const CACHE_NAME = 'dashboard-v2.0';
const DATA_CACHE_NAME = 'data-v2.0';
const IMAGE_CACHE_NAME = 'images-v2.0';
const NOTIFICATION_CACHE_NAME = 'notifications-v2.0';
const PWA_FILES = ['/manifest.json', '/icons/icon-192x192.png'];

const CACHE_STRATEGIES = {
  networkOnly: ['/api/'],
  cacheFirst: ['/images/'],
  networkFirst: [],
  staleWhileRevalidate: []
};

// Install - minimal caching
self.addEventListener('install', (event) => {
  console.log('PWA: Service Worker installing');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PWA_FILES))
  );
});

// Fetch - always network first for fresh content
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  const url = new URL(event.request.url);
  const path = url.pathname;
  
  // Implement intelligent caching strategies
  if (CACHE_STRATEGIES.networkOnly.some(pattern => path.includes(pattern))) {
    // Network only - no caching for sensitive operations
    return;
  }
  
  if (CACHE_STRATEGIES.cacheFirst.some(pattern => path.includes(pattern))) {
    // Cache first for images - instant load
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  if (CACHE_STRATEGIES.networkFirst.some(pattern => path.includes(pattern))) {
    // Network first with fallback for critical data
    event.respondWith(networkFirst(event.request, 2000));
    return;
  }
  
  if (CACHE_STRATEGIES.staleWhileRevalidate.some(pattern => path.includes(pattern))) {
    // Stale while revalidate for profile info
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  // Only cache PWA manifest/icons, everything else goes to network
  if (PWA_FILES.some(file => event.request.url.includes(file))) {
    event.respondWith(
      caches.match(event.request).then(response => response || fetch(event.request))
    );
  }
});

// Activate - clean up
self.addEventListener('activate', (event) => {
  console.log('PWA: Service Worker activated');
  event.waitUntil(self.clients.claim());
});
