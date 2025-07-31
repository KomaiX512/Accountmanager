import { useState, useEffect } from 'react';

/**
 * Hook for detecting mobile devices and screen size
 * Returns boolean indicating if current view is mobile
 * Uses only screen width detection for more reliable desktop/mobile distinction
 */
export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Only check screen width for mobile detection (≤767px as used in CSS)
      // This ensures desktop users always see desktop view regardless of user agent
      const isMobileScreen = window.innerWidth <= 767;
      
      setIsMobile(isMobileScreen);
    };

    // Check on mount
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}; 