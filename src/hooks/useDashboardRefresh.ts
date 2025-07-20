/**
 * � BULLET-PROOF F5 TRIGGER - Ultra Simple Solution
 * Triggers F5 BEFORE opening any platform dashboard from main dashboard
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface DashboardRefreshOptions {
  onRefresh?: () => void;
  dashboardType: 'main' | 'platform';
}

export const useDashboardRefresh = ({
  onRefresh,
  dashboardType
}: DashboardRefreshOptions) => {
  const location = useLocation();
  const lastLocationRef = useRef<string>('');

  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = lastLocationRef.current;

    // BULLET-PROOF: F5 trigger BEFORE platform dashboard opens
    if (
      dashboardType === 'platform' && 
      previousPath === '/account' && 
      isDashboardRoute(currentPath)
    ) {
      console.log(`[BULLET-PROOF-F5] 🔥 Triggering F5: /account → ${currentPath}`);
      
      // IMMEDIATE F5 - No delays, no complications
      window.location.reload();
      return;
    }

    // Update for next comparison
    lastLocationRef.current = currentPath;

  }, [location.pathname, dashboardType]);

  // Legacy support
  const forceRefresh = () => {
    if (onRefresh) onRefresh();
  };

  return { forceRefresh };
};

/**
 * Helper function to determine if a path is a dashboard route
 */
const isDashboardRoute = (path: string): boolean => {
  return path.includes('dashboard') || path === '/dashboard';
};

export default useDashboardRefresh;
