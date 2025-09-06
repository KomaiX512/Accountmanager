import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Replace with your actual Google Analytics ID
const GA_TRACKING_ID = 'G-XXXXXXXXXX'; // Replace with your actual GA4 tracking ID

const GoogleAnalytics: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // Load Google Analytics script
    const loadGoogleAnalytics = () => {
      if (typeof window !== 'undefined' && !window.gtag) {
        const script1 = document.createElement('script');
        script1.async = true;
        script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`;
        document.head.appendChild(script1);

        const script2 = document.createElement('script');
        script2.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_TRACKING_ID}', {
            page_title: document.title,
            page_location: window.location.href,
            send_page_view: false
          });
        `;
        document.head.appendChild(script2);
      }
    };

    loadGoogleAnalytics();
  }, []);

  useEffect(() => {
    // Track page views on route changes
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', GA_TRACKING_ID, {
        page_title: document.title,
        page_location: window.location.href,
        send_page_view: true
      });
    }
  }, [location]);

  return null;
};

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

export default GoogleAnalytics;
