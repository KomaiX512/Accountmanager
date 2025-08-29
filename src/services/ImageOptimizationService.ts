// Frontend Image Optimization Middleware
// This middleware provides client-side image optimization without affecting backend storage

class ImageOptimizationService {
  private cache: Map<string, string> = new Map();
  private compressionQueue: Set<string> = new Set();
  
  constructor() {
    // Clear cache on page refresh to prevent memory leaks
    window.addEventListener('beforeunload', () => {
      this.clearCache();
    });
  }

  /**
   * Get optimized image URL with caching
   */
  async getOptimizedImageUrl(
    originalUrl: string, 
    options: {
      quality?: number;
      maxWidth?: number;
      maxHeight?: number;
      format?: 'jpeg' | 'webp' | 'png';
    } = {}
  ): Promise<string> {
    const cacheKey = this.generateCacheKey(originalUrl, options);
    
    // Return cached version if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Return original URL if already processing
    if (this.compressionQueue.has(cacheKey)) {
      return originalUrl;
    }

    // Start compression in background
    this.compressionQueue.add(cacheKey);
    this.compressImageAsync(originalUrl, options, cacheKey);
    
    return originalUrl; // Return original while processing
  }

  /**
   * Compress image asynchronously
   */
  private async compressImageAsync(
    originalUrl: string, 
    options: any, 
    cacheKey: string
  ): Promise<void> {
    try {
      const optimizedUrl = await this.compressImage(originalUrl, options);
      this.cache.set(cacheKey, optimizedUrl);
      
      // Trigger re-render for components using this image
      this.notifyImageReady(cacheKey, optimizedUrl);
    } catch (error) {
      console.warn('[ImageOptimization] Failed to compress image:', error);
      this.cache.set(cacheKey, originalUrl); // Cache original as fallback
    } finally {
      this.compressionQueue.delete(cacheKey);
    }
  }

  /**
   * Compress image using canvas
   */
  private async compressImage(
    imageUrl: string, 
    options: {
      quality?: number;
      maxWidth?: number;
      maxHeight?: number;
      format?: 'jpeg' | 'webp' | 'png';
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve(imageUrl);
            return;
          }

          // Calculate optimal dimensions
          const { maxWidth = 800, maxHeight = 600, quality = 0.7, format = 'jpeg' } = options;
          
          let { width, height } = this.calculateOptimalDimensions(
            img.naturalWidth, 
            img.naturalHeight, 
            maxWidth, 
            maxHeight
          );

          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;

          // Configure for quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to optimized format
          const mimeType = format === 'png' ? 'image/png' : 
                          format === 'webp' ? 'image/webp' : 'image/jpeg';
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(URL.createObjectURL(blob));
              } else {
                resolve(imageUrl);
              }
            },
            mimeType,
            quality
          );
        } catch (error) {
          resolve(imageUrl);
        }
      };
      
      img.onerror = () => resolve(imageUrl);
      img.src = imageUrl;
    });
  }

  /**
   * Calculate optimal dimensions maintaining aspect ratio
   */
  private calculateOptimalDimensions(
    originalWidth: number, 
    originalHeight: number, 
    maxWidth: number, 
    maxHeight: number
  ): { width: number; height: number } {
    let width = originalWidth;
    let height = originalHeight;
    
    // Scale down if too large
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }
    
    return { width: Math.round(width), height: Math.round(height) };
  }

  /**
   * Generate cache key for image and options
   */
  private generateCacheKey(url: string, options: any): string {
    const optionsString = JSON.stringify(options);
    return `${url}_${btoa(optionsString)}`;
  }

  /**
   * Notify components that image is ready
   */
  private notifyImageReady(cacheKey: string, optimizedUrl: string): void {
    // Dispatch custom event for components to listen to
    window.dispatchEvent(new CustomEvent('imageOptimized', {
      detail: { cacheKey, optimizedUrl }
    }));
  }

  /**
   * Clear all cached images
   */
  clearCache(): void {
    // Revoke all blob URLs to prevent memory leaks
    this.cache.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Preload and optimize image
   */
  async preloadImage(url: string, options: any = {}): Promise<void> {
    await this.getOptimizedImageUrl(url, options);
  }

  /**
   * Check if image optimization is supported
   */
  static isSupported(): boolean {
    return !!(
      window.HTMLCanvasElement && 
      window.URL && 
      window.URL.createObjectURL &&
      typeof document.createElement('canvas').getContext === 'function'
    );
  }

  /**
   * Detect optimal format support
   */
  static async detectOptimalFormat(): Promise<'webp' | 'jpeg'> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      
      canvas.toBlob(
        (blob) => resolve(blob ? 'webp' : 'jpeg'),
        'image/webp',
        0.8
      );
    });
  }
}

// Export singleton instance
export const imageOptimizationService = new ImageOptimizationService();
export default ImageOptimizationService;
