// Frontend-only image optimization cache
// This cache stores optimized images in memory to avoid re-processing

class FrontendImageCache {
  private cache = new Map<string, string>();
  private maxCacheSize = 50; // Limit cache size to prevent memory issues
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;

  // Generate cache key based on URL and optimization settings
  private generateCacheKey(url: string, quality: number, maxWidth: number, enableWebP: boolean): string {
    const webpSuffix = enableWebP ? '_webp' : '';
    return `${url}_q${quality}_w${maxWidth}${webpSuffix}`;
  }

  // Get optimized image from cache
  get(url: string, quality: number, maxWidth: number, enableWebP: boolean): string | null {
    const key = this.generateCacheKey(url, quality, maxWidth, enableWebP);
    const cached = this.cache.get(key);
    
    if (cached) {
      // Update access order for LRU
      this.accessOrder.set(key, ++this.accessCounter);
      console.log(`[ImageCache] ✅ Cache hit for: ${url.substring(0, 50)}...`);
      return cached;
    }
    
    return null;
  }

  // Store optimized image in cache
  set(url: string, optimizedData: string, quality: number, maxWidth: number, enableWebP: boolean): void {
    const key = this.generateCacheKey(url, quality, maxWidth, enableWebP);
    
    // If cache is full, remove least recently used item
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, optimizedData);
    this.accessOrder.set(key, ++this.accessCounter);
    
    console.log(`[ImageCache] 💾 Cached optimized image: ${url.substring(0, 50)}... (${this.cache.size}/${this.maxCacheSize})`);
  }

  // Evict least recently used item
  private evictLRU(): void {
    let lruKey = '';
    let minAccess = Infinity;
    
    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < minAccess) {
        minAccess = accessTime;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      console.log(`[ImageCache] 🗑️ Evicted LRU item from cache`);
    }
  }

  // Clear cache (useful for memory management)
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    console.log(`[ImageCache] 🧹 Cache cleared`);
  }

  // Get cache statistics
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }

  // Check if image is already being processed (to prevent duplicate work)
  private processingSet = new Set<string>();

  isProcessing(url: string, quality: number, maxWidth: number, enableWebP: boolean): boolean {
    const key = this.generateCacheKey(url, quality, maxWidth, enableWebP);
    return this.processingSet.has(key);
  }

  setProcessing(url: string, quality: number, maxWidth: number, enableWebP: boolean): void {
    const key = this.generateCacheKey(url, quality, maxWidth, enableWebP);
    this.processingSet.add(key);
  }

  clearProcessing(url: string, quality: number, maxWidth: number, enableWebP: boolean): void {
    const key = this.generateCacheKey(url, quality, maxWidth, enableWebP);
    this.processingSet.delete(key);
  }
}

// Global instance
const frontendImageCache = new FrontendImageCache();

export default frontendImageCache;
