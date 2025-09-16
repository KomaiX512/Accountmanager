import { useEffect, useCallback, useRef } from 'react';
import navigationRefreshManager from '../utils/navigationRefresh';

/**
 * Hook for components to register with the navigation refresh system
 * Automatically clears component state during platform navigation
 */
export function useNavigationRefresh() {
  const contextResetRef = useRef<(() => void) | null>(null);
  const stateResetRef = useRef<(() => void) | null>(null);

  /**
   * Register a callback to reset context/provider state during navigation
   */
  const registerContextReset = useCallback((callback: () => void) => {
    contextResetRef.current = callback;
    navigationRefreshManager.registerContextReset(callback);
  }, []);

  /**
   * Register a callback to reset component state during navigation
   */
  const registerStateReset = useCallback((callback: () => void) => {
    stateResetRef.current = callback;
    navigationRefreshManager.registerStateReset(callback);
  }, []);

  /**
   * Manually trigger a silent refresh (useful for main dashboard)
   */
  const triggerSilentRefresh = useCallback(async (platform: string, username: string) => {
    await navigationRefreshManager.performSilentRefresh(platform, username);
  }, []);

  /**
   * Listen for navigation refresh events
   */
  useEffect(() => {
    const handleNavigationRefresh = (event: CustomEvent) => {
      const { platform, username } = event.detail;
      console.log('[useNavigationRefresh] 🔄 Navigation refresh event received:', { platform, username });
    };

    window.addEventListener('platform-navigation-refresh', handleNavigationRefresh as EventListener);
    
    return () => {
      window.removeEventListener('platform-navigation-refresh', handleNavigationRefresh as EventListener);
    };
  }, []);

  return {
    registerContextReset,
    registerStateReset,
    triggerSilentRefresh,
    refreshManager: navigationRefreshManager
  };
}

/**
 * Hook specifically for main dashboard to handle platform navigation
 */
export function useMainDashboardRefresh() {
  const { registerStateReset, triggerSilentRefresh } = useNavigationRefresh();

  /**
   * Reset main dashboard state during navigation
   */
  const resetMainDashboardState = useCallback(() => {
    console.log('[MainDashboard] 🔄 Resetting main dashboard state for navigation');
    
    // Clear dashboard-specific session storage
    const dashboardKeys = [
      'main_dashboard_state',
      'platform_notifications',
      'usage_dashboard_cache',
      'leaderboard_cache',
      'instant_post_state'
    ];

    dashboardKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });

    // Dispatch event to notify dashboard components
    window.dispatchEvent(new CustomEvent('main-dashboard-reset'));
  }, []);

  /**
   * Navigate to platform with automatic refresh
   */
  const navigateWithRefresh = useCallback(async (platform: string, username: string, navigate: (path: string, options?: any) => void) => {
    console.log('[MainDashboard] 🚀 Navigating with refresh to:', { platform, username });
    
    // Trigger silent refresh before navigation
    await triggerSilentRefresh(platform, username);
    
    // Navigate to platform dashboard
    const platformRoute = `/${platform}-dashboard`;
    navigate(platformRoute, {
      state: {
        accountHolder: username,
        platform: platform,
        refreshed: true,
        timestamp: Date.now()
      }
    });
  }, [triggerSilentRefresh]);

  // Register reset callback on mount
  useEffect(() => {
    registerStateReset(resetMainDashboardState);
  }, [registerStateReset, resetMainDashboardState]);

  return {
    navigateWithRefresh,
    resetMainDashboardState,
    triggerSilentRefresh
  };
}

export default useNavigationRefresh;
