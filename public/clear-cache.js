// Cache Clearing Utility for PWA Updates
// This script helps clear all caches when the app needs to be updated

class CacheManager {
  constructor() {
    this.init();
  }

  init() {
    // Add cache clearing button to the page
    this.addCacheClearButton();
    
    // Listen for cache clear requests
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CLEAR_CACHE') {
        this.clearAllCaches();
      }
    });
  }

  addCacheClearButton() {
    // Only add in development or when needed
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const button = document.createElement('button');
      button.textContent = '🔄 Clear Cache';
      button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        background: #ff6b6b;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      
      button.addEventListener('click', () => {
        this.clearAllCaches();
      });
      
      document.body.appendChild(button);
    }
  }

  async clearAllCaches() {
    try {
      console.log('Cache Manager: Clearing all caches...');
      
      // Clear service worker caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Cache Manager: Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }
      
      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => {
            console.log('Cache Manager: Unregistering service worker');
            return registration.unregister();
          })
        );
      }
      
      // Clear localStorage (optional)
      // localStorage.clear();
      
      console.log('Cache Manager: All caches cleared successfully');
      alert('Cache cleared! The page will reload to get the latest version.');
      
      // Reload the page
      window.location.reload(true);
      
    } catch (error) {
      console.error('Cache Manager: Error clearing caches:', error);
      alert('Error clearing cache: ' + error.message);
    }
  }

  // Method to force update
  async forceUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          console.log('Cache Manager: Service worker updated');
        }
      }
    } catch (error) {
      console.error('Cache Manager: Error forcing update:', error);
    }
  }
}

// Initialize cache manager
new CacheManager();

// Expose globally for debugging
window.CacheManager = CacheManager;
