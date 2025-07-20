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
}

const AcquiredPlatformsContext = createContext<AcquiredPlatformsContextType>({
  acquiredPlatforms: [],
  isLoading: true,
  refreshPlatforms: () => {}
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
      console.log('[AcquiredPlatforms] No current user, clearing platforms');
      setAcquiredPlatforms([]);
      setIsLoading(false);
      return;
    }

    console.log('[AcquiredPlatforms] Refreshing platforms for user:', currentUser.uid);
    const platforms: PlatformInfo[] = [];
    
    // Check Instagram access
    const instagramAccessed = hasAccessedInstagram || 
      localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
    
    console.log('[AcquiredPlatforms] Instagram check:', {
      hasAccessedInstagram,
      localStorage: localStorage.getItem(`instagram_accessed_${currentUser.uid}`),
      final: instagramAccessed
    });
    
    if (instagramAccessed) {
      platforms.push({
        id: 'instagram',
        name: 'Instagram',
        icon: '/icons/instagram.svg',
        route: 'dashboard'
      });
    }
    
    // Check Twitter access
    const twitterAccessed = hasAccessedTwitter || 
      localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
    
    console.log('[AcquiredPlatforms] Twitter check:', {
      hasAccessedTwitter,
      localStorage: localStorage.getItem(`twitter_accessed_${currentUser.uid}`),
      final: twitterAccessed
    });
    
    if (twitterAccessed) {
      platforms.push({
        id: 'twitter',
        name: 'Twitter',
        icon: '/icons/twitter.svg',
        route: 'twitter-dashboard'
      });
    }
    
    // Check Facebook access
    const facebookAccessed = hasAccessedFacebook || 
      localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
    
    console.log('[AcquiredPlatforms] Facebook check:', {
      hasAccessedFacebook,
      localStorage: localStorage.getItem(`facebook_accessed_${currentUser.uid}`),
      final: facebookAccessed
    });
    
    if (facebookAccessed) {
      platforms.push({
        id: 'facebook',
        name: 'Facebook',
        icon: '/icons/facebook.svg',
        route: 'facebook-dashboard'
      });
    }
    
    // Check LinkedIn access
    const linkedinAccessed = 
      localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true';
    
    console.log('[AcquiredPlatforms] LinkedIn check:', {
      localStorage: localStorage.getItem(`linkedin_accessed_${currentUser.uid}`),
      final: linkedinAccessed
    });
    
    if (linkedinAccessed) {
      platforms.push({
        id: 'linkedin',
        name: 'LinkedIn',
        icon: '/icons/linkedin.svg',
        route: 'linkedin-dashboard'
      });
    }
    
    console.log('[AcquiredPlatforms] Final platforms:', platforms);
    setAcquiredPlatforms(platforms);
    setIsLoading(false);
  };

  // Get acquired platforms on component mount and when auth/platform states change
  useEffect(() => {
    refreshPlatforms();
  }, [currentUser, hasAccessedInstagram, hasAccessedTwitter, hasAccessedFacebook]);

  return (
    <AcquiredPlatformsContext.Provider value={{ 
      acquiredPlatforms, 
      isLoading,
      refreshPlatforms
    }}>
      {children}
    </AcquiredPlatformsContext.Provider>
  );
};

export default AcquiredPlatformsProvider;
