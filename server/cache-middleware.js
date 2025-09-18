// ===============================================================
// PERFORMANCE OPTIMIZATION: In-Memory Cache with Intelligent TTL
// ===============================================================
/**
 * 🚀 PERFORMANCE OPTIMIZATION: In-Memory Cache Middleware
 * 
 * This module provides intelligent caching for API responses with:
 * - Configurable TTL per data category
 * - Automatic cache invalidation
 * - Memory usage monitoring
 * - LRU eviction when memory threshold exceeded
 */

import crypto from 'crypto';

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
    
    // TTL configurations (in milliseconds)
    this.ttlConfig = {
      profileInfo: 5 * 60 * 1000,        // 5 minutes - Profile data changes infrequently
      processingStatus: 45 * 1000,       // 45 seconds - Matches/Exceeds poll interval to increase hit rate
      notifications: 30 * 1000,           // 30 seconds - Balance between freshness and performance
      usage: 60 * 1000,                   // 1 minute - Usage data updates frequently
      strategies: 5 * 60 * 1000,          // 5 minutes - Strategy data is relatively stable
      posts: 2 * 60 * 1000,               // 2 minutes - Posts update moderately
      competitors: 10 * 60 * 1000,        // 10 minutes - Competitor data changes slowly
      platformAccess: 60 * 1000,          // 60 seconds - Claimed state changes infrequently; invalidate on write
      default: 60 * 1000                  // 1 minute default TTL
    };
    
    // Start cleanup interval (every 90 seconds - less aggressive)
    this.startCleanupInterval();
    
    // Monitor memory usage
    this.monitorMemory();
  }
  
  // Generate cache key from request parameters
  generateKey(category, ...params) {
    const keyData = `${category}:${params.join(':')}`;
    return crypto.createHash('md5').update(keyData).digest('hex');
  }
  
  // Get item from cache
  get(category, ...params) {
    const key = this.generateKey(category, ...params);
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return item.data;
  }
  
  // Set item in cache
  set(category, data, ...params) {
    const key = this.generateKey(category, ...params);
    const ttl = this.ttlConfig[category] || this.ttlConfig.default;
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      category,
      createdAt: Date.now()
    });
    
    this.stats.sets++;
    
    // Implement LRU if cache gets too large (>5000 entries)
    // 🚀 PERFORMANCE FIX: Increased from 1000 to 5000 to reduce cache thrashing
    // Previous setting caused 99% cache turnover (90 evictions vs 91 sets)
    if (this.cache.size > 5000) {
      this.evictOldest();
    }
  }
  
  // Invalidate cache entries by category or specific key
  invalidate(category, ...params) {
    if (params.length === 0) {
      // Invalidate all entries in category
      let deleted = 0;
      for (const [key, item] of this.cache.entries()) {
        if (item.category === category) {
          this.cache.delete(key);
          deleted++;
        }
      }
      this.stats.deletes += deleted;
      console.log(`[CACHE] Invalidated ${deleted} entries in category: ${category}`);
    } else {
      // Invalidate specific entry
      const key = this.generateKey(category, ...params);
      if (this.cache.delete(key)) {
        this.stats.deletes++;
        console.log(`[CACHE] Invalidated entry: ${category}:${params.join(':')}`);
      }
    }
  }
  
  // Invalidate related cache entries when data changes
  invalidateRelated(category, userId, platform) {
    const patterns = {
      profileInfo: ['profileInfo', 'usage'],
      posts: ['posts', 'usage'],
      notifications: ['notifications'],
      processingStatus: ['processingStatus'],
      usage: ['usage']
    };
    
    const toInvalidate = patterns[category] || [category];
    toInvalidate.forEach(cat => {
      this.invalidate(cat, userId, platform);
    });
  }
  
  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      console.log(`[CACHE] Cleaned up ${cleaned} expired entries`);
    }
  }
  
  // Evict oldest entries when cache is too large
  evictOldest() {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    
    const toEvict = Math.floor(entries.length * 0.1); // Evict oldest 10%
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
      this.stats.evictions++;
    }
    
    console.log(`[CACHE] Evicted ${toEvict} oldest entries (LRU)`);
  }
  
  // Start cleanup interval
  startCleanupInterval() {
    setInterval(() => {
      this.cleanup();
    }, 90000); // Every 90 seconds - aligned with longer TTLs
  }
  
  // Monitor memory usage
  monitorMemory() {
    setInterval(() => {
      const used = process.memoryUsage();
      const cacheSize = this.cache.size;
      const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
      
      console.log(`[CACHE STATS] Size: ${cacheSize} | Hit Rate: ${(hitRate * 100).toFixed(1)}% | Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
      console.log(`[CACHE STATS] Hits: ${this.stats.hits} | Misses: ${this.stats.misses} | Sets: ${this.stats.sets} | Evictions: ${this.stats.evictions}`);
    }, 60000); // Every minute
  }
  
  // Clear entire cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[CACHE] Cleared ${size} entries`);
  }
  
  // Get cache statistics
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: (hitRate * 100).toFixed(1) + '%',
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    };
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

// Cache middleware factory
function cacheMiddleware(category, keyExtractor) {
  return async (req, res, next) => {
    // Skip caching for POST, PUT, DELETE requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Skip if force refresh is requested
    if (req.query.forceRefresh === 'true' || req.query.bypass_cache === 'true') {
      console.log(`[CACHE] Skipping cache for ${category} (force refresh)`);
      return next();
    }
    
    // Extract cache key parameters
    const keyParams = keyExtractor(req);
    if (!keyParams || keyParams.length === 0) {
      return next();
    }
    
    // Check cache
    const cachedData = cacheManager.get(category, ...keyParams);
    if (cachedData) {
      console.log(`[CACHE] HIT for ${category}:${keyParams.join(':')}`);
      
      // Add cache headers
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-TTL', cacheManager.ttlConfig[category] || cacheManager.ttlConfig.default);
      
      return res.json(cachedData);
    }
    
    console.log(`[CACHE] MISS for ${category}:${keyParams.join(':')}`);
    
    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data) {
        cacheManager.set(category, data, ...keyParams);
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-TTL', cacheManager.ttlConfig[category] || cacheManager.ttlConfig.default);
      }
      return originalJson(data);
    };
    
    next();
  };
}

// Export cache manager and middleware
export { cacheMiddleware, cacheManager };
