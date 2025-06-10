import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import './styles/global-ui-refinements.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Twitter from './pages/Twitter';
import Dashboard from './components/instagram/Dashboard';
import PlatformDashboard from './components/dashboard/PlatformDashboard';
import MainDashboard from './components/dashboard/MainDashboard';
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
  
  // Memoize location state extraction to prevent infinite re-renders
  const locationStateValues = useMemo(() => {
    const state = location.state || {};
    return {
      extractedAccountHolder: state.accountHolder || '',
      extractedCompetitors: state.competitors || [],
      extractedUserId: state.userId || undefined,
      extractedAccountType: state.accountType || 'branding'
    };
  }, [location.state]);
  
  const { extractedAccountHolder, extractedCompetitors, extractedUserId, extractedAccountType } = locationStateValues;
  
  const isLoginPage = location.pathname === '/login';
  const isAccountPage = location.pathname === '/account';
  const isEntryPage = location.pathname.includes('/setup') || location.pathname.includes('/connect') || location.pathname.includes('/entry');
  const shouldHideLeftBar = isLoginPage || isAccountPage || isEntryPage;

  // Determine current platform based on route
  const currentPlatform = location.pathname.includes('twitter') ? 'twitter' : 'instagram';

  // Update state when location state changes - now with stable dependencies
  useEffect(() => {
    if (extractedAccountHolder && extractedAccountHolder !== accountHolder) {
      setAccountHolder(extractedAccountHolder);
    }
    if (extractedCompetitors && extractedCompetitors.length > 0 && JSON.stringify(extractedCompetitors) !== JSON.stringify(competitors)) {
      setCompetitors(extractedCompetitors);
    }
    if (extractedAccountType && extractedAccountType !== accountType) {
      setAccountType(extractedAccountType);
    }
    if (extractedUserId && extractedUserId !== userId) {
      setUserId(extractedUserId);
    }
  }, [extractedAccountHolder, extractedCompetitors, extractedAccountType, extractedUserId, accountHolder, competitors, accountType, userId]);

  // Memoized sync function to prevent recreation on every render
  const syncUserConnection = useCallback(async (uid: string) => {
    try {
      // Skip sync if the user has explicitly disconnected Instagram
      if (isInstagramDisconnected(uid)) {
        console.log(`[${new Date().toISOString()}] User ${uid} has previously disconnected Instagram, skipping connection sync`);
        return;
      }
      
      await syncInstagramConnection(uid);
      console.log(`[${new Date().toISOString()}] Synced Instagram connection for user ${uid}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error syncing Instagram connection:`, error);
    }
  }, []);

  // Sync Instagram connection when user logs in
  useEffect(() => {
    if (currentUser?.uid) {
      syncUserConnection(currentUser.uid);
    }
  }, [currentUser?.uid, syncUserConnection]);

  // Redirect logged in users to account page
  useEffect(() => {
    if (currentUser && location.pathname === '/') {
      navigate('/account');
    }
  }, [currentUser, location.pathname, navigate]);

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
  }, [currentUser?.uid, accountHolder, location.pathname, navigate]);
  
  if (isLoadingUserData) {
    return <div className="loading-screen">Loading account information...</div>;
  }

  return (
    <div className="App">
      <TopBar />
      <div className="main-content">
        {!shouldHideLeftBar && <LeftBar accountHolder={accountHolder} userId={userId} platform={currentPlatform} />}
        <div className={`content-area ${shouldHideLeftBar ? 'full-width' : ''}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <AuthRoute>
                  <MainDashboard />
                </AuthRoute>
              }
            />
            <Route
              path="/account"
              element={
                <PrivateRoute>
                  <MainDashboard />
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
                    competitors={competitors} 
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
                    competitors={competitors} 
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