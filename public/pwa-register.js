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
    
    // Register service worker in both development and production
    this.registerServiceWorker();
    
    // Set up install prompt handling for React component
    this.setupInstallPrompt();
  }

  setupInstallPrompt() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: Install prompt available');
      e.preventDefault();
      this.deferredPrompt = e;
      
      // Dispatch custom event to notify React component
      window.dispatchEvent(new CustomEvent('pwa-install-prompt', { 
        detail: { deferredPrompt: e } 
      }));
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', (evt) => {
      console.log('PWA: App was installed successfully');
      this.deferredPrompt = null;
      
      // Dispatch custom event to notify React component
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  registerServiceWorker() {
    // Register service worker for PWA functionality only (no aggressive caching)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then((registration) => {
            console.log('PWA: Service Worker registered for install functionality only');
            
            // Handle updates - always use new version immediately
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('PWA: New version available - auto-updating');
                    // Auto-activate new service worker for fresh content
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  } else {
                    console.log('PWA: Service Worker installed (fresh content mode)');
                  }
                }
              });
            });
            
            // Check for updates more frequently to ensure fresh content
            setInterval(() => {
              registration.update();
            }, 10000); // Check every 10 seconds
          })
          .catch((registrationError) => {
            console.error('PWA: Service Worker registration failed:', registrationError);
          });
      });
    }
  }

  // Method to get the current deferred prompt
  getDeferredPrompt() {
    return this.deferredPrompt;
  }

  // Method to trigger installation (for React component)
  async installPWA() {
    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('PWA: User accepted the install prompt');
        } else {
          console.log('PWA: User dismissed the install prompt');
        }
        
        this.deferredPrompt = null;
        return outcome;
      } catch (error) {
        console.error('PWA: Error during installation:', error);
        throw error;
      }
    } else {
      throw new Error('No install prompt available');
    }
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
let pwaInstallerInstance;
setTimeout(() => {
  pwaInstallerInstance = new PWAInstaller();
  // Expose the instance globally for React component access
  window.PWAInstaller = pwaInstallerInstance;
}, 3000);

// Expose class and instance globally for debugging and React access
window.PWAInstallerClass = PWAInstaller;
