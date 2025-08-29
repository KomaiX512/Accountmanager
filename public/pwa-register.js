// PWA Registration and Installation Handler - NON-INTERFERING VERSION
class PWAInstaller {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
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
    
    this.setupInstallPrompt();
  }

  registerServiceWorker() {
    // Only register service worker in production
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then((registration) => {
            console.log('PWA: Service Worker registered successfully:', registration);
            
            // Handle updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('PWA: New version available');
                }
              });
            });
          })
          .catch((registrationError) => {
            console.error('PWA: Service Worker registration failed:', registrationError);
          });
      });
    }
  }

  setupInstallPrompt() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: Install prompt available');
      e.preventDefault();
      this.deferredPrompt = e;
      // Don't show install button automatically - let user decide
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', (evt) => {
      console.log('PWA: App was installed successfully');
      this.hideInstallButton();
    });
  }

  showInstallButton() {
    // Only show if the main app is loaded and user hasn't dismissed it
    if (!document.getElementById('root') || document.getElementById('root').children.length === 0) {
      return;
    }

    // Create install button if it doesn't exist
    if (!this.installButton) {
      this.installButton = document.createElement('button');
      this.installButton.textContent = 'Install App';
      this.installButton.className = 'pwa-install-btn';
      this.installButton.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: #2c3e50;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
        display: none;
      `;
      
      this.installButton.addEventListener('click', () => {
        this.installPWA();
      });
      
      document.body.appendChild(this.installButton);
    }
    
    this.installButton.style.display = 'block';
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  async installPWA() {
    if (!this.deferredPrompt) {
      console.log('PWA: No install prompt available');
      return;
    }

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('PWA: User accepted the install prompt');
    } else {
      console.log('PWA: User dismissed the install prompt');
    }
    
    this.deferredPrompt = null;
    this.hideInstallButton();
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
