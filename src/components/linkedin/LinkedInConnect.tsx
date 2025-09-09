import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLinkedIn } from '../../context/LinkedInContext';
import './LinkedInConnect.css';

interface LinkedInConnectProps {
  onConnected?: () => void;
}

const LinkedInConnect: React.FC<LinkedInConnectProps> = ({ onConnected }) => {
  const { currentUser } = useAuth();
  const { isConnected, connectLinkedIn } = useLinkedIn();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!currentUser) return;
    
    setIsConnecting(true);
    
    try {
      // For now, this is a dummy implementation
      // In the future, this would integrate with LinkedIn OAuth API
      console.log('LinkedIn connection initiated (dummy implementation)');
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate a dummy LinkedIn ID and username for now
      const dummyLinkedInId = `linkedin_${Date.now()}`;
      const dummyUsername = currentUser.email?.split('@')[0] || 'linkedinuser';
      
      // Connect LinkedIn through context
      connectLinkedIn(dummyLinkedInId, dummyUsername);
      
      // Mark as accessed in localStorage
      localStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
      
      console.log('LinkedIn connected successfully (dummy)');
      
      if (onConnected) {
        onConnected();
      }
    } catch (error) {
      console.error('LinkedIn connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  if (isConnected) {
    return (
      <div className="linkedin-connect-container">
        <div className="linkedin-connected-status dashboard-btn linkedin" aria-live="polite">
          <svg className="connection-icon btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
          </svg>
          <span>LinkedIn Connected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="linkedin-connect-container">
      <button 
        className="linkedin-connect-button dashboard-btn linkedin" 
        onClick={handleConnect}
        disabled={isConnecting || !currentUser}
        aria-label={isConnecting ? 'Connecting to LinkedIn' : 'Connect LinkedIn'}
      >
        <svg className="linkedin-icon btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
        </svg>
        {isConnecting ? 'Connecting...' : 'Connect LinkedIn'}
      </button>
    </div>
  );
};

export default LinkedInConnect;
