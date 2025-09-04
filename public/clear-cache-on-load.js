// Cache clearing utility for fresh content on every app launch
(function() {
  'use strict';
  
  // Clear all caches when app loads to ensure fresh content
  function clearAllCaches() {
    if ('caches' in window) {
      caches.keys().then(function(cacheNames) {
        cacheNames.forEach(function(cacheName) {
          // Only clear app caches, keep PWA manifest cache
          if (!cacheName.includes('pwa-minimal-cache')) {
            caches.delete(cacheName);
            console.log('PWA: Cleared app cache:', cacheName);
          }
        });
      });
    }
  }
  
  // Add timestamp to requests for cache busting
  function addCacheBuster() {
    const timestamp = Date.now();
    
    // Add cache buster to dynamic imports and API calls
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      // Only add cache buster to same-origin requests
      if (typeof url === 'string' && url.startsWith('/')) {
        const separator = url.includes('?') ? '&' : '?';
        url = url + separator + '_t=' + timestamp;
      }
      return originalFetch.call(this, url, options);
    };
  }
  
  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      clearAllCaches();
      addCacheBuster();
    });
  } else {
    clearAllCaches();
    addCacheBuster();
  }
  
  // Clear caches when app gains focus (user returns to app)
  window.addEventListener('focus', function() {
    console.log('PWA: App gained focus - ensuring fresh content');
    clearAllCaches();
  });
  
})();
console.log('Fresh content test - timestamp:', Date.now());
