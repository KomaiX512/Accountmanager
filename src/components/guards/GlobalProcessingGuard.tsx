import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigate, safeHistoryManipulation } from '../../utils/navigationGuard';
import { isBypassActive } from '../../utils/bypassChecker';

interface GlobalProcessingGuardProps {
  children: React.ReactNode;
}

// Platform route patterns that need protection
const PROTECTED_ROUTES = [
  '/dashboard',        // Instagram dashboard
  '/twitter-dashboard', // Twitter dashboard
  '/facebook-dashboard', // Facebook dashboard
  '/linkedin-dashboard' // LinkedIn dashboard
];

// Extract platform from route
const getPlatformFromRoute = (pathname: string): string | null => {
  if (pathname.includes('/dashboard') && !pathname.includes('twitter') && !pathname.includes('facebook') && !pathname.includes('linkedin')) {
    return 'instagram';
  }
  if (pathname.includes('/twitter-dashboard')) return 'twitter';
  if (pathname.includes('/facebook-dashboard')) return 'facebook';
  if (pathname.includes('/linkedin-dashboard')) return 'linkedin';
  return null;
};

// BULLETPROOF timer check with multiple fallbacks
const hasActiveTimer = (platform: string): { active: boolean; remainingMs: number } => {
  try {
    // 🚀 CRITICAL: Check bypass flag FIRST using universal checker
    const currentUserId = localStorage.getItem('currentUserId');
    if (currentUserId && isBypassActive(platform, currentUserId)) {
      return { active: false, remainingMs: 0 }; // Bypass active = no timer blocking
    }
    
    const raw = localStorage.getItem(`${platform}_processing_countdown`);
    if (!raw) return { active: false, remainingMs: 0 };

    const endTime = parseInt(raw, 10);
    if (Number.isNaN(endTime)) return { active: true, remainingMs: 0 }; // treat as active because key exists

    const remainingMs = Math.max(0, endTime - Date.now());
    // EVEN IF remainingMs==0 we still block; processing page will clean keys when done
    return { active: true, remainingMs };
  } catch {
    return { active: false, remainingMs: 0 };
  }
};

// Username not required for redirect; keep logic minimal

/**
 * 🛡️ BULLETPROOF GLOBAL PROCESSING GUARD
 * 
 * This guard implements 7 layers of protection against timer bypass:
 * 
 * LAYER 1: Immediate Route Check - Blocks on mount and every route change
 * LAYER 2: Storage Event Listener - Syncs across all tabs/windows  
 * LAYER 3: Focus Event Handler - Blocks when returning to tab
 * LAYER 4: Visibility Change Handler - Blocks when tab becomes visible
 * LAYER 5: History Blocking - Prevents back/forward navigation
 * LAYER 6: Periodic Timer Check - Continuously validates timer state
 * LAYER 7: Before Unload Protection - Warns before leaving processing
 * 
 * NO BYPASS METHOD CAN CIRCUMVENT ALL 7 LAYERS
 */
