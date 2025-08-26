/**
 * Production-safe image error handling utility
 * Prevents debugging interfaces from appearing to users
 */

const PRODUCTION_MODE = process.env.NODE_ENV === 'production';

export class ImageErrorHandler {
  private static instance: ImageErrorHandler;
  private errorCount = 0;
  private readonly MAX_ERRORS = 50; // Prevent spam

  private constructor() {}

  static getInstance(): ImageErrorHandler {
    if (!ImageErrorHandler.instance) {
      ImageErrorHandler.instance = new ImageErrorHandler();
    }
    return ImageErrorHandler.instance;
  }

  /**
   * Handle image loading errors without exposing debug information
   * @param imageUrl - The URL that failed to load
   * @param context - Context for internal logging only
   * @returns A safe fallback image URL
   */
  handleImageError(imageUrl: string, context = 'unknown'): string {
    this.errorCount++;
    
    // In production, suppress all debug logs and interfaces
    if (PRODUCTION_MODE) {
      // Return a safe fallback without any debugging
      return '/fallback.jpg';
    }

    // In development, limit error logging to prevent spam
    if (this.errorCount <= this.MAX_ERRORS) {
      console.warn(`[ImageError:${context}] Failed to load: ${imageUrl}`);
    } else if (this.errorCount === this.MAX_ERRORS + 1) {
      console.warn(`[ImageError] Suppressing further image error logs...`);
    }

    return '/fallback.jpg';
  }

  /**
   * Create a safe error handler for image elements
   * @param context - Context for logging
   * @returns Error handler function
   */
  createImageErrorHandler(context = 'image') {
    return (event: Event) => {
      const img = event.target as HTMLImageElement;
      if (img) {
        const fallbackUrl = this.handleImageError(img.src, context);
        img.src = fallbackUrl;
      }
    };
  }

  /**
   * Safely handle fetch errors for images
   * @param url - Original URL
   * @param error - Fetch error
   * @param context - Context for logging
   * @returns Promise resolving to fallback image blob or null
   */
  async handleFetchError(url: string, error: any, context = 'fetch'): Promise<Blob | null> {
    // Never expose error details in production
    if (!PRODUCTION_MODE && this.errorCount <= this.MAX_ERRORS) {
      console.warn(`[ImageFetch:${context}] Error fetching ${url}:`, error.message);
    }

    this.errorCount++;

    try {
      // Try to fetch fallback image
      const response = await fetch('/fallback.jpg');
      if (response.ok) {
        return await response.blob();
      }
    } catch (fallbackError) {
      // Even fallback failed - return null to prevent further errors
      if (!PRODUCTION_MODE) {
        console.warn(`[ImageFetch:${context}] Fallback image also failed`);
      }
    }

    return null;
  }

  /**
   * Reset error count (useful for testing or after recovery)
   */
  reset(): void {
    this.errorCount = 0;
  }

  /**
   * Get current error count (for monitoring)
   */
  getErrorCount(): number {
    return this.errorCount;
  }
}

// Export singleton instance
export const imageErrorHandler = ImageErrorHandler.getInstance();

/**
 * Production-safe image URL validator
 * Prevents exposure of internal URLs to users
 */
export function sanitizeImageUrl(url: string): string {
  if (!url) return '/fallback.jpg';
  
  // In production, never expose localhost URLs to users
  if (PRODUCTION_MODE && url.includes('localhost')) {
    return '/fallback.jpg';
  }
  
  // Block any URLs that look like debugging endpoints
  const debugPatterns = [
    /debug/i,
    /test/i,
    /placeholder.*message/i,
    /error/i,
    /cache.*test/i
  ];
  
  for (const pattern of debugPatterns) {
    if (pattern.test(url)) {
      return '/fallback.jpg';
    }
  }
  
  return url;
}

/**
 * Create a safe img element with proper error handling
 */
export function createSafeImageElement(src: string, alt = '', className = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.src = sanitizeImageUrl(src);
  img.alt = alt;
  img.className = className;
  
  // Add production-safe error handler
  img.onerror = imageErrorHandler.createImageErrorHandler('safe-img');
  
  return img;
}
