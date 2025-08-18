import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';
import ProcessingErrorBoundary from '../components/common/ProcessingErrorBoundary';
import { useProcessing } from '../context/ProcessingContext';
import { useAuth } from '../context/AuthContext';
import { safeNavigate, safeHistoryManipulation } from '../utils/navigationGuard';
import axios from 'axios';
import { getApiUrl } from '../config/api';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: string }>();
  const location = useLocation();
  const { completeProcessing } = useProcessing();
  const { currentUser } = useAuth();
  // Validation runs in background; render immediately to avoid blocking UX
  const [shouldRender, setShouldRender] = useState(true);
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
  
  // Get username from state or storage (prefer canonical per-platform key before giving up)
  const username = (() => {
    // Source of truth order: stateData.username -> processing_info.username -> canonical platform key -> ''
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
    // Canonical per-platform username (saved at setup time)
    try {
      if (currentUser?.uid) {
        const canonical = localStorage.getItem(`${targetPlatform}_username_${currentUser.uid}`);
        if (canonical && canonical.trim()) {
          return canonical.trim();
        }
      }
    } catch {}
    console.error(`🚨 CRITICAL: No username available for platform ${targetPlatform}. This should never happen.`);
    return '';
  })();
  
  const remainingMinutes = stateData?.remainingMinutes;
  const forcedRedirect = stateData?.forcedRedirect || false;

  // Username normalization not needed here; we keep exact primary username

  // Health check removed; direct run-status checks are authoritative

  // Helper: check R2 run status existence for platform/username
  const checkRunStatus = async (platformId: string, primaryUsername: string): Promise<{ exists: boolean; status?: any }> => {
    console.log(`🔍 CHECKRUNSTATUS START: platform=${platformId}, primaryUsername="${primaryUsername}"`);
    
    // Build robust candidate list to avoid case/encoding mismatches
    const trimmed = (primaryUsername || '').trim();
    const candidates: string[] = [];
    if (trimmed) candidates.push(trimmed); // original case
    const lower = trimmed.toLowerCase();
    if (lower && !candidates.includes(lower)) candidates.push(lower);
    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded && !candidates.includes(decoded)) candidates.push(decoded);
    } catch {}
    const cleaned = trimmed.replace(/[^\w\s-]/g, '');
    if (cleaned && !candidates.includes(cleaned)) candidates.push(cleaned);

    // Augment with canonical per-user username if available
    try {
      if (currentUser?.uid) {
        const canonical = localStorage.getItem(`${platformId}_username_${currentUser.uid}`);
        if (canonical) {
          const canonTrim = canonical.trim();
          if (canonTrim && !candidates.includes(canonTrim)) candidates.push(canonTrim);
          const canonLower = canonTrim.toLowerCase();
          if (canonLower && !candidates.includes(canonLower)) candidates.push(canonLower);
        }
        // Also pull current platform-access mapping from backend (authoritative)
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const resp = await fetch(`/api/platform-access/${currentUser.uid}`, { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) {
            const data = await resp.json();
            const access = data?.data || data; // accept either shape
            const platKey = platformId.toLowerCase();
            const accessUsername = access?.[platKey]?.username || access?.username || null;
            if (typeof accessUsername === 'string') {
              const at = accessUsername.trim();
              if (at && !candidates.includes(at)) candidates.push(at);
              const atl = at.toLowerCase();
              if (atl && !candidates.includes(atl)) candidates.push(atl);
            }
          }
        } catch {}
      }
    } catch {}

    console.log(`🔍 CHECKRUNSTATUS: Generated username candidates: [${candidates.join(', ')}]`);

    const runProbeBase = {
      ts: Date.now(),
      platform: platformId,
      usernames: candidates,
      context: 'checkRunStatus'
    } as const;
    try { localStorage.setItem('runstatus_probe', JSON.stringify(runProbeBase)); } catch {}
    console.log(`🔍 RUNSTATUS CHECK: platform=${platformId}, usernames=[${candidates.join(', ')}]`);

    if (candidates.length === 0) {
      console.warn(`❗ RUNSTATUS SKIP: No username candidates available for platform=${platformId}`);
      try { localStorage.setItem('runstatus_probe_error', JSON.stringify({ ...runProbeBase, candidate: null, httpStatus: 'SKIP_NO_USERNAME', resultTs: Date.now() })); } catch {}
      return { exists: false };
    }

    // Helper: optional direct R2 fallback using configurable base URL
    const tryDirectR2 = async (cand: string) => {
      console.log(`🔍 DIRECT R2 ATTEMPT: Trying direct R2 for candidate "${cand}"`);
      try {
        const r2Base = (import.meta as any)?.env?.VITE_R2_PUBLIC_BASE_URL || window.localStorage.getItem('R2_PUBLIC_BASE_URL');
        if (!r2Base) {
          console.log(`🔍 DIRECT R2 SKIP: No R2_PUBLIC_BASE_URL configured`);
          return { exists: false };
        }
        const directUrl = `${r2Base.replace(/\/$/, '')}/RunStatus/${platformId}/${encodeURIComponent(cand)}/status.json`;
        console.log(`🔍 DIRECT R2 URL: ${directUrl}`);
        
        try { localStorage.setItem('runstatus_probe_attempt', JSON.stringify({ ...runProbeBase, candidate: cand, url: directUrl, attemptTs: Date.now(), transport: 'direct-r2' })); } catch {}
        const res = await fetch(directUrl, { method: 'GET' });
        console.log(`🔍 DIRECT R2 RESPONSE: status=${res.status}, ok=${res.ok}`);
        
        if (res.ok) {
          let statusVal: any = null;
          try { 
            const j = await res.json(); 
            statusVal = j?.status ?? null; 
            console.log(`🔍 DIRECT R2 JSON: ${JSON.stringify(j)}`);
          } catch (jsonErr) {
            console.log(`🔍 DIRECT R2 JSON PARSE ERROR: ${jsonErr}`);
          }
          try { localStorage.setItem('runstatus_probe_result', JSON.stringify({ ...runProbeBase, candidate: cand, httpStatus: res.status, exists: true, status: statusVal, resultTs: Date.now(), transport: 'direct-r2' })); } catch {}
          console.log(`✅ RUNSTATUS FOUND (direct R2): candidate="${cand}", status=${statusVal}`);
          return { exists: true, status: statusVal };
        }
        try { localStorage.setItem('runstatus_probe_error', JSON.stringify({ ...runProbeBase, candidate: cand, httpStatus: res.status, resultTs: Date.now(), transport: 'direct-r2' })); } catch {}
        console.log(`❌ DIRECT R2 FAILED: status=${res.status} for candidate "${cand}"`);
        return { exists: false };
      } catch (e: any) {
        console.log(`❌ DIRECT R2 ERROR: ${e?.message || String(e)} for candidate "${cand}"`);
        try { localStorage.setItem('runstatus_probe_error', JSON.stringify({ ...runProbeBase, candidate: cand, httpStatus: 'ERR', error: e?.message || String(e), resultTs: Date.now(), transport: 'direct-r2' })); } catch {}
        return { exists: false };
      }
    };

    for (const candidate of candidates) {
      console.log(`🔍 TRYING CANDIDATE: "${candidate}" (${candidates.indexOf(candidate) + 1}/${candidates.length})`);
      
      // Prefer direct R2 when configured, to avoid proxy issues; if found, short-circuit
      const directPref = await tryDirectR2(candidate);
      if (directPref.exists) {
        console.log(`✅ DIRECT-FIRST SUCCESS: Found run-status via direct R2 for candidate "${candidate}"`);
        return directPref;
      }

      const cb = `?cb=${Date.now()}`;
      const url = getApiUrl(`/api/run-status/${platformId}/${encodeURIComponent(candidate)}${cb}`);
      console.log(`🔍 API URL: ${url}`);
      
      try {
        try { localStorage.setItem('runstatus_probe_attempt', JSON.stringify({ ...runProbeBase, candidate, url, attemptTs: Date.now() })); } catch {}
        console.log(`🔍 MAKING API REQUEST: ${url}`);
        const res = await axios.get(url, { timeout: 10000 });
        console.log(`🔍 API RESPONSE: status=${res.status}, data=`, res.data);
        
        if (res.status === 200) {
          // Accept two server behaviors:
          // 1) Proxy returns wrapper { exists: boolean, status?: string }
          // 2) Proxy (or direct R2) returns the file JSON, e.g. { status: 'completed' }
          let exists = false;
          let statusVal: any = null;
          if (res.data && typeof res.data === 'object') {
            if (Object.prototype.hasOwnProperty.call(res.data, 'exists')) {
              exists = !!res.data.exists;
              statusVal = res.data.status ?? null;
              console.log(`🔍 PARSED EXISTS: exists=${exists}, status=${statusVal}`);
            } else if (Object.prototype.hasOwnProperty.call(res.data, 'status')) {
              // If we received the actual file content, treat 200 as exists
              exists = true;
              statusVal = res.data.status;
              console.log(`🔍 PARSED FILE CONTENT: exists=${exists}, status=${statusVal}`);
            } else {
              // Any 200 with an object body implies the object exists
              exists = true;
              console.log(`🔍 PARSED OBJECT: exists=${exists} (200 with object body)`);
            }
          } else {
            // 200 with non-object still implies object exists at path
            exists = true;
            console.log(`🔍 PARSED NON-OBJECT: exists=${exists} (200 with non-object body)`);
          }

          try { localStorage.setItem('runstatus_probe_result', JSON.stringify({ ...runProbeBase, candidate, httpStatus: res.status, exists, status: statusVal, resultTs: Date.now() })); } catch {}
          if (exists) {
            console.log(`✅ RUNSTATUS FOUND: candidate="${candidate}", status=${statusVal}`);
            return { exists: true, status: statusVal };
          }
          // If proxy returned 200 but indicates not exists, try direct R2 as secondary truth source
          console.log(`🔍 PROXY SAID NOT EXISTS: Trying direct R2 as backup for candidate "${candidate}"`);
          const direct200 = await tryDirectR2(candidate);
          if (direct200.exists) return direct200;
          continue;
        }
      } catch (e: any) {
        const code = e?.response?.status;
        console.log(`🔄 RUNSTATUS TRY FAILED: candidate="${candidate}", status=${code || 'ERR'}, error=${e?.message || String(e)}`);
        try { localStorage.setItem('runstatus_probe_error', JSON.stringify({ ...runProbeBase, candidate, httpStatus: code || 'ERR', resultTs: Date.now(), error: e?.message || String(e) })); } catch {}
        // Fallback: try direct R2 if configured
        console.log(`🔍 TRYING DIRECT R2 FALLBACK: for candidate "${candidate}"`);
        const direct = await tryDirectR2(candidate);
        if (direct.exists) return direct;
        // else try next candidate
      }
    }

    console.log(`❌ RUNSTATUS NOT FOUND: All candidates failed for platform=${platformId}`);
    return { exists: false };
  };

  // Helper: finalize and navigate to dashboard consistently
  const finalizeAndNavigate = async (plat: string, primaryUsernameParam?: string) => {
    if (finalizeTriggeredRef.current) {
      console.log(`🎯 FINALIZE_AND_NAVIGATE: Skipped duplicate finalization for ${plat}`);
      return;
    }
    finalizeTriggeredRef.current = true;
    console.log(`🎯 FINALIZE_AND_NAVIGATE: Starting finalization for platform ${plat}`);

    // 🚦 RUN STATUS SAFEGUARD: Verify R2 run status file exists before allowing completion
    let primaryUsername = primaryUsernameParam;
    try {
      const infoRaw = localStorage.getItem(`${plat}_processing_info`);
      if (!primaryUsername && infoRaw) {
        const info = JSON.parse(infoRaw);
        if (info.username && typeof info.username === 'string' && info.username.trim()) {
          primaryUsername = info.username.trim();
        }
      }
    } catch {}

    let runStatusVerified = false;
    if (primaryUsername) {
      try {
        const runStatus = await checkRunStatus(plat, primaryUsername);
        if (!runStatus.exists) {
          console.log(`🚦 RUN STATUS MISSING: Extending timer by 5 minutes for ${plat}/${primaryUsername} before finalization`);
          const fiveMinutesMs = 5 * 60 * 1000;
          const newEnd = Date.now() + fiveMinutesMs;
          localStorage.setItem(`${plat}_processing_countdown`, String(newEnd));
          try {
            const infoRaw2 = localStorage.getItem(`${plat}_processing_info`);
            if (infoRaw2) {
              const info2 = JSON.parse(infoRaw2);
              info2.endTime = newEnd;
              info2.totalDuration = (info2.totalDuration || 0) + fiveMinutesMs;
              info2.isExtension = true;
              localStorage.setItem(`${plat}_processing_info`, JSON.stringify(info2));
            }
          } catch {}
          finalizeTriggeredRef.current = false;
          safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
          return;
        } else {
          runStatusVerified = true;
        }
      } catch (runErr) {
        console.warn('🚦 RUN STATUS SAFEGUARD: Error while checking run status', runErr);
      }
    } else {
      console.warn(`🚦 RUN STATUS SAFEGUARD: Username unavailable for ${plat}. Extending timer by 5 minutes and aborting finalization.`);
      try {
        const fiveMinutesMs = 5 * 60 * 1000;
        const newEnd = Date.now() + fiveMinutesMs;
        localStorage.setItem(`${plat}_processing_countdown`, String(newEnd));
        const infoRaw = localStorage.getItem(`${plat}_processing_info`);
        const info = infoRaw ? JSON.parse(infoRaw) : {};
        info.platform = plat;
        if (!info.startTime) info.startTime = Date.now();
        info.endTime = newEnd;
        info.totalDuration = (typeof info.totalDuration === 'number' ? info.totalDuration : 0) + fiveMinutesMs;
        info.isExtension = true;
        localStorage.setItem(`${plat}_processing_info`, JSON.stringify(info));
      } catch {}
      finalizeTriggeredRef.current = false;
      safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
      return;
    }

    // Backend authority: Recheck before cleanup; if backend still active, we proceed if run-status is verified
    if (currentUser?.uid) {
      try {
        const statusResp = await fetch(`/api/processing-status/${currentUser.uid}?platform=${plat}`);
        if (statusResp.ok) {
          const json = await statusResp.json();
          const data = json?.data;
          const nowTs = Date.now();
          if (!runStatusVerified && data && typeof data.endTime === 'number' && nowTs < data.endTime) {
            console.log(`🎯 FINALIZE ABORTED: Backend indicates active processing for ${plat} and run-status not yet verified. Extending timer by 5 minutes and returning to processing page`);
            // Extend local timer by 5 minutes as graceful fallback
            try {
              const fiveMinutesMs = 5 * 60 * 1000;
              const newEnd = Date.now() + fiveMinutesMs;
              localStorage.setItem(`${plat}_processing_countdown`, String(newEnd));
              const infoRaw = localStorage.getItem(`${plat}_processing_info`);
              if (infoRaw) {
                const info = JSON.parse(infoRaw);
                info.endTime = newEnd;
                info.totalDuration = (info.totalDuration || 0) + fiveMinutesMs;
                localStorage.setItem(`${plat}_processing_info`, JSON.stringify(info));
              }
            } catch {}

            finalizeTriggeredRef.current = false;
            safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
            return;
          }
        }
      } catch (e) {
        console.warn('🎯 FINALIZE: Backend recheck error; proceeding if run-status was verified, otherwise aborting', e);
        if (!runStatusVerified) {
          finalizeTriggeredRef.current = false;
          safeNavigate(navigate, `/processing/${plat}`, { replace: true }, 8);
          return;
        }
      }
    }

    // Proceed with backend cleanup; if run-status verified, deletion is best-effort
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
        if (!deleteOk) console.warn(`🎯 FINALIZE: Backend delete not successful (status=${resp.status}).`);
      } catch (e) {
        console.warn('🎯 FINALIZE: Backend delete error.', e);
        deleteOk = false;
      }

      if (!deleteOk && !runStatusVerified) {
        // If we do not have run-status assurance, do not finalize
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
      
      console.log(`🎯 FINALIZE: Calling completeProcessing()`);
      completeProcessing();
      // Best-effort: Mark platform as claimed
      try {
        if (currentUser?.uid) {
          const infoRaw = localStorage.getItem(`${plat}_processing_info`);
          let usernameToUse = primaryUsername || '';
          try {
            if (infoRaw) {
              const info = JSON.parse(infoRaw);
              if (info.username && typeof info.username === 'string' && info.username.trim()) {
                usernameToUse = info.username.trim();
              }
            }
          } catch {}
          await fetch(`/api/platform-access/${currentUser.uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: plat, claimed: true, username: usernameToUse })
          });
        }
      } catch {}
      
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
      // Add defensive timeout to avoid UI getting stuck on slow networks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`/api/validate-dashboard-access/${currentUser.uid}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platform: targetPlatform
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

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
          // Ensure UI renders and does not stick on overlay while finalize decides
          setShouldRender(true);
          finalizeAndNavigate(targetPlatform, username);
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
            finalizeAndNavigate(targetPlatform, primaryUsername);
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
          return;
        }
        finalizeAndNavigate(targetPlatform);
        return;
      }

      setShouldRender(true);
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
        // FIRST: Run-status check immediately at expiry
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
          finalizeAndNavigate(targetPlatform, primaryUsername);
          return;
        }

        // SECOND: Backend authoritative recheck
        if (!backendRecheckInFlight) {
          backendRecheckInFlight = true;
          const backendCheck = await validateWithBackend();
          backendRecheckInFlight = false;
          if (!backendCheck.isValid && (backendCheck.shouldRedirect || backendCheck.reason === 'completed_by_backend')) {
            console.log(`🔥 BACKEND RECHECK COMPLETION: Finalizing for ${targetPlatform}`);
            clearInterval(interval);
            finalizeAndNavigate(targetPlatform, username);
            return;
          }
          if (backendCheck.isValid) {
            // backend repaired; ensure local timer present
            getOrInitLocalTimer(targetPlatform);
          }
        }

        // Treat ANY interval completion (missing or expired countdown) as a 5-minute extension
        const countdownRaw = localStorage.getItem(`${targetPlatform}_processing_countdown`);
        const currentEnd = countdownRaw ? parseInt(countdownRaw, 10) : NaN;
        const intervalCompleted = !currentEnd || Number.isNaN(currentEnd) || Date.now() >= currentEnd;
        
        console.log(`🔥 EXTENSION CHECK: countdownRaw=${countdownRaw}, currentEnd=${currentEnd}, now=${Date.now()}, intervalCompleted=${intervalCompleted}`);
        
        if (intervalCompleted) {
          console.log(`⏳ RUNSTATUS NOT_FOUND: Extending ${targetPlatform} by 5 minutes due to missing run-status after expiry`);
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

  // EXACT END-TIME SCHEDULER: Fire run-status check precisely at countdown completion
  useEffect(() => {
    // Read current endTime from storage
    const countdownKey = `${targetPlatform}_processing_countdown`;
    const endRaw = localStorage.getItem(countdownKey);
    const endTs = endRaw ? parseInt(endRaw, 10) : NaN;
    if (!endTs || Number.isNaN(endTs)) {
      console.log(`⏱️ SCHEDULER: No valid endTime found for ${targetPlatform}, skipping scheduler`);
      return;
    }
    
    const delay = Math.max(0, endTs - Date.now());
    console.log(`⏱️ SCHEDULER: Scheduling interval-complete check for ${targetPlatform} in ${Math.ceil(delay/1000)}s (endTime: ${new Date(endTs).toLocaleTimeString()})`);

    const id = setTimeout(async () => {
      try {
        console.log(`⏱️ SCHEDULER TIMEOUT FIRED: Checking if we should run interval-complete for ${targetPlatform}`);
        
        // Guard against races: ensure still expired or at threshold
        const latestRaw = localStorage.getItem(countdownKey);
        const latestEnd = latestRaw ? parseInt(latestRaw, 10) : NaN;
        if (latestEnd && Date.now() < latestEnd - 250) {
          console.log(`⏱️ SCHEDULER ABORT: endTime moved forward for ${targetPlatform} (${new Date(latestEnd).toLocaleTimeString()}), skipping immediate check`);
          return;
        }
        
        console.log(`⏱️ SCHEDULER FIRE: Running interval-complete handler for ${targetPlatform}`);
        await handleIntervalComplete();
        console.log(`⏱️ SCHEDULER COMPLETE: handleIntervalComplete finished for ${targetPlatform}`);
      } catch (e) {
        console.error('⏱️ SCHEDULER ERROR:', e);
      }
    }, delay + 50); // slight buffer

    console.log(`⏱️ SCHEDULER: Set timeout ID ${id} for ${targetPlatform}`);
    return () => {
      console.log(`⏱️ SCHEDULER: Clearing timeout ID ${id} for ${targetPlatform}`);
      clearTimeout(id);
    };
  }, [shouldRender, targetPlatform]);

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

  // Fired exactly when the countdown interval reaches zero from the child component
  const handleIntervalComplete = async () => {
    console.log(`🚨 INTERVAL COMPLETE TRIGGERED: ${targetPlatform} - Starting run-status check`);
    
    try {
      // Resolve primary username (prefer localStorage info)
      let primaryUsername = username;
      try {
        const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
        if (infoRaw) {
          const info = JSON.parse(infoRaw);
          if (info && typeof info.username === 'string' && info.username.trim()) {
            primaryUsername = info.username.trim();
          }
        }
      } catch {}

      console.log(`🚨 INTERVAL COMPLETE: Username resolved as "${primaryUsername}" for ${targetPlatform}`);
      
      try { localStorage.setItem('interval_complete_probe', JSON.stringify({ ts: Date.now(), platform: targetPlatform, username: primaryUsername })); } catch {}
      
      console.log(`🚨 INTERVAL COMPLETE: About to call checkRunStatus for ${targetPlatform}/${primaryUsername}`);
      const status = await checkRunStatus(targetPlatform, primaryUsername);
      
      console.log(`🚨 INTERVAL COMPLETE: checkRunStatus returned:`, status);
      console.log(`🚨 INTERVAL COMPLETE: status.exists = ${status.exists}, status.status = ${status.status}`);
      
      if (status.exists) {
        console.log(`🎉 INTERVAL COMPLETE: Run status FOUND! Finalizing ${targetPlatform} and navigating to dashboard.`);
        await finalizeAndNavigate(targetPlatform, primaryUsername);
        return;
      }

      // Not found → extend by 5 minutes and repair backend status
      console.log(`⏳ INTERVAL COMPLETE: Run status NOT FOUND. Extending ${targetPlatform} by 5 minutes.`);
      const fiveMinutesMs = 5 * 60 * 1000;
      const newEnd = Date.now() + fiveMinutesMs;
      
      console.log(`⏳ INTERVAL COMPLETE: Setting new end time to ${new Date(newEnd).toLocaleTimeString()}`);
      localStorage.setItem(`${targetPlatform}_processing_countdown`, String(newEnd));
      
      try {
        const infoRaw = localStorage.getItem(`${targetPlatform}_processing_info`);
        const info = infoRaw ? JSON.parse(infoRaw) : {};
        info.platform = targetPlatform;
        if (!info.startTime) info.startTime = Date.now();
        info.username = primaryUsername || info.username || '';
        info.endTime = newEnd;
        info.totalDuration = (typeof info.totalDuration === 'number' ? info.totalDuration : 0) + fiveMinutesMs;
        info.isExtension = true;
        localStorage.setItem(`${targetPlatform}_processing_info`, JSON.stringify(info));
        console.log(`⏳ INTERVAL COMPLETE: Updated processing info with extension data`);
      } catch {}

      console.log(`⏳ INTERVAL COMPLETE: Calling ensureBackendProcessingStatus for ${targetPlatform}`);
      await ensureBackendProcessingStatus(targetPlatform);
      
      console.log(`⏳ INTERVAL COMPLETE: Setting extension message`);
      setExtensionMessage('We are facing a bit of difficulty while fetching your data. Please allow 5 more minutes while we finalize your dashboard.');
      
      console.log(`⏳ INTERVAL COMPLETE: Extension complete. Timer extended by 5 minutes.`);
    } catch (e) {
      console.error('🚨 INTERVAL COMPLETE: Error while handling completion:', e);
      console.log('🚨 INTERVAL COMPLETE: Leaving timer to parent interval check due to error.');
    }
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

  // Do not block UI with an overlay; validation continues in background

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
        onIntervalComplete={handleIntervalComplete}
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