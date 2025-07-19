/**
 * 🔄 DASHBOARD AUTO-REFRESH HOOK
 * Provides automatic refresh functionality when switching between dashboards
 * Handles: Main Dashboard ↔ Platform Dashboards ↔ Different Platform Dashboards
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface DashboardRefreshOptions {
  onRefresh?: () => void;
  dashboardType: 'main' | 'platform';
  platform?: string;
  dependencies?: any[];
}

export const useDashboardRefresh = ({
  onRefresh,
  dashboardType,
  platform,
  dependencies = []
}: DashboardRefreshOptions) => {
  const location = useLocation();
  const previousLocationRef = useRef<string>('');
  const previousDashboardTypeRef = useRef<string>('');
  const previousPlatformRef = useRef<string>('');
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = previousLocationRef.current;
    const previousDashboardType = previousDashboardTypeRef.current;
    const previousPlatform = previousPlatformRef.current;

    // On initial load, always trigger refresh for platform dashboards
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      
      // For platform dashboards, always refresh on initial load
      if (dashboardType === 'platform' && isDashboardRoute(currentPath)) {
        console.log(`[DashboardRefresh] 🚀 Initial platform dashboard load detected - forcing refresh for ${platform}`);
        if (onRefresh) {
          setTimeout(() => onRefresh(), 100); // Small delay to ensure component is mounted
        }
      }
      
      // Update refs for next comparison
      previousLocationRef.current = currentPath;
      previousDashboardTypeRef.current = dashboardType;
      previousPlatformRef.current = platform || '';
      return;
    }

    // Determine if this is a dashboard switch that requires refresh
    const isDashboardSwitch = (
      // Path changed
      currentPath !== previousPath &&
      (
        // Main ↔ Platform dashboard switch
        (dashboardType !== previousDashboardType) ||
        // Platform dashboard switch (different platforms)
        (dashboardType === 'platform' && platform !== previousPlatform) ||
        // Coming from/to any dashboard route
        (isDashboardRoute(currentPath) && isDashboardRoute(previousPath))
      )
    );

    if (isDashboardSwitch) {
      console.log(`[DashboardRefresh] 🔄 Dashboard switch detected:`, {
        from: { path: previousPath, type: previousDashboardType, platform: previousPlatform },
        to: { path: currentPath, type: dashboardType, platform: platform || 'none' }
      });

      // Trigger refresh
      if (onRefresh) {
        onRefresh();
      }
    }

    // Update refs for next comparison
    previousLocationRef.current = currentPath;
    previousDashboardTypeRef.current = dashboardType;
    previousPlatformRef.current = platform || '';

  }, [location.pathname, dashboardType, platform, onRefresh, ...dependencies]);

  // Force refresh function that can be called manually
  const forceRefresh = () => {
    console.log(`[DashboardRefresh] 🔧 Force refresh triggered for ${dashboardType} dashboard`);
    if (onRefresh) {
      onRefresh();
    }
  };

  return { forceRefresh };
};

/**
 * Helper function to determine if a path is a dashboard route
 */
const isDashboardRoute = (path: string): boolean => {
  const dashboardRoutes = [
    '/account',           // Main Dashboard
    '/dashboard',         // Instagram Dashboard (branding)
    '/non-branding-dashboard', // Instagram Dashboard (non-branding)
    '/twitter-dashboard', // Twitter Dashboard (branding)
    '/twitter-non-branding-dashboard', // Twitter Dashboard (non-branding)
    '/facebook-dashboard', // Facebook Dashboard (branding)
    '/facebook-non-branding-dashboard', // Facebook Dashboard (non-branding)
    '/linkedin-dashboard', // LinkedIn Dashboard (future)
  ];

  return dashboardRoutes.some(route => path === route || path.startsWith(route));
};

export default useDashboardRefresh;
