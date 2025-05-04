import React, { useState, useEffect, useRef } from 'react';
import './InstagramConnect.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

interface InstagramConnectProps {
  onConnected: (graphId: string, userId: string) => void;
}

// Local storage keys for Instagram connection data
const IG_TOKEN_KEY = 'instagram_token';
const IG_USER_ID_KEY = 'instagram_user_id';
const IG_GRAPH_ID_KEY = 'instagram_graph_id';
const IG_USERNAME_KEY = 'instagram_username';

const InstagramConnect: React.FC<InstagramConnectProps> = ({ onConnected }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { currentUser } = useAuth();
  // Use a ref to track if we're currently trying to store connection data
  const isStoringConnectionRef = useRef(false);
  // Track connection data to avoid sending duplicate requests
  const connectionDataRef = useRef<{ instagram_user_id: string; instagram_graph_id: string; username?: string } | null>(null);

  // Check for stored connection on component mount
  useEffect(() => {
    const checkSavedConnection = async () => {
      try {
        // First check localStorage for cached connection
        const userId = localStorage.getItem(IG_USER_ID_KEY);
        const graphId = localStorage.getItem(IG_GRAPH_ID_KEY);
        
        if (userId && graphId) {
          console.log(`[${new Date().toISOString()}] Found cached Instagram connection`);
          setIsConnected(true);
          // Notify parent component about the connection
          onConnected(graphId, userId);
          
          // Store connection data in ref to prevent duplicate requests
          connectionDataRef.current = {
            instagram_user_id: userId,
            instagram_graph_id: graphId,
            username: localStorage.getItem(IG_USERNAME_KEY) || undefined
          };
          return;
        }
        
        // If not in localStorage, check if we have a backend stored connection
        if (currentUser?.uid) {
          try {
            const response = await axios.get(`http://localhost:3000/instagram-connection/${currentUser.uid}`);
            if (response.data && response.data.instagram_user_id) {
              // Store in localStorage for faster access next time
              localStorage.setItem(IG_USER_ID_KEY, response.data.instagram_user_id);
              localStorage.setItem(IG_GRAPH_ID_KEY, response.data.instagram_graph_id);
              localStorage.setItem(IG_USERNAME_KEY, response.data.username || '');
              
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
            console.log(`[${new Date().toISOString()}] No stored Instagram connection found in backend`);
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
        
        // Store connection data in localStorage
        localStorage.setItem(IG_USER_ID_KEY, event.data.userId);
        localStorage.setItem(IG_GRAPH_ID_KEY, event.data.graphId);
        localStorage.setItem(IG_USERNAME_KEY, event.data.username || '');
        
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
              console.log(`[${new Date().toISOString()}] Successfully stored Instagram connection in backend`);
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
    // Clear localStorage
    localStorage.removeItem(IG_USER_ID_KEY);
    localStorage.removeItem(IG_GRAPH_ID_KEY);
    localStorage.removeItem(IG_USERNAME_KEY);
    localStorage.removeItem(IG_TOKEN_KEY);
    
    // Reset connection data ref
    connectionDataRef.current = null;
    
    // Also remove from backend, but only if not already in progress
    if (currentUser?.uid && !isStoringConnectionRef.current) {
      isStoringConnectionRef.current = true;
      
      axios.delete(`http://localhost:3000/instagram-connection/${currentUser.uid}`)
        .then(() => {
          console.log(`[${new Date().toISOString()}] Successfully removed Instagram connection from backend`);
        })
        .catch(error => {
          console.error(`[${new Date().toISOString()}] Failed to remove Instagram connection from backend:`, error);
        })
        .finally(() => {
          isStoringConnectionRef.current = false;
        });
    }
    
    setIsConnected(false);
    console.log(`[${new Date().toISOString()}] Instagram disconnected`);
  };

  return (
    <>
      {isConnected ? (
        <button 
          className="instagram-disconnect-btn" 
          onClick={disconnectInstagram}
        >
          Disconnect Instagram
        </button>
      ) : (
        <button 
          className="instagram-connect-btn" 
          onClick={connectToInstagram}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect Instagram'}
        </button>
      )}
    </>
  );
};

export default InstagramConnect;