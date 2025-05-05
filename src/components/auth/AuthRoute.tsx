import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import IG_EntryUsernames from '../instagram/IG_EntryUsernames';

interface AuthRouteProps {
  children: React.ReactNode;
}

const AuthRoute: React.FC<AuthRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [instagramData, setInstagramData] = useState<{
    accountHolder: string;
    competitors: string[];
    accountType: 'branding' | 'non-branding';
  } | null>(null);

  useEffect(() => {
    // Only check if user has completed Instagram setup if they're logged in
    const checkInstagramStatus = async () => {
      if (!currentUser || !currentUser.uid) {
        setIsChecking(false);
        return;
      }

      try {
        const response = await axios.get(`http://localhost:3000/user-instagram-status/${currentUser.uid}`);
        if (response.data.hasEnteredInstagramUsername) {
          setHasCompletedSetup(true);
          setInstagramData({
            accountHolder: response.data.instagram_username,
            competitors: response.data.competitors || [],
            accountType: response.data.accountType || 'branding'
          });
        } else {
          setHasCompletedSetup(false);
        }
      } catch (error) {
        console.error('Error checking Instagram status:', error);
        setHasCompletedSetup(false);
      } finally {
        setIsChecking(false);
      }
    };

    if (!loading && currentUser) {
      checkInstagramStatus();
    } else if (!loading) {
      setIsChecking(false);
    }
  }, [currentUser, loading]);

  if (loading || isChecking) {
    // Show loading indicator while checking auth and Instagram status
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Loading your account...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user hasn't completed Instagram setup, show the setup form
  if (!hasCompletedSetup) {
    return <IG_EntryUsernames onSubmitSuccess={() => {}} />;
  }

  // If user has completed Instagram setup, redirect to dashboard based on account type
  if (instagramData) {
    const dashboardPath = instagramData.accountType === 'branding' 
      ? '/dashboard' 
      : '/non-branding-dashboard';
    
    return (
      <Navigate 
        to={dashboardPath} 
        state={{
          accountHolder: instagramData.accountHolder,
          competitors: instagramData.competitors,
          accountType: instagramData.accountType
        }} 
        replace 
      />
    );
  }

  // If all checks pass, render children
  return <>{children}</>;
};

export default AuthRoute; 