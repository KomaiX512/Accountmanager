import React, { useState, useEffect, useRef } from 'react';
import './FacebookConnect.css';
import FacebookPermissionModal from './FacebookPermissionModal';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

// Facebook OAuth configuration from environment or defaults
const FB_APP_ID = process.env.REACT_APP_FACEBOOK_APP_ID || '676612308718574';
const FB_REDIRECT_URI = process.env.REACT_APP_FACEBOOK_REDIRECT_URI || 'https://c38b57a675c1.ngrok-free.app/facebook/callback';
const FB_API_VERSION = process.env.REACT_APP_FACEBOOK_API_VERSION || 'v17.0';

/**
 * List of Facebook Page permissions that can be optionally requested.
 * Only permissions selected by the user will be included in the `scope` param
 * passed to Facebook OAuth. NEVER add additional permissions without explicit
 * approval – doing so will break GDPR / Meta policy compliance.
 * See https://developers.facebook.com/docs/graph-api/reference/permission
 */
const FB_PERMISSION_OPTIONS: { key: string; label: string; default?: boolean }[] = [
  { key: 'public_profile',       label: 'Basic profile (required)',                              default: true },
  { key: 'pages_show_list',      label: 'Show list of Pages you manage',                         default: true },
  { key: 'pages_messaging',      label: 'Manage and access Page conversations on Messenger' },
  { key: 'pages_manage_posts',   label: 'Create and manage content on your Page' },
  { key: 'pages_read_engagement',label: 'Read content posted on the Page' }
];

interface FacebookConnectProps {
  onConnected?: (facebookId: string, username: string) => void;
  className?: string;
}

const FacebookConnect: React.FC<FacebookConnectProps> = ({ onConnected, className = '' }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [facebookId, setFacebookId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const { currentUser } = useAuth();

  // Modal visibility
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Track permissions selected by the user. Defaults are those flagged `default: true` above.
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    FB_PERMISSION_OPTIONS.filter(p => p.default).map(p => p.key)
  );

  /**
   * Toggles a permission in the `selectedPermissions` state array.
   */
  const togglePermission = (permission: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };
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
          return;
        }
        
        // Check if we're already storing this data to avoid duplicate requests
        const isEqualToCurrentData = 
          connectionDataRef.current && 
          connectionDataRef.current.facebook_page_id === event.data.facebookId;
        
        // Store in backend for persistence across devices, but only if not already storing
        if (currentUser?.uid && !isStoringConnectionRef.current && !isEqualToCurrentData && event.data.accessToken) {
          const connectionData = {
            facebook_user_id: event.data.userId || event.data.facebookId, // User ID (may be same as page ID for now)
            facebook_page_id: event.data.facebookId, // Page ID (this is what OAuth sends as facebookId)
            username: event.data.username || event.data.facebookId,
            access_token: event.data.accessToken // Use real access token from OAuth
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
        } else if (!event.data.accessToken) {
          console.error(`[${new Date().toISOString()}] Facebook OAuth completed but no access token received. This indicates an OAuth error.`);
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
    
    // Build OAuth URL
        // Build scope param from user-selected permissions (always include at least `public_profile`)
    const scopeList = selectedPermissions.length > 0 ? selectedPermissions : ['public_profile'];
    const scopeParam = encodeURIComponent(scopeList.join(','));
    const authUrl = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&scope=${scopeParam}&response_type=code&state=${currentUser.uid}`;

    // Connecting state management removed as it's no longer used
    
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
        <>
          <div className="facebook-connected-info">
            Connected to Facebook as <strong>{username || facebookId}</strong>
          </div>
          <button 
            className="facebook-disconnect-button" 
            onClick={handleDisconnect}
          >
            Disconnect Facebook
          </button>
        </>
      ) : (
        <>
          {/* Permission modal */}
          <FacebookPermissionModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onContinue={() => {
              setIsModalOpen(false);
              connectToFacebook();
            }}
            selectedPermissions={selectedPermissions}
            togglePermission={togglePermission}
          />
          {/* Permission selector moved to modal */}<div style={{ display: 'none' }}>
            {FB_PERMISSION_OPTIONS.map(option => (
              <label key={option.key} className="permission-option">
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(option.key)}
                  disabled={option.default}
                  onChange={() => togglePermission(option.key)}
                />
                {option.label}
              </label>
            ))}
            <div className="privacy-link">
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                View our Privacy Policy
              </a>
            </div>
          </div>

                    {/* ===== CONNECT BUTTON ===== */}
          <button 
            className="facebook-connect-button" 
            onClick={() => setIsModalOpen(true)}
            disabled={!currentUser}
          >
            {'Connect Facebook'}
          </button>
        </>
      )}
    </div>
  );
};

export default FacebookConnect;