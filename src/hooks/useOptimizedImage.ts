import { useState, useEffect, useCallback } from 'react';
import { imageOptimizationService } from '../services/ImageOptimizationService';

interface UseOptimizedImageOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'webp' | 'png';
  enableOptimization?: boolean;
}

interface UseOptimizedImageReturn {
  src: string;
  isOptimizing: boolean;
  isOptimized: boolean;
  originalSize?: number;
  optimizedSize?: number;
  compressionRatio?: number;
}

/**
 * Hook for optimized image loading with automatic compression
 */
export const useOptimizedImage = (
  originalSrc: string,
  options: UseOptimizedImageOptions = {}
): UseOptimizedImageReturn => {
  const {
    quality = 0.7,
    maxWidth = 800,
    maxHeight = 600,
    format = 'jpeg',
    enableOptimization = true
  } = options;

  const [src, setSrc] = useState(originalSrc);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [originalSize, setOriginalSize] = useState<number>();
  const [optimizedSize, setOptimizedSize] = useState<number>();

  // Calculate compression ratio
  const compressionRatio = originalSize && optimizedSize 
    ? Math.round(((originalSize - optimizedSize) / originalSize) * 100)
    : undefined;

  // Handle image optimization
  const optimizeImage = useCallback(async () => {
    if (!enableOptimization || !originalSrc) return;

    setIsOptimizing(true);
    
    try {
      const optimizedUrl = await imageOptimizationService.getOptimizedImageUrl(
        originalSrc,
        { quality, maxWidth, maxHeight, format }
      );
      
      // Get sizes for comparison
      if (optimizedUrl !== originalSrc) {
        try {
          const [originalBlob, optimizedBlob] = await Promise.all([
            fetch(originalSrc).then(r => r.blob()),
            fetch(optimizedUrl).then(r => r.blob())
          ]);
          
          setOriginalSize(originalBlob.size);
          setOptimizedSize(optimizedBlob.size);
        } catch (error) {
          console.warn('[useOptimizedImage] Failed to get size comparison:', error);
        }
      }
      
      setSrc(optimizedUrl);
      setIsOptimized(optimizedUrl !== originalSrc);
    } catch (error) {
      console.warn('[useOptimizedImage] Optimization failed:', error);
      setSrc(originalSrc);
      setIsOptimized(false);
    } finally {
      setIsOptimizing(false);
    }
  }, [originalSrc, quality, maxWidth, maxHeight, format, enableOptimization]);

  // Listen for optimization completion
  useEffect(() => {
    const handleImageOptimized = (event: CustomEvent) => {
      const { optimizedUrl } = event.detail;
      if (optimizedUrl && src !== optimizedUrl) {
        setSrc(optimizedUrl);
        setIsOptimized(true);
        setIsOptimizing(false);
      }
    };

    window.addEventListener('imageOptimized', handleImageOptimized as EventListener);
    return () => {
      window.removeEventListener('imageOptimized', handleImageOptimized as EventListener);
    };
  }, [src]);

  // Start optimization when source changes
  useEffect(() => {
    if (originalSrc) {
      setSrc(originalSrc);
      setIsOptimized(false);
      optimizeImage();
    }
  }, [originalSrc, optimizeImage]);

  return {
    src,
    isOptimizing,
    isOptimized,
    originalSize,
    optimizedSize,
    compressionRatio
  };
};

/**
 * Hook for batch image preloading and optimization
 */
export const useImagePreloader = () => {
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());
  const [isPreloading, setIsPreloading] = useState(false);

  const preloadImages = useCallback(async (
    urls: string[], 
    options: UseOptimizedImageOptions = {}
  ) => {
    setIsPreloading(true);
    
    try {
      await Promise.all(
        urls.map(url => imageOptimizationService.preloadImage(url, options))
      );
      
      setPreloadedImages(prev => new Set([...prev, ...urls]));
    } catch (error) {
      console.warn('[useImagePreloader] Preloading failed:', error);
    } finally {
      setIsPreloading(false);
    }
  }, []);

  const isPreloaded = useCallback((url: string) => {
    return preloadedImages.has(url);
  }, [preloadedImages]);

  return {
    preloadImages,
    isPreloading,
    isPreloaded,
    preloadedCount: preloadedImages.size
  };
};

export default useOptimizedImage;
