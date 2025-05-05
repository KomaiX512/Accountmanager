import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Dashboard from './components/instagram/Dashboard';
import Login from './components/auth/Login';
import PrivateRoute from './components/auth/PrivateRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import axios from 'axios';

// Main App component with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

// Inner component that can use the auth context
const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);
  
  // Extract from location state
  const { accountHolder, competitors = [], userId, accountType } = location.state || { 
    accountHolder: '', 
    competitors: [], 
    userId: undefined,
    accountType: undefined 
  };
  
  const isLoginPage = location.pathname === '/login';

  // Try to load user Instagram data if logged in but no account info
  useEffect(() => {
    if (currentUser?.uid && !accountHolder && location.pathname.includes('dashboard')) {
      setIsLoadingUserData(true);
      
      const fetchUserStatus = async () => {
        try {
          const response = await axios.get(`http://localhost:3000/user-instagram-status/${currentUser.uid}`);
          
          if (response.data.hasEnteredInstagramUsername) {
            const savedUsername = response.data.instagram_username;
            const savedCompetitors = response.data.competitors || [];
            const savedAccountType = response.data.accountType || 'branding';
            
            console.log(`Retrieved saved Instagram data for ${currentUser.uid}:`, {
              username: savedUsername,
              accountType: savedAccountType
            });
            
            // Navigate to the correct dashboard with the saved data
            navigate(location.pathname, {
              state: {
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: savedAccountType
              },
              replace: true
            });
          } else {
            // User hasn't set up Instagram yet, redirect to setup page
            navigate('/instagram');
          }
        } catch (error) {
          console.error('Error fetching user Instagram status:', error);
          navigate('/instagram');
        } finally {
          setIsLoadingUserData(false);
        }
      };
      
      fetchUserStatus();
    }
  }, [currentUser, accountHolder, location.pathname, navigate]);
  
  if (isLoadingUserData) {
    return <div className="loading-screen">Loading account information...</div>;
  }

  return (
    <div className="App">
      <TopBar />
      <div className="main-content">
        {!isLoginPage && <LeftBar accountHolder={accountHolder} userId={userId} />}
        <div className={`content-area ${isLoginPage ? 'full-width' : ''}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Instagram />
                </PrivateRoute>
              }
            />
            <Route
              path="/instagram"
              element={
                <PrivateRoute>
                  <Instagram />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard 
                    accountHolder={accountHolder} 
                    competitors={competitors} 
                    accountType={accountType || 'branding'} 
                  />
                </PrivateRoute>
              }
            />
            <Route
              path="/non-branding-dashboard"
              element={
                <PrivateRoute>
                  <Dashboard 
                    accountHolder={accountHolder} 
                    competitors={[]} 
                    accountType="non-branding" 
                  />
                </PrivateRoute>
              }
            />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default App;