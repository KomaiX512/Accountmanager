import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogle, signInWithEmailPassword, registerWithEmailPassword, resetPassword, sendVerificationEmail, checkEmailVerified, logoutUser, auth } from '../firebase/config';
import { clearInstagramConnection, disconnectInstagramAccount } from '../utils/instagramSessionManager';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendFirebaseVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  resendFirebaseVerificationEmail: () => Promise<void>;
  clearError: () => void;
  // ✅ CROSS-DEVICE LOADING STATE VALIDATION
  checkLoadingStateForPlatform: (platform: string) => Promise<{ hasLoadingState: boolean; redirectTo?: string; remainingMinutes?: number }>;
  syncProcessingStatusFromBackend: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes with optimized initial load
  useEffect(() => {
    // Check for persisted auth state first for faster initial load
    const checkPersistedAuth = async () => {
      try {
        // Firebase might have cached auth state, check immediately
        if (auth.currentUser) {
          setCurrentUser(auth.currentUser);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error checking persisted auth:', error);
      }
    };

    checkPersistedAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);
      
      // ✅ CRITICAL: Sync processing statuses when user authentication changes
      if (user?.uid) {
        try {
          console.log(`[AUTH] 🔄 User authenticated, syncing processing statuses for ${user.uid}`);
          // Add small delay to allow Firebase to fully initialize
          setTimeout(async () => {
            try {
              await syncProcessingStatusFromBackend();
            } catch (error) {
              console.warn(`[AUTH] Failed to sync processing statuses after auth:`, error);
            }
          }, 1000);
        } catch (error) {
          console.warn(`[AUTH] Error during post-auth sync:`, error);
        }
      }
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  // ✅ WINDOW FOCUS SYNC: Re-sync processing statuses when window regains focus
  useEffect(() => {
    if (!currentUser?.uid) return;

    const handleWindowFocus = async () => {
      try {
        console.log(`[AUTH] 🔄 Window focus detected, syncing processing statuses`);
        await syncProcessingStatusFromBackend();
      } catch (error) {
        console.warn(`[AUTH] Failed to sync processing statuses on window focus:`, error);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [currentUser?.uid]);

  const signIn = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailPassword(email, password);
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with email/password');
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await registerWithEmailPassword(email, password, displayName);
      // Temporarily allow immediate access after sign up (no email verification enforcement)
      // if (user && !user.emailVerified) {
      //   await logoutUser();
      // }
    } catch (error: any) {
      setError(error.message || 'Failed to sign up with email/password');
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
    } catch (error: any) {
      setError(error.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const sendFirebaseVerificationEmail = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await sendVerificationEmail();
    } catch (error: any) {
      setError(error.message || 'Failed to send verification email');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    try {
      return await checkEmailVerified();
    } catch (error: any) {
      console.error('Error checking email verification:', error);
      return false;
    }
  };

  const resendFirebaseVerificationEmail = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await sendVerificationEmail();
    } catch (error: any) {
      setError(error.message || 'Failed to resend verification email');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Clear Instagram session data before logging out
      if (currentUser?.uid) {
        console.log(`[${new Date().toISOString()}] Clearing Instagram connection data for user ${currentUser.uid} during logout`);
        
        try {
          // First try to disconnect from backend
          await disconnectInstagramAccount(currentUser.uid);
        } catch (disconnectError) {
          console.error(`[${new Date().toISOString()}] Error during Instagram disconnect:`, disconnectError);
          // Continue with logout even if Instagram disconnect fails
          
          // Still clear local storage
          clearInstagramConnection(currentUser.uid);
        }
      }
      
      // Proceed with Firebase logout
      await logoutUser();
    } catch (error: any) {
      setError(error.message || 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  const clearError = (): void => {
    setError(null);
  };

  // ✅ CROSS-DEVICE LOADING STATE VALIDATION - Core authentication-level protection
  const checkLoadingStateForPlatform = async (platform: string): Promise<{ hasLoadingState: boolean; redirectTo?: string; remainingMinutes?: number }> => {
    if (!currentUser?.uid) {
      return { hasLoadingState: false };
    }

    const platformsAllowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platformsAllowed.includes(platform)) {
      return { hasLoadingState: false };
    }

    try {
      console.log(`[AUTH GUARD] 🔍 Checking loading state for ${platform} (user: ${currentUser.uid})`);

      // Step 1: Check backend processing status first (source of truth)
      const backendResponse = await fetch(`/api/processing-status/${currentUser.uid}?platform=${platform}`);
      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        const processingData = backendData?.data;
        
        if (processingData && typeof processingData.endTime === 'number') {
          const now = Date.now();
          const remainingMs = processingData.endTime - now;
          
          if (remainingMs > 0) {
            const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
            console.log(`[AUTH GUARD] ⚠️ Backend loading state found for ${platform}: ${remainingMinutes}min remaining`);
            
            // Sync backend state to localStorage for consistency
            localStorage.setItem(`${platform}_processing_countdown`, processingData.endTime.toString());
            localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
              platform,
              username: processingData.username || '',
              startTime: processingData.startTime,
              endTime: processingData.endTime,
              totalDuration: processingData.totalDuration,
              syncedFromBackend: true
            }));
            
            return {
              hasLoadingState: true,
              redirectTo: `/processing/${platform}`,
              remainingMinutes
            };
          } else {
            console.log(`[AUTH GUARD] ✅ Backend loading state expired for ${platform}, clearing`);
            // Clear expired backend state
            try {
              await fetch(`/api/processing-status/${currentUser.uid}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform })
              });
            } catch (e) {
              console.warn(`[AUTH GUARD] Failed to clear expired backend state for ${platform}:`, e);
            }
          }
        }
      }

      // Step 2: Check local state as fallback
      const localCountdown = localStorage.getItem(`${platform}_processing_countdown`);
      const localInfo = localStorage.getItem(`${platform}_processing_info`);
      
      if (localCountdown && localInfo) {
        try {
          const endTime = parseInt(localCountdown);
          const info = JSON.parse(localInfo);
          const now = Date.now();
          const remainingMs = endTime - now;
          
          if (remainingMs > 0 && info.platform === platform) {
            const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
            console.log(`[AUTH GUARD] ⚠️ Local loading state found for ${platform}: ${remainingMinutes}min remaining`);
            
            // Persist local state to backend for cross-device sync
            try {
              await fetch(`/api/processing-status/${currentUser.uid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  platform,
                  startTime: info.startTime || now,
                  endTime,
                  totalDuration: info.totalDuration || (remainingMs),
                  username: info.username || ''
                })
              });
              console.log(`[AUTH GUARD] 🔄 Synced local loading state to backend for ${platform}`);
            } catch (e) {
              console.warn(`[AUTH GUARD] Failed to sync local state to backend for ${platform}:`, e);
            }
            
            return {
              hasLoadingState: true,
              redirectTo: `/processing/${platform}`,
              remainingMinutes
            };
          } else if (remainingMs <= 0) {
            console.log(`[AUTH GUARD] ✅ Local loading state expired for ${platform}, clearing`);
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
          }
        } catch (parseError) {
          console.warn(`[AUTH GUARD] Error parsing local loading state for ${platform}:`, parseError);
          localStorage.removeItem(`${platform}_processing_countdown`);
          localStorage.removeItem(`${platform}_processing_info`);
        }
      }

      // Step 3: Check if platform is completed (never show loading again)
      const completedPlatforms = localStorage.getItem('completedPlatforms');
      if (completedPlatforms) {
        try {
          const completed = JSON.parse(completedPlatforms);
          if (Array.isArray(completed) && completed.includes(platform)) {
            console.log(`[AUTH GUARD] ✅ Platform ${platform} already completed, no loading state needed`);
            return { hasLoadingState: false };
          }
        } catch (e) {
          console.warn(`[AUTH GUARD] Error parsing completed platforms:`, e);
        }
      }

      console.log(`[AUTH GUARD] ✅ No active loading state found for ${platform}`);
      return { hasLoadingState: false };

    } catch (error) {
      console.error(`[AUTH GUARD] Error checking loading state for ${platform}:`, error);
      return { hasLoadingState: false };
    }
  };

  // ✅ SYNC PROCESSING STATUS FROM BACKEND - Force synchronization of all platform states
  const syncProcessingStatusFromBackend = async (): Promise<void> => {
    if (!currentUser?.uid) return;

    try {
      console.log(`[AUTH SYNC] 🔄 Syncing all processing statuses from backend for user ${currentUser.uid}`);
      
      // Add timeout and better error handling for the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`/api/processing-status/${currentUser.uid}`, {
        signal: controller.signal,
        cache: 'no-cache'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`[AUTH SYNC] Failed to fetch processing statuses: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      const processingStates = data?.data || {};
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      const now = Date.now();

      for (const platform of platforms) {
        const state = processingStates[platform];
        
        if (state && typeof state.endTime === 'number') {
          const remainingMs = state.endTime - now;
          
          if (remainingMs > 0) {
            // Active loading state - sync to localStorage
            localStorage.setItem(`${platform}_processing_countdown`, state.endTime.toString());
            localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
              platform,
              username: state.username || '',
              startTime: state.startTime,
              endTime: state.endTime,
              totalDuration: state.totalDuration,
              syncedFromBackend: true
            }));
            console.log(`[AUTH SYNC] ✅ Synced active loading state for ${platform}: ${Math.ceil(remainingMs / 1000 / 60)}min remaining`);
          } else {
            // Expired state - clear local only; let server handle backend cleanup authoritatively
            console.log(`[AUTH SYNC] 🧹 Clearing expired LOCAL loading state for ${platform} (no backend DELETE to avoid cross-device races)`);
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
          }
        } else {
          // No backend state - check if we have stale local state to clear
          const localCountdown = localStorage.getItem(`${platform}_processing_countdown`);
          const localInfo = localStorage.getItem(`${platform}_processing_info`);
          
          if (localCountdown || localInfo) {
            console.log(`[AUTH SYNC] 🧹 Clearing stale local loading state for ${platform}`);
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
          }
        }
      }

      console.log(`[AUTH SYNC] ✅ Processing status sync completed`);
    } catch (error: any) {
      // Handle specific error types more gracefully
      if (error.name === 'AbortError') {
        console.warn(`[AUTH SYNC] ⏱️ Processing status sync timed out - continuing without sync`);
      } else if (error.message?.includes('NetworkError')) {
        console.warn(`[AUTH SYNC] 🌐 Network error during processing status sync - will retry later`);
      } else {
        console.error(`[AUTH SYNC] Error syncing processing statuses:`, error.message || error);
      }
    }
  };

  const value = {
    currentUser,
    loading,
    error,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    sendFirebaseVerificationEmail,
    checkEmailVerification,
    resendFirebaseVerificationEmail,
    signOut,
    clearError,
    checkLoadingStateForPlatform,
    syncProcessingStatusFromBackend
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext; 