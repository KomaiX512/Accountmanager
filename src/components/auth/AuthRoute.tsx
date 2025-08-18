import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

interface AuthRouteProps {
  children: React.ReactNode;
}

const AuthRoute: React.FC<AuthRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(false);
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
        return;
      }

      try {
        const response = await axios.get(`/api/user-instagram-status/${currentUser.uid}`);
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
      }
    };

    if (!loading && currentUser) {
      // ✅ BACKGROUND VALIDATION - Start validation but don't block UI
      setIsChecking(true);
      checkInstagramStatus().finally(() => {
        setIsChecking(false);
      });
    }
  }, [currentUser, loading]);

  // ✅ NO LOADING SCREEN - Show content immediately while validating in background
  // Only show loading for initial auth loading, not for Instagram status checks
  
  if (loading) {
    // Show loading indicator only for initial authentication
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Authenticating...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Always render children (MainDashboard) after successful login
  // Instagram status validation happens in background without blocking UI
  return <>{children}</>;
};

export default AuthRoute; 