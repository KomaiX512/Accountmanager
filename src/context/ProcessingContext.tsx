import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface ProcessingState {
  platform: 'instagram' | 'twitter' | 'facebook' | null;
  username: string | null;
  startTime: number | null;
  duration: number | null; // Duration in milliseconds
  isProcessing: boolean;
}

interface ProcessingContextType {
  processingState: ProcessingState;
  startProcessing: (platform: 'instagram' | 'twitter' | 'facebook', username: string, durationMinutes: number) => void;
  completeProcessing: () => void;
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
  const location = useLocation();

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

  // Navigation guard
  useEffect(() => {
    if (!isLoading && processingState.isProcessing && location.pathname !== '/processing') {
      navigate('/processing', { replace: true });
    }
  }, [processingState, location.pathname, navigate, isLoading]);
  
  const startProcessing = useCallback((
    platform: 'instagram' | 'twitter' | 'facebook',
    username: string,
    durationMinutes: number
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

    // Persist immediately to avoid race conditions
    localStorage.setItem('processingState', JSON.stringify(newState));

    setProcessingState(newState);
    navigate('/processing', { replace: true });
  }, [navigate]);

  const completeProcessing = useCallback(() => {
    setProcessingState(initialProcessingState);
  }, []);

  const value: ProcessingContextType = {
    processingState,
    startProcessing,
    completeProcessing,
    isProcessingActive: processingState.isProcessing,
  };

  return (
    <ProcessingContext.Provider value={value}>
      {isLoading ? <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>Initializing…</div> : children}
    </ProcessingContext.Provider>
  );
};

export default ProcessingContext; 