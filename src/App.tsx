import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Twitter from './pages/Twitter';
import Dashboard from './components/instagram/Dashboard';
import PlatformDashboard from './components/dashboard/PlatformDashboard';
import Login from './components/auth/Login';
import PrivateRoute from './components/auth/PrivateRoute';
import AuthRoute from './components/auth/AuthRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstagramProvider } from './context/InstagramContext';
import { TwitterProvider } from './context/TwitterContext';
import axios from 'axios';
import { syncInstagramConnection, isInstagramDisconnected } from './utils/instagramSessionManager';

// Main App component with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <InstagramProvider>
        <TwitterProvider>
          <AppContent />
        </TwitterProvider>
      </InstagramProvider>
    </AuthProvider>
  );
};

// Inner component that can use the auth context
const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [accountHolder, setAccountHolder] = useState('');
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [accountType, setAccountType] = useState<'branding' | 'non-branding'>('branding');
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);
  
  // Extract from location state
  const { accountHolder: extractedAccountHolder, competitors: extractedCompetitors, userId: extractedUserId, accountType: extractedAccountType } = location.state || { 
    accountHolder: '', 
    competitors: [], 
    userId: undefined,
    accountType: 'branding'
  };
  
  const isLoginPage = location.pathname === '/login';

  // Determine current platform based on route
  const currentPlatform = location.pathname.includes('twitter') ? 'twitter' : 'instagram';

  // Update state when location state changes
  useEffect(() => {
    if (extractedAccountHolder) setAccountHolder(extractedAccountHolder);
    if (extractedCompetitors) setCompetitors(extractedCompetitors);
    if (extractedAccountType) setAccountType(extractedAccountType);
    if (extractedUserId) setUserId(extractedUserId);
  }, [extractedAccountHolder, extractedCompetitors, extractedAccountType, extractedUserId]);

  // Sync Instagram connection when user logs in
  useEffect(() => {
    const syncUserConnection = async () => {
      if (currentUser?.uid) {
        try {
          // Skip sync if the user has explicitly disconnected Instagram
          if (isInstagramDisconnected(currentUser.uid)) {
            console.log(`[${new Date().toISOString()}] User ${currentUser.uid} has previously disconnected Instagram, skipping connection sync`);
            return;
          }
          
          await syncInstagramConnection(currentUser.uid);
          console.log(`[${new Date().toISOString()}] Synced Instagram connection for user ${currentUser.uid}`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error syncing Instagram connection:`, error);
        }
      }
    };
    
    syncUserConnection();
  }, [currentUser]);

  // Try to load user data if logged in but no account info
  useEffect(() => {
    if (currentUser?.uid && !accountHolder && (location.pathname.includes('dashboard') || location.pathname.includes('twitter-dashboard'))) {
      setIsLoadingUserData(true);
      
      const fetchUserStatus = async () => {
        try {
          // Determine which platform to check based on URL
          const isTwitterDashboard = location.pathname.includes('twitter');
          const endpoint = isTwitterDashboard 
            ? `http://localhost:3000/user-twitter-status/${currentUser.uid}`
            : `http://localhost:3000/user-instagram-status/${currentUser.uid}`;
          
          const response = await axios.get(endpoint);
          
          const hasEnteredUsername = isTwitterDashboard 
            ? response.data.hasEnteredTwitterUsername
            : response.data.hasEnteredInstagramUsername;
          
          if (hasEnteredUsername) {
            const savedUsername = isTwitterDashboard 
              ? response.data.twitter_username
              : response.data.instagram_username;
            const savedCompetitors = response.data.competitors || [];
            const savedAccountType = response.data.accountType || 'branding';
            
            console.log(`Retrieved saved ${isTwitterDashboard ? 'Twitter' : 'Instagram'} data for ${currentUser.uid}:`, {
              username: savedUsername,
              accountType: savedAccountType
            });
            
            // Navigate to the correct dashboard with the saved data
            navigate(location.pathname, {
              state: {
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: savedAccountType,
                platform: isTwitterDashboard ? 'twitter' : 'instagram'
              },
              replace: true
            });
          } else {
            // User hasn't set up the platform yet, redirect to setup page
            navigate(isTwitterDashboard ? '/twitter' : '/instagram');
          }
        } catch (error) {
          console.error('Error fetching user status:', error);
          navigate(location.pathname.includes('twitter') ? '/twitter' : '/instagram');
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
        {!isLoginPage && <LeftBar accountHolder={accountHolder} userId={userId} platform={currentPlatform} />}
        <div className={`content-area ${isLoginPage ? 'full-width' : ''}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <AuthRoute>
                  <Instagram />
                </AuthRoute>
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
              path="/twitter"
              element={
                <PrivateRoute>
                  <Twitter />
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
            <Route
              path="/twitter-dashboard"
              element={
                <PrivateRoute>
                  <PlatformDashboard 
                    accountHolder={accountHolder} 
                    competitors={competitors} 
                    accountType={accountType || 'branding'}
                    platform="twitter"
                  />
                </PrivateRoute>
              }
            />
            <Route
              path="/twitter-non-branding-dashboard"
              element={
                <PrivateRoute>
                  <PlatformDashboard 
                    accountHolder={accountHolder} 
                    competitors={[]} 
                    accountType="non-branding"
                    platform="twitter"
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