import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOAnalyticsProps {
  trackingId?: string;
  enableGTM?: boolean;
  enableHotjar?: boolean;
  enableSearchConsole?: boolean;
}

const SEOAnalytics: React.FC<SEOAnalyticsProps> = ({
  trackingId = 'G-XXXXXXXXXX',
  enableGTM = true,
  enableHotjar = true,
  enableSearchConsole = true
}) => {
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  useEffect(() => {
    // Initialize Google Analytics 4
    const initGA4 = () => {
      if (typeof window !== 'undefined' && !analyticsLoaded) {
        // Load gtag script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
        document.head.appendChild(script);

        // Initialize gtag
        window.dataLayer = window.dataLayer || [];
        function gtag(...args: any[]) {
          window.dataLayer.push(arguments);
        }
        
        gtag('js', new Date());
        gtag('config', trackingId, {
          page_title: document.title,
          page_location: window.location.href,
          send_page_view: true
        });

        // Track SEO-specific events
        gtag('event', 'page_view', {
          page_title: document.title,
          page_location: window.location.href,
          content_group1: 'SEO Landing Page'
        });

        setAnalyticsLoaded(true);
      }
    };

    // Initialize Google Tag Manager
    const initGTM = () => {
      if (enableGTM && typeof window !== 'undefined') {
        (function(w: any, d: Document, s: string, l: string, i: string) {
          w[l] = w[l] || [];
          w[l].push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
          var f = d.getElementsByTagName(s)[0],
              j = d.createElement(s) as HTMLScriptElement,
              dl = l != 'dataLayer' ? '&l=' + l : '';
          j.async = true;
          j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
          f.parentNode?.insertBefore(j, f);
        })(window, document, 'script', 'dataLayer', 'GTM-XXXXXXX');
      }
    };

    // Initialize Hotjar for user behavior tracking
    const initHotjar = () => {
      if (enableHotjar && typeof window !== 'undefined') {
        (function(h: any, o: Document, t: string, j: string, a?: HTMLScriptElement, r?: HTMLScriptElement) {
          h.hj = h.hj || function(...args: any[]) { (h.hj.q = h.hj.q || []).push(args); };
          h._hjSettings = { hjid: 3000000, hjsv: 6 }; // Replace with actual Hotjar ID
          a = o.getElementsByTagName('head')[0];
          r = o.createElement('script') as HTMLScriptElement;
          r.async = true;
          r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
          a.appendChild(r);
        })(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
      }
    };

    // Track Core Web Vitals
    const trackCoreWebVitals = () => {
      if (typeof window !== 'undefined' && 'web-vitals' in window) {
        import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
          getCLS((metric) => {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_action: 'CLS',
              value: Math.round(metric.value * 1000),
              non_interaction: true
            });
          });

          getFID((metric) => {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_action: 'FID',
              value: Math.round(metric.value),
              non_interaction: true
            });
          });

          getFCP((metric) => {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_action: 'FCP',
              value: Math.round(metric.value),
              non_interaction: true
            });
          });

          getLCP((metric) => {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_action: 'LCP',
              value: Math.round(metric.value),
              non_interaction: true
            });
          });

          getTTFB((metric) => {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_action: 'TTFB',
              value: Math.round(metric.value),
              non_interaction: true
            });
          });
        });
      }
    };

    // Track SEO-specific user interactions
    const trackSEOEvents = () => {
      // Track scroll depth for engagement
      let maxScroll = 0;
      const trackScrollDepth = () => {
        const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
        if (scrollPercent > maxScroll && scrollPercent % 25 === 0) {
          maxScroll = scrollPercent;
          gtag('event', 'scroll_depth', {
            event_category: 'Engagement',
            event_action: 'Scroll',
            value: scrollPercent
          });
        }
      };

      // Track time on page
      const startTime = Date.now();
      const trackTimeOnPage = () => {
        const timeSpent = Math.round((Date.now() - startTime) / 1000);
        if (timeSpent > 30) { // Track after 30 seconds
          gtag('event', 'time_on_page', {
            event_category: 'Engagement',
            event_action: 'Time Spent',
            value: timeSpent
          });
        }
      };

      // Track CTA clicks
      const trackCTAClicks = () => {
        const ctaButtons = document.querySelectorAll('[data-cta]');
        ctaButtons.forEach(button => {
          button.addEventListener('click', () => {
            const ctaName = button.getAttribute('data-cta');
            gtag('event', 'cta_click', {
              event_category: 'Conversion',
              event_action: 'CTA Click',
              event_label: ctaName
            });
          });
        });
      };

      window.addEventListener('scroll', trackScrollDepth);
      window.addEventListener('beforeunload', trackTimeOnPage);
      trackCTAClicks();
    };

    initGA4();
    initGTM();
    initHotjar();
    
    // Delay tracking initialization to avoid performance impact
    setTimeout(() => {
      trackCoreWebVitals();
      trackSEOEvents();
    }, 2000);

  }, [trackingId, enableGTM, enableHotjar, analyticsLoaded]);

  return (
    <Helmet>
      {/* Google Search Console Verification */}
      {enableSearchConsole && (
        <meta name="google-site-verification" content="your-search-console-verification-code" />
      )}
      
      {/* Bing Webmaster Tools */}
      <meta name="msvalidate.01" content="your-bing-verification-code" />
      
      {/* Yandex Verification */}
      <meta name="yandex-verification" content="your-yandex-verification-code" />
      
      {/* Enhanced Analytics Meta Tags */}
      <meta name="google-analytics" content={trackingId} />
      <meta name="analytics-enabled" content="true" />
      
      {/* Performance Monitoring */}
      <meta name="performance-monitoring" content="enabled" />
      <meta name="core-web-vitals-tracking" content="enabled" />
      
      {/* SEO Tracking Meta Tags */}
      <meta name="seo-tracking" content="advanced" />
      <meta name="conversion-tracking" content="enabled" />
      
      {/* GTM NoScript Fallback */}
      {enableGTM && (
        <noscript>
          <iframe 
            src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
            height="0" 
            width="0" 
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
      )}
    </Helmet>
  );
};

// Utility function to track custom SEO events
export const trackSEOEvent = (eventName: string, parameters: Record<string, any> = {}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, {
      event_category: 'SEO',
      ...parameters
    });
  }
};

// Track keyword ranking improvements
export const trackKeywordRanking = (keyword: string, position: number, previousPosition?: number) => {
  trackSEOEvent('keyword_ranking', {
    event_action: 'Ranking Update',
    event_label: keyword,
    value: position,
    custom_parameter_1: previousPosition
  });
};

// Track organic traffic sources
export const trackOrganicTraffic = (source: string, medium: string, campaign?: string) => {
  trackSEOEvent('organic_traffic', {
    event_action: 'Organic Visit',
    event_label: source,
    custom_parameter_1: medium,
    custom_parameter_2: campaign
  });
};

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    hj: (...args: any[]) => void;
    _hjSettings: { hjid: number; hjsv: number };
  }
}

export default SEOAnalytics;
