
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import { safeNavigate } from './utils/navigationGuard';
import './styles/global-ui-refinements.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Twitter from './pages/Twitter';
import Facebook from './pages/Facebook';
import Dashboard from './components/instagram/Dashboard';
import PlatformDashboard from './components/dashboard/PlatformDashboard';
import MainDashboard from './components/dashboard/MainDashboard';
import Homepage from './components/homepage/Homepage';
import PrivacyPolicy from './components/legal/PrivacyPolicy';
import Login from './components/auth/Login';
import PrivateRoute from './components/auth/PrivateRoute';
import PricingPage from './components/pricing/PricingPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstagramProvider } from './context/InstagramContext';
import { UsageProvider } from './context/UsageContext';
import { UpgradePopupProvider } from './context/UpgradePopupContext';
import { TwitterProvider } from './context/TwitterContext';
import { FacebookProvider } from './context/FacebookContext';
import axios from 'axios';
import { syncInstagramConnection, isInstagramDisconnected } from './utils/instagramSessionManager';
import ChatModal from './components/common/ChatModal';
import type { ChatMessage as ChatModalMessage } from './components/common/ChatModal';
import QuotaStatusToast from './components/common/QuotaStatusToast';
import AdminPanel from './components/admin/AdminPanel';
import { ProcessingProvider } from './context/ProcessingContext';
import Processing from './pages/Processing';
import GlobalProcessingGuard from './components/guards/GlobalProcessingGuard';
import LoadingStateGuard from './components/guards/LoadingStateGuard';
import RagService from './services/RagService';
import ErrorBoundary from './components/common/ErrorBoundary';

// Main App component with AuthProvider
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProcessingProvider>
          <UsageProvider>
            <UpgradePopupProvider>
              <InstagramProvider>
                <TwitterProvider>
                  <FacebookProvider>
                    <AppContent />
                  </FacebookProvider>
                </TwitterProvider>
              </InstagramProvider>
            </UpgradePopupProvider>
          </UsageProvider>
        </ProcessingProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

