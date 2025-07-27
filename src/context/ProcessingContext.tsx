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

    const newState: ProcessingState = {
      platform,
      username,
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

    // Persist BULLETPROOF countdown keys so that guards/processing page can validate immediately
    const endTime = startTime + duration;
    try {
      localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
      localStorage.setItem(`${platform}_processing_info`, JSON.stringify({ platform, username, startTime, endTime }));
    } catch (err) {
      console.error('Error setting processing countdown in localStorage', err);
    }

    // Persist immediately to avoid race conditions
    localStorage.setItem('processingState', JSON.stringify(newState));

    setProcessingState(newState);
    if (!preventNavigation) {
      safeNavigate(navigate, `/processing/${platform}`, { replace: true }, 9); // High priority for processing context
    }
  }, [navigate]);

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
    if (processingState.platform) {
      try {
        localStorage.removeItem(`${processingState.platform}_processing_countdown`);
        localStorage.removeItem(`${processingState.platform}_processing_info`);
      } catch {}
    }
    setProcessingState(initialProcessingState);
  }, [processingState.platform]);

  const value: ProcessingContextType = {
    processingState,
    startProcessing,
    completeProcessing,
    resetDashboard,
    isProcessingActive: processingState.isProcessing,
  };

  return (
    <ProcessingContext.Provider value={value}>
      {isLoading ? <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>Initializing…</div> : children}
    </ProcessingContext.Provider>
  );
};

export default ProcessingContext; 