/**
 * 🔄 BULLETPROOF PLATFORM RESET HOOK
 * 
 * Comprehensive platform state reset utility that handles:
 * - Navigation to main dashboard
 * - Complete cache clearing
 * - Session storage cleanup
 * - Browser history manipulation
 * - Platform-specific session manager integration
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstagram } from '../context/InstagramContext';
import { useTwitter } from '../context/TwitterContext';
import { useFacebook } from '../context/FacebookContext';
import { useLinkedIn } from '../context/LinkedInContext';
import { useAcquiredPlatforms } from '../context/AcquiredPlatformsContext';
import { 
  clearInstagramConnection, 
  resetDisconnectedFlag as resetInstagramDisconnectedFlag 
} from '../utils/instagramSessionManager';
import { 
  clearTwitterConnection, 
  resetDisconnectedFlag as resetTwitterDisconnectedFlag 
} from '../utils/twitterSessionManager';
import { 
  clearFacebookConnection, 
  resetDisconnectedFlag as resetFacebookDisconnectedFlag 
} from '../utils/facebookSessionManager';

export interface PlatformResetOptions {
  platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  username: string;
  navigateToMain?: boolean;
  clearBrowserHistory?: boolean;
}

/**
 * Custom hook for bulletproof platform reset functionality
 */
