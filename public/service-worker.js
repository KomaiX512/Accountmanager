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

// Basic limits to prevent unbounded growth
const MAX_IMAGE_CACHE_ENTRIES = 100;

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
  
  // Special-case: runtime cache only for the R2 image proxy
  // This is safe and non-invasive because PostCooked already versions these URLs (v, t, refreshKey)
  if (event.request.method === 'GET' && path.startsWith('/api/r2-image/')) {
    // Respect explicit bypass flags used by the app for hard refreshes
    const search = url.search.toLowerCase();
    const hasBypassFlag = /[?&](nocache|nuclear|force|bypass)(=|&|$)/.test(search);
    if (hasBypassFlag) {
      // Purge any cached variants for this base path, then fetch fresh
      event.respondWith((async () => {
        await purgeR2ImageCacheByPath(path);
        try {
          return await fetch(event.request, { cache: 'reload' });
        } catch (_) {
          // As a fallback, return any cached copy if available
          const cache = await caches.open(IMAGE_CACHE_NAME);
          const cached = await cache.match(event.request, { ignoreSearch: false });
          return cached || Response.error();
        }
      })());
      return;
    }
    event.respondWith(staleWhileRevalidateImages(event.request));
    return;
  }
  
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

// ------------------------------
// Helper strategies (minimal, safe)
// ------------------------------

async function cacheFirst(request) {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await limitCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
    }
    return response;
  } catch (_) {
    // Fallback: network
    return fetch(request);
  }
}

async function networkFirst(request, timeoutMs = 2000) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(id);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    // As a last resort, try network again without timeout
    return fetch(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const cachedPromise = cache.match(request, { ignoreSearch: false });
  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  const cached = await cachedPromise;
  return cached || fetchPromise || fetch(request);
}

async function staleWhileRevalidateImages(request) {
  // Only cache GET image requests
  if (request.method !== 'GET') return fetch(request);
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cachedPromise = cache.match(request, { ignoreSearch: false });
  const url = new URL(request.url);
  const search = url.search.toLowerCase();
  const isEditedOrForce = /[?&](edited|nuclear|force)(=|&|$)/.test(search);
  const fetchPromise = (async () => {
    // If this is an edited/forced request, purge all prior variants for this base path first
    if (isEditedOrForce) {
      await purgeR2ImageCacheByPath(url.pathname);
    }
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
        await limitCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
      } catch (_) {
        // ignore cache put errors
      }
    }
    return response;
  })()
    .catch(() => undefined);
  const cached = await cachedPromise;
  return cached || fetchPromise || fetch(request);
}

async function limitCacheEntries(cacheNameOrCache, maxEntries) {
  const cache = typeof cacheNameOrCache === 'string'
    ? await caches.open(cacheNameOrCache)
    : cacheNameOrCache;
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const toDelete = keys.length - maxEntries;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// ------------------------------
// Purge utilities and message API
// ------------------------------

async function purgeR2ImageCacheByPath(basePathname) {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(
      keys.map(async (req) => {
        try {
          const u = new URL(req.url);
          if (u.pathname === basePathname) {
            await cache.delete(req);
          }
        } catch (_) {
          // ignore URL parse errors
        }
      })
    );
  } catch (_) {
    // ignore purge errors
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PURGE_R2_IMAGE') {
    let targetPath = '';
    try {
      if (data.url) {
        const u = new URL(data.url, self.location.origin);
        targetPath = u.pathname;
      } else if (data.username && data.imageKey) {
        targetPath = `/api/r2-image/${data.username}/${data.imageKey}`;
      }
    } catch (_) {
      // ignore
    }
    if (targetPath) {
      event.waitUntil(purgeR2ImageCacheByPath(targetPath));
    }
  }
});
