import axios from 'axios';

// 🔒 BULLETPROOF USERNAME PROTECTION: Enhanced platform username interceptor
// This prevents username corruption during platform switches and loading states

let isInterceptorActive = false;

export const setupPlatformUsernameInterceptor = () => {
  if (isInterceptorActive) {
    console.log('🔒 Platform username interceptor already active');
    return;
  }

  console.log('🔒 Setting up bulletproof platform username interceptor');

  // Intercept localStorage operations to prevent username corruption
  const originalSetItem = localStorage.setItem;
  const originalRemoveItem = localStorage.removeItem;

  // 🔒 PROTECT USERNAME KEYS: Prevent overwriting of locked usernames
  localStorage.setItem = function(key: string, value: string) {
    try {
      // Check if this is a username-related key that should be protected
      if (key.includes('_username_') && !key.includes('_username_lock_')) {
        const platform = key.split('_')[0]; // Extract platform from key
        const username = value;
        
        // Check if there's a locked username that should be preserved
        const processingInfo = localStorage.getItem(`${platform}_processing_info`);
        if (processingInfo) {
          const info = JSON.parse(processingInfo);
          if (info.usernameLocked === true && info.username && info.username.trim()) {
            const lockedUsername = info.username.trim();
            
            // If trying to overwrite a locked username, prevent it
            if (username !== lockedUsername) {
              console.log(`🚫 USERNAME OVERWRITE BLOCKED: Cannot overwrite locked username '${lockedUsername}' with '${username}' for ${platform}`);
              console.log(`🔒 PRESERVING LOCKED USERNAME: Keeping '${lockedUsername}' for ${platform}`);
              return; // Block the overwrite
            }
          }
        }
        
        // Check for dedicated username locks
        const allKeys = Object.keys(localStorage);
        const lockKeys = allKeys.filter(k => k.startsWith(`${platform}_username_lock_`));
        
        for (const lockKey of lockKeys) {
          try {
            const lockData = localStorage.getItem(lockKey);
            if (lockData) {
              const lock = JSON.parse(lockData);
              if (lock.immutable === true && lock.username && lock.username.trim()) {
                const lockedUsername = lock.username.trim();
                
                // If trying to overwrite an immutable username, prevent it
                if (username !== lockedUsername) {
                  console.log(`🚫 USERNAME OVERWRITE BLOCKED: Cannot overwrite immutable username '${lockedUsername}' with '${username}' for ${platform}`);
                  console.log(`🔒 PRESERVING IMMUTABLE USERNAME: Keeping '${lockedUsername}' for ${platform}`);
                  return; // Block the overwrite
                }
              }
            }
          } catch (err) {
            console.warn('Could not parse lock data:', err);
          }
        }
      }
      
      // Allow the operation to proceed
      originalSetItem.call(this, key, value);
    } catch (error) {
      console.error('Error in username interceptor:', error);
      // Fallback to original behavior
      originalSetItem.call(this, key, value);
    }
  };

  // 🔒 PROTECT USERNAME REMOVAL: Prevent removal of locked usernames
  localStorage.removeItem = function(key: string) {
    try {
      // Check if this is a username-related key that should be protected
      if (key.includes('_username_') && !key.includes('_username_lock_')) {
        const platform = key.split('_')[0]; // Extract platform from key
        
        // Check if there's a locked username that should be preserved
        const processingInfo = localStorage.getItem(`${platform}_processing_info`);
        if (processingInfo) {
          const info = JSON.parse(processingInfo);
          if (info.usernameLocked === true && info.username && info.username.trim()) {
            console.log(`🚫 USERNAME REMOVAL BLOCKED: Cannot remove locked username '${info.username}' for ${platform}`);
            console.log(`🔒 PRESERVING LOCKED USERNAME: Keeping '${info.username}' for ${platform}`);
            return; // Block the removal
          }
        }
        
        // Check for dedicated username locks
        const allKeys = Object.keys(localStorage);
        const lockKeys = allKeys.filter(k => k.startsWith(`${platform}_username_lock_`));
        
        for (const lockKey of lockKeys) {
          try {
            const lockData = localStorage.getItem(lockKey);
            if (lockData) {
              const lock = JSON.parse(lockData);
              if (lock.immutable === true && lock.username && lock.username.trim()) {
                console.log(`🚫 USERNAME REMOVAL BLOCKED: Cannot remove immutable username '${lock.username}' for ${platform}`);
                console.log(`🔒 PRESERVING IMMUTABLE USERNAME: Keeping '${lock.username}' for ${platform}`);
                return; // Block the removal
              }
            }
          } catch (err) {
            console.warn('Could not parse lock data:', err);
          }
        }
      }
      
      // Allow the operation to proceed
      originalRemoveItem.call(this, key);
    } catch (error) {
      console.error('Error in username interceptor:', error);
      // Fallback to original behavior
      originalRemoveItem.call(this, key);
    }
  };

  isInterceptorActive = true;
  console.log('🔒 Bulletproof platform username interceptor activated');
};

