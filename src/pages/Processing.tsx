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
  const finalizeTriggeredRef = useRef(false); // prevent multiple finalize navigations
  const [extensionMessage, setExtensionMessage] = useState<string | null>(null);

  // Get data from navigation state or defaults
  const stateData = location.state as {
    platform?: string;
    username?: string;
    remainingMinutes?: number;
    forcedRedirect?: boolean;
  } | null;

  const targetPlatform = platform || stateData?.platform || 'instagram';
  
    // ✅ BULLETPROOF USERNAME RETRIEVAL: Enhanced username handling with defensive fallbacks
  const username = (() => {
    console.log(`🔍 USERNAME RETRIEVAL: Starting for platform ${targetPlatform}`);
    
    // Priority 1: Navigation state username (most reliable for fresh navigation)
    if (stateData?.username && typeof stateData.username === 'string' && stateData.username.trim()) {
      const navUsername = stateData.username.trim();
      console.log(`🔍 USERNAME SOURCE: Navigation state - "${navUsername}"`);
      return navUsername;
    }
    
    // Priority 2: Processing info username (preserves during extensions)
    try {
      const processingInfo = localStorage.getItem(`${targetPlatform}_processing_info`);
      if (processingInfo) {
        const parsed = JSON.parse(processingInfo);
        if (parsed.username && typeof parsed.username === 'string' && parsed.username.trim()) {
          const storedUsername = parsed.username.trim();
          console.log(`🔍 USERNAME SOURCE: Processing info - "${storedUsername}"`);
          return storedUsername;
        }
      }
    } catch (error) {
      console.error('🔍 USERNAME RETRIEVAL: Error reading processing info:', error);
    }
    
    // Priority 3: Platform-specific localStorage (legacy support)
    try {
      const platformKey = `${targetPlatform}_username`;
      const platformUsername = localStorage.getItem(platformKey);
      if (platformUsername && platformUsername.trim()) {
        const legacyUsername = platformUsername.trim();
        console.log(`🔍 USERNAME SOURCE: Platform storage - "${legacyUsername}"`);
        return legacyUsername;
      }
    } catch (error) {
      console.error('🔍 USERNAME RETRIEVAL: Error reading platform storage:', error);
    }
    
    // ✅ NO FALLBACKS: Don't use 'User' or empty strings - this prevents system disruption
    console.error(`🚨 CRITICAL: No valid username found for platform ${targetPlatform}`);
    console.error(`🚨 DEBUG INFO:`, {
      stateUsername: stateData?.username,
      targetPlatform,
      hasStateData: !!stateData,
      forcedRedirect: stateData?.forcedRedirect
    });
    
    return ''; // Return empty to allow error handling downstream
  })();
  
  const remainingMinutes = stateData?.remainingMinutes;
  const forcedRedirect = stateData?.forcedRedirect || false;

  // ✅ USERNAME NORMALIZATION: Ensure username is properly formatted for API calls (NO FALLBACKS)
  const normalizeUsername = (username: string): string => {
    if (!username || typeof username !== 'string') {
      console.error(`🚨 NORMALIZE: Cannot normalize empty username`);
      return username; // Return as-is to avoid fallbacks
    }
    
    // Remove leading/trailing whitespace
    let normalized = username.trim();
    
    // Remove any special characters that might cause API issues
    normalized = normalized.replace(/[^\w\s-]/g, '');
    
    // Ensure it's not empty after normalization - but don't fallback to 'User'
    if (!normalized) {
      console.error(`🚨 NORMALIZE: Username became empty after normalization: "${username}"`);
      return username; // Return original to preserve user input
    }
    
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
  const finalizeAndNavigate = async (plat: string) => {
    if (finalizeTriggeredRef.current) {
      console.log(`🎯 FINALIZE_AND_NAVIGATE: Skipped duplicate finalization for ${plat}`);
      return;
    }
    finalizeTriggeredRef.current = true;
    console.log(`🎯 FINALIZE_AND_NAVIGATE: Starting finalization for platform ${plat}`);

    // ✅ BULLETPROOF USERNAME PRESERVATION: Get username from most reliable source
    const infoRaw = localStorage.getItem(`${plat}_processing_info`);
    let primaryUsername = username; // Start with prop username
    try {
      if (infoRaw) {
        const info = JSON.parse(infoRaw);
        if (info.username && typeof info.username === 'string' && info.username.trim()) {
          primaryUsername = info.username.trim();
        }
      }
    } catch {}

    // ✅ DEFENSIVE CHECK: Ensure we have a valid username before proceeding
    if (!primaryUsername || primaryUsername.trim() === '') {
      console.error(`🚨 FINALIZE CRITICAL ERROR: No valid username available for ${plat}`);
      finalizeTriggeredRef.current = false;
      return;
    }

    console.log(`🎯 FINALIZE: Checking run status for ${plat}/${primaryUsername} before finalizing`);
    const runStatusCheck = await checkRunStatus(plat, primaryUsername);
    
    // ✅ SIMPLIFIED LOGIC: Only two outcomes - proceed or extend (no other fallbacks)
    if (!runStatusCheck.exists) {
      console.log(`🎯 FINALIZE: Run status not ready for ${plat}/${primaryUsername}, extending 5 minutes`);
      finalizeTriggeredRef.current = false;
      
      // Extend timer by 5 minutes with preserved username
      const newEnd = Date.now() + 5 * 60 * 1000;
      localStorage.setItem(`${plat}_processing_countdown`, newEnd.toString());
      
      try {
        const existingInfo = infoRaw ? JSON.parse(infoRaw) : {};
        const updatedInfo = {
          ...existingInfo,
          platform: plat,
          username: primaryUsername, // ✅ PRESERVE USERNAME
          endTime: newEnd,
          isExtension: true,
          extensionCount: (existingInfo.extensionCount || 0) + 1
        };
        localStorage.setItem(`${plat}_processing_info`, JSON.stringify(updatedInfo));
      } catch {}
      
      setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
      console.log(`🎯 FINALIZE: Extended ${plat} by 5 minutes, preserving username: ${primaryUsername}`);
      return;
    }

    console.log(`🎯 FINALIZE: Run status verified for ${plat}/${primaryUsername}, proceeding with dashboard navigation`);

    // ✅ STREAMLINED BACKEND CLEANUP: Direct path to dashboard
    if (currentUser?.uid) {
      // Clean up backend processing status
      try {
        const resp = await fetch(`/api/processing-status/${currentUser.uid}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: plat })
        });
        console.log(`🎯 FINALIZE: Backend cleanup response: ${resp.status}`);
      } catch (e) {
        console.warn('🎯 FINALIZE: Backend cleanup error (continuing anyway):', e);
      }

      // ✅ BULLETPROOF LOCAL CLEANUP: Always clean up local state
      try {
        console.log(`🎯 FINALIZE: Clearing localStorage for ${plat}`);
        localStorage.removeItem(`${plat}_processing_countdown`);
        localStorage.removeItem(`${plat}_processing_info`);
        localStorage.setItem(`processing_override_${plat}`, Date.now().toString());
        
        // Mark platform as completed
        const completedPlatforms = localStorage.getItem('completedPlatforms');
        const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
        if (!completed.includes(plat)) {
          completed.push(plat);
          localStorage.setItem('completedPlatforms', JSON.stringify(completed));
        }
        
        // Set access flag for cross-device consistency
        const accessKey = `${plat}_accessed_${currentUser.uid}`;
        localStorage.setItem(accessKey, 'true');
        window.dispatchEvent(new StorageEvent('storage', { key: accessKey, newValue: 'true' }));
        
        console.log(`🎯 FINALIZE: Local cleanup completed for ${plat}`);
      } catch (err) {
        console.error(`🎯 FINALIZE: Error during localStorage cleanup:`, err);
      }

      console.log(`🎯 FINALIZE: Calling completeProcessing()`);
      completeProcessing();
      
      const dashboardPath = getDashboardPath(plat);
      console.log(`🎯 FINALIZE: Navigating to dashboard: ${dashboardPath}`);
      
      safeNavigate(navigate, dashboardPath, { replace: true }, 8);
      console.log(`🎯 FINALIZE: Navigation completed for ${plat}`);
    }
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

  // ✅ SIMPLIFIED BACKEND VALIDATION: Streamlined validation with clear outcomes
  const validateWithBackend = async (): Promise<{ isValid: boolean; reason?: string; shouldRedirect?: string }> => {
    if (!currentUser?.uid || !targetPlatform) {
      return { isValid: false, reason: 'no_auth' };
    }

    try {
      console.log(`🔍 BACKEND VALIDATION: Validating processing state for ${targetPlatform}`);
      const response = await fetch(`/api/validate-dashboard-access/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: targetPlatform })
      });

      if (!response.ok) {
        console.warn(`🔍 BACKEND VALIDATION: Request failed with status ${response.status}`);
        return { isValid: true, reason: 'api_error_assume_active' }; // ✅ DEFENSIVE: Assume active on error
      }

      const data = await response.json();
      console.log(`🔍 BACKEND VALIDATION: Server response:`, data);

      if (data.success) {
        if (data.accessAllowed === false && data.reason === 'processing_active') {
          console.log(`🔍 BACKEND VALIDATION: ✅ Processing active (authoritative)`);
          // Sync backend data to local storage
          if (data.processingData) {
            localStorage.setItem(`${targetPlatform}_processing_countdown`, data.processingData.endTime.toString());
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify({
              platform: targetPlatform,
              username: data.processingData.username || username, // ✅ PRESERVE USERNAME
              startTime: data.processingData.startTime,
              endTime: data.processingData.endTime,
              totalDuration: data.processingData.endTime - data.processingData.startTime,
              syncedFromBackend: true
            }));
          }
          return { isValid: true };
        } else if (data.accessAllowed === true) {
          console.log(`🔍 BACKEND VALIDATION: ❌ Processing complete, should redirect to dashboard`);
          return { 
            isValid: false, 
            reason: 'completed_by_backend',
            shouldRedirect: getDashboardPath(targetPlatform)
          };
        }
      }

      console.warn(`🔍 BACKEND VALIDATION: Unexpected response format:`, data);
      return { isValid: true, reason: 'unexpected_response_assume_active' }; // ✅ DEFENSIVE

    } catch (error) {
      console.error(`🔍 BACKEND VALIDATION: Error validating with backend:`, error);
      // ✅ DEFENSIVE: On network errors, ensure local timer exists and assume active
      getOrInitLocalTimer(targetPlatform);
      await ensureBackendProcessingStatus(targetPlatform);
      return { isValid: true, reason: 'network_error_assume_active' };
    }
  };

  // ✅ BULLETPROOF VALIDATION: Simplified validation with clear decision tree
  useEffect(() => {
    if (validationRef.current) return;
    validationRef.current = true;

    const validate = async () => {
      console.log(`🔍 PROCESSING VALIDATION: Starting validation for ${targetPlatform}`);
      
      // Step 1: Check if platform is already completed
      const completedPlatforms = localStorage.getItem('completedPlatforms');
      if (completedPlatforms) {
        const completed = JSON.parse(completedPlatforms);
        if (completed.includes(targetPlatform)) {
          console.log(`🔍 ALREADY COMPLETED: Platform ${targetPlatform} is completed, redirecting to dashboard`);
          finalizeAndNavigate(targetPlatform);
          return;
        }
      }

      // Step 2: Backend validation (authoritative source)
      const backendCheck = await validateWithBackend();
      
      if (!backendCheck.isValid) {
        if (backendCheck.shouldRedirect || backendCheck.reason === 'completed_by_backend') {
          console.log(`🔍 BACKEND SAYS COMPLETE: Finalizing ${targetPlatform}`);
          finalizeAndNavigate(targetPlatform);
          return;
        }
      } else {
        console.log(`🔍 BACKEND CONFIRMED: Processing active for ${targetPlatform} (${backendCheck.reason})`);
      }

      // Step 3: Ensure local timer exists (create if missing)
      getOrInitLocalTimer(targetPlatform);
      await ensureBackendProcessingStatus(targetPlatform);

      // Step 4: Check if timer has expired and handle accordingly
      const timer = validateTimer();
      if (!timer.isValid && timer.reason === 'expired') {
        console.log(`🔍 TIMER EXPIRED: Checking run status for ${targetPlatform}`);
        
        // Get username from most reliable source
        const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
        let primaryUsername = username;
        try {
          if (infoRaw) {
            const info = JSON.parse(infoRaw);
            if (info.username && typeof info.username === 'string' && info.username.trim()) {
              primaryUsername = info.username.trim();
            }
          }
        } catch {}

        const status = await checkRunStatus(targetPlatform, primaryUsername);
        if (status.exists) {
          console.log(`🎉 RUN STATUS READY: Completing ${targetPlatform} immediately`);
          finalizeAndNavigate(targetPlatform);
          return;
        } else {
          console.log(`⏳ RUN STATUS NOT READY: Extending ${targetPlatform} by 5 minutes`);
          // Extend timer and continue processing
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          
          try {
            const existingInfo = infoRaw ? JSON.parse(infoRaw) : {};
            const updatedInfo = {
              ...existingInfo,
              platform: targetPlatform,
              username: primaryUsername, // ✅ PRESERVE USERNAME
              endTime: newEnd,
              isExtension: true,
              extensionCount: (existingInfo.extensionCount || 0) + 1
            };
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(updatedInfo));
          } catch {}
          
          await ensureBackendProcessingStatus(targetPlatform);
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
        }
      }

      // ✅ RENDER PROCESSING PAGE: All validations passed, show processing page
      setShouldRender(true);
      setIsValidating(false);
    };

    setTimeout(() => { void validate(); }, 100);
  }, [targetPlatform, navigate, completeProcessing]);

  // Helper function to get dashboard path
  const getDashboardPath = (platform: string): string => {
    let path: string;
    switch (platform) {
      case 'instagram': 
        path = '/dashboard';
        break;
      case 'twitter': 
        path = '/twitter-dashboard';
        break;
      case 'facebook': 
        path = '/facebook-dashboard';
        break;
      case 'linkedin': 
        path = '/linkedin-dashboard';
        break;
      default: 
        path = '/dashboard';
        console.warn(`🎯 DASHBOARD PATH: Unknown platform '${platform}', defaulting to /dashboard`);
        break;
    }
    
    console.log(`🎯 DASHBOARD PATH: Platform '${platform}' maps to '${path}'`);
    return path;
  };

  // ✅ STREAMLINED TIMER MONITORING: Simplified interval logic with clear outcomes
  useEffect(() => {
    if (!shouldRender) return;

    const interval = setInterval(async () => {
      if (finalizeTriggeredRef.current) return; // Already finalizing
      
      console.log(`🔥 TIMER CHECK: Validating timer for ${targetPlatform}`);
      const timer = validateTimer();

      // If timer is invalid (expired or missing), check run status
      if (!timer.isValid) {
        console.log(`🔥 TIMER EXPIRED: Timer invalid for ${targetPlatform}, checking run status`);
        
        // Get username from most reliable source
        const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
        let primaryUsername = username;
        try {
          if (infoRaw) {
            const info = JSON.parse(infoRaw);
            if (info.username && typeof info.username === 'string' && info.username.trim()) {
              primaryUsername = info.username.trim();
            }
          }
        } catch {}

        // ✅ DEFENSIVE CHECK: Ensure we have a valid username
        if (!primaryUsername || primaryUsername.trim() === '') {
          console.error(`🚨 TIMER CHECK ERROR: No valid username for ${targetPlatform}`);
          return;
        }

        console.log(`🔍 CHECKING RUN STATUS: ${targetPlatform}/${primaryUsername}`);
        const status = await checkRunStatus(targetPlatform, primaryUsername);
        console.log(`🔍 RUN STATUS RESULT: exists=${status.exists}, status=${status.status}`);
        
        if (status.exists) {
          // ✅ RUN STATUS READY: Complete processing immediately
          console.log(`🎉 COMPLETION TRIGGERED: Run status ready for ${targetPlatform}/${primaryUsername}`);
          clearInterval(interval);
          finalizeAndNavigate(targetPlatform);
          return;
        } else {
          // ✅ RUN STATUS NOT READY: Extend timer by 5 minutes
          console.log(`⏳ EXTENDING TIMER: Run status not ready for ${targetPlatform}/${primaryUsername}`);
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          
          try {
            const existingInfo = infoRaw ? JSON.parse(infoRaw) : {};
            const updatedInfo = {
              ...existingInfo,
              platform: targetPlatform,
              username: primaryUsername, // ✅ PRESERVE USERNAME
              endTime: newEnd,
              isExtension: true,
              extensionCount: (existingInfo.extensionCount || 0) + 1
            };
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(updatedInfo));
            console.log(`⏳ TIMER EXTENDED: New end time set for ${targetPlatform}`);
          } catch (extErr) {
            console.error(`⏳ EXTENSION ERROR: Failed to update info for ${targetPlatform}:`, extErr);
          }
          
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
        }
      } else {
        console.log(`🔥 TIMER VALID: Timer still active for ${targetPlatform}`);
      }
    }, 10000); // Check every 10 seconds

    console.log(`🔥 TIMER MONITORING: Started for ${targetPlatform}`);
    return () => {
      console.log(`🔥 TIMER MONITORING: Stopped for ${targetPlatform}`);
      clearInterval(interval);
    };
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
    console.log(`🎯 PROCESSING COMPLETION: Delegating to finalizeAndNavigate for ${targetPlatform}`);
    // Delegate to centralized, backend-authoritative finalization flow
    finalizeAndNavigate(targetPlatform);
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
      
      // ✅ CRITICAL: Clear platform access status so user sees entry form again
      const accessedKey = `${targetPlatform}_accessed_${currentUser.uid}`;
      localStorage.removeItem(accessedKey);
      console.log(`🔥 EXIT: Cleared platform access status: ${accessedKey}`);
      
      // Clear any platform-specific username/account data
      const allKeys = Object.keys(localStorage);
      const platformLower = targetPlatform.toLowerCase();
      const usernameLower = username ? username.toLowerCase() : '';
      
      allKeys.forEach(key => {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(platformLower) || (usernameLower && keyLower.includes(usernameLower))) {
          if (key.includes('processing') || key.includes('username') || key.includes('account') || key.includes('accessed')) {
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
      
      // ✅ CRITICAL: Also clear claimed status globally on backend
      try {
        await fetch(`/api/platform-access/${currentUser?.uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: targetPlatform, claimed: false })
        });
        console.log(`🛡️ PROCESSING PAGE: Cleared claimed status for ${targetPlatform} on backend`);
      } catch (error) {
        console.warn(`🛡️ PROCESSING PAGE: Failed to clear claimed status for ${targetPlatform} on backend:`, error);
      }

      // ✅ CRITICAL: Fire custom event to notify MainDashboard of platform reset
      window.dispatchEvent(new CustomEvent('platformReset', {
        detail: {
          platform: targetPlatform,
          reason: 'setup_exited',
          timestamp: Date.now()
        }
      }));
      
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

// ✅ BULLETPROOF LOCAL TIMER INITIALIZATION: Enhanced username preservation
const getOrInitLocalTimer = (plat: string) => {
  const countdownKey = `${plat}_processing_countdown`;
  const infoKey = `${plat}_processing_info`;
  const now = Date.now();
  let endTimeRaw = localStorage.getItem(countdownKey);
  let infoRaw = localStorage.getItem(infoKey);
  let endTime = endTimeRaw ? parseInt(endTimeRaw, 10) : NaN;
  
  // Initialize new timer if missing or expired
  if (!endTime || Number.isNaN(endTime) || endTime < now) {
    endTime = now + 15 * 60 * 1000; // 15 minutes
    localStorage.setItem(countdownKey, endTime.toString());
    console.log(`🛠 TIMER INIT: New timer created for ${plat}, ends at ${new Date(endTime).toLocaleTimeString()}`);
  }
  
  // ✅ ENHANCED INFO HANDLING: Preserve existing username or use prop username
  if (!infoRaw) {
    const info = {
      platform: plat,
      username: username || '', // ✅ USE PROP USERNAME WHEN CREATING NEW
      startTime: now,
      endTime,
      totalDuration: endTime - now,
      initializedAt: now,
      source: 'processing_page_init'
    };
    localStorage.setItem(infoKey, JSON.stringify(info));
    console.log(`🛠 INFO INIT: New processing info created for ${plat} with username: ${username}`);
  } else {
    try {
      const parsed = JSON.parse(infoRaw);
      // ✅ PRESERVE EXISTING USERNAME: Don't overwrite existing username
      const preservedUsername = parsed.username || username || '';
      const updatedInfo = {
        ...parsed,
        platform: plat,
        username: preservedUsername, // ✅ PRESERVE USERNAME
        endTime,
        updatedAt: now
      };
      localStorage.setItem(infoKey, JSON.stringify(updatedInfo));
      console.log(`🛠 INFO UPDATE: Processing info updated for ${plat}, preserved username: ${preservedUsername}`);
    } catch {
      // If parsing fails, create new info
      const info = {
        platform: plat,
        username: username || '',
        startTime: now,
        endTime,
        totalDuration: endTime - now,
        initializedAt: now,
        source: 'processing_page_recovery'
      };
      localStorage.setItem(infoKey, JSON.stringify(info));
      console.log(`🛠 INFO RECOVERY: Processing info recovered for ${plat} with username: ${username}`);
    }
  }
  
  return { endTime };
};

// ✅ ENHANCED BACKEND SYNC: Improved backend status synchronization
const ensureBackendProcessingStatus = async (plat: string) => {
  if (!currentUser?.uid) return;
  
  try {
    const countdown = localStorage.getItem(`${plat}_processing_countdown`);
    const infoRaw = localStorage.getItem(`${plat}_processing_info`);
    if (!countdown || !infoRaw) return;
    
    const endTime = parseInt(countdown, 10);
    if (!endTime || Date.now() >= endTime) return; // Don't sync expired timers
    
    const info = JSON.parse(infoRaw);
    const syncUsername = info.username || username || ''; // ✅ PRESERVE USERNAME
    
    const payload = {
      platform: plat,
      username: syncUsername,
      startTime: info.startTime || Date.now(),
      endTime,
      totalDuration: (typeof info.totalDuration === 'number' && info.totalDuration > 0)
        ? info.totalDuration
        : (endTime - (info.startTime || Date.now()))
    };
    
    await fetch(`/api/processing-status/${currentUser.uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log(`🛠 BACKEND SYNC: Synced processing status for ${plat} with username: ${syncUsername}`);
  } catch (e) {
    console.warn('🛠 BACKEND SYNC: Failed to sync backend status', e);
  }
};

  // ✅ BACKGROUND VALIDATION: Show content immediately while validating in background
  if (isValidating || !shouldRender) {
    return (
      <div className="processing-page">
        {/* Show minimal loading indicator instead of blocking screen */}
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          zIndex: 9999,
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{ 
            width: '16px', 
            height: '16px', 
            border: '2px solid transparent',
            borderTop: '2px solid #fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span>Validating timer...</span>
        </div>
        
        {/* Show the actual processing content while validating */}
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
        
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
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