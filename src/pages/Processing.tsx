import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: string }>();
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [shouldRender, setShouldRender] = useState(false);
  const validationRef = useRef(false);

  // Get data from navigation state or defaults
  const stateData = location.state as {
    platform?: string;
    username?: string;
    remainingMinutes?: number;
    forcedRedirect?: boolean;
  } | null;

  const targetPlatform = platform || stateData?.platform || 'instagram';
  const username = stateData?.username || 'User';
  const remainingMinutes = stateData?.remainingMinutes;
  const forcedRedirect = stateData?.forcedRedirect || false;

  // BULLETPROOF timer validation
  const validateTimer = (): { isValid: boolean; remainingMs: number } => {
    try {
      const raw = localStorage.getItem(`${targetPlatform}_processing_countdown`);
      if (!raw) return { isValid: false, remainingMs: 0 };
      
      const endTime = parseInt(raw, 10);
      if (Number.isNaN(endTime)) return { isValid: false, remainingMs: 0 };
      
      const remainingMs = Math.max(0, endTime - Date.now());
      return { isValid: remainingMs > 0, remainingMs };
    } catch {
      return { isValid: false, remainingMs: 0 };
    }
  };

  // BULLETPROOF processing page protection
  useEffect(() => {
    if (validationRef.current) return;
    validationRef.current = true;

    const validate = () => {
      const timer = validateTimer();
      
      if (!timer.isValid) {
        // No valid timer found - this could be:
        // 1. Timer expired naturally
        // 2. Direct access without timer
        // 3. Refresh attack on processing page
        
        console.log(`🛡️ PROCESSING PAGE: No valid timer for ${targetPlatform}, redirecting to dashboard`);
        
        // Clean up any stale storage
        localStorage.removeItem(`${targetPlatform}_processing_countdown`);
        localStorage.removeItem(`${targetPlatform}_processing_info`);
        
        // Redirect to appropriate dashboard
        const dashboardPath = getDashboardPath(targetPlatform);
        navigate(dashboardPath, { replace: true });
        return;
      }

      // Valid timer found - allow processing page to render
      console.log(`🛡️ PROCESSING PAGE: Valid timer for ${targetPlatform} - ${Math.ceil(timer.remainingMs / 1000 / 60)} minutes remaining`);
      setShouldRender(true);
      setIsValidating(false);
    };

    // Add slight delay to prevent flash
    setTimeout(validate, 100);
  }, [targetPlatform, navigate]);

  // Helper function to get dashboard path
  const getDashboardPath = (platform: string): string => {
    switch (platform) {
      case 'instagram': return '/dashboard';
      case 'twitter': return '/twitter-dashboard';
      case 'facebook': return '/facebook-dashboard';
      case 'linkedin': return '/linkedin-dashboard';
      default: return '/dashboard';
    }
  };

  // ANTI-REFRESH protection - continuously validate timer
  useEffect(() => {
    if (!shouldRender) return;

    const interval = setInterval(() => {
      const timer = validateTimer();
      
      if (!timer.isValid) {
        console.log(`🛡️ PROCESSING PAGE: Timer expired for ${targetPlatform}, redirecting to dashboard`);
        
        // Clean up storage
        localStorage.removeItem(`${targetPlatform}_processing_countdown`);
        localStorage.removeItem(`${targetPlatform}_processing_info`);
        
        // Redirect to dashboard
        const dashboardPath = getDashboardPath(targetPlatform);
        navigate(dashboardPath, { replace: true });
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [shouldRender, targetPlatform, navigate]);

  // FORCED REDIRECT protection - prevent users from staying on processing if they shouldn't be
  useEffect(() => {
    if (!forcedRedirect || !shouldRender) return;

    // If this was a forced redirect, add extra protection
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timer = validateTimer();
        if (!timer.isValid) {
          console.log(`🛡️ PROCESSING PAGE: Forced redirect validation failed for ${targetPlatform}`);
          const dashboardPath = getDashboardPath(targetPlatform);
          navigate(dashboardPath, { replace: true });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [forcedRedirect, shouldRender, targetPlatform, navigate]);

  // HISTORY MANIPULATION protection
  useEffect(() => {
    if (!shouldRender) return;

    const handlePopState = () => {
      // Prevent users from using back button to escape processing
      const timer = validateTimer();
      if (timer.isValid) {
        // Push state back to prevent navigation
        window.history.pushState(null, '', window.location.href);
        console.log(`🛡️ PROCESSING PAGE: Blocked back navigation for ${targetPlatform}`);
      }
    };

    // Push initial state
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, [shouldRender, targetPlatform]);

  // BEFORE UNLOAD protection
  useEffect(() => {
    if (!shouldRender) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const timer = validateTimer();
      if (timer.isValid) {
        const message = `AI processing is still running for ${targetPlatform}. Are you sure you want to leave?`;
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [shouldRender, targetPlatform]);

  const handleComplete = () => {
    console.log(`🛡️ PROCESSING PAGE: Timer completed for ${targetPlatform}`);
    
    // Clean up storage
    localStorage.removeItem(`${targetPlatform}_processing_countdown`);
    localStorage.removeItem(`${targetPlatform}_processing_info`);
    
    // Navigate to appropriate dashboard
    const dashboardPath = getDashboardPath(targetPlatform);
    navigate(dashboardPath, { replace: true });
  };

  // Show loading while validating
  if (isValidating || !shouldRender) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>🛡️ Validating Timer</div>
          <div>Checking processing status...</div>
        </div>
      </div>
    );
  }

  return (
    <ProcessingLoadingState 
      platform={targetPlatform as 'instagram' | 'twitter' | 'facebook'}
      username={username}
      onComplete={handleComplete}
      remainingMinutes={remainingMinutes}
    />
  );
};

export default Processing; 