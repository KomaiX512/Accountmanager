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
      
      // Check localStorage first for immediate response
      const cachedPageId = localStorage.getItem(`facebook_page_id_${currentUser.uid}`);
      // ✅ CRITICAL FIX: Use separate key for connected Facebook username to prevent dashboard username overwrite
      const cachedUsername = localStorage.getItem(`facebook_connected_username_${currentUser.uid}`);
      
      if (cachedPageId) {
        setUserId(cachedPageId);
        setUsername(cachedUsername || null);
        setIsConnected(true);
        console.log(`[${new Date().toISOString()}] Restored Facebook connection from cache:`, {
          userId: cachedPageId,
          username: cachedUsername,
          isConnected: true
        });
      }

      // Background API sync without blocking UI
      const response = await axios.get(`/api/facebook-connection/${currentUser.uid}`, {
        timeout: 10000, // 10 second timeout
        validateStatus: function (status) {
          return status < 500; // Resolve only if the status code is less than 500
        }
      });
      
      console.log(`[${new Date().toISOString()}] Facebook connection response:`, response.data);
      
      if (response.data.facebook_page_id) {
        const pageId = response.data.facebook_page_id;
        const username = response.data.username || null;
        
        setUserId(pageId);
        setUsername(username);
        setIsConnected(true);
        
        // Cache the values
        localStorage.setItem(`facebook_page_id_${currentUser.uid}`, pageId);
        if (username) {
          // ✅ CRITICAL FIX: Store connected Facebook username separately from dashboard username
          localStorage.setItem(`facebook_connected_username_${currentUser.uid}`, username);
        }
        
        console.log(`[${new Date().toISOString()}] Updated Facebook connection:`, {
          userId: pageId,
          username,
          isConnected: true
        });
        
        // CRITICAL FIX: Dispatch event when existing connection is restored
        const event = new CustomEvent('facebookConnected', { 
          detail: { 
            facebookId: pageId, 
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
        // Keep cached data if API fails
        if (!userId && !isConnected) {
          setUserId(null);
          setUsername(null);
          setIsConnected(false);
        }
      } else {
        console.error(`[${new Date().toISOString()}] Error checking existing Facebook connection:`, error);
        // Only reset if we don't have cached data
        if (!userId && !isConnected) {
          setUserId(null);
          setUsername(null);
          setIsConnected(false);
        }
      }
    }
  }, [currentUser?.uid]);

  // ✅ CROSS-DEVICE SYNC FIX: Real-time Facebook access monitoring with aggressive backend sync
  useEffect(() => {
    if (!currentUser?.uid) {
      setHasAccessed(false);
      return;
    }

    // ✅ IMMEDIATE CHECK: Fast localStorage check first
    const hasUserAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
    setHasAccessed(hasUserAccessed);


    // ✅ AGGRESSIVE BACKEND SYNC: Check backend more frequently for Facebook
    const checkFacebookStatusAggressively = async () => {
      try {
        console.log(`[FacebookContext] 🔍 Aggressive backend check for user ${currentUser.uid}`);
        const response = await fetch(`/api/user-facebook-status/${currentUser.uid}`);
        const data = await response.json();
        
        const apiHasAccessed = data.hasEnteredFacebookUsername;
        const localHasAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
        
        if (apiHasAccessed && !localHasAccessed) {
          console.log(`[FacebookContext] ✅ BACKEND SYNC: User has accessed Facebook on another device, updating localStorage`);
          setHasAccessed(true);
          localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
          
          // Also sync username and other data
          if (data.facebook_username) {
            // ✅ CRITICAL FIX: Store connected Facebook username separately from dashboard username
            localStorage.setItem(`facebook_connected_username_${currentUser.uid}`, data.facebook_username);
          }
          if (data.accountType) {
            localStorage.setItem(`facebook_account_type_${currentUser.uid}`, data.accountType);
          }
          if (data.competitors) {
            localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(data.competitors));
          }
          
        } else if (!apiHasAccessed && localHasAccessed) {
          console.log(`[FacebookContext] 🔄 BACKEND MISMATCH: Backend shows not accessed but localStorage shows accessed - PRESERVING localStorage (backend may be incomplete)`);
          // ❌ REMOVED: Don't aggressively clear localStorage when backend might be incomplete  
          // setHasAccessed(false);
          // localStorage.removeItem(`facebook_accessed_${currentUser.uid}`);
        }
        
        console.log(`[FacebookContext] 🔍 Backend check complete: backend=${apiHasAccessed} local=${localHasAccessed}`);
      } catch (error) {
        console.error(`[FacebookContext] ❌ Error checking Facebook status:`, error);
      }
    };

    // ✅ STORAGE EVENT LISTENER: Listen for localStorage changes from other tabs/devices
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `facebook_accessed_${currentUser.uid}`) {
        const newValue = event.newValue === 'true';
        console.log(`[FacebookContext] 🚀 STORAGE EVENT: Facebook access changed to ${newValue} from another tab/device!`);
        setHasAccessed(newValue);
      }
    };

    // ✅ INITIAL BACKEND CHECK: Check backend if not cached
    if (!hasUserAccessed) {
      checkFacebookStatusAggressively();
    }

    // ✅ AGGRESSIVE POLLING DISABLED: Polling was causing race conditions with the processing timer.
    // The storage event listener is sufficient for cross-tab/window sync.
    // const localPollInterval = setInterval(pollForAccessChanges, 2000);
    // const backendSyncInterval = setInterval(checkFacebookStatusAggressively, 5000);

    // ✅ LISTEN FOR STORAGE EVENTS: Immediate response to localStorage changes
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser?.uid, hasAccessed]); // Include hasAccessed to track changes

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