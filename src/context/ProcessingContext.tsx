import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { safeNavigate } from '../utils/navigationGuard';

interface ProcessingState {
  platform: 'instagram' | 'twitter' | 'facebook' | null;
  username: string | null;
  startTime: number | null;
  duration: number | null; // Duration in milliseconds
  isProcessing: boolean;
}

interface ProcessingContextType {
  processingState: ProcessingState;
  startProcessing: (platform: 'instagram' | 'twitter' | 'facebook', username: string, durationMinutes: number, preventNavigation?: boolean) => void;
  completeProcessing: () => void;
  resetDashboard: (platform: 'instagram' | 'twitter' | 'facebook', username: string) => Promise<boolean>;
  isProcessingActive: boolean;
  // 🔒 BULLETPROOF USERNAME LOCKING: New functions to prevent username corruption
  isUsernameLocked: (platform: string, username: string) => boolean;
  lockUsername: (platform: string, username: string) => boolean;
  unlockUsername: (platform: string, username: string) => boolean;
  validateAndRepairUsername: (platform: string, currentUsername: string) => string;
  preventUsernameOverwrite: (platform: string, newUsername: string) => boolean;
}

const initialProcessingState: ProcessingState = {
  platform: null,
  username: null,
  startTime: null,
  duration: null,
  isProcessing: false,
};

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const useProcessing = () => {
  const context = useContext(ProcessingContext);
  if (context === undefined) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
};

