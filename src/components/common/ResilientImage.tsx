/**
 * 🖼️ BULLETPROOF IMAGE COMPONENT - Netflix-Level Resilience
 * 
 * Features:
 * - Circuit breaker protection
 * - Multiple fallback sources
 * - Progressive loading
 * - Automatic retry with backoff
 * - CDN failover
 * - Instagram 403 protection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { resilienceManager } from '../../utils/resilienceEngine';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackSources?: string[];
  enableInstagramFallback?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  placeholder?: string;
  retryAttempts?: number;
  username?: string;
  platform?: string;
}

const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  style = {},
  fallbackSources = [],
  enableInstagramFallback = true,
  onLoad,
  onError,
  placeholder,
  retryAttempts = 3,
  username,
  platform = 'instagram'
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(placeholder || '');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const mountedRef = useRef(true);

  // Generate comprehensive fallback sources
  const generateFallbackSources = useCallback((originalSrc: string): string[] => {
    const fallbacks: string[] = [...fallbackSources];
    
    // If it's an Instagram image that might get 403'd, add proxy fallback
    if (enableInstagramFallback && originalSrc.includes('instagram.com')) {
      fallbacks.push(`/api/proxy-image?url=${encodeURIComponent(originalSrc)}&fallback=true`);
    }
    
    // Add R2 fallback if we have username and can infer image key
    if (username && originalSrc.includes('/')) {
      const imageName = originalSrc.split('/').pop();
      if (imageName) {
        fallbacks.push(`/api/r2-image/${username}/${imageName}?platform=${platform}&fallback=true`);
      }
    }
    
    // Add local storage fallback
    fallbacks.push(`/api/local-image?key=${encodeURIComponent(originalSrc)}&fallback=true`);
    
    return fallbacks;
  }, [fallbackSources, enableInstagramFallback, username, platform]);

  // Load image with resilience
  const loadImage = useCallback(async () => {
    if (!src || !mountedRef.current) return;
    
    setIsLoading(true);
    setHasError(false);
    
    try {
      const circuitBreaker = resilienceManager.getCircuitBreaker('image-loading', {
        failureThreshold: 3,
        resetTimeoutMs: 30000, // 30 seconds
        timeoutMs: 15000 // 15 second timeout per attempt
      });
      
      const fallbacks = generateFallbackSources(src);
      
      console.log(`[ResilientImage] Loading image with ${fallbacks.length} fallbacks:`, src);
      
      const loadedSrc = await circuitBreaker.execute(
        async () => {
          // Try original source first
          try {
            await testImageLoad(src);
            return src;
          } catch (error) {
            console.warn(`[ResilientImage] Original source failed: ${src}`, error);
            
            // Try fallbacks sequentially
            for (const fallback of fallbacks) {
              try {
                console.log(`[ResilientImage] Trying fallback: ${fallback}`);
                await testImageLoad(fallback);
                return fallback;
              } catch (fallbackError) {
                console.warn(`[ResilientImage] Fallback failed: ${fallback}`, fallbackError);
              }
            }
            
            throw new Error('All image sources failed');
          }
        },
        // Circuit breaker fallback - return placeholder
        async () => {
          console.warn('[ResilientImage] Circuit breaker activated, using placeholder');
          return generatePlaceholder(alt);
        }
      );
      
      if (mountedRef.current) {
        setCurrentSrc(loadedSrc);
        setIsLoading(false);
        onLoad?.();
      }
      
    } catch (error) {
      console.error('[ResilientImage] Failed to load image:', error);
      
      if (mountedRef.current) {
        setHasError(true);
        setIsLoading(false);
        setCurrentSrc(generatePlaceholder(alt));
        onError?.(error as Error);
      }
    }
  }, [src, generateFallbackSources, alt, onLoad, onError]);

  // Test if an image can be loaded
  const testImageLoad = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const testImg = new Image();
      
      // Set timeout for load attempt
      const timeout = setTimeout(() => {
        testImg.src = '';
        reject(new Error(`Image load timeout: ${url}`));
      }, 10000);
      
      testImg.onload = () => {
        clearTimeout(timeout);
        if (testImg.naturalWidth > 0 && testImg.naturalHeight > 0) {
          resolve();
        } else {
          reject(new Error(`Invalid image dimensions: ${url}`));
        }
      };
      
      testImg.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Image load error: ${url}`));
      };
      
      // Handle Instagram CDN blocking
      if (url.includes('instagram.com')) {
        testImg.crossOrigin = 'anonymous';
      }
      
      testImg.src = url;
    });
  }, []);

  // Generate placeholder image
  const generatePlaceholder = useCallback((altText: string): string => {
    const text = altText || 'Image';
    const width = 300;
    const height = 300;
    
    return `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#e0e0e0;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#f5f5f5;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad)" rx="8"/>
        <circle cx="${width/2}" cy="${height/2 - 20}" r="30" fill="#d0d0d0"/>
        <rect x="${width/2 - 40}" y="${height/2 + 20}" width="80" height="8" fill="#d0d0d0" rx="4"/>
        <text x="${width/2}" y="${height - 20}" text-anchor="middle" fill="#999" font-family="Arial, sans-serif" font-size="12">${text}</text>
      </svg>
    `)}`;
  }, []);

  // Retry logic with exponential backoff
  const handleRetry = useCallback(() => {
    if (loadAttempt < retryAttempts) {
      const delay = Math.min(1000 * Math.pow(2, loadAttempt), 10000); // Max 10 seconds
      console.log(`[ResilientImage] Retrying in ${delay}ms (attempt ${loadAttempt + 1})`);
      
      setTimeout(() => {
        if (mountedRef.current) {
          setLoadAttempt(prev => prev + 1);
          loadImage();
        }
      }, delay);
    }
  }, [loadAttempt, retryAttempts, loadImage]);

  // Handle image error
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    console.warn('[ResilientImage] Image element error:', e);
    
    if (loadAttempt < retryAttempts) {
      handleRetry();
    } else {
      setHasError(true);
      setIsLoading(false);
      setCurrentSrc(generatePlaceholder(alt));
    }
  }, [loadAttempt, retryAttempts, handleRetry, generatePlaceholder, alt]);

  // Load image when src changes
  useEffect(() => {
    mountedRef.current = true;
    setLoadAttempt(0);
    loadImage();
    
    return () => {
      mountedRef.current = false;
    };
  }, [src, loadImage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <div className={`resilient-image-container ${className}`} style={style}>
      {isLoading && (
        <div className="resilient-image-loading">
          <div className="loading-spinner" />
          <span>Loading...</span>
        </div>
      )}
      
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`resilient-image ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
        onLoad={() => {
          setIsLoading(false);
          onLoad?.();
        }}
        onError={handleImageError}
        style={{
          display: currentSrc ? 'block' : 'none',
          maxWidth: '100%',
          height: 'auto'
        }}
      />
      
      {hasError && loadAttempt >= retryAttempts && (
        <div className="resilient-image-error">
          <button 
            onClick={() => {
              setLoadAttempt(0);
              setHasError(false);
              loadImage();
            }}
            className="retry-button"
          >
            Retry
          </button>
        </div>
      )}
      
      <style>{`
        .resilient-image-container {
          position: relative;
          display: inline-block;
        }
        
        .resilient-image-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 20px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 8px;
        }
        
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e0e0e0;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .resilient-image.loading {
          opacity: 0.7;
        }
        
        .resilient-image.error {
          filter: grayscale(100%);
        }
        
        .resilient-image-error {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
        }
        
        .retry-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .retry-button:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  );
};

export default ResilientImage;