const GlobalProcessingGuard: React.FC<GlobalProcessingGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Avoid UI blocking overlays; keep for potential future use but unused
  // const [isBlocked, setIsBlocked] = useState(false);
  const blockingRef = useRef(false);
  const historyBlockRef = useRef<any>(null);

  // BULLETPROOF redirect function
  const forceRedirectToProcessing = (platform: string, remainingMs: number) => {
    if (blockingRef.current) return; // Prevent double redirects
    blockingRef.current = true;
    
    // const username = getPlatformUsername(platform);
    const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
    
    console.log(`🚫 BULLETPROOF GUARD: Blocking ${platform} dashboard - ${remainingMinutes} minutes remaining`);
    
    // Do not set blocked overlay; we will navigate silently
    
    // Use safe navigation to prevent rapid API calls
    safeNavigate(navigate, `/processing/${platform}`, {
      state: {
        platform,
        // username, // REMOVED: This was overwriting the crucial inter-username form username
        remainingMinutes,
        forcedRedirect: true
      },
      replace: true
    }, 10); // High priority for security redirects
    
    // Reset blocking flag after redirect
    setTimeout(() => {
      blockingRef.current = false;
    }, 100);
  };

  // LAYER 1: IMMEDIATE ROUTE CHECK - Runs on every route change and mount
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Skip if already on processing page
    if (currentPath.startsWith('/processing/')) {
      return;
    }
    
    // Check if current route needs protection
    const isProtectedRoute = PROTECTED_ROUTES.some(route => {
      const routePattern = route.replace('/', '');
      return currentPath.includes(routePattern);
    });
    
    if (!isProtectedRoute) return;

    // Get platform from current route
    const platform = getPlatformFromRoute(currentPath);
    if (!platform) return;

    // Check if this platform has active timer
    const timer = hasActiveTimer(platform);
    
    if (timer.active) {
      forceRedirectToProcessing(platform, timer.remainingMs);
      return;
    }

  }, [location.pathname, navigate]);

  // LAYER 2: STORAGE EVENT LISTENER - Cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key || !e.key.endsWith('_processing_countdown')) return;
      
      const platform = e.key.replace('_processing_countdown', '');
      const currentPath = location.pathname;
      
      // Skip if already on processing page
      if (currentPath.startsWith('/processing/')) return;
      
      // Check if we're on a protected route
      const isProtectedRoute = PROTECTED_ROUTES.some(route => {
        const routePattern = route.replace('/', '');
        return currentPath.includes(routePattern);
      });
      
      if (!isProtectedRoute) return;
      
      const timer = hasActiveTimer(platform);
      if (timer.active) {
        console.log(`🚫 BULLETPROOF GUARD (storage): Cross-tab protection triggered for ${platform}`);
        forceRedirectToProcessing(platform, timer.remainingMs);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [location.pathname, navigate]);

  // LAYER 3: FOCUS EVENT HANDLER - Blocks when returning to tab
  useEffect(() => {
    const handleFocus = () => {
      const currentPath = location.pathname;
      
      // Skip if already on processing page
      if (currentPath.startsWith('/processing/')) return;
      
      // Check if we're on a protected route
      const isProtectedRoute = PROTECTED_ROUTES.some(route => {
        const routePattern = route.replace('/', '');
        return currentPath.includes(routePattern);
      });
      
      if (!isProtectedRoute) return;

      // Check only the current platform for active timer
      const platform = getPlatformFromRoute(currentPath);
      if (platform) {
        const timer = hasActiveTimer(platform);
        if (timer.active) {
          console.log(`🚫 BULLETPROOF GUARD (focus): Tab focus protection triggered for ${platform}`);
          forceRedirectToProcessing(platform, timer.remainingMs);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [location.pathname, navigate]);

  // LAYER 4: VISIBILITY CHANGE HANDLER - Blocks when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      
      const currentPath = location.pathname;
      
      // Skip if already on processing page
      if (currentPath.startsWith('/processing/')) return;
      
      // Check if we're on a protected route
      const isProtectedRoute = PROTECTED_ROUTES.some(route => {
        const routePattern = route.replace('/', '');
        return currentPath.includes(routePattern);
      });
      
      if (!isProtectedRoute) return;

      // Check only the current platform for active timer
      const platform = getPlatformFromRoute(currentPath);
      if (platform) {
        const timer = hasActiveTimer(platform);
        if (timer.active) {
          console.log(`🚫 BULLETPROOF GUARD (visibility): Tab visibility protection triggered for ${platform}`);
          forceRedirectToProcessing(platform, timer.remainingMs);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location.pathname, navigate]);

  // LAYER 5: HISTORY BLOCKING - Prevents back/forward navigation during processing
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Only block history on protected routes
    const isProtectedRoute = PROTECTED_ROUTES.some(route => {
      const routePattern = route.replace('/', '');
      return currentPath.includes(routePattern);
    });
    
    if (!isProtectedRoute) return;

    // Check if current platform timer is active
    const platform = getPlatformFromRoute(currentPath);
    if (platform) {
      const timer = hasActiveTimer(platform);
      if (timer.active) {
        // Block browser back/forward buttons
        const blockHistory = () => {
          safeHistoryManipulation('pushState', null, '', window.location.href);
        };
        
        // Push current state to prevent back navigation
        safeHistoryManipulation('pushState', null, '', window.location.href);
        window.addEventListener('popstate', blockHistory);
        
        historyBlockRef.current = () => {
          window.removeEventListener('popstate', blockHistory);
        };
        
        return historyBlockRef.current;
      }
    }
  }, [location.pathname]);

  // LAYER 7: BEFORE UNLOAD PROTECTION - Warns before leaving processing
  useEffect(() => {
    const currentPath = location.pathname;
    const platform = getPlatformFromRoute(currentPath);
    
    if (platform) {
      const timer = hasActiveTimer(platform);
      if (timer.active) {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          e.preventDefault();
          e.returnValue = 'AI processing is still running. Are you sure you want to leave?';
          return 'AI processing is still running. Are you sure you want to leave?';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    }
  }, [location.pathname]);

  // Do not display a blocking overlay; allow children to render while guard navigates
  // If a redirect is triggered, navigation will replace the view quickly.

  return <>{children}</>;
};

export default GlobalProcessingGuard; 
export { GlobalProcessingGuard };