// Image Optimization Performance Tester
// This script can be run in the browser console to test optimization benefits

class ImageOptimizationTester {
  constructor() {
    this.results = [];
  }

  // Test a single image optimization
  async testImageOptimization(imageUrl, quality = 0.8, maxWidth = 800) {
    console.log(`🧪 Testing optimization for: ${imageUrl.substring(0, 50)}...`);
    
    const startTime = performance.now();
    
    try {
      // Load original image
      const originalImg = await this.loadImage(imageUrl);
      const originalSize = await this.getImageSize(imageUrl);
      
      // Optimize image
      const optimizedDataUrl = await this.optimizeImage(originalImg, quality, maxWidth);
      const optimizedSize = optimizedDataUrl.length;
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      const result = {
        url: imageUrl,
        originalSize: originalSize,
        optimizedSize: optimizedSize,
        reduction: Math.round((1 - optimizedSize / originalSize) * 100),
        processingTime: Math.round(processingTime),
        quality: quality,
        maxWidth: maxWidth
      };
      
      this.results.push(result);
      
      console.log(`✅ Optimization complete:
        📏 Size: ${this.formatBytes(originalSize)} → ${this.formatBytes(optimizedSize)}
        📉 Reduction: ${result.reduction}%
        ⏱️ Time: ${result.processingTime}ms
        🎚️ Quality: ${quality * 100}%
        📐 Max Width: ${maxWidth}px`);
      
      return result;
    } catch (error) {
      console.error(`❌ Optimization failed:`, error);
      return null;
    }
  }

  // Load image as promise
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Get image file size
  async getImageSize(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return blob.size;
    } catch (error) {
      // Fallback: estimate from URL length (not accurate but gives an idea)
      return url.length * 1.5;
    }
  }

  // Optimize image using canvas
  optimizeImage(imageElement, quality, maxWidth) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate dimensions
        const { width, height } = this.getOptimalDimensions(
          imageElement.naturalWidth, 
          imageElement.naturalHeight, 
          maxWidth
        );
        
        canvas.width = width;
        canvas.height = height;
        
        // High-quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw and compress
        ctx.drawImage(imageElement, 0, 0, width, height);
        
        // Use WebP if supported, otherwise JPEG
        const format = this.supportsWebP() ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, quality);
        
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Calculate optimal dimensions
  getOptimalDimensions(originalWidth, originalHeight, maxWidth) {
    if (originalWidth <= maxWidth) {
      return { width: originalWidth, height: originalHeight };
    }
    
    const ratio = originalHeight / originalWidth;
    return {
      width: maxWidth,
      height: Math.round(maxWidth * ratio)
    };
  }

  // Check WebP support
  supportsWebP() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('webp') > 0;
  }

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Test all images on current page
  async testAllImagesOnPage() {
    const images = Array.from(document.querySelectorAll('img'))
      .filter(img => img.src && !img.src.startsWith('data:'))
      .slice(0, 5); // Limit to first 5 images
    
    console.log(`🧪 Testing optimization on ${images.length} images...`);
    
    for (const img of images) {
      await this.testImageOptimization(img.src);
      // Small delay to prevent overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.showSummary();
  }

  // Show summary of all tests
  showSummary() {
    if (this.results.length === 0) {
      console.log('📊 No optimization results to show');
      return;
    }

    const totalOriginal = this.results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimized = this.results.reduce((sum, r) => sum + r.optimizedSize, 0);
    const avgReduction = this.results.reduce((sum, r) => sum + r.reduction, 0) / this.results.length;
    const avgProcessingTime = this.results.reduce((sum, r) => sum + r.processingTime, 0) / this.results.length;
    
    console.log(`
📊 OPTIMIZATION SUMMARY (${this.results.length} images)
═══════════════════════════════════════════════════════
📏 Total Original Size:  ${this.formatBytes(totalOriginal)}
📏 Total Optimized Size: ${this.formatBytes(totalOptimized)}
📉 Total Size Reduction: ${this.formatBytes(totalOriginal - totalOptimized)} (${Math.round((1 - totalOptimized / totalOriginal) * 100)}%)
📊 Average Reduction:    ${Math.round(avgReduction)}%
⏱️ Average Processing:   ${Math.round(avgProcessingTime)}ms
🌐 WebP Supported:       ${this.supportsWebP() ? 'Yes' : 'No'}
📱 Mobile Device:        ${this.isMobile() ? 'Yes' : 'No'}
═══════════════════════════════════════════════════════
    `);

    // Show individual results
    this.results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.reduction}% reduction (${this.formatBytes(result.originalSize)} → ${this.formatBytes(result.optimizedSize)}) - ${result.processingTime}ms`);
    });
  }

  // Mobile detection
  isMobile() {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Clear results
  clearResults() {
    this.results = [];
    console.log('🧹 Results cleared');
  }
}

// Create global tester instance
if (typeof window !== 'undefined') {
  window.optimizationTester = new ImageOptimizationTester();
  
  console.log(`
🚀 IMAGE OPTIMIZATION TESTER LOADED
═══════════════════════════════════════
Usage:
  • optimizationTester.testAllImagesOnPage() - Test all images
  • optimizationTester.testImageOptimization(url) - Test single image
  • optimizationTester.showSummary() - Show results summary
  • optimizationTester.clearResults() - Clear results
═══════════════════════════════════════
  `);
}

export default ImageOptimizationTester;
