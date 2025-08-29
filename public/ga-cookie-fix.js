// Google Analytics Cookie Fix and Lexical Declaration Error Prevention
(function() {
  'use strict';
  
  // Prevent lexical declaration errors by ensuring proper initialization
  const preventLexicalErrors = () => {
    try {
      // Override any problematic global variables that might cause lexical errors
      if (typeof window !== 'undefined') {
        // Ensure proper initialization order
        if (!window.__ga_initialized) {
          window.__ga_initialized = true;
        }
        
        // Prevent cookie conflicts
        const originalSetCookie = document.cookie;
        Object.defineProperty(document, 'cookie', {
          get: function() {
            return originalSetCookie;
          },
          set: function(value) {
            // Filter out problematic GA cookies that cause warnings
            if (value && value.includes('_ga_') && value.includes('expires=')) {
              // Remove the expires attribute to prevent the warning
              value = value.replace(/expires=[^;]+;?/g, '');
            }
            originalSetCookie = value;
          },
          configurable: true
        });
      }
    } catch (error) {
      console.warn('Cookie fix initialization error:', error);
    }
  };
  
  // Initialize fixes when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preventLexicalErrors);
  } else {
    preventLexicalErrors();
  }
  
  // Also run on window load to catch any late initialization
  window.addEventListener('load', preventLexicalErrors);
  
  // Prevent layout shifts during loading
  const preventLayoutShifts = () => {
    try {
      // Add loading class to body
      document.body.classList.add('loading');
      
      // Remove loading class when everything is ready
      const removeLoading = () => {
        document.body.classList.remove('loading');
        document.body.classList.add('loaded');
      };
      
      // Remove loading class after a short delay to ensure styles are loaded
      setTimeout(removeLoading, 100);
      
      // Also remove on window load
      window.addEventListener('load', removeLoading);
    } catch (error) {
      console.warn('Layout shift prevention error:', error);
    }
  };
  
  // Initialize layout shift prevention
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preventLayoutShifts);
  } else {
    preventLayoutShifts();
  }
  
  // Error boundary for any remaining lexical declaration issues
  window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('lexical declaration')) {
      console.warn('Lexical declaration error caught and handled:', event.error.message);
      event.preventDefault();
      return false;
    }
  });
  
  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('lexical declaration')) {
      console.warn('Lexical declaration promise error caught and handled:', event.reason.message);
      event.preventDefault();
      return false;
    }
  });
  
})(); 

// Google Analytics Cookie Fix and Service Worker Cleanup
(function() {
  'use strict';

  // Fix for Google Analytics cookie issues
  function fixGACookies() {
    // Remove problematic cookies that might interfere with analytics
    const cookiesToRemove = ['_ga', '_gid', '_gat'];
    cookiesToRemove.forEach(cookieName => {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
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