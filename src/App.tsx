import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
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
import ChatModal from './components/instagram/ChatModal';
import type { ChatMessage as ChatModalMessage } from './components/instagram/ChatModal';
import QuotaStatusToast from './components/common/QuotaStatusToast';
import AdminPanel from './components/admin/AdminPanel';


// Main App component with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
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
    </AuthProvider>
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
    
    console.log(`[App] Opening chat for ${targetPlatform}/${accountHolder}`);
    console.log(`[App] Platform source: ${platform ? 'passed from component' : 'detected from URL'}`);
    console.log(`[App] Current URL: ${location.pathname}`);
    console.log(`[App] Message: "${messageContent}"`);
    
    if (messageContent.trim() === '') {
      // Start a new conversation - just load existing history without adding a new message
      import('./services/RagService').then(({ default: RagService }) => {
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
      });
    } else {
      // Opening from a specific AI insight - load conversation and add the insight
      import('./services/RagService').then(({ default: RagService }) => {
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

  // Try to load user data if logged in but no account info
  useEffect(() => {
    if (currentUser?.uid && !accountHolder && (location.pathname.includes('dashboard') || location.pathname.includes('twitter-dashboard'))) {
      setIsLoadingUserData(true);
      
      const fetchUserStatus = async () => {
        try {
          // Determine which platform to check based on URL
          const isTwitterDashboard = location.pathname.includes('twitter');
          const isFacebookDashboard = location.pathname.includes('facebook');
          const endpoint = isTwitterDashboard 
            ? `/api/user-twitter-status/${currentUser.uid}`
            : isFacebookDashboard
            ? `/api/user-facebook-status/${currentUser.uid}`
            : `/api/user-instagram-status/${currentUser.uid}`;
          
          const response = await axios.get(endpoint);
          
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
            const savedCompetitors = response.data.competitors || [];
            const savedAccountType = response.data.accountType || 'branding';
            
            console.log(`Retrieved saved ${isTwitterDashboard ? 'Twitter' : isFacebookDashboard ? 'Facebook' : 'Instagram'} data for ${currentUser.uid}:`, {
              username: savedUsername,
              accountType: savedAccountType
            });
            
            // Navigate to the correct dashboard with the saved data
            navigate(location.pathname, {
              state: {
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: savedAccountType,
                platform: isTwitterDashboard ? 'twitter' : isFacebookDashboard ? 'facebook' : 'instagram'
              },
              replace: true
            });
          } else {
            // User hasn't set up the platform yet, redirect to setup page
            navigate(isTwitterDashboard ? '/twitter' : isFacebookDashboard ? '/facebook' : '/instagram');
          }
        } catch (error) {
          console.error('Error fetching user status:', error);
          navigate(location.pathname.includes('twitter') ? '/twitter' : location.pathname.includes('facebook') ? '/facebook' : '/instagram');
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
        {!shouldHideLeftBar && <LeftBar accountHolder={accountHolder} userId={userId} platform={currentPlatform} onOpenChat={handleOpenChatFromMessages} />}
        <div className={`content-area ${shouldHideLeftBar ? 'full-width' : ''}`}>
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
                    accountType={accountType || 'branding'}
                    onOpenChat={handleOpenChatFromMessages}
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
                    onOpenChat={handleOpenChatFromMessages}
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
              
              // Load RagService dynamically
              import('./services/RagService').then(({ default: RagService }) => {
                RagService.sendDiscussionQuery(accountHolder, message, chatModalData.messages, chatModalData.platform)
                  .then((response: { 
                    response: string; 
                    usedFallback?: boolean; 
                    usingFallbackProfile?: boolean;
                    quotaInfo?: { 
                      exhausted: boolean; 
                      resetTime?: string; 
                      message: string; 
                    } 
                  }) => {
                    const assistantMessage: ChatModalMessage = { role: 'assistant', content: response.response };
                    const updatedMessages = [
                      ...chatModalData.messages,
                      userMessage,
                      assistantMessage
                    ];
                    
                    setChatModalData(prev => ({
                      ...prev,
                      messages: updatedMessages,
                      isProcessing: false,
                      quotaInfo: response.quotaInfo || null,
                      usingFallbackProfile: response.usingFallbackProfile || false
                    }));
                    
                    // Save conversation with platform context
                    RagService.saveConversation(accountHolder, updatedMessages, chatModalData.platform)
                      .catch((err: any) => console.error('Error saving conversation:', err));
                  })
                  .catch((err: any) => {
                    console.error('Error in discussion query:', err);
                    setChatModalData(prev => ({
                      ...prev,
                      isProcessing: false
                    }));
                  });
              }).catch((err: any) => {
                console.error('Error loading RagService:', err);
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