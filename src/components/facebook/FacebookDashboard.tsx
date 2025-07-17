import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import FacebookConnect from './FacebookConnect';
import PlatformDashboard from '../dashboard/PlatformDashboard';

interface FacebookDashboardProps {
  accountHolder: string;
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const FacebookDashboard: React.FC<FacebookDashboardProps> = ({ accountHolder, onOpenChat }) => {
  const { currentUser } = useAuth();
  const { userId: facebookPageId, isConnected } = useFacebook();
  
  // State management (simplified - notifications handled by PlatformDashboard)
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [isComponentMounted, setIsComponentMounted] = useState(false);
  
  // Post scheduling state
  const [scheduleForm, setScheduleForm] = useState({
    caption: '',
    scheduleDate: '',
    image: null as File | null
  });

  // Component mount effect to prevent lexical declaration issues

  // Component mount effect
  useEffect(() => {
    setIsComponentMounted(true);
    return () => {
      setIsComponentMounted(false);
    };
  }, []);

  // REMOVED: Notification fetching is now handled by PlatformDashboard
  // This prevents duplicate API calls and ensures notifications are displayed correctly

  // REMOVED: All notification and scheduling functions are now handled by PlatformDashboard
  // This prevents duplicate functionality and ensures consistent behavior

  // Render connection screen if not connected
  if (!isConnected) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-logo">
            <img 
              src="/Logo/logo.png" 
              alt="Logo" 
              className="dashboard-logo"
            />
            <h1>Facebook Dashboard</h1>
          </div>
          {onOpenChat && (
            <button onClick={() => onOpenChat('', 'facebook')} className="close-button">×</button>
          )}
        </div>
        
        <div className="connection-container">
          <div className="connection-card">
            <h2>Connect Your Facebook Account</h2>
            <p>Connect your Facebook page to manage messages, comments, and schedule posts.</p>
            <FacebookConnect />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlatformDashboard 
            platform="facebook"
      accountHolder={accountHolder}
      competitors={[]} // Facebook competitors would be set separately
      accountType="branding" // Default to branding for Facebook
      onOpenChat={onOpenChat}
    />
  );
};

export default FacebookDashboard; 