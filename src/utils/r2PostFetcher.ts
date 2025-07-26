import { getApiUrl } from '../config/api';

export interface R2RefreshOptions {
  platform: string;
  username: string;
  forceRefresh?: boolean;
  skipCache?: boolean;
}

export interface R2RefreshResult {
  success: boolean;
  posts: any[];
  message: string;
  freshFromR2: boolean;
  cacheHit: boolean;
}

/**
 * Enhanced R2 fetch utility that ensures fresh data from R2 bucket
 * This solves the issue where refresh only updates frontend cache
 */
export class R2PostFetcher {
  private static instance: R2PostFetcher;
  private requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
  
  private constructor() {}
  
  static getInstance(): R2PostFetcher {
    if (!R2PostFetcher.instance) {
      R2PostFetcher.instance = new R2PostFetcher();
    }
    return R2PostFetcher.instance;
  }
  
  /**
   * Force refresh posts directly from R2 bucket
   * This bypasses all caching layers to ensure fresh data
   */
  async fetchFreshFromR2(options: R2RefreshOptions): Promise<R2RefreshResult> {
    const { platform, username, forceRefresh = true, skipCache = true } = options;
    
    try {
      console.log(`[R2PostFetcher] 🔄 Fetching fresh posts from R2 for ${platform}/${username}`);
      
      // Build URL with cache-busting parameters
      const timestamp = Date.now();
      const cacheBreaker = Math.random().toString(36).substring(7);
      
      const url = getApiUrl('/api/posts-fresh-r2', `/${username}`) + 
        `?platform=${platform}` +
        `&nocache=${timestamp}` +
        `&cb=${cacheBreaker}` +
        `&force=${forceRefresh ? '1' : '0'}` +
        `&skipcache=${skipCache ? '1' : '0'}`;
      
      console.log(`[R2PostFetcher] 📡 Requesting: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Fresh-Request': 'true',
          'X-Platform': platform,
          'X-Username': username
        },
        // Add request timeout
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate response structure
      if (!Array.isArray(data.posts)) {
        console.warn('[R2PostFetcher] ⚠️ Unexpected response format, falling back to posts array');
        const posts = Array.isArray(data) ? data : [];
        return {
          success: true,
          posts,
          message: `✅ Fetched ${posts.length} posts from R2 (fallback format)`,
          freshFromR2: true,
          cacheHit: false
        };
      }
      
      const posts = data.posts;
      const freshFromR2 = data.freshFromR2 !== false; // Default to true if not specified
      
      console.log(`[R2PostFetcher] ✅ Successfully fetched ${posts.length} posts (fresh: ${freshFromR2})`);
      
      return {
        success: true,
        posts,
        message: `✅ Fetched ${posts.length} posts ${freshFromR2 ? 'fresh from R2' : 'from cache'}`,
        freshFromR2,
        cacheHit: !freshFromR2
      };
      
    } catch (error) {
      console.error('[R2PostFetcher] ❌ Error fetching fresh posts:', error);
      
      // Fallback to regular posts endpoint if R2 direct fetch fails
      try {
        console.log('[R2PostFetcher] 🔄 Trying fallback to regular posts endpoint...');
        return await this.fallbackToRegularEndpoint(options);
      } catch (fallbackError) {
        console.error('[R2PostFetcher] ❌ Fallback also failed:', fallbackError);
        
        return {
          success: false,
          posts: [],
          message: `❌ Failed to fetch posts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          freshFromR2: false,
          cacheHit: false
        };
      }
    }
  }
  
  /**
   * Fallback to regular posts endpoint with enhanced cache busting
   */
  private async fallbackToRegularEndpoint(options: R2RefreshOptions): Promise<R2RefreshResult> {
    const { platform, username } = options;
    
    console.log(`[R2PostFetcher] 📞 Fallback: Using regular posts endpoint for ${platform}/${username}`);
    
    const timestamp = Date.now();
    const url = getApiUrl('/api/posts', `/${username}`) + 
      `?platform=${platform}&nocache=${timestamp}&refresh=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'X-Fallback-Request': 'true'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout for fallback
    });
    
    if (!response.ok) {
      throw new Error(`Fallback failed: HTTP ${response.status}`);
    }
    
    const posts = await response.json();
    
    return {
      success: true,
      posts: Array.isArray(posts) ? posts : [],
      message: `✅ Fetched ${Array.isArray(posts) ? posts.length : 0} posts (fallback)`,
      freshFromR2: false, // This is not fresh from R2
      cacheHit: true
    };
  }
  
  /**
   * Enhanced auto-refresh that checks R2 for new posts every 5 minutes
   */
  async setupAutoRefresh(
    options: R2RefreshOptions, 
    onNewPosts: (result: R2RefreshResult) => void,
    intervalMinutes: number = 5
  ): Promise<() => void> {
    const { platform, username } = options;
    
    console.log(`[R2PostFetcher] ⏰ Setting up auto-refresh every ${intervalMinutes} minutes for ${platform}/${username}`);
    
    let lastPostCount = 0;
    
    // Initial check to establish baseline
    try {
      const initialResult = await this.fetchFreshFromR2(options);
      lastPostCount = initialResult.posts.length;
      console.log(`[R2PostFetcher] 📊 Baseline: ${lastPostCount} posts`);
    } catch (error) {
      console.warn('[R2PostFetcher] ⚠️ Failed to establish baseline:', error);
    }
    
    const intervalId = setInterval(async () => {
      try {
        console.log(`[R2PostFetcher] 🔍 Auto-refresh check for ${platform}/${username}`);
        
        const result = await this.fetchFreshFromR2({
          ...options,
          forceRefresh: true,
          skipCache: true
        });
        
        if (result.success) {
          const newPostCount = result.posts.length;
          
          if (newPostCount > lastPostCount) {
            console.log(`[R2PostFetcher] 🆕 New posts detected: ${lastPostCount} → ${newPostCount}`);
            onNewPosts(result);
            lastPostCount = newPostCount;
          } else if (newPostCount < lastPostCount) {
            console.log(`[R2PostFetcher] 📉 Post count decreased: ${lastPostCount} → ${newPostCount} (posts may have been processed)`);
            onNewPosts(result);
            lastPostCount = newPostCount;
          }
        }
      } catch (error) {
        console.error('[R2PostFetcher] ❌ Auto-refresh error:', error);
        // Continue auto-refresh even if individual check fails
      }
    }, intervalMinutes * 60 * 1000);
    
    // Return cleanup function
    return () => {
      clearInterval(intervalId);
      console.log(`[R2PostFetcher] 🛑 Stopped auto-refresh for ${platform}/${username}`);
    };
  }
  
  /**
   * Clear all caches to ensure next request is completely fresh
   */
  clearAllCaches(): void {
    this.requestCache.clear();
    console.log('[R2PostFetcher] 🧹 Cleared all request caches');
  }
  
  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { totalCached: number; oldestEntry: number | null } {
    const now = Date.now();
    let oldestEntry = null;
    
    for (const [, { timestamp }] of this.requestCache) {
      if (oldestEntry === null || timestamp < oldestEntry) {
        oldestEntry = timestamp;
      }
    }
    
    return {
      totalCached: this.requestCache.size,
      oldestEntry: oldestEntry ? now - oldestEntry : null
    };
  }
}

export const r2PostFetcher = R2PostFetcher.getInstance();
