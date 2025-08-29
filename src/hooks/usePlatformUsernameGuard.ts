import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Critical platform-username validation hook
 * Prevents API calls with wrong usernames during platform switching
 */
export const usePlatformUsernameGuard = (accountHolder: string) => {
  const location = useLocation();
  const { currentUser } = useAuth();

  const validatePlatformUsername = (): { isValid: boolean; expectedUsername: string; currentPlatform: string } => {
    if (!currentUser?.uid || !accountHolder) {
      return { isValid: false, expectedUsername: '', currentPlatform: 'instagram' };
    }

    // Determine current platform from URL
    const currentPlatform = location.pathname.includes('twitter') ? 'twitter' : 
                           location.pathname.includes('facebook') ? 'facebook' : 'instagram';
    
    // Get expected username for current platform
    const expectedUsername = localStorage.getItem(`${currentPlatform}_username_${currentUser.uid}`) || '';
    
    // Validate accountHolder matches expected username
    const isValid = accountHolder === expectedUsername && expectedUsername !== '';
    
    if (!isValid) {
      console.error(`[PlatformUsernameGuard] ❌ BLOCKED: Using wrong username "${accountHolder}" for ${currentPlatform}, expected "${expectedUsername}"`);
    }
    
    return { isValid, expectedUsername, currentPlatform };
  };

  return { validatePlatformUsername };
};
