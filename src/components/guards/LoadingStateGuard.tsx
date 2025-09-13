import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface LoadingStateGuardProps {
  children: React.ReactNode;
}

/**
 * ✅ BULLETPROOF CROSS-DEVICE LOADING STATE GUARD - BACKGROUND MODE
 * 
 * This guard ensures that ANY device attempting to access platform dashboards
 * will be redirected to the processing page if a loading state exists.
 * 
 * Key Features:
 * 1. Runs validation in background without blocking UI
 * 2. No more black screens or "Validating Processing Status" messages
 * 3. Seamless navigation while maintaining security
 * 4. Smart validation only when needed
 * 5. Works at authentication level for maximum security
 */
const LoadingStateGuard: React.FC<LoadingStateGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, checkLoadingStateForPlatform } = useAuth();
  // Removed unused isChecking state for background mode
  const inFlightRef = useRef(false);
  const lastRedirectRef = useRef<string | null>(null);
  const backgroundCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastValidationRef = useRef<number>(0);
  const validationCooldownRef = useRef<number>(10000); // 10 second cooldown between validations

  // Platform route mappings
  const platformRoutes: Record<string, string> = {
    '/dashboard': 'instagram',           // Default main dashboard
    '/dashboard/instagram': 'instagram',
    '/dashboard/twitter': 'twitter',
    '/twitter-dashboard': 'twitter',
    '/dashboard/facebook': 'facebook', 
    '/facebook-dashboard': 'facebook',
    '/dashboard/linkedin': 'linkedin',
    '/linkedin-dashboard': 'linkedin'
  };

  // Get platform from current route
  const getCurrentPlatform = (): string | null => {
    const pathname = location.pathname;
    
    // Exact matches
    if (platformRoutes[pathname]) {
      return platformRoutes[pathname];
    }
    
    // Pattern matches for dynamic routes
    if (pathname.includes('/instagram') || pathname === '/dashboard' || pathname === '/account') {
      return 'instagram';
    }
    if (pathname.includes('/twitter')) {
      return 'twitter';
    }
    if (pathname.includes('/facebook')) {
      return 'facebook';
    }
    if (pathname.includes('/linkedin')) {
      return 'linkedin';
    }
    
    return null;
  };

  // Check if current route is a protected platform dashboard
  const isProtectedRoute = (): boolean => {
    const pathname = location.pathname;
    const protectedPatterns = [
      '/dashboard',
      '/account',
      '/instagram',
      '/twitter-dashboard',
      '/facebook-dashboard', 
      '/linkedin-dashboard'
    ];
    
    return protectedPatterns.some(pattern => pathname.includes(pattern)) && 
           !pathname.includes('/processing/');
  };

  // Backend first validation (single source of truth)
  const backendValidate = async (platform: string) => {
    if (!currentUser?.uid) return { ok: false } as const;
    try {
      const res = await fetch(`/api/validate-dashboard-access/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });
      if (!res.ok) return { ok: false } as const;
      const data = await res.json();
      return { ok: true, data } as const;
    } catch {
      return { ok: false } as const;
    }
  };

  // ✅ BACKGROUND VALIDATION: Performs authoritative check without blocking UI
  const backgroundCheck = async () => {
    if (inFlightRef.current) return; // prevent overlap
    
    // ✅ SMART VALIDATION: Only validate if enough time has passed since last validation
    const now = Date.now();
    if (now - lastValidationRef.current < validationCooldownRef.current) {
      return; // Skip validation if too soon
    }
    
    inFlightRef.current = true;
    try {
      if (!currentUser?.uid || !isProtectedRoute()) return;
      const platform = getCurrentPlatform();
      
      // ✅ ENHANCED GLOBAL PROCESSING VALIDATION - More aggressive checking
      if (currentUser?.uid) {
        try {
          // ✅ OPTIMIZED LOGGING: Only log when there are active processing states
          const globalResp = await fetch(`/api/processing-status/${currentUser.uid}?ts=${Date.now()}`, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
          if (globalResp.ok) {
            const globalJson = await globalResp.json();
            const states = globalJson?.data || {};
            const platforms = Object.keys(states);
            
            // Only log if there are active processing states
            const activePlatforms = platforms.filter(p => {
              const st = states[p];
              return st && typeof st.endTime === 'number' && Date.now() < st.endTime;
            });
            
            if (activePlatforms.length > 0) {
              console.log(`🔍 BACKGROUND VALIDATION: Found ${activePlatforms.length} active processing states`);
            }
            
            for (const p of platforms) {
              const st = states[p];
              if (st && typeof st.endTime === 'number' && Date.now() < st.endTime) {
                // Found active processing – redirect to proper processing route
                const processingRoute = `/processing/${p}`;
                const remainingMinutes = Math.ceil((st.endTime - now) / 60000);
                
                // ✅ SMART REDIRECT: Only redirect if user is actually on a conflicting route
                const currentPath = location.pathname;
                const isConflictingRoute = (
                  (p === 'instagram' && (currentPath.includes('/dashboard') || currentPath.includes('/instagram'))) ||
                  (p === 'twitter' && (currentPath.includes('/twitter-dashboard') || currentPath.includes('/twitter'))) ||
                  (p === 'facebook' && (currentPath.includes('/facebook-dashboard') || currentPath.includes('/facebook'))) ||
                  (p === 'linkedin' && (currentPath.includes('/linkedin-dashboard') || currentPath.includes('/linkedin')))
                );
                
                if (isConflictingRoute) {
                  console.log(`🔍 BACKGROUND VALIDATION: Active processing found for ${p} - ${remainingMinutes}min remaining, redirecting to ${processingRoute}`);
                  
                  if (lastRedirectRef.current !== processingRoute) {
                    lastRedirectRef.current = processingRoute;
                    // ✅ SEAMLESS REDIRECT: Navigate without showing validation screen
                    navigate(processingRoute, {
                      replace: true,
                      state: { 
                        platform: p, 
                        remainingMinutes,
                        fromGuardGlobal: true,
                        username: st.username || ''
                      }
                    });
                  }
                  lastValidationRef.current = now; // Update validation timestamp
                  return; // stop further checks, we're redirecting
                } else {
                  // User is not on a conflicting route, just log the active processing
                  console.log(`🔍 BACKGROUND VALIDATION: Active processing for ${p} but user not on conflicting route - no redirect needed`);
                }
              }
            }
            
            // Only log if no active processing states found and we're on a protected route
            if (platforms.length === 0 && isProtectedRoute()) {
              console.log(`🔍 BACKGROUND VALIDATION: No active processing states found`);
            }
          } else {
            console.warn(`🔍 BACKGROUND VALIDATION: Failed to fetch processing status: ${globalResp.status}`);
          }
        } catch (e) {
          console.warn('🔍 BACKGROUND VALIDATION: Error during global processing validation:', e);
        }
      }

      // ✅ ENHANCED PLATFORM ACCESS CHECK: Check if platform is now claimed after completion
      if (platform && currentUser?.uid) {
        try {
          // ✅ CRITICAL FIX: Use the SAME endpoints as App.tsx for consistency
          // This prevents the cross-device sync mismatch where LoadingStateGuard and App.tsx use different data sources
          let endpoint = '';
          if (platform === 'instagram') {
            endpoint = `/api/user-instagram-status/${currentUser.uid}`;
          } else if (platform === 'twitter') {
            endpoint = `/api/user-twitter-status/${currentUser.uid}`;
          } else if (platform === 'facebook') {
            endpoint = `/api/user-facebook-status/${currentUser.uid}`;
          } else {
            endpoint = `/api/platform-access/${currentUser.uid}`;
          }
          
          const tsEndpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}ts=${Date.now()}`;
          const accessResp = await fetch(tsEndpoint, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
          if (accessResp.ok) {
            const accessJson = await accessResp.json();
            const accessData = accessJson?.data || accessJson; // Handle both response formats
            
            // Check the SAME fields as App.tsx
            let isClaimed = false;
            if (platform === 'instagram') {
              isClaimed = accessData.hasEnteredInstagramUsername === true;
            } else if (platform === 'twitter') {
              isClaimed = accessData.hasEnteredTwitterUsername === true;
            } else if (platform === 'facebook') {
              isClaimed = accessData.hasEnteredFacebookUsername === true;
            } else {
              isClaimed = accessData[platform]?.claimed === true;
            }
            
            if (isClaimed) {
              // Platform is claimed on backend - check if we need to update localStorage
              const localAccessKey = `${platform}_accessed_${currentUser.uid}`;
              const localClaimed = localStorage.getItem(localAccessKey) === 'true';
              
              if (!localClaimed) {
                console.log(`🔍 BACKGROUND VALIDATION: Platform ${platform} is claimed on backend but not locally - syncing`);
                localStorage.setItem(localAccessKey, 'true');
                
                // ✅ CRITICAL FIX: Also sync username and other data to localStorage for complete cross-device sync
                try {
                  let username = '';
                  if (platform === 'instagram' && accessData.instagram_username) {
                    username = accessData.instagram_username;
                  } else if (platform === 'twitter' && accessData.twitter_username) {
                    username = accessData.twitter_username;
                  } else if (platform === 'facebook' && accessData.facebook_username) {
                    username = accessData.facebook_username;
                  }
                  
                  if (username && username.trim()) {
                    localStorage.setItem(`${platform}_username_${currentUser.uid}`, username.trim());
                    console.log(`🔍 BACKGROUND VALIDATION: Username ${username} synced to localStorage for ${platform}`);
                  }
                  
                  // Get account type if available
                  if (accessData.accountType) {
                    localStorage.setItem(`${platform}_account_type_${currentUser.uid}`, accessData.accountType);
                    console.log(`🔍 BACKGROUND VALIDATION: Account type ${accessData.accountType} synced to localStorage for ${platform}`);
                  }
                } catch (error) {
                  console.warn(`🔍 BACKGROUND VALIDATION: Failed to sync additional data for ${platform}:`, error);
                }
                
                // Force a page refresh to update the UI
                console.log(`🔍 BACKGROUND VALIDATION: Forcing page refresh to sync platform status`);
                window.location.reload();
                return;
              }
            }
          }
        } catch (e) {
          console.warn('🔍 BACKGROUND VALIDATION: Error during platform access check:', e);
        }
      }

      // If no global active processing, fall back to per-route validation
      if (!platform) return;
      
      // ✅ ENHANCED LOCAL STORAGE CHECK - Check for any active timers in localStorage
      try {
        const allPlatforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
        for (const p of allPlatforms) {
          const countdownKey = `${p}_processing_countdown`;
          const infoKey = `${p}_processing_info`;
          
          const countdownRaw = localStorage.getItem(countdownKey);
          const infoRaw = localStorage.getItem(infoKey);
          
          if (countdownRaw && infoRaw) {
            try {
              const endTime = parseInt(countdownRaw, 10);
              const info = JSON.parse(infoRaw);
              const now = Date.now();
              
              if (!Number.isNaN(endTime) && endTime > now && info.platform === p) {
                const remainingMinutes = Math.ceil((endTime - now) / 60000);
                
                // ✅ SMART REDIRECT: Only redirect if user is on a conflicting route
                const currentPath = location.pathname;
                const isConflictingRoute = (
                  (p === 'instagram' && (currentPath.includes('/dashboard') || currentPath.includes('/instagram'))) ||
                  (p === 'twitter' && (currentPath.includes('/twitter-dashboard') || currentPath.includes('/twitter'))) ||
                  (p === 'facebook' && (currentPath.includes('/facebook-dashboard') || currentPath.includes('/facebook'))) ||
                  (p === 'linkedin' && (currentPath.includes('/linkedin-dashboard') || currentPath.includes('/linkedin')))
                );
                
                if (isConflictingRoute) {
                  console.log(`🔍 BACKGROUND VALIDATION: Active timer found for ${p} - ${remainingMinutes}min remaining`);
                  
                  // Redirect to processing page for this platform
                  const processingRoute = `/processing/${p}`;
                  if (lastRedirectRef.current !== processingRoute) {
                    lastRedirectRef.current = processingRoute;
                    // ✅ SEAMLESS REDIRECT: Navigate without showing validation screen
                    navigate(processingRoute, {
                      replace: true,
                      state: { 
                        platform: p, 
                        remainingMinutes,
                        fromGuardLocalStorage: true,
                        username: info.username || ''
                      }
                    });
                  }
                  lastValidationRef.current = now; // Update validation timestamp
                  return; // stop further checks, we're redirecting
                } else {
                  // User is not on a conflicting route, just note the active timer
                  console.log(`🔍 BACKGROUND VALIDATION: Active timer for ${p} but user not on conflicting route - no redirect needed`);
                }
              }
            } catch (parseError) {
              console.warn(`🔍 BACKGROUND VALIDATION: Error parsing timer data for ${p}:`, parseError);
            }
          }
        }
      } catch (e) {
        console.warn('🔍 BACKGROUND VALIDATION: Error during localStorage validation:', e);
      }
      
      // If override flag set very recently (<15s), note it but DO NOT skip backend validation
      try {
        const overrideKey = `processing_override_${platform}`;
        const ts = localStorage.getItem(overrideKey);
        if (ts && Date.now() - parseInt(ts, 10) < 15000) {
          console.log('⏳ BACKGROUND GUARD: Override active; still performing backend validation.');
        }
      } catch {}

      // 1. Backend authoritative check
      const backend = await backendValidate(platform);
      if (backend.ok && backend.data?.success) {
        if (backend.data.accessAllowed === false && backend.data.reason === 'processing_active') {
          const processingRoute = backend.data.redirectTo || `/processing/${platform}`;
          // Avoid redirect loops
            if (lastRedirectRef.current !== processingRoute) {
              lastRedirectRef.current = processingRoute;
              // ✅ SEAMLESS REDIRECT: Navigate without showing validation screen
              navigate(processingRoute, {
                state: {
                  platform,
                  remainingMinutes: backend.data.processingData?.remainingMinutes,
                  fromGuard: true,
                  backendAuthoritative: true
                },
                replace: true
              });
            }
          lastValidationRef.current = now; // Update validation timestamp
          return;
        } else if (backend.data.accessAllowed === true) {
          // Allowed, proceed
          lastValidationRef.current = now; // Update validation timestamp
          return;
        }
      }

      // 2. Fallback to existing local/backend hybrid if backend failed
      const fallback = await checkLoadingStateForPlatform(platform);
      if (fallback.hasLoadingState && fallback.redirectTo) {
        if (lastRedirectRef.current !== fallback.redirectTo) {
          lastRedirectRef.current = fallback.redirectTo;
          // ✅ SEAMLESS REDIRECT: Navigate without showing validation screen
          navigate(fallback.redirectTo, {
            state: {
              platform,
              remainingMinutes: fallback.remainingMinutes,
              fromGuardFallback: true
            },
            replace: true
          });
          return;
        }
      }
      
      lastValidationRef.current = now; // Update validation timestamp
    } finally {
      inFlightRef.current = false;
    }
  };

  // ✅ BACKGROUND VALIDATION: Run validation in background without blocking UI
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    // ✅ IMMEDIATE BACKGROUND CHECK: Run validation immediately but in background
    backgroundCheck();
    
    // ✅ SMART BACKGROUND MONITORING: Run validation periodically but intelligently
    const startBackgroundMonitoring = () => {
      if (backgroundCheckRef.current) {
        clearInterval(backgroundCheckRef.current);
      }
      
      backgroundCheckRef.current = setInterval(() => {
        // Only run validation if:
        // 1. Tab is visible (user is active)
        // 2. On protected routes
        // 3. Enough time has passed since last validation
        if (!document.hidden && isProtectedRoute()) {
          const now = Date.now();
          if (now - lastValidationRef.current >= validationCooldownRef.current) {
            backgroundCheck();
          }
        }
      }, 5000); // ✅ OPTIMIZED: Increased from 3 seconds to 5 seconds for better performance
    };
    
    startBackgroundMonitoring();
    
    // ✅ ROUTE CHANGE VALIDATION: Run validation on route changes but in background
    // Use location.pathname changes to detect route changes
    if (isProtectedRoute()) {
      // Small delay to ensure route change is complete
      setTimeout(() => {
        backgroundCheck();
      }, 200); // ✅ OPTIMIZED: Increased from 100ms to 200ms
    }
    
    return () => {
      if (backgroundCheckRef.current) {
        clearInterval(backgroundCheckRef.current);
      }
    };
  }, [currentUser?.uid, location.pathname]);

  // ✅ ENHANCED STORAGE EVENT HANDLING: More aggressive cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      
      // Check for any processing-related changes
      if (e.key.endsWith('_processing_countdown') || 
          e.key.endsWith('_processing_info') ||
          e.key.includes('processing') ||
          e.key.includes('platform')) {
        
        const platform = e.key.replace('_processing_countdown', '').replace('_processing_info', '');
        const currentPlatform = getCurrentPlatform();
        
        // ✅ OPTIMIZED LOGGING: Only log when there are actual cross-platform changes
        if (platform === currentPlatform && isProtectedRoute()) {
          // Re-run background validation shortly after storage event
          console.log(`🔍 STORAGE EVENT: Re-running background validation for ${platform}`);
          setTimeout(() => { backgroundCheck(); }, 300); // ✅ OPTIMIZED: Increased from 200ms to 300ms
        } else if (isProtectedRoute()) {
          // Even if it's a different platform, check if we need to redirect
          console.log(`🔍 STORAGE EVENT: Cross-platform change detected, checking all platforms`);
          setTimeout(() => { backgroundCheck(); }, 500); // ✅ OPTIMIZED: Increased from 300ms to 500ms
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [location.pathname]);

  // ✅ ENHANCED VISIBILITY CHANGE HANDLING: Check when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentUser?.uid && isProtectedRoute()) {
        console.log(`🔍 VISIBILITY CHANGE: Tab became visible, running background validation`);
        // Small delay to ensure any background sync has completed
        setTimeout(() => backgroundCheck(), 800); // ✅ OPTIMIZED: Increased from 500ms to 800ms
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser?.uid, location.pathname]);

  // ✅ NO MORE BLOCKING UI: Always render children immediately
  // The guard now works silently in the background
  return <>{children}</>;
};

export default LoadingStateGuard;
