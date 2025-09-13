import { useEffect, useRef } from 'react';

interface WebVitalsData {
  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  inp?: number;
}

// Hook to measure and report Web Vitals
export const useWebVitals = (onVitalsUpdate?: (vitals: WebVitalsData) => void) => {
  const vitalsRef = useRef<WebVitalsData>({});
  
  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    
    const measureWebVitals = () => {
      // Measure LCP (Largest Contentful Paint)
      if ('PerformanceObserver' in window) {
        try {
          observer = new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            
            entries.forEach((entry) => {
              if (entry.entryType === 'largest-contentful-paint') {
                const lcp = Math.round(entry.startTime);
                vitalsRef.current.lcp = lcp;
                console.log('[Web Vitals] LCP:', lcp, 'ms');
                onVitalsUpdate?.(vitalsRef.current);
              }
              
              if (entry.entryType === 'first-input' && 'processingStart' in entry) {
                const fid = Math.round((entry as any).processingStart - entry.startTime);
                vitalsRef.current.fid = fid;
                console.log('[Web Vitals] FID:', fid, 'ms');
                onVitalsUpdate?.(vitalsRef.current);
              }
              
              if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
                vitalsRef.current.cls = (vitalsRef.current.cls || 0) + (entry as any).value;
                console.log('[Web Vitals] CLS:', vitalsRef.current.cls);
                onVitalsUpdate?.(vitalsRef.current);
              }
            });
          });
          
          observer.observe({ 
            entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] 
          });
          
          // Measure FCP (First Contentful Paint)
          const paintEntries = performance.getEntriesByType('paint');
          const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
          if (fcpEntry) {
            vitalsRef.current.fcp = Math.round(fcpEntry.startTime);
            console.log('[Web Vitals] FCP:', vitalsRef.current.fcp, 'ms');
            onVitalsUpdate?.(vitalsRef.current);
          }
          
          // Measure TTFB (Time to First Byte)
          const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigationEntry) {
            vitalsRef.current.ttfb = Math.round(navigationEntry.responseStart - navigationEntry.fetchStart);
            console.log('[Web Vitals] TTFB:', vitalsRef.current.ttfb, 'ms');
            onVitalsUpdate?.(vitalsRef.current);
          }
          
          // Measure INP (Interaction to Next Paint) - experimental
          if ('PerformanceEventTiming' in window) {
            const inpObserver = new PerformanceObserver((entryList) => {
              const entries = entryList.getEntries() as PerformanceEventTiming[];
              let maxINP = 0;
              
              entries.forEach((entry) => {
                if (entry.processingEnd && entry.processingStart) {
                  const inp = entry.processingEnd - entry.startTime;
                  if (inp > maxINP) {
                    maxINP = inp;
                  }
                }
              });
              
              if (maxINP > 0) {
                vitalsRef.current.inp = Math.round(maxINP);
                console.log('[Web Vitals] INP:', vitalsRef.current.inp, 'ms');
                onVitalsUpdate?.(vitalsRef.current);
              }
            });
            
            try {
              inpObserver.observe({ 
                entryTypes: ['event'] 
              });
            } catch (e) {
              console.warn('[Web Vitals] INP measurement not supported:', e);
            }
          }
          
        } catch (error) {
          console.warn('[Web Vitals] Performance measurement failed:', error);
        }
      }
    };
    
    // Start measuring immediately if document is already loaded
    if (document.readyState === 'complete') {
      measureWebVitals();
    } else {
      // Wait for page load
      window.addEventListener('load', measureWebVitals);
    }
    
    return () => {
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener('load', measureWebVitals);
    };
  }, [onVitalsUpdate]);
  
  return vitalsRef.current;
};

// Performance event timing interface for INP
interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  cancelable: boolean;
}
