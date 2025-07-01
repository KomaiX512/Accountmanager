import React, { useState, useEffect, useRef } from 'react';
import './FacebookConnect.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

interface FacebookConnectProps {
  onConnected?: (facebookId: string, username: string) => void;
  className?: string;
}

const FacebookConnect: React.FC<FacebookConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [facebookId, setFacebookId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const isStoringConnectionRef = useRef(false);
  const connectionDataRef = useRef<{ facebook_user_id: string; facebook_page_id: string; username?: string; access_token: string } | null>(null);
  
  useEffect(() => {
    // Check for existing Facebook connection when component mounts
    const checkExistingConnection = async () => {
      if (!currentUser?.uid) return;
      
      try {
        const response = await axios.get(`/api/facebook-connection/${currentUser.uid}`);
        if (response.data.facebook_page_id) {
          setFacebookId(response.data.facebook_page_id);
          setUsername(response.data.username || null);
          setIsConnected(true);
          console.log(`[${new Date().toISOString()}] Restored Facebook connection:`, {
            facebookId: response.data.facebook_page_id,
            username: response.data.username
          });
        }
      } catch (error: any) {
        if (error.response?.status !== 404) {
          console.error(`[${new Date().toISOString()}] Error checking existing Facebook connection:`, error);
        }
      }
    };
    
    checkExistingConnection();
  }, [currentUser?.uid]);
  
  useEffect(() => {
    // Listen for OAuth redirect message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FACEBOOK_CONNECTED' && event.data.facebookId) {
        console.log(`[${new Date().toISOString()}] Received Facebook connection message:`, event.data);
        
        // Ensure we have a current user to bind the Facebook connection to
        if (!currentUser?.uid) {
          console.error(`[${new Date().toISOString()}] Cannot store Facebook connection: No authenticated user`);
          setIsConnecting(false);
          return;
        }
        
        // Check if we're already storing this data to avoid duplicate requests
        const isEqualToCurrentData = 
          connectionDataRef.current && 
          connectionDataRef.current.facebook_page_id === event.data.facebookId;
        
        // Store in backend for persistence across devices, but only if not already storing
        if (currentUser?.uid && !isStoringConnectionRef.current && !isEqualToCurrentData) {
          const connectionData = {
            facebook_user_id: event.data.userId || event.data.facebookId, // User ID (may be same as page ID for now)
            facebook_page_id: event.data.facebookId, // Page ID (this is what OAuth sends as facebookId)
            username: event.data.username || event.data.facebookId,
            access_token: event.data.accessToken || 'temp-token' // Temporary token for now
          };
          
          // Update ref to prevent duplicate requests
          connectionDataRef.current = connectionData;
          isStoringConnectionRef.current = true;
          
          axios.post(`/api/facebook-connection/${currentUser.uid}`, connectionData)
            .then(() => {
              console.log(`[${new Date().toISOString()}] Successfully stored Facebook connection in backend for user ${currentUser.uid}`);
            })
            .catch(error => {
              console.error(`[${new Date().toISOString()}] Failed to store Facebook connection in backend:`, error);
            })
            .finally(() => {
              isStoringConnectionRef.current = false;
            });
        }
        
        // Update local state
        setFacebookId(event.data.facebookId);
        setUsername(event.data.username || event.data.facebookId);
        setIsConnected(true);
        
        // Also notify parent component if callback provided
        if (onConnected) {
          onConnected(event.data.facebookId, event.data.username || event.data.facebookId);
        }
        
        setIsConnecting(false);
      } else {
        console.error(`[${new Date().toISOString()}] Invalid Facebook connection message:`, event.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnected, currentUser]);

  const connectToFacebook = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot connect Facebook: No authenticated user`);
      return;
    }
    
    // Facebook OAuth configuration
    const appId = '581584257679639';
    const redirectUri = 'https://1d68-121-52-146-243.ngrok-free.app/facebook/callback';
    const scope = 'pages_messaging,pages_show_list,pages_manage_posts,pages_manage_metadata,pages_manage_engagement,pages_read_engagement,pages_read_user_content,instagram_manage_messages,instagram_content_publish,instagram_manage_comments,instagram_manage_insights';
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${currentUser.uid}`;

    setIsConnecting(true);
    
    // Open popup for Facebook OAuth
    const width = 600;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl,
      'facebook-auth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  };

  const handleDisconnect = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot disconnect Facebook: No authenticated user`);
      return;
    }
    
    // Reset connection data ref
    connectionDataRef.current = null;
    
    // Remove from backend, but only if not already in progress
    if (currentUser?.uid && !isStoringConnectionRef.current) {
      isStoringConnectionRef.current = true;
      
      axios.delete(`/api/facebook-connection/${currentUser.uid}`)
        .then(() => {
          console.log(`[${new Date().toISOString()}] Successfully removed Facebook connection from backend for user ${currentUser.uid}`);
        })
        .catch(error => {
          console.error(`[${new Date().toISOString()}] Failed to remove Facebook connection from backend:`, error);
        })
        .finally(() => {
          isStoringConnectionRef.current = false;
        });
    }
    
    // Update local state
    setFacebookId(null);
    setUsername(null);
    setIsConnected(false);
    
    console.log(`[${new Date().toISOString()}] Facebook disconnected for user ${currentUser?.uid}`);
  };

  return (
    <div className={`facebook-connect ${className}`}>
      {isConnected ? (
        <button 
          className="facebook-disconnect-button" 
          onClick={handleDisconnect}
        >
          Disconnect Facebook
        </button>
      ) : (
        <button 
          className="facebook-connect-button" 
          onClick={connectToFacebook}
          disabled={isConnecting || !currentUser}
        >
          {isConnecting ? 'Connecting...' : 'Connect Facebook'}
        </button>
      )}
    </div>
  );
};

export default FacebookConnect; 