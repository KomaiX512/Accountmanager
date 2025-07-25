import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { 
  getInstagramConnection, 
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

      // Fast local check first for immediate UI response
      const localConnection = getInstagramConnection(currentUser.uid);
      if (localConnection) {
        setIsConnected(true);
        setUserId(localConnection.instagram_user_id);
        setGraphId(localConnection.instagram_graph_id);
        console.log(`[${new Date().toISOString()}] Restored Instagram connection from cache:`, localConnection);
      }

      // Check platform access from localStorage first
      const hasUserAccessed = localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
      setHasAccessed(hasUserAccessed);

      // Background sync without blocking UI
      try {
        await syncInstagramConnection(currentUser.uid);
        
        // Re-check after sync in case anything changed
        const updatedConnection = getInstagramConnection(currentUser.uid);
        if (updatedConnection) {
          setIsConnected(true);
          setUserId(updatedConnection.instagram_user_id);
          setGraphId(updatedConnection.instagram_graph_id);
        }

        // Background check API status if needed
        if (!hasUserAccessed) {
          try {
            const response = await fetch(`/api/user-instagram-status/${currentUser.uid}`);
            const data = await response.json();
            const apiHasAccessed = data.hasEnteredInstagramUsername;
            
            if (apiHasAccessed) {
              setHasAccessed(true);
              localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
            }
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error checking Instagram status:`, error);
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error syncing Instagram connection:`, error);
        // Don't clear local connection on sync error
      }
    };

    checkInstagramConnection();
  }, [currentUser?.uid]);

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