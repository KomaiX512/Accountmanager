import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';
import ProcessingErrorBoundary from '../components/common/ProcessingErrorBoundary';
import { useProcessing } from '../context/ProcessingContext';
import { useAuth } from '../context/AuthContext';
import { safeNavigate, safeHistoryManipulation } from '../utils/navigationGuard';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: string }>();
  const location = useLocation();
  const { completeProcessing } = useProcessing();
  const { currentUser } = useAuth();
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
  
  // Get username from state or localStorage
  const username = stateData?.username || (() => {
    try {
      const processingInfo = localStorage.getItem(`${targetPlatform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        return info.username || 'User';
      }
    } catch (error) {
      console.error('Error reading username from localStorage:', error);
    }
    return 'User';
  })();
  
  const remainingMinutes = stateData?.remainingMinutes;
  const forcedRedirect = stateData?.forcedRedirect || false;

  // Validate timer and check if platform is completed
  const validateTimer = () => {
    try {
      const savedCountdown = localStorage.getItem(`${targetPlatform}_processing_countdown`);
      const processingInfo = localStorage.getItem(`${targetPlatform}_processing_info`);
      
      if (!savedCountdown || !processingInfo) {
        // No active timer - check if platform is completed
        const completedPlatforms = localStorage.getItem('completedPlatforms');
        if (completedPlatforms) {
          const completed = JSON.parse(completedPlatforms);
          if (completed.includes(targetPlatform)) {
            console.log(`🛡️ PROCESSING PAGE: Platform ${targetPlatform} already completed, redirecting to dashboard`);
            return { isValid: false, reason: 'completed' };
          }
        }
        return { isValid: false, reason: 'no_data' };
      }

      const info = JSON.parse(processingInfo);
      const endTime = parseInt(savedCountdown);
      const now = Date.now();
      
      // Verify this loading state belongs to the current platform
      if (info.platform !== targetPlatform) {
        return { isValid: false, reason: 'platform_mismatch' };
      }
      
      // Check if timer has expired
      if (now >= endTime) {
        return { isValid: false, reason: 'expired' };
      }
      
      const remainingMs = endTime - now;
      const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
      
      console.log(`🛡️ PROCESSING PAGE: Valid timer for ${targetPlatform} - ${remainingMinutes} minutes remaining`);
      return { isValid: true, remainingMs, remainingMinutes };
    } catch (error) {
      console.error('Error validating timer:', error);
      return { isValid: false, reason: 'error' };
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
        
        // Reset global processing state & redirect to appropriate dashboard
        completeProcessing();
        // Redirect to appropriate dashboard
        const dashboardPath = getDashboardPath(targetPlatform);
        safeNavigate(navigate, dashboardPath, { replace: true }, 8);
        return;
      }

      // Valid timer found - allow processing page to render
      console.log(`🛡️ PROCESSING PAGE: Valid timer for ${targetPlatform} - ${timer.remainingMs ? Math.ceil(timer.remainingMs / 1000 / 60) : 'unknown'} minutes remaining`);
      setShouldRender(true);
      setIsValidating(false);
    };

    // Add slight delay to prevent flash
    setTimeout(validate, 100);
  }, [targetPlatform, navigate, completeProcessing]);

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
        
        // Reset global processing state & redirect to appropriate dashboard
        completeProcessing();
        // Redirect to appropriate dashboard
        const dashboardPath = getDashboardPath(targetPlatform);
        safeNavigate(navigate, dashboardPath, { replace: true }, 8);
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [shouldRender, targetPlatform, navigate, completeProcessing]);

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
          safeNavigate(navigate, dashboardPath, { replace: true }, 8);
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
        safeHistoryManipulation('pushState', null, '', window.location.href);
        console.log(`🛡️ PROCESSING PAGE: Blocked back navigation for ${targetPlatform}`);
      }
    };

    // Push initial state
    safeHistoryManipulation('pushState', null, '', window.location.href);
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
    
    // Clean up storage & reset context
    localStorage.removeItem(`${targetPlatform}_processing_countdown`);
    localStorage.removeItem(`${targetPlatform}_processing_info`);
    
    // Mark platform as completed
    const completedPlatforms = localStorage.getItem('completedPlatforms');
    const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
    if (!completed.includes(targetPlatform)) {
      completed.push(targetPlatform);
      localStorage.setItem('completedPlatforms', JSON.stringify(completed));
    }
    
    completeProcessing();
    
    // Navigate to appropriate dashboard
    const dashboardPath = getDashboardPath(targetPlatform);
    safeNavigate(navigate, dashboardPath, { replace: true }, 8);
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
    <ProcessingErrorBoundary 
      platform={targetPlatform}
      onReset={() => window.location.reload()}
      onNavigateHome={() => safeNavigate(navigate, '/account', {}, 1)}
    >
      <ProcessingLoadingState 
        platform={targetPlatform as 'instagram' | 'twitter' | 'facebook'}
        username={username}
        onComplete={handleComplete}
        remainingMinutes={remainingMinutes}
      />
    </ProcessingErrorBoundary>
  );
};

export default Processing; 