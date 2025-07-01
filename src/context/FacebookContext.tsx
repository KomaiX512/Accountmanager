import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface FacebookContextType {
  userId: string | null;
  username: string | null;
  isConnected: boolean;
  hasAccessed: boolean;
  connectFacebook: (facebookId: string, username: string) => void;
  disconnectFacebook: () => void;
}

const FacebookContext = createContext<FacebookContextType>({
  userId: null,
  username: null,
  isConnected: false,
  hasAccessed: false,
  connectFacebook: () => {},
  disconnectFacebook: () => {},
});

export const useFacebook = () => useContext(FacebookContext);

interface FacebookProviderProps {
  children: ReactNode;
}

export const FacebookProvider: React.FC<FacebookProviderProps> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasAccessed, setHasAccessed] = useState(false);
  const { currentUser } = useAuth();

  const checkExistingConnection = useCallback(async () => {
    if (!currentUser?.uid) return;
    
    try {
      console.log(`[${new Date().toISOString()}] Checking for existing Facebook connection for user ${currentUser.uid}`);
      const response = await axios.get(`/api/facebook-connection/${currentUser.uid}`);
      
      if (response.data.facebook_page_id) {
        setUserId(response.data.facebook_page_id); // Use page ID for Facebook operations
        setUsername(response.data.username || null);
        setIsConnected(true);
        console.log(`[${new Date().toISOString()}] Restored Facebook connection:`, {
          userId: response.data.facebook_page_id, // Page ID is the correct userId for Facebook
          username: response.data.username
        });
      } else {
        console.log(`[${new Date().toISOString()}] No Facebook connection data found for user ${currentUser.uid}`);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[${new Date().toISOString()}] No existing Facebook connection found for user ${currentUser.uid}`);
      } else {
        console.error(`[${new Date().toISOString()}] Error checking existing Facebook connection:`, error);
      }
      // Reset state on error
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
    }
  }, [currentUser?.uid]);

  // Check if user has accessed Facebook dashboard
  useEffect(() => {
    if (currentUser?.uid) {
      // Check backend API status for platform access
      const checkFacebookStatus = async () => {
        try {
          const response = await fetch(`/api/user-facebook-status/${currentUser.uid}`);
          const data = await response.json();
          const hasUserAccessed = data.hasEnteredFacebookUsername || localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
          setHasAccessed(hasUserAccessed);
          
          if (hasUserAccessed) {
            localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error checking Facebook status:`, error);
          // Fallback to localStorage
          const hasUserAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
          setHasAccessed(hasUserAccessed);
        }
      };
      
      checkFacebookStatus();
    } else {
      setHasAccessed(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    // Check for existing Facebook connection when auth state changes
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

  const connectFacebook = useCallback((facebookId: string, facebookUsername: string) => {
    setUserId(facebookId);
    setUsername(facebookUsername);
    setIsConnected(true);
    
    // When connecting, also mark as accessed
    if (currentUser?.uid) {
      setHasAccessed(true);
      localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
    }
    
    console.log(`[${new Date().toISOString()}] Facebook connected via context: ${facebookId} (@${facebookUsername})`);
  }, [currentUser?.uid]);

  const disconnectFacebook = useCallback(() => {
    setUserId(null);
    setUsername(null);
    setIsConnected(false);
    // Keep hasAccessed true even after disconnecting
    console.log(`[${new Date().toISOString()}] Facebook disconnected via context`);
  }, []);

  const value: FacebookContextType = useMemo(() => ({
    userId,
    username,
    isConnected,
    hasAccessed,
    connectFacebook,
    disconnectFacebook,
  }), [userId, username, isConnected, hasAccessed, connectFacebook, disconnectFacebook]);

  return (
    <FacebookContext.Provider value={value}>
      {children}
    </FacebookContext.Provider>
  );
}; 