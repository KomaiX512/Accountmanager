import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth status
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Authenticating...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!currentUser) {
    // Redirect to login page and save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render children if authenticated
  return <>{children}</>;
};

export default PrivateRoute; 