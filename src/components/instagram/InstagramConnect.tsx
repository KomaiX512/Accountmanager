import React, { useState, useEffect, useRef } from 'react';
import './InstagramConnect.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import {
  getInstagramConnection,
  storeInstagramConnection,
  clearInstagramConnection,
  isInstagramDisconnected
} from '../../utils/instagramSessionManager';

interface InstagramConnectProps {
  onConnected: (graphId: string, userId: string) => void;
  className?: string;
}

const InstagramConnect: React.FC<InstagramConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { currentUser } = useAuth();
  const isStoringConnectionRef = useRef(false);
  const connectionDataRef = useRef<{ instagram_user_id: string; instagram_graph_id: string; username?: string } | null>(null);
  
  // Check for stored connection on auth change or component mount
  useEffect(() => {
    const checkSavedConnection = async () => {
      // Reset connection state when user changes or logs out
      if (!currentUser) {
        setIsConnected(false);
        connectionDataRef.current = null;
        return;
      }
      
      try {
        // Check if the user explicitly disconnected Instagram
        const userDisconnected = isInstagramDisconnected(currentUser.uid);
        if (userDisconnected) {
          console.log(`[${new Date().toISOString()}] User ${currentUser.uid} previously disconnected Instagram, honoring that choice`);
          setIsConnected(false);
          connectionDataRef.current = null;
          return;
        }
        
        // First check local storage for cached connection
        const connectionData = getInstagramConnection(currentUser.uid);
        
        if (connectionData) {
          console.log(`[${new Date().toISOString()}] Found cached Instagram connection for user ${currentUser.uid}`);
          setIsConnected(true);
          // Notify parent component about the connection
          onConnected(connectionData.instagram_graph_id, connectionData.instagram_user_id);
          
          // Store connection data in ref to prevent duplicate requests
          connectionDataRef.current = connectionData;
          return;
        }
        
        // If not in local storage, check if we have a backend stored connection
        if (currentUser?.uid) {
          try {
            const response = await axios.get(`http://localhost:3000/instagram-connection/${currentUser.uid}`);
            if (response.data && response.data.instagram_user_id) {
              // Store in both storage types for persistence
              storeInstagramConnection(
                response.data.instagram_user_id,
                response.data.instagram_graph_id,
                response.data.username || '',
                currentUser.uid
              );
              
              setIsConnected(true);
              onConnected(response.data.instagram_graph_id, response.data.instagram_user_id);
              
              // Store connection data in ref to prevent duplicate requests
              connectionDataRef.current = {
                instagram_user_id: response.data.instagram_user_id,
                instagram_graph_id: response.data.instagram_graph_id,
                username: response.data.username
              };
            }
          } catch (error) {
            console.log(`[${new Date().toISOString()}] No stored Instagram connection found in backend for user ${currentUser.uid}`);
            // No stored connection, that's okay - user will need to connect
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error checking Instagram connection:`, error);
      }
    };
    
    checkSavedConnection();
  }, [onConnected, currentUser]);

  useEffect(() => {
    // Listen for OAuth redirect message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'INSTAGRAM_CONNECTED' && event.data.graphId && event.data.userId) {
        console.log(`[${new Date().toISOString()}] Received Instagram connection message:`, event.data);
        
        // Ensure we have a current user to bind the Instagram connection to
        if (!currentUser?.uid) {
          console.error(`[${new Date().toISOString()}] Cannot store Instagram connection: No authenticated user`);
          setIsConnecting(false);
          return;
        }
        
        // Store connection data with user binding
        storeInstagramConnection(
          event.data.userId,
          event.data.graphId,
          event.data.username || '',
          currentUser.uid
        );
        
        // Check if we're already storing this data to avoid duplicate requests
        const isEqualToCurrentData = 
          connectionDataRef.current && 
          connectionDataRef.current.instagram_user_id === event.data.userId && 
          connectionDataRef.current.instagram_graph_id === event.data.graphId;
        
        // Also store in backend for persistence across devices, but only if not already storing
        if (currentUser?.uid && !isStoringConnectionRef.current && !isEqualToCurrentData) {
          const connectionData = {
            instagram_user_id: event.data.userId,
            instagram_graph_id: event.data.graphId,
            username: event.data.username
          };
          
          // Update ref to prevent duplicate requests
          connectionDataRef.current = connectionData;
          isStoringConnectionRef.current = true;
          
          axios.post(`http://localhost:3000/instagram-connection/${currentUser.uid}`, connectionData)
            .then(() => {
              console.log(`[${new Date().toISOString()}] Successfully stored Instagram connection in backend for user ${currentUser.uid}`);
            })
            .catch(error => {
              console.error(`[${new Date().toISOString()}] Failed to store Instagram connection in backend:`, error);
            })
            .finally(() => {
              isStoringConnectionRef.current = false;
            });
        }
        
        setIsConnected(true);
        onConnected(event.data.graphId, event.data.userId);
        setIsConnecting(false);
      } else {
        console.error(`[${new Date().toISOString()}] Invalid Instagram connection message:`, event.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnected, currentUser]);

  const connectToInstagram = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot connect Instagram: No authenticated user`);
      return;
    }
    
    const appId = '576296982152813';
    const redirectUri = 'https://b697-121-52-146-243.ngrok-free.app/instagram/callback';
    const scope = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish';
    
    const authUrl = `https://api.instagram.com/oauth/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;

    setIsConnecting(true);
    
    // Open popup for Instagram OAuth
    const width = 600;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl,
      'instagram-auth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  };

  const disconnectInstagram = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot disconnect Instagram: No authenticated user`);
      return;
    }
    
    // Clear local storage data and mark as disconnected
    clearInstagramConnection(currentUser.uid);
    
    // Reset connection data ref
    connectionDataRef.current = null;
    
    // Also remove from backend, but only if not already in progress
    if (currentUser?.uid && !isStoringConnectionRef.current) {
      isStoringConnectionRef.current = true;
      
      axios.delete(`http://localhost:3000/instagram-connection/${currentUser.uid}`)
        .then(() => {
          console.log(`[${new Date().toISOString()}] Successfully removed Instagram connection from backend for user ${currentUser.uid}`);
        })
        .catch(error => {
          console.error(`[${new Date().toISOString()}] Failed to remove Instagram connection from backend:`, error);
        })
        .finally(() => {
          isStoringConnectionRef.current = false;
        });
    }
    
    setIsConnected(false);
    console.log(`[${new Date().toISOString()}] Instagram disconnected for user ${currentUser?.uid}`);
  };

  return (
    <div className={`instagram-connect ${className}`}>
      {isConnected ? (
        <button 
          className="disconnect-button" 
          onClick={disconnectInstagram}
        >
          Disconnect Instagram
        </button>
      ) : (
        <button 
          className="connect-button" 
          onClick={connectToInstagram}
          disabled={isConnecting || !currentUser}
        >
          {isConnecting ? 'Connecting...' : 'Connect Instagram'}
        </button>
      )}
    </div>
  );
};

export default InstagramConnect;