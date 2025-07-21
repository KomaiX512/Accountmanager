import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useInstagram } from '../context/InstagramContext';
import { useTwitter } from '../context/TwitterContext';
import { useFacebook } from '../context/FacebookContext';

/**
 * Hook for getting platform acquisition status directly matching MainDashboard logic
 * This is the simple, reliable approach the user requested
 */
export const usePlatformStatus = () => {
  const { currentUser } = useAuth();
  const { hasAccessed: hasAccessedInstagram, isConnected: isInstagramConnected, userId: instagramUserId } = useInstagram();
  const { hasAccessed: hasAccessedTwitter, isConnected: isTwitterConnected, userId: twitterUserId } = useTwitter();
  const { hasAccessed: hasAccessedFacebook, isConnected: isFacebookConnected, userId: facebookUserId } = useFacebook();

  // ✅ EXACT SAME LOGIC AS MAINDASHBOARD - Platform access status
  const getPlatformAccessStatus = useCallback((platformId: string): boolean => {
    if (!currentUser?.uid) return false;
    
    // Check localStorage for platform access (fallback)
    const accessedFromStorage = localStorage.getItem(`${platformId}_accessed_${currentUser.uid}`) === 'true';
    
    // Check context status for platforms that have it (fallback)
    let accessedFromContext = false;
    if (platformId === 'instagram') accessedFromContext = hasAccessedInstagram;
    if (platformId === 'twitter') accessedFromContext = hasAccessedTwitter;
    if (platformId === 'facebook') accessedFromContext = hasAccessedFacebook;
    
    // If either localStorage or context shows accessed, return true
    return accessedFromStorage || accessedFromContext;
  }, [currentUser?.uid, hasAccessedInstagram, hasAccessedTwitter, hasAccessedFacebook]);

  // ✅ EXACT SAME LOGIC AS MAINDASHBOARD - Platform connection status
  const getPlatformConnectionStatus = useCallback((platformId: string): boolean => {
    switch (platformId) {
      case 'instagram':
        return isInstagramConnected && Boolean(instagramUserId);
      case 'twitter':
        return isTwitterConnected && Boolean(twitterUserId);
      case 'facebook':
        return isFacebookConnected && Boolean(facebookUserId);
      case 'linkedin':
        return false; // Not yet implemented
      default:
        return false;
    }
  }, [isInstagramConnected, isTwitterConnected, isFacebookConnected, instagramUserId, twitterUserId, facebookUserId]);

  // ✅ GET ACQUIRED PLATFORMS - Simple logic: claimed = acquired
  const getAcquiredPlatforms = useCallback(() => {
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    return platforms.filter(platform => getPlatformAccessStatus(platform));
  }, [getPlatformAccessStatus]);

  // ✅ IS PLATFORM ACQUIRED - Direct check
  const isPlatformAcquired = useCallback((platformId: string): boolean => {
    return getPlatformAccessStatus(platformId);
  }, [getPlatformAccessStatus]);

  return {
    getAcquiredPlatforms,
    isPlatformAcquired,
    getPlatformAccessStatus,
    getPlatformConnectionStatus
  };
};
