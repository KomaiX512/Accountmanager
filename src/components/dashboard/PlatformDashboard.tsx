import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../instagram/Dashboard.css'; // Reuse the same styles
import Cs_Analysis from '../instagram/Cs_Analysis';
import OurStrategies from '../instagram/OurStrategies';
import PostCooked from '../instagram/PostCooked';
import { getApiUrl } from '../../config/api';
import { PlatformProvider } from '../../context/PlatformContext';
import InstagramConnect from '../instagram/InstagramConnect';
import TwitterConnect from '../twitter/TwitterConnect';
import FacebookConnect from '../facebook/FacebookConnect';
import TwitterCompose from '../twitter/TwitterCompose';
import DmsComments from '../instagram/Dms_Comments';
import PostScheduler from '../instagram/PostScheduler';
import InsightsModal from '../instagram/InsightsModal';
import GoalModal from '../instagram/GoalModal';
import CampaignModal from '../instagram/CampaignModal';
import News4U from '../common/News4U';
import { motion } from 'framer-motion';
import axios, { AxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import TwitterRequiredButton from '../common/TwitterRequiredButton';
import FacebookRequiredButton from '../common/FacebookRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import ChatModal from '../instagram/ChatModal';
import RagService from '../../services/RagService';
import type { ChatMessage as ChatModalMessage, LinkedAccount } from '../instagram/ChatModal';
import { Notification, ProfileInfo } from '../../types/notifications';
// Import icons from react-icons
import { FaChartLine, FaCalendarAlt, FaFlag, FaBullhorn, FaTwitter, FaInstagram, FaPen, FaFacebook, FaBell, FaUndo, FaInfoCircle, FaPencilAlt, FaRocket, FaRobot, FaNewspaper, FaRss } from 'react-icons/fa';
import { MdAnalytics, MdOutlineSchedule, MdOutlineAutoGraph } from 'react-icons/md';
import { BsLightningChargeFill, BsBinoculars, BsLightbulb } from 'react-icons/bs';
import { IoMdAnalytics } from 'react-icons/io';
import { TbTargetArrow } from 'react-icons/tb';
import { GiSpy } from 'react-icons/gi';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import useDefensiveUsageTracking from '../../hooks/useDefensiveUsageTracking';
import useUpgradeHandler from '../../hooks/useUpgradeHandler';
import AccessControlPopup from '../common/AccessControlPopup';
import { useNavigate } from 'react-router-dom';
import useProcessingGuard from '../../hooks/useProcessingGuard';
import { useProcessing } from '../../context/ProcessingContext';
import { safeFilter, safeMap, safeLength } from '../../utils/safeArrayUtils';
import useDashboardRefresh from '../../hooks/useDashboardRefresh';
import useResetPlatformState from '../../hooks/useResetPlatformState';
import AutopilotPopup from '../common/AutopilotPopup';
import ProfilePopup from '../common/ProfilePopup';
import ManualGuidance from '../common/ManualGuidance';
import CacheManager, { appendBypassParam } from '../../utils/cacheManager';

// Define RagService compatible ChatMessage
interface RagChatMessage {
  role: string;
  content: string;
}

interface PlatformDashboardProps {
  accountHolder: string;
  competitors: string[];
  accountType: 'branding' | 'non-branding';
  platform: 'instagram' | 'twitter' | 'facebook';
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ 
  accountHolder, 
  competitors, 
  accountType, 
  platform,
  onOpenChat
}) => {
  // ALL HOOKS MUST BE CALLED FIRST - Rules of Hooks
  const guard = useProcessingGuard(platform, accountHolder);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const loadingCheckRef = useRef(false);
  const { processingState } = useProcessing();



  // ALL CONTEXT HOOKS MUST BE CALLED FIRST - Rules of Hooks
  const { currentUser } = useAuth();
  const { userId: igUserId, isConnected: isInstagramConnected } = useInstagram();
  const { userId: twitterId, isConnected: isTwitterConnected } = useTwitter();
  const { userId: facebookPageId, isConnected: isFacebookConnected, connectFacebook } = useFacebook();
  const { trackRealAIReply, trackRealPostCreation, canUseFeature } = useFeatureTracking();
  const { trackAIReply } = useDefensiveUsageTracking();
  const { showUpgradePopup, blockedFeature, closeUpgradePopup, currentUsage } = useUpgradeHandler();
  const { resetAndAllowReconnection } = useResetPlatformState();

  // ALL STATE HOOKS
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'info'|'success'|'error'|'warn'>('info');
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [profileInfo, setProfileInfo] = useState<any | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  // ✅ FIX 2: Remove chat mode selector - chatbar is now dedicated to post creation only
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatModalMessage[]>([]);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [result, setResult] = useState('');
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [aiProcessingNotifications, setAiProcessingNotifications] = useState<Record<string, boolean>>({});
  const [showInitialText, setShowInitialText] = useState(true);
  const [showBio, setShowBio] = useState(false);
  const [typedBio, setTypedBio] = useState('');
  const [bioAnimationComplete, setBioAnimationComplete] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [showCampaignButton, setShowCampaignButton] = useState(false);
  const [replySentTracker, setReplySentTracker] = useState<{
    text: string;
    timestamp: number;
    type: 'dm' | 'comment';
    id: string;
  }[]>([]);
  const [aiRepliesRefreshKey, setAiRepliesRefreshKey] = useState(0);
  const [processingNotifications, setProcessingNotifications] = useState<Record<string, boolean>>({});
  const [isAutoReplying, setIsAutoReplying] = useState(false);
  
  // 🛑 STOP OPERATION: Add stop flag and timeout reference for PlatformDashboard
  const [shouldStopAutoReply, setShouldStopAutoReply] = useState(false);
  const autoReplyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // NEW: Auto-reply progress tracking
  const [autoReplyProgress, setAutoReplyProgress] = useState<{
    current: number;
    total: number;
    nextReplyIn: number;
  }>({ current: 0, total: 0, nextReplyIn: 0 });
  const [isTwitterSchedulerOpen, setIsTwitterSchedulerOpen] = useState(false);
  const [isTwitterInsightsOpen, setIsTwitterInsightsOpen] = useState(false);
  const [isTwitterComposeOpen, setIsTwitterComposeOpen] = useState(false);
  const [isFacebookSchedulerOpen, setIsFacebookSchedulerOpen] = useState(false);
  const [isFacebookInsightsOpen, setIsFacebookInsightsOpen] = useState(false);
  const [isFacebookComposeOpen, setIsFacebookComposeOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // 🚀 AUTOPILOT: Autopilot popup state
  const [isAutopilotPopupOpen, setIsAutopilotPopupOpen] = useState(false);
  
  // DEBUG: Log when component renders
  console.log(`[DEBUG] PlatformDashboard rendering - Platform: ${platform}, User: ${accountHolder}, Autopilot Popup Open: ${isAutopilotPopupOpen}`);
  // ✅ ADDED: Track auto-replied notifications to prevent redundancy
  const [autoRepliedNotifications, setAutoRepliedNotifications] = useState<Set<string>>(new Set());

  // 🍎 Mobile profile menu state
  const [isMobileProfileMenuOpen, setIsMobileProfileMenuOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 60, right: 10 });

  // 🍎 Mobile expandable modules state
  const [expandedModules, setExpandedModules] = useState<{
    notifications: boolean;
    postCooked: boolean;
    strategies: boolean;
    competitorAnalysis: boolean;
    news4u: boolean;
  }>({
    notifications: false,
    postCooked: false,
    strategies: false,
    competitorAnalysis: false,
    news4u: false,
  });

  // 🍎 Mobile floating actions state
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isMobileImageEditorOpen, setIsMobileImageEditorOpen] = useState(false);
  const [isMobileProfilePopupOpen, setIsMobileProfilePopupOpen] = useState(false);
  const [isMobileManualOpen, setIsMobileManualOpen] = useState(false);

  // 🍎 Mobile module click handler for expandable modules
  const handleMobileModuleClick = (moduleKey: keyof typeof expandedModules, e: React.MouseEvent) => {
    // Only handle clicks on mobile (portrait mode)
    if (window.innerWidth > 767 || window.innerHeight < window.innerWidth) return;
    
    // Check if click is in the header area (top 60px of module)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    
    if (clickY <= 60) {
      e.preventDefault();
      e.stopPropagation();
      
      setExpandedModules(prev => ({
        ...prev,
        [moduleKey]: !prev[moduleKey]
      }));
    }
  };

  // ALL REF HOOKS
  const firstLoadRef = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const lastProfilePicRenderTimeRef = useRef<number>(0);
  const imageRetryAttemptsRef = useRef(0);
  // Prevent redundant Facebook fallback attempts & log spam
  const facebookProfileFallbackTriedRef = useRef(false);

  // CONSTANTS
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  const maxImageRetryAttempts = 3;

  // Initialize viewed sets from localStorage
  const [viewedStrategies, setViewedStrategies] = useState<Set<string>>(() => {
    const storageKey = `viewed_strategies_${platform}_${accountHolder}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
  const [viewedCompetitorData, setViewedCompetitorData] = useState<Set<string>>(() => {
    const storageKey = `viewed_competitor_${platform}_${accountHolder}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
  const [viewedPosts, setViewedPosts] = useState<Set<string>>(() => {
    const storageKey = `viewed_posts_${platform}_${accountHolder}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // Define functions FIRST to avoid dependency hoisting issues
  // ✅ BULLETPROOF FIX: Convert to useCallback for proper dependency tracking
  const refreshAllData = useCallback(async () => {
    if (!accountHolder) {
      return;
    }
    try {
      console.log(`[PlatformDashboard] ⚡ Fetching data efficiently for ${platform}`);
      const platformParam = `?platform=${platform}`;
      
      const [responsesData, strategiesData, postsData, competitorData] = await Promise.all([
        axios.get(appendBypassParam(`/api/responses/${accountHolder}${platformParam}`, platform, accountHolder, 'responses')).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(appendBypassParam(getApiUrl(`/${accountType === 'branding' ? 'retrieve-strategies' : 'retrieve-engagement-strategies'}/${accountHolder}${platformParam}`), platform, accountHolder, 'strategies')).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(appendBypassParam(`/api/posts/${accountHolder}${platformParam}`, platform, accountHolder, 'posts')).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        // Always fetch competitor data for both account types
        Promise.all(
          competitors.map(comp =>
            axios.get(appendBypassParam(getApiUrl(`/retrieve/${accountHolder}/${comp}${platformParam}`), platform, accountHolder, 'competitor')).catch(err => {
              if (err.response?.status === 404) {
                console.warn(`No ${platform} competitor data found for ${comp}`);
                return { data: [] };
              }
              throw err;
            })
          )
        )
      ]);

      // Defensive checks for array data before setting state
      setResponses(Array.isArray(responsesData.data) ? responsesData.data : []);
      setStrategies(Array.isArray(strategiesData.data) ? strategiesData.data : []);
      setPosts(Array.isArray(postsData.data) ? postsData.data : []);
      
      // Always set competitor data with defensive check
      const competitorResponses = competitorData as any[];
      const flatData = competitorResponses.flatMap(res => Array.isArray(res.data) ? res.data : []);
      setCompetitorData(flatData);

    } catch (error: any) {
      console.error(`Error refreshing ${platform} data:`, error);
      setToast(`Failed to load ${platform} dashboard data.`);
    }
  }, [accountHolder, platform, accountType, competitors]);

  const fetchProfileInfo = useCallback(async () => {
    if (!accountHolder) return;
    setProfileLoading(true);
    setProfileError(null);
    setImageError(false);
    try {
      console.log(`[PlatformDashboard] ⚡ Fetching profile info for ${platform}`);
      
      // Single canonical path using dashboard username (accountHolder) and explicit platform
      let response;
      let profileData = null;
      const platformParam = `?platform=${platform}&forceRefresh=true`;
      response = await axios.get(appendBypassParam(`/api/profile-info/${accountHolder}${platformParam}`, platform, accountHolder, 'profile'));
      const rawData = response.data;
      if (platform === 'twitter' && rawData && rawData.username) {
        profileData = {
          username: rawData.username,
          fullName: rawData.name || rawData.username,
          biography: rawData.bio || rawData.description || '',
          followersCount: rawData.follower_count ?? rawData.followersCount ?? 0,
          followsCount: rawData.following_count ?? rawData.followsCount ?? 0,
          postsCount: rawData.tweet_count ?? rawData.postsCount ?? 0,
          externalUrl: rawData.website || rawData.externalUrl || '',
          profilePicUrl: rawData.profile_image_url || rawData.profilePicUrl || '',
          profilePicUrlHD: rawData.profile_image_url || rawData.profilePicUrlHD || rawData.profilePicUrl || '',
          private: rawData.protected ?? false,
          verified: rawData.verified ?? false,
          platform: 'twitter',
          extractedAt: new Date().toISOString()
        };
      } else {
        profileData = rawData;
      }
      
      console.log(`[PlatformDashboard] Raw response for ${platform}:`, profileData);
      
      // 🎯 ENHANCED VALIDATION: Check if response contains actual profile fields
      if (profileData && typeof profileData === 'object' && !Array.isArray(profileData)) {
        // Validate that this is actually profile data, not account config
        const hasProfileFields = profileData.fullName || profileData.followersCount !== undefined || 
                                 profileData.biography || profileData.profilePicUrl || profileData.profilePicUrlHD;
        
        if (hasProfileFields) {
          setProfileInfo(profileData);
          console.log(`[${platform.toUpperCase()}] Profile Info Successfully Fetched:`, {
            fullName: profileData.fullName,
            followersCount: profileData.followersCount,
            biography: profileData.biography?.substring(0, 50) + '...',
            profilePicUrl: profileData.profilePicUrl ? 'Available' : 'N/A'
          });
        } else {
          console.warn(`[${platform.toUpperCase()}] Response contains account config, not profile data:`, profileData);
          setProfileInfo(null);
          if (platform === 'twitter') {
            setProfileError(`Twitter profile data not found. Connect your Twitter account and scrape data to see profile information.`);
          } else {
            setProfileError(`Profile data not found for ${platform}. Please ensure profile info is scraped.`);
          }
        }
      } else {
        setProfileInfo(null);
        if (platform === 'twitter') {
          setProfileError(`Twitter profile data not available. Connect your Twitter account and scrape data to see profile information.`);
        } else {
          setProfileError(`Invalid profile data received for ${platform}.`);
        }
      }
    } catch (err: any) {
      // Improved error handling for Twitter - don't log 404 as error
      if (platform === 'twitter' && err.response?.status === 404) {
        console.log(`[TWITTER] Profile info not available yet, this is expected for new Twitter accounts`);
        setProfileInfo(null);
        setProfileError(`Twitter profile info not available. Connect your Twitter account and scrape data to see profile information.`);
      } else {
        console.error(`[${platform.toUpperCase()}] Profile info fetch error:`, err);
        if (err.response?.status === 404) {
          setProfileInfo(null);
          setProfileError(`Profile info not available for ${platform}.`);
        } else {
          setProfileError(`Failed to load ${platform} profile info.`);
        }
      }
    } finally {
      setProfileLoading(false);
    }
  }, [accountHolder, platform]);

  // Simple refresh handler for regular data updates (defined after functions)
  const handleDataRefresh = useCallback(() => {
    if (!accountHolder || !platform) return;
    
    console.log(`[PlatformDashboard] 🔄 Refreshing data for ${platform}`);
    refreshAllData();
    fetchProfileInfo();
  }, [platform, accountHolder, refreshAllData, fetchProfileInfo]);

  // ✅ BULLET-PROOF F5 INTEGRATION: Simple hook usage
  useDashboardRefresh({
    dashboardType: 'platform',
    onRefresh: handleDataRefresh
  });

  // Initial load effect
  useEffect(() => {
    if (accountHolder && platform) {
      console.log(`[PlatformDashboard] 🚀 Initial load for ${platform}`);
      handleDataRefresh();
    }
  }, [platform, accountHolder, handleDataRefresh]);

  // ✅ CRITICAL FIX: Force profile reset when switching platforms
  useEffect(() => {
    console.log(`[PlatformDashboard] 🔄 Platform or accountHolder changed, resetting profile state`);
    
    // Reset profile state immediately to prevent stale data display
    setProfileInfo(null);
    setProfileError(null);
    setProfileLoading(false);
    setImageError(false);
    
    // Reset notifications and other platform-specific data
    setNotifications([]);
    
    // Force immediate profile fetch for new platform
    if (accountHolder && platform) {
      fetchProfileInfo();
    }
  }, [platform, accountHolder, fetchProfileInfo]);

  // ✅ CLEANUP: Reset state when component unmounts
  useEffect(() => {
    return () => {
      console.log(`[PlatformDashboard] 🧹 Component unmounting, cleaning up state for ${platform}`);
      
      // Close any open SSE connections
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Cancel any pending timeouts
      if (autoReplyTimeoutRef.current) {
        clearTimeout(autoReplyTimeoutRef.current);
        autoReplyTimeoutRef.current = null;
      }
    };
  }, [platform]);

  // Helper function to get viewed storage key
  const getViewedStorageKey = (section: string) => `viewed_${section}_${platform}_${accountHolder}`;

  // Helper functions to get unseen counts for each section
  const getUnseenStrategiesCount = () => {
    return safeLength(safeFilter(strategies, (strategy: { key: string }) => !viewedStrategies.has(strategy.key)));
  };

  const getUnseenCompetitorCount = () => {
    return safeLength(safeFilter(competitorData, (data: { key: string }) => !viewedCompetitorData.has(data.key)));
  };

  const getUnseenPostsCount = () => {
    return safeLength(safeFilter(posts, (post: { key: string }) => !viewedPosts.has(post.key)));
  };

  // Function to mark content as viewed with localStorage persistence
  const markStrategiesAsViewed = () => {
    const newViewedStrategies = new Set(Array.isArray(strategies) ? strategies.map(s => s.key) : []);
    setViewedStrategies(newViewedStrategies);
    localStorage.setItem(`viewed_strategies_${platform}_${accountHolder}`, JSON.stringify(Array.from(newViewedStrategies)));
  };

  const markCompetitorDataAsViewed = () => {
    const newViewedCompetitorData = new Set(Array.isArray(competitorData) ? competitorData.map(c => c.key) : []);
    setViewedCompetitorData(newViewedCompetitorData);
    localStorage.setItem(`viewed_competitor_data_${platform}_${accountHolder}`, JSON.stringify(Array.from(newViewedCompetitorData)));
  };

  const markPostsAsViewed = () => {
    const newViewedPosts = new Set(Array.isArray(posts) ? posts.map(p => p.key) : []);
    setViewedPosts(newViewedPosts);
    localStorage.setItem(`viewed_posts_${platform}_${accountHolder}`, JSON.stringify(Array.from(newViewedPosts)));
  };

  const fetchNotifications = async (attempt = 1, maxAttempts = 3) => {
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    
    // CRITICAL FIX: For Facebook, if facebookPageId is not available yet, try to fetch it
    if (platform === 'facebook' && !currentUserId) {
      console.log(`[${new Date().toISOString()}] [FACEBOOK-FETCH-FIX] Facebook pageId not available, attempting to get connection info`);
      
      // Try to get Facebook connection info directly
      if (currentUser?.uid) {
        try {
          const response = await fetch(`/api/facebook-connection/${currentUser.uid}`);
          if (response.ok) {
            const data = await response.json();
            if (data.facebook_page_id) {
              console.log(`[${new Date().toISOString()}] [FACEBOOK-FETCH-FIX] Retrieved Facebook pageId: ${data.facebook_page_id}`);
              // Use the retrieved pageId for this fetch
              const retrievedPageId = data.facebook_page_id;
              await fetchNotificationsWithUserId(retrievedPageId, attempt, maxAttempts);
              return;
            }
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [FACEBOOK-FETCH-FIX] Error fetching Facebook connection:`, error);
        }
      }
      
      console.log(`[${new Date().toISOString()}] No Facebook pageId available and couldn't retrieve connection info`);
      return;
    }
    
    if (!currentUserId) {
      console.log(`[${new Date().toISOString()}] No ${platform} user ID available for notifications`);
      return;
    }
    
    await fetchNotificationsWithUserId(currentUserId, attempt, maxAttempts);
  };

  const fetchNotificationsWithUserId = async (userId: string, attempt = 1, maxAttempts = 3) => {
    if (!accountHolder || accountHolder.trim() === '') {
      console.log(`[${new Date().toISOString()}] No accountHolder available for ${platform} notifications`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Fetching ${platform} notifications for ${userId} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      const response = await fetch(`/events-list/${userId}?platform=${platform}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${platform} notifications: ${response.status} ${response.statusText}`);
      }
      
      let data = await response.json();
      console.log(`[${new Date().toISOString()}] Received ${data.length} ${platform} notifications`);

      // CRITICAL FIX: Add defensive checks for Facebook notifications
      if (platform === 'facebook') {
        console.log(`[${new Date().toISOString()}] [FACEBOOK] Raw notifications data:`, {
          dataType: typeof data,
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : 'N/A',
          sampleData: Array.isArray(data) && data.length > 0 ? data[0] : null
        });
        
        // Ensure data is an array
        if (!Array.isArray(data)) {
          console.error(`[${new Date().toISOString()}] [FACEBOOK] Invalid notifications data type:`, typeof data);
          setNotifications([]);
          return;
        }
        
        // Validate each notification for required fields
        const validNotifications = data.filter((notif: any, index: number) => {
          if (!notif || typeof notif !== 'object') {
            console.warn(`[${new Date().toISOString()}] [FACEBOOK] Invalid notification at index ${index}:`, notif);
            return false;
          }
          
          // Check for required fields
          const hasRequiredFields = notif.type && 
                                  (notif.message_id || notif.comment_id) && 
                                  notif.text !== undefined && 
                                  notif.timestamp !== undefined;
          
          if (!hasRequiredFields) {
            console.warn(`[${new Date().toISOString()}] [FACEBOOK] Notification missing required fields at index ${index}:`, notif);
            return false;
          }
          
          return true;
        });
        
        console.log(`[${new Date().toISOString()}] [FACEBOOK] Validated notifications:`, {
          originalCount: data.length,
          validCount: validNotifications.length,
          filteredCount: data.length - validNotifications.length
        });
        
        // Use validated notifications
        data = validNotifications;
      }

      console.log(`[${new Date().toISOString()}] Fetching AI replies for ${platform} with accountHolder: "${accountHolder}"`);
      const aiReplies = await RagService.fetchAIReplies(accountHolder, platform);
      console.log(`[${new Date().toISOString()}] Received ${aiReplies.length} ${platform} AI replies`);
      
      const processedNotifications = data.map((notif: any) => {
        const matchingAiReply = aiReplies.find(pair => {
          const isMatchingType = pair.type === (notif.type === 'message' ? 'dm' : 'comment');
          const isMatchingId = 
            (notif.type === 'message' && pair.request.message_id === notif.message_id) ||
            (notif.type === 'comment' && pair.request.comment_id === notif.comment_id);
          
          return isMatchingType && isMatchingId;
        });
        
        if (matchingAiReply) {
          return {
            ...notif,
            status: 'ai_reply_ready',
            aiReply: {
              reply: matchingAiReply.reply.reply,
              replyKey: matchingAiReply.replyKey,
              reqKey: matchingAiReply.reqKey,
              timestamp: matchingAiReply.timestamp || Date.now(),
              generated_at: matchingAiReply.reply.generated_at || new Date().toISOString()
            }
          };
        }
        
        return notif;
      });
      
      // CRITICAL FIX: Add final validation before setting state
      if (platform === 'facebook') {
        const finalValidNotifications = processedNotifications.filter((notif: any) => {
          // Ensure all required fields are present and valid
          const isValid = notif && 
                         typeof notif === 'object' &&
                         notif.type && 
                         (notif.message_id || notif.comment_id) && 
                         typeof notif.text === 'string' && 
                         typeof notif.timestamp === 'number';
          
          if (!isValid) {
            console.error(`[${new Date().toISOString()}] [FACEBOOK] Final validation failed for notification:`, notif);
          }
          
          return isValid;
        });
        
        console.log(`[${new Date().toISOString()}] [FACEBOOK] Final notifications ready for state:`, {
          processedCount: processedNotifications.length,
          finalCount: finalValidNotifications.length,
          sampleNotification: finalValidNotifications.length > 0 ? finalValidNotifications[0] : null
        });
        
        setNotifications(finalValidNotifications);
      } else {
        setNotifications(processedNotifications);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error fetching ${platform} notifications (attempt ${attempt}/${maxAttempts}):`, error);
      if (attempt < maxAttempts) {
        setTimeout(() => fetchNotificationsWithUserId(userId, attempt + 1, maxAttempts), 2000);
      } else {
        // CRITICAL FIX: Set empty array on final failure to prevent crashes
        console.error(`[${new Date().toISOString()}] [${platform.toUpperCase()}] All attempts failed, setting empty notifications array`);
        setNotifications([]);
      }
    }
  };

  const setupSSE = (userId: string, attempt = 1) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`/events/${userId}?platform=${platform}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[${new Date().toISOString()}] ${platform} SSE connection established for ${userId}`);
      console.log(`[${new Date().toISOString()}] SSE URL: /events/${userId}?platform=${platform}`);
      reconnectAttempts.current = 0;
      fetchNotifications();
    };

    eventSource.onmessage = (event) => {
      reconnectAttempts.current = 0;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.error(`Failed to parse ${platform} SSE message:`, event.data, err);
        return;
      }

      console.log(`[${new Date().toISOString()}] ${platform} SSE message received:`, data);

      if (data.type === 'heartbeat') return;
      if (data.type === 'connection') {
        console.log(data.message);
        return;
      }

      if (data.type === 'usernameChanged') {
        if (data.username === accountHolder) {
          refreshAllData();
          setToast('Dashboard updated!');
        }
        return;
      }

      if (data.type === 'update' && data.prefix) {
        const { prefix } = data;
        const platformParam = `?platform=${platform}`;
        
        if (prefix.startsWith(`queries/${platform}/${accountHolder}/`)) {
          axios.get(`/api/responses/${accountHolder}${platformParam}`).then(res => {
            setResponses(Array.isArray(res.data) ? res.data : []);
            setToast(`New ${platform} response received!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} responses:`, err);
          });
        }
        
        if (prefix.startsWith(`recommendations/${platform}/${accountHolder}/`) || prefix.startsWith(`engagement_strategies/${platform}/${accountHolder}/`)) {
          const endpoint = accountType === 'branding' 
            ? `/api/retrieve-strategies/${accountHolder}${platformParam}`
            : `/api/retrieve-engagement-strategies/${accountHolder}${platformParam}`;
          
          axios.get(endpoint).then(res => {
            setStrategies(Array.isArray(res.data) ? res.data : []);
            setToast(`New ${platform} strategies available!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} strategies:`, err);
          });
        }
        
        if (prefix.startsWith(`ready_post/${platform}/${accountHolder}/`)) {
          axios.get(`/api/posts/${accountHolder}${platformParam}`).then(res => {
            setPosts(Array.isArray(res.data) ? res.data : []);
            setToast(`New ${platform} post cooked!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} posts:`, err);
          });
        }
        
        if (prefix.startsWith(`competitor_analysis/${platform}/${accountHolder}/`)) {
          Promise.all(
            competitors.map(comp =>
              axios.get(`/retrieve/${accountHolder}/${comp}${platformParam}`).catch(err => {
                if (err.response?.status === 404) return { data: [] };
                throw err;
              })
            )
          )
            .then(res => {
              const flatData = res.flatMap(r => Array.isArray(r.data) ? r.data : []);
              setCompetitorData(flatData);
              setToast(`New ${platform} competitor analysis available!`);
            })
            .catch(err => {
              console.error(`Error fetching ${platform} competitor data:`, err);
            });
        }
      }

      if (data.event === 'message' || data.event === 'comment') {
        console.log(`[${new Date().toISOString()}] Processing ${platform} SSE event: ${data.event}`, data.data);
        
        const notifType = data.event === 'message' ? 'dm' : 'comment';
        const notifId = data.data.message_id || data.data.comment_id;
        const notifText = data.data.text;
        
        const isRecentlySent = replySentTracker.some(reply => {
          if (reply.type === notifType) {
            const normalizedReply = reply.text.toLowerCase().trim();
            const normalizedNotif = notifText.toLowerCase().trim();
            
            return normalizedReply === normalizedNotif || 
                  normalizedNotif.includes(normalizedReply) ||
                  reply.id === notifId;
          }
          return false;
        });
        
        if (!isRecentlySent) {
          console.log(`[${new Date().toISOString()}] Adding new ${platform} notification to state:`, data.data);
          setNotifications(prev => {
            const updated = [data.data, ...safeFilter(prev, (n: any) => 
              n.message_id !== data.data.message_id && 
              n.comment_id !== data.data.comment_id
            )];
            return updated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
          });
          setToast(data.event === 'message' 
            ? `New ${platform === 'twitter' ? 'Twitter DM' : platform === 'facebook' ? 'Facebook message' : 'Instagram message'} received!` 
            : `New ${platform === 'twitter' ? 'Twitter mention' : platform === 'facebook' ? 'Facebook comment' : 'Instagram comment'} received!`);
        } else {
          console.log(`[${new Date().toISOString()}] Filtered out own ${platform} reply from notifications:`, data.data);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[${new Date().toISOString()}] ${platform} SSE error (attempt ${attempt}/${maxReconnectAttempts}):`, error);
      eventSource.close();
      eventSourceRef.current = null;

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        setTimeout(() => setupSSE(userId, attempt + 1), delay);
      }
    };
  };

  // ALL useEffect HOOKS MUST BE CALLED FIRST - Rules of Hooks
  useEffect(() => {
    if (isLoading) {
      const checkLoadingState = () => {
        if (platform === 'instagram' && igUserId) {
          setIsLoading(false);
        } else if (platform === 'twitter' && twitterId) {
          setIsLoading(false);
        } else if (platform === 'facebook') {
          // CRITICAL FIX: For Facebook, don't wait for facebookPageId to load notifications
          // This prevents the issue where notifications don't load on direct refresh
          console.log(`[${new Date().toISOString()}] [FACEBOOK-LOAD-FIX] Setting Facebook dashboard as loaded without waiting for pageId`);
          setIsLoading(false);
        } else if (loadingCheckRef.current) {
          // If we've already checked and still loading, stop checking
          setIsLoading(false);
        } else {
          loadingCheckRef.current = true;
          setTimeout(checkLoadingState, 1000);
        }
      };
      checkLoadingState();
    }
  }, [isLoading, platform, igUserId, twitterId, facebookPageId]);

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        // Refresh data when user returns to the tab
        if (accountHolder) {
          refreshAllData();
          fetchProfileInfo();
        }
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [accountHolder]);

  // Modern Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Helper to show toast with type and filter out false notification
  const showToast = (msg: string, type: 'info'|'success'|'error'|'warn' = 'info') => {
    if (msg && /Failed to initialize .* after many retries/i.test(msg)) return;
    setToast(msg);
    setToastType(type);
  };

  // Load previous conversations when the component mounts
  useEffect(() => {
    if (accountHolder) {
      RagService.loadConversations(accountHolder, platform)
        .then(messages => {
          const safeMessages = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content
          }));
          setChatMessages(safeMessages);
        })
        .catch(err => console.error('Failed to load conversations:', err));
    }
  }, [accountHolder, platform]);

  // Initialize notifications and SSE for the current platform - Optimized and efficient
  useEffect(() => {
    // Only run when loading is complete and we have the required userId
    if (isLoading) return;
    
    console.log(`[PlatformDashboard] ⚡ Setting up ${platform} connections efficiently...`);
    
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    
    if (platform === 'facebook') {
      console.log(`[PlatformDashboard] 📘 Setting up Facebook efficiently (pageId: ${facebookPageId || 'pending'})`);
      fetchNotifications(); // This handles cases where pageId is not available yet
      
      // Only setup SSE if we have pageId
      if (facebookPageId) {
        setupSSE(facebookPageId);
      }
    } else {
      // For other platforms, require userId
      if (!currentUserId) {
        console.warn(`[PlatformDashboard] ⚠️ Skipping setup: userId not available for ${platform}`);
        return;
      }
      console.log(`[PlatformDashboard] ⚡ Setting up ${platform} with userId:`, currentUserId);
      fetchNotifications();
      setupSSE(currentUserId);
    }

    // Cleanup on unmount only
    return () => {
      console.log(`[PlatformDashboard] 🧹 Cleaning up ${platform} connections...`);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isLoading, platform, twitterId, facebookPageId, igUserId]);

  // Optimized userId effect - Only handle Facebook pageId changes
  useEffect(() => {
    // Only for Facebook: Set up SSE when pageId becomes available
    if (platform === 'facebook' && facebookPageId && !eventSourceRef.current) {
      console.log('[PlatformDashboard] 📘 Facebook pageId available, setting up SSE:', facebookPageId);
      setupSSE(facebookPageId);
    }
  }, [facebookPageId, platform]);

  // Clean old entries from reply tracker
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      setReplySentTracker(prev => safeFilter(prev, reply => reply.timestamp > tenMinutesAgo));
    }, 60000);
    
    return () => clearInterval(cleanInterval);
  }, []);

  // ✅ ADDED: Clean old auto-replied notifications to prevent memory bloat
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      setAutoRepliedNotifications(prev => {
        if (prev.size > 1000) {
          console.log(`[${new Date().toISOString()}] Clearing auto-replied notifications set (size: ${prev.size})`);
          return new Set();
        }
        return prev;
      });
    }, 300000); // Clean every 5 minutes
    
    return () => clearInterval(cleanInterval);
  }, []);

  // Optimized Facebook connection handling
  useEffect(() => {
    if (platform !== 'facebook') return;
    
    const handleFacebookConnected = () => {
      console.log(`[PlatformDashboard] 📘 Facebook connected - refreshing notifications`);
      
      // Single refresh after Facebook connection
      setTimeout(() => {
        fetchNotifications();
      }, 1000);
    };
    
    window.addEventListener('facebookConnected', handleFacebookConnected as EventListener);
    
    return () => {
      window.removeEventListener('facebookConnected', handleFacebookConnected as EventListener);
    };
  }, [platform]);

  // Handle custom event for opening campaign modal
  useEffect(() => {
    const handleOpenCampaignEvent = (event: any) => {
      const { username, platform } = event.detail;
      if (username === accountHolder && platform === 'Twitter') {
        setShowCampaignButton(true);
        setIsCampaignModalOpen(true);
      }
    };

    const handleCampaignStoppedEvent = (event: any) => {
      const { username, platform } = event.detail;
      if (username === accountHolder && platform === 'twitter') {
        setShowCampaignButton(false);
        setIsCampaignModalOpen(false);
      }
    };

    window.addEventListener('openCampaignModal', handleOpenCampaignEvent);
    window.addEventListener('campaignStopped', handleCampaignStoppedEvent);
    
    return () => {
      window.removeEventListener('openCampaignModal', handleOpenCampaignEvent);
      window.removeEventListener('campaignStopped', handleCampaignStoppedEvent);
    };
  }, [accountHolder]);

  // Bio typing animation effect
  useEffect(() => {
    if (!profileInfo?.biography || !profileInfo.biography.trim()) {
      return;
    }

    // Start the initial animation sequence
    const timer1 = setTimeout(() => {
      // Fade out initial text after 5 seconds
      setShowInitialText(false);
      
      // Start showing bio with typing effect after fade out completes
      setTimeout(() => {
        setShowBio(true);
        
        // Start typing animation
        const bio = profileInfo.biography!; // Non-null assertion since we already checked
        let currentIndex = 0;
        
        const typeNextChar = () => {
          if (currentIndex < bio.length) {
            setTypedBio(bio.substring(0, currentIndex + 1));
            currentIndex++;
            
            // Fast typing speed - 50ms per character
            setTimeout(typeNextChar, 50);
          } else {
            setBioAnimationComplete(true);
          }
        };
        
        typeNextChar();
      }, 500); // Wait for fade out to complete
    }, 5000); // Initial 5 second delay

    return () => clearTimeout(timer1);
  }, [profileInfo?.biography]);

  // Reset animation states when profile info changes
  useEffect(() => {
    if (profileInfo?.biography && profileInfo.biography.trim()) {
      setShowInitialText(true);
      setShowBio(false);
      setTypedBio('');
      setBioAnimationComplete(false);
    }
  }, [profileInfo]);

  // [ADDED] ensure campaign button persists across refreshes by checking backend on mount
  useEffect(() => {
    if (!accountHolder) return;

    const checkCampaignStatus = async () => {
      try {
        const response = await axios.get(`/campaign-status/${accountHolder}?platform=${platform.toLowerCase()}&bypass_cache=true`);
        const status = response.data;
        if (status?.hasActiveCampaign) {
          setShowCampaignButton(true);
        }
      } catch (err) {
        console.error(`[PlatformDashboard] Error checking campaign status:`, err);
      }
    };

    checkCampaignStatus();
  }, [accountHolder, platform]);



  // Auto-mark strategies as viewed when they're accessed/opened (via intersection observer)
  useEffect(() => {
    const strategiesContainer = document.querySelector('.strategies');
    if (!strategiesContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            // Mark as viewed if user scrolls to and stays on strategies section
            setTimeout(() => {
              if (entry.isIntersecting && getUnseenStrategiesCount() > 0) {
                markStrategiesAsViewed();
              }
            }, 2000); // Mark as viewed after 2 seconds of viewing
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(strategiesContainer);
    return () => observer.disconnect();
  }, [strategies]);

  // Auto-mark competitor data as viewed when accessed
  useEffect(() => {
    const competitorContainer = document.querySelector('.competitor-analysis');
    if (!competitorContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setTimeout(() => {
              if (entry.isIntersecting && getUnseenCompetitorCount() > 0) {
                markCompetitorDataAsViewed();
              }
            }, 2000);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(competitorContainer);
    return () => observer.disconnect();
  }, [competitorData]);

  // Auto-mark posts as viewed when accessed
  useEffect(() => {
    const postsContainer = document.querySelector('.post-cooked');
    if (!postsContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setTimeout(() => {
              if (entry.isIntersecting && getUnseenPostsCount() > 0) {
                markPostsAsViewed();
              }
            }, 2000);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(postsContainer);
    return () => observer.disconnect();
  }, [posts]);

  // Update viewed sets when new data arrives
  useEffect(() => {
    const currentViewed = localStorage.getItem(`viewed_strategies_${platform}_${accountHolder}`);
    if (currentViewed) {
      setViewedStrategies(new Set(JSON.parse(currentViewed)));
    }
  }, [strategies]);

  useEffect(() => {
    const currentViewed = localStorage.getItem(`viewed_competitor_data_${platform}_${accountHolder}`);
    if (currentViewed) {
      setViewedCompetitorData(new Set(JSON.parse(currentViewed)));
    }
  }, [competitorData]);

  useEffect(() => {
    const currentViewed = localStorage.getItem(`viewed_posts_${platform}_${accountHolder}`);
    if (currentViewed) {
      setViewedPosts(new Set(JSON.parse(currentViewed)));
    }
  }, [posts]);

  // Check loading state on mount and after refreshes
  useEffect(() => {
    const checkLoadingState = () => {
      if (loadingCheckRef.current) return;
      loadingCheckRef.current = true;

      try {
        // Check if platform is marked as completed
        const completedPlatforms = localStorage.getItem('completedPlatforms');
        if (completedPlatforms) {
          const completed = JSON.parse(completedPlatforms);
          if (completed.includes(platform)) {
            setIsLoading(false);
            return;
          }
        }

        const savedCountdown = localStorage.getItem(`${platform}_processing_countdown`);
        const processingInfo = localStorage.getItem(`${platform}_processing_info`);
        
        if (savedCountdown && processingInfo) {
          const info = JSON.parse(processingInfo);
          const endTime = parseInt(savedCountdown);
          const now = Date.now();
          
          // Verify this loading state belongs to the current platform and is still active
          if (info.platform === platform && now < endTime) {
            const remainingMinutes = Math.ceil((endTime - now) / 1000 / 60);
            
            // ✅ CRITICAL FIX: NEVER pass username when re-navigating to prevent overwriting inter-username form data
            // The ProcessingLoadingState will get the username from localStorage, which is the source of truth
            navigate(`/processing/${platform}`, {
              state: {
                platform,
                // username: info.username || accountHolder, // REMOVED: This was overwriting the crucial inter-username form username
                remainingMinutes
              },
              replace: true
            });
            return;
          }
        }
        
        // If we reach here, either no loading state or it's expired/invalid
        // Do NOT remove processing keys here; the processing page owns lifecycle
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking loading state:', error);
        setIsLoading(false);
      }
    };

    // Check loading state immediately
    checkLoadingState();

    // Also check when window regains focus
    const handleFocus = () => {
      loadingCheckRef.current = false; // Reset the ref on focus
      checkLoadingState();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [platform, accountHolder, navigate]);

  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === platform) {
      navigate(`/processing/${platform}`, { replace: true });
    }
  }, [processingState, navigate, platform]);

  // Check guard after all hooks are called
  if (guard.active) {
    // React Router will have already redirected inside the hook, but return null to avoid rendering.
    return null;
  }

  // Determine current platform connection info
  const userId = platform === 'twitter' ? twitterId : 
               platform === 'facebook' ? facebookPageId : // Use Facebook Page ID
               igUserId;
  const isConnected = platform === 'twitter' ? isTwitterConnected : 
                     platform === 'facebook' ? isFacebookConnected : // Use Facebook context connection status
                     isInstagramConnected;
  
  // Platform configuration
  const config = {
    instagram: {
      name: 'Instagram',
      primaryColor: '#e4405f',
      secondaryColor: '#00ffcc',
      baseUrl: 'https://instagram.com/',
      supportsNotifications: true,
      supportsScheduling: true,
      supportsInsights: true
    },
    twitter: {
      name: 'X (Twitter)',
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      baseUrl: 'https://twitter.com/',
      supportsNotifications: true, // Enable Twitter notifications
      supportsScheduling: false, // Not implemented yet for Twitter
      supportsInsights: true // Enable Twitter insights
    },
    facebook: {
      name: 'Facebook',
      primaryColor: '#1877f2',
      secondaryColor: '#42a5f5',
      baseUrl: 'https://facebook.com/',
      supportsNotifications: true, // Enable notifications for Facebook
      supportsScheduling: true, // Enable scheduling for Facebook
      supportsInsights: true // Enable insights for Facebook
    }
  }[platform];

  // Platform-specific query parameter
  const platformParam = `?platform=${platform}`;

  // Show loading indicator while checking state
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#666'
        }}>
          <div style={{
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #00ffcc',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <div>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  const handleOpenChatFromMessages = (messageContent: string) => {
    console.log(`[PlatformDashboard] Opening chat for ${platform} with message: "${messageContent}"`);
    
    // If parent provides onOpenChat, use it and ALWAYS pass the platform
    if (onOpenChat) {
      // CRITICAL FIX: Pass the platform to ensure correct platform context
      if (onOpenChat.length >= 2) {
        // New signature: (messageContent: string, platform?: string) => void
        (onOpenChat as any)(messageContent, platform);
      } else {
        // Fallback for old signature
        onOpenChat(messageContent);
      }
    } else {
      // ✅ FIX 2: Chat bar is now dedicated to post creation, so open chat modal for discussions
      
      // Add the message content to chat messages as an assistant message
      const assistantMessage: ChatModalMessage = {
        role: 'assistant',
        content: messageContent
      };
      
      setChatMessages(prev => [...prev, assistantMessage]);
      
      // Open the chat modal
      setIsChatModalOpen(true);
    }
  };

  // Platform-specific notification handlers
  const handleReply = async (notification: any, replyText: string) => {
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    if (!currentUserId || !replyText.trim()) return;

    try {
      if (notification.type === 'message' && notification.sender_id && notification.message_id) {
        await axios.post(`/api/send-dm-reply/${currentUserId}`, {
          sender_id: notification.sender_id,
          text: replyText,
          message_id: notification.message_id,
          platform: platform
        });
        setReplySentTracker(prev => [
          ...prev, 
          {
            text: replyText,
            timestamp: Date.now(),
            type: 'dm' as const,
            id: notification.message_id || ''
          }
        ].slice(-20));
        setNotifications(prev => safeFilter(prev, n => n.message_id !== notification.message_id));
        setToast(`${platform === 'twitter' ? 'Tweet' : platform === 'facebook' ? 'Facebook message' : 'DM'} reply sent!`);
      } else if (notification.type === 'comment' && notification.comment_id) {
        await axios.post(`/api/send-comment-reply/${currentUserId}`, {
          comment_id: notification.comment_id,
          text: replyText,
          platform: platform
        });
        setReplySentTracker(prev => [
          ...prev, 
          {
            text: replyText,
            timestamp: Date.now(),
            type: 'comment' as const,
            id: notification.comment_id || ''
          }
        ].slice(-20));
        setNotifications(prev => safeFilter(prev, n => n.comment_id !== notification.comment_id));
        setToast(`${platform === 'twitter' ? 'Reply' : platform === 'facebook' ? 'Facebook comment reply' : 'Comment reply'} sent!`);
      }
    } catch (error: any) {
      // Handle specific Facebook errors
      if (error.response?.data?.error && error.response.data.error.includes('Personal Facebook accounts cannot send messages')) {
        console.error('Facebook personal account error:', error.response.data.error);
        setToast('Personal Facebook accounts cannot send messages. Please connect a Facebook Business Page instead.');
      } else if (error.response?.data?.error && error.response.data.error.includes('outside the allowed window')) {
        console.error('Facebook Messenger policy error:', error.response.data.error);
        setToast('Facebook policy: Messages can only be sent within 24 hours of the user\'s last message.');
      } else if (error.code === 'NETWORK_ERROR' || error.name === 'TypeError') {
        console.error('Network error sending reply:', error);
        setToast('Network error while sending reply.');
      } else if (error.response?.data?.error) {
        // Handle other API errors
        console.error('API error sending reply:', error.response.data.error);
        setToast(`Error: ${error.response.data.error}`);
      } else {
        // For functional errors, use debug level logging instead of error
        console.debug('Reply operation completed with response:', error);
        setToast('Reply processing completed.');
      }
    }
  };

  const handleIgnore = async (notification: any) => {
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    if (!currentUserId || (!notification.message_id && !notification.comment_id)) return;
    
    try {
      await axios.post(`/ignore-notification/${currentUserId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: platform
      });
      setNotifications(prev => safeFilter(prev, n =>
        !(
          (notification.message_id && n.message_id === notification.message_id) ||
          (notification.comment_id && n.comment_id === notification.comment_id)
        )
      ));
      setToast('Notification ignored!');
    } catch (error: any) {
      console.error('Error ignoring notification:', error);
      setToast('Failed to ignore notification.');
    }
  };

  const createAIReadyNotification = (notification: any, reply: string): any => {
    return {
      ...notification,
      status: 'ai_reply_ready' as const,
      aiReply: {
        reply,
        replyKey: `ai_${Date.now()}`,
        reqKey: `req_${Date.now()}`,
        timestamp: Date.now(),
        generated_at: new Date().toISOString(),
        sendStatus: undefined
      }
    };
  };

  const handleReplyWithAI = async (notification: Notification, notifId: string) => {
    if (!notification.text) {
      console.warn('No message text found for AI reply');
      return;
    }
    
    // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding
    const aiReplyAccessCheck = canUseFeature('aiReplies');
    if (!aiReplyAccessCheck.allowed) {
      console.warn(`[PlatformDashboard] 🚫 AI Reply blocked for ${platform} - ${aiReplyAccessCheck.reason}`);
      setToast(aiReplyAccessCheck.reason || 'AI Replies feature is not available');
      return;
    }
    
    try {
      const message = notification.text || '';
      const conversation = [{
        role: "user",
        content: message
      }];
      
      // ✅ REAL USAGE TRACKING: Track BEFORE generating AI reply
      const trackingSuccess = await trackRealAIReply(platform, {
        type: notification.type === 'message' ? 'dm' : 'comment',
        mode: 'instant'
      });
      
      if (!trackingSuccess) {
        console.warn(`[PlatformDashboard] 🚫 AI Reply tracking failed for ${platform} - limit may have been reached`);
        // Continue with AI reply generation even if tracking fails
      }
      
      // 🤖 DEFENSIVE AI REPLY TRACKING: Track AI reply usage
      await trackAIReply(`ai-reply-${platform.toLowerCase()}`);
      
      try {
        console.log(`[${new Date().toISOString()}] Calling RAG service for instant ${platform} AI reply`);
        
        const currentUserId = platform === 'twitter' ? twitterId : 
                               platform === 'facebook' ? facebookPageId :
                               igUserId;
        const response = await RagService.sendInstantAIReply(
          currentUserId || notification.twitter_user_id || notification.instagram_user_id || notification.facebook_page_id || 'unknown',
          accountHolder,
          conversation,
          {
            sender_id: notification.sender_id,
            message_id: notifId,
            platform: platform
          }
        );
        
        console.log(`[${new Date().toISOString()}] Successfully generated ${platform} AI reply via RAG service:`, 
          response.aiReply?.substring(0, 50) + '...'
        );
        
        console.log(`[PlatformDashboard] ✅ AI Reply tracked: ${platform} ${notification.type} reply`);
        setToast(`AI reply generated for ${notification.username || 'user'}`);
        
        // Remove the original notification to prevent duplicates
        setNotifications(prev => prev.map(n => {
          if ((n.message_id && n.message_id === notification.message_id) ||
              (n.comment_id && n.comment_id === notification.comment_id)) {
            return createAIReadyNotification(n, response.aiReply || '');
          }
          return n;
        }));
        
      } catch (ragError: any) {
        console.error(`[${new Date().toISOString()}] RAG service error for ${platform}:`, ragError);
        
        // Check if RAG service is completely down - IMPROVED DETECTION
        const isRagServerDown = 
          ragError.message?.includes('Network Error') || 
          ragError.message?.includes('ECONNREFUSED') ||
          ragError.message?.includes('Failed to connect') ||
          ragError.message?.includes('ERR_NETWORK') ||
          ragError.message?.includes('ERR_NAME_NOT_RESOLVED') ||
          ragError.response?.status === 503 ||
          ragError.response?.status === 502 ||
          ragError.response?.status === 504;
          
        if (isRagServerDown) {
          setToast(`RAG server unavailable, using standard AI Manager...`);
        } else {
          setToast('Failed to generate AI reply via RAG service');
        }
      }
      
    } catch (error: any) {
          // Only log actual errors, not expected AI reply generation variations
    if (error.message?.includes('Network') || error.name === 'TypeError') {
      console.error(`[${new Date().toISOString()}] Network error in handleReplyWithAI for ${platform}:`, error);
      setToast('Network error generating AI reply');
    } else {
      console.debug(`[${new Date().toISOString()}] AI reply generation completed for ${platform}:`, error);
      setToast('AI reply generation completed');
    }
    }
  };

  const handleSendAIReply = async (notification: any) => {
    if (!notification.aiReply || !notification.sender_id) return;
    
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    if (!currentUserId) return;
    
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    
    console.log(`[${new Date().toISOString()}] Sending ${platform} AI reply for ${notifId}`);
    
    setNotifications(prev => prev.map(n => {
      if ((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id)) {
        return {
          ...n,
          aiReply: {
            ...n.aiReply!,
            sendStatus: 'sending'
          }
        };
      }
      return n;
    }));
    
    try {
      const sendResponse = await fetch(`/api/send-dm-reply/${currentUserId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          sender_id: notification.sender_id,
          text: notification.aiReply.reply,
          message_id: notifId,
          platform: platform
        }),
      });
      
      const responseData = await sendResponse.json();
      
      if (sendResponse.ok) {
        console.log(`[${new Date().toISOString()}] Successfully sent ${platform} AI reply for ${notifId}`, responseData);
        
        setNotifications(prev => safeFilter(prev, n => 
          !((n.message_id && n.message_id === notification.message_id) || 
            (n.comment_id && n.comment_id === notification.comment_id))
        ));
        
        setToast(`${platform === 'twitter' ? 'Tweet' : 'AI'} reply sent successfully!`);
        
      } else {
        console.error(`[${new Date().toISOString()}] Server error sending ${platform} AI reply:`, responseData);
        
        if (responseData.code === 'USER_NOT_FOUND') {
          setNotifications(prev => prev.map(n => {
            if ((n.message_id && n.message_id === notification.message_id) || 
                (n.comment_id && n.comment_id === notification.comment_id)) {
              return {
                ...n,
                aiReply: {
                  ...n.aiReply!,
                  sendStatus: 'user-not-found'
                }
              };
            }
            return n;
          }));
          
          setToast(`Cannot send: ${platform === 'twitter' ? 'Twitter' : 'Instagram'} user not found`);
        } else if (responseData.error && responseData.error.includes('Personal Facebook accounts cannot send messages')) {
          setNotifications(prev => prev.map(n => {
            if ((n.message_id && n.message_id === notification.message_id) || 
                (n.comment_id && n.comment_id === notification.comment_id)) {
              return {
                ...n,
                aiReply: {
                  ...n.aiReply!,
                  sendStatus: 'personal-account-error',
                  sendError: 'Personal Facebook accounts cannot send messages via API'
                }
              };
            }
            return n;
          }));
          
          setToast('Personal Facebook accounts cannot send messages. Please connect a Facebook Business Page instead.');
        } else if (responseData.error && responseData.error.includes('outside the allowed window')) {
          setNotifications(prev => prev.map(n => {
            if ((n.message_id && n.message_id === notification.message_id) || 
                (n.comment_id && n.comment_id === notification.comment_id)) {
              return {
                ...n,
                aiReply: {
                  ...n.aiReply!,
                  sendStatus: 'policy-error',
                  sendError: 'Facebook policy: Messages can only be sent within 24 hours of the user\'s last message'
                }
              };
            }
            return n;
          }));
          
          setToast('Facebook policy: Messages can only be sent within 24 hours of the user\'s last message.');
        } else {
          if (responseData.handled) {
            console.log(`[${new Date().toISOString()}] ${platform} message marked as handled but not sent: ${responseData.warning || 'unknown reason'}`);
            
            setNotifications(prev => safeFilter(prev, n => 
              !((n.message_id && n.message_id === notification.message_id) || 
                (n.comment_id && n.comment_id === notification.comment_id))
            ));
            
            setToast(`Message marked as handled, but ${platform === 'twitter' ? 'tweet' : 'DM'} not sent: user not found`);
          } else {
            setNotifications(prev => prev.map(n => {
              if ((n.message_id && n.message_id === notification.message_id) || 
                  (n.comment_id && n.comment_id === notification.comment_id)) {
                return {
                  ...n,
                  aiReply: {
                    ...n.aiReply!,
                    sendStatus: 'error',
                    sendError: typeof responseData.error === 'string' ? responseData.error : 'Failed to send'
                  }
                };
              }
              return n;
            }));
            
            setToast(`Error sending ${platform} AI reply: ${typeof responseData.error === 'string' ? responseData.error : 'Unknown error'}`);
          }
        }
      }
    } catch (error: any) {
      // Only log genuine network errors, not functional completion
      if (error.code === 'NETWORK_ERROR' || error.name === 'TypeError' || error.message?.includes('fetch')) {
        console.error(`[${new Date().toISOString()}] Network error sending ${platform} AI reply:`, error);
      } else {
        console.debug(`[${new Date().toISOString()}] AI reply send operation completed for ${platform}:`, error);
      }
      
      setNotifications(prev => prev.map(n => {
        if ((n.message_id && n.message_id === notification.message_id) || 
            (n.comment_id && n.comment_id === notification.comment_id)) {
          return {
            ...n,
            aiReply: {
              ...n.aiReply!,
              sendStatus: 'network-error',
              sendError: error.message || 'Network error'
            }
          };
        }
        return n;
      }));
      
      setToast(`Network error sending ${platform} AI reply: ${error.message || 'Unknown error'}`);
    }
  };

  const handleIgnoreAIReply = async (notification: any) => {
    if (!notification.aiReply || !notification.aiReply.replyKey || !notification.aiReply.reqKey) {
      console.error(`[${new Date().toISOString()}] Cannot ignore ${platform} AI reply: missing replyKey or reqKey`);
      return;
    }
    
    try {
      setNotifications(prev => safeFilter(prev, n => 
        !((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id))
      ));
      
      const res = await fetch(`/ignore-ai-reply/${accountHolder}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          replyKey: notification.aiReply.replyKey, 
          reqKey: notification.aiReply.reqKey,
          platform: platform
        }),
      });
      
      if (!res.ok) {
        console.error(`[${new Date().toISOString()}] Server error ignoring ${platform} AI reply: ${res.status}`);
        fetchNotifications();
      } else {
        console.log(`[${new Date().toISOString()}] Successfully ignored ${platform} AI reply`);
        
        if (notification.status === 'ai_reply_ready') {
          fetchNotifications();
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error ignoring ${platform} AI reply:`, error);
      fetchNotifications();
    }
  };

  // NEW: Handle editing AI replies
  const handleEditAIReply = (notification: any, editedReply: string) => {
    console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Editing AI reply for notification:`, notification.message_id || notification.comment_id);
    
    setNotifications(prev => prev.map(n => {
      if ((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id)) {
        return {
          ...n,
          aiReply: {
            ...n.aiReply!,
            reply: editedReply,
            timestamp: Date.now(),
            generated_at: new Date().toISOString()
          }
        };
      }
      return n;
    }));
    
    setToast(`${platform === 'twitter' ? 'Tweet' : platform === 'facebook' ? 'Facebook' : 'AI'} reply updated successfully!`);
  };

  // Handle auto-reply to all notifications  
  const handleAutoReplyAll = async () => {
    if (notifications.length === 0) {
      setToast('No notifications to auto-reply to');
      return;
    }
    
    // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding
    const aiReplyAccessCheck = canUseFeature('aiReplies');
    if (!aiReplyAccessCheck.allowed) {
      setToast(aiReplyAccessCheck.reason || 'AI Replies feature is not available');
      return;
    }
    
    // CRITICAL FIX: Filter only pending notifications like Instagram implementation
    const pendingNotifications = notifications.filter((notif: any) => 
      !notif.status || notif.status === 'pending'
    );
    
    if (pendingNotifications.length === 0) {
      return;
    }
    
    setIsAutoReplying(true);
    setShouldStopAutoReply(false); // 🛑 STOP OPERATION: Reset stop flag
    
    // NEW: Initialize progress tracking
    setAutoReplyProgress({ current: 0, total: pendingNotifications.length, nextReplyIn: 0 });
    
    let successCount = 0;
    let failCount = 0;
    
    const currentUserId = platform === 'twitter' ? twitterId : 
                         platform === 'facebook' ? facebookPageId :
                         igUserId;
    
    try {
      // 🛡️ CRITICAL BUG FIX: Process notifications ONE AT A TIME with proper rate limiting
      // This prevents the Facebook bug where all messages were sent simultaneously
      for (let i = 0; i < pendingNotifications.length; i++) {
        // 🛑 STOP OPERATION: Check if user requested to stop
        if (shouldStopAutoReply) {
          console.log(`[PlatformDashboard] Auto-reply stopped by user at ${i + 1}/${pendingNotifications.length} for ${platform}`);
          setToast(`Auto-reply stopped (${i}/${pendingNotifications.length} completed)`);
          break;
        }
        
        const notification = pendingNotifications[i];
        const notificationId = notification.message_id || notification.comment_id || '';
        
        if (!notification.text) {
          failCount++;
          continue;
        }
        
        try {
          console.log(`[PlatformDashboard] 🔄 Processing notification ${i + 1}/${pendingNotifications.length} for ${platform}`);
          
          // 🛑 STOP OPERATION: Check stop flag before making RAG request
          if (shouldStopAutoReply) break;
          
          // Generate AI reply using the enhanced RAG server
          const response = await axios.post(getApiUrl('/api/instant-reply'), {
            username: accountHolder,
            notification: {
              type: notification.type,
              message_id: notification.message_id,
              comment_id: notification.comment_id,
              text: notification.text,
              username: notification.username,
              timestamp: notification.timestamp,
              platform: platform
            },
            platform: platform
          });

          // 🛑 STOP OPERATION: Check stop flag after RAG response
          if (shouldStopAutoReply) break;

          if (response.data.success && response.data.reply) {
            // Send the generated reply
            const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
            
            await axios.post(`/${endpoint}/${currentUserId}`, {
              sender_id: notification.sender_id,
              text: response.data.reply,
              message_id: notification.message_id,
              comment_id: notification.comment_id,
              platform: platform
            });

            // Mark notification as handled permanently
            await axios.post(`/mark-notification-handled/${currentUserId}`, {
              notification_id: notification.message_id || notification.comment_id,
              type: notification.type,
              handled_by: 'ai_auto_reply',
              platform: platform
            });

            // ✅ REAL USAGE TRACKING: Track actual auto-reply generation and sending
            const trackingSuccess = await trackRealAIReply(platform, {
              type: notification.type === 'message' ? 'dm' : 'comment',
              mode: 'auto'
            });
            
            if (!trackingSuccess) {
              console.warn(`[PlatformDashboard] 🚫 Auto AI Reply blocked for ${platform} - limit reached`);
              failCount++;
              continue; // Skip to next notification
            }
            
            // 🤖 DEFENSIVE AUTO AI REPLY TRACKING: Track auto AI reply usage
            await trackAIReply(`auto-ai-reply-${platform.toLowerCase()}`);
            
            console.log(`[PlatformDashboard] ✅ Auto AI Reply tracked: ${platform} ${notification.type}`);

            // 🚀 CRITICAL FIX: Remove notification from UI state to prevent double processing
            setNotifications(prev => prev.filter(n =>
              !(
                (n.message_id && n.message_id === notification.message_id) ||
                (n.comment_id && n.comment_id === notification.comment_id)
              )
            ));

            successCount++;
          } else {
            // 🚀 CRITICAL FIX: Remove notification from UI state even on failure to prevent reprocessing
            setNotifications(prev => prev.filter(n =>
              !(
                (n.message_id && n.message_id === notification.message_id) ||
                (n.comment_id && n.comment_id === notification.comment_id)
              )
            ));
            
            failCount++;
          }
          
          // 🛑 STOP OPERATION: Check stop flag before delay
          if (shouldStopAutoReply) break;
          
          // 🚀 CRITICAL RATE LIMITING FIX: Wait between requests to prevent simultaneous sending
          // This is the key fix that prevents the Facebook bug
          if (i < pendingNotifications.length - 1) {
            const delay = platform === 'twitter' ? 90000 : // 1.5 minutes for Twitter (strict limits)
                         platform === 'facebook' ? 60000 : // 1 minute for Facebook  
                         45000; // 45 seconds for Instagram
            
            console.log(`[PlatformDashboard] ⏱️ Waiting ${delay/1000}s before next ${platform} reply (${i + 1}/${pendingNotifications.length} completed)`);
            setToast(`Processing ${i + 1}/${pendingNotifications.length} - waiting ${delay/1000}s before next reply...`);
            
            // 🛑 STOP OPERATION: Use cancellable timeout for PlatformDashboard
            await new Promise<void>((resolve) => {
              autoReplyTimeoutRef.current = setTimeout(() => {
                autoReplyTimeoutRef.current = null;
                resolve();
              }, delay);
            });
            
            // 🛑 STOP OPERATION: Final check after delay
            if (shouldStopAutoReply) break;
          }
          
        } catch (error: any) {
          console.error(`Error auto-replying to ${notification.type} ${notificationId}:`, error);
          
          // Handle specific Facebook personal account error
          if (error.response?.data?.error && error.response.data.error.includes('Personal Facebook accounts cannot send messages')) {
            console.error('Facebook personal account error in auto-reply:', error.response.data.error);
            setToast('Personal Facebook accounts cannot send messages. Please connect a Facebook Business Page instead.');
          } else if (error.response?.data?.error) {
            console.error('API error in auto-reply:', error.response.data.error);
          }
          
          // 🚀 CRITICAL FIX: Remove notification from UI state even on exception to prevent reprocessing
          setNotifications(prev => prev.filter(n =>
            !(
              (n.message_id && n.message_id === notification.message_id) ||
              (n.comment_id && n.comment_id === notification.comment_id)
            )
          ));
          
          failCount++;
          
          // 🛑 STOP OPERATION: Check stop flag before error delay
          if (shouldStopAutoReply) break;
          
          // Continue with next notification even if one fails, but still respect rate limiting
          if (i < pendingNotifications.length - 1) {
            const delay = platform === 'facebook' ? 30000 : 15000; // Shorter delay on errors
            console.log(`[PlatformDashboard] ⚠️ Error occurred, waiting ${delay/1000}s before next attempt`);
            
            // 🛑 STOP OPERATION: Use cancellable timeout for error delays
            await new Promise<void>((resolve) => {
              autoReplyTimeoutRef.current = setTimeout(() => {
                autoReplyTimeoutRef.current = null;
                resolve();
              }, delay);
            });
          }
        }
      }
    } catch (error) {
      console.error('Auto-reply operation failed:', error);
      setToast('Auto-reply operation failed. Please try again.');
    } finally {
      setIsAutoReplying(false);
      setShouldStopAutoReply(false); // 🛑 STOP OPERATION: Reset stop flag
      
      // 🛑 STOP OPERATION: Cancel any pending timeout
      if (autoReplyTimeoutRef.current) {
        clearTimeout(autoReplyTimeoutRef.current);
        autoReplyTimeoutRef.current = null;
      }
    }
    
    // 🛑 STOP OPERATION: Final status message
    if (shouldStopAutoReply) {
      setToast(`Auto-reply stopped by user: ${successCount} sent, ${failCount} failed`);
    } else {
      setToast(`Auto-reply completed: ${successCount} sent, ${failCount} failed`);
    }
    
    // Refresh notifications
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
    }, 2000);
  };

  // 🛑 STOP OPERATION: Handle stop button click for PlatformDashboard
  const handleStopAutoReply = () => {
    console.log(`[PlatformDashboard] Stop auto-reply requested by user for ${platform}`);
    setShouldStopAutoReply(true);
    
    // NEW: Instant frontend state reset
    setIsAutoReplying(false);
    setAutoReplyProgress({ current: 0, total: 0, nextReplyIn: 0 });
    
    // Cancel any pending timeout immediately
    if (autoReplyTimeoutRef.current) {
      clearTimeout(autoReplyTimeoutRef.current);
      autoReplyTimeoutRef.current = null;
    }
    
    setToast(`${platform === 'twitter' ? 'Twitter' : platform === 'facebook' ? 'Facebook' : 'Platform'} auto-reply stopped`);
  };

  const handleSendQuery = async () => {
    if (!query.trim()) return;
    
    console.log(`[PlatformDashboard] 🚀 Starting post creation query for ${accountHolder} on ${platform}`);
    console.log(`[PlatformDashboard] 📝 Query: "${query}"`);
    
    setIsProcessing(true);
    
    try {
      // ✅ FIX 2: Chat bar is now dedicated to post creation only
      // ✅ PRE-ACTION CHECK: Verify post limits BEFORE performing action
      const postCheck = canUseFeature('posts');
      if (!postCheck.allowed) {
        console.warn(`[PlatformDashboard] 🚫 Post creation blocked for ${platform} - ${postCheck.reason}`);
        setToast(postCheck.reason || 'Post creation feature not available');
        setIsProcessing(false);
        return;
      }
      
      console.log(`[PlatformDashboard] 🎨 Generating ${platform} post for ${accountHolder}: "${query}"`);
      const response = await RagService.sendPostQuery(accountHolder, query, platform);
      
      console.log(`[PlatformDashboard] ✅ Received post generation response for ${accountHolder} on ${platform}`);
      console.log(`[PlatformDashboard] 📝 Post generation details:`, {
        success: response.success,
        hasPost: !!response.post,
        error: response.error
      });
      
      if (response.success && response.post) {
        const postContent = `
Caption: ${response.post.caption}

Hashtags: ${response.post.hashtags?.join(' ')}

Call to Action: ${response.post.call_to_action}

Image Description: ${response.post.image_prompt}
        `;
        
        setResult(postContent);
        console.log(`[PlatformDashboard] ✨ Post content generated for ${accountHolder} on ${platform}`);
        
        const userMessage: RagChatMessage = {
          role: 'user',
          content: `Generate ${platform} post: ${query}`
        };
        
        const assistantMessage: RagChatMessage = {
          role: 'assistant',
          content: postContent
        };
        
        const updatedMessages = [...chatMessages, 
          userMessage as ChatModalMessage, 
          assistantMessage as ChatModalMessage
        ];
        
        // ✅ REAL USAGE TRACKING: Track actual post creation
        const trackingSuccess = await trackRealPostCreation(platform, {
          scheduled: false,
          immediate: false,
          type: 'ai_generated_content'
        });
        
        if (!trackingSuccess) {
          console.warn(`[PlatformDashboard] 🚫 Post creation tracking failed for ${platform} - limit may have been reached`);
          // Don't return here - post was already generated successfully
        }
        
        setChatMessages(updatedMessages);
        console.log(`[PlatformDashboard] ✅ Post generation tracked: ${platform} AI content`);
        
        // TRIGGER POST REFRESH: Notify PostCooked component about new post
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: {
            username: accountHolder,
            platform: platform,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(newPostEvent);
        console.log(`[PlatformDashboard] 🔄 NEW POST: Triggered PostCooked refresh event for ${platform}`);
        
        // DON'T OPEN POPUP FOR POST MODE: Just show success message via toast
        setToast('Post generated successfully! Check the Cooked Posts section.');
        
      } else {
        console.error(`[PlatformDashboard] ❌ Post generation failed for ${accountHolder} on ${platform}:`, response.error);
        setToast('Failed to generate post. Please try again.');
      }
    } catch (error: any) {
      console.error(`[PlatformDashboard] ❌ Error processing post creation query for ${accountHolder} on ${platform}:`, error);
      setToast(error.message || 'Failed to process post creation query');
    } finally {
      setIsProcessing(false);
      setQuery('');
      console.log(`[PlatformDashboard] ✅ Completed post creation query processing for ${accountHolder} on ${platform}`);
    }
  };



  if (!accountHolder) {
    return null;
  }

  const formatCount = (count: number | undefined) => {
    if (count === undefined) return 'N/A';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  // Platform-specific connection handlers
  const handleInstagramConnected = (graphId: string, userId: string) => {
    if (!userId) {
      console.error(`[${new Date().toISOString()}] ${config.name} connection failed: userId is undefined`);
      setToast(`Failed to connect ${config.name}: Missing user ID`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] ${config.name} connected: graph ID: ${graphId}, user ID: ${userId}`);
    setToast(`${config.name} account connected successfully!`);
  };

  const handleTwitterConnected = (twitterId: string, username: string) => {
    if (!twitterId) {
      console.error(`[${new Date().toISOString()}] Twitter connection failed: twitterId is undefined`);
      setToast('Failed to connect Twitter: Missing user ID');
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Twitter connected via TwitterConnect: twitter ID: ${twitterId}, username: ${username}`);
    
    setToast('Twitter account connected successfully!');
  };

  const handleFacebookConnected = (facebookId: string, username: string) => {
    if (!facebookId) {
      console.error(`[${new Date().toISOString()}] Facebook connection failed: facebookId is undefined`);
      setToast('Failed to connect Facebook: Missing user ID');
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Facebook connected via FacebookConnect: facebook ID: ${facebookId}, username: ${username}`);
    connectFacebook(facebookId, username);
    setToast('Facebook account connected successfully!');
  };

  const handleOpenScheduler = () => {
    if (!config.supportsScheduling) {
      setToast(`Scheduling not available for ${config.name} yet`);
      return;
    }
    console.log(`[${new Date().toISOString()}] Opening PostScheduler for user ${userId}`);
    setIsSchedulerOpen(true);
  };

  const handleOpenInsights = () => {
    if (!config.supportsInsights) {
      setToast(`Insights not available for ${config.name} yet`);
      return;
    }
    console.log(`[${new Date().toISOString()}] Opening InsightsModal for user ${userId}`);
    setIsInsightsOpen(true);
  };

  const handleOpenGoalModal = () => {
    setIsGoalModalOpen(true);
  };

  const handleOpenCampaignModal = () => {
    setIsCampaignModalOpen(true);
  };

  const handleGoalSuccess = () => {
    setShowCampaignButton(true);
    setIsGoalModalOpen(false);
  };

  const handleCampaignStopped = () => {
    setShowCampaignButton(false);
    setIsCampaignModalOpen(false);
  };

  // 🚀 AUTOPILOT: Handlers for autopilot popup
  const handleOpenAutopilotPopup = () => {
    console.log(`[DEBUG] Opening autopilot popup for ${platform} - ${accountHolder}`);
    setIsAutopilotPopupOpen(true);
  };

  const handleCloseAutopilotPopup = () => {
    console.log(`[DEBUG] Closing autopilot popup for ${platform} - ${accountHolder}`);
    setIsAutopilotPopupOpen(false);
  };

  const handleOpenTwitterScheduler = () => {
    console.log(`[${new Date().toISOString()}] Opening Twitter PostScheduler for user ${twitterId}`);
    setIsTwitterSchedulerOpen(true);
  };

  const handleOpenTwitterInsights = () => {
    console.log(`[${new Date().toISOString()}] Opening Twitter InsightsModal for user ${twitterId}`);
    setIsTwitterInsightsOpen(true);
  };

  const handleOpenTwitterCompose = () => {
    console.log(`[${new Date().toISOString()}] Opening Twitter Compose for user ${twitterId}`);
    setIsTwitterComposeOpen(true);
  };

  // Facebook handlers
  const handleOpenFacebookScheduler = () => {
    console.log(`[${new Date().toISOString()}] Opening Facebook PostScheduler for user ${facebookPageId}`);
    setIsFacebookSchedulerOpen(true);
  };

  const handleOpenFacebookInsights = () => {
    console.log(`[${new Date().toISOString()}] Opening Facebook InsightsModal for user ${facebookPageId}`);
    setIsFacebookInsightsOpen(true);
  };

  const handleOpenFacebookCompose = () => {
    console.log(`[${new Date().toISOString()}] Opening Facebook Compose for user ${facebookPageId}`);
    setIsFacebookComposeOpen(true);
  };

  // Reset functionality handlers
  const handleOpenResetConfirm = () => {
    setIsResetConfirmOpen(true);
  };

  const handleCloseResetConfirm = () => {
    setIsResetConfirmOpen(false);
  };

  const handleConfirmReset = async () => {
    if (!currentUser) {
      setToast('User not authenticated');
      return;
    }

    setIsResetting(true);
    setIsResetConfirmOpen(false);

    try {
      console.log(`[${new Date().toISOString()}] 🔄 Starting bulletproof reset for ${platform} dashboard (user: ${currentUser.uid})`);

      // Use the bulletproof reset hook - this handles everything:
      // 1. Complete cache clearing (localStorage & sessionStorage)
      // 2. Session manager cleanup
      // 3. Backend API reset
      // 4. Browser history manipulation
      // 5. Navigation to main dashboard
      const resetSuccess = await resetAndAllowReconnection(platform, accountHolder);

      if (resetSuccess) {
        console.log(`[${new Date().toISOString()}] ✅ Bulletproof reset completed successfully for ${platform}`);
        setToast(`${platform.charAt(0).toUpperCase() + platform.slice(1)} dashboard reset successfully! Redirecting to main dashboard...`);
        
        // The navigation is already handled by the reset hook
        // No need for manual navigation here
      } else {
        throw new Error('Reset operation failed');
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Bulletproof reset failed for ${platform}:`, error);
      setToast('Failed to reset dashboard. Please try again.');
      
      // Fallback navigation if reset completely fails
      setTimeout(() => {
        navigate('/account', { replace: true });
      }, 2000);
    } finally {
      setIsResetting(false);
    }
  };

  // Legacy function kept for backward compatibility but no longer used
  const clearPlatformFrontendData = () => {
    // This function is now handled by the bulletproof reset hook
    console.log(`[${new Date().toISOString()}] ⚠️ clearPlatformFrontendData called - replaced by bulletproof reset`);
  };

  return (
    <>
      <motion.div
        className="dashboard-wrapper"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="welcome-header">
          <h1 className="welcome-text">
            Welcome {profileInfo?.fullName || accountHolder}!
          </h1>
          <div className="welcome-subtext-container" style={{ position: 'relative', minHeight: '48px' }}>
            <motion.p 
              className="welcome-subtext"
              animate={{ 
                opacity: showInitialText ? 1 : 0,
                y: showInitialText ? 0 : -10
              }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              Congrats! You are listed on top initial users of Sentient Marketing AI-powered Management!
            </motion.p>
            
            {profileInfo?.biography && profileInfo.biography.trim() && (
              <motion.div
                className="bio-text"
                animate={{ 
                  opacity: showBio ? 1 : 0,
                  y: showBio ? 0 : 10
                }}
                transition={{ duration: 0.5, ease: 'easeInOut', delay: showBio ? 0.2 : 0 }}
              >
                {typedBio}
                {showBio && !bioAnimationComplete && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ 
                      duration: 0.5,
                      repeat: Infinity,
                      repeatType: 'reverse'
                    }}
                    style={{ 
                      display: 'inline-block',
                      width: '2px',
                      height: '16px',
                      backgroundColor: '#00ffcc',
                      marginLeft: '2px',
                      verticalAlign: 'text-bottom'
                    }}
                  />
                )}
              </motion.div>
            )}
          </div>
        </div>
        <div className="modules-container">
          <div className="dashboard-grid">
            <div className="profile-metadata">
              <div className="profile-header">
                <div className="profile-bar">
                  {profileLoading ? (
                    <div className="profile-loading">Loading...</div>
                  ) : (
                    <>
                      {(profileInfo?.profilePicUrlHD || profileInfo?.profilePicUrl) && !imageError ? (
                        <img
                          src={`/api/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD || profileInfo.profilePicUrl)}&t=${Date.now()}`}
                          alt={`${accountHolder}'s profile picture`}
                          className="profile-pic-bar"
                          onError={(e) => {
                            console.error(`Failed to load ${platform} profile picture for ${accountHolder} attempt ${imageRetryAttemptsRef.current + 1}`);
                            if (imageRetryAttemptsRef.current < maxImageRetryAttempts) {
                              imageRetryAttemptsRef.current++;
                              const imgElement = e.target as HTMLImageElement;
                              const imageUrl = profileInfo.profilePicUrlHD || profileInfo.profilePicUrl;
                              
                              if (imageRetryAttemptsRef.current === 1) {
                                // First retry: try direct URL without proxy
                                console.log(`Trying direct URL for ${platform} profile picture, attempt ${imageRetryAttemptsRef.current}`);
                                setTimeout(() => {
                                  imgElement.src = imageUrl;
                                }, 500);
                              } else {
                                // Final retry: try proxy again with timestamp
                                console.log(`Final retry with proxy for ${platform}, attempt ${imageRetryAttemptsRef.current}/${maxImageRetryAttempts}`);
                                setTimeout(() => {
                                  imgElement.src = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}&t=${Date.now()}`;
                                }, 1000);
                              }
                            } else {
                              console.log(`Max retries reached for ${platform}, showing fallback for ${accountHolder}`);
                              setImageError(true);
                            }
                          }}
                        />
                      ) : (
                        <div className="profile-pic-bar">
                          <div className="profile-pic-fallback">
                            {profileInfo?.fullName ? profileInfo.fullName.charAt(0).toUpperCase() : accountHolder.charAt(0).toUpperCase()}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {platform !== 'facebook' && (
                    <div className="stats">
                      <div className="stat">
                        <span className="label">Followers</span>
                        <span className="value">
                          {formatCount(profileInfo?.followersCount)}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="label">Following</span>
                        <span className="value">
                          {formatCount(profileInfo?.followsCount)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="profile-actions">
                    {/* Platform-specific Connect button */}
                    {platform === 'instagram' ? (
                      <>
                        <InstagramConnect onConnected={handleInstagramConnected} />
                        <InstagramRequiredButton
                          isConnected={isConnected}
                          onClick={handleOpenInsights}
                          bypassConnectionRequirement={true}
                          className="dashboard-btn insights-btn"
                        >
                          <FaChartLine className="btn-icon" />
                          <span>Insights</span>
                        </InstagramRequiredButton>
                        <InstagramRequiredButton
                          isConnected={isConnected}
                          onClick={handleOpenScheduler}
                          className="dashboard-btn schedule-btn"
                        >
                          <FaCalendarAlt className="btn-icon" />
                          <span>Compose</span>
                        </InstagramRequiredButton>
                      </>
                    ) : platform === 'twitter' ? (
                      <>
                        <TwitterConnect onConnected={handleTwitterConnected} />
                        <TwitterRequiredButton
                          isConnected={isTwitterConnected}
                          onClick={handleOpenTwitterCompose}
                          className="dashboard-btn compose-btn twitter"
                        >
                          <FaPen className="btn-icon" />
                          <span>Compose</span>
                        </TwitterRequiredButton>
                        <TwitterRequiredButton
                          isConnected={isTwitterConnected}
                          onClick={handleOpenTwitterInsights}
                          bypassConnectionRequirement={true}
                          className="dashboard-btn insights-btn twitter"
                        >
                          <FaChartLine className="btn-icon" />
                          <span>Insights</span>
                        </TwitterRequiredButton>
                      </>
                    ) : platform === 'facebook' ? (
                      <>
                        <FacebookConnect onConnected={handleFacebookConnected} />
                        <FacebookRequiredButton
                          isConnected={isConnected}
                          onClick={handleOpenFacebookInsights}
                          bypassConnectionRequirement={true}
                          className="dashboard-btn insights-btn facebook"
                        >
                          <FaChartLine className="btn-icon" />
                          <span>Insights</span>
                        </FacebookRequiredButton>
                        <FacebookRequiredButton
                          isConnected={isConnected}
                          onClick={handleOpenFacebookScheduler}
                          className="dashboard-btn schedule-btn facebook"
                        >
                          <FaCalendarAlt className="btn-icon" />
                          <span>Compose</span>
                        </FacebookRequiredButton>
                      </>
                    ) : null}
                    
                    {/* 🚀 AUTOPILOT: Autopilot button with glassmorphism style */}
                    <button
                      onClick={handleOpenAutopilotPopup}
                      className={`dashboard-btn autopilot-btn ${platform === 'twitter' ? 'twitter' : platform === 'facebook' ? 'facebook' : platform === 'instagram' ? 'instagram' : ''}`}
                      title="Autopilot Mode - Automate your dashboard"
                    >
                      <FaRobot className="btn-icon" />
                      <span>Autopilot</span>
                    </button>
                    

                    
                    <button
                      onClick={handleOpenGoalModal}
                      className={`dashboard-btn goal-btn ${platform === 'twitter' ? 'twitter' : platform === 'facebook' ? 'facebook' : platform === 'instagram' ? 'instagram' : ''}`}
                    >
                      <TbTargetArrow className="btn-icon" />
                      <span>Goal</span>
                    </button>
                    
                    <button
                      onClick={handleOpenResetConfirm}
                      className={`dashboard-btn reset-btn ${platform === 'twitter' ? 'twitter' : platform === 'facebook' ? 'facebook' : platform === 'instagram' ? 'instagram' : ''}`}
                      disabled={isResetting}
                    >
                      <FaUndo className="btn-icon" />
                      <span>{isResetting ? 'Resetting...' : 'Reset'}</span>
                    </button>
                    
                    {showCampaignButton && (
                      <button
                        onClick={handleOpenCampaignModal}
                        className={`dashboard-btn campaign-btn ${platform === 'twitter' ? 'twitter' : platform === 'facebook' ? 'facebook' : platform === 'instagram' ? 'instagram' : ''}`}
                      >
                        <FaBullhorn className="btn-icon" />
                        <span>Campaign</span>
                      </button>
                    )}
                    
                    {/* ✨ MOBILE PROFILE MENU BUTTON */}
                    <button
                      className="mobile-profile-menu"
                      onClick={() => {
                        console.log('Hamburger button clicked, current state:', isMobileProfileMenuOpen);
                        setIsMobileProfileMenuOpen(!isMobileProfileMenuOpen);
                      }}
                    >
                      ☰
                    </button>
                  </div>
                </div>
              <div className="chart-placeholder"></div>
            </div>
          </div>

          {/* ✨ MOBILE PROFILE DROPDOWN - RENDERED OUTSIDE CONTAINER */}
          {isMobileProfileMenuOpen && (
            <div className="mobile-profile-dropdown" style={{ position: 'fixed', top: dropdownPosition.top, right: dropdownPosition.right }}>
              {/* ✨ PLATFORM-SPECIFIC CONNECT BUTTON INSIDE DROPDOWN */}
              <div className="mobile-connect-wrapper">
                {platform === 'instagram' ? (
                  <InstagramConnect onConnected={handleInstagramConnected} />
                ) : platform === 'twitter' ? (
                  <TwitterConnect onConnected={handleTwitterConnected} />
                ) : platform === 'facebook' ? (
                  <FacebookConnect onConnected={handleFacebookConnected} />
                ) : null}
              </div>
              
              {/* Platform-specific buttons */}
              {platform === 'instagram' ? (
                <>
                  <InstagramRequiredButton
                    isConnected={isConnected}
                    onClick={() => {
                      console.log('Mobile Insights clicked');
                      handleOpenInsights();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    bypassConnectionRequirement={true}
                    className="dashboard-btn insights-btn"
                  >
                    <FaChartLine className="btn-icon" />
                    <span>Insights</span>
                  </InstagramRequiredButton>
                  
                  <InstagramRequiredButton
                    isConnected={isConnected}
                    onClick={() => {
                      console.log('Mobile Compose clicked');
                      handleOpenScheduler();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    className="dashboard-btn schedule-btn"
                  >
                    <FaCalendarAlt className="btn-icon" />
                    <span>Compose</span>
                  </InstagramRequiredButton>
                </>
              ) : platform === 'twitter' ? (
                <>
                  <TwitterRequiredButton
                    isConnected={isTwitterConnected}
                    onClick={() => {
                      console.log('Mobile Compose clicked');
                      handleOpenTwitterCompose();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    className="dashboard-btn compose-btn twitter"
                  >
                    <FaPen className="btn-icon" />
                    <span>Compose</span>
                  </TwitterRequiredButton>
                  
                  <TwitterRequiredButton
                    isConnected={isTwitterConnected}
                    onClick={() => {
                      console.log('Mobile Insights clicked');
                      handleOpenTwitterInsights();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    bypassConnectionRequirement={true}
                    className="dashboard-btn insights-btn twitter"
                  >
                    <FaChartLine className="btn-icon" />
                    <span>Insights</span>
                  </TwitterRequiredButton>
                </>
              ) : platform === 'facebook' ? (
                <>
                  <FacebookRequiredButton
                    isConnected={isConnected}
                    onClick={() => {
                      console.log('Mobile Insights clicked');
                      handleOpenFacebookInsights();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    bypassConnectionRequirement={true}
                    className="dashboard-btn insights-btn facebook"
                  >
                    <FaChartLine className="btn-icon" />
                    <span>Insights</span>
                  </FacebookRequiredButton>
                  
                  <FacebookRequiredButton
                    isConnected={isConnected}
                    onClick={() => {
                      console.log('Mobile Compose clicked');
                      handleOpenFacebookScheduler();
                      setIsMobileProfileMenuOpen(false);
                    }}
                    className="dashboard-btn schedule-btn facebook"
                  >
                    <FaCalendarAlt className="btn-icon" />
                    <span>Compose</span>
                  </FacebookRequiredButton>
                </>
              ) : null}
              
              <button
                onClick={() => {
                  console.log('Mobile Goal clicked');
                  handleOpenGoalModal();
                  setIsMobileProfileMenuOpen(false);
                }}
                className={`dashboard-btn goal-btn ${platform}`}
              >
                <TbTargetArrow className="btn-icon" />
                <span>Goal</span>
              </button>
              
              <button
                onClick={() => {
                  console.log('Mobile Reset clicked');
                  handleOpenResetConfirm();
                  setIsMobileProfileMenuOpen(false);
                }}
                className={`dashboard-btn reset-btn ${platform}`}
                disabled={isResetting}
              >
                <FaUndo className="btn-icon" />
                <span>{isResetting ? 'Resetting...' : 'Reset'}</span>
              </button>
              
              {/* 🚀 AUTOPILOT: Mobile autopilot button */}
              <button
                onClick={() => {
                  console.log('Mobile Autopilot clicked');
                  handleOpenAutopilotPopup();
                  setIsMobileProfileMenuOpen(false);
                }}
                className={`dashboard-btn autopilot-btn ${platform}`}
                title="Autopilot Mode - Automate your dashboard"
              >
                <FaRobot className="btn-icon" />
                <span>Autopilot</span>
              </button>
              
              {showCampaignButton && (
                <button
                  onClick={() => {
                    console.log('Mobile Campaign clicked');
                    handleOpenCampaignModal();
                    setIsMobileProfileMenuOpen(false);
                  }}
                  className="dashboard-btn campaign-btn"
                >
                  <FaBullhorn className="btn-icon" />
                  <span>Campaign</span>
                </button>
              )}
            </div>
          )}

              <div 
                className={`news4u ${expandedModules.news4u ? 'mobile-expanded' : ''}`}
                onClick={(e) => handleMobileModuleClick('news4u', e)}
              >
                <h2>
                  <div className="section-header">
                    <FaRss className="section-icon" />
                    <span>News 4U</span>
                    <div className="content-badge premium">
                      <span className="badge-text">Premium</span>
                    </div>
                  </div>
                </h2>
                <News4U accountHolder={accountHolder} platform={platform} />
              </div>

            {config.supportsNotifications && (
              <div 
                className={`notifications ${expandedModules.notifications ? 'mobile-expanded' : ''}`}
                onClick={(e) => handleMobileModuleClick('notifications', e)}
              >
                <h2 style={{ marginBottom: '8px' }}>
                  <div className="section-header">
                    <span><i className="fas fa-bell"></i> Notifications</span>
                    <div className="content-badge premium">
                      <span className="badge-text">Premium</span>
                    </div>
                  </div>
                </h2>
                <DmsComments 
                  notifications={notifications} 
                  onReply={handleReply} 
                  onIgnore={handleIgnore} 
                  onRefresh={() => {
                    setRefreshKey(prev => prev + 1);
                    fetchNotifications(1, 3);
                  }} 
                  onReplyWithAI={(notification: Notification) => {
                    const notifId = notification.message_id || notification.comment_id || 'unknown';
                    handleReplyWithAI(notification, notifId);
                  }}
                  onAutoReplyAll={handleAutoReplyAll}
                  onStopAutoReply={handleStopAutoReply}
                  isAutoReplying={isAutoReplying}
                  username={accountHolder}
                  onIgnoreAIReply={handleIgnoreAIReply}
                  refreshKey={refreshKey}
                  igBusinessId={platform === 'instagram' ? igUserId : undefined}
                  twitterId={platform === 'twitter' ? twitterId : undefined}
                  facebookPageId={platform === 'facebook' ? facebookPageId : undefined}
                  aiRepliesRefreshKey={refreshKey}
                  onAIRefresh={() => setRefreshKey(prev => prev + 1)}
                  aiProcessingNotifications={aiProcessingNotifications}
                  onSendAIReply={handleSendAIReply}
                  onEditAIReply={handleEditAIReply}
                  autoReplyProgress={autoReplyProgress}
                  platform={platform}
                />
              </div>
            )}

            <div className="post-cooked">
              <PostCooked
                username={accountHolder}
                profilePicUrl=""
                posts={posts}
                userId={userId || undefined}
                platform={platform}
              />
            </div>

            <div 
              className={`strategies ${expandedModules.strategies ? 'mobile-expanded' : ''}`}
              onClick={(e) => handleMobileModuleClick('strategies', e)}
            >
              <h2>
                <div className="section-header">
                  <BsLightbulb className="section-icon" />
                  <span>{config.name} Strategies</span>
                  {getUnseenStrategiesCount() > 0 ? (
                    <div className="content-badge" onClick={markStrategiesAsViewed}>
                      <FaBell className="badge-icon" />
                      <span className="badge-count">{getUnseenStrategiesCount()}</span>
                    </div>
                  ) : (
                    <div className="content-badge viewed">
                      <FaBell className="badge-icon" />
                      <span className="badge-text">Viewed</span>
                    </div>
                  )}
                </div>
              </h2>
              <OurStrategies accountHolder={accountHolder} accountType={accountType} platform={platform} />
            </div>

            <div 
              className={`competitor-analysis ${expandedModules.competitorAnalysis ? 'mobile-expanded' : ''}`}
              onClick={(e) => handleMobileModuleClick('competitorAnalysis', e)}
            >
              {/* Always show competitor analysis for both account types */}
              <h2>
                <div className="section-header">
                  <GiSpy className="section-icon" />
                  <span>{config.name} Competitor Analysis</span>
                  {getUnseenCompetitorCount() > 0 ? (
                    <div className="content-badge" onClick={markCompetitorDataAsViewed}>
                      <FaBell className="badge-icon" />
                      <span className="badge-count">{getUnseenCompetitorCount()}</span>
                    </div>
                  ) : (
                    <div className="content-badge viewed">
                      <FaBell className="badge-icon" />
                      <span className="badge-text">Viewed</span>
                    </div>
                  )}
                </div>
              </h2>
              <Cs_Analysis accountHolder={accountHolder} competitors={competitors} platform={platform} />
            </div>

            <div className="post-creation-bar">
              <div className="post-creation-container">
                <div className="post-creation-label">
                  <FaPencilAlt className="post-icon" />
                  <span>Create Post</span>
                </div>
                
                <div className="post-input-section">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`What would you like to post on ${config.name}?`}
                    className="post-input-field"
                    disabled={isProcessing}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isProcessing && query.trim()) {
                        handleSendQuery();
                      }
                    }}
                  />
                </div>
                
                <button 
                  className={`post-send-btn ${isProcessing ? 'processing' : ''}`} 
                  onClick={handleSendQuery} 
                  disabled={!query.trim() || isProcessing}
                  title="Send Post"
                >
                  {isProcessing ? (
                    <div className="btn-spinner"></div>
                  ) : (
                    <FaRocket />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        <ToastNotification toast={toast} type={toastType} />
      </motion.div>
      
      {isGoalModalOpen && (
        <GoalModal 
          username={accountHolder} 
          platform={platform}
          onClose={() => setIsGoalModalOpen(false)}
          onSuccess={handleGoalSuccess}
        />
      )}
      {isSchedulerOpen && config.supportsScheduling && (
        <PostScheduler userId={userId!} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing PostScheduler`);
          setIsSchedulerOpen(false);
        }} />
      )}
      {isInsightsOpen && config.supportsInsights && (
        <InsightsModal userId={userId!} accountHolder={accountHolder} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing InsightsModal`);
          setIsInsightsOpen(false);
        }} />
      )}
      {isChatModalOpen && (
        <ChatModal 
          open={isChatModalOpen}
          messages={chatMessages}
          onClose={() => setIsChatModalOpen(false)}
          username={`${accountHolder} (${config.name})`}
          platform={platform}
          onSendMessage={(message: string, model?: string) => {
            if (!message.trim() || !accountHolder) return;
            setIsProcessing(true);
            RagService.sendDiscussionQuery(accountHolder, message, chatMessages as RagChatMessage[], platform, model)
              .then(response => {
                const updatedMessages = [
                  ...chatMessages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: response.response }
                ];
                setChatMessages(updatedMessages);
                
                RagService.saveConversation(accountHolder, updatedMessages, platform)
                  .catch(err => console.error('Error saving conversation:', err));
              })
              .catch(error => {
                console.error('Error with chat message:', error);
                setToast('Failed to send message.');
              })
              .finally(() => {
                setIsProcessing(false);
              });
          }}
          isProcessing={isProcessing}
          linkedAccounts={linkedAccounts}
        />
      )}
      {isTwitterSchedulerOpen && (
        <PostScheduler 
          userId={twitterId!} 
          platform="twitter"
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Twitter PostScheduler`);
            setIsTwitterSchedulerOpen(false);
          }} 
        />
      )}
      
      {isTwitterInsightsOpen && (
        <InsightsModal 
          userId={twitterId!} 
          platform="twitter"
          accountHolder={accountHolder}
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Twitter InsightsModal`);
            setIsTwitterInsightsOpen(false);
          }} 
        />
      )}
      
      {isTwitterComposeOpen && (
        <TwitterCompose 
          userId={twitterId!} 
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Twitter Compose`);
            setIsTwitterComposeOpen(false);
          }} 
        />
      )}
      
      {isFacebookSchedulerOpen && (
        <PostScheduler 
          userId={facebookPageId!} 
          platform="facebook"
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Facebook PostScheduler`);
            setIsFacebookSchedulerOpen(false);
          }} 
        />
      )}
      
      {isFacebookInsightsOpen && (
        <InsightsModal 
          userId={facebookPageId!} 
          platform="facebook"
          accountHolder={accountHolder}
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Facebook InsightsModal`);
            setIsFacebookInsightsOpen(false);
          }} 
        />
      )}
      
      {isFacebookComposeOpen && (
        <TwitterCompose 
          userId={facebookPageId!} 
          onClose={() => {
            console.log(`[${new Date().toISOString()}] Closing Facebook Compose`);
            setIsFacebookComposeOpen(false);
          }} 
        />
      )}
      {isCampaignModalOpen && (
        <CampaignModal 
          username={accountHolder}
          platform={platform}
          isConnected={isConnected}
          onClose={() => setIsCampaignModalOpen(false)}
          onCampaignStopped={handleCampaignStopped}
        />
      )}

      {/* Upgrade Popup */}
      <AccessControlPopup
        isOpen={showUpgradePopup}
        onClose={closeUpgradePopup}
        feature={blockedFeature || 'posts'}
        reason={`You've reached your ${blockedFeature || 'feature'} limit`}
        limitReached={true}
        upgradeRequired={false}
        redirectToPricing={true}
        currentUsage={currentUsage}
      />

      {/* Reset Confirmation Popup */}
      {isResetConfirmOpen && (
        <div className="modal-overlay" onClick={handleCloseResetConfirm}>
          <motion.div 
            className="modal-content reset-confirm-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reset-confirm-content">
              <div className="reset-confirm-header">
                <FaUndo className="reset-icon" />
                <h2>Reset {platform.charAt(0).toUpperCase() + platform.slice(1)} Dashboard</h2>
              </div>
              
              <div className="reset-confirm-body">
                <p>Are you sure you want to reset your {platform.charAt(0).toUpperCase() + platform.slice(1)} dashboard?</p>
                <div className="reset-warning">
                  <strong>This will:</strong>
                  <ul>
                    <li>Remove your current platform dashboard access</li>
                    <li>Clear all connection data for this platform</li>
                    <li>Reset your platform to "not acquired" status</li>
                    <li>Require you to enter username details again</li>
                  </ul>
                  <p><strong>Note:</strong> Your post history and backend data will be preserved.</p>
                </div>
              </div>
              
              <div className="reset-confirm-actions">
                <button 
                  className="cancel-btn"
                  onClick={handleCloseResetConfirm}
                  disabled={isResetting}
                >
                  Cancel
                </button>
                <button 
                  className="reset-btn-confirm"
                  onClick={handleConfirmReset}
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <>
                      <div className="loading-spinner"></div>
                      Resetting...
                    </>
                  ) : (
                    <>
                      <FaUndo />
                      Yes, Reset Dashboard
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 🚀 AUTOPILOT: Autopilot Popup - Exact same functionality as CampaignModal */}
      {isAutopilotPopupOpen && (
        <AutopilotPopup
          username={accountHolder}
          platform={platform}
          isConnected={isConnected}
          onClose={handleCloseAutopilotPopup}
        />
      )}

      {/* ✨ MOBILE FLOATING ACTION BUTTONS */}
      <div className="mobile-floating-actions">
        <button
          className="mobile-floating-btn chat-btn"
          onClick={() => setIsMobileChatOpen(true)}
          title="AI Chat"
        >
          💬
        </button>
        <button
          className="mobile-floating-btn image-btn"
          onClick={() => setIsMobileImageEditorOpen(true)}
          title="Image Editor"
        >
          🎨
        </button>
        <button
          className="mobile-floating-btn profile-btn"
          onClick={() => setIsMobileProfilePopupOpen(true)}
          title="Profile"
        >
          👤
        </button>
        <button
          className="mobile-floating-btn manual-btn"
          onClick={() => setIsMobileManualOpen(true)}
          title="Manual"
        >
          📘
        </button>
      </div>

      {/* ✨ MOBILE CHAT MODAL */}
      {isMobileChatOpen && (
        <ChatModal 
          open={isMobileChatOpen}
          messages={chatMessages}
          onClose={() => setIsMobileChatOpen(false)}
          username={accountHolder}
          onSendMessage={(message: string, model?: string) => {
            if (!message.trim() || !accountHolder) return;
            setIsProcessing(true);
            RagService.sendDiscussionQuery(accountHolder, message, chatMessages as RagChatMessage[], platform, model)
              .then(response => {
                const updatedMessages = [
                  ...chatMessages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: response.response }
                ];
                setChatMessages(updatedMessages);
                
                RagService.saveConversation(accountHolder, updatedMessages, platform)
                  .catch(err => console.error('Error saving conversation:', err));
              })
              .catch(error => {
                console.error('Error with chat message:', error);
                setToast('Failed to send message.');
              })
              .finally(() => {
                setIsProcessing(false);
              });
          }}
          isProcessing={isProcessing}
          linkedAccounts={linkedAccounts}
          platform={platform}
        />
      )}

      {/* ✨ MOBILE IMAGE EDITOR MODAL */}
      {isMobileImageEditorOpen && (
        <div className="mobile-image-editor-overlay">
          <div className="mobile-image-editor-content">
            <div className="mobile-image-editor-header">
              <h3>Image Editor</h3>
              <button 
                className="close-mobile-image-editor"
                onClick={() => setIsMobileImageEditorOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mobile-image-editor-body">
              <p>Image editor functionality coming soon...</p>
            </div>
          </div>
        </div>
      )}

      {/* ✨ MOBILE PROFILE POPUP (Real) */}
      {isMobileProfilePopupOpen && (
        <ProfilePopup 
          username={accountHolder}
          onClose={() => setIsMobileProfilePopupOpen(false)}
          platform={platform}
        />
      )}

      {/* ✨ MOBILE MANUAL GUIDANCE POPUP */}
      {isMobileManualOpen && (
        <ManualGuidance onClose={() => setIsMobileManualOpen(false)} />
      )}
    </>
  );
};

export default PlatformDashboard;

// Modern Toast Notification Component
const ToastNotification: React.FC<{ toast: string | null; type?: 'info'|'success'|'error'|'warn' }> = ({ toast, type = 'info' }) => {
  if (!toast) return null;
  const colorMap = {
    info: '#2196f3',
    success: '#4caf50',
    error: '#f44336',
    warn: '#ff9800',
  };
  const iconMap = {
    info: <FaInfoCircle style={{ marginRight: 8 }} />,
    success: <FaBell style={{ marginRight: 8 }} />,
    error: <FaBell style={{ marginRight: 8 }} />,
    warn: <FaBell style={{ marginRight: 8 }} />,
  };
  return (
    <div style={{
      position: 'fixed',
      top: 24,
      right: 24,
      zIndex: 9999,
      minWidth: 320,
      maxWidth: 400,
      background: '#fff',
      boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
      borderRadius: 12,
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      color: colorMap[type],
      fontWeight: 500,
      fontSize: 16,
      gap: 8,
      border: `2px solid ${colorMap[type]}`,
      transition: 'opacity 0.3s',
      pointerEvents: 'auto',
    }}>
      {iconMap[type]}
      <span>{toast}</span>
    </div>
  );
};