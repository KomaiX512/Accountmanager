import React, { useEffect, useState } from 'react';
import { useLinkedIn } from '../../context/LinkedInContext';
import { useAuth } from '../../context/AuthContext';
import LinkedInConnect from './LinkedInConnect';
import PlatformDashboard from '../dashboard/PlatformDashboard';

import axios from 'axios';
import './LinkedInProfile.css';

interface LinkedInDashboardProps {
  accountHolder: string;
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const LinkedInDashboard: React.FC<LinkedInDashboardProps> = ({ accountHolder, onOpenChat }) => {
  const { isConnected, connectLinkedIn } = useLinkedIn();
  const { currentUser } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasSetupLinkedIn, setHasSetupLinkedIn] = useState(false);

  // Initialize LinkedIn by syncing the REAL LinkedIn username only (no cross-platform fallbacks)
  useEffect(() => {
    const initializeLinkedIn = async () => {
      if (!currentUser?.uid) {
        setIsInitializing(false);
        return;
      }

      try {
        // 1) Check server for LinkedIn claimed status
        const response = await axios.get(`/api/user-linkedin-status/${currentUser.uid}`);
        const hasEnteredUsername = response.data?.hasEnteredLinkedInUsername === true;

        if (hasEnteredUsername) {
          const savedUsername = response.data?.linkedin_username || '';
          if (savedUsername) {
            // Persist to localStorage for platform-specific usage
            localStorage.setItem(`linkedin_username_${currentUser.uid}`, savedUsername);
            localStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
            setHasSetupLinkedIn(true);

            // 2) Auto-connect context if not connected yet using deterministic id
            if (!isConnected) {
              const stableId = `linkedin_user_${currentUser.uid}`;
              connectLinkedIn(stableId, savedUsername);
              console.log('✅ LinkedIn connected with verified username');
            }
          } else {
            setHasSetupLinkedIn(false);
          }
        } else {
          // Do NOT auto-create a username from other platforms; require proper LinkedIn entry
          setHasSetupLinkedIn(false);
        }
      } catch (error) {
        console.error('❌ Error initializing LinkedIn:', error);
        // Continue gracefully to connection screen
      } finally {
        setIsInitializing(false);
      }
    };

    initializeLinkedIn();
  }, [currentUser?.uid, isConnected, connectLinkedIn]);

  // Show loading while initializing
  if (isInitializing) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-logo">
            <img 
              src="/Logo/logo.png" 
              alt="Logo" 
              className="dashboard-logo"
            />
            {/* Removed redundant LinkedIn title to allow hero welcome to be primary */}
          </div>
          {onOpenChat && (
            <button onClick={() => onOpenChat('', 'linkedin')} className="close-button">×</button>
          )}
        </div>
        
        <div className="connection-container">
          <div className="connection-card">
            <h2>Initializing LinkedIn Dashboard...</h2>
            <p>Setting up your professional workspace...</p>
            <div className="loading-spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  // Render connection screen if not connected (fallback)
  if (!isConnected && !hasSetupLinkedIn) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-logo">
            <img 
              src="/Logo/logo.png" 
              alt="Logo" 
              className="dashboard-logo"
            />
            {/* Removed redundant LinkedIn title to allow hero welcome to be primary */}
          </div>
          {onOpenChat && (
            <button onClick={() => onOpenChat('', 'linkedin')} className="close-button">×</button>
          )}
        </div>
        
        <div className="connection-container">
          <div className="connection-card">
            <h2>Connect Your LinkedIn Account</h2>
            <p>Connect your LinkedIn account to access professional insights, networking features, and industry connections.</p>
            <LinkedInConnect />
          </div>
        </div>
      </div>
    );
  }

  // LinkedIn-specific dashboard with profile display
  return (
    <div className="linkedin-dashboard-container">
      <div className="dashboard-header">
        <div className="header-logo">
          <img 
            src="/Logo/logo.png" 
            alt="Logo" 
            className="dashboard-logo"
          />
            {/* Removed redundant LinkedIn title to allow hero welcome to be primary */}
        </div>
        {onOpenChat && (
          <button onClick={() => onOpenChat('', 'linkedin')} className="close-button">×</button>
        )}
      </div>
      
      <div className="linkedin-dashboard-content">
        {/* LinkedIn Profile Bar */}
        
        {/* LinkedIn Profile Details */}
 
    {/* Platform Dashboard for other features */}
        <div className="platform-dashboard-wrapper">
          <PlatformDashboard 
            platform="linkedin"
            accountHolder={currentUser?.uid ? (localStorage.getItem(`linkedin_username_${currentUser.uid}`) || accountHolder) : accountHolder}
            competitors={[]} // LinkedIn competitors would be set separately
            accountType="professional" // Default to professional for LinkedIn
            // Show the standard hero welcome like other platforms
            onOpenChat={onOpenChat}
          />
        </div>
      </div>
    </div>
  );
};

export default LinkedInDashboard;
