import React, { useState, useEffect, useRef } from 'react';
import './TwitterConnect.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

interface TwitterConnectProps {
  onConnected?: (twitterId: string, username: string) => void;
  className?: string;
}

const TwitterConnect: React.FC<TwitterConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [twitterUsername, setTwitterUsername] = useState<string>('');
  const { currentUser } = useAuth();
  const isStoringConnectionRef = useRef(false);
  const connectionDataRef = useRef<{ twitter_user_id: string; username?: string } | null>(null);
  
  useEffect(() => {
    // Check if user already has Twitter connected
    if (currentUser?.uid) {
      checkTwitterConnection();
    }
  }, [currentUser]);

  useEffect(() => {
    // Listen for OAuth redirect message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'TWITTER_CONNECTED' && event.data.userId && event.data.username) {
        console.log(`[${new Date().toISOString()}] Received Twitter connection message:`, event.data);
        
        // Ensure we have a current user to bind the Twitter connection to
        if (!currentUser?.uid) {
          console.error(`[${new Date().toISOString()}] Cannot store Twitter connection: No authenticated user`);
          setIsConnecting(false);
          return;
        }
        
        // Check if we're already storing this data to avoid duplicate requests
        const isEqualToCurrentData = 
          connectionDataRef.current && 
          connectionDataRef.current.twitter_user_id === event.data.userId;
        
        // Store connection data
        if (!isStoringConnectionRef.current && !isEqualToCurrentData) {
          const connectionData = {
            twitter_user_id: event.data.userId,
            username: event.data.username
          };
          
          // Update ref to prevent duplicate requests
          connectionDataRef.current = connectionData;
          isStoringConnectionRef.current = true;
          
          axios.post(`http://localhost:3000/twitter-connection/${currentUser.uid}`, connectionData)
            .then(() => {
              console.log(`[${new Date().toISOString()}] Successfully stored Twitter connection in backend for user ${currentUser.uid}`);
              setIsConnected(true);
              setTwitterUsername(event.data.username);
              
              if (onConnected) {
                onConnected(event.data.userId, event.data.username);
              }
            })
            .catch(error => {
              console.error(`[${new Date().toISOString()}] Failed to store Twitter connection in backend:`, error);
            })
            .finally(() => {
              isStoringConnectionRef.current = false;
              setIsConnecting(false);
            });
        } else {
          // Already connected or storing, just update UI
          setIsConnected(true);
          setTwitterUsername(event.data.username);
          setIsConnecting(false);
          
          if (onConnected) {
            onConnected(event.data.userId, event.data.username);
          }
        }
      } else {
        console.error(`[${new Date().toISOString()}] Invalid Twitter connection message:`, event.data);
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnected, currentUser]);

  const checkTwitterConnection = async () => {
    if (!currentUser?.uid) return;
    
    try {
      const response = await axios.get(`http://localhost:3000/twitter-connection/${currentUser.uid}`);
      if (response.data?.twitter_user_id) {
        setIsConnected(true);
        setTwitterUsername(response.data.username || 'Twitter User');
        console.log(`[${new Date().toISOString()}] Found existing Twitter connection for user ${currentUser.uid}`);
      }
    } catch (error) {
      // User doesn't have Twitter connected, which is fine
      console.log('No Twitter connection found for user');
    }
  };

  const connectToTwitter = async () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot connect Twitter: No authenticated user`);
      return;
    }
    
    setIsConnecting(true);
    
    try {
      console.log(`[${new Date().toISOString()}] Initiating Twitter OAuth flow...`);
      
      // Step 1: Get authorization URL from backend
      const response = await axios.get(`http://localhost:3000/twitter/auth?userId=${currentUser.uid}`);
      const { authUrl } = response.data;
      
      if (!authUrl) {
        throw new Error('Failed to get Twitter authorization URL');
      }
      
      console.log(`[${new Date().toISOString()}] Opening Twitter OAuth popup: ${authUrl}`);
      
      // Open popup for Twitter OAuth
      const width = 600;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      window.open(
        authUrl,
        'twitter-auth',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
      );
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error initiating Twitter OAuth:`, error);
      setIsConnecting(false);
      
      // Show user-friendly error message
      alert('Failed to connect to Twitter. Please try again.');
    }
  };

  const handleDisconnect = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot disconnect Twitter: No authenticated user`);
      return;
    }
    
    // Reset connection data ref
    connectionDataRef.current = null;
    
    // Remove from backend
    if (currentUser?.uid && !isStoringConnectionRef.current) {
      isStoringConnectionRef.current = true;
      
      axios.delete(`http://localhost:3000/twitter-connection/${currentUser.uid}`)
        .then(() => {
          console.log(`[${new Date().toISOString()}] Successfully removed Twitter connection from backend for user ${currentUser.uid}`);
          setIsConnected(false);
          setTwitterUsername('');
        })
        .catch(error => {
          console.error(`[${new Date().toISOString()}] Failed to remove Twitter connection from backend:`, error);
        })
        .finally(() => {
          isStoringConnectionRef.current = false;
        });
    }
    
    console.log(`[${new Date().toISOString()}] Twitter disconnected for user ${currentUser?.uid}`);
  };

  return (
    <div className={`twitter-connect ${className}`}>
      {isConnected ? (
        <button 
          className="twitter-disconnect-button" 
          onClick={handleDisconnect}
        >
          <svg className="twitter-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Disconnect X ({twitterUsername})
        </button>
      ) : (
        <button 
          className="twitter-connect-button" 
          onClick={connectToTwitter}
          disabled={isConnecting || !currentUser}
        >
          <svg className="twitter-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          {isConnecting ? 'Connecting...' : 'Connect X'}
        </button>
      )}
    </div>
  );
};

export default TwitterConnect; 