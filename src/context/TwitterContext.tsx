import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface TwitterContextType {
  userId: string | null;
  username: string | null;
  isConnected: boolean;
  hasAccessed: boolean;
  connectTwitter: (twitterId: string, username: string) => void;
  disconnectTwitter: () => void;
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

  const checkExistingConnection = useCallback(async () => {
    if (!currentUser?.uid) return;
    
    try {
      console.log(`[${new Date().toISOString()}] Checking for existing Twitter connection for user ${currentUser.uid}`);
      const response = await axios.get(`http://localhost:3000/twitter-connection/${currentUser.uid}`);
      
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
      } else {
        console.error(`[${new Date().toISOString()}] Error checking existing Twitter connection:`, error);
      }
      // Reset state on error
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
    }
  }, [currentUser?.uid]);

  // Check if user has accessed Twitter dashboard
  useEffect(() => {
    if (currentUser?.uid) {
      const hasUserAccessed = localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
      setHasAccessed(hasUserAccessed);
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
  }, [currentUser?.uid, checkExistingConnection]);

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

  const value: TwitterContextType = useMemo(() => ({
    userId,
    username,
    isConnected,
    hasAccessed,
    connectTwitter,
    disconnectTwitter,
  }), [userId, username, isConnected, hasAccessed, connectTwitter, disconnectTwitter]);

  return (
    <TwitterContext.Provider value={value}>
      {children}
    </TwitterContext.Provider>
  );
}; 