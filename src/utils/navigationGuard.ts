/**
 * Navigation Guard Utility
 * 
 * Prevents "Too many calls to Location or History APIs" errors by:
 * 1. Debouncing navigation calls
 * 2. Coordinating multiple navigation requests
 * 3. Preventing redundant navigation calls
 * 4. Managing history API calls safely
 */

interface NavigationRequest {
  path: string;
  state?: any;
  replace?: boolean;
  priority?: number;
  timestamp: number;
}

class NavigationGuard {
  private static instance: NavigationGuard;
  private pendingRequests: NavigationRequest[] = [];
  private isProcessing = false;
  private lastNavigationTime = 0;
  private readonly DEBOUNCE_DELAY = 100; // 100ms debounce
  private readonly MAX_REQUESTS_PER_SECOND = 10;
  private requestCount = 0;
  private lastRequestReset = Date.now();

  private constructor() {}

  static getInstance(): NavigationGuard {
    if (!NavigationGuard.instance) {
      NavigationGuard.instance = new NavigationGuard();
    }
    return NavigationGuard.instance;
  }

  /**
   * Safely navigate with debouncing and request coordination
   */
  async navigate(
    navigateFunction: (path: string, options?: any) => void,
    path: string,
    options?: { state?: any; replace?: boolean },
    priority: number = 0
  ): Promise<void> {
    const request: NavigationRequest = {
      path,
      state: options?.state,
      replace: options?.replace,
      priority,
      timestamp: Date.now()
    };

    // Rate limiting check
    if (!this.checkRateLimit()) {
      console.warn('[NavigationGuard] Rate limit exceeded, dropping navigation request:', path);
      return;
    }

    // Add to pending requests
    this.pendingRequests.push(request);

    // Process requests if not already processing
    if (!this.isProcessing) {
      this.processRequests(navigateFunction);
    }
  }

  /**
   * Safely manipulate history API with debouncing
   */
  async manipulateHistory(
    operation: 'pushState' | 'replaceState',
    state: any,
    title: string,
    url: string
  ): Promise<void> {
    const now = Date.now();
    
    // Rate limiting for history API
    if (now - this.lastNavigationTime < this.DEBOUNCE_DELAY) {
      console.warn('[NavigationGuard] History API call debounced:', operation);
      return;
    }

    try {
      if (operation === 'pushState') {
        window.history.pushState(state, title, url);
      } else {
        window.history.replaceState(state, title, url);
      }
      this.lastNavigationTime = now;
    } catch (error) {
      console.error('[NavigationGuard] History API error:', error);
    }
  }

  /**
   * Check if we're within rate limits
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Reset counter every second
    if (now - this.lastRequestReset >= 1000) {
      this.requestCount = 0;
      this.lastRequestReset = now;
    }

    // Check if we've exceeded the rate limit
    if (this.requestCount >= this.MAX_REQUESTS_PER_SECOND) {
      return false;
    }

    this.requestCount++;
    return true;
  }

  /**
   * Process pending navigation requests
   */
  private async processRequests(navigateFunction: (path: string, options?: any) => void): Promise<void> {
    if (this.isProcessing || this.pendingRequests.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Sort by priority (higher priority first) and timestamp
      this.pendingRequests.sort((a, b) => {
        const aPriority = a.priority ?? 0;
        const bPriority = b.priority ?? 0;
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        return a.timestamp - b.timestamp;
      });

      // Get the highest priority request
      const request = this.pendingRequests.shift();
      if (!request) {
        return;
      }

      // Clear other requests to the same path (deduplication)
      this.pendingRequests = this.pendingRequests.filter(req => req.path !== request.path);

      // Debounce delay
      const timeSinceLastNav = Date.now() - this.lastNavigationTime;
      if (timeSinceLastNav < this.DEBOUNCE_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.DEBOUNCE_DELAY - timeSinceLastNav));
      }

      // Execute navigation
      navigateFunction(request.path, {
        state: request.state,
        replace: request.replace
      });

      this.lastNavigationTime = Date.now();

    } catch (error) {
      console.error('[NavigationGuard] Navigation error:', error);
    } finally {
      this.isProcessing = false;

      // Process remaining requests if any
      if (this.pendingRequests.length > 0) {
        setTimeout(() => this.processRequests(navigateFunction), this.DEBOUNCE_DELAY);
      }
    }
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    this.pendingRequests = [];
  }

  /**
   * Get current pending request count
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.length;
  }
}

// Export singleton instance
export const navigationGuard = NavigationGuard.getInstance();

// Export convenience functions
export const safeNavigate = (
  navigateFunction: (path: string, options?: any) => void,
  path: string,
  options?: { state?: any; replace?: boolean },
  priority: number = 0
) => navigationGuard.navigate(navigateFunction, path, options, priority);

export const safeHistoryManipulation = (
  operation: 'pushState' | 'replaceState',
  state: any,
  title: string,
  url: string
) => navigationGuard.manipulateHistory(operation, state, title, url); 