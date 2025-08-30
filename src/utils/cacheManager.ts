// Removed unused Interface to satisfy linter

/**
 * CacheManager - Handles caching for competitor analysis data
 * 
 * Cache invalidation triggers:
 * 1. After 2 minutes when competitor analysis is added/edited (reduced from 15 for testing)
 * 2. When competitor data is manually refreshed
 * 3. When cache duration expires
 * 
 * This ensures fresh data while maintaining performance
 */
export class CacheManager {
  private static readonly COMPETITOR_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds (reduced from 15 for testing)
  private static readonly GENERAL_CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

  /**
   * Check if cache should be invalidated based on the two conditions:
   * 1. After 2 minutes when competitor analysis is added/edited (reduced from 15 for testing)
   * 2. After 12 hours for all dashboard modules
   */
  static shouldInvalidateCache(platform: string, accountHolder: string, section?: string): boolean {
    const now = Date.now();
    
    // Check competitor edit condition (2 minutes)
    const competitorEditKey = `competitor_edit_time_${platform}_${accountHolder}`;
    const competitorEditTime = localStorage.getItem(competitorEditKey);
    
    if (competitorEditTime) {
      const editTime = parseInt(competitorEditTime);
      const timeSinceEdit = now - editTime;
      
      if (timeSinceEdit < this.COMPETITOR_CACHE_DURATION) {
        console.log(`[CacheManager] Cache invalidated due to recent competitor edit (${Math.round(timeSinceEdit / 1000 / 60)} minutes ago)`);
        return true;
      }
    }
    
    // Check general cache expiration (12 hours)
    const cacheTimeKey = `last_cache_time_${platform}_${accountHolder}${section ? `_${section}` : ''}`;
    const lastCacheTime = localStorage.getItem(cacheTimeKey);
    
    if (lastCacheTime) {
      const cacheTime = parseInt(lastCacheTime);
      const timeSinceCache = now - cacheTime;
      
      if (timeSinceCache >= this.GENERAL_CACHE_DURATION) {
        console.log(`[CacheManager] Cache invalidated due to 12-hour expiration (${Math.round(timeSinceCache / 1000 / 60 / 60)} hours ago)`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Mark competitor edit time to trigger 2-minute cache invalidation (reduced from 15 for testing)
   * This ensures fresh data is fetched after competitor updates
   */
  static markCompetitorEdit(platform: string, accountHolder: string): void {
    const key = `competitor_edit_time_${platform}_${accountHolder}`;
    localStorage.setItem(key, Date.now().toString());
    console.log(`[CacheManager] Marked competitor edit time for ${platform}_${accountHolder}`);
  }

  /**
   * Mark cache time for 12-hour expiration tracking
   */
  static markCacheTime(platform: string, accountHolder: string, section?: string): void {
    const key = `last_cache_time_${platform}_${accountHolder}${section ? `_${section}` : ''}`;
    localStorage.setItem(key, Date.now().toString());
  }

  /**
   * Clear all cache data for a specific platform and account
   */
  static clearCache(platform: string, accountHolder: string): void {
    const patterns = [
      `viewed_strategies_${platform}_${accountHolder}`,
      `viewed_competitor_data_${platform}_${accountHolder}`,
      `viewed_posts_${platform}_${accountHolder}`,
      `viewed_${platform}_${accountHolder}`,
      `last_cache_time_${platform}_${accountHolder}`,
      `competitor_edit_time_${platform}_${accountHolder}`
    ];

    patterns.forEach(pattern => {
      // Clear exact matches
      localStorage.removeItem(pattern);
      
      // Clear section-specific cache times
      ['strategies', 'competitor', 'posts'].forEach(section => {
        localStorage.removeItem(`last_cache_time_${platform}_${accountHolder}_${section}`);
      });
    });

    console.log(`[CacheManager] Cleared all cache for ${platform}_${accountHolder}`);
  }

  /**
   * Get cache data with invalidation check
   */
  static getCacheData<T>(key: string, platform: string, accountHolder: string, section?: string): T | null {
    if (this.shouldInvalidateCache(platform, accountHolder, section)) {
      localStorage.removeItem(key);
      return null;
    }
    
    const data = localStorage.getItem(key);
    if (data) {
      this.markCacheTime(platform, accountHolder, section);
      return JSON.parse(data);
    }
    
    return null;
  }

  /**
   * Set cache data with timestamp
   */
  static setCacheData<T>(key: string, data: T, platform: string, accountHolder: string, section?: string): void {
    localStorage.setItem(key, JSON.stringify(data));
    this.markCacheTime(platform, accountHolder, section);
  }

  /**
   * Check if cache is fresh (not expired)
   */
  static isCacheFresh(platform: string, accountHolder: string, section?: string): boolean {
    return !this.shouldInvalidateCache(platform, accountHolder, section);
  }

  /**
   * Return true if consumers should bypass cached data and fetch fresh.
   */
  static shouldBypassCache(platform: string, accountHolder: string, section?: string): boolean {
    return this.shouldInvalidateCache(platform, accountHolder, section);
  }

  /**
   * Append cache-bypass params to URL when invalidation conditions apply.
   * Also refreshes the last-cache timestamp to avoid repeated bypasses unless needed.
   */
  static appendBypassParam(url: string, platform: string, accountHolder: string, section?: string): string {
    // --- NEW: Always bust cache for critical real-time sections ---
    const ALWAYS_BYPASS_SECTIONS = ['news', 'strategies'];

    try {
      if (!url) return url;

      // If section is critical – force fresh every time without touching last_cache_time
      if (section && ALWAYS_BYPASS_SECTIONS.includes(section)) {
        const separator = url.includes('?') ? '&' : '?';
        const timestamp = Date.now();
        // Include server-recognized param
        return `${url}${separator}forceRefresh=true&_cb=${timestamp}`;
      }

      // Idempotency: if bypass params already exist, don't add again
      if (/[?&]bypass_cache=/.test(url) || /[?&]_cb=/.test(url)) {
        this.markCacheTime(platform, accountHolder, section);
        return url;
      }

      const bypass = this.shouldBypassCache(platform, accountHolder, section);
      if (!bypass) {
        this.markCacheTime(platform, accountHolder, section);
        return url;
      }

      const separator = url.includes('?') ? '&' : '?';
      const stamped = `${url}${separator}bypass_cache=true&_cb=${Date.now()}`;
      // Mark cache time post-bypass to start fresh window
      this.markCacheTime(platform, accountHolder, section);
      return stamped;
    } catch {
      return url;
    }
  }
}

export default CacheManager;

// Named helper for convenient import without accessing class statics
export function appendBypassParam(
  url: string,
  platform: string,
  accountHolder: string,
  section?: string
): string {
  return CacheManager.appendBypassParam(url, platform, accountHolder, section);
}
