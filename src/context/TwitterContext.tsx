import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface TwitterContextType {
  userId: string | null;
  isConnected: boolean;
  connectTwitter: (twitterId: string, username: string) => void;
  disconnectTwitter: () => void;
}

const TwitterContext = createContext<TwitterContextType | undefined>(undefined);

export const useTwitter = (): TwitterContextType => {
  const context = useContext(TwitterContext);
  if (!context) {
    throw new Error('useTwitter must be used within a TwitterProvider');
  }
  return context;
};

interface TwitterProviderProps {
  children: ReactNode;
}

export const TwitterProvider: React.FC<TwitterProviderProps> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    // Check for existing Twitter connection when auth state changes
    if (currentUser?.uid) {
      checkExistingConnection();
    } else {
      // Clear connection state when user logs out
      setUserId(null);
      setIsConnected(false);
    }
  }, [currentUser]);

  const checkExistingConnection = async () => {
    if (!currentUser?.uid) return;
    
    try {
      const response = await fetch(`http://localhost:3000/twitter-connection/${currentUser.uid}`);
      if (response.ok) {
        const connectionData = await response.json();
        if (connectionData.twitter_user_id) {
          setUserId(connectionData.twitter_user_id);
          setIsConnected(true);
          console.log(`[${new Date().toISOString()}] Restored Twitter connection:`, connectionData.twitter_user_id);
        }
      }
    } catch (error) {
      console.log('No existing Twitter connection found');
    }
  };

  const connectTwitter = (twitterId: string, username: string) => {
    setUserId(twitterId);
    setIsConnected(true);
    console.log(`[${new Date().toISOString()}] Twitter connected: ${twitterId}`);
  };

  const disconnectTwitter = () => {
    setUserId(null);
    setIsConnected(false);
    console.log(`[${new Date().toISOString()}] Twitter disconnected`);
  };

  const value: TwitterContextType = {
    userId,
    isConnected,
    connectTwitter,
    disconnectTwitter,
  };

  return (
    <TwitterContext.Provider value={value}>
      {children}
    </TwitterContext.Provider>
  );
}; 