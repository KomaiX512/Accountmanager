import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';
import ProcessingErrorBoundary from '../components/common/ProcessingErrorBoundary';
import { useProcessing } from '../context/ProcessingContext';
import { useAuth } from '../context/AuthContext';
import { safeNavigate, safeHistoryManipulation } from '../utils/navigationGuard';
import axios from 'axios';
import { API_CONFIG, getApiUrl } from '../config/api';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: string }>();
  const location = useLocation();
  const { completeProcessing } = useProcessing();
  const { currentUser } = useAuth();
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
  
  // Get username from state or localStorage (STRICT: never fall back to any other username source)
  const username = (() => {
    // Strong source of truth order: stateData.username -> processing_info.username -> fallback 'User'
    if (stateData?.username && typeof stateData.username === 'string' && stateData.username.trim()) {
      return stateData.username.trim();
    }
    try {
      const processingInfo = localStorage.getItem(`${targetPlatform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        if (info && typeof info.username === 'string' && info.username.trim()) {
          return info.username.trim();
        }
      }
    } catch (error) {
      console.error('Error reading username from localStorage:', error);
    }
    return 'User';
  })();
  
  const remainingMinutes = stateData?.remainingMinutes;
  const forcedRedirect = stateData?.forcedRedirect || false;

  // ✅ USERNAME NORMALIZATION: Ensure username is properly formatted for API calls
  const normalizeUsername = (username: string): string => {
    if (!username || typeof username !== 'string') return 'User';
    
    // Remove leading/trailing whitespace
    let normalized = username.trim();
    
    // Remove any special characters that might cause API issues
    normalized = normalized.replace(/[^\w\s-]/g, '');
    
    // Ensure it's not empty after normalization
    if (!normalized) return 'User';
    
    console.log(`🔧 USERNAME NORMALIZATION: "${username}" -> "${normalized}"`);
    return normalized;
  };

  // ✅ API HEALTH CHECK: Verify if the server endpoint is working
  const checkApiHealth = async (): Promise<boolean> => {
    try {
      const healthUrl = getApiUrl('/api/health');
      console.log(`🏥 API HEALTH CHECK: Testing endpoint ${healthUrl}`);
      const response = await axios.get(healthUrl, { timeout: 5000 });
      console.log(`🏥 API HEALTH CHECK: Status ${response.status}`);
      return response.status === 200;
    } catch (error) {
      console.warn(`🏥 API HEALTH CHECK: Failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  // Helper: check R2 run status existence for platform/username
  const checkRunStatus = async (platformId: string, primaryUsername: string): Promise<{ exists: boolean; status?: string | null }> => {
    // Add cache-buster to avoid any stale 404 caching at the proxy/browser layer
    const cacheBuster = `?cb=${Date.now()}`;
    
    try {
      // ✅ API HEALTH CHECK: Verify server is working before main request
      const isApiHealthy = await checkApiHealth();
      if (!isApiHealthy) {
        console.warn(`🔍 RUNSTATUS: API health check failed, proceeding with main request anyway`);
      }
      
      // ✅ NORMALIZE USERNAME: Ensure username is properly formatted for API
      const normalizedUsername = normalizeUsername(primaryUsername);
      
      const url = getApiUrl(`${API_CONFIG.ENDPOINTS.RUN_STATUS}/${platformId}/${encodeURIComponent(normalizedUsername)}${cacheBuster}`);
      
      // ✅ ENHANCED DEBUGGING: Log all details to diagnose username mismatch
      console.log(`🔍 RUNSTATUS DEBUG INFO:`);
      console.log(`  - Platform: ${platformId}`);
      console.log(`  - Username (raw): "${primaryUsername}"`);
      console.log(`  - Username (normalized): "${normalizedUsername}"`);
      console.log(`  - Username (length): ${normalizedUsername.length}`);
      console.log(`  - Username (encoded): ${encodeURIComponent(normalizedUsername)}`);
      console.log(`  - Full URL: ${url}`);
      console.log(`  - Expected R2 path: RunStatus/${platformId}/${normalizedUsername}/status.json`);
      console.log(`  - API Health: ${isApiHealthy ? 'OK' : 'FAILED'}`);
      
      const res = await axios.get(url, { timeout: 10000 });
      console.log(`🔍 RUNSTATUS RESPONSE:`, res.status, res.data);
      
      // Enhanced response validation
      if (res.status === 200 && res.data) {
        const exists = !!res.data.exists;
        const status = res.data.status || null;
        console.log(`🔍 RUNSTATUS PARSED: exists=${exists}, status=${status}`);
        return { exists, status };
      } else {
        console.warn(`🔍 RUNSTATUS UNEXPECTED: status=${res.status}, data=`, res.data);
        return { exists: false };
      }
    } catch (e: any) {
      console.error(`🔍 RUNSTATUS ERROR:`, e.message, e.response?.status, e.response?.data);
      
      // ✅ ENHANCED ERROR DEBUGGING: Log more details about the error
      if (e.response) {
        console.error(`  - Response status: ${e.response.status}`);
        console.error(`  - Response data:`, e.response.data);
        console.error(`  - Response headers:`, e.response.headers);
        console.error(`  - Response URL: ${e.response.config?.url}`);
        console.error(`  - Request method: ${e.response.config?.method}`);
      } else if (e.request) {
        console.error(`  - Request was made but no response received`);
        console.error(`  - Request URL: ${e.request.url}`);
        console.error(`  - Request method: ${e.request.method}`);
      } else {
        console.error(`  - Error setting up request:`, e.message);
      }
      
      // ✅ FALLBACK: Try alternative username formats if the first attempt fails
      if (e.response?.status === 404) {
        console.log(`🔄 RUNSTATUS FALLBACK: 404 error, trying alternative username formats...`);
        
        // Try lowercase version
        const lowerUsername = primaryUsername.toLowerCase();
        if (lowerUsername !== primaryUsername) {
          try {
            const fallbackUrl = getApiUrl(`${API_CONFIG.ENDPOINTS.RUN_STATUS}/${platformId}/${encodeURIComponent(lowerUsername)}${cacheBuster}`);
            console.log(`🔄 FALLBACK ATTEMPT 1: Trying lowercase username "${lowerUsername}"`);
            const fallbackRes = await axios.get(fallbackUrl, { timeout: 5000 });
            if (fallbackRes.status === 200 && fallbackRes.data) {
              console.log(`✅ FALLBACK SUCCESS: Found with lowercase username "${lowerUsername}"`);
              return { exists: !!fallbackRes.data.exists, status: fallbackRes.data.status || null };
            }
          } catch (fallbackError: any) {
            console.log(`🔄 FALLBACK ATTEMPT 1 failed:`, fallbackError.message);
          }
        }
        
        // Try removing any extra spaces or special characters
        const cleanUsername = primaryUsername.replace(/\s+/g, '').replace(/[^\w-]/g, '');
        if (cleanUsername !== primaryUsername && cleanUsername.length > 0) {
          try {
            const fallbackUrl = getApiUrl(`${API_CONFIG.ENDPOINTS.RUN_STATUS}/${platformId}/${encodeURIComponent(cleanUsername)}${cacheBuster}`);
            console.log(`🔄 FALLBACK ATTEMPT 2: Trying cleaned username "${cleanUsername}"`);
            const fallbackRes = await axios.get(fallbackUrl, { timeout: 5000 });
            if (fallbackRes.status === 200 && fallbackRes.data) {
              console.log(`✅ FALLBACK SUCCESS: Found with cleaned username "${cleanUsername}"`);
              return { exists: !!fallbackRes.data.exists, status: fallbackRes.data.status || null };
            }
          } catch (fallbackError: any) {
            console.log(`🔄 FALLBACK ATTEMPT 2 failed:`, fallbackError.message);
          }
        }
        
        console.log(`🔄 FALLBACK EXHAUSTED: All username variations failed`);
      }
      
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
              if (info.username && typeof info.username === 'string' && info.username.trim()) {
                primaryUsername = info.username.trim();
                // ✅ DEBUGGING: Log username source for run status check
                console.log(`🔍 USERNAME SOURCE DEBUG:`);
                console.log(`  - Initial username: "${username}"`);
                console.log(`  - localStorage username: "${info.username}"`);
                console.log(`  - Final primaryUsername: "${primaryUsername}"`);
                console.log(`  - Username match: ${username === primaryUsername ? 'YES' : 'NO'}`);
              }
            }
          } catch {}

          const status = await checkRunStatus(targetPlatform, primaryUsername);
          console.log(`🔍 INITIAL RUNSTATUS CHECK: ${targetPlatform}/${primaryUsername} - exists: ${status.exists}, status: ${status.status}`);
          if (status.exists) {
            // If file exists (completed or failed), allow dashboard immediately
            console.log(`✅ INITIAL RUNSTATUS FOUND: Navigating to dashboard for ${targetPlatform}`);
            finalizeAndNavigate(targetPlatform);
            return;
          }

          // No status file yet → grant +5 minutes grace and show message
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          // keep original info; update endTime & ensure mandatory fields exist
          try {
            const info = infoRaw ? JSON.parse(infoRaw) : {};
            const safeInfo = {
              // Always preserve/ensure required fields
              platform: targetPlatform,
              username: normalizeUsername(primaryUsername || username),
              // Preserve previous startTime if present; otherwise, approximate to maintain continuity
              startTime: info.startTime || Date.now(),
              // Preserve totalDuration if present (represents initial 15/20 minutes)
              totalDuration: info.totalDuration || undefined,
              // Flags
              isExtension: true,
              // Updated endTime
              endTime: newEnd,
            } as any;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(safeInfo));
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
            if (info.username && typeof info.username === 'string' && info.username.trim()) {
              primaryUsername = info.username.trim();
              // ✅ DEBUGGING: Log username source for run status check
              console.log(`🔍 USERNAME SOURCE DEBUG (INTERVAL):`);
              console.log(`  - Initial username: "${username}"`);
              console.log(`  - localStorage username: "${info.username}"`);
              console.log(`  - Final primaryUsername: "${primaryUsername}"`);
              console.log(`  - Username match: ${username === primaryUsername ? 'YES' : 'NO'}`);
            }
          }
        } catch {}

        const status = await checkRunStatus(targetPlatform, primaryUsername);
        console.log(`🔍 RUNSTATUS CHECK: ${targetPlatform}/${primaryUsername} - exists: ${status.exists}, status: ${status.status}`);
        if (status.exists) {
          // 🚨 CRITICAL FIX: Clear interval and navigate immediately
          console.log(`✅ RUNSTATUS FOUND: Navigating to dashboard for ${targetPlatform}`);
          clearInterval(interval);
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
            const safeInfo = {
              platform: targetPlatform,
              username: normalizeUsername(primaryUsername || username),
              startTime: info.startTime || Date.now(),
              totalDuration: info.totalDuration || undefined,
              isExtension: true,
              endTime: newEnd,
            } as any;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(safeInfo));
          } catch {}
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
          return;
        }
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

  // Handle exit from loading state
  const handleExitLoading = async () => {
    if (!currentUser?.uid) {
      console.error('🛡️ PROCESSING PAGE: No authenticated user found for exit');
      return;
    }

    console.log(`🛡️ PROCESSING PAGE: User exited loading state for ${targetPlatform} (user: ${currentUser?.uid})`);
    
    try {
      // Step 1: Clear all processing-related localStorage data
      console.log(`🛡️ PROCESSING PAGE: Clearing frontend caches for ${targetPlatform}`);
      
      const keysToRemove = [
        `${targetPlatform}_processing_countdown`,
        `${targetPlatform}_processing_info`,
        'completedPlatforms',
        'processingState'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear any platform-specific username/account data
      const allKeys = Object.keys(localStorage);
      const platformLower = targetPlatform.toLowerCase();
      const usernameLower = username.toLowerCase();
      
      allKeys.forEach(key => {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(platformLower) || keyLower.includes(usernameLower)) {
          if (key.includes('processing') || key.includes('username') || key.includes('account')) {
            localStorage.removeItem(key);
            console.log(`🔥 EXIT: Cleared localStorage key: ${key}`);
          }
        }
      });

      // Step 2: Call backend reset API (same as reset button)
      console.log(`🛡️ PROCESSING PAGE: Calling backend reset API for ${targetPlatform}`);
      const response = await fetch(`/api/platform-reset/${currentUser?.uid}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform: targetPlatform })
      });

      if (!response.ok) {
        console.warn(`🛡️ PROCESSING PAGE: Backend reset failed: ${response.statusText}, but continuing with frontend reset`);
      } else {
        const result = await response.json();
        console.log(`🛡️ PROCESSING PAGE: Backend reset successful:`, result);
      }

      // Step 3: Reset processing context
      completeProcessing();
      
      // Step 4: Navigate to main dashboard with reset state
      console.log(`🛡️ PROCESSING PAGE: Navigating to main dashboard after exit`);
      safeNavigate(navigate, '/account', { 
        replace: true,
        state: { 
          resetPlatform: targetPlatform,
          resetTimestamp: Date.now(),
          exitReason: 'setup_exited'
        }
      }, 8);
      
    } catch (error) {
      console.error('🛡️ PROCESSING PAGE: Error during exit cleanup:', error);
      
      // Fallback: still clear frontend and navigate
      completeProcessing();
      safeNavigate(navigate, '/account', { replace: true }, 8);
    }
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
        onExit={handleExitLoading}
      />
    </ProcessingErrorBoundary>
  );
};

export default Processing; 