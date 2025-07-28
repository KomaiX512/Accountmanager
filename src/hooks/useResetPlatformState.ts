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
  platform: 'instagram' | 'twitter' | 'facebook';
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
    }
  }, [resetInstagramAccess, resetTwitterAccess, resetFacebookAccess]);

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

      // Step 2: Call backend reset API
      const backendSuccess = await performBackendReset(platform, userId);
      if (!backendSuccess) {
        console.warn('[ResetPlatformState] ⚠️ Backend reset failed, but continuing with frontend reset');
      }

      // Step 3: Prevent back navigation if requested
      if (clearBrowserHistory) {
        preventBackNavigation();
      }

      // Step 4: Navigate to main dashboard if requested
      if (navigateToMain) {
        console.log(`[ResetPlatformState] 🧭 Navigating to main dashboard`);
        
        // Use replace to prevent the reset dashboard from appearing in history
        navigate('/account', { 
          replace: true,
          state: { 
            resetPlatform: platform,
            resetTimestamp: Date.now()
          }
        });
      }

      // Step 5: 🔥 BULLETPROOF FIX - Refresh acquired platforms to update main dashboard status
      refreshPlatforms();
      console.log(`[ResetPlatformState] 🔄 Refreshed acquired platforms - main dashboard will show "not acquired"`);

      console.log(`[ResetPlatformState] ✅ Platform reset completed successfully for ${platform}`);
      return true;

    } catch (error) {
      console.error(`[ResetPlatformState] ❌ Platform reset failed:`, error);
      return false;
    }
  }, [currentUser, checkActiveCampaign, stopActiveCampaign, clearPlatformLocalStorage, clearPlatformSessionStorage, clearSessionManagerData, performBackendReset, preventBackNavigation, navigate, refreshPlatforms]);

  /**
   * Quick reset function for immediate use (with sensible defaults)
   */
  const quickReset = useCallback(async (platform: 'instagram' | 'twitter' | 'facebook', username: string): Promise<boolean> => {
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
  const resetAndAllowReconnection = useCallback(async (platform: 'instagram' | 'twitter' | 'facebook', username: string): Promise<boolean> => {
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
