// Google Analytics Cookie Fix and Service Worker Cleanup
(function() {
  'use strict';

  // Fix for Google Analytics cookie issues
  function fixGACookies() {
    try {
      // Remove problematic cookies that might interfere with analytics
      const cookiesToRemove = ['_ga', '_gid', '_gat'];
      cookiesToRemove.forEach(cookieName => {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
      console.log('GA cookies cleaned successfully');
    } catch (error) {
      console.warn('GA cookie cleanup error:', error);
    }
  }

  // Clean up any existing service workers that might be interfering
  async function cleanupServiceWorkers() {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
          console.log('Service Worker unregistered for cleanup:', registration);
        }
      } catch (error) {
        console.log('Service Worker cleanup error:', error);
      }
    }
  }

  // Clear any cached data that might be causing issues
  function clearProblematicCache() {
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('sentient-marketing')) {
            caches.delete(cacheName);
            console.log('Cleared problematic cache:', cacheName);
          }
        });
      });
    }
  }

  // Run cleanup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      fixGACookies();
      cleanupServiceWorkers();
      clearProblematicCache();
    });
  } else {
    fixGACookies();
    cleanupServiceWorkers();
    clearProblematicCache();
  }

  // Also run cleanup when window loads
  window.addEventListener('load', function() {
    // Additional cleanup after everything is loaded
    setTimeout(() => {
      clearProblematicCache();
    }, 1000);
  });
})(); 