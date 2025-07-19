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
  resetFacebookAccess: () => void;
}

const FacebookContext = createContext<FacebookContextType>({
  userId: null,
  username: null,
  isConnected: false,
  hasAccessed: false,
  connectFacebook: () => {},
  disconnectFacebook: () => {},
  resetFacebookAccess: () => {},
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
      
      console.log(`[${new Date().toISOString()}] Facebook connection response:`, response.data);
      
      if (response.data.facebook_page_id) {
        setUserId(response.data.facebook_page_id); // Use page ID for Facebook operations
        setUsername(response.data.username || null);
        setIsConnected(true);
        console.log(`[${new Date().toISOString()}] Restored Facebook connection:`, {
          userId: response.data.facebook_page_id, // Page ID is the correct userId for Facebook
          username: response.data.username,
          isConnected: true
        });
        
        // CRITICAL FIX: Dispatch event when existing connection is restored
        const event = new CustomEvent('facebookConnected', { 
          detail: { 
            facebookId: response.data.facebook_page_id, 
            facebookUsername: response.data.username,
            timestamp: Date.now(),
            restored: true
          } 
        });
        window.dispatchEvent(event);
      } else {
        console.log(`[${new Date().toISOString()}] No Facebook connection data found for user ${currentUser.uid}`);
        setUserId(null);
        setUsername(null);
        setIsConnected(false);
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
    
    // CRITICAL FIX: Dispatch event to trigger notification refresh in PlatformDashboard
    console.log(`[${new Date().toISOString()}] Facebook connected via context: ${facebookId} (@${facebookUsername})`);
    
    // Dispatch custom event to notify PlatformDashboard that Facebook connection is ready
    const event = new CustomEvent('facebookConnected', { 
      detail: { 
        facebookId, 
        facebookUsername,
        timestamp: Date.now()
      } 
    });
    window.dispatchEvent(event);
  }, [currentUser?.uid]);

  const disconnectFacebook = useCallback(() => {
    setUserId(null);
    setUsername(null);
    setIsConnected(false);
    // Keep hasAccessed true even after disconnecting
    console.log(`[${new Date().toISOString()}] Facebook disconnected via context`);
  }, []);

  const resetFacebookAccess = useCallback(() => {
    setUserId(null);
    setUsername(null);
    setIsConnected(false);
    setHasAccessed(false);
    
    // Clear localStorage
    if (currentUser?.uid) {
      localStorage.removeItem(`facebook_accessed_${currentUser.uid}`);
    }
    
    console.log(`[${new Date().toISOString()}] Facebook access reset via context`);
  }, [currentUser?.uid]);

  const value: FacebookContextType = useMemo(() => ({
    userId,
    username,
    isConnected,
    hasAccessed,
    connectFacebook,
    disconnectFacebook,
    resetFacebookAccess,
  }), [userId, username, isConnected, hasAccessed, connectFacebook, disconnectFacebook, resetFacebookAccess]);

  return (
    <FacebookContext.Provider value={value}>
      {children}
    </FacebookContext.Provider>
  );
}; 