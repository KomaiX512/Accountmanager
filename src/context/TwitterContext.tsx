import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface TwitterContextType {
  userId: string | null;
  username: string | null;
  isConnected: boolean;
  hasAccessed: boolean;
  connectTwitter: (twitterId: string, username: string) => void;
  disconnectTwitter: () => void;
  resetTwitterAccess: () => void;
  refreshConnection: () => void;
}

const TwitterContext = createContext<TwitterContextType | undefined>(undefined);

export const useTwitter = () => {
  const context = useContext(TwitterContext);
  if (context === undefined) {
    throw new Error('useTwitter must be used within a TwitterProvider');
  }
  return context;
};

interface TwitterProviderProps {
  children: ReactNode;
}

export const TwitterProvider: React.FC<TwitterProviderProps> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasAccessed, setHasAccessed] = useState(false);
  const { currentUser } = useAuth();
  const isCheckingRef = useRef(false);

  const checkExistingConnection = useCallback(async () => {
    if (!currentUser?.uid || isCheckingRef.current) return;
    
    isCheckingRef.current = true;
    
    try {
      console.log(`[${new Date().toISOString()}] Checking for existing Twitter connection for user ${currentUser.uid}`);
      const response = await axios.get(`/api/twitter-connection/${currentUser.uid}`, {
        timeout: 10000, // 10 second timeout
        validateStatus: function (status) {
          return status < 500; // Resolve only if the status code is less than 500
        }
      });
      
      if (response.data.twitter_user_id) {
        setUserId(response.data.twitter_user_id);
        setUsername(response.data.username || null);
        setIsConnected(true);
        console.log(`[${new Date().toISOString()}] Restored Twitter connection:`, {
          userId: response.data.twitter_user_id,
          username: response.data.username
        });
      } else {
        console.log(`[${new Date().toISOString()}] No Twitter connection data found for user ${currentUser.uid}`);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[${new Date().toISOString()}] No existing Twitter connection found for user ${currentUser.uid}`);
        // Keep existing state if 404 and we have cached data
        if (!userId && !isConnected) {
          setUserId(null);
          setUsername(null);
          setIsConnected(false);
        }
      } else {
        console.error(`[${new Date().toISOString()}] Error checking existing Twitter connection:`, error);
        // Only reset if we don't have existing state
        if (!userId && !isConnected) {
          setUserId(null);
          setUsername(null);
          setIsConnected(false);
        }
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [currentUser?.uid]);

  // Check if user has accessed Twitter dashboard
  useEffect(() => {
    if (currentUser?.uid) {
      // Check backend API status for platform access
      const checkTwitterStatus = async () => {
        try {
          const response = await fetch(`/api/user-twitter-status/${currentUser.uid}`);
          const data = await response.json();
          const hasUserAccessed = data.hasEnteredTwitterUsername || localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
          setHasAccessed(hasUserAccessed);
          
          if (hasUserAccessed) {
            localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error checking Twitter status:`, error);
          // Fallback to localStorage
          const hasUserAccessed = localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
          setHasAccessed(hasUserAccessed);
        }
      };
      
      checkTwitterStatus();
    } else {
      setHasAccessed(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    // Check for existing Twitter connection when auth state changes
    if (currentUser?.uid) {
      checkExistingConnection();
    } else {
      // Clear connection state when user logs out
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
      setHasAccessed(false);
    }
  }, [currentUser?.uid]);

  const connectTwitter = useCallback((twitterId: string, twitterUsername: string) => {
    setUserId(twitterId);
    setUsername(twitterUsername);
    setIsConnected(true);
    
    // When connecting, also mark as accessed
    if (currentUser?.uid) {
      setHasAccessed(true);
      localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
    }
    
    console.log(`[${new Date().toISOString()}] Twitter connected via context: ${twitterId} (@${twitterUsername})`);
  }, [currentUser?.uid]);

  const disconnectTwitter = useCallback(() => {
    setUserId(null);
    setUsername(null);
    setIsConnected(false);
    // Keep hasAccessed true even after disconnecting
    console.log(`[${new Date().toISOString()}] Twitter disconnected via context`);
  }, []);

  const resetTwitterAccess = useCallback(() => {
    setUserId(null);
    setUsername(null);
    setIsConnected(false);
    setHasAccessed(false);
    
    // Clear localStorage
    if (currentUser?.uid) {
      localStorage.removeItem(`twitter_accessed_${currentUser.uid}`);
    }
    
    console.log(`[${new Date().toISOString()}] Twitter access reset via context`);
  }, [currentUser?.uid]);

  const refreshConnection = useCallback(() => {
    if (currentUser?.uid && !isCheckingRef.current) {
      checkExistingConnection();
    }
  }, [currentUser?.uid, checkExistingConnection]);

  const value: TwitterContextType = useMemo(() => ({
    userId,
    username,
    isConnected,
    hasAccessed,
    connectTwitter,
    disconnectTwitter,
    resetTwitterAccess,
    refreshConnection,
  }), [userId, username, isConnected, hasAccessed, connectTwitter, disconnectTwitter, resetTwitterAccess, refreshConnection]);

  return (
    <TwitterContext.Provider value={value}>
      {children}
    </TwitterContext.Provider>
  );
}; 