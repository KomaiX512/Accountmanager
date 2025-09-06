import React, { useEffect } from 'react';

const PerformanceOptimizer: React.FC = () => {
  useEffect(() => {
    // Preload critical resources
    const preloadCriticalResources = () => {
      // Preload critical CSS
      const criticalCSS = document.createElement('link');
      criticalCSS.rel = 'preload';
      criticalCSS.href = '/src/styles/global-ui-refinements.css';
      criticalCSS.as = 'style';
      document.head.appendChild(criticalCSS);

      // Preload critical fonts
      const fontPreload = document.createElement('link');
      fontPreload.rel = 'preload';
      fontPreload.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
      fontPreload.as = 'style';
      document.head.appendChild(fontPreload);

      // Preload critical images
      const logoPreload = document.createElement('link');
      logoPreload.rel = 'preload';
      logoPreload.href = '/Logo/logo.png';
      logoPreload.as = 'image';
      document.head.appendChild(logoPreload);
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
