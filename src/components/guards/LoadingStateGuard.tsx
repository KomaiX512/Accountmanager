import React, { useEffect, useState, useRef } from 'react';
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
  const { currentUser, checkLoadingStateForPlatform } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const inFlightRef = useRef(false);
  const lastRedirectRef = useRef<string | null>(null);

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

  // Performs authoritative check: if ANY platform is in active processing, redirect accordingly
  const hardCheck = async () => {
    if (inFlightRef.current) return; // prevent overlap
    inFlightRef.current = true;
    try {
      if (!currentUser?.uid || !isProtectedRoute()) return;
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
                // Found active processing – redirect to proper processing route
                const processingRoute = `/processing/${p}`;
                if (lastRedirectRef.current !== processingRoute) {
                  lastRedirectRef.current = processingRoute;
                  navigate(processingRoute, {
                    replace: true,
                    state: { platform: p, remainingMinutes: Math.ceil((st.endTime - Date.now())/60000), fromGuardGlobal: true }
                  });
                }
                return; // stop further checks, we're redirecting
              }
            }
          }
        } catch (e) {
          console.warn('GLOBAL processing validation error', e);
        }
      }

      // If no global active processing, fall back to per-route logic
      if (!platform) return;
      // If override flag set very recently (<15s), note it but DO NOT skip backend validation
      try {
        const overrideKey = `processing_override_${platform}`;
        const ts = localStorage.getItem(overrideKey);
        if (ts && Date.now() - parseInt(ts, 10) < 15000) {
          console.log('⏳ GUARD: Override active; still performing backend validation.');
        }
      } catch {}
      setIsChecking(true);

      // 1. Backend authoritative check
      const backend = await backendValidate(platform);
      if (backend.ok && backend.data?.success) {
        if (backend.data.accessAllowed === false && backend.data.reason === 'processing_active') {
          const processingRoute = backend.data.redirectTo || `/processing/${platform}`;
          // Avoid redirect loops
            if (lastRedirectRef.current !== processingRoute) {
              lastRedirectRef.current = processingRoute;
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
          setIsChecking(false);
          return;
        }
      }

      // 2. Fallback to existing local/backend hybrid if backend failed
      const fallback = await checkLoadingStateForPlatform(platform);
      if (fallback.hasLoadingState && fallback.redirectTo) {
        if (lastRedirectRef.current !== fallback.redirectTo) {
          lastRedirectRef.current = fallback.redirectTo;
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
      setIsChecking(false);
    } finally {
      inFlightRef.current = false;
    }
  };

  // Check loading state on mount and route changes
  useEffect(() => {
    if (!currentUser?.uid) { setIsChecking(false); return; }
    hardCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, location.pathname]);

  // Handle storage events for cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.endsWith('_processing_countdown')) {
        const platform = e.key.replace('_processing_countdown', '');
        const currentPlatform = getCurrentPlatform();
        if (platform === currentPlatform && isProtectedRoute()) {
          // Re-run authoritative check shortly after storage event
          setTimeout(() => { hardCheck(); }, 400);
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
