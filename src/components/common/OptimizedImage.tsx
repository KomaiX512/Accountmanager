import React, { useState, useCallback, useRef, useEffect } from 'react';
import frontendImageCache from '../../utils/frontendImageCache';

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
  ...props
}) => {
  const [optimizedSrc, setOptimizedSrc] = useState<string>(src);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fallbackToOriginal, setFallbackToOriginal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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
    
    // More aggressive compression on mobile and slow connections
    if (isMobile()) {
      if (effectiveType === 'slow-2g' || effectiveType === '2g') return 0.5;
      if (effectiveType === '3g') return 0.6;
      return 0.7; // Default mobile quality
    }
    
    // Desktop optimization
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 0.6;
    if (effectiveType === '3g') return 0.7;
    return quality; // Use provided quality or default 0.8
  }, [quality, enableOptimization, isMobile]);

  // Get optimal dimensions
  const getOptimalDimensions = useCallback((originalWidth: number, originalHeight: number) => {
    if (!enableOptimization) return { width: originalWidth, height: originalHeight };
    
    const mobileMaxWidth = isMobile() ? Math.min(maxWidth, 600) : maxWidth;
    
    if (originalWidth <= mobileMaxWidth) {
      return { width: originalWidth, height: originalHeight };
    }
    
    const ratio = originalHeight / originalWidth;
    return {
      width: mobileMaxWidth,
      height: Math.round(mobileMaxWidth * ratio)
    };
  }, [maxWidth, enableOptimization, isMobile]);

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
    if (!enableOptimization || fallbackToOriginal) {
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
      
      // Don't set crossOrigin for same-origin requests or if CORS might fail
      const isExternalUrl = src.startsWith('http') && !src.includes(window.location.origin);
      if (!isExternalUrl) {
        // For same-origin requests, don't set crossOrigin
        tempImg.crossOrigin = undefined;
      } else {
        tempImg.crossOrigin = 'anonymous';
      }
      
      tempImg.onload = async () => {
        try {
          if (debug) {
            console.log(`[OptimizedImage] Image loaded for optimization: ${tempImg.naturalWidth}x${tempImg.naturalHeight}`);
          }
          
          const optimized = await optimizeImage(tempImg);
          
          // Only use optimized version if it's actually smaller or significantly different
          const originalEstimate = src.length;
          const optimizedSize = optimized.length;
          const sizeDifference = originalEstimate - optimizedSize;
          const isBeneficial = sizeDifference > 1024; // Only if saves at least 1KB
          
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
        console.warn('[OptimizedImage] Failed to load original image for optimization, using as-is:', e);
        setOptimizedSrc(src);
        setFallbackToOriginal(true);
        setIsProcessing(false);
        frontendImageCache.clearProcessing(src, getOptimalQuality(), maxWidth, enableWebP);
      };
      
      tempImg.src = src;
    } catch (error) {
      console.error('[OptimizedImage] Load and optimize failed:', error);
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

  // Handle image load event
  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (onLoad) {
      onLoad(e);
    }
  }, [onLoad]);

  // Handle image error event
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // If optimized version fails and we haven't tried original yet, try original
    if (!fallbackToOriginal && optimizedSrc !== src) {
      console.warn('[OptimizedImage] Optimized version failed, falling back to original');
      setFallbackToOriginal(true);
      setOptimizedSrc(src);
      return;
    }
    
    if (onError) {
      onError(e);
    }
  }, [onError, fallbackToOriginal, optimizedSrc, src]);

  return (
    <>
      {/* Hidden canvas for image optimization */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* The actual image */}
      <img
        ref={imgRef}
        src={optimizedSrc}
        alt={alt}
        className={`${className} ${isProcessing ? 'optimizing' : ''}`}
        style={style}
        onLoad={handleLoad}
        onError={handleError}
        onLoadStart={onLoadStart}
        onContextMenu={onContextMenu}
        {...props}
      />
    </>
  );
};

export default OptimizedImage;
