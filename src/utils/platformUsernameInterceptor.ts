import axios from 'axios';

/**
 * Global axios interceptor to prevent cross-platform username contamination
 * Blocks API calls with wrong usernames before they reach the server
 */
export const setupPlatformUsernameInterceptor = () => {
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
