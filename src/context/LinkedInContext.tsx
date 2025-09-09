import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';

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

  // Load LinkedIn data from localStorage
  useEffect(() => {
    if (currentUser?.uid) {
      const storedUserId = localStorage.getItem(`linkedin_user_id_${currentUser.uid}`);
      const storedUsername = localStorage.getItem(`linkedin_username_${currentUser.uid}`);
      const accessedStatus = localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true';
      
      setUserId(storedUserId);
      setUsername(storedUsername);
      setIsConnected(!!storedUserId);
      setHasAccessed(accessedStatus);
    } else {
      // Clear state when user logs out
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
      setHasAccessed(false);
    }
  }, [currentUser]);

  const connectLinkedIn = useCallback((linkedinId: string, username: string) => {
    if (currentUser?.uid) {
      setUserId(linkedinId);
      setUsername(username);
      setIsConnected(true);
      
      localStorage.setItem(`linkedin_user_id_${currentUser.uid}`, linkedinId);
      localStorage.setItem(`linkedin_username_${currentUser.uid}`, username);
    }
  }, [currentUser?.uid]);

  const disconnectLinkedIn = useCallback(() => {
    if (currentUser?.uid) {
      setUserId(null);
      setUsername(null);
      setIsConnected(false);
      
      localStorage.removeItem(`linkedin_user_id_${currentUser.uid}`);
      localStorage.removeItem(`linkedin_username_${currentUser.uid}`);
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
