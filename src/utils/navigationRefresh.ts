// Navigation Refresh Utility - Silent Internal Refresh System
// Solves the 20-year-old navigation latency problem by clearing specific state

interface PlatformState {
  platform: string;
  username: string;
  timestamp: number;
}

interface NavigationRefreshConfig {
  clearContexts: boolean;
  clearComponentState: boolean;
  clearApiCaches: boolean;
  clearBrowserCaches: boolean;
  forceStateSync: boolean;
}

class NavigationRefreshManager {
  private lastPlatform: string | null = null;
  private lastUsername: string | null = null;
  private contextResetCallbacks: (() => void)[] = [];
  private stateResetCallbacks: (() => void)[] = [];
  private isRefreshing: boolean = false;

  /**
   * Register callback to reset context provider state
   */
  registerContextReset(callback: () => void) {
    this.contextResetCallbacks.push(callback);
  }

  /**
   * Register callback to reset component state
   */
  registerStateReset(callback: () => void) {
    this.stateResetCallbacks.push(callback);
  }

  /**
   * Silent internal refresh mechanism - equivalent to manual browser refresh
   */
  async performSilentRefresh(
    currentPlatform: string, 
    currentUsername: string,
    config: NavigationRefreshConfig = {
      clearContexts: true,
      clearComponentState: true,
      clearApiCaches: true,
      clearBrowserCaches: true,
      forceStateSync: true
    }
  ): Promise<void> {
    if (this.isRefreshing) {
      console.log('[NavigationRefresh] 🔄 Already refreshing, skipping');
      return;
    }

    const needsRefresh = this.detectNavigationChange(currentPlatform, currentUsername);
    if (!needsRefresh) return;

    console.log('[NavigationRefresh] 🚀 SILENT REFRESH INITIATED:', {
      from: `${this.lastPlatform}/${this.lastUsername}`,
      to: `${currentPlatform}/${currentUsername}`
    });

    this.isRefreshing = true;
    const startTime = performance.now();

    try {
      // 1. Clear API-level caches (axios interceptors, request caches)
      if (config.clearApiCaches) {
        await this.clearApiCaches(currentPlatform);
      }

      // 2. Clear browser-level caches (service worker, HTTP cache)
      if (config.clearBrowserCaches) {
        await this.clearBrowserCaches();
      }

      // 3. Reset React context providers (Instagram, Twitter, Facebook, LinkedIn contexts)
      if (config.clearContexts) {
        this.resetContextProviders();
      }

      // 4. Reset component state (dashboard modules, notifications, etc.)
      if (config.clearComponentState) {
        this.resetComponentState();
      }

      // 5. Clear platform-specific localStorage contamination
      this.clearPlatformContamination(currentPlatform);

      // 6. Force immediate state synchronization for new platform
      if (config.forceStateSync) {
        await this.forcePlatformStateSync(currentPlatform, currentUsername);
      }

      // 7. Update tracking
      this.updateNavigationTracking(currentPlatform, currentUsername);

      const endTime = performance.now();
      console.log(`[NavigationRefresh] ✅ SILENT REFRESH COMPLETED in ${(endTime - startTime).toFixed(2)}ms`);

    } catch (error) {
      console.error('[NavigationRefresh] ❌ Silent refresh failed:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Detect if navigation requires refresh
   */
  private detectNavigationChange(currentPlatform: string, currentUsername: string): boolean {
    const platformChanged = this.lastPlatform && this.lastPlatform !== currentPlatform;
    const usernameChanged = this.lastUsername && this.lastUsername !== currentUsername;
    const needsRefresh = platformChanged || usernameChanged;

    if (needsRefresh) {
      console.log('[NavigationRefresh] 🔍 Navigation change detected:', {
        platformChanged: this.lastPlatform !== currentPlatform,
        usernameChanged: this.lastUsername !== currentUsername,
        previous: { platform: this.lastPlatform, username: this.lastUsername },
        current: { platform: currentPlatform, username: currentUsername }
      });
    }

    return needsRefresh;
  }

  /**
   * Clear API-level caches and interceptors
   */
  private async clearApiCaches(platform: string): Promise<void> {
    console.log('[NavigationRefresh] 🧹 Clearing API caches...');
    
    // Clear axios request/response cache
    if (window.axios && window.axios.defaults) {
      delete window.axios.defaults.headers.common['X-Platform-Cache'];
      delete window.axios.defaults.headers.common['X-Username-Cache'];
    }

    // Clear platform-specific API caches
    const apiCacheKeys = [
      'posts_cache', 'notifications_cache', 'strategies_cache', 
      'competitor_analysis_cache', 'profile_info_cache', 'usage_cache'
    ];

    apiCacheKeys.forEach(key => {
      sessionStorage.removeItem(`${platform}_${key}`);
      localStorage.removeItem(`${platform}_${key}`);
    });

    // Clear service worker caches
    if ('serviceWorker' in navigator && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        const apiCacheNames = cacheNames.filter(name => 
          name.includes('api') || name.includes(platform) || name.includes('dynamic')
        );
        
        await Promise.all(
          apiCacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('[NavigationRefresh] 🗑️ Cleared service worker API caches:', apiCacheNames);
      } catch (error) {
        console.warn('[NavigationRefresh] ⚠️ Could not clear service worker caches:', error);
      }
    }
  }

  /**
   * Clear browser-level HTTP caches
   */
  private async clearBrowserCaches(): Promise<void> {
    console.log('[NavigationRefresh] 🧹 Clearing browser caches...');

    // Clear HTTP cache by adding cache-busting timestamps to future requests
    const timestamp = Date.now();
    if (window.axios && window.axios.defaults) {
      window.axios.defaults.headers.common['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      window.axios.defaults.headers.common['Pragma'] = 'no-cache';
      window.axios.defaults.headers.common['X-Cache-Bust'] = timestamp.toString();
    }

    // Clear fetch cache - add cache-busting to future requests
    try {
      const originalFetch = window.fetch;
      window.fetch = function(url: RequestInfo | URL, init: RequestInit = {}) {
        return originalFetch(url, { ...init, cache: 'no-cache' });
      };
    } catch (error) {
      console.warn('[NavigationRefresh] ⚠️ Could not modify fetch behavior:', error);
    }
  }

  /**
   * Reset all React context providers
   */
  private resetContextProviders(): void {
    console.log('[NavigationRefresh] 🔄 Resetting context providers...');
    
    // Trigger all registered context reset callbacks
    this.contextResetCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[NavigationRefresh] ❌ Context reset callback failed:', error);
      }
    });

    // Clear context-specific caches
    const contextKeys = [
      'instagram_context_cache', 'twitter_context_cache', 
      'facebook_context_cache', 'linkedin_context_cache',
      'usage_context_cache', 'processing_context_cache'
    ];

    contextKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
  }

  /**
   * Reset component state
   */
  private resetComponentState(): void {
    console.log('[NavigationRefresh] 🔄 Resetting component state...');
    
    // Trigger all registered state reset callbacks
    this.stateResetCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[NavigationRefresh] ❌ State reset callback failed:', error);
      }
    });

    // Clear component-specific session storage
    const componentKeys = [
      'dashboard_state', 'notifications_state', 'posts_state',
      'strategies_state', 'competitor_state', 'chat_state'
    ];

    componentKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
  }

  /**
   * Clear cross-platform localStorage contamination
   */
  private clearPlatformContamination(currentPlatform: string): void {
    console.log('[NavigationRefresh] 🧹 Clearing platform contamination...');
    
    const otherPlatforms = ['instagram', 'twitter', 'facebook', 'linkedin']
      .filter(p => p !== currentPlatform);

    // Clear other platform's temporary data that might contaminate current platform
    otherPlatforms.forEach(platform => {
      const contaminationKeys = [
        `${platform}_temp_state`, `${platform}_processing_state`,
        `${platform}_navigation_state`, `${platform}_modal_state`
      ];

      contaminationKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });
    });

    // Clear generic cross-platform keys
    const genericKeys = [
      'last_platform_username', 'platform_switch_state', 
      'navigation_cache', 'cross_platform_data'
    ];

    genericKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
  }

  /**
   * Force immediate state synchronization for new platform
   */
  private async forcePlatformStateSync(platform: string, username: string): Promise<void> {
    console.log('[NavigationRefresh] 🔄 Forcing platform state sync...');
    
    // Set platform isolation markers
    sessionStorage.setItem('current_platform', platform);
    sessionStorage.setItem('current_username', username);
    sessionStorage.setItem('navigation_refresh_timestamp', Date.now().toString());

    // Dispatch custom event to notify components of platform switch
    const event = new CustomEvent('platform-navigation-refresh', {
      detail: { platform, username, timestamp: Date.now() }
    });
    window.dispatchEvent(event);

    // Force immediate platform context update
    if (window.platformContextManager) {
      try {
        await window.platformContextManager.syncPlatform(platform, username);
      } catch (error) {
        console.warn('[NavigationRefresh] ⚠️ Platform context sync failed:', error);
      }
    }
  }

  /**
   * Update navigation tracking
   */
  private updateNavigationTracking(platform: string, username: string): void {
    this.lastPlatform = platform;
    this.lastUsername = username;

    // Store in session for persistence across navigation
    sessionStorage.setItem('navigation_refresh_last_platform', platform);
    sessionStorage.setItem('navigation_refresh_last_username', username);
  }

  /**
   * Initialize from session storage
   */
  initialize(): void {
    this.lastPlatform = sessionStorage.getItem('navigation_refresh_last_platform') || null;
    this.lastUsername = sessionStorage.getItem('navigation_refresh_last_username') || null;
    console.log('[NavigationRefresh] 🔧 Initialized with tracking:', {
      lastPlatform: this.lastPlatform,
      lastUsername: this.lastUsername
    });
  }

  /**
   * Get refresh statistics
   */
  getStats(): object {
    return {
      lastPlatform: this.lastPlatform,
      lastUsername: this.lastUsername,
      isRefreshing: this.isRefreshing,
      contextCallbacks: this.contextResetCallbacks.length,
      stateCallbacks: this.stateResetCallbacks.length
    };
  }
}

// Global singleton instance
const navigationRefreshManager = new NavigationRefreshManager();

// Extend window object for debugging
declare global {
  interface Window {
    navigationRefreshManager?: NavigationRefreshManager;
    platformContextManager?: any;
    axios?: any;
  }
}

window.navigationRefreshManager = navigationRefreshManager;

// Auto-initialize on load
navigationRefreshManager.initialize();

export default navigationRefreshManager;
export { NavigationRefreshManager };
export type { NavigationRefreshConfig, PlatformState };
