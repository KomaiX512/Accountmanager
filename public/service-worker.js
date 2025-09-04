// Simple PWA Service Worker - Network First for Fresh Content
const CACHE_NAME = 'pwa-minimal';
const PWA_FILES = ['/manifest.json', '/icons/icon-192x192.png'];

// Install - minimal caching
self.addEventListener('install', (event) => {
  console.log('PWA: Service Worker installing');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PWA_FILES))
  );
});

// Fetch - always network first for fresh content
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
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