export const ProcessingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [processingState, setProcessingState] = useState<ProcessingState>(initialProcessingState);

  // Helper to migrate legacy keys to the new unified format
  const migrateLegacyState = () => {
    const legacyPlatforms: Array<'instagram' | 'twitter' | 'facebook'> = ['instagram', 'twitter', 'facebook'];

    for (const p of legacyPlatforms) {
      const legacyKey = `${p}_processing_${currentUser?.uid ?? ''}`;
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          const { username, startTime, duration } = parsed;
          // Basic validation
          if (username && startTime && duration) {
            const newState: ProcessingState = {
              platform: p,
              username,
              startTime,
              duration,
              isProcessing: true,
            };
            localStorage.setItem('processingState', JSON.stringify(newState));
            localStorage.removeItem(legacyKey);
            return newState;
          }
        } catch {
          localStorage.removeItem(legacyKey);
        }
      }
    }
    return null;
  };

  // Load state from localStorage on mount
  useEffect(() => {
    const load = () => {
      try {
        const saved = localStorage.getItem('processingState');
        if (saved) {
          const parsed: ProcessingState = JSON.parse(saved);
          if (parsed.isProcessing && parsed.startTime && parsed.duration) {
            const elapsed = Date.now() - parsed.startTime;
            if (elapsed < parsed.duration) {
              return parsed;
            }
          }
          // Invalid or expired saved state
          localStorage.removeItem('processingState');
        }
      } catch {
        localStorage.removeItem('processingState');
      }
      // Try migration
      return migrateLegacyState();
    };

    const restored = load();
    if (restored) {
      setProcessingState(restored);
    }
    setIsLoading(false);
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    if (!isLoading) {
      if (processingState.isProcessing) {
        localStorage.setItem('processingState', JSON.stringify(processingState));
      } else {
        localStorage.removeItem('processingState');
      }
    }
  }, [processingState, isLoading]);


  
  const startProcessing = useCallback((
    platform: 'instagram' | 'twitter' | 'facebook',
    username: string,
    durationMinutes: number,
    preventNavigation?: boolean
  ) => {
    const startTime = Date.now();
    const duration = durationMinutes * 60 * 1000;
    const endTime = startTime + duration;

    // 🔒 BULLETPROOF USERNAME LOCKING: Create immutable username lock
    let finalUsername = username;
    let isUsernameLocked = false;
    
    try {
      // ✅ CRITICAL: Check if there's already a LOCKED username in localStorage
      const existingProcessingInfo = localStorage.getItem(`${platform}_processing_info`);
      if (existingProcessingInfo) {
        const existingInfo = JSON.parse(existingProcessingInfo);
        if (existingInfo.username && existingInfo.username.trim() && existingInfo.usernameLocked === true) {
          console.log(`🔒 LOCKED USERNAME PRESERVED: Username '${existingInfo.username}' is LOCKED for ${platform} - cannot be overwritten`);
          finalUsername = existingInfo.username;
          isUsernameLocked = true;
        } else if (existingInfo.username && existingInfo.username.trim()) {
          console.log(`🔒 PRESERVING EXISTING USERNAME: Keeping existing username '${existingInfo.username}' for ${platform} (not overwriting with '${username}')`);
          finalUsername = existingInfo.username;
          // Mark this username as locked to prevent future overwrites
          isUsernameLocked = true;
        }
      }
      
      // ✅ CRITICAL: If this is a new username, lock it immediately
      if (!isUsernameLocked && username && username.trim()) {
        console.log(`🔒 LOCKING NEW USERNAME: '${username}' is now LOCKED for ${platform} - cannot be overwritten`);
        isUsernameLocked = true;
      }
      
      // ✅ CRITICAL: Create username lock in localStorage to prevent corruption
      if (isUsernameLocked && finalUsername && finalUsername.trim()) {
        localStorage.setItem(`${platform}_username_lock_${finalUsername}`, JSON.stringify({
          platform,
          username: finalUsername,
          lockedAt: startTime,
          lockType: 'processing',
          immutable: true
        }));
        console.log(`🔒 USERNAME LOCK CREATED: '${finalUsername}' is now immutable for ${platform}`);
      }
      
    } catch (err) {
      console.error('Error in username locking system:', err);
      // Even on error, try to preserve the username
      if (username && username.trim()) {
        finalUsername = username;
        isUsernameLocked = true;
      }
    }

    const newState: ProcessingState = {
      platform,
      username: finalUsername, // Use the locked username
      startTime,
      duration,
      isProcessing: true,
    };

    // Remove platform from completedPlatforms to allow processing to run
    try {
      const completedPlatforms = localStorage.getItem('completedPlatforms');
      if (completedPlatforms) {
        const completed = JSON.parse(completedPlatforms);
        const updatedCompleted = completed.filter((p: string) => p !== platform);
        localStorage.setItem('completedPlatforms', JSON.stringify(updatedCompleted));
      }
    } catch (err) {
      console.error('Error updating completedPlatforms:', err);
    }

    // 🔒 BULLETPROOF PERSISTENCE: Store username with lock flag
    try {
      localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
      localStorage.setItem(`${platform}_processing_info`, JSON.stringify({ 
        platform, 
        username: finalUsername, 
        usernameLocked: isUsernameLocked, // 🔒 CRITICAL: Lock flag
        lockTimestamp: startTime,
        startTime, 
        endTime 
      }));
      
      // ✅ CRITICAL: Also store in global processing state with lock info
      localStorage.setItem('processingState', JSON.stringify({
        ...newState,
        usernameLocked: isUsernameLocked,
        lockTimestamp: startTime
      }));
      
    } catch (err) {
      console.error('Error setting processing countdown in localStorage', err);
    }

    // After localStorage persistence but before navigation, persist to backend for cross-device sync
    if (currentUser?.uid) {
      const payload = {
        platform,
        startTime,
        endTime,
        totalDuration: duration,
        username: finalUsername,
        usernameLocked: isUsernameLocked, // 🔒 CRITICAL: Include lock status in backend
        lockTimestamp: startTime
      } as any;
      // Fire-and-forget backend POST to create processing status
      fetch(`/api/processing-status/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(e => console.warn('startProcessing backend status create failed', e));
      // Ensure claimed flag false while processing
      fetch(`/api/platform-access/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, claimed: false, username: finalUsername, usernameLocked: isUsernameLocked })
      }).catch(e => console.warn('startProcessing backend claimed=false failed', e));
    }

    setProcessingState(newState);
    if (!preventNavigation) {
      safeNavigate(navigate, `/processing/${platform}`, { replace: true }, 9); // High priority for processing context
    }
  }, [navigate, currentUser?.uid]);

  // 🔒 BULLETPROOF USERNAME LOCKING: Check if username is locked and prevent overwriting
  const isUsernameLocked = useCallback((platform: string, username: string): boolean => {
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
      
      // Check global processing state lock
      const globalState = localStorage.getItem('processingState');
      if (globalState) {
        const state = JSON.parse(globalState);
        if (state.usernameLocked === true && state.username === username && state.platform === platform) {
          return true;
        }
      }
      
      return false;
    } catch (err) {
      console.error('Error checking username lock status:', err);
      return false;
    }
  }, []);

  // 🔒 BULLETPROOF USERNAME LOCKING: Attempt to lock a username (only if not already locked)
  const lockUsername = useCallback((platform: string, username: string): boolean => {
    try {
      // Check if already locked
      if (isUsernameLocked(platform, username)) {
        console.log(`🔒 USERNAME ALREADY LOCKED: '${username}' is already locked for ${platform}`);
        return true;
      }
      
      // Create new lock
      const lockData = {
        platform,
        username,
        lockedAt: Date.now(),
        lockType: 'manual',
        immutable: true
      };
      
      localStorage.setItem(`${platform}_username_lock_${username}`, JSON.stringify(lockData));
      console.log(`🔒 USERNAME LOCKED: '${username}' is now locked for ${platform}`);
      return true;
    } catch (err) {
      console.error('Error locking username:', err);
      return false;
    }
  }, [isUsernameLocked]);

  // 🔒 BULLETPROOF USERNAME LOCKING: Unlock username (only when processing is complete)
  const unlockUsername = useCallback((platform: string, username: string): boolean => {
    try {
      // Only unlock if processing is complete
      const processingInfo = localStorage.getItem(`${platform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        if (info.username === username && info.usernameLocked === true) {
          // Remove lock flags
          localStorage.removeItem(`${platform}_username_lock_${username}`);
          
          // Update processing info to remove lock
          const updatedInfo = { ...info, usernameLocked: false, lockTimestamp: undefined };
          localStorage.setItem(`${platform}_processing_info`, JSON.stringify(updatedInfo));
          
          console.log(`🔓 USERNAME UNLOCKED: '${username}' is now unlocked for ${platform}`);
          return true;
        }
      }
      
      return false;
    } catch (err) {
      console.error('Error unlocking username:', err);
      return false;
    }
  }, []);

  // 🔒 BULLETPROOF USERNAME VALIDATION: Validate and repair corrupted usernames
  const validateAndRepairUsername = useCallback((platform: string, currentUsername: string): string => {
    try {
      // Check if current username is valid
      if (!currentUsername || typeof currentUsername !== 'string' || !currentUsername.trim()) {
        console.log(`🔧 USERNAME VALIDATION: Invalid username '${currentUsername}' for ${platform}`);
        return '';
      }
      
      const trimmedUsername = currentUsername.trim();
      
      // Check for common corruption patterns
      const isCorrupted = 
        trimmedUsername === 'User' || // Generic fallback
        trimmedUsername === 'undefined' || // Undefined value
        trimmedUsername === 'null' || // Null value
        trimmedUsername === '' || // Empty string
        trimmedUsername.length > 100 || // Suspiciously long
        /^[A-Za-z0-9]{20,}$/.test(trimmedUsername) || // Firebase UID pattern
        trimmedUsername.includes('Sentient') || // Connected Facebook name
        trimmedUsername === 'unknown'; // Unknown value
      
      if (isCorrupted) {
        console.log(`🔧 USERNAME VALIDATION: Corrupted username detected '${trimmedUsername}' for ${platform}`);
        
        // Try to restore from locked username
        try {
          const processingInfo = localStorage.getItem(`${platform}_processing_info`);
          if (processingInfo) {
            const info = JSON.parse(processingInfo);
            if (info.username && info.username.trim() && !isCorrupted) {
              console.log(`🔧 USERNAME REPAIR: Restored locked username '${info.username}' for ${platform}`);
              return info.username.trim();
            }
          }
        } catch (err) {
          console.warn('Could not restore from processing info:', err);
        }
        
        // Try to restore from username lock
        try {
          const allKeys = Object.keys(localStorage);
          const lockKeys = allKeys.filter(key => key.startsWith(`${platform}_username_lock_`));
          
          for (const lockKey of lockKeys) {
            try {
              const lockData = localStorage.getItem(lockKey);
              if (lockData) {
                const lock = JSON.parse(lockData);
                if (lock.username && lock.username.trim() && !isCorrupted) {
                  console.log(`🔧 USERNAME REPAIR: Restored from username lock '${lock.username}' for ${platform}`);
                  return lock.username.trim();
                }
              }
            } catch (err) {
              console.warn('Could not parse lock data:', err);
            }
          }
        } catch (err) {
          console.warn('Could not restore from username locks:', err);
        }
        
        return ''; // Return empty if no valid username found
      }
      
      console.log(`✅ USERNAME VALIDATION: Username '${trimmedUsername}' is valid for ${platform}`);
      return trimmedUsername;
    } catch (err) {
      console.error('Error in username validation:', err);
      return '';
    }
  }, []);

  // 🔒 BULLETPROOF USERNAME PROTECTION: Prevent overwriting during platform switches
  const preventUsernameOverwrite = useCallback((platform: string, newUsername: string): boolean => {
    try {
      // Check if there's an active processing session with a locked username
      const processingInfo = localStorage.getItem(`${platform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        if (info.usernameLocked === true && info.username && info.username.trim()) {
          const lockedUsername = info.username.trim();
          
          // If trying to overwrite a locked username, prevent it
          if (newUsername !== lockedUsername) {
            console.log(`🚫 USERNAME OVERWRITE PREVENTED: Cannot overwrite locked username '${lockedUsername}' with '${newUsername}' for ${platform}`);
            return false; // Prevent overwrite
          }
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
              const lockedUsername = lock.username.trim();
              
              // If trying to overwrite an immutable username, prevent it
              if (newUsername !== lockedUsername) {
                console.log(`🚫 USERNAME OVERWRITE PREVENTED: Cannot overwrite immutable username '${lockedUsername}' with '${newUsername}' for ${platform}`);
                return false; // Prevent overwrite
              }
            }
          }
        } catch (err) {
          console.warn('Could not parse lock data:', err);
        }
      }
      
      console.log(`✅ USERNAME OVERWRITE ALLOWED: '${newUsername}' can be set for ${platform}`);
      return true; // Allow overwrite
    } catch (err) {
      console.error('Error checking username overwrite protection:', err);
      return true; // Allow overwrite on error
    }
  }, []);

  const resetDashboard = useCallback(async (
    platform: 'instagram' | 'twitter' | 'facebook',
    username: string
  ): Promise<boolean> => {
    try {
      // Call backend to reset account info
      const response = await fetch('/api/reset-account-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          platform
        })
      });

      if (!response.ok) {
        throw new Error(`Reset failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Account reset successful:', result);

      // Clear ALL platform-specific localStorage data
      const keysToRemove = [
        'processingState',
        `${platform}_processing_countdown`,
        `${platform}_processing_info`,
        `${platform}_processing_${currentUser?.uid ?? ''}`,
        'completedPlatforms',
        'platformLoadingStates',
        // Clear account info and username data
        `${platform}_accountInfo`,
        `${platform}_username`,
        `${platform}_accountHolder`,
        `saved_${platform}_username`,
        `${platform}_dashboard_data`,
        `${platform}_user_data`,
        // Clear any cached data
        `${platform}_cache`,
        `${platform}_posts_cache`,
        `${platform}_events_cache`
      ];

      // Clear all localStorage keys that might contain platform or username data
      try {
        const allKeys = Object.keys(localStorage);
        const platformLower = platform.toLowerCase();
        const usernameLower = username.toLowerCase();
        
        allKeys.forEach(key => {
          const keyLower = key.toLowerCase();
          if (keyLower.includes(platformLower) || keyLower.includes(usernameLower)) {
            localStorage.removeItem(key);
            console.log(`Cleared localStorage key: ${key}`);
          }
        });
        
        // Also clear the specific keys
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });
      } catch (err) {
        console.warn('Failed to clear localStorage:', err);
      }

      // Reset processing state completely
      setProcessingState(initialProcessingState);

      // Navigate to the appropriate entry form
      console.log('Resetting dashboard - redirecting to entry form');
      const entryPath = `/${platform === 'instagram' ? 'ig' : platform === 'twitter' ? 'tw' : 'fb'}-entry-usernames`;
      
      // Use React Router navigation with replace to prevent back navigation
      safeNavigate(navigate, entryPath, { replace: true }, 10);

      return true;
    } catch (error) {
      console.error('Reset dashboard error:', error);
      return false;
    }
  }, [navigate, currentUser?.uid]);

  const completeProcessing = useCallback(() => {
    if (!processingState.isProcessing) {
      console.log('No active processing to complete');
      return;
    }

    const { platform, username } = processingState;
    console.log(`Completing processing for ${platform} with username ${username}`);

    // 🔒 BULLETPROOF USERNAME UNLOCKING: Unlock username when processing is complete
    if (platform && username) {
      try {
        unlockUsername(platform, username);
        console.log(`🔓 USERNAME UNLOCKED: '${username}' is now unlocked for ${platform} after completion`);
      } catch (err) {
        console.warn('Could not unlock username after completion:', err);
      }
    }

    // Clear processing state
    setProcessingState(initialProcessingState);
    localStorage.removeItem('processingState');

    // Clear platform-specific processing data
    if (platform) {
      localStorage.removeItem(`${platform}_processing_countdown`);
      localStorage.removeItem(`${platform}_processing_info`);
      
      // 🔒 CRITICAL: Remove username lock when processing is complete
      if (username) {
        localStorage.removeItem(`${platform}_username_lock_${username}`);
        console.log(`🔓 USERNAME LOCK REMOVED: '${username}' lock cleared for ${platform}`);
      }
    }

    // Add platform to completedPlatforms
    try {
      const completedPlatforms = localStorage.getItem('completedPlatforms');
      if (completedPlatforms) {
        const completed = JSON.parse(completedPlatforms);
        if (!completed.includes(platform)) {
          completed.push(platform);
          localStorage.setItem('completedPlatforms', JSON.stringify(completed));
        }
      } else {
        localStorage.setItem('completedPlatforms', JSON.stringify([platform]));
      }
    } catch (err) {
      console.error('Error updating completedPlatforms:', err);
    }

    // Update backend status
    if (currentUser?.uid && platform) {
      fetch(`/api/platform-access/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, claimed: true, username: username || '' })
      }).catch(e => console.warn('completeProcessing backend claimed=true failed', e));
    }

    console.log(`Processing completed for ${platform}`);
  }, [processingState, currentUser?.uid, unlockUsername]);

  const value: ProcessingContextType = {
    processingState,
    startProcessing,
    completeProcessing,
    resetDashboard,
    isProcessingActive: processingState.isProcessing,
    // 🔒 BULLETPROOF USERNAME LOCKING: New functions to prevent username corruption
    isUsernameLocked,
    lockUsername,
    unlockUsername,
    validateAndRepairUsername,
    preventUsernameOverwrite,
  };

  return (
    <ProcessingContext.Provider value={value}>
      {isLoading ? <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>Initializing…</div> : children}
    </ProcessingContext.Provider>
  );
};

export default ProcessingContext;