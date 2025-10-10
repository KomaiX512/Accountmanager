import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isBypassActive } from '../utils/bypassChecker';

export interface ProcessingGuardResult {
  active: boolean;              // true if processing is still running
  remainingMs: number;          // milliseconds remaining
}

const getCountdownKey = (platformId: string) => `${platformId}_processing_countdown`;
const getInfoKey = (platformId: string) => `${platformId}_processing_info`;

// BULLETPROOF timer validation with multiple checks
const getRemainingMs = (platformId: string): number => {
  try {
    // 🚀 BYPASS CHECK FIRST: If user has activated bypass, treat as no active timer
    try {
      const currentUserId = localStorage.getItem('currentUserId');
      if (currentUserId && isBypassActive(platformId, currentUserId)) {
        return 0;
      }
    } catch {}

    const raw = localStorage.getItem(getCountdownKey(platformId));
    if (!raw) return 0;
    
    const endTime = parseInt(raw, 10);
    if (Number.isNaN(endTime)) return 0;
    
    const remainingMs = Math.max(0, endTime - Date.now());
    
    // Validate against processing info for consistency
    const infoRaw = localStorage.getItem(getInfoKey(platformId));
    if (infoRaw && remainingMs > 0) {
      try {
        const info = JSON.parse(infoRaw);
        if (info.platform !== platformId) {
          // Platform mismatch - clear corrupted data
          localStorage.removeItem(getCountdownKey(platformId));
          localStorage.removeItem(getInfoKey(platformId));
          return 0;
        }
        
            // Check if timer duration is realistic (platform-specific max)
    const getMaxDuration = (platformId: string) => {
      const maxMinutes = platformId === 'facebook' ? 20 : 15;
      return maxMinutes * 60 * 1000;
    };
    const maxDuration = getMaxDuration(platformId);
        if (info.endTime && (info.endTime - info.startTime) > maxDuration) {
          // Suspicious timer duration - clear data
          localStorage.removeItem(getCountdownKey(platformId));
          localStorage.removeItem(getInfoKey(platformId));
          return 0;
        }
      } catch {
        // Corrupted info data - clear everything
        localStorage.removeItem(getCountdownKey(platformId));
        localStorage.removeItem(getInfoKey(platformId));
        return 0;
      }
    }
    
    return remainingMs;
  } catch {
    return 0;
  }
};

// Check for timer manipulation attempts
const detectTimerManipulation = (platformId: string): boolean => {
  try {
    const countdownRaw = localStorage.getItem(getCountdownKey(platformId));
    const infoRaw = localStorage.getItem(getInfoKey(platformId));
    
    if (!countdownRaw || !infoRaw) return false;
    
    const endTime = parseInt(countdownRaw, 10);
    const info = JSON.parse(infoRaw);
    
    // Check for inconsistencies that indicate manipulation
    if (Math.abs(endTime - info.endTime) > 5000) { // 5 second tolerance
      console.warn(`🚨 TIMER MANIPULATION DETECTED: ${platformId} - countdown/info mismatch`);
      return true;
    }
    
    // Check if timer extends beyond realistic future (platform-specific)
    const getMaxFutureTime = (platformId: string) => {
      const maxMinutes = platformId === 'facebook' ? 20 : 15;
      return Date.now() + (maxMinutes * 60 * 1000);
    };
    const maxFutureTime = getMaxFutureTime(platformId);
    if (endTime > maxFutureTime) {
      console.warn(`🚨 TIMER MANIPULATION DETECTED: ${platformId} - unrealistic end time`);
      return true;
    }
    
    // Check if start time is in the future
    if (info.startTime > Date.now()) {
      console.warn(`🚨 TIMER MANIPULATION DETECTED: ${platformId} - future start time`);
      return true;
    }
    
    return false;
  } catch {
    return true; // Treat parsing errors as manipulation
  }
};

/**
 * 🛡️ BULLETPROOF PROCESSING GUARD HOOK
 * 
 * This hook provides multiple layers of timer protection:
 * - LocalStorage validation with corruption detection
 * - Timer manipulation detection
 * - Cross-tab synchronization
 * - Automatic cleanup of invalid timers
 * - Force redirect on active timers
 * 
 * If the timer is active, it redirects the user to `/processing/:platform` and returns {active: true}.
 * Components can call the hook and `return null` when `active` is true to ensure they never mount.
 */
