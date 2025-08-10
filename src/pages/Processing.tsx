import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';
import ProcessingErrorBoundary from '../components/common/ProcessingErrorBoundary';
import { useProcessing } from '../context/ProcessingContext';
// import { useAuth } from '../context/AuthContext';
import { safeNavigate, safeHistoryManipulation } from '../utils/navigationGuard';
import axios from 'axios';
import { API_CONFIG, getApiUrl } from '../config/api';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: string }>();
  const location = useLocation();
  const { completeProcessing } = useProcessing();
  // const { currentUser } = useAuth();
  const [isValidating, setIsValidating] = useState(true);
  const [shouldRender, setShouldRender] = useState(false);
  const validationRef = useRef(false);
  const [extensionMessage, setExtensionMessage] = useState<string | null>(null);

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

  // Helper: check R2 run status existence for platform/username
  const checkRunStatus = async (platformId: string, primaryUsername: string): Promise<{ exists: boolean; status?: string | null }> => {
    try {
      const url = getApiUrl(`${API_CONFIG.ENDPOINTS.RUN_STATUS}/${platformId}/${encodeURIComponent(primaryUsername)}`);
      const res = await axios.get(url, { timeout: 10000 });
      return { exists: !!res.data?.exists, status: res.data?.status ?? null };
    } catch (e) {
      return { exists: false };
    }
  };

  // Helper: finalize and navigate to dashboard consistently
  const finalizeAndNavigate = (plat: string) => {
    try {
      localStorage.removeItem(`${plat}_processing_countdown`);
      localStorage.removeItem(`${plat}_processing_info`);
      const completedPlatforms = localStorage.getItem('completedPlatforms');
      const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
      if (!completed.includes(plat)) {
        completed.push(plat);
        localStorage.setItem('completedPlatforms', JSON.stringify(completed));
      }
    } catch {}
    completeProcessing();
    const dashboardPath = getDashboardPath(plat);
    safeNavigate(navigate, dashboardPath, { replace: true }, 8);
  };

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
        return { isValid: false, reason: 'expired', endTime };
      }
      
      const remainingMs = endTime - now;
      const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
      
      console.log(`🛡️ PROCESSING PAGE: Valid timer for ${targetPlatform} - ${remainingMinutes} minutes remaining`);
      return { isValid: true, remainingMs, remainingMinutes, endTime };
    } catch (error) {
      console.error('Error validating timer:', error);
      return { isValid: false, reason: 'error' };
    }
  };

  // BULLETPROOF processing page protection
  useEffect(() => {
    if (validationRef.current) return;
    validationRef.current = true;

    const validate = async () => {
      const timer = validateTimer();
      
      if (!timer.isValid) {
        // Timer is not valid. If it's expired, perform R2 RunStatus check before redirecting
        if (timer.reason === 'expired') {
          const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
          let primaryUsername = username;
          try {
            if (infoRaw) {
              const info = JSON.parse(infoRaw);
              if (info.username) primaryUsername = info.username;
            }
          } catch {}

          const status = await checkRunStatus(targetPlatform, primaryUsername);
          if (status.exists) {
            // If file exists (completed or failed), allow dashboard immediately
            finalizeAndNavigate(targetPlatform);
            return;
          }

          // No status file yet → grant +5 minutes grace and show message
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          // keep original info; update endTime & totalDuration to include extension window for progress
          try {
            const info = infoRaw ? JSON.parse(infoRaw) : {};
            const updated = {
              ...info,
              endTime: newEnd,
              // Keep original totalDuration to preserve 100% progress during grace window
            } as any;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(updated));
          } catch {}
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');

          // Allow render in processing page with extension
          setShouldRender(true);
          setIsValidating(false);
          return;
        }

        // For other invalid reasons, redirect to dashboard
        console.log(`🛡️ PROCESSING PAGE: No valid timer for ${targetPlatform}, redirecting to dashboard`);
        finalizeAndNavigate(targetPlatform);
        return;
      }

      // Valid timer found - allow processing page to render
      console.log(`🛡️ PROCESSING PAGE: Valid timer for ${targetPlatform} - ${timer.remainingMs ? Math.ceil(timer.remainingMs / 1000 / 60) : 'unknown'} minutes remaining`);
      setShouldRender(true);
      setIsValidating(false);
    };

    // Add slight delay to prevent flash
    setTimeout(() => { void validate(); }, 100);
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

    const interval = setInterval(async () => {
      const timer = validateTimer();
      
      if (!timer.isValid) {
        // On any expiry, perform R2 check
        const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
        let primaryUsername = username;
        try {
          if (infoRaw) {
            const info = JSON.parse(infoRaw);
            if (info.username) primaryUsername = info.username;
          }
        } catch {}

        const status = await checkRunStatus(targetPlatform, primaryUsername);
        if (status.exists) {
          finalizeAndNavigate(targetPlatform);
          return;
        }

        // Treat ANY interval completion (missing or expired countdown) as a 5-minute extension
        const countdownRaw = localStorage.getItem(`${targetPlatform}_processing_countdown`);
        const currentEnd = countdownRaw ? parseInt(countdownRaw, 10) : NaN;
        const intervalCompleted = !currentEnd || Number.isNaN(currentEnd) || Date.now() >= currentEnd;
        if (intervalCompleted) {
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          try {
            const info = infoRaw ? JSON.parse(infoRaw) : {};
            const updated = {
              ...info,
              endTime: newEnd,
            } as any;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(updated));
          } catch {}
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
          return;
        }

        // If we already extended and this expiry matches the extended window, re-check and extend again (fallback)
        // This block is no longer needed as we always extend 5 minutes
        // if (extendedUntil && Date.now() >= extendedUntil) {
        //   const finalStatus = await checkRunStatus(targetPlatform, primaryUsername);
        //   if (finalStatus.exists) {
        //     finalizeAndNavigate(targetPlatform);
        //     return;
        //   }
        //   const newEnd = Date.now() + 5 * 60 * 1000;
        //   localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
        //   try {
        //     const info = infoRaw ? JSON.parse(infoRaw) : {};
        //     const updated = {
        //       ...info,
        //       endTime: newEnd,
        //     } as any;
        //     localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(updated));
        //   } catch {}
        //   setExtendedUntil(newEnd);
        //   setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
        //   return;
        // }
      }
    }, 1000); // Check every second to sync finish

    return () => clearInterval(interval);
  }, [shouldRender, targetPlatform, navigate, completeProcessing, username]);

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
        // Expose extension state to child for messaging (prop not required in child typings)
        // @ts-ignore
        extensionMessage={extensionMessage}
         // prevent auto-complete inside child; parent orchestrates finalization
         // @ts-ignore
         allowAutoComplete={false}
      />
    </ProcessingErrorBoundary>
  );
};

export default Processing; 