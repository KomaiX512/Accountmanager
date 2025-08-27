// PostCooked Image Optimization Service Worker
// This service worker provides advanced image caching and optimization for the PostCooked module

const CACHE_NAME = 'postcooked-images-v1';
const IMAGE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 100; // Maximum number of images to cache

// Image optimization configurations
const OPTIMIZATION_CONFIGS = {
  thumbnail: { maxWidth: 300, quality: 0.7 },
  mobile: { maxWidth: 600, quality: 0.8 },
  desktop: { maxWidth: 1080, quality: 0.85 },
  original: { maxWidth: null, quality: 0.9 }
};

// Install event - set up the cache
self.addEventListener('install', (event) => {
  console.log('[SW] Installing PostCooked Image Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache opened successfully');
      return cache;
    })
  );
  self.skipWaiting(); // Force activation of new service worker
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating PostCooked Image Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.includes('postcooked')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activated and ready');
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Fetch event - handle image requests with smart caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle image requests from our API endpoints
  if (url.pathname.includes('/api/r2-image/') || url.pathname.includes('/r2-images/')) {
    event.respondWith(handleImageRequest(event.request));
  }
});

// Smart image request handler with progressive loading support
async function handleImageRequest(request) {
  const url = new URL(request.url);
  const quality = url.searchParams.get('quality') || 'desktop';
  const progressive = url.searchParams.get('progressive') === 'true';
  
  // Create cache key including quality for proper isolation
  const cacheKey = `${url.pathname}?quality=${quality}`;
  
  try {
    // Check if we have a cached version
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      // Check if cache is still fresh
      const cachedDate = new Date(cachedResponse.headers.get('sw-cached-date') || 0);
      const isExpired = Date.now() - cachedDate.getTime() > IMAGE_CACHE_EXPIRY;
      
      if (!isExpired) {
        console.log('[SW] Serving from cache:', cacheKey);
        
        // If progressive loading is requested, serve thumbnail first then full image
        if (progressive && quality !== 'thumbnail') {
          // Try to serve thumbnail first for immediate feedback
          const thumbnailKey = `${url.pathname}?quality=thumbnail`;
          const thumbnailResponse = await cache.match(thumbnailKey);
          if (thumbnailResponse) {
            // Send thumbnail first, then fetch full image in background
            setTimeout(() => fetchAndCacheImage(request, cache, cacheKey), 100);
            return thumbnailResponse;
          }
        }
        
        return cachedResponse;
      } else {
        console.log('[SW] Cache expired for:', cacheKey);
        // Remove expired entry
        await cache.delete(cacheKey);
      }
    }
    
    // Fetch and cache the image
    return await fetchAndCacheImage(request, cache, cacheKey);
    
  } catch (error) {
    console.error('[SW] Error handling image request:', error);
    // Fallback to network request
    return fetch(request);
  }
}

// Fetch image from network and cache it
async function fetchAndCacheImage(request, cache, cacheKey) {
  try {
    console.log('[SW] Fetching from network:', cacheKey);
    
    const response = await fetch(request);
    
    if (!response.ok) {
      throw new Error(`Network response not ok: ${response.status}`);
    }
    
    // Clone the response for caching
    const responseToCache = response.clone();
    
    // Add cache metadata
    const headers = new Headers(responseToCache.headers);
    headers.set('sw-cached-date', new Date().toISOString());
    headers.set('sw-cache-key', cacheKey);
    
    const cachedResponse = new Response(responseToCache.body, {
      status: responseToCache.status,
      statusText: responseToCache.statusText,
      headers: headers
    });
    
    // Cache the response
    await cache.put(cacheKey, cachedResponse);
    
    // Maintain cache size limit
    await maintainCacheSize(cache);
    
    console.log('[SW] Cached successfully:', cacheKey);
    return response;
    
  } catch (error) {
    console.error('[SW] Error fetching image:', error);
    
    // Try to serve stale cache as fallback
    const staleResponse = await cache.match(cacheKey);
    if (staleResponse) {
      console.log('[SW] Serving stale cache as fallback:', cacheKey);
      return staleResponse;
    }
    
    // Generate a placeholder response as last resort
    return generatePlaceholderResponse();
  }
}

