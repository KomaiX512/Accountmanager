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
  
  // Get username from state or localStorage (NO FALLBACKS TO 'User')
  const username = (() => {
    // 🔒 BULLETPROOF USERNAME LOCKING: Check for locked username first
    try {
      const processingInfo = localStorage.getItem(`${targetPlatform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        if (info && typeof info.username === 'string' && info.username.trim()) {
          // 🔒 CRITICAL: If username is locked, use it exclusively
          if (info.usernameLocked === true) {
            console.log(`🔒 LOCKED USERNAME DETECTED: Using locked username '${info.username}' for ${targetPlatform}`);
            return info.username.trim();
          }
          console.log(`📝 UNLOCKED USERNAME: Using unlocked username '${info.username}' for ${targetPlatform}`);
          return info.username.trim();
        }
      }
    } catch (error) {
      console.error('Error reading processing info from localStorage:', error);
    }
    
    // Strong source of truth order: stateData.username -> processing_info.username -> NO FALLBACK
    if (stateData?.username && typeof stateData.username === 'string' && stateData.username.trim()) {
      const trimmedUsername = stateData.username.trim();
      console.log(`🔑 STATE USERNAME: Using username from navigation state '${trimmedUsername}' for ${targetPlatform}`);
      return trimmedUsername;
    }
    
    // ❌ REMOVED: No fallback to 'User' - this causes system disruption
    console.error(`🚨 CRITICAL: No username available for platform ${targetPlatform}. This should never happen.`);
    return ''; // Return empty to avoid system disruption
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

    // ✅ CRITICAL FIX: Always verify run status exists before finalizing
    const infoRaw = localStorage.getItem(`${plat}_processing_info`);
    let primaryUsername = username;
    try {
      if (infoRaw) {
        const info = JSON.parse(infoRaw);
        if (info.username && typeof info.username === 'string' && info.username.trim()) {
          primaryUsername = info.username.trim();
        }
      }
    } catch {}

    console.log(`🎯 FINALIZE: Checking run status for ${plat}/${primaryUsername} before finalizing`);
    const runStatusCheck = await checkRunStatus(plat, primaryUsername);
    
    if (!runStatusCheck.exists) {
      console.log(`🎯 FINALIZE BLOCKED: Run status data does not exist for ${plat}/${primaryUsername}, extending 5 minutes instead`);
      finalizeTriggeredRef.current = false;
      
      // Extend timer by 5 minutes and continue processing
      const newEnd = Date.now() + 5 * 60 * 1000;
      localStorage.setItem(`${plat}_processing_countdown`, newEnd.toString());
      
      try {
        const info = infoRaw ? JSON.parse(infoRaw) : {};
        info.endTime = newEnd;
        info.isExtension = true;
        localStorage.setItem(`${plat}_processing_info`, JSON.stringify(info));
      } catch {}
      
      setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
      console.log(`🎯 FINALIZE: Extended ${plat} by 5 minutes due to missing run status data`);
      return;
    }

    console.log(`🎯 FINALIZE: Run status verified for ${plat}/${primaryUsername}, proceeding with finalization`);

    // Backend authority: Recheck before any cleanup; if backend still active, abort finalization
    if (currentUser?.uid) {
      try {
        const statusResp = await fetch(`/api/processing-status/${currentUser.uid}?platform=${plat}`);
        if (statusResp.ok) {
          const json = await statusResp.json();
          const data = json?.data;
          const nowTs = Date.now();
          if (data && typeof data.endTime === 'number' && nowTs < data.endTime) {
            console.log(`🎯 FINALIZE ABORTED: Backend indicates active processing for ${plat}, returning to processing page`);
            finalizeTriggeredRef.current = false;
            safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
            return;
          }
        }
      } catch (e) {
        console.warn('🎯 FINALIZE: Backend recheck error, aborting finalization to avoid cross-device races', e);
        finalizeTriggeredRef.current = false;
        safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
        return;
      }
    }

    // Proceed with backend cleanup now that backend confirmed inactive
    if (currentUser?.uid) {
      let deleteOk = false;
      try {
        const resp = await fetch(`/api/processing-status/${currentUser.uid}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: plat })
        });
        // Treat 2xx as success; 404 means nothing to delete -> acceptable
        deleteOk = resp.ok || resp.status === 404;
        if (!deleteOk) {
          console.warn(`🎯 FINALIZE: Backend delete not successful (status=${resp.status}). Aborting finalization.`);
        }
      } catch (e) {
        console.warn('🎯 FINALIZE: Backend delete error. Aborting finalization to avoid bypass.', e);
        deleteOk = false;
      }

      if (!deleteOk) {
        // Reset guard and return user to processing route
        finalizeTriggeredRef.current = false;
        safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
        return;
      }

      // Only after successful delete (or 404 already gone) set override and perform local cleanup
      try { localStorage.setItem(`processing_override_${plat}`, Date.now().toString()); } catch {}

      try {
        console.log(`🎯 FINALIZE: Clearing localStorage for ${plat}`);
        // Clear local copies; backend remains authoritative for other devices
        localStorage.removeItem(`${plat}_processing_countdown`);
        localStorage.removeItem(`${plat}_processing_info`);
        
        console.log(`🎯 FINALIZE: Updating completed platforms`);
        const completedPlatforms = localStorage.getItem('completedPlatforms');
        const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
        if (!completed.includes(plat)) {
          completed.push(plat);
          localStorage.setItem('completedPlatforms', JSON.stringify(completed));
          console.log(`🎯 FINALIZE: Added ${plat} to completed platforms: [${completed.join(', ')}]`);
        } else {
          console.log(`🎯 FINALIZE: ${plat} was already in completed platforms: [${completed.join(', ')}]`);
        }
      } catch (err) {
        console.error(`🎯 FINALIZE: Error during localStorage cleanup:`, err);
      }
      
      // ✅ Ensure local access flag is set immediately for cross-device consistency
      if (currentUser?.uid) {
        try {
          const accessKey = `${plat}_accessed_${currentUser.uid}`;
          localStorage.setItem(accessKey, 'true');
          // Fire storage event manually for same-tab listeners
          window.dispatchEvent(new StorageEvent('storage', { key: accessKey, newValue: 'true' }));
        } catch (err) {
          console.warn('🎯 FINALIZE: Failed to set access flag', err);
        }
      }

      console.log(`🎯 FINALIZE: Calling completeProcessing()`);
      completeProcessing();
      
      const dashboardPath = getDashboardPath(plat);
      console.log(`🎯 FINALIZE: Navigating to dashboard path: ${dashboardPath}`);
      
      safeNavigate(navigate, dashboardPath, { replace: true }, 8);
      console.log(`🎯 FINALIZE: Navigation initiated for ${plat} -> ${dashboardPath}`);
      return;
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

  // ✅ BACKEND VALIDATION: Ensure processing state is valid from server perspective
  const validateWithBackend = async (): Promise<{ isValid: boolean; reason?: string; shouldRedirect?: string }> => {
    if (!currentUser?.uid || !targetPlatform) {
      return { isValid: false, reason: 'no_auth' };
    }

    try {
      console.log(`🔍 BACKEND VALIDATION: Validating processing state for ${targetPlatform} with backend`);
      const response = await fetch(`/api/validate-dashboard-access/${currentUser.uid}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platform: targetPlatform
        })
      });

      if (!response.ok) {
        console.warn(`🔍 BACKEND VALIDATION: Request failed with status ${response.status}`);
        return { isValid: false, reason: 'api_error' };
      }

      const data = await response.json();
      console.log(`🔍 BACKEND VALIDATION: Server response:`, data);

      if (data.success) {
        if (data.accessAllowed === false && data.reason === 'processing_active') {
          // Backend confirms processing is active
          console.log(`🔍 BACKEND VALIDATION: ✅ Active (authoritative)`);
          if (data.processingData) {
            localStorage.setItem(`${targetPlatform}_processing_countdown`, data.processingData.endTime.toString());
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify({
              platform: targetPlatform,
              username: data.processingData.username || '',
              startTime: data.processingData.startTime,
              endTime: data.processingData.endTime,
              totalDuration: data.processingData.endTime - data.processingData.startTime,
              syncedFromBackend: true
            }));
          }
          return { isValid: true };
        } else if (data.accessAllowed === true) {
          // Backend believes no processing active. Double-check local timer; if active (> now) we must REPAIR.
          const localCountdownRaw = localStorage.getItem(`${targetPlatform}_processing_countdown`);
          const localInfoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
          const now = Date.now();
          if (localCountdownRaw && localInfoRaw) {
            const localEnd = parseInt(localCountdownRaw, 10);
            if (localEnd && localEnd > now) {
              console.log('⚠️ BACKEND DESYNC: Local timer active but backend says complete. Repairing backend status.');
              await ensureBackendProcessingStatus(targetPlatform);
              return { isValid: true, reason: 'repaired_backend' };
            }
          }
          console.log(`🔍 BACKEND VALIDATION: ❌ Complete (no active processing)`);
          return { 
            isValid: false, 
            reason: 'completed_by_backend',
            shouldRedirect: getDashboardPath(targetPlatform)
          };
        }
      }

      console.warn(`🔍 BACKEND VALIDATION: Unexpected response format:`, data);
      return { isValid: false, reason: 'unexpected_response' };

    } catch (error) {
      console.error(`🔍 BACKEND VALIDATION: Error validating with backend:`, error);
      // On network errors, ensure at least local timer exists
      getOrInitLocalTimer(targetPlatform);
      await ensureBackendProcessingStatus(targetPlatform);
      return { isValid: true, reason: 'network_assumed_active' }; // assume active to avoid skipping
    }
  };

  // BULLETPROOF processing page protection
  useEffect(() => {
    if (validationRef.current) return;
    validationRef.current = true;

    const validate = async () => {
      // Step 1: Backend validation first (source of truth)
      console.log(`🔍 PROCESSING VALIDATION: Starting backend validation for ${targetPlatform}`);
      const backendCheck = await validateWithBackend();

      if (!backendCheck.isValid) {
        if (backendCheck.shouldRedirect || backendCheck.reason === 'completed_by_backend') {
          console.log(`🔍 BACKEND COMPLETION: Using finalizeAndNavigate for ${targetPlatform}`);
          finalizeAndNavigate(targetPlatform);
          return;
        }
        console.warn(`🔍 BACKEND FALLBACK: Backend validation failed (${backendCheck.reason}), checking local state`);
      } else {
        console.log(`🔍 BACKEND CONFIRMED: Processing state valid according to backend (${backendCheck.reason || 'authoritative'})`);
      }

      // Ensure local timer exists (repair if missing)
      getOrInitLocalTimer(targetPlatform);

      // Step 2: Local timer validation (fallback or confirmation)
      const timer = validateTimer();
      if (!timer.isValid) {
        if (timer.reason === 'no_data') {
          // Force creation again for robustness
            getOrInitLocalTimer(targetPlatform);
            await ensureBackendProcessingStatus(targetPlatform);
            setShouldRender(true);
            setIsValidating(false);
            return;
        }
        if (timer.reason === 'expired') {
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
            finalizeAndNavigate(targetPlatform);
            return;
          }
          // If still not exists, extend 5 minutes but DO NOT finalize
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          try {
            const info = infoRaw ? JSON.parse(infoRaw) : {};
            info.endTime = newEnd;
            info.isExtension = true;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(info));
          } catch {}
          await ensureBackendProcessingStatus(targetPlatform);
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
          setShouldRender(true);
          setIsValidating(false);
          return;
        }
        finalizeAndNavigate(targetPlatform);
        return;
      }

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

  // ANTI-REFRESH protection - continuously validate timer
  useEffect(() => {
    if (!shouldRender) return;

    let backendRecheckInFlight = false;
    const interval = setInterval(async () => {
      if (finalizeTriggeredRef.current) return; // already finalizing
      console.log(`🔥 TIMER_INTERVAL: Checking timer validity for ${targetPlatform}`);
      const timer = validateTimer();

      if (!timer.isValid) {
        console.log(`🔥 TIMER_INVALID: Timer invalid for ${targetPlatform}, reason: ${timer.reason}`);
        if (!backendRecheckInFlight) {
          backendRecheckInFlight = true;
          const backendCheck = await validateWithBackend();
          backendRecheckInFlight = false;
          if (!backendCheck.isValid && (backendCheck.shouldRedirect || backendCheck.reason === 'completed_by_backend')) {
            console.log(`🔥 BACKEND RECHECK COMPLETION: Finalizing for ${targetPlatform}`);
            clearInterval(interval);
            finalizeAndNavigate(targetPlatform);
            return;
          }
          if (backendCheck.isValid) {
            // backend repaired; ensure local timer present
            getOrInitLocalTimer(targetPlatform);
          }
        }

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

        console.log(`🔍 STARTING RUNSTATUS CHECK: ${targetPlatform}/${primaryUsername}`);
        const status = await checkRunStatus(targetPlatform, primaryUsername);
        console.log(`🔍 RUNSTATUS CHECK RESULT: ${targetPlatform}/${primaryUsername} - exists: ${status.exists}, status: ${status.status}`);
        
        if (status.exists) {
          // 🚨 CRITICAL FIX: Clear interval and navigate immediately
          console.log(`🎉 RUNSTATUS SUCCESS: Data found for ${targetPlatform}/${primaryUsername}, completing processing!`);
          console.log(`🎉 RUNSTATUS COMPLETION: About to clear interval and call finalizeAndNavigate`);
          clearInterval(interval);
          finalizeAndNavigate(targetPlatform);
          return;
        } else {
          console.log(`⏳ RUNSTATUS NOT_FOUND: Data not ready yet for ${targetPlatform}/${primaryUsername}, extending timer`);
        }

        // Treat ANY interval completion (missing or expired countdown) as a 5-minute extension
        const countdownRaw = localStorage.getItem(`${targetPlatform}_processing_countdown`);
        const currentEnd = countdownRaw ? parseInt(countdownRaw, 10) : NaN;
        const intervalCompleted = !currentEnd || Number.isNaN(currentEnd) || Date.now() >= currentEnd;
        
        console.log(`🔥 EXTENSION CHECK: countdownRaw=${countdownRaw}, currentEnd=${currentEnd}, now=${Date.now()}, intervalCompleted=${intervalCompleted}`);
        
        if (intervalCompleted) {
          console.log(`🔥 TIMER_EXPIRED: Extending ${targetPlatform} by 5 minutes due to timer expiry`);
          const newEnd = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(`${targetPlatform}_processing_countdown`, newEnd.toString());
          console.log(`🔥 EXTENSION: New timer end set to ${new Date(newEnd).toLocaleTimeString()}`);
          
          try {
            const info = infoRaw ? JSON.parse(infoRaw) : {};
            const safeInfo = {
              platform: targetPlatform,
              username: primaryUsername, // NO FALLBACKS - use exact primaryUsername
              startTime: info.startTime || Date.now(),
              totalDuration: info.totalDuration || undefined,
              isExtension: true,
              endTime: newEnd,
            } as any;
            localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(safeInfo));
            console.log(`🔥 EXTENSION: Updated processing info with extension data`);
          } catch (extErr) {
            console.error(`🔥 EXTENSION: Error updating processing info:`, extErr);
          }
          setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
          console.log(`🔥 EXTENSION: Set extension message and returning to continue timer`);
          return;
        } else {
          console.log(`🔥 TIMER_VALID: Timer still active, continuing checks`);
        }
      } else {
        console.log(`🔥 TIMER_VALID: Timer is valid for ${targetPlatform}, continuing`);
      }
    }, 10000); // throttled from 5000ms to 10000ms for stability

    console.log(`🔥 TIMER_INTERVAL: Started interval monitoring for ${targetPlatform}`);
    return () => {
      console.log(`🔥 TIMER_INTERVAL: Cleaning up interval for ${targetPlatform}`);
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

  // Helper to initialize or read local timer (15 min default) and ensure storage consistency
const getOrInitLocalTimer = (plat: string) => {
  const countdownKey = `${plat}_processing_countdown`;
  const infoKey = `${plat}_processing_info`;
  const now = Date.now();
  let endTimeRaw = localStorage.getItem(countdownKey);
  let infoRaw = localStorage.getItem(infoKey);
  let endTime = endTimeRaw ? parseInt(endTimeRaw, 10) : NaN;
  if (!endTime || Number.isNaN(endTime) || endTime < now) {
    // Initialize new 15 minute window
    endTime = now + 15 * 60 * 1000;
    localStorage.setItem(countdownKey, endTime.toString());
  }
  if (!infoRaw) {
    const info = {
      platform: plat,
      username: username || '',
      startTime: now,
      endTime,
      totalDuration: endTime - now,
      initializedAt: now,
      source: 'processing_page_repair'
    } as any;
    localStorage.setItem(infoKey, JSON.stringify(info));
  } else {
    try {
      const parsed = JSON.parse(infoRaw);
      if (!parsed.endTime || parsed.endTime !== endTime) {
        parsed.endTime = endTime;
        localStorage.setItem(infoKey, JSON.stringify(parsed));
      }
    } catch {}
  }
  return { endTime };
};

// Repair / create backend status if missing but local timer active
const ensureBackendProcessingStatus = async (plat: string) => {
  if (!currentUser?.uid) return;
  try {
    const countdown = localStorage.getItem(`${plat}_processing_countdown`);
    const infoRaw = localStorage.getItem(`${plat}_processing_info`);
    if (!countdown || !infoRaw) return; // nothing to repair
    const endTime = parseInt(countdown, 10);
    if (!endTime || Date.now() >= endTime) return; // expired
    const info = JSON.parse(infoRaw);
    // POST create/update
    await fetch(`/api/processing-status/${currentUser.uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: plat,
        username: info.username || '',
        startTime: info.startTime || Date.now(),
        endTime,
        totalDuration: (typeof info.totalDuration === 'number' && info.totalDuration > 0)
          ? info.totalDuration
          : (endTime - (info.startTime || Date.now()))
      })
    });
    console.log(`🛠 BACKEND REPAIR: Ensured backend processing status for ${plat}`);
  } catch (e) {
    console.warn('🛠 BACKEND REPAIR: Failed ensuring backend status', e);
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
            platform={targetPlatform as 'instagram' | 'twitter' | 'facebook' | 'linkedin'}
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
        platform={targetPlatform as 'instagram' | 'twitter' | 'facebook' | 'linkedin'}
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