/**
 * Progressive Image Component
 * Facebook/Instagram-style image loading with blur placeholders
 */

import React from 'react';
import { useProgressiveImage, getResponsiveImageUrls } from '../../hooks/useProgressiveImage';

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: 'high' | 'low' | 'auto';
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  priority = 'auto',
  onLoad,
  onError
}) => {
  const urls = getResponsiveImageUrls(src);
  const { 
    src: currentSrc, 
    isLoading, 
    error, 
    progress, 
    blur 
  } = useProgressiveImage({
    thumbnailUrl: urls.thumbnail,
    fullUrl: urls.large,
    priority
  });

  React.useEffect(() => {
    if (!isLoading && !error) {
      onLoad?.();
    }
    if (error) {
      onError?.(error);
    }
  }, [isLoading, error, onLoad, onError]);

  return (
    <div className={`progressive-image-container ${className}`} style={{ position: 'relative', width, height }}>
      <img
        src={currentSrc || '/fallback.jpg'}
        alt={alt}
        className={`progressive-image ${blur ? 'blur-effect' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transition: 'filter 0.3s ease-in-out',
          filter: blur ? 'blur(20px)' : 'none'
        }}
        loading="lazy"
        decoding="async"
      />
      {isLoading && (
        <div 
          className="loading-overlay"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(to right, #3b82f6 ${progress}%, #e5e7eb ${progress}%)`,
            transition: 'all 0.3s ease'
          }}
        />
      )}
    </div>
  );
};

// Batch image loader for parallel loading
export class BatchImageLoader {
  private loading: Map<string, Promise<void>> = new Map();
  private batchSize = 6; // Optimal for HTTP/2
  
  async loadImages(urls: string[]): Promise<void> {
    // Split into batches for parallel loading
    const batches = [];
    for (let i = 0; i < urls.length; i += this.batchSize) {
      batches.push(urls.slice(i, i + this.batchSize));
    }
    
    // Load batches in parallel
    for (const batch of batches) {
      await Promise.all(batch.map(url => this.loadImage(url)));
    }
  }
  
  private loadImage(url: string): Promise<void> {
    if (this.loading.has(url)) {
      return this.loading.get(url)!;
    }
    
    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        this.loading.delete(url);
        resolve();
      };
      img.onerror = () => {
        this.loading.delete(url);
        reject(new Error(`Failed to load ${url}`));
      };
    });
    
    this.loading.set(url, promise);
    return promise;
  }
}
