import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface LoadingStateGuardProps {
  children: React.ReactNode;
}

/**
 * ✅ BULLETPROOF CROSS-DEVICE LOADING STATE GUARD
 * 
 * This guard ensures that ANY device attempting to access platform dashboards
 * will be redirected to the processing page if a loading state exists.
 * 
 * Key Features:
 * 1. Checks backend processing status as source of truth
 * 2. Syncs loading states across devices
 * 3. Prevents dashboard access during processing
 * 4. Handles expired timers automatically
 * 5. Works at authentication level for maximum security
 */
const LoadingStateGuard: React.FC<LoadingStateGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, checkLoadingStateForPlatform, syncProcessingStatusFromBackend } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState(0);

  // ✅ SPECIFIC PLATFORM ROUTE MAPPINGS - Only block the exact platform dashboard
  const platformRoutes: Record<string, string> = {
    // Instagram specific routes
    '/dashboard/instagram': 'instagram',
    // Twitter specific routes  
    '/dashboard/twitter': 'twitter',
    '/twitter-dashboard': 'twitter',
    // Facebook specific routes
    '/dashboard/facebook': 'facebook', 
    '/facebook-dashboard': 'facebook',
    // LinkedIn specific routes
    '/dashboard/linkedin': 'linkedin',
    '/linkedin-dashboard': 'linkedin'
    // ✅ REMOVED: '/dashboard': 'instagram' - Main dashboard should NEVER be blocked
    // ✅ REMOVED: '/account': 'instagram' - Account page should NEVER be blocked
  };

  // Get platform from current route - ONLY for specific platform dashboards
  const getCurrentPlatform = (): string | null => {
    const pathname = location.pathname;
    
    // Exact matches for specific platform dashboards ONLY
    if (platformRoutes[pathname]) {
      return platformRoutes[pathname];
    }
    
    // ✅ REMOVED: Pattern matches that were too broad
    // We only want to protect specific platform dashboard routes, not general navigation
    
    return null; // Return null for all other routes (main dashboard, account, etc.)
  };

  // Check if current route is a protected platform dashboard (SPECIFIC ONLY)
  const isProtectedRoute = (): boolean => {
    const pathname = location.pathname;
    
    // ✅ ONLY protect specific platform dashboard routes
    const protectedRoutes = [
      '/dashboard/instagram',    // Instagram specific dashboard
      '/dashboard/twitter',      // Twitter specific dashboard  
      '/twitter-dashboard',      // Twitter alternative route
      '/dashboard/facebook',     // Facebook specific dashboard
      '/facebook-dashboard',     // Facebook alternative route
      '/dashboard/linkedin',     // LinkedIn specific dashboard
      '/linkedin-dashboard'      // LinkedIn alternative route
    ];
    
    // ✅ ALLOW: Main dashboard (/dashboard), account page (/account), and all other navigation
    const exactMatch = protectedRoutes.includes(pathname);
    
    if (exactMatch) {
      console.log(`[LOADING GUARD] 🔍 Protected route detected: ${pathname}`);
    } else {
      console.log(`[LOADING GUARD] ✅ Non-protected route, allowing access: ${pathname}`);
    }
    
    return exactMatch;
  };

  // Main loading state check
  const checkLoadingState = async () => {
    if (!currentUser?.uid || !isProtectedRoute()) {
      setIsChecking(false);
      return;
    }

    const platform = getCurrentPlatform();
    if (!platform) {
      setIsChecking(false);
      return;
    }

    // Throttle checks to prevent excessive API calls
    const now = Date.now();
    if (now - lastCheckTime < 2000) { // Wait at least 2 seconds between checks
      setIsChecking(false);
      return;
    }
    setLastCheckTime(now);

    try {
      console.log(`[LOADING GUARD] 🔍 Checking loading state for ${platform} at route ${location.pathname}`);
      
      const loadingCheck = await checkLoadingStateForPlatform(platform);
      
      if (loadingCheck.hasLoadingState && loadingCheck.redirectTo) {
        console.log(`[LOADING GUARD] ⚠️ Loading state detected for ${platform}, redirecting to processing`);
        
        // ✅ DOUBLE VALIDATION: Confirm with backend before redirecting
        try {
          const backendValidation = await fetch(`/api/validate-dashboard-access/${currentUser.uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform })
          });

          if (backendValidation.ok) {
            const data = await backendValidation.json();
            if (data.success && data.accessAllowed === true) {
              // Backend says access is allowed, don't redirect
              console.log(`[LOADING GUARD] ✅ Backend override: Access allowed for ${platform} despite local loading state`);
              setIsChecking(false);
              return;
            } else if (data.success && data.accessAllowed === false) {
              console.log(`[LOADING GUARD] ⚠️ Backend confirms: Access denied for ${platform}, redirecting`);
              // Continue with redirect
            }
          }
        } catch (backendError) {
          console.warn(`[LOADING GUARD] Backend validation failed, proceeding with local state:`, backendError);
          // Continue with redirect based on local state
        }
        
        // Build processing route with state
        const processingRoute = loadingCheck.redirectTo;
        const state = {
          platform,
          remainingMinutes: loadingCheck.remainingMinutes,
          fromGuard: true,
          originalRoute: location.pathname
        };
        
        navigate(processingRoute, { 
          state, 
          replace: true 
        });
        return;
      }
      
      console.log(`[LOADING GUARD] ✅ No loading state for ${platform}, allowing access`);
      setIsChecking(false);
      
    } catch (error) {
      console.error(`[LOADING GUARD] Error checking loading state for ${platform}:`, error);
      setIsChecking(false);
    }
  };

  // Check loading state on mount and route changes
  useEffect(() => {
    if (!currentUser?.uid) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    checkLoadingState();
  }, [currentUser?.uid, location.pathname]);

  // Periodic sync of processing statuses for real-time updates
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncInterval = setInterval(async () => {
      try {
        await syncProcessingStatusFromBackend();
        
        // Re-check if we're on a protected route
        if (isProtectedRoute()) {
          const platform = getCurrentPlatform();
          if (platform) {
            const loadingCheck = await checkLoadingStateForPlatform(platform);
            if (loadingCheck.hasLoadingState && loadingCheck.redirectTo) {
              console.log(`[LOADING GUARD] 🔄 Periodic check: Loading state detected for ${platform}, redirecting`);
              navigate(loadingCheck.redirectTo, { 
                state: { 
                  platform, 
                  remainingMinutes: loadingCheck.remainingMinutes,
                  fromPeriodicCheck: true 
                }, 
                replace: true 
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[LOADING GUARD] Periodic sync error:`, error);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(syncInterval);
  }, [currentUser?.uid, location.pathname]);

  // Handle storage events for cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      
      // React to processing countdown changes
      if (e.key.endsWith('_processing_countdown')) {
        const platform = e.key.replace('_processing_countdown', '');
        const currentPlatform = getCurrentPlatform();
        
        if (platform === currentPlatform && isProtectedRoute()) {
          console.log(`[LOADING GUARD] 📡 Cross-tab loading state change detected for ${platform}`);
          // Re-check loading state
          setTimeout(checkLoadingState, 500);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [location.pathname]);

  // Show minimal loading state while checking
  if (isChecking) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ 
          textAlign: 'center',
          color: 'white',
          fontSize: '16px'
        }}>
          <div style={{ marginBottom: '12px' }}>🔍 Validating Processing Status</div>
          <div style={{ fontSize: '14px', opacity: 0.8 }}>
            Checking for active loading states...
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default LoadingStateGuard;
