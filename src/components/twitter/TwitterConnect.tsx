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

  const checkTwitterConnection = async () => {
    if (!currentUser?.uid) return;
    
    try {
      const response = await axios.get(`http://localhost:3000/twitter-connection/${currentUser.uid}`);
      if (response.data?.twitter_user_id) {
        setIsConnected(true);
        setTwitterUsername(response.data.username || 'Twitter User');
      }
    } catch (error) {
      // User doesn't have Twitter connected, which is fine
      console.log('No Twitter connection found for user');
    }
  };

  const connectToTwitter = () => {
    if (!currentUser) {
      console.error(`[${new Date().toISOString()}] Cannot connect Twitter: No authenticated user`);
      return;
    }
    
    // For now, we'll simulate a Twitter connection since Twitter API requires approval
    // In a real implementation, this would use Twitter OAuth 2.0
    setIsConnecting(true);
    
    // Simulate Twitter OAuth flow
    setTimeout(() => {
      const mockTwitterData = {
        twitter_user_id: `twitter_${Date.now()}`,
        username: 'twitter_user'
      };
      
      // Store connection data
      if (currentUser?.uid && !isStoringConnectionRef.current) {
        connectionDataRef.current = mockTwitterData;
        isStoringConnectionRef.current = true;
        
        axios.post(`http://localhost:3000/twitter-connection/${currentUser.uid}`, mockTwitterData)
          .then(() => {
            console.log(`[${new Date().toISOString()}] Successfully stored Twitter connection in backend for user ${currentUser.uid}`);
            setIsConnected(true);
            setTwitterUsername(mockTwitterData.username);
            
            if (onConnected) {
              onConnected(mockTwitterData.twitter_user_id, mockTwitterData.username);
            }
          })
          .catch(error => {
            console.error(`[${new Date().toISOString()}] Failed to store Twitter connection in backend:`, error);
          })
          .finally(() => {
            isStoringConnectionRef.current = false;
            setIsConnecting(false);
          });
      }
    }, 1500); // Simulate network delay
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
          Disconnect X
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