// 🔒 UTILITY FUNCTIONS: Helper functions for username protection
export const isUsernameProtected = (platform: string, username: string): boolean => {
  try {
    // Check processing info lock
    const processingInfo = localStorage.getItem(`${platform}_processing_info`);
    if (processingInfo) {
      const info = JSON.parse(processingInfo);
      if (info.usernameLocked === true && info.username === username) {
        return true;
      }
    }
    
    // Check dedicated username lock
    const usernameLock = localStorage.getItem(`${platform}_username_lock_${username}`);
    if (usernameLock) {
      const lock = JSON.parse(usernameLock);
      if (lock.immutable === true && lock.platform === platform) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('Error checking username protection:', err);
    return false;
  }
};

export const getProtectedUsername = (platform: string): string | null => {
  try {
    // Check processing info for locked username
    const processingInfo = localStorage.getItem(`${platform}_processing_info`);
    if (processingInfo) {
      const info = JSON.parse(processingInfo);
      if (info.usernameLocked === true && info.username && info.username.trim()) {
        return info.username.trim();
      }
    }
    
    // Check for dedicated username locks
    const allKeys = Object.keys(localStorage);
    const lockKeys = allKeys.filter(key => key.startsWith(`${platform}_username_lock_`));
    
    for (const lockKey of lockKeys) {
      try {
        const lockData = localStorage.getItem(lockKey);
        if (lockData) {
          const lock = JSON.parse(lockData);
          if (lock.immutable === true && lock.username && lock.username.trim()) {
            return lock.username.trim();
          }
        }
      } catch (err) {
        console.warn('Could not parse lock data:', err);
      }
    }
    
    return null;
  } catch (err) {
    console.error('Error getting protected username:', err);
    return null;
  }
};

/**
 * Global axios interceptor to prevent cross-platform username contamination
 * Blocks API calls with wrong usernames before they reach the server
 */
export const setupAxiosInterceptor = () => {
  // Add request interceptor
  axios.interceptors.request.use(
    (config) => {
      const url = config.url || '';
      
      // Extract username and platform from API calls
      const usernameMatch = url.match(/\/api\/(?:retrieve-strategies|profile-info|posts|responses|news-for-you|retrieve-multiple|retrieve-engagement-strategies|list-competitors|rag\/conversations)\/([^/?&]+)/);
      const platformMatch = url.match(/[?&]platform=([^&]+)/);
      
      if (usernameMatch && platformMatch) {
        const apiUsername = decodeURIComponent(usernameMatch[1]);
        const apiPlatform = platformMatch[1];
        
        // Get current platform from URL
        const currentPath = window.location.pathname;
        const currentPlatform = currentPath.includes('twitter') ? 'twitter' : 
                               currentPath.includes('facebook') ? 'facebook' : 'instagram';
        
        // Only validate if API platform matches current platform
        if (apiPlatform === currentPlatform) {
          // Get user ID from Firebase auth
          const authUserString = localStorage.getItem('firebase:authUser:AIzaSyDlU_-gNGfcF4-W9zUZKHy1rr7v9VEXZRM:[DEFAULT]');
          let uid = '';
          if (authUserString) {
            try {
              const authUser = JSON.parse(authUserString);
              uid = authUser.uid;
            } catch {}
          }
          
          // Get expected username for current platform
          const expectedUsername = localStorage.getItem(`${currentPlatform}_username_${uid}`) || '';
          
          // Block API call if username doesn't match
          if (expectedUsername && apiUsername !== expectedUsername) {
            console.error(`🚫 AXIOS INTERCEPTOR BLOCKED: ${url}`);
            console.error(`   Platform: ${currentPlatform}`);
            console.error(`   Wrong username: "${apiUsername}"`);
            console.error(`   Expected: "${expectedUsername}"`);
            
            // Return rejected promise to block the request
            return Promise.reject(new Error(`Username mismatch: using ${apiUsername} instead of ${expectedUsername} for ${currentPlatform}`));
          }
          
          console.log(`✅ AXIOS INTERCEPTOR VALIDATED: ${apiPlatform}/${apiUsername}`);
        }
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
  
  console.log('🛡️ Platform username interceptor activated');
};
