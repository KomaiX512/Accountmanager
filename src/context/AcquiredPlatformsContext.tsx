import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useInstagram } from './InstagramContext';
import { useTwitter } from './TwitterContext';
import { useFacebook } from './FacebookContext';

export interface PlatformInfo {
  id: string;
  name: string;
  icon: string;
  route: string;
  isActive?: boolean;
}

interface AcquiredPlatformsContextType {
  acquiredPlatforms: PlatformInfo[];
  isLoading: boolean;
  refreshPlatforms: () => void;
  markPlatformAsAcquired: (platformId: string) => void;
}

const AcquiredPlatformsContext = createContext<AcquiredPlatformsContextType>({
  acquiredPlatforms: [],
  isLoading: true,
  refreshPlatforms: () => {},
  markPlatformAsAcquired: () => {}
});

export const useAcquiredPlatforms = () => useContext(AcquiredPlatformsContext);

export const AcquiredPlatformsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [acquiredPlatforms, setAcquiredPlatforms] = useState<PlatformInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentUser } = useAuth();
  const { hasAccessed: hasAccessedInstagram } = useInstagram();
  const { hasAccessed: hasAccessedTwitter } = useTwitter();
  const { hasAccessed: hasAccessedFacebook } = useFacebook();

  const refreshPlatforms = () => {
    if (!currentUser?.uid) {
      setAcquiredPlatforms([]);
      setIsLoading(false);
      return;
    }

    const platforms: PlatformInfo[] = [];
    
    // Get consolidated list as backup
    const consolidatedList = JSON.parse(
      localStorage.getItem(`acquired_platforms_${currentUser.uid}`) || 
      sessionStorage.getItem(`acquired_platforms_${currentUser.uid}`) || 
      '[]'
    );
    
    // PERMANENT STORAGE: Check localStorage first (most reliable)
    // Instagram access - prioritize localStorage for persistence
    const instagramAccessed = 
      localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true' || 
      sessionStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true' ||
      consolidatedList.includes('instagram') ||
      hasAccessedInstagram;
    
    if (instagramAccessed) {
      // Ensure the localStorage is set for future persistence
      localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
      sessionStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
      platforms.push({
        id: 'instagram',
        name: 'Instagram',
        icon: '/icons/instagram.svg',
        route: 'dashboard'
      });
    }
    
    // Twitter access - prioritize localStorage for persistence
    const twitterAccessed = 
      localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true' || 
      sessionStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true' ||
      consolidatedList.includes('twitter') ||
      hasAccessedTwitter;
    
    if (twitterAccessed) {
      // Ensure the localStorage is set for future persistence
      localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
      sessionStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
      platforms.push({
        id: 'twitter',
        name: 'Twitter',
        icon: '/icons/twitter.svg',
        route: 'twitter-dashboard'
      });
    }
    
    // Facebook access - prioritize localStorage for persistence
    const facebookAccessed = 
      localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true' || 
      sessionStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true' ||
      consolidatedList.includes('facebook') ||
      hasAccessedFacebook;
    
    if (facebookAccessed) {
      // Ensure the localStorage is set for future persistence
      localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
      sessionStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
      platforms.push({
        id: 'facebook',
        name: 'Facebook',
        icon: '/icons/facebook.svg',
        route: 'facebook-dashboard'
      });
    }
    
    // LinkedIn access - only localStorage (no context available)
    const linkedinAccessed = 
      localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true' ||
      sessionStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true' ||
      consolidatedList.includes('linkedin');
    
    if (linkedinAccessed) {
      localStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
      sessionStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
      platforms.push({
        id: 'linkedin',
        name: 'LinkedIn',
        icon: '/icons/linkedin.svg',
        route: 'linkedin-dashboard'
      });
    }
    
    setAcquiredPlatforms(platforms);
    setIsLoading(false);
  };

  // Initial load - check immediately when user is available
  useEffect(() => {
    if (currentUser?.uid) {
      refreshPlatforms();
    } else {
      setAcquiredPlatforms([]);
      setIsLoading(false);
    }
  }, [currentUser?.uid]);

  // Secondary check - when context hooks update (but don't overwrite if localStorage already has data)
  useEffect(() => {
    if (currentUser?.uid) {
      refreshPlatforms();
    }
  }, [hasAccessedInstagram, hasAccessedTwitter, hasAccessedFacebook]);

  // Listen for localStorage changes (cross-tab synchronization)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (currentUser?.uid && e.key && e.key.includes('_accessed_') && e.key.includes(currentUser.uid)) {
        console.log('[AcquiredPlatforms] Storage change detected, refreshing platforms');
        refreshPlatforms();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUser?.uid]);

  // Backup check every 30 seconds to ensure platforms are always visible
  useEffect(() => {
    if (!currentUser?.uid) return;

    const interval = setInterval(() => {
      // Only refresh if we have no acquired platforms but should have some
      if (acquiredPlatforms.length === 0) {
        const hasAnyAccessed = ['instagram', 'twitter', 'facebook', 'linkedin'].some(
          platform => localStorage.getItem(`${platform}_accessed_${currentUser.uid}`) === 'true'
        );
        
        if (hasAnyAccessed) {
          console.log('[AcquiredPlatforms] Backup check: refreshing platforms');
          refreshPlatforms();
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [currentUser?.uid, acquiredPlatforms.length]);

  // Utility function to mark a platform as acquired permanently
  const markPlatformAsAcquired = (platformId: string) => {
    if (!currentUser?.uid) return;
    
    // Set in both localStorage and sessionStorage for extra persistence
    localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    sessionStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    
    // Also store a consolidated list for faster lookup
    const currentAcquired = JSON.parse(localStorage.getItem(`acquired_platforms_${currentUser.uid}`) || '[]');
    if (!currentAcquired.includes(platformId)) {
      currentAcquired.push(platformId);
      localStorage.setItem(`acquired_platforms_${currentUser.uid}`, JSON.stringify(currentAcquired));
      sessionStorage.setItem(`acquired_platforms_${currentUser.uid}`, JSON.stringify(currentAcquired));
    }
    
    // Immediately refresh the platforms list
    refreshPlatforms();
  };

  return (
    <AcquiredPlatformsContext.Provider value={{ 
      acquiredPlatforms, 
      isLoading,
      refreshPlatforms,
      markPlatformAsAcquired
    }}>
      {children}
    </AcquiredPlatformsContext.Provider>
  );
};

export default AcquiredPlatformsProvider;
