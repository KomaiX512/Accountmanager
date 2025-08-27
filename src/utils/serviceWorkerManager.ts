// Service Worker Manager for PostCooked Image Optimization
// Handles registration, communication, and management of the image optimization service worker

export class PostCookedServiceWorker {
  private registration: ServiceWorkerRegistration | null = null;
  private isSupported: boolean = false;

  constructor() {
    this.isSupported = 'serviceWorker' in navigator;
  }

  /**
   * Initialize and register the service worker
   */
  async init(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('[PostCooked SW] Service Worker not supported');
      return false;
    }

    try {
      console.log('[PostCooked SW] Registering service worker...');
      
      this.registration = await navigator.serviceWorker.register('/sw-images.js', {
        scope: '/'
      });

      if (this.registration.installing) {
        console.log('[PostCooked SW] Service worker installing...');
      } else if (this.registration.waiting) {
        console.log('[PostCooked SW] Service worker installed, waiting for activation');
      } else if (this.registration.active) {
        console.log('[PostCooked SW] Service worker active and ready');
      }

      // Listen for updates
      this.registration.addEventListener('updatefound', () => {
        console.log('[PostCooked SW] New service worker version found');
        const newWorker = this.registration?.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PostCooked SW] New service worker installed, please refresh');
              // Optionally notify user about update
              this.notifyUpdate();
            }
          });
        }
      });

      return true;
    } catch (error) {
      console.error('[PostCooked SW] Failed to register service worker:', error);
      return false;
    }
  }

  /**
   * Clear image cache based on pattern
   */
  async clearImageCache(pattern?: string): Promise<{ success: boolean; deleted?: number; error?: string }> {
    if (!this.isSupported || !this.registration?.active) {
      return { success: false, error: 'Service worker not available' };
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      this.registration!.active!.postMessage(
        {
          type: 'CLEAR_IMAGE_CACHE',
          payload: { pattern }
        },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Get cache status information
   */
  async getCacheStatus(): Promise<any> {
    if (!this.isSupported || !this.registration?.active) {
      return { error: 'Service worker not available' };
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      this.registration!.active!.postMessage(
        {
          type: 'GET_CACHE_STATUS'
        },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Preload images for better performance
   */
  async preloadImages(urls: string[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported || !this.registration?.active) {
      return { success: false, error: 'Service worker not available' };
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      this.registration!.active!.postMessage(
        {
          type: 'PRELOAD_IMAGES',
          payload: { urls }
        },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Force update the service worker
   */
  async update(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      await this.registration.update();
      return true;
    } catch (error) {
      console.error('[PostCooked SW] Failed to update service worker:', error);
      return false;
    }
  }

  /**
   * Unregister the service worker
   */
  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const result = await this.registration.unregister();
      console.log('[PostCooked SW] Service worker unregistered:', result);
      this.registration = null;
      return result;
    } catch (error) {
      console.error('[PostCooked SW] Failed to unregister service worker:', error);
      return false;
    }
  }

  /**
   * Check if service worker is ready
   */
  isReady(): boolean {
    return this.isSupported && this.registration?.active !== null;
  }

  /**
   * Notify user about service worker update
   */
  private notifyUpdate(): void {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 300px;
        line-height: 1.4;
      ">
        <div style="margin-bottom: 8px;">
          <strong>🚀 New features available!</strong>
        </div>
        <div style="margin-bottom: 12px;">
          Image loading improvements are ready.
        </div>
        <button onclick="window.location.reload()" style="
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-right: 8px;
        ">
          Refresh Now
        </button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        ">
          Later
        </button>
      </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.parentElement.removeChild(notification);
      }
    }, 10000);
  }
}

// Create singleton instance
const postCookedSW = new PostCookedServiceWorker();

// Auto-initialize if we're in a browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      postCookedSW.init().catch(console.error);
    });
  } else {
    // DOM is already ready
    postCookedSW.init().catch(console.error);
  }
}

export default postCookedSW;
