// Auto-initialize platform access for authenticated users
// This script should be run once to restore platform access after a reset

import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export const useAutoInitializePlatforms = () => {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.uid) return;

    const userId = currentUser.uid;
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    
    // Check if platforms are already initialized
    const isInitialized = localStorage.getItem(`platforms_initialized_${userId}`) === 'true';
    
    if (!isInitialized) {
      console.log('[Platform Auto-Init] Initializing platforms for user:', userId);
      
      // Set all platform access to true (restore after reset)
      platforms.forEach(platform => {
        const key = `${platform}_accessed_${userId}`;
        localStorage.setItem(key, 'true');
        console.log(`✅ Auto-initialized ${platform} access`);
      });
      
      // Mark as initialized to prevent re-running
      localStorage.setItem(`platforms_initialized_${userId}`, 'true');
      
      console.log('🚀 Platform initialization complete! Reloading to apply changes...');
      
      // Reload to trigger the AcquiredPlatformsContext refresh
      setTimeout(() => window.location.reload(), 500);
    }
  }, [currentUser]);
};

// Export a one-time initialization function for manual use
export const initializePlatformsForUser = (userId: string) => {
  const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
  
  console.log('[Manual Init] Setting platform access for user:', userId);
  
  platforms.forEach(platform => {
    const key = `${platform}_accessed_${userId}`;
    localStorage.setItem(key, 'true');
    console.log(`✅ Set ${platform} access = true`);
  });
  
  localStorage.setItem(`platforms_initialized_${userId}`, 'true');
  console.log('🚀 Manual platform initialization complete!');
  
  return true;
};
