// PWA Registration and Installation Handler - REACT INTEGRATED VERSION
class PWAInstaller {
  constructor() {
    this.deferredPrompt = null;
    this.isInitialized = false;
    this.init();
  }

  init() {
    // Wait for the main app to be fully loaded before initializing PWA features
    this.waitForAppLoad();
  }

  waitForAppLoad() {
    // Check if React app is loaded by looking for root content
    const rootElement = document.getElementById('root');
    
    if (rootElement && rootElement.children.length > 0) {
      // Wait a bit more to ensure React is fully rendered
      setTimeout(() => {
        this.setupPWA();
      }, 2000);
    } else {
      // Check again in 500ms
      setTimeout(() => {
        this.waitForAppLoad();
      }, 500);
    }
  }

  setupPWA() {
    if (this.isInitialized) return;
    
    console.log('PWA: App loaded, setting up PWA features');
    this.isInitialized = true;
    
    // Only register service worker if not in development
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      this.registerServiceWorker();
    }
    
    // Note: Install prompt is now handled by React component
    console.log('PWA: Install prompt will be handled by React component');
  }

  registerServiceWorker() {
    // Register service worker in both development and production
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then((registration) => {
            console.log('PWA: Service Worker registered successfully:', registration);
            
            // Handle updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('PWA: New version available - reloading page');
                    // Force reload to get the latest version
                    window.location.reload();
                  } else {
                    console.log('PWA: Service Worker installed for the first time');
                  }
                }
              });
            });
            
            // Check for updates every 30 seconds
            setInterval(() => {
              registration.update();
            }, 30000);
          })
          .catch((registrationError) => {
            console.error('PWA: Service Worker registration failed:', registrationError);
          });
      });
    }
  }

  // Note: Install prompt handling is now done by React component
  // This method is kept for backward compatibility but not used
  async installPWA() {
    console.log('PWA: Install method called - handled by React component');
  }

  // Method to unregister service worker (useful for debugging)
  async unregisterServiceWorker() {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
        console.log('PWA: Service Worker unregistered');
      }
    }
  }
}

// Initialize PWA installer with delay to ensure app loads first
setTimeout(() => {
  new PWAInstaller();
}, 3000);

// Expose unregister method globally for debugging
window.PWAInstaller = PWAInstaller;
