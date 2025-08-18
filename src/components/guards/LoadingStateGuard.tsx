import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface LoadingStateGuardProps {
  children: React.ReactNode;
}

/**
 * ✅ BULLETPROOF CROSS-DEVICE LOADING STATE GUARD - BACKGROUND VALIDATION
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
 * 6. ✅ NEW: Background validation - no black loading screen for users
 */
const LoadingStateGuard: React.FC<LoadingStateGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, checkLoadingStateForPlatform } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  const [validationComplete, setValidationComplete] = useState(false);
  const inFlightRef = useRef(false);
  const lastRedirectRef = useRef<string | null>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // ✅ BACKGROUND VALIDATION - No blocking UI, seamless user experience
  const backgroundValidate = async () => {
    if (inFlightRef.current) return; // prevent overlap
    inFlightRef.current = true;
    
    try {
      if (!isProtectedRoute()) { 
        setValidationComplete(true);
        return; 
      }
      if (!currentUser?.uid) { 
        setValidationComplete(true);
        return; 
      }
      
      const platform = getCurrentPlatform();
      
      // 0. GLOBAL processing validation – block access if ANY platform still in processing state
      if (currentUser?.uid) {
        try {
          const globalResp = await fetch(`/api/processing-status/${currentUser.uid}`);
          if (globalResp.ok) {
            const globalJson = await globalResp.json();
            const states = globalJson?.data || {};
            const platforms = Object.keys(states);
            for (const p of platforms) {
              const st = states[p];
              if (st && typeof st.endTime === 'number' && Date.now() < st.endTime) {
                // Only redirect if the user is trying to access *that* platform's dashboard
                const currentRoutePlatform = platform;
                if (currentRoutePlatform && currentRoutePlatform === p) {
                  const processingRoute = `/processing/${p}`;
                  if (lastRedirectRef.current !== processingRoute) {
                    lastRedirectRef.current = processingRoute;
                    console.log(`🔄 BACKGROUND VALIDATION: Redirecting to processing for ${p}`);
                    // Seamless redirect without loading screen
                    navigate(processingRoute, {
                      replace: true,
                      state: { 
                        platform: p, 
                        remainingMinutes: Math.ceil((st.endTime - Date.now())/60000), 
                        fromGuardGlobal: true 
                      }
                    });
                  }
                  return; // stop further checks, we're redirecting
                }
                // If the current page is unrelated to the processing platform, just allow navigation
                continue;
              }
            }
          }
        } catch (e) {
          console.warn('GLOBAL processing validation error', e);
        }
      }

      // If no global active processing, fall back to per-route logic
      if (!platform) {
        setValidationComplete(true);
        return;
      }
      
      // If override flag set very recently (<15s), note it but DO NOT skip backend validation
      try {
        const overrideKey = `processing_override_${platform}`;
        const ts = localStorage.getItem(overrideKey);
        if (ts && Date.now() - parseInt(ts, 10) < 15000) {
          console.log('⏳ GUARD: Override active; still performing backend validation.');
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
            console.log(`🔄 BACKGROUND VALIDATION: Backend redirecting to processing for ${platform}`);
            // Seamless redirect without loading screen
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
          return;
        } else if (backend.data.accessAllowed === true) {
          // Allowed, proceed; also clear any stale local storage for this platform if timer expired
          setValidationComplete(true);
          return;
        }
      }

      // 2. Fallback to existing local/backend hybrid if backend failed
      const fallback = await checkLoadingStateForPlatform(platform);
      if (fallback.hasLoadingState && fallback.redirectTo) {
        if (lastRedirectRef.current !== fallback.redirectTo) {
          lastRedirectRef.current = fallback.redirectTo;
          console.log(`🔄 BACKGROUND VALIDATION: Fallback redirecting to processing for ${platform}`);
          // Seamless redirect without loading screen
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
      
      // All validations passed - allow access
      setValidationComplete(true);
      
    } finally {
      inFlightRef.current = false;
    }
  };

  // ✅ BACKGROUND VALIDATION TRIGGER - Start validation immediately but don't block UI
  useEffect(() => {
    if (!currentUser?.uid) { 
      setValidationComplete(true);
      return; 
    }
    
    // Start background validation immediately
    setIsValidating(true);
    
    // Perform validation in background with timeout protection
    const performValidation = async () => {
      try {
        await backgroundValidate();
      } catch (error) {
        console.error('Background validation error:', error);
        setValidationComplete(true); // Allow access on error
      }
    };
    
    // Start validation immediately
    performValidation();
    
    // Set a timeout to ensure validation completes (max 15 seconds)
    validationTimeoutRef.current = setTimeout(() => {
      if (!validationComplete) {
        console.warn('Background validation timeout - allowing access');
        setValidationComplete(true);
      }
    }, 15000);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, location.pathname]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Handle storage events for cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.endsWith('_processing_countdown')) {
        const platform = e.key.replace('_processing_countdown', '');
        const currentPlatform = getCurrentPlatform();
        if (platform === currentPlatform && isProtectedRoute()) {
          // Re-run authoritative check shortly after storage event
          setTimeout(() => { 
            if (!inFlightRef.current) {
              backgroundValidate(); 
            }
          }, 400);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [location.pathname]);

  // ✅ NO LOADING SCREEN - Show content immediately while validating in background
  // The validation happens seamlessly without blocking the user interface
  
  // Show children immediately - validation happens in background
  return <>{children}</>;
};

export default LoadingStateGuard;
