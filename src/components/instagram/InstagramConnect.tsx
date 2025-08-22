import React, { useState, useEffect, useRef } from 'react';
import './InstagramConnect.css';
import InstagramPermissionModal from './InstagramPermissionModal';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useInstagram } from '../../context/InstagramContext';
import {
  getInstagramConnection,
  storeInstagramConnection,
  clearInstagramConnection,
  isInstagramDisconnected
} from '../../utils/instagramSessionManager';

interface InstagramConnectProps {
  onConnected?: (graphId: string, userId: string) => void;
  className?: string;
}

const InstagramConnect: React.FC<InstagramConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['instagram_business_basic']);
  const togglePermission = (perm: string) => {
    setSelectedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };
  const { currentUser } = useAuth();
  const { isConnected, connectInstagram, disconnectInstagram } = useInstagram();
  const isStoringConnectionRef = useRef(false);
  const connectionDataRef = useRef<{ instagram_user_id: string; instagram_graph_id: string; username?: string } | null>(null);
  
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
          
          axios.post(`/api/instagram-connection/${currentUser.uid}`, connectionData)
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
        
        // Update global context state
        connectInstagram(event.data.userId, event.data.graphId);
        
        // Also notify parent component if callback provided
        if (onConnected) {
          onConnected(event.data.graphId, event.data.userId);
        }
        
        setIsConnecting(false);
      } else {
        console.error(`[${new Date().toISOString()}] Invalid Instagram connection message:`, event.data);
      }
    };

    // ✅ FIX 1: Handle popup window closing without successful connection
    const handlePopupClosed = () => {
      // Check if we're in a connecting state but haven't received a connection message
      setTimeout(() => {
        if (isConnecting && !isConnected) {
          console.log(`[${new Date().toISOString()}] Instagram popup closed without successful connection, resetting state`);
          setIsConnecting(false);
        }
      }, 1000); // Small delay to allow for any pending messages
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handlePopupClosed);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handlePopupClosed);
    };
  }, [onConnected, currentUser, connectInstagram, isConnecting, isConnected]);

  // Open permission modal first
  const openPermissionModal = () => {
    setIsModalOpen(true);
  }

  const handleModalContinue = () => {
    setIsModalOpen(false);
    const appId = '1089716559763623';
    const redirectUri = 'https://b4bd9386ac7b.ngrok-free.app/instagram/callback';
    const scope = selectedPermissions.length > 0 ? selectedPermissions.join(',') : 'instagram_business_basic';
    const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;

    setIsConnecting(true);
    
    // Open popup for Instagram OAuth
    const width = 600;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'instagram-auth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    // ✅ FIX 1: Monitor popup window to detect if it's closed without successful connection
    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          // Only reset connecting state if we haven't successfully connected
          setTimeout(() => {
            if (isConnecting && !isConnected) {
              console.log(`[${new Date().toISOString()}] Instagram popup was closed without successful connection`);
              setIsConnecting(false);
            }
          }, 500);
        }
      }, 1000);
    }
  };



  

  const connectToInstagram = openPermissionModal;

  const handleDisconnect = () => {
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
      
      axios.delete(`/api/instagram-connection/${currentUser.uid}`)
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
    
    // Update global context state
    disconnectInstagram();
    
    console.log(`[${new Date().toISOString()}] Instagram disconnected for user ${currentUser?.uid}`);
  };

  return (
    <div className={`instagram-connect ${className}`}>
      {isConnected ? (
        <button 
          className="disconnect-button" 
          onClick={handleDisconnect}
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
      <InstagramPermissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onContinue={handleModalContinue}
        selectedPermissions={selectedPermissions}
        togglePermission={togglePermission}
      />
    </div>
  );
};

export default InstagramConnect;