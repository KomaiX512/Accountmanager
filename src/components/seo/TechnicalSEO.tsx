import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

interface TechnicalSEOProps {
  pageType: string;
  criticalResources?: string[];
  imageOptimization?: boolean;
  coreWebVitalsOptimization?: boolean;
}

const TechnicalSEO: React.FC<TechnicalSEOProps> = ({
  pageType,
  criticalResources = [],
  imageOptimization = true,
  coreWebVitalsOptimization = true
}) => {

  useEffect(() => {
    // Advanced Core Web Vitals Optimization
    if (coreWebVitalsOptimization) {
      optimizeCoreWebVitals();
    }

    // Advanced Image Optimization
    if (imageOptimization) {
      optimizeImages();
    }

    // Critical Resource Preloading
    preloadCriticalResources();

    // Advanced Performance Monitoring
    setupPerformanceMonitoring();

    // Third-party Script Optimization
    optimizeThirdPartyScripts();

  }, []);

  const optimizeCoreWebVitals = () => {
    // Largest Contentful Paint (LCP) Optimization
    const optimizeLCP = () => {
      // Preload hero images and critical fonts
      const heroImages = document.querySelectorAll('img[data-hero="true"]');
      heroImages.forEach((img: any) => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = img.src || img.dataset.src;
        document.head.appendChild(link);
      });

      // Critical font preloading
      const criticalFonts = [
        'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZs.woff2'
      ];
      
      criticalFonts.forEach(fontUrl => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.type = 'font/woff2';
        link.crossOrigin = 'anonymous';
        link.href = fontUrl;
        document.head.appendChild(link);
      });
    };

    // Cumulative Layout Shift (CLS) Optimization
    const optimizeCLS = () => {
      // Add aspect ratio to images
      const images = document.querySelectorAll('img:not([width]):not([height])');
      images.forEach((img: any) => {
        img.style.aspectRatio = '16/9'; // Default aspect ratio
        img.style.width = '100%';
        img.style.height = 'auto';
      });

      // Reserve space for dynamic content
      const dynamicContainers = document.querySelectorAll('[data-dynamic="true"]');
      dynamicContainers.forEach((container: any) => {
        container.style.minHeight = '200px'; // Reserve minimum space
      });
    };

    // First Input Delay (FID) / Interaction to Next Paint (INP) Optimization
    const optimizeFID = () => {
      // Defer non-critical JavaScript
      const scripts = document.querySelectorAll('script[data-critical="false"]');
      scripts.forEach((script: any) => {
        script.defer = true;
      });

      // Break up long tasks
      const heavyTasks = ['analytics', 'tracking', 'chat-widgets'];
      heavyTasks.forEach(task => {
        if ((window as any)[task]) {
          setTimeout(() => {
            (window as any)[task]();
          }, 0);
        }
      });
    };

    optimizeLCP();
    optimizeCLS();
    optimizeFID();
  };

  const optimizeImages = () => {
    // Implement advanced lazy loading with Intersection Observer
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px 0px'
    });

    // Apply to all lazy images
    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach(img => imageObserver.observe(img));

    // WebP format detection and optimization
    const supportsWebP = () => {
      const canvas = document.createElement('canvas');
      return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    };

    if (supportsWebP()) {
      const images = document.querySelectorAll('img[data-webp]');
      images.forEach((img: any) => {
        img.src = img.dataset.webp;
      });
    }
  };

  const preloadCriticalResources = () => {
    const criticalAssets = [
      { href: '/Logo/logo.png', as: 'image' },
      // Removed critical.css and API preloads to fix MIME type errors
    ];

    criticalAssets.forEach(asset => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = asset.as;
      link.href = asset.href;
      if (asset.as === 'fetch') {
        link.crossOrigin = 'anonymous';
      }
      document.head.appendChild(link);
    });

    // DNS prefetch for external domains
    const externalDomains = [
      '//fonts.googleapis.com',
      '//api.sentientm.com',
      '//cdn.sentientm.com',
      '//analytics.google.com'
    ];

    externalDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = domain;
      document.head.appendChild(link);
    });
  };

  const setupPerformanceMonitoring = () => {
    // Web Vitals monitoring
    const observeWebVitals = () => {
      // LCP monitoring
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        console.log('LCP:', lastEntry.startTime);
        
        // Send to analytics if needed
        if (typeof gtag !== 'undefined') {
          gtag('event', 'web_vitals', {
            name: 'LCP',
            value: Math.round(lastEntry.startTime),
            event_category: 'Performance'
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // FID monitoring  
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          console.log('FID:', entry.processingStart - entry.startTime);
          
          if (typeof gtag !== 'undefined') {
            gtag('event', 'web_vitals', {
              name: 'FID',
              value: Math.round(entry.processingStart - entry.startTime),
              event_category: 'Performance'
            });
          }
        });
      }).observe({ type: 'first-input', buffered: true });

      // CLS monitoring
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        console.log('CLS:', clsValue);
        
        if (typeof gtag !== 'undefined') {
          gtag('event', 'web_vitals', {
            name: 'CLS',
            value: Math.round(clsValue * 1000),
            event_category: 'Performance'
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    };

    if ('PerformanceObserver' in window) {
      observeWebVitals();
    }
  };

  const optimizeThirdPartyScripts = () => {
    // Defer non-critical third-party scripts
    const thirdPartyScripts = [
      { id: 'google-analytics', src: 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID' },
      { id: 'hotjar', src: 'https://static.hotjar.com/c/hotjar-' },
      { id: 'facebook-pixel', src: 'https://connect.facebook.net/en_US/fbevents.js' }
    ];

    // Load third-party scripts after page load
    window.addEventListener('load', () => {
      setTimeout(() => {
        thirdPartyScripts.forEach(script => {
          const scriptElement = document.createElement('script');
          scriptElement.async = true;
          scriptElement.src = script.src;
          scriptElement.id = script.id;
          document.body.appendChild(scriptElement);
        });
      }, 3000); // 3 second delay for better Core Web Vitals
    });
  };

  // Advanced Resource Hints
  const generateResourceHints = () => {
    return (
      <>
        {/* DNS Prefetch */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
        <link rel="dns-prefetch" href="//api.sentientm.com" />
        <link rel="dns-prefetch" href="//cdn.sentientm.com" />
        <link rel="dns-prefetch" href="//www.google-analytics.com" />
        
        {/* Preconnect to critical origins */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.sentientm.com" crossOrigin="anonymous" />
        
        {/* Preload critical resources */}
        <link rel="preload" href="/Logo/logo.png" as="image" />
        
        {/* Module preload removed to prevent MIME errors */}
        
        {/* Prefetch next likely pages */}
        <link rel="prefetch" href="/dashboard" />
        <link rel="prefetch" href="/pricing" />
        <link rel="prefetch" href="/features" />
      </>
    );
  };

  // Advanced Service Worker Registration
  const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  };

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <Helmet>
      {/* Advanced Resource Hints */}
      {generateResourceHints()}
      
      {/* Advanced Viewport and Mobile Optimization */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      
      {/* Advanced PWA Meta Tags */}
      <meta name="theme-color" content="#00ffcc" />
      <meta name="background-color" content="#000000" />
      <meta name="display" content="standalone" />
      <meta name="orientation" content="portrait" />
      
      {/* Advanced Security Headers */}
      <meta httpEquiv="Content-Security-Policy" content="default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:;" />
      <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      <meta httpEquiv="X-Frame-Options" content="DENY" />
      <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
      <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
      
      {/* Advanced Performance Hints */}
      <meta httpEquiv="Accept-CH" content="DPR, Width, Viewport-Width" />
      <meta name="format-detection" content="telephone=no, date=no, email=no, address=no" />
      
      {/* Advanced Cache Control */}
      <meta httpEquiv="Cache-Control" content="public, max-age=31536000, immutable" />
      <meta httpEquiv="Expires" content="31536000" />
      
      {/* Advanced Compression Hints */}
      <meta httpEquiv="Content-Encoding" content="gzip, br" />
      
      {/* Critical CSS Inlining Placeholder */}
      <style type="text/css" dangerouslySetInnerHTML={{
        __html: `
          /* Critical CSS for above-the-fold content */
          body { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #000; color: #fff; }
          .hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .loading { opacity: 0; animation: fadeIn 0.5s ease-in-out forwards; }
          @keyframes fadeIn { to { opacity: 1; } }
          .preload-image { position: absolute; left: -9999px; opacity: 0; }
        `
      }} />
    </Helmet>
  );
};

export default TechnicalSEO;
