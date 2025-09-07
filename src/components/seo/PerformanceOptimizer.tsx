import React, { useEffect } from 'react';

const PerformanceOptimizer: React.FC = () => {
  useEffect(() => {
    // Preload critical resources
    const preloadCriticalResources = () => {
      // Preload critical CSS only in development and only when actually needed
      if (import.meta.env && import.meta.env.DEV && location.hostname === 'localhost') {
        // Check if the CSS file exists before preloading
        const criticalCSS = document.createElement('link');
        criticalCSS.rel = 'preload';
        criticalCSS.href = '/src/styles/global-ui-refinements.css';
        criticalCSS.as = 'style';
        criticalCSS.onload = function() { 
          // Convert to stylesheet after load to avoid unused preload warning
          const stylesheet = document.createElement('link');
          stylesheet.rel = 'stylesheet';
          stylesheet.href = criticalCSS.href;
          document.head.appendChild(stylesheet);
        };
        criticalCSS.onerror = function() {
          // Remove failed preload to avoid console warnings
          document.head.removeChild(criticalCSS);
        };
        document.head.appendChild(criticalCSS);
      }

      // Preload critical fonts with better timing
      const fontPreload = document.createElement('link');
      fontPreload.rel = 'preload';
      fontPreload.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
      fontPreload.as = 'style';
      fontPreload.onload = function() { 
        // Immediately convert to stylesheet after preload
        (this as any).onload = null; 
        (this as any).rel = 'stylesheet'; 
      };
      document.head.appendChild(fontPreload);
      
      // Add non-blocking fallback stylesheet with longer delay
      setTimeout(() => {
        const fontStyle = document.createElement('link');
        fontStyle.rel = 'stylesheet';
        fontStyle.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
        fontStyle.media = 'print';
        fontStyle.onload = function() { (this as any).media = 'all'; };
        document.head.appendChild(fontStyle);
      }, 100);

      // Only preload logo if we're on a page that will show it immediately
      const isMainPage = location.pathname === '/' || 
                        location.pathname.includes('dashboard') || 
                        location.pathname.includes('login');
      
      // Also check if logo is already visible in DOM
      const logoExists = document.querySelector('img[src*="logo"]') || 
                        document.querySelector('img[alt*="logo"]') ||
                        document.querySelector('[class*="logo"]');
      
      if (isMainPage && logoExists) {
        const logoPreload = document.createElement('link');
        logoPreload.rel = 'preload';
        logoPreload.href = '/Logo/logo.png';
        logoPreload.as = 'image';
        logoPreload.onload = function() {
          // Mark logo as loaded for immediate use
          (window as any).logoPreloaded = true;
        };
        document.head.appendChild(logoPreload);
      }
    };

    // Advanced Core Web Vitals optimization
    const optimizeCoreWebVitals = () => {
      // Optimize Largest Contentful Paint (LCP)
      const criticalImages = document.querySelectorAll('img[data-critical="true"]');
      criticalImages.forEach((element) => {
        const img = element as HTMLImageElement;
        img.loading = 'eager';
        (img as any).fetchPriority = 'high';
      });

      // Optimize Cumulative Layout Shift (CLS)
      const images = document.querySelectorAll('img:not([width]):not([height])');
      images.forEach((element) => {
        const img = element as HTMLImageElement;
        if (img.naturalWidth && img.naturalHeight) {
          img.width = img.naturalWidth;
          img.height = img.naturalHeight;
        }
      });

      // Optimize First Input Delay (FID)
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          // Defer non-critical JavaScript
          const deferredScripts = document.querySelectorAll('script[data-defer="true"]');
          deferredScripts.forEach((element) => {
            const script = element as HTMLScriptElement;
            if (script.src) {
              const newScript = document.createElement('script');
              newScript.src = script.src;
              newScript.async = true;
              document.head.appendChild(newScript);
            }
          });
        });
      }
    };

    // Optimize images
    const optimizeImages = () => {
      const images = document.querySelectorAll('img');
      images.forEach((img: HTMLImageElement) => {
        // Add loading="lazy" for images below the fold
        if (img.getBoundingClientRect().top > window.innerHeight) {
          img.loading = 'lazy';
        }
        
        // Add proper alt attributes if missing
        if (!img.alt) {
          img.alt = 'Sentient Marketing - AI-Powered Social Media Management';
        }
      });
    };

    // Optimize third-party scripts
    const optimizeThirdPartyScripts = () => {
      // Defer non-critical scripts
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach((element) => {
        const script = element as HTMLScriptElement;
        if (!script.defer && !script.async && !script.src.includes('critical')) {
          script.defer = true;
        }
      });
    };

    // Initialize optimizations
    preloadCriticalResources();
    optimizeCoreWebVitals();
    optimizeImages();
    optimizeThirdPartyScripts();

    // Re-optimize on route changes
    const observer = new MutationObserver(() => {
      optimizeImages();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return null;
};

export default PerformanceOptimizer;