// Inner component that can use the auth context
const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  // State from URL state or default values
  const [accountHolder, setAccountHolder] = useState<string>(location.state?.accountHolder || '');
  const [competitors, setCompetitors] = useState<string[]>(location.state?.competitors || []);
  const [accountType, setAccountType] = useState<'branding' | 'non-branding'>(location.state?.accountType || 'branding');
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);

  // 🔄 Keep platform-specific user data in sync on route change
  useEffect(() => {
    if (!currentUser?.uid) return;

    const platformId = getCurrentPlatform();
    const uid = currentUser.uid;

    // Primary source for username used across the app
    let username = localStorage.getItem(`${platformId}_username_${uid}`) || '';

    // Facebook-specific backfill: if missing, try account_data.name
    if (platformId === 'facebook' && !username) {
      try {
        const raw = localStorage.getItem(`facebook_account_data_${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
            username = parsed.name.trim();
            // Backfill the canonical key to prevent future misses
            localStorage.setItem(`facebook_username_${uid}`, username);
          }
        }
      } catch {}
    }

    // Load competitors (names array). For Facebook, backfill from full competitor_data if needed
    let parsedCompetitors: string[] = [];
    try {
      const competitorsRaw = localStorage.getItem(`${platformId}_competitors_${uid}`) || '[]';
      parsedCompetitors = JSON.parse(competitorsRaw);
      if (!Array.isArray(parsedCompetitors)) parsedCompetitors = [];
    } catch {
      parsedCompetitors = [];
    }
    if (platformId === 'facebook' && parsedCompetitors.length === 0) {
      try {
        const fullRaw = localStorage.getItem(`facebook_competitor_data_${uid}`);
        if (fullRaw) {
          const full = JSON.parse(fullRaw);
          if (Array.isArray(full)) {
            const names = full
              .map((c: any) => (c && typeof c.name === 'string' ? c.name : ''))
              .filter((n: string) => n && n.trim() !== '');
            if (names.length > 0) {
              parsedCompetitors = names;
              localStorage.setItem(`facebook_competitors_${uid}`, JSON.stringify(names));
            }
          }
        }
      } catch {}
    }

    const savedAccountType = (localStorage.getItem(`${platformId}_account_type_${uid}`) as 'branding' | 'non-branding') || 'branding';

    // Update only if values actually differ to avoid extra renders
    if (username !== accountHolder) setAccountHolder(username);
    if (JSON.stringify(parsedCompetitors) !== JSON.stringify(competitors)) setCompetitors(parsedCompetitors);
    if (savedAccountType !== accountType) setAccountType(savedAccountType);
  }, [location.pathname, currentUser]);
  
  // Chat modal state for MessagesPopup integration
  const [chatModalData, setChatModalData] = useState<{
    isOpen: boolean;
    messages: ChatModalMessage[];
    platform: 'instagram' | 'twitter' | 'facebook';
    isProcessing?: boolean;
    quotaInfo?: {
      exhausted: boolean;
      resetTime?: string;
      message: string;
    } | null;
    usingFallbackProfile?: boolean;
  }>({
    isOpen: false,
    messages: [],
    platform: 'instagram',
    isProcessing: false,
    quotaInfo: null,
    usingFallbackProfile: false
  });

  // Admin panel state
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Function to handle opening chat from MessagesPopup
  const handleOpenChatFromMessages = (messageContent: string, platform?: string) => {
    // Use the platform passed from component, or fall back to current platform
    const targetPlatform = platform || (currentPlatform as 'instagram' | 'twitter' | 'facebook') || 'instagram';
    
    if (messageContent.trim() === '') {
      
      // Start a new conversation - just load existing history without adding a new message
      RagService.loadConversations(accountHolder, targetPlatform)
        .then((existingMessages: any[]) => {
          // Convert RagService messages to ChatModalMessage format
          const convertedMessages: ChatModalMessage[] = existingMessages.map(msg => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content
          }));
          
          setChatModalData({
            isOpen: true,
            messages: convertedMessages,
            platform: targetPlatform as 'instagram' | 'twitter' | 'facebook',
            quotaInfo: null,
            usingFallbackProfile: false
          });
        })
        .catch((err: any) => {
          console.error('Error loading conversation history:', err);
          // Start fresh conversation
          setChatModalData({
            isOpen: true,
            messages: [],
            platform: targetPlatform as 'instagram' | 'twitter' | 'facebook',
            quotaInfo: null,
            usingFallbackProfile: false
          });
        });
    } else {
      // Opening from a specific AI insight - load conversation and add the insight
      RagService.loadConversations(accountHolder, targetPlatform)
        .then((existingMessages: any[]) => {
          // Convert RagService messages to ChatModalMessage format
          const convertedMessages: ChatModalMessage[] = existingMessages.map(msg => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content
          }));
          
          const assistantMessage: ChatModalMessage = {
            role: 'assistant',
            content: messageContent
          };
          
          // Append the new message to existing conversation
          const allMessages = [...convertedMessages, assistantMessage];
          
          setChatModalData({
            isOpen: true,
            messages: allMessages,
            platform: targetPlatform as 'instagram' | 'twitter' | 'facebook',
            quotaInfo: null,
            usingFallbackProfile: false
          });
        })
        .catch((err: any) => {
          console.error('Error loading conversation history:', err);
          // Fallback to just the new message if loading fails
          const assistantMessage: ChatModalMessage = {
            role: 'assistant',
            content: messageContent
          };
          
          setChatModalData({
            isOpen: true,
            messages: [assistantMessage],
            platform: targetPlatform as 'instagram' | 'twitter' | 'facebook',
            quotaInfo: null,
            usingFallbackProfile: false
          });
        });
    }
  };

  // Function to close chat modal
  const handleCloseChatModal = () => {
    setChatModalData({
      isOpen: false,
      messages: [],
      platform: 'instagram',
      isProcessing: false,
      quotaInfo: null,
      usingFallbackProfile: false
    });
  };

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
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  const isPricingPage = location.pathname === '/pricing';
  const isPrivacyPage = location.pathname === '/privacy';
  const isPlatformDashboard = location.pathname.includes('dashboard') && !isAccountPage;
  
  // Only show LeftBar on platform dashboards
  const shouldHideLeftBar = !isPlatformDashboard;

  // Determine current platform based on route with more robust detection
  const getCurrentPlatform = (): 'instagram' | 'twitter' | 'facebook' => {
    const path = location.pathname;
    
    // Exact matches first (most reliable)
    if (path === '/facebook' || path === '/facebook-dashboard' || path === '/facebook-non-branding-dashboard') {
      return 'facebook';
    }
    if (path === '/twitter' || path === '/twitter-dashboard' || path === '/twitter-non-branding-dashboard') {
      return 'twitter';
    }
    if (path === '/instagram' || path === '/dashboard' || path === '/non-branding-dashboard') {
      return 'instagram';
    }
    
    // Fallback to includes check with proper order (more specific first)
    if (path.includes('facebook')) return 'facebook';
    if (path.includes('twitter')) return 'twitter';
    
    // Default to instagram for any other case
    return 'instagram';
  };
  
  const currentPlatform = getCurrentPlatform();
  
  // Add debugging to track platform detection
  useEffect(() => {
    console.log(`[App] Platform detection: path="${location.pathname}" -> platform="${currentPlatform}"`);
  }, [location.pathname, currentPlatform]);

  // Admin panel secret access with keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Secret key combination: Ctrl + Shift + A + D + M + I + N
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyA') {
        const sequence = ['KeyD', 'KeyM', 'KeyI', 'KeyN'];
        let currentIndex = 0;
        
        const checkSequence = (e: KeyboardEvent) => {
          if (e.code === sequence[currentIndex]) {
            currentIndex++;
            if (currentIndex === sequence.length) {
              setShowAdminPanel(true);
              document.removeEventListener('keydown', checkSequence);
            }
          } else {
            currentIndex = 0;
            document.removeEventListener('keydown', checkSequence);
          }
        };
        
        document.addEventListener('keydown', checkSequence);
        
        // Remove listener after 5 seconds
        setTimeout(() => {
          document.removeEventListener('keydown', checkSequence);
        }, 5000);
      }
    };

    // Also check for URL-based admin access
    if (location.search.includes('admin=sentientai')) {
      setShowAdminPanel(true);
    }

    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [location.search]);

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

  // Note: Removed automatic redirect to allow users to stay on homepage

  // ✅ BULLETPROOF: Load user data when switching platforms or missing account info
  useEffect(() => {
    if (currentUser?.uid && (
      location.pathname.includes('dashboard') || 
      location.pathname.includes('-dashboard')  // Catches all platform dashboards
    )) {
      // ✅ CRITICAL FIX: Detect platform mismatch to trigger account reload
      const currentUrlPlatform = location.pathname.includes('twitter') ? 'twitter' : 
                                location.pathname.includes('facebook') ? 'facebook' : 'instagram';
      
      const accountPlatform = location.state?.platform || getCurrentPlatform();
      
      // ✅ FORCE RELOAD: If no account OR platform switched OR account doesn't match URL platform
      const needsAccountReload = !accountHolder || 
                                accountPlatform !== currentUrlPlatform ||
                                !location.state?.accountHolder;
      
      if (needsAccountReload) {
        console.log(`[App] 🔄 Triggering account reload: accountHolder=${accountHolder}, urlPlatform=${currentUrlPlatform}, accountPlatform=${accountPlatform}`);
        setIsLoadingUserData(true);
        
        const fetchUserStatus = async () => {
          try {
            // ✅ ENHANCED: Determine which platform to check based on URL
            const isTwitterDashboard = location.pathname.includes('twitter');
            const isFacebookDashboard = location.pathname.includes('facebook');
            
            const endpoint = isTwitterDashboard 
              ? `/api/user-twitter-status/${currentUser.uid}`
              : isFacebookDashboard
              ? `/api/user-facebook-status/${currentUser.uid}`
              : `/api/user-instagram-status/${currentUser.uid}`;
            
            console.log(`[App] 🔄 Loading account info for platform: ${isTwitterDashboard ? 'Twitter' : isFacebookDashboard ? 'Facebook' : 'Instagram'}`);
            
            const response = await axios.get(endpoint);
            
            // Defensive check for valid response data
            if (!response.data || typeof response.data !== 'object') {
              throw new Error('Invalid response data');
            }
            
            const hasEnteredUsername = isTwitterDashboard 
              ? response.data.hasEnteredTwitterUsername
              : isFacebookDashboard
              ? response.data.hasEnteredFacebookUsername
              : response.data.hasEnteredInstagramUsername;
            
            if (hasEnteredUsername) {
              const savedUsername = isTwitterDashboard 
                ? response.data.twitter_username
                : isFacebookDashboard
                ? response.data.facebook_username
                : response.data.instagram_username;
              
              // ✅ ENHANCED: Get competitors from AccountInfo for all platforms
              let savedCompetitors: string[] = [];
              try {
                const platform = isTwitterDashboard ? 'twitter' : isFacebookDashboard ? 'facebook' : 'instagram';
                const accountInfoResponse = await axios.get(`/api/retrieve-account-info/${savedUsername}?platform=${platform}`);
                savedCompetitors = accountInfoResponse.data.competitors || [];
                console.log(`[App] ✅ Retrieved competitors for ${savedUsername} on ${platform}:`, savedCompetitors);
              } catch (error) {
                console.error(`[App] ⚠️ Failed to fetch competitors from AccountInfo:`, error);
                savedCompetitors = [];
              }
              
              const savedAccountType = response.data.accountType || 'branding';
              
              console.log(`[App] ✅ Retrieved saved ${isTwitterDashboard ? 'Twitter' : isFacebookDashboard ? 'Facebook' : 'Instagram'} data for ${currentUser.uid}:`, {
                username: savedUsername,
                accountType: savedAccountType,
                competitors: savedCompetitors
              });
              
              // ✅ BULLETPROOF: Navigate to the correct dashboard with the saved data
              safeNavigate(navigate, location.pathname, {
                state: {
                  accountHolder: savedUsername,
                  competitors: savedCompetitors,
                  accountType: savedAccountType,
                  platform: isTwitterDashboard ? 'twitter' : isFacebookDashboard ? 'facebook' : 'instagram'
                },
                replace: true
              }, 5); // Medium priority for user data loading
            } else {
              // Backend says not set up; fall back to local cache before redirecting
              const platformKey = isTwitterDashboard ? 'twitter' : isFacebookDashboard ? 'facebook' : 'instagram';
              const uid = currentUser.uid;
              try {
                const hasAccessed = localStorage.getItem(`${platformKey}_accessed_${uid}`) === 'true';
                let cachedUsername = localStorage.getItem(`${platformKey}_username_${uid}`) || '';
                const cachedCompetitors = JSON.parse(localStorage.getItem(`${platformKey}_competitors_${uid}`) || '[]');
                const cachedAccountType = (localStorage.getItem(`${platformKey}_account_type_${uid}`) as 'branding' | 'non-branding') || 'branding';
                // Additional backfill for Facebook/Twitter if username missing but accessed
                if (hasAccessed && !cachedUsername) {
                  try {
                    const accountDataRaw = localStorage.getItem(`${platformKey}_account_data_${uid}`);
                    if (accountDataRaw) {
                      const accountData = JSON.parse(accountDataRaw);
                      if (accountData && typeof accountData.name === 'string' && accountData.name.trim()) {
                        cachedUsername = accountData.name.trim();
                        localStorage.setItem(`${platformKey}_username_${uid}`, cachedUsername);
                      }
                    }
                  } catch {}
                  // As a last resort, try processing_info username
                  if (!cachedUsername) {
                    try {
                      const infoRaw = localStorage.getItem(`${platformKey}_processing_info`);
                      if (infoRaw) {
                        const info = JSON.parse(infoRaw);
                        if (info && typeof info.username === 'string' && info.username.trim()) {
                          cachedUsername = info.username.trim();
                        }
                      }
                    } catch {}
                  }
                }
                if (hasAccessed || (cachedUsername && cachedUsername.trim())) {
                  console.log(`[App] ⚠️ Backend reported not set up for ${platformKey}, but local cache indicates setup completed – proceeding to dashboard using cache.`);
                  safeNavigate(navigate, location.pathname, {
                    state: {
                      accountHolder: cachedUsername,
                      competitors: Array.isArray(cachedCompetitors) ? cachedCompetitors : [],
                      accountType: cachedAccountType,
                      platform: platformKey
                    },
                    replace: true
                  }, 5);
                  return;
                }
              } catch {}
              console.log(`[App] ⚠️ User hasn't set up ${isTwitterDashboard ? 'Twitter' : isFacebookDashboard ? 'Facebook' : 'Instagram'} yet (no valid cache), redirecting to setup`);
              safeNavigate(navigate, isTwitterDashboard ? '/twitter' : isFacebookDashboard ? '/facebook' : '/instagram', {}, 5);
            }
          } catch (error) {
            console.error(`[App] ❌ Error fetching user status:`, error);
            // Network or server error; fall back to cached platform state before redirecting
            const platformKey = location.pathname.includes('twitter') ? 'twitter' : location.pathname.includes('facebook') ? 'facebook' : 'instagram';
            const uid = currentUser.uid;
            try {
              const hasAccessed = localStorage.getItem(`${platformKey}_accessed_${uid}`) === 'true';
              let cachedUsername = localStorage.getItem(`${platformKey}_username_${uid}`) || '';
              const cachedCompetitors = JSON.parse(localStorage.getItem(`${platformKey}_competitors_${uid}`) || '[]');
              const cachedAccountType = (localStorage.getItem(`${platformKey}_account_type_${uid}`) as 'branding' | 'non-branding') || 'branding';
              if (hasAccessed && !cachedUsername) {
                try {
                  const accountDataRaw = localStorage.getItem(`${platformKey}_account_data_${uid}`);
                  if (accountDataRaw) {
                    const accountData = JSON.parse(accountDataRaw);
                    if (accountData && typeof accountData.name === 'string' && accountData.name.trim()) {
                      cachedUsername = accountData.name.trim();
                      localStorage.setItem(`${platformKey}_username_${uid}`, cachedUsername);
                    }
                  }
                } catch {}
                if (!cachedUsername) {
                  try {
                    const infoRaw = localStorage.getItem(`${platformKey}_processing_info`);
                    if (infoRaw) {
                      const info = JSON.parse(infoRaw);
                      if (info && typeof info.username === 'string' && info.username.trim()) {
                        cachedUsername = info.username.trim();
                      }
                    }
                  } catch {}
                }
              }
              if (hasAccessed || (cachedUsername && cachedUsername.trim())) {
                console.log(`[App] 🌐 Using cached ${platformKey} setup to continue despite status error`);
                safeNavigate(navigate, location.pathname, {
                  state: {
                    accountHolder: cachedUsername,
                    competitors: Array.isArray(cachedCompetitors) ? cachedCompetitors : [],
                    accountType: cachedAccountType,
                    platform: platformKey
                  },
                  replace: true
                }, 5);
                return;
              }
            } catch {}
            // No viable cache; redirect to setup
            safeNavigate(navigate, location.pathname.includes('twitter') ? '/twitter' : location.pathname.includes('facebook') ? '/facebook' : '/instagram', {}, 5);
          } finally {
            setIsLoadingUserData(false);
          }
        };
        
        fetchUserStatus();
      }
    }
  }, [currentUser?.uid, accountHolder, location.pathname, location.state, navigate, getCurrentPlatform]);
  
  if (isLoadingUserData) {
    // ✅ ENHANCED: Show which platform is being loaded
    const currentPlatformName = location.pathname.includes('twitter') ? 'Twitter' : 
                               location.pathname.includes('facebook') ? 'Facebook' : 'Instagram';
    return (
      <div className="loading-screen">
        <div>Loading {currentPlatformName} account information...</div>
        <div style={{ fontSize: '0.9em', opacity: 0.7, marginTop: '10px' }}>
          Please wait while we retrieve your account data
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <TopBar />
      <div className="main-content">
        {!shouldHideLeftBar && <LeftBar accountHolder={accountHolder} userId={userId} platform={currentPlatform} onOpenChat={handleOpenChatFromMessages} />}
        <div className={`content-area ${shouldHideLeftBar ? 'full-width' : ''}`}>
          <GlobalProcessingGuard>
            <LoadingStateGuard>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={<Homepage />}
              />
              <Route
                path="/home"
                element={<Homepage />}
              />
              <Route
                path="/processing"
                element={
                  <PrivateRoute>
                    <Processing />
                  </PrivateRoute>
                }
              />
              <Route
                path="/processing/:platform"
                element={
                  <PrivateRoute>
                    <Processing />
                  </PrivateRoute>
                }
              />
              <Route
                path="/privacy"
                element={<PrivacyPolicy />}
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
                path="/facebook"
                element={
                  <PrivateRoute>
                    <Facebook />
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
                      onOpenChat={handleOpenChatFromMessages}
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
                      onOpenChat={handleOpenChatFromMessages}
                    />
                  </PrivateRoute>
                }
              />
              <Route
                path="/facebook-dashboard"
                element={
                  <PrivateRoute>
                    <PlatformDashboard 
                      accountHolder={accountHolder} 
                      competitors={competitors} 
                      accountType={accountType || 'branding'}
                      platform="facebook"
                      onOpenChat={handleOpenChatFromMessages}
                    />
                  </PrivateRoute>
                }
              />
              <Route
                path="/facebook-non-branding-dashboard"
                element={
                  <PrivateRoute>
                    <PlatformDashboard 
                      accountHolder={accountHolder} 
                      competitors={competitors} 
                      accountType="non-branding"
                      platform="facebook"
                      onOpenChat={handleOpenChatFromMessages}
                    />
                  </PrivateRoute>
                }
              />
              <Route
                path="/pricing"
                element={
                  <PrivateRoute>
                    <PricingPage />
                  </PrivateRoute>
                }
              />
            </Routes>
            </LoadingStateGuard>
          </GlobalProcessingGuard>
        </div>
      </div>
              {chatModalData.isOpen && (
          <ChatModal
            open={chatModalData.isOpen}
            onClose={handleCloseChatModal}
            messages={chatModalData.messages}
            username={`${accountHolder} (${chatModalData.platform.charAt(0).toUpperCase() + chatModalData.platform.slice(1)})`}
            platform={chatModalData.platform}
            isProcessing={chatModalData.isProcessing}
            onSendMessage={(message: string) => {
              if (!message.trim() || !accountHolder) return;
              
              // Show loading state immediately
              const userMessage: ChatModalMessage = { role: 'user', content: message };
              setChatModalData(prev => ({
                ...prev,
                messages: [...prev.messages, userMessage],
                isProcessing: true
              }));

              // Send the message to RAG service
              RagService.sendDiscussionQuery(accountHolder, message, chatModalData.messages as any[], chatModalData.platform)
                .then(response => {
                  const assistantMessage: ChatModalMessage = { 
                    role: 'assistant', 
                    content: response.response 
                  };
                  
                  const updatedMessages = [...chatModalData.messages, userMessage, assistantMessage];
                  
                  setChatModalData(prev => ({
                    ...prev,
                    messages: updatedMessages,
                    isProcessing: false
                  }));

                  // Save the conversation
                  RagService.saveConversation(accountHolder, updatedMessages, chatModalData.platform)
                    .catch(err => console.error('Error saving conversation:', err));
                })
                .catch(error => {
                  console.error('Error with chat message:', error);
                  setChatModalData(prev => ({
                    ...prev,
                    isProcessing: false
                  }));
                });
            }}
          />
        )}
        
        {/* Quota Status Toast */}
        <QuotaStatusToast
          quotaInfo={chatModalData.quotaInfo}
          usingFallbackProfile={chatModalData.usingFallbackProfile}
          platform={chatModalData.platform}
          onClose={() => setChatModalData(prev => ({
            ...prev,
            quotaInfo: null,
            usingFallbackProfile: false
          }))}
        />

        {/* Admin Panel */}
        {showAdminPanel && (
          <AdminPanel
            isOpen={showAdminPanel}
            onClose={() => setShowAdminPanel(false)}
          />
        )}
    </div>
  );
};

export default App;