import React, { useState, useCallback, useRef, useEffect } from 'react';
import frontendImageCache from '../../utils/frontendImageCache';
import './OptimizedImage.css';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onLoadStart?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLImageElement>) => void;
  key?: string;
  // Optimization options
  quality?: number; // 0.1 to 1.0, default 0.8
  maxWidth?: number; // max width for mobile optimization, default 800
  enableOptimization?: boolean; // default true
  enableWebP?: boolean; // convert to WebP if supported, default true
  // NEW: Dual quality system for PostCooked
  preserveOriginalForActions?: boolean; // Keep original URL for preview/download, default false
  aggressiveMobileOptimization?: boolean; // Extra aggressive mobile compression, default false
  enableProgressiveLoading?: boolean; // Blur-to-sharp transition, default false
  // PERFORMANCE: CLS Prevention
  width?: number; // Known width to prevent layout shift
  height?: number; // Known height to prevent layout shift
  aspectRatio?: string; // CSS aspect-ratio (e.g., "16/9", "1/1")
  isLCP?: boolean; // Mark as LCP element to skip heavy optimization
  // Responsive delivery
  sizes?: string; // e.g. "(max-width: 768px) 100vw, 600px"
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  style,
  onLoad,
  onError,
  onLoadStart,
  onContextMenu,
  quality = 0.8,
  maxWidth = 800,
  enableOptimization = true,
  enableWebP = true,
  preserveOriginalForActions = false,
  aggressiveMobileOptimization = false,
  enableProgressiveLoading = false,
  width,
  height,
  aspectRatio,
  isLCP = false,
  sizes,
  ...props
}) => {
  const [optimizedSrc, setOptimizedSrc] = useState<string>(src);
  const [originalSrc] = useState<string>(src); // Store original for actions
  const [isLoaded, setIsLoaded] = useState(false);
  const [showBlur, setShowBlur] = useState(enableProgressiveLoading);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fallbackToOriginal, setFallbackToOriginal] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Debug logging
  const debug = process.env.NODE_ENV === 'development';
  
  useEffect(() => {
    if (debug) {
      console.log(`[OptimizedImage] Source changed: ${src?.substring(0, 80)}...`);
      console.log(`[OptimizedImage] Optimization enabled: ${enableOptimization}`);
    }
  }, [src, enableOptimization, debug]);

  // Detect if we're on mobile for more aggressive optimization
  const isMobile = useCallback(() => {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  // Check WebP support
  const supportsWebP = useCallback(() => {
    if (!enableWebP) return false;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('webp') > 0;
  }, [enableWebP]);

  // Smart quality adjustment based on device and connection
  const getOptimalQuality = useCallback(() => {
    if (!enableOptimization) return 1.0;
    
    const connection = (navigator as any).connection;
    const effectiveType = connection?.effectiveType;
    
    // AGGRESSIVE mobile optimization for PostCooked
    if (isMobile()) {
      if (aggressiveMobileOptimization) {
        // Extra aggressive for PostCooked module
        if (effectiveType === 'slow-2g' || effectiveType === '2g') return 0.3;
        if (effectiveType === '3g') return 0.4;
        return 0.5; // Much more aggressive mobile quality
      }
      // Standard mobile optimization
      if (effectiveType === 'slow-2g' || effectiveType === '2g') return 0.5;
      if (effectiveType === '3g') return 0.6;
      return 0.7;
    }
    
    // Desktop optimization
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 0.6;
    if (effectiveType === '3g') return 0.7;
    return quality;
  }, [quality, enableOptimization, isMobile, aggressiveMobileOptimization]);

  // Get optimal dimensions with aggressive mobile scaling
  const getOptimalDimensions = useCallback((originalWidth: number, originalHeight: number) => {
    if (!enableOptimization) return { width: originalWidth, height: originalHeight };
    
    let targetMaxWidth = maxWidth;
    
    if (isMobile()) {
      if (aggressiveMobileOptimization) {
        // Much smaller dimensions for PostCooked mobile display
        targetMaxWidth = Math.min(maxWidth, 400); // Reduced from 600 to 400
      } else {
        targetMaxWidth = Math.min(maxWidth, 600);
      }
    }
    
    if (originalWidth <= targetMaxWidth) {
      return { width: originalWidth, height: originalHeight };
    }
    
    const ratio = originalHeight / originalWidth;
    return {
      width: targetMaxWidth,
      height: Math.round(targetMaxWidth * ratio)
    };
  }, [maxWidth, enableOptimization, isMobile, aggressiveMobileOptimization]);

  // Optimize image using canvas
  const optimizeImage = useCallback(async (imageElement: HTMLImageElement): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const canvas = canvasRef.current || document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        const { width, height } = getOptimalDimensions(imageElement.naturalWidth, imageElement.naturalHeight);
        
        canvas.width = width;
        canvas.height = height;

        // Use high-quality image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the image
        ctx.drawImage(imageElement, 0, 0, width, height);

        // Convert to optimized format
        const outputFormat = supportsWebP() ? 'image/webp' : 'image/jpeg';
        const optimalQuality = getOptimalQuality();
        
        const optimizedDataUrl = canvas.toDataURL(outputFormat, optimalQuality);
        
        resolve(optimizedDataUrl);
      } catch (error) {
        console.error('[OptimizedImage] Optimization failed:', error);
        reject(error);
      }
    });
  }, [getOptimalDimensions, supportsWebP, getOptimalQuality]);

  // Load and optimize image
  const loadAndOptimize = useCallback(async () => {
    // PERFORMANCE: Skip heavy optimization for LCP images to improve INP
    if (!enableOptimization || fallbackToOriginal || isLCP) {
      if (debug && isLCP) {
        console.log('[OptimizedImage] Skipping optimization for LCP image to improve performance');
      }
      setOptimizedSrc(src);
      return;
    }

    // Check cache first
    const cached = frontendImageCache.get(src, getOptimalQuality(), maxWidth, enableWebP);
    if (cached) {
      setOptimizedSrc(cached);
      return;
    }

    // Check if already processing to avoid duplicate work
    if (frontendImageCache.isProcessing(src, getOptimalQuality(), maxWidth, enableWebP)) {
      return;
    }

    setIsProcessing(true);
    frontendImageCache.setProcessing(src, getOptimalQuality(), maxWidth, enableWebP);
    
    try {
      // Create a temporary image to load the original
      const tempImg = new Image();
      
      // Determine if URL is truly external by comparing origins safely
      let isExternalUrl = false;
      try {
        const parsed = new URL(src, window.location.origin);
        isExternalUrl = parsed.origin !== window.location.origin;
      } catch {
        // If URL can't be parsed, assume same-origin relative path
        isExternalUrl = false;
      }

      // Set crossOrigin only for truly external URLs
      if (isExternalUrl) {
        tempImg.crossOrigin = 'anonymous';
      } else {
        // For same-origin requests, do not set crossOrigin to avoid unnecessary CORS behavior
        tempImg.crossOrigin = null;
      }
      
      tempImg.onload = async () => {
        try {
          if (debug) {
            console.log(`[OptimizedImage] Image loaded for optimization: ${tempImg.naturalWidth}x${tempImg.naturalHeight}`);
          }
          
          const optimized = await optimizeImage(tempImg);
          
          // Skip optimization for images that are already reasonably sized
          const isAlreadyOptimal = tempImg.naturalWidth <= 800 && tempImg.naturalHeight <= 800;
          const originalEstimate = src.length;
          const optimizedSize = optimized.length;
          const sizeDifference = originalEstimate - optimizedSize;
          const isBeneficial = !isAlreadyOptimal && sizeDifference > 512; // Reduced threshold and skip small images
          
          if (isBeneficial) {
            // Cache the optimized result
            frontendImageCache.set(src, optimized, getOptimalQuality(), maxWidth, enableWebP);
            
            setOptimizedSrc(optimized);
            
            // Calculate and log size reduction
            const compressionRatio = Math.round((sizeDifference / originalEstimate) * 100);
            
            if (debug) {
              console.log(`[OptimizedImage] ✅ Optimization beneficial: ~${Math.round(originalEstimate/1024)}KB → ${Math.round(optimizedSize/1024)}KB (${compressionRatio}% smaller)`);
            }
          } else {
            if (debug) {
              console.log(`[OptimizedImage] 📊 Optimization not beneficial, keeping original`);
            }
            setFallbackToOriginal(true);
          }
        } catch (error) {
          console.warn('[OptimizedImage] Optimization failed, using original:', error);
          setFallbackToOriginal(true);
        } finally {
          setIsProcessing(false);
          frontendImageCache.clearProcessing(src, getOptimalQuality(), maxWidth, enableWebP);
        }
      };
      
      tempImg.onerror = (e) => {
        // Only log in development and avoid noise for known proxy-image cases
        if (debug && !src.includes('/api/proxy-image')) {
          console.warn('[OptimizedImage] Failed to load original image for optimization, using as-is:', e);
        }
        // CRITICAL FIX: Set optimizedSrc to original src to ensure fallback displays
        setOptimizedSrc(src);
        setFallbackToOriginal(true);
        setIsProcessing(false);
        frontendImageCache.clearProcessing(src, getOptimalQuality(), maxWidth, enableWebP);
      };
      
      tempImg.src = src;
    } catch (error) {
      console.error('[OptimizedImage] Load and optimize failed:', error);
      // CRITICAL FIX: Set optimizedSrc to original src to ensure fallback displays
      setOptimizedSrc(src);
      setFallbackToOriginal(true);
      setIsProcessing(false);
      frontendImageCache.clearProcessing(src, getOptimalQuality(), maxWidth, enableWebP);
    }
  }, [src, enableOptimization, fallbackToOriginal, optimizeImage, getOptimalQuality, maxWidth, enableWebP]);

  // Effect to load and optimize when src changes
  useEffect(() => {
    // Reset states when src changes
    setFallbackToOriginal(false);
    setIsProcessing(false);
    
    if (!src) {
      setOptimizedSrc('');
      return;
    }
    
    if (src.startsWith('data:')) {
      // Already optimized or base64, use as-is
      setOptimizedSrc(src);
      return;
    }
    
    // Always start with the original image for immediate display
    setOptimizedSrc(src);
    
    if (enableOptimization) {
      // Small delay to batch optimization requests and allow original to show first
      const timer = setTimeout(() => {
        loadAndOptimize();
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [src, loadAndOptimize, enableOptimization]);

  // Handle image load event with progressive loading
  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
    
    // Progressive loading effect
    if (enableProgressiveLoading && showBlur) {
      setTimeout(() => setShowBlur(false), 100);
    }
    
    if (onLoad) {
      onLoad(e);
    }
  }, [onLoad, enableProgressiveLoading, showBlur]);

  // Build responsive srcset for our R2 endpoint if applicable
  const buildResponsiveSources = useCallback((baseSrc: string) => {
    try {
      // Only build srcset for our image endpoint to avoid third-party URLs
      if (!baseSrc || !/\/api\/r2-image\//.test(baseSrc)) {
        return { src: baseSrc, srcSet: undefined, sizes: undefined };
      }

      const url = new URL(baseSrc, window.location.origin);
      const widths = [320, 480, 640, 768, 960, 1200];
      const q = isMobile() ? 70 : 82;
      const format = 'webp';
      const srcSetEntries: string[] = widths.map(w => {
        const u = new URL(url.toString());
        u.searchParams.set('w', String(w));
        u.searchParams.set('q', String(q));
        u.searchParams.set('format', format);
        return `${u.toString()} ${w}w`;
      });

      // Prefer eager load for LCP image
      const computedSizes = sizes || '(max-width: 768px) 100vw, 600px';
      return { src: baseSrc, srcSet: srcSetEntries.join(', '), sizes: computedSizes };
    } catch {
      return { src: baseSrc, srcSet: undefined, sizes: undefined };
    }
  }, [sizes, isMobile]);

  // Handle image error event with HTTP2 retry logic
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    const currentSrc = img.src;
    
    // If optimized version fails and we haven't tried original yet, try original
    if (!fallbackToOriginal && optimizedSrc !== src) {
      // Only log optimization failures for non-proxy images to reduce noise
      if (!src.includes('/api/proxy-image')) {
        console.warn('[OptimizedImage] Optimized version failed, falling back to original');
      }
      setFallbackToOriginal(true);
      setOptimizedSrc(src);
      return;
    }
    
    // HTTP2 Protocol Error Retry Logic
    // If this is an API image that failed, try adding cache-busting parameters
    if (currentSrc.includes('/api/r2-image/') || currentSrc.includes('/api/proxy-image')) {
      try {
        const url = new URL(currentSrc);
        
        // Add retry parameter if not already present
        if (!url.searchParams.has('retry')) {
          console.log('[OptimizedImage] HTTP2 error detected, retrying with cache-busting');
          url.searchParams.set('retry', '1');
          url.searchParams.set('t', Date.now().toString());
          setOptimizedSrc(url.toString());
          return;
        }
        
        // If already retried once, try removing query params for simpler request
        if (url.searchParams.has('retry') && !url.searchParams.has('simple')) {
          console.log('[OptimizedImage] Retry failed, trying simplified request');
          const basePath = url.pathname;
          const simpleUrl = `${url.origin}${basePath}?simple=1&t=${Date.now()}`;
          setOptimizedSrc(simpleUrl);
          return;
        }
      } catch (urlError) {
        console.warn('[OptimizedImage] Could not parse URL for retry:', urlError);
      }
    }
    
    // If the original/proxy image fails, try direct URL if available
    if (src.includes('/api/proxy-image?url=')) {
      try {
        const urlParam = new URLSearchParams(src.split('?')[1]).get('url');
        if (urlParam) {
          const directUrl = decodeURIComponent(urlParam);
          console.log('[OptimizedImage] Proxy image failed, trying direct URL');
          setOptimizedSrc(directUrl);
          return;
        }
      } catch (parseError) {
        console.warn('[OptimizedImage] Could not parse proxy URL:', parseError);
      }
    }
    
    console.error('[OptimizedImage] All fallback attempts failed for:', currentSrc);
    
    if (onError) {
      onError(e);
    }
  }, [onError, fallbackToOriginal, optimizedSrc, src]);

  // Store original URL for potential future use

  return (
    <>
      {/* Hidden canvas for image optimization */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* The actual image with progressive loading */}
      <img
        ref={imgRef}
        src={optimizedSrc}
        alt={alt}
        width={width}
        height={height}
        className={`optimized-image ${className} ${isProcessing ? 'optimizing' : ''} ${enableProgressiveLoading && showBlur ? 'blur-loading' : ''} ${isLoaded ? 'loaded' : ''} ${isLCP ? 'lcp-image' : ''}`}
        style={{
          ...style,
          aspectRatio: aspectRatio,
          filter: enableProgressiveLoading && showBlur ? 'blur(8px)' : 'none',
          transition: enableProgressiveLoading ? 'filter 0.3s ease-out' : 'none'
        }}
        onLoad={handleLoad}
        onError={handleError}
        onLoadStart={onLoadStart}
        onContextMenu={onContextMenu}
        data-original-src={preserveOriginalForActions ? originalSrc : undefined}
        {...(isLCP && { fetchpriority: 'high' })}
        decoding={isLCP ? 'sync' : 'async'}
        loading={isLCP ? 'eager' : 'lazy'}
        {...(() => {
          const r = buildResponsiveSources(optimizedSrc);
          const dynProps: any = {};
          if (r.srcSet) dynProps.srcSet = r.srcSet;
          if (r.sizes) dynProps.sizes = r.sizes;
          return dynProps;
        })()}
        {...props}
      />
    </>
  );
};

export default OptimizedImage;
