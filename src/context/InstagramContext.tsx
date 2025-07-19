import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { 
  getInstagramConnection, 
  isInstagramConnected, 
  isInstagramDisconnected,
  syncInstagramConnection
} from '../utils/instagramSessionManager';

interface InstagramContextType {
  isConnected: boolean;
  userId: string | null;
  graphId: string | null;
  hasAccessed: boolean;
  connectInstagram: (userId: string, graphId: string) => void;
  disconnectInstagram: () => void;
  resetInstagramAccess: () => void;
}

const InstagramContext = createContext<InstagramContextType>({
  isConnected: false,
  userId: null,
  graphId: null,
  hasAccessed: false,
  connectInstagram: () => {},
  disconnectInstagram: () => {},
  resetInstagramAccess: () => {},
});

export const useInstagram = () => useContext(InstagramContext);

interface InstagramProviderProps {
  children: ReactNode;
}

export const InstagramProvider: React.FC<InstagramProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [hasAccessed, setHasAccessed] = useState<boolean>(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    const checkInstagramConnection = async () => {
      if (!currentUser) {
        setIsConnected(false);
        setUserId(null);
        setGraphId(null);
        setHasAccessed(false);
        return;
      }

      // Check if user explicitly disconnected Instagram
      if (isInstagramDisconnected(currentUser.uid)) {
        console.log(`[${new Date().toISOString()}] User ${currentUser.uid} previously disconnected Instagram, not reconnecting`);
        setIsConnected(false);
        setUserId(null);
        setGraphId(null);
        return;
      }

      // Sync with backend to ensure connection is available for API calls
      try {
        await syncInstagramConnection(currentUser.uid);
        console.log(`[${new Date().toISOString()}] Instagram connection sync completed for user ${currentUser.uid}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error syncing Instagram connection:`, error);
      }

      // Check if Instagram is connected (after sync)
      const connected = isInstagramConnected(currentUser.uid);
      setIsConnected(connected);

      // Check backend API status for platform access
      try {
        const response = await fetch(`/api/user-instagram-status/${currentUser.uid}`);
        const data = await response.json();
        const hasUserAccessed = data.hasEnteredInstagramUsername || localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
        setHasAccessed(hasUserAccessed);
        
        if (hasUserAccessed) {
          localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error checking Instagram status:`, error);
        // Fallback to localStorage
        const hasUserAccessed = localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
        setHasAccessed(hasUserAccessed);
      }

      if (connected) {
        const connectionData = getInstagramConnection(currentUser.uid);
        if (connectionData) {
          setUserId(connectionData.instagram_user_id);
          setGraphId(connectionData.instagram_graph_id);
          console.log(`[${new Date().toISOString()}] Instagram connection loaded: userId=${connectionData.instagram_user_id}, graphId=${connectionData.instagram_graph_id}`);
        }
      } else {
        setUserId(null);
        setGraphId(null);
      }
    };

    checkInstagramConnection();
  }, [currentUser]);

  const connectInstagram = (newUserId: string, newGraphId: string) => {
    console.log(`[${new Date().toISOString()}] Instagram connected: userId=${newUserId}, graphId=${newGraphId}`);
    setIsConnected(true);
    setUserId(newUserId);
    setGraphId(newGraphId);
    
    // When connecting, also mark as accessed
    if (currentUser) {
      setHasAccessed(true);
      localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
    }
  };

  const disconnectInstagram = () => {
    console.log(`[${new Date().toISOString()}] Instagram disconnected`);
    setIsConnected(false);
    setUserId(null);
    setGraphId(null);
    // Keep hasAccessed true even after disconnecting
  };

  const resetInstagramAccess = () => {
    console.log(`[${new Date().toISOString()}] Instagram access reset`);
    setIsConnected(false);
    setUserId(null);
    setGraphId(null);
    setHasAccessed(false);
    
    // Clear localStorage
    if (currentUser) {
      localStorage.removeItem(`instagram_accessed_${currentUser.uid}`);
    }
  };

  return (
    <InstagramContext.Provider 
      value={{ 
        isConnected, 
        userId, 
        graphId, 
        hasAccessed,
        connectInstagram, 
        disconnectInstagram,
        resetInstagramAccess
      }}
    >
      {children}
    </InstagramContext.Provider>
  );
}; 