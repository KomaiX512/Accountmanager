import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface LinkedInContextType {
  userId: string | null;
  username: string | null;
  isConnected: boolean;
  hasAccessed: boolean;
  connectLinkedIn: (linkedinId: string, username: string) => void;
  disconnectLinkedIn: () => void;
  resetLinkedInAccess: () => void;
}

const LinkedInContext = createContext<LinkedInContextType>({
  userId: null,
  username: null,
  isConnected: false,
  hasAccessed: false,
  connectLinkedIn: () => {},
  disconnectLinkedIn: () => {},
  resetLinkedInAccess: () => {},
});

export const useLinkedIn = () => useContext(LinkedInContext);

interface LinkedInProviderProps {
  children: ReactNode;
}

export const LinkedInProvider: React.FC<LinkedInProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hasAccessed, setHasAccessed] = useState<boolean>(false);
  const isCheckingRef = useRef(false);

  // Check for existing LinkedIn connection from API
  const checkExistingConnection = useCallback(async () => {
    if (!currentUser?.uid || isCheckingRef.current) return;
    
    isCheckingRef.current = true;
    
    try {
      console.log(`[${new Date().toISOString()}] Checking for existing LinkedIn connection for user ${currentUser.uid}`);
      const response = await axios.get(`/api/linkedin-connection/${currentUser.uid}`);
      
      if (response.data.linkedin_user_id) {
        setUserId(response.data.linkedin_user_id);
        setUsername(response.data.username || null);
        setIsConnected(true);
        console.log(`[${new Date().toISOString()}] Restored LinkedIn connection:`, {
          userId: response.data.linkedin_user_id,
          username: response.data.username
        });
        
        // Also update localStorage for backward compatibility
        localStorage.setItem(`linkedin_user_id_${currentUser.uid}`, response.data.linkedin_user_id);
        if (response.data.username) {
          localStorage.setItem(`linkedin_username_${currentUser.uid}`, response.data.username);
        }
      } else {
        console.log(`[${new Date().toISOString()}] No LinkedIn connection data found for user ${currentUser.uid}`);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[${new Date().toISOString()}] No existing LinkedIn connection found for user ${currentUser.uid}`);
      } else {
        console.error(`[${new Date().toISOString()}] Error checking existing LinkedIn connection:`, error);
      }
      // Reset state on error
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
    } finally {
      isCheckingRef.current = false;
    }
  }, [currentUser?.uid]);

  // Load LinkedIn data from localStorage and check API
  useEffect(() => {
    if (currentUser?.uid) {
      // First check localStorage for immediate data
      const storedUserId = localStorage.getItem(`linkedin_user_id_${currentUser.uid}`);
      const storedUsername = localStorage.getItem(`linkedin_username_${currentUser.uid}`);
      const accessedStatus = localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true';
      
      setUserId(storedUserId);
      setUsername(storedUsername);
      setIsConnected(!!storedUserId);
      setHasAccessed(accessedStatus);
      
      // Then check API for latest data
      checkExistingConnection();
    } else {
      // Clear state when user logs out
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
      setHasAccessed(false);
    }
  }, [currentUser]);

  const connectLinkedIn = useCallback(async (linkedinId: string, username: string) => {
    if (currentUser?.uid) {
      setUserId(linkedinId);
      setUsername(username);
      setIsConnected(true);
      
      // Store in localStorage for immediate access
      localStorage.setItem(`linkedin_user_id_${currentUser.uid}`, linkedinId);
      localStorage.setItem(`linkedin_username_${currentUser.uid}`, username);
      
      // Store in API for cross-device sync
      try {
        await axios.post(`/api/linkedin-connection/${currentUser.uid}`, {
          linkedin_user_id: linkedinId,
          username: username,
          connected: true,
          connectedAt: new Date().toISOString()
        });
        console.log(`[${new Date().toISOString()}] LinkedIn connection stored via API for user ${currentUser.uid}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error storing LinkedIn connection via API:`, error);
      }
    }
  }, [currentUser?.uid]);

  const disconnectLinkedIn = useCallback(async () => {
    if (currentUser?.uid) {
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
      
      // Remove from localStorage
      localStorage.removeItem(`linkedin_user_id_${currentUser.uid}`);
      localStorage.removeItem(`linkedin_username_${currentUser.uid}`);
      
      // Remove from API
      try {
        await axios.delete(`/api/linkedin-connection/${currentUser.uid}`);
        console.log(`[${new Date().toISOString()}] LinkedIn connection removed via API for user ${currentUser.uid}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error removing LinkedIn connection via API:`, error);
      }
    }
  }, [currentUser?.uid]);

  const resetLinkedInAccess = useCallback(() => {
    if (currentUser?.uid) {
      setHasAccessed(false);
      localStorage.removeItem(`linkedin_accessed_${currentUser.uid}`);
    }
  }, [currentUser?.uid]);

  const contextValue = useMemo(() => ({
    userId,
    username,
    isConnected,
    hasAccessed,
    connectLinkedIn,
    disconnectLinkedIn,
    resetLinkedInAccess,
  }), [userId, username, isConnected, hasAccessed, connectLinkedIn, disconnectLinkedIn, resetLinkedInAccess]);

  return (
    <LinkedInContext.Provider value={contextValue}>
      {children}
    </LinkedInContext.Provider>
  );
};