// Maintain cache size by removing oldest entries
async function maintainCacheSize(cache) {
  try {
    const keys = await cache.keys();
    
    if (keys.length > MAX_CACHE_SIZE) {
      console.log(`[SW] Cache size (${keys.length}) exceeds limit (${MAX_CACHE_SIZE}), cleaning up`);
      
      // Get all cached responses with their dates
      const entries = await Promise.all(
        keys.map(async (key) => {
          const response = await cache.match(key);
          const cachedDate = response ? response.headers.get('sw-cached-date') : null;
          return {
            key,
            date: cachedDate ? new Date(cachedDate).getTime() : 0
          };
        })
      );
      
      // Sort by date (oldest first) and remove excess entries
      entries.sort((a, b) => a.date - b.date);
      const toDelete = entries.slice(0, keys.length - MAX_CACHE_SIZE + 10); // Remove extra to avoid frequent cleanup
      
      await Promise.all(
        toDelete.map(entry => {
          console.log('[SW] Removing old cache entry:', entry.key.url);
          return cache.delete(entry.key);
        })
      );
      
      console.log(`[SW] Cleaned up ${toDelete.length} old cache entries`);
    }
  } catch (error) {
    console.error('[SW] Error maintaining cache size:', error);
  }
}

// Generate a placeholder response for failed requests
function generatePlaceholderResponse() {
  // Create a minimal 1x1 transparent PNG
  const placeholderData = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // bit depth, color type, etc.
    0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9C, 0x62, 0x00, 0x02, 0x00, 0x00, // compressed data
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, // CRC
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
    0x42, 0x60, 0x82
  ]);
  
  return new Response(placeholderData, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      'X-SW-Fallback': 'placeholder'
    }
  });
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'CLEAR_IMAGE_CACHE':
      clearImageCache(payload.pattern).then(() => {
        event.ports[0].postMessage({ success: true });
      }).catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
      break;
      
    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0].postMessage(status);
      });
      break;
      
    case 'PRELOAD_IMAGES':
      preloadImages(payload.urls).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Clear image cache based on pattern
async function clearImageCache(pattern) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const keysToDelete = keys.filter(key => 
      pattern ? key.url.includes(pattern) : true
    );
    
    await Promise.all(
      keysToDelete.map(key => cache.delete(key))
    );
    
    console.log(`[SW] Cleared ${keysToDelete.length} cache entries`);
    return { deleted: keysToDelete.length };
  } catch (error) {
    console.error('[SW] Error clearing cache:', error);
    throw error;
  }
}

// Get cache status information
async function getCacheStatus() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const entries = await Promise.all(
      keys.map(async (key) => {
        const response = await cache.match(key);
        const size = response ? parseInt(response.headers.get('content-length') || '0') : 0;
        const cachedDate = response ? response.headers.get('sw-cached-date') : null;
        
        return {
          url: key.url,
          size,
          cachedDate,
          isExpired: cachedDate ? Date.now() - new Date(cachedDate).getTime() > IMAGE_CACHE_EXPIRY : false
        };
      })
    );
    
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const expiredCount = entries.filter(entry => entry.isExpired).length;
    
    return {
      totalEntries: entries.length,
      totalSize,
      expiredCount,
      entries: entries.slice(0, 10) // Return first 10 for debugging
    };
  } catch (error) {
    console.error('[SW] Error getting cache status:', error);
    return { error: error.message };
  }
}

// Preload images for better UX
async function preloadImages(urls) {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    const preloadPromises = urls.map(async (url) => {
      try {
        const request = new Request(url);
        const cachedResponse = await cache.match(request);
        
        if (!cachedResponse) {
          console.log('[SW] Preloading image:', url);
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response);
          }
        }
      } catch (error) {
        console.warn('[SW] Failed to preload image:', url, error);
      }
    });
    
    await Promise.all(preloadPromises);
    console.log(`[SW] Preloaded ${urls.length} images`);
  } catch (error) {
    console.error('[SW] Error preloading images:', error);
    throw error;
  }
}

console.log('[SW] PostCooked Image Service Worker loaded successfully');