export const useResetPlatformState = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  // Platform context hooks for accessing platform reset functions
  const { resetInstagramAccess } = useInstagram();
  const { resetTwitterAccess } = useTwitter();
  const { resetFacebookAccess } = useFacebook();
  const { resetLinkedInAccess } = useLinkedIn();
  
  // Acquired platforms context for refreshing main dashboard status
  const { refreshPlatforms } = useAcquiredPlatforms();

  /**
   * Clears all platform-specific localStorage entries
   */
  const clearPlatformLocalStorage = useCallback((platform: string, userId: string) => {
    console.log(`[ResetPlatformState] 🧹 Clearing localStorage for ${platform}`);
    
    // Get all localStorage keys and filter platform-specific ones
    const allKeys = Object.keys(localStorage);
    const platformKeys = allKeys.filter(key => 
      key.includes(platform) ||
      key.includes(`${platform}_`) ||
      key.includes(`_${platform}_`) ||
      key.includes(`viewed_${platform}`) ||
      key.includes(`${platform}_accessed_${userId}`) ||
      key.includes(`${platform}_processing`) ||
      key.includes(`${platform}_completed`) ||
      key.includes(`${platform}_connection`) ||
      key.includes(`${platform}_user_id`) ||
      key.includes(`${platform}_username`) ||
      key.includes(`${platform}_token`) ||
      key.includes(`completedPlatforms`) ||
      key.includes('processingState')
    );
    
    // Remove all platform-specific keys
    platformKeys.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log(`[ResetPlatformState] ✅ Removed ${platformKeys.length} localStorage entries`);

    // Also remove this platform from the consolidated acquired list in BOTH storages
    try {
      const consolidatedKey = `acquired_platforms_${userId}`;
      const lsRaw = localStorage.getItem(consolidatedKey);
      if (lsRaw) {
        const list = Array.isArray(JSON.parse(lsRaw)) ? JSON.parse(lsRaw).filter((p: string) => p !== platform) : [];
        localStorage.setItem(consolidatedKey, JSON.stringify(list));
        console.log(`[ResetPlatformState] ✅ Updated localStorage consolidated list:`, list);
      }
      const ssRaw = sessionStorage.getItem(consolidatedKey);
      if (ssRaw) {
        const list = Array.isArray(JSON.parse(ssRaw)) ? JSON.parse(ssRaw).filter((p: string) => p !== platform) : [];
        sessionStorage.setItem(consolidatedKey, JSON.stringify(list));
        console.log(`[ResetPlatformState] ✅ Updated sessionStorage consolidated list:`, list);
      }
    } catch (e) {
      console.warn(`[ResetPlatformState] ⚠️ Failed updating consolidated acquired list:`, e);
    }
  }, []);

  /**
   * Verifies backend access/claimed status is cleared after reset
   */
  const verifyBackendAccessCleared = useCallback(async (platform: string, userId: string): Promise<boolean> => {
    console.log(`[ResetPlatformState] 🔍 Verifying backend access cleared for ${platform}`);
    const maxAttempts = 8;
    const delayMs = 1000;
    const makeUserStatusEndpoint = (p: string) => {
      if (p === 'instagram') return `/api/user-instagram-status/${userId}`;
      if (p === 'twitter') return `/api/user-twitter-status/${userId}`;
      if (p === 'facebook') return `/api/user-facebook-status/${userId}`;
      if (p === 'linkedin') return `/api/user-linkedin-status/${userId}`;
      return `/api/platform-access/${userId}`;
    };
    const isUnclaimed = (p: string, data: any) => {
      if (p === 'instagram') return data?.hasEnteredInstagramUsername !== true;
      if (p === 'twitter') return data?.hasEnteredTwitterUsername !== true;
      if (p === 'facebook') return data?.hasEnteredFacebookUsername !== true;
      if (p === 'linkedin') return data?.hasEnteredLinkedInUsername !== true;
      return data?.[p]?.claimed !== true;
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const ts = Date.now();
        const statusResp = await fetch(`${makeUserStatusEndpoint(platform)}?ts=${ts}`, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
        const accessResp = await fetch(`/api/platform-access/${userId}?ts=${ts}`, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
        let statusOk = false;
        let accessOk = false;
        if (statusResp.ok) {
          const json = await statusResp.json();
          const data = json?.data || json;
          statusOk = isUnclaimed(platform, data);
        } else if (statusResp.status === 404) {
          statusOk = true;
        }
        if (accessResp.ok) {
          const json = await accessResp.json();
          const data = json?.data || json;
          accessOk = data?.[platform]?.claimed !== true;
        } else if (accessResp.status === 404) {
          accessOk = true;
        }

        if (statusOk && accessOk) {
          console.log(`[ResetPlatformState] ✅ Backend access cleared for ${platform}`);
          return true;
        }
        console.log(`[ResetPlatformState] ⏳ Backend access not yet cleared for ${platform} (attempt ${attempt}/${maxAttempts})`);
      } catch (err) {
        console.warn(`[ResetPlatformState] ⚠️ Error verifying backend access cleared:`, err);
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
    console.warn(`[ResetPlatformState] ❌ Backend access did not clear within verification window for ${platform}`);
    return false;
  }, []);

  /**
   * Clears all platform-specific sessionStorage entries
   */
  const clearPlatformSessionStorage = useCallback((platform: string, userId: string) => {
    console.log(`[ResetPlatformState] 🧹 Clearing sessionStorage for ${platform}`);
    
    // Get all sessionStorage keys and filter platform-specific ones
    const allKeys = Object.keys(sessionStorage);
    const platformKeys = allKeys.filter(key => 
      key.includes(platform) ||
      key.includes(`${platform}_`) ||
      key.includes(`_${platform}_`) ||
      key.includes(`viewed_${platform}`) ||
      key.includes(`${platform}_accessed_${userId}`) ||
      key.includes(`${platform}_processing`)
    );
    
    // Remove all platform-specific keys
    platformKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
    
    console.log(`[ResetPlatformState] ✅ Removed ${platformKeys.length} sessionStorage entries`);
  }, []);

  /**
   * Clears platform-specific session manager data AND context state
   */
  const clearSessionManagerData = useCallback((platform: string, userId: string) => {
    console.log(`[ResetPlatformState] 🧹 Clearing session manager data for ${platform}`);
    
    switch (platform) {
      case 'instagram':
        clearInstagramConnection(userId);
        resetInstagramAccess(); // 🔥 Reset context state to update main dashboard
        break;
      case 'twitter':
        clearTwitterConnection(userId);
        resetTwitterAccess(); // 🔥 Reset context state to update main dashboard
        break;
      case 'facebook':
        clearFacebookConnection(userId);
        resetFacebookAccess(); // 🔥 Reset context state to update main dashboard
        break;
      case 'linkedin':
        // Clear LinkedIn connection data (assuming similar session manager exists)
        console.log(`[ResetPlatformState] 🧹 Clearing LinkedIn session data for ${userId}`);
        resetLinkedInAccess(); // 🔥 Reset context state to update main dashboard
        // Note: LinkedIn session manager functions would be added here when available
        break;
    }
  }, [resetInstagramAccess, resetTwitterAccess, resetFacebookAccess, resetLinkedInAccess]);

  /**
   * Manipulates browser history to prevent back navigation to reset dashboard
   */
  const preventBackNavigation = useCallback(() => {
    console.log(`[ResetPlatformState] 🚫 Setting up back navigation prevention`);
    
    // Replace current history entry with main dashboard
    window.history.replaceState(null, '', '/account');
    
    // Add a sentinel entry to detect back navigation attempts
    window.history.pushState({ isResetSentinel: true }, '', '/account');
    
    // Set up popstate listener to handle back button
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.isResetSentinel) {
        // If they try to go back from the sentinel, keep them on main dashboard
        window.history.replaceState(null, '', '/account');
        navigate('/account', { replace: true });
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    
    // Clean up listener after 10 seconds (enough time for user to navigate normally)
    setTimeout(() => {
      window.removeEventListener('popstate', handlePopState);
    }, 10000);
  }, [navigate]);

  /**
   * Checks if user has an active campaign for the platform
   */
  const checkActiveCampaign = useCallback(async (platform: string, username: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/campaign-status/${username}?platform=${platform}&bypass_cache=true`);
      if (!response.ok) {
        console.warn(`[ResetPlatformState] Failed to check campaign status: ${response.statusText}`);
        return false;
      }
      
      const data = await response.json();
      return data.hasActiveCampaign || false;
    } catch (error) {
      console.error(`[ResetPlatformState] Error checking active campaign:`, error);
      return false;
    }
  }, []);

  /**
   * Stops an active campaign for the platform
   */
  const stopActiveCampaign = useCallback(async (platform: string, username: string): Promise<boolean> => {
    console.log(`[ResetPlatformState] 🛑 Stopping active campaign for ${username} on ${platform}`);
    
    try {
      const response = await fetch(`/api/stop-campaign/${username}?platform=${platform}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Stop campaign failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[ResetPlatformState] ✅ Campaign stopped successfully:`, result);
      return result.success || true;
    } catch (error) {
      console.error(`[ResetPlatformState] ❌ Failed to stop campaign:`, error);
      return false;
    }
  }, []);

  /**
   * Performs backend platform reset API call
   */
  const performBackendReset = useCallback(async (platform: string, userId: string): Promise<boolean> => {
    console.log(`[ResetPlatformState] 📡 Calling backend reset API for ${platform}`);
    
    try {
      const response = await fetch(`/api/platform-reset/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform })
      });

      if (!response.ok) {
        throw new Error(`Reset API failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[ResetPlatformState] ✅ Backend reset successful:`, result);
      return true;
    } catch (error) {
      console.error(`[ResetPlatformState] ❌ Backend reset failed:`, error);
      return false;
    }
  }, []);

  /**
   * Verifies backend processing status is cleared/inactive after reset
   */
  const verifyBackendProcessingCleared = useCallback(async (platform: string, userId: string): Promise<boolean> => {
    console.log(`[ResetPlatformState] 🔍 Verifying backend processing state is cleared for ${platform}`);
    const maxAttempts = 8; // ~16s @ 2s intervals
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const url = `/api/processing-status/${userId}?platform=${platform}&cb=${Date.now()}&bypass_cache=true`;
        const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (resp.ok) {
          const json = await resp.json();
          const data = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
          const nowTs = Date.now();

          // No data at all -> treated as cleared
          if (!data) {
            console.log(`[ResetPlatformState] ✅ Backend confirms ${platform} processing state is cleared`);
            return true;
          }

          // Explicit inactive flag
          const activeFlag = typeof (data as any).active === 'boolean' ? (data as any).active : undefined;
          if (activeFlag === false) {
            console.log(`[ResetPlatformState] ✅ Backend indicates inactive processing for ${platform}`);
            return true;
          }

          // Expired endTime -> treated as cleared
          const endTimeRaw: unknown = (data as any).endTime;
          const endTimeNum = typeof endTimeRaw === 'string' || typeof endTimeRaw === 'number' ? Number(endTimeRaw) : NaN;
          if (Number.isFinite(endTimeNum) && nowTs >= endTimeNum) {
            console.log(`[ResetPlatformState] ✅ Backend processing state expired for ${platform} (treated as cleared)`);
            return true;
          }

          console.log(`[ResetPlatformState] ⏳ Backend still indicates active processing for ${platform} (attempt ${attempt}/${maxAttempts})`);
        } else {
          // 404 means no status exists -> treat as cleared
          if (resp.status === 404) {
            console.log(`[ResetPlatformState] ✅ Backend returned 404 (no processing status) for ${platform}`);
            return true;
          }
          console.warn(`[ResetPlatformState] ⚠️ Backend verification request failed (status=${resp.status}) attempt ${attempt}/${maxAttempts}`);
        }
      } catch (err) {
        console.warn(`[ResetPlatformState] ⚠️ Error verifying backend processing status (attempt ${attempt}/${maxAttempts}):`, err);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    console.warn(`[ResetPlatformState] ❌ Backend processing status did not clear after verification window for ${platform}`);
    return false;
  }, []);

  /**
   * Main reset function that orchestrates all reset operations
   */
  const resetPlatformState = useCallback(async (options: PlatformResetOptions): Promise<boolean> => {
    const { platform, username, navigateToMain = true, clearBrowserHistory = true } = options;
    
    if (!currentUser?.uid) {
      console.error('[ResetPlatformState] ❌ No authenticated user found');
      return false;
    }

    const userId = currentUser.uid;
    
    console.log(`[ResetPlatformState] 🔄 Starting platform reset for ${platform} (user: ${userId})`);

    try {
      // Step 0: 🚨 ENHANCED - Check for and stop any active campaigns first
      console.log(`[ResetPlatformState] 🔍 Checking for active campaigns before reset`);
      const hasActiveCampaign = await checkActiveCampaign(platform, username);
      
      if (hasActiveCampaign) {
        console.log(`[ResetPlatformState] 🛑 Active campaign detected - stopping before reset`);
        const campaignStopped = await stopActiveCampaign(platform, username);
        
        if (!campaignStopped) {
          console.warn(`[ResetPlatformState] ⚠️ Failed to stop active campaign - continuing with reset anyway`);
        } else {
          console.log(`[ResetPlatformState] ✅ Active campaign stopped successfully`);
        }
        
        // Wait a moment for campaign cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`[ResetPlatformState] ✅ No active campaigns found`);
      }

      // Step 1: Clear frontend caches first (immediate feedback)
      clearPlatformLocalStorage(platform, userId);
      clearPlatformSessionStorage(platform, userId);
      clearSessionManagerData(platform, userId);

      // Step 1.1: Set a short-lived reset sentinel to suppress re-claim mirrors while backend settles
      try {
        localStorage.setItem(`${platform}_reset_pending_${userId}`, Date.now().toString());
        console.log(`[ResetPlatformState] 🛡️ Set reset sentinel: ${platform}_reset_pending_${userId}`);
      } catch {}

      // Step 2: Call backend reset API
      const backendSuccess = await performBackendReset(platform, userId);
      if (!backendSuccess) {
        console.warn('[ResetPlatformState] ⚠️ Backend reset failed, but continuing with frontend reset');
      }

      // Step 2.1: Verify backend processing status cleared to avoid premature navigation
      const backendCleared = await verifyBackendProcessingCleared(platform, userId);
      if (!backendCleared) {
        console.warn(`[ResetPlatformState] ❌ Backend not cleared for ${platform}. Aborting navigation to ensure consistency.`);
        return false;
      }

      // Step 2.1b: Verify backend access/claimed state is cleared
      const accessCleared = await verifyBackendAccessCleared(platform, userId);
      if (!accessCleared) {
        console.warn(`[ResetPlatformState] ❌ Backend access not cleared for ${platform}. Aborting navigation to ensure entry form shows.`);
        return false;
      }

      // Step 2.2: Proactively mark claimed=false on backend so future mirrors don't re-acquire
      try {
        await fetch(`/api/platform-access/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, claimed: false })
        });
        console.log(`[ResetPlatformState] 📡 Backend platform-access set to claimed=false for ${platform}`);
      } catch (err) {
        console.warn(`[ResetPlatformState] ⚠️ Failed to set claimed=false on backend for ${platform}:`, err);
      }

      // Step 3: Prevent back navigation if requested
      if (clearBrowserHistory) {
        preventBackNavigation();
      }

      // Step 4: Refresh acquired platforms BEFORE navigation to update main dashboard status
      refreshPlatforms();
      // Allow a short tick to let state propagate
      await new Promise(resolve => setTimeout(resolve, 50));
      console.log(`[ResetPlatformState] 🔄 Refreshed acquired platforms - dashboard will reflect reset`);

      // Step 4.1: Broadcast a platformReset event so MainDashboard updates immediately
      try {
        window.dispatchEvent(new CustomEvent('platformReset', {
          detail: {
            platform,
            reason: 'manual_reset',
            timestamp: Date.now()
          }
        }));
      } catch {}

      // Step 5: Navigate to entry username form for this platform
      if (navigateToMain) {
        console.log(`[ResetPlatformState] 🧭 Navigating to entry form for ${platform}`);
        const entryPath = platform === 'twitter' 
          ? '/twitter' 
          : platform === 'facebook' 
          ? '/facebook' 
          : platform === 'linkedin' 
          ? '/linkedin' 
          : '/instagram';
        navigate(entryPath, {
          replace: true,
          state: {
            resetPlatform: platform,
            resetTimestamp: Date.now()
          }
        });
      }

      console.log(`[ResetPlatformState] ✅ Platform reset completed successfully for ${platform}`);
      return true;

    } catch (error) {
      console.error(`[ResetPlatformState] ❌ Platform reset failed:`, error);
      return false;
    }
  }, [currentUser, checkActiveCampaign, stopActiveCampaign, clearPlatformLocalStorage, clearPlatformSessionStorage, clearSessionManagerData, performBackendReset, verifyBackendProcessingCleared, preventBackNavigation, navigate, refreshPlatforms]);

  /**
   * Quick reset function for immediate use (with sensible defaults)
   */
  const quickReset = useCallback(async (platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin', username: string): Promise<boolean> => {
    return resetPlatformState({
      platform,
      username,
      navigateToMain: true,
      clearBrowserHistory: true
    });
  }, [resetPlatformState]);

  /**
   * Reset platform and clear disconnected flags (for allowing future reconnection)
   * 🔥 BULLETPROOF: This ensures main dashboard status updates immediately
   */
  const resetAndAllowReconnection = useCallback(async (platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin', username: string): Promise<boolean> => {
    if (!currentUser?.uid) return false;

    console.log(`[ResetPlatformState] 🔄 Starting bulletproof reset for ${platform} with reconnection capability`);

    // First perform the standard reset (which now includes context resets)
    const resetSuccess = await resetPlatformState({
      platform,
      username,
      navigateToMain: true,
      clearBrowserHistory: true
    });

    // Then clear disconnected flags to allow immediate reconnection
    if (resetSuccess) {
      console.log(`[ResetPlatformState] 🔄 Clearing disconnected flags for ${platform}`);
      
      switch (platform) {
        case 'instagram':
          resetInstagramDisconnectedFlag(currentUser.uid);
          break;
        case 'twitter':
          resetTwitterDisconnectedFlag(currentUser.uid);
          break;
        case 'facebook':
          resetFacebookDisconnectedFlag(currentUser.uid);
          break;
      }
      
      console.log(`[ResetPlatformState] ✅ Platform ${platform} reset completed - ready for reconnection!`);
    }

    return resetSuccess;
  }, [currentUser, resetPlatformState]);

  return {
    resetPlatformState,
    quickReset,
    resetAndAllowReconnection,
    clearPlatformLocalStorage,
    clearPlatformSessionStorage,
    clearSessionManagerData,
    checkActiveCampaign,
    stopActiveCampaign
  };
};

export default useResetPlatformState;