export default function useProcessingGuard(platformId: string, username?: string): ProcessingGuardResult {
  const navigate = useNavigate();
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(platformId));
  const [lastKnownMs, setLastKnownMs] = useState(0);
  const enforcingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const enforceGuard = useCallback((ms: number) => {
    if (enforcingRef.current) return; // Prevent double enforcement
    
    // 🚀 BYPASS CHECK: Never enforce guard when bypass is active
    try {
      const currentUserId = localStorage.getItem('currentUserId');
      if (currentUserId && isBypassActive(platformId, currentUserId)) {
        // Ensure state reflects no active timer
        setRemainingMs(0);
        setLastKnownMs(0);
        return;
      }
    } catch {}

    if (ms > 0) {
      // Detect timer manipulation before enforcing
      if (detectTimerManipulation(platformId)) {
        console.warn(`🚨 CLEARING MANIPULATED TIMER: ${platformId}`);
        localStorage.removeItem(getCountdownKey(platformId));
        localStorage.removeItem(getInfoKey(platformId));
        setRemainingMs(0);
        return;
      }
      
      enforcingRef.current = true;
      
      const remainingMinutes = Math.ceil(ms / 1000 / 60);
      console.log(`🛡️ GUARD ENFORCED: ${platformId} - ${remainingMinutes} minutes remaining`);
      
      // ✅ CRITICAL FIX: NEVER pass username when re-navigating to prevent overwriting inter-username form data
      // The ProcessingLoadingState will get the username from localStorage, which is the source of truth
      navigate(`/processing/${platformId}`, {
        state: {
          platform: platformId,
          // username, // REMOVED: This was overwriting the crucial inter-username form username
          remainingMinutes,
          forcedRedirect: true
        },
        replace: true
      });
      
      // Reset enforcement flag
      setTimeout(() => {
        enforcingRef.current = false;
      }, 1000);
    }
  }, [navigate, platformId, username]);

  // LAYER 1: Initial timer check and enforcement on mount
  useEffect(() => {
    const initialMs = getRemainingMs(platformId);
    setRemainingMs(initialMs);
    setLastKnownMs(initialMs);
    
    if (initialMs > 0) {
      enforceGuard(initialMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LAYER 2: Storage event listener for cross-tab synchronization
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === getCountdownKey(platformId) || e.key === getInfoKey(platformId)) {
        const ms = getRemainingMs(platformId);
        setRemainingMs(ms);
        
        if (ms > 0) {
          enforceGuard(ms);
        }
      }
    };
    
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [platformId, enforceGuard]);

  // LAYER 3: Periodic timer validation and manipulation detection
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const currentMs = getRemainingMs(platformId);
      
      // Check for sudden timer jumps (potential manipulation)
      if (lastKnownMs > 0 && currentMs > lastKnownMs + 5000) {
        console.warn(`🚨 TIMER JUMP DETECTED: ${platformId} - ${lastKnownMs} -> ${currentMs}`);
        localStorage.removeItem(getCountdownKey(platformId));
        localStorage.removeItem(getInfoKey(platformId));
        setRemainingMs(0);
        setLastKnownMs(0);
        return;
      }
      
      setRemainingMs(currentMs);
      setLastKnownMs(currentMs);
      
      if (currentMs > 0) {
        enforceGuard(currentMs);
      }
    }, 2000); // Check every 2 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [platformId, enforceGuard, lastKnownMs]);

  // LAYER 4: Focus event protection
  useEffect(() => {
    const handleFocus = () => {
      const ms = getRemainingMs(platformId);
      setRemainingMs(ms);
      
      if (ms > 0) {
        console.log(`🛡️ FOCUS GUARD: ${platformId} - enforcing on focus`);
        enforceGuard(ms);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [platformId, enforceGuard]);

  // LAYER 5: Visibility change protection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const ms = getRemainingMs(platformId);
        setRemainingMs(ms);
        
        if (ms > 0) {
          console.log(`🛡️ VISIBILITY GUARD: ${platformId} - enforcing on visibility`);
          enforceGuard(ms);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [platformId, enforceGuard]);

  return { active: remainingMs > 0, remainingMs };
} 