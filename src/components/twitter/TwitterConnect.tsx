import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TwitterConnect.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTwitter } from '../../context/TwitterContext';

interface TwitterConnectProps {
  onConnected?: (twitterId: string, username: string) => void;
  className?: string;
}

const TwitterConnect: React.FC<TwitterConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [twitterUsername, setTwitterUsername] = useState<string>('');
  const { currentUser } = useAuth();
  const { connectTwitter, refreshConnection } = useTwitter();
  const isStoringConnectionRef = useRef(false);
  const connectionDataRef = useRef<{ twitter_user_id: string; username?: string } | null>(null);
  
  const checkTwitterConnection = useCallback(async () => {
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
  }, [currentUser?.uid]);
  
  useEffect(() => {
    // Check if user already has Twitter connected
    if (currentUser?.uid) {
      checkTwitterConnection();
    }
  }, [currentUser?.uid, checkTwitterConnection]);

  useEffect(() => {
    // Listen for OAuth redirect message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'TWITTER_CONNECTED' && event.data.userId && event.data.username) {
        console.log(`[${new Date().toISOString()}] Received Twitter connection message:`, event.data);
        
        // Store connection data
        connectionDataRef.current = {
          twitter_user_id: event.data.userId,
          username: event.data.username
        };
        
        if (!isStoringConnectionRef.current && currentUser?.uid) {
          isStoringConnectionRef.current = true;
          
          // Store connection in backend
          axios.post(`http://localhost:3000/twitter-connection/${currentUser.uid}`, {
            twitter_user_id: event.data.userId,
            username: event.data.username
          })
          .then(() => {
            console.log(`[${new Date().toISOString()}] Successfully stored Twitter connection in backend`);
            setIsConnected(true);
            setTwitterUsername(event.data.username);
            setIsConnecting(false);
            
            // Update Twitter context
            connectTwitter(event.data.userId, event.data.username);
            
            if (onConnected) {
              onConnected(event.data.userId, event.data.username);
            }
          })
          .catch(error => {
            console.error(`[${new Date().toISOString()}] Failed to store Twitter connection in backend:`, error);
            setIsConnecting(false);
          })
          .finally(() => {
            isStoringConnectionRef.current = false;
          });
        } else {
          // Already connected or storing, just update UI
          setIsConnected(true);
          setTwitterUsername(event.data.username);
          setIsConnecting(false);
          
          // Update Twitter context
          connectTwitter(event.data.userId, event.data.username);
          
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
  }, [onConnected, currentUser?.uid]); // Only depend on currentUser?.uid

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