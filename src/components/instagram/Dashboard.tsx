import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import OurStrategies from './OurStrategies';
import PostCooked from './PostCooked';
import { getApiUrl } from '../../config/api';
import InstagramConnect from './InstagramConnect';
import DmsComments from './Dms_Comments';
import PostScheduler from './PostScheduler';
import InsightsModal from './InsightsModal';
import GoalModal from './GoalModal';
import CampaignModal from './CampaignModal';
import News4U from '../common/News4U';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import useUpgradeHandler from '../../hooks/useUpgradeHandler';
import AccessControlPopup from '../common/AccessControlPopup';
import useResetPlatformState from '../../hooks/useResetPlatformState';
import AutopilotPopup from '../common/AutopilotPopup';

import ChatModal from './ChatModal';
import RagService from '../../services/RagService';
import type { ChatMessage as ChatModalMessage } from './ChatModal';
import type { Notification, ProfileInfo, LinkedAccount } from '../../types/notifications';
import { safeFilter, safeLength } from '../../utils/safeArrayUtils';
// Import icons from react-icons
import { FaChartLine, FaCalendarAlt, FaBullhorn, FaUndo, FaPencilAlt, FaRocket, FaRobot } from 'react-icons/fa';
import { TbTargetArrow } from 'react-icons/tb';

// Define RagService compatible ChatMessage
interface RagChatMessage {
  role: string;
  content: string;
}

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors }) => {

  useEffect(() => {
    document.body.classList.add('instagram-dashboard-active');
    // Cleanup function to remove the class when the component unmounts
    return () => {
      document.body.classList.remove('instagram-dashboard-active');
    };
  }, []); // Empty dependency array ensures this runs only once on mount and cleanup on unmount

  const { currentUser } = useAuth();
  const { isFeatureBlocked, trackRealDiscussion, trackRealAIReply, trackRealPostCreation, canUseFeature } = useFeatureTracking();
  const { showUpgradePopup, blockedFeature, handleFeatureAttempt, closeUpgradePopup, currentUsage } = useUpgradeHandler();
  const { resetAndAllowReconnection } = useResetPlatformState();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { userId: igBusinessId, isConnected: isInstagramConnected, connectInstagram } = useInstagram();
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingNotifications, setProcessingNotifications] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatModalMessage[]>([]);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [result, setResult] = useState('');
  const [isMobileProfileMenuOpen, setIsMobileProfileMenuOpen] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isMobileImageEditorOpen, setIsMobileImageEditorOpen] = useState(false);
  const [isMobileProfilePopupOpen, setIsMobileProfilePopupOpen] = useState(false);
  const [isAutopilotPopupOpen, setIsAutopilotPopupOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const profileActionsRef = useRef<HTMLDivElement>(null);

  // Content viewed tracking - track what has been seen vs unseen with localStorage persistence
  const getViewedStorageKey = (section: string) => `viewed_${section}_instagram_${accountHolder}`;

  const [viewedStrategies, setViewedStrategies] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(getViewedStorageKey('strategies'));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
  const [viewedCompetitorData, setViewedCompetitorData] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(getViewedStorageKey('competitor'));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const [viewedPosts, setViewedPosts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(getViewedStorageKey('posts'));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const [autopilotStatus, setAutopilotStatus] = useState<{
    enabled: boolean;
    autoSchedule: boolean;
    autoReply: boolean;
    scheduledCount: number;
    repliedCount: number;
  }>({
    enabled: false,
    autoSchedule: false,
    autoReply: false,
    scheduledCount: 0,
    repliedCount: 0
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const maxImageRetryAttempts = useRef(3);
  const imageRetryAttemptsRef = useRef(0);
  const firstLoadRef = useRef(true);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;
  const lastProfilePicRenderTimeRef = useRef<number>(0);
  const [aiProcessingNotifications, setAiProcessingNotifications] = useState<string[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);

  const [showInitialText, setShowInitialText] = useState(true);
  const [showBio, setShowBio] = useState(false);
  const [typedBio, setTypedBio] = useState('');
  const [bioAnimationComplete, setBioAnimationComplete] = useState(false);

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
    news4u: false
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoReplyProgress, setAutoReplyProgress] = useState<{ 
    current: number;
    total: number;
    nextReplyIn: number;
  }>({ current: 0, total: 0, nextReplyIn: 0 });
  const [isAutoReplying, setIsAutoReplying] = useState(false);
  const [shouldStopAutoReply, setShouldStopAutoReply] = useState(false);
  const autoReplyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to get unseen count for each section
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
    localStorage.setItem(getViewedStorageKey('strategies'), JSON.stringify(Array.from(newViewedStrategies)));
  };

  const markCompetitorDataAsViewed = () => {
    const newViewedCompetitorData = new Set(Array.isArray(competitorData) ? competitorData.map(c => c.key) : []);
    setViewedCompetitorData(newViewedCompetitorData);
    localStorage.setItem(getViewedStorageKey('competitor'), JSON.stringify(Array.from(newViewedCompetitorData)));
  };

  const markPostsAsViewed = () => {
    const newViewedPosts = new Set(Array.isArray(posts) ? posts.map(p => p.key) : []);
    setViewedPosts(newViewedPosts);
    localStorage.setItem(getViewedStorageKey('posts'), JSON.stringify(Array.from(newViewedPosts)));
  };

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
    const currentViewed = localStorage.getItem(getViewedStorageKey('strategies'));
    if (currentViewed) {
      setViewedStrategies(new Set(JSON.parse(currentViewed)));
    }
  }, [strategies]);

  useEffect(() => {
    const currentViewed = localStorage.getItem(getViewedStorageKey('competitor'));
    if (currentViewed) {
      setViewedCompetitorData(new Set(JSON.parse(currentViewed)));
    }
  }, [competitorData]);

  useEffect(() => {
    const currentViewed = localStorage.getItem(getViewedStorageKey('posts'));
    if (currentViewed) {
      setViewedPosts(new Set(JSON.parse(currentViewed)));
    }
  }, [posts]);

  const fetchProfileInfo = async () => {
    if (!accountHolder) return;
    setProfileLoading(true);
    setProfileError(null);
    setImageError(false);
    try {
      const now = Date.now();
      // 🔥 CRITICAL FIX: Only throttle profile picture fetching, not the entire profile data
      // This ensures we always fetch follower counts and other profile data
      console.log(`[${new Date().toISOString()}] Fetching Instagram profile info for ${accountHolder}`);
      const response = await axios.get(`/api/profile-info/${accountHolder}?forceRefresh=true`);
      
      // 🎯 CRITICAL DEBUG: Log the exact response to understand data structure
      console.log(`[${new Date().toISOString()}] Profile Info Response:`, response.data);
      console.log(`[${new Date().toISOString()}] Followers Count:`, response.data?.followersCount);
      console.log(`[${new Date().toISOString()}] Following Count:`, response.data?.followsCount);
      
      setProfileInfo(response.data);
      lastProfilePicRenderTimeRef.current = now;
      imageRetryAttemptsRef.current = 0;
      
      // Validate that we have the expected data structure
      if (response.data) {
        if (response.data.followersCount !== undefined) {
          console.log(`[${new Date().toISOString()}] ✅ Successfully loaded followers: ${response.data.followersCount}`);
        } else {
          console.error(`[${new Date().toISOString()}] ❌ Missing followersCount in profile data`);
        }
        
        if (response.data.followsCount !== undefined) {
          console.log(`[${new Date().toISOString()}] ✅ Successfully loaded following: ${response.data.followsCount}`);
        } else {
          console.error(`[${new Date().toISOString()}] ❌ Missing followsCount in profile data`);
        }
      }
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] ❌ Error fetching Instagram profile info:`, err);
      if (err.response?.status === 404) {
        setProfileInfo(null);
        setProfileError('Profile info not available.');
      } else {
        setProfileError('Failed to load profile info.');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchIgBusinessId = async (attempt = 1, maxAttempts = 3) => {
    if (!accountHolder) return;
    
    try {
      const response = await axios.get(`/api/profile-info/${accountHolder}`);
      const userId = response.data?.id;
      if (userId && !igBusinessId) {
        if (!isInstagramConnected) {
          connectInstagram(userId, userId);
        }
        console.log(`[${new Date().toISOString()}] Set igBusinessId from profile: ${userId}`);
      } else if (!userId) {
        console.error(`[${new Date().toISOString()}] No userId found in profile info`);
        if (attempt < maxAttempts) {
          console.log(`[${new Date().toISOString()}] Retrying fetchIgBusinessId, attempt ${attempt + 1}/${maxAttempts}`);
          setTimeout(() => fetchIgBusinessId(attempt + 1, maxAttempts), 2000);
        } else {
          // Failed to initialize Instagram account after retries
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching profile info (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        console.log(`[${new Date().toISOString()}] Retrying fetchIgBusinessId in 2s...`);
        setTimeout(() => fetchIgBusinessId(attempt + 1, maxAttempts), 2000);
      } else {
        // Failed to initialize Instagram account after retries
      }
    }
  };

  const fetchNotifications = async (userId: string, attempt = 1, maxAttempts = 3) => {
    if (!userId) return;
    
    console.log(`[${new Date().toISOString()}] Fetching notifications for ${userId} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      // Fetch notifications
      const response = await fetch(`/events-list/${userId}?platform=instagram`);
      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[${new Date().toISOString()}] Received ${data.length} notifications`);

      // Now fetch AI replies separately to merge them
      const aiReplies = await RagService.fetchAIReplies(accountHolder, 'instagram');
      console.log(`[${new Date().toISOString()}] Received ${aiReplies.length} AI replies`);
      
      // Process notifications to include AI replies
      const processedNotifications = data.map((notif: any) => {
        // Try to find a matching AI reply for this notification
        const matchingAiReply = aiReplies.find(pair => {
          const isMatchingType = pair.type === (notif.type === 'message' ? 'dm' : 'comment');
          const isMatchingId = 
            (notif.type === 'message' && pair.request.message_id === notif.message_id) ||
            (notif.type === 'comment' && pair.request.comment_id === notif.comment_id);
          
          return isMatchingType && isMatchingId;
        });
        
        // If we found a matching AI reply, include it in the notification
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
      
      setNotifications(processedNotifications);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error fetching notifications (attempt ${attempt}/${maxAttempts}):`, error);
      if (attempt < maxAttempts) {
        // Retry after a delay
        setTimeout(() => fetchNotifications(userId, attempt + 1, maxAttempts), 2000);
      }
    }
  };

  const handleSendQuery = async () => {
    if (!accountHolder || !query.trim()) return;
    
    console.log(`[Dashboard] 🚀 Starting post creation query for ${accountHolder} on Instagram`);
    console.log(`[Dashboard] 📝 Query: "${query}"`);
    
    // Check feature access and show upgrade popup if blocked
    if (!handleFeatureAttempt('posts')) {
      return;
    }
    
    setIsProcessing(true);
    setResult('');
    
    try {
      // ✅ REAL USAGE TRACKING: Check limits BEFORE creating post
      const trackingSuccess = await trackRealPostCreation('instagram', {
        scheduled: false,
        immediate: false,
        type: 'ai_generated_content'
      });
      
      if (!trackingSuccess) {
        console.warn(`[Dashboard] 🚫 Post creation blocked for Instagram - limit reached`);
        setToast('Post creation limit reached - upgrade to continue');
        setIsProcessing(false);
        return;
      }
      
      console.log(`[Dashboard] 🎨 Sending post generation query to RAG for ${accountHolder}: "${query}"`);
      const response = await RagService.sendPostQuery(accountHolder, query, 'instagram');
      
      console.log(`[Dashboard] ✅ Received post generation response for ${accountHolder} on Instagram`);
      console.log(`[Dashboard] 📝 Post generation details:`, {
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
        console.log(`[Dashboard] ✨ Post content generated for ${accountHolder} on Instagram`);
        
        // Add to history
        const userMessage: RagChatMessage = {
          role: 'user',
          content: `Generate post: ${query}`
        };
        
        const assistantMessage: RagChatMessage = {
          role: 'assistant',
          content: postContent
        };
        
        // Type assertion to ensure compatibility
        const updatedMessages = [...chatMessages, 
          userMessage as ChatModalMessage, 
          assistantMessage as ChatModalMessage
        ];
        
        setChatMessages(updatedMessages);
        
        // TRIGGER POST REFRESH: Notify PostCooked component about new post
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: {
            username: accountHolder,
            platform: 'instagram',
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(newPostEvent);
        console.log(`[Dashboard] 🔄 NEW POST: Triggered PostCooked refresh event for Instagram`);
        
        // Show success message via toast
        setToast('Post generated successfully! Check the Cooked Posts section.');
      } else {
        // Handle error from post generation
        console.error(`[Dashboard] ❌ Post generation failed for ${accountHolder} on Instagram:`, response.error);
        setToast(response.error || 'Failed to generate post');
      }
      
      setQuery('');
    } catch (error: unknown) {
      console.error(`[Dashboard] ❌ Error processing post creation query for ${accountHolder} on Instagram:`, error);
      setToast('Failed to process your request.');
      
      // Type guard for AxiosError or any error with response property
      if (error && typeof error === 'object' && 'response' in error && 
          error.response && typeof error.response === 'object' && 'data' in error.response) {
        // Now TypeScript knows error.response.data exists
        const errorData = error.response.data;
        if (errorData && typeof errorData === 'object' && 'error' in errorData) {
          setToast(errorData.error as string || 'Failed to process query.');
        } else {
          setToast('Failed to process query. Please try again.');
        }
      } else {
        setToast('Failed to process query. Please try again.');
      }
    } finally {
      setIsProcessing(false);
      console.log(`[Dashboard] ✅ Completed post creation processing for ${accountHolder} on Instagram`);
    }
  };

  const handleReply = async (notification: Notification, replyText: string) => {
    if (!igBusinessId || !replyText.trim()) return;

    // ✅ PRE-ACTION CHECK: Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      setToast(discussionAccessCheck.reason || 'Discussions feature is not available');
      return;
    }

    try {
      if (notification.type === 'message' && notification.sender_id && notification.message_id) {
        // ✅ REAL USAGE TRACKING: Check limits BEFORE sending DM reply
        const trackingSuccess = await trackRealDiscussion('instagram', {
          messageCount: 1,
          type: 'dm_reply'
        });
        
        if (!trackingSuccess) {
          console.warn(`[Dashboard] 🚫 DM reply blocked for Instagram - limit reached`);
          setToast('Discussion limit reached - upgrade to continue');
          return;
        }
        
        await axios.post(`/api/send-dm-reply/${igBusinessId}`, {
          sender_id: notification.sender_id,
          text: replyText,
          message_id: notification.message_id,
        });
        
        // 🔥 CRITICAL FIX: Mark notification as handled permanently to prevent reappearance
        try {
          await axios.post(`/mark-notification-handled/${igBusinessId}`, {
            notification_id: notification.message_id,
            type: 'message',
            handled_by: 'manual_reply',
            platform: 'instagram'
          });
          console.log(`[${new Date().toISOString()}] ✅ Instagram DM ${notification.message_id} marked as handled`);
        } catch (markError) {
          console.error(`[${new Date().toISOString()}] Error marking Instagram DM as handled:`, markError);
          // Continue anyway - the reply was sent successfully
        }
        
        console.log(`[Dashboard] ✅ DM reply tracked: Instagram manual reply`);
        
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
        setToast('DM reply sent!');
      } else if (notification.type === 'comment' && notification.comment_id) {
        // ✅ REAL USAGE TRACKING: Check limits BEFORE sending comment reply
        const trackingSuccess = await trackRealDiscussion('instagram', {
          messageCount: 1,
          type: 'comment_reply'
        });
        
        if (!trackingSuccess) {
          console.warn(`[Dashboard] 🚫 Comment reply blocked for Instagram - limit reached`);
          setToast('Discussion limit reached - upgrade to continue');
          return;
        }
        
        await axios.post(`/api/send-comment-reply/${igBusinessId}`, {
          comment_id: notification.comment_id,
          text: replyText,
        });
        
        // 🔥 CRITICAL FIX: Mark notification as handled permanently to prevent reappearance
        try {
          await axios.post(`/mark-notification-handled/${igBusinessId}`, {
            notification_id: notification.comment_id,
            type: 'comment',
            handled_by: 'manual_reply',
            platform: 'instagram'
          });
          console.log(`[${new Date().toISOString()}] ✅ Instagram comment ${notification.comment_id} marked as handled`);
        } catch (markError) {
          console.error(`[${new Date().toISOString()}] Error marking Instagram comment as handled:`, markError);
          // Continue anyway - the reply was sent successfully
        }
        
        console.log(`[Dashboard] ✅ Comment reply tracked: Instagram manual reply`);
        
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
        setToast('Comment reply sent!');
      }
    } catch (error: any) {
              // Only log actual connection/network errors, not functional issues
        if (error.code === 'NETWORK_ERROR' || error.name === 'TypeError') {
          console.error('Network error sending reply:', error);
          setToast('Network error while sending reply.');
        } else {
          console.debug('Reply operation completed with response:', error);
          setToast('Reply processing completed.');
        }
    }
  };

  const handleIgnore = async (notification: Notification) => {
    if (!igBusinessId || (!notification.message_id && !notification.comment_id)) return;
    try {
      await axios.post(`/ignore-notification/${igBusinessId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: 'instagram' // 🔥 CRITICAL FIX: Include platform parameter
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

  // Helper function to convert notification to ensure type compatibility
  const createAIReadyNotification = (notification: Notification, reply: string): Notification => {
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

  // Helper function to match notifications by message_id or comment_id
  const isSameNotification = (a: Notification, b: Notification) => {
    return (
      (a.message_id && b.message_id && a.message_id === b.message_id) ||
      (a.comment_id && b.comment_id && a.comment_id === b.comment_id)
    );
  };

  // Update the handleReplyWithAI function
  const handleReplyWithAI = async (notification: Notification) => {
    if (!notification || !accountHolder) return;
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    const userId = notification.instagram_user_id || igBusinessId;
    if (!userId) {
      setToast('No user ID available for AI reply');
      return;
    }
    if (aiProcessingNotifications[notifId]) return;
    setAiProcessingNotifications(prev => ({ ...prev, [notifId]: true }));
    setToast(`Generating AI reply for ${notification.username || 'user'}...`);
    try {
      const message = notification.text || '';
      const conversation = [{ role: 'user', content: message }];
      try {
        const response = await RagService.sendInstantAIReply(
          userId,
          accountHolder,
          conversation,
          {
            sender_id: notification.sender_id,
            message_id: notifId,
            platform: 'instagram',
          }
        );
        // Replace the original notification with the preview
        setNotifications(prev =>
          prev.map(n =>
            isSameNotification(n, notification)
              ? createAIReadyNotification(notification, response.reply)
              : n
          )
        );
        setToast('AI reply ready for preview. Review and send if satisfied.');
      } catch (error: any) {
        let errorMessage = 'Unknown error';
        if (error.response?.data?.error) errorMessage = error.response.data.error;
        else if (error.message) errorMessage = error.message;
        const isRagServerDown =
          error.message?.includes('Network Error') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('Failed to connect') ||
          error.message?.includes('ERR_NETWORK') ||
          error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
          error.response?.status === 503 ||
          error.response?.status === 502 ||
          error.response?.status === 504;
        if (isRagServerDown) {
          try {
            const aiReplyPayload = {
              notification: {
                instagram_user_id: igBusinessId || notification.instagram_user_id,
                from: { id: notification.sender_id },
                id: notifId,
                text: notification.text,
                platform: 'instagram',
                type: notification.type,
              },
              username: accountHolder,
            };
            const result = await axios.post(
              `/ai-reply/${accountHolder}`,
              aiReplyPayload,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                withCredentials: false,
              }
            );
            setNotifications(prev =>
              prev.map(n =>
                isSameNotification(n, notification)
                  ? createAIReadyNotification(notification, result.data.aiReply || result.data.reply)
                  : n
              )
            );
            setToast('AI reply ready for preview. Review and send if satisfied.');
          } catch (fallbackError: any) {
            setToast('Failed to generate AI reply. Please try again.');
          }
        } else {
          setToast(`AI reply generation completed with status: ${errorMessage}`);
        }
      }
    } finally {
      setAiProcessingNotifications(prev => {
        const newState = { ...prev };
        delete newState[notifId];
        return newState;
      });
    }
  };

  // Update the handleSendAIReply function
  const handleSendAIReply = async (notification: Notification) => {
    // Only allow sending if the notification is in 'ai_reply_ready' state and has an AI reply
    if (notification.status !== 'ai_reply_ready' || !notification.aiReply || !notification.sender_id) return;
    
    // Defensive: Ensure igBusinessId is present
    if (!igBusinessId) {
      setToast('Instagram account not connected. Please connect your account to send AI replies.');
      return;
    }
    
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    
    console.log(`[${new Date().toISOString()}] Sending AI reply for ${notifId}`);
    
    // QUICK FIX 2: First update UI to show sending status immediately
    setNotifications(prev => prev.map(n => {
      if (isSameNotification(n, notification)) {
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
      const dmPayload = {
        sender_id: notification.sender_id,
        text: notification.aiReply.reply,
        message_id: notification.message_id || notification.comment_id,
        platform: 'instagram',
      };
      
      // Send the AI reply
      let sendResponse = await fetch(`/api/send-dm-reply/${igBusinessId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify(dmPayload),
      });
      
      if (sendResponse.ok) {
        // 🔥 CRITICAL FIX: Mark notification as handled permanently to prevent reappearance
        try {
          await axios.post(`/mark-notification-handled/${igBusinessId}`, {
            notification_id: notification.message_id || notification.comment_id,
            type: notification.type,
            handled_by: 'ai_reply',
            platform: 'instagram'
          });
          console.log(`[${new Date().toISOString()}] ✅ Instagram notification ${notifId} marked as ai_handled`);
        } catch (markError) {
          console.error(`[${new Date().toISOString()}] Error marking Instagram notification as handled:`, markError);
          // Continue anyway - the reply was sent successfully
        }
        
        setToast(`AI reply sent successfully!`);
      } else {
        console.warn(`[${new Date().toISOString()}] AI reply send failed with status ${sendResponse.status}`);
        // The notification will be handled by the backend if appropriate
      }
      
      // Always remove the notification after attempting to send
      setNotifications(prev => prev.filter(n => !isSameNotification(n, notification)));
      
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Network error sending Instagram AI reply:`, error);
      // Always remove the notification even if there is a network error
      setNotifications(prev => prev.filter(n => !isSameNotification(n, notification)));
      // Do not show a toast to the user for network errors to avoid confusion
    }
  };

  // NEW: Handle editing AI replies
  const handleEditAIReply = (notification: Notification, editedReply: string) => {
    console.log(`[${new Date().toISOString()}] Editing AI reply for notification:`, notification.message_id || notification.comment_id);
    
    setNotifications(prev => prev.map(n => {
      if (isSameNotification(n, notification)) {
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
    
    setToast('AI reply updated successfully!');
  };

  const handleIgnoreAIReply = async (notification: Notification) => {
    if (!notification.aiReply || !notification.aiReply.replyKey || !notification.aiReply.reqKey) {
      console.error(`[${new Date().toISOString()}] Cannot ignore AI reply: missing replyKey or reqKey`);
      return;
    }
    
    try {
      // First update UI for immediate feedback: remove the notification
      setNotifications(prev => prev.filter(n => !isSameNotification(n, notification)));
      // Then call the server to permanently ignore
      const res = await fetch(`/ignore-ai-reply/${accountHolder}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          replyKey: notification.aiReply.replyKey, 
          reqKey: notification.aiReply.reqKey 
        }),
      });
      
      if (!res.ok) {
        console.error(`[${new Date().toISOString()}] Server error ignoring AI reply: ${res.status}`);
        // Refresh to ensure we have the latest state
        if (notification.instagram_user_id) {
          fetchNotifications(notification.instagram_user_id);
        }
      } else {
        console.log(`[${new Date().toISOString()}] Successfully ignored AI reply`);
        // Restore the original notification if needed (handled by backend refresh)
        if (notification.status === 'ai_reply_ready') {
          if (notification.instagram_user_id) {
            fetchNotifications(notification.instagram_user_id);
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error ignoring AI reply:`, error);
      // Refresh to ensure we have the latest state
      if (notification.instagram_user_id) {
        fetchNotifications(notification.instagram_user_id);
      }
    }
  };

  // 🛑 STOP OPERATION: Handle stop button click for Instagram
  const handleStopAutoReply = () => {
    console.log(`[Instagram] Stop auto-reply requested by user`);
    setShouldStopAutoReply(true);
    
    // NEW: Instant frontend state reset
    setIsAutoReplying(false);
    setAutoReplyProgress({ current: 0, total: 0, nextReplyIn: 0 });
    
    // Cancel any pending timeout immediately
    if (autoReplyTimeoutRef.current) {
      clearTimeout(autoReplyTimeoutRef.current);
      autoReplyTimeoutRef.current = null;
    }
    
    setToast('Auto-reply stopped');
  };

  // Handle auto-reply to all notifications with defensive UX like Facebook
  const handleAutoReplyAll = async (notifications: Notification[]) => {
    if (!igBusinessId || !accountHolder) {
      setToast('Instagram account not properly connected');
      return;
    }

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
    
    // CRITICAL FIX: Filter only pending notifications
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
    
    try {
      console.log(`[Instagram] 🔄 Starting auto-reply for ${pendingNotifications.length} notifications`);
      
      // 🛡️ CRITICAL BUG FIX: Process notifications ONE AT A TIME with proper rate limiting
      // This prevents the simultaneous sending bug that we fixed for Facebook
      for (let i = 0; i < pendingNotifications.length; i++) {
        // 🛑 STOP OPERATION: Check if user requested to stop
        if (shouldStopAutoReply) {
          console.log(`[Instagram] Auto-reply stopped by user at ${i + 1}/${pendingNotifications.length}`);
          setToast(`Auto-reply stopped (${i}/${pendingNotifications.length} completed)`);
          break;
        }
        
        const notification = pendingNotifications[i];
        const notificationId = notification.message_id || notification.comment_id || '';
        
        if (!notification.text) {
          failCount++;
          // NEW: Update progress
          setAutoReplyProgress(prev => ({ ...prev, current: i + 1 }));
          continue;
        }
        
        try {
          console.log(`[Instagram] 🔄 Processing notification ${i + 1}/${pendingNotifications.length}`);
          
          // NEW: Update progress - processing current
          setAutoReplyProgress(prev => ({ ...prev, current: i + 1 }));
          
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
              platform: 'instagram'
            },
            platform: 'instagram'
          });

          // 🛑 STOP OPERATION: Check stop flag after RAG response
          if (shouldStopAutoReply) break;

          if (response.data.success && response.data.reply) {
            // Send the generated reply
            if (notification.type === 'message' && notification.sender_id) {
              await axios.post(`/api/send-dm-reply/${igBusinessId}`, {
                sender_id: notification.sender_id,
                text: response.data.reply,
                message_id: notification.message_id,
                platform: 'instagram',
              });
              
              // 🔥 CRITICAL FIX: Mark notification as handled permanently
              try {
                await axios.post(`/mark-notification-handled/${igBusinessId}`, {
                  notification_id: notification.message_id,
                  type: 'message',
                  handled_by: 'ai_auto_reply',
                  platform: 'instagram'
                });
                console.log(`[Instagram] ✅ Auto DM ${notification.message_id} marked as ai_handled`);
              } catch (markError) {
                console.error(`[Instagram] Error marking auto DM as handled:`, markError);
              }
              
            } else if (notification.type === 'comment' && notification.comment_id) {
              await axios.post(`/api/send-comment-reply/${igBusinessId}`, {
                comment_id: notification.comment_id,
                text: response.data.reply,
                platform: 'instagram',
              });
              
              // 🔥 CRITICAL FIX: Mark notification as handled permanently
              try {
                await axios.post(`/mark-notification-handled/${igBusinessId}`, {
                  notification_id: notification.comment_id,
                  type: 'comment',
                  handled_by: 'ai_auto_reply',
                  platform: 'instagram'
                });
                console.log(`[Instagram] ✅ Auto comment ${notification.comment_id} marked as ai_handled`);
              } catch (markError) {
                console.error(`[Instagram] Error marking auto comment as handled:`, markError);
              }
            }

            // ✅ REAL USAGE TRACKING: Track actual auto-reply generation and sending
            const trackingSuccess = await trackRealAIReply('instagram', {
              type: notification.type === 'message' ? 'dm' : 'comment',
              mode: 'auto'
            });
            
            if (!trackingSuccess) {
              console.warn(`[Instagram] 🚫 Auto AI Reply blocked - limit reached`);
              failCount++;
              continue; // Skip to next notification
            }
            
            console.log(`[Instagram] ✅ Auto AI Reply tracked: ${notification.type}`);

            // Instantly remove the notification from state for immediate UI feedback
            setNotifications(prev => prev.filter(n =>
              !(
                (n.message_id && n.message_id === notification.message_id) ||
                (n.comment_id && n.comment_id === notification.comment_id)
              )
            ));

            successCount++;
          } else {
            failCount++;
          }
          
          // 🛑 STOP OPERATION: Check stop flag before delay
          if (shouldStopAutoReply) break;
          
          // 🚀 CRITICAL RATE LIMITING FIX: Wait between requests to prevent simultaneous sending
          // This is the key fix that prevents the simultaneous sending bug
          if (i < pendingNotifications.length - 1) {
            const delay = 45000; // 45 seconds for Instagram
            
            console.log(`[Instagram] ⏱️ Waiting ${delay/1000}s before next reply (${i + 1}/${pendingNotifications.length} completed)`);
            setToast(`Processing ${i + 1}/${pendingNotifications.length} - waiting ${delay/1000}s before next reply...`);
            
            // NEW: Countdown timer for next reply
            let remainingTime = Math.floor(delay / 1000);
            const countdownInterval = setInterval(() => {
              setAutoReplyProgress(prev => ({ ...prev, nextReplyIn: remainingTime }));
              remainingTime--;
              if (remainingTime < 0) {
                clearInterval(countdownInterval);
                setAutoReplyProgress(prev => ({ ...prev, nextReplyIn: 0 }));
              }
            }, 1000);
            
            // 🛑 STOP OPERATION: Use cancellable timeout for Instagram
            await new Promise<void>((resolve) => {
              autoReplyTimeoutRef.current = setTimeout(() => {
                clearInterval(countdownInterval);
                setAutoReplyProgress(prev => ({ ...prev, nextReplyIn: 0 }));
                autoReplyTimeoutRef.current = null;
                resolve();
              }, delay);
            });
            
            // 🛑 STOP OPERATION: Final check after delay
            if (shouldStopAutoReply) {
              clearInterval(countdownInterval);
              break;
            }
          }
          
        } catch (error: any) {
          console.error(`Error auto-replying to ${notification.type} ${notificationId}:`, error);
          
          // Handle specific Instagram API errors
          if (error.response?.data?.code === 'TIME_RESTRICTION') {
            console.log(`Instagram time restriction for notification ${notificationId} - will retry later`);
          } else if (error.response?.data?.code === 'USER_NOT_FOUND') {
            console.log(`User not found for notification ${notificationId} - skipping`);
          } else if (error.response?.data?.error) {
            console.error('API error in auto-reply:', error.response.data.error);
          }
          
          failCount++;
          
          // 🛑 STOP OPERATION: Check stop flag before error delay
          if (shouldStopAutoReply) break;
          
          // Continue with next notification even if one fails, but still respect rate limiting
          if (i < pendingNotifications.length - 1) {
            const delay = 15000; // Shorter delay on errors
            console.log(`[Instagram] ⚠️ Error occurred, waiting ${delay/1000}s before next attempt`);
            
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
      console.error('Instagram auto-reply operation failed:', error);
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
      setToast(`Instagram auto-reply stopped by user: ${successCount} sent, ${failCount} failed`);
    } else {
      setToast(`Instagram auto-reply completed: ${successCount} sent, ${failCount} failed`);
    }
    
    // Refresh notifications
    setTimeout(() => {
      if (igBusinessId) {
        fetchNotifications(igBusinessId);
      }
    }, 2000);
  };

  const refreshAllData = async () => {
    if (!accountHolder) {
      return;
    }
    try {
      const forceRefresh = firstLoadRef.current;
      const [responsesData, strategiesData, postsData, competitorData] = await Promise.all([
        axios.get(`/api/responses/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        // ✅ FIX: Use correct recommendations endpoint instead of retrieve-strategies
        axios.get(`/api/recommendations/${accountHolder}?platform=instagram&forceRefresh=true`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`/api/posts/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        // ✅ FIX: Use correct competitor analysis endpoint with platform parameter
        Promise.all(
          competitors.map(comp =>
            axios.get(`/api/competitor-analysis/${accountHolder}/${comp}?platform=instagram&forceRefresh=true`).catch(err => {
              if (err.response?.status === 404) {
                console.warn(`No competitor data found for ${comp}`);
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

      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      setToast('Failed to load dashboard data.');
    }
  };

  const setupSSE = (userId: string, attempt = 1) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`/events/${userId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[${new Date().toISOString()}] SSE connection established for ${userId}`);
      reconnectAttempts.current = 0;
      fetchNotifications(userId); // Refresh on connect
    };

    eventSource.onmessage = (event) => {
      reconnectAttempts.current = 0;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.error('Failed to parse SSE message:', event.data, err);
        return;
      }

      console.log(`[${new Date().toISOString()}] SSE message received:`, data);

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
        if (prefix.startsWith(`queries/${accountHolder}/`)) {
          axios.get(`/api/responses/${accountHolder}`).then(res => {
            setResponses(Array.isArray(res.data) ? res.data : []);
            setToast('New response received!');
          }).catch(err => {
            console.error('Error fetching responses:', err);
          });
        }
        if (prefix.startsWith(`recommendations/${accountHolder}/`) || prefix.startsWith(`engagement_strategies/${accountHolder}/`)) {
          // ✅ FIX: Use correct recommendations endpoint with platform parameter
          const endpoint = `/api/recommendations/${accountHolder}?platform=instagram&forceRefresh=true`;
          
          axios.get(endpoint).then(res => {
            setStrategies(Array.isArray(res.data) ? res.data : []);
            setToast('New strategies available!');
          }).catch(err => {
            console.error('Error fetching recommendations:', err);
          });
        }
        if (prefix.startsWith(`ready_post/${accountHolder}/`)) {
          axios.get(`/api/posts/${accountHolder}`).then(res => {
            setPosts(Array.isArray(res.data) ? res.data : []);
            setToast('New post cooked!');
          }).catch(err => {
            console.error('Error fetching posts:', err);
          });
        }
        if (prefix.startsWith(`competitor_analysis/${accountHolder}/`)) {
          // ✅ FIX: Use correct competitor analysis endpoint with platform parameter
          Promise.all(
            competitors.map(comp =>
              axios.get(`/api/competitor-analysis/${accountHolder}/${comp}?platform=instagram&forceRefresh=true`).catch(err => {
                if (err.response?.status === 404) return { data: [] };
                throw err;
              })
            )
          )
            .then(res => {
              const flatData = res.flatMap(r => Array.isArray(r.data) ? r.data : []);
              setCompetitorData(flatData);
              setToast('New competitor analysis available!');
            })
            .catch(err => {
              console.error('Error fetching competitor data:', err);
            });
        }
      }

      if (data.event === 'message' || data.event === 'comment') {
        setNotifications(prev => {
          // If already present, do nothing
          const exists = prev.some(n =>
            (n.message_id && n.message_id === data.data.message_id) ||
            (n.comment_id && n.comment_id === data.data.comment_id)
          );
          if (exists) return prev;
          // Otherwise, add to the top
          return [data.data, ...prev];
        });
        // Optionally, fetch the full list after a short delay to sync
        if (igBusinessId) {
          setTimeout(() => fetchNotifications(igBusinessId), 1000);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[${new Date().toISOString()}] SSE error (attempt ${attempt}/${maxReconnectAttempts}):`, error);
      eventSource.close();
      eventSourceRef.current = null;

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        setTimeout(() => setupSSE(userId, attempt + 1), delay);
      } else {
        console.error('Failed to reconnect to server updates after maximum attempts');
      }
    };
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (accountHolder) {
      refreshAllData();
      fetchProfileInfo();
      fetchIgBusinessId();
    }
  }, [accountHolder, competitors]);

  useEffect(() => {
    if (igBusinessId) {
      fetchNotifications(igBusinessId); // Initial fetch
      setupSSE(igBusinessId);           // Event-driven updates

      // Fallback polling every 5 minutes (300,000 ms)
      const interval = setInterval(() => {
        fetchNotifications(igBusinessId);
      }, 300000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [igBusinessId]);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] isSchedulerOpen: ${isSchedulerOpen}`);
  }, [isSchedulerOpen]);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] isInsightsOpen: ${isInsightsOpen}`);
  }, [isInsightsOpen]);

  useEffect(() => {
    if (igBusinessId) {
      // Update the location state with userId when available
      const currentState = window.history.state?.usr?.state || {};
      const newState = { ...currentState, userId: igBusinessId };
      
      // Only update if needed to avoid unnecessary history entries
      if (currentState.userId !== igBusinessId) {
        window.history.replaceState(
          { 
            ...window.history.state,
            usr: { ...window.history.state?.usr, state: newState }
          }, 
          '', 
          window.location.pathname
        );
        console.log(`[${new Date().toISOString()}] Updated location state with userId: ${igBusinessId}`);
      }
    }
  }, [igBusinessId]);

  const handleInstagramConnected = (graphId: string, userId: string) => {
    if (!userId) {
      console.error(`[${new Date().toISOString()}] Instagram connection failed: userId is undefined`);
      setToast('Failed to connect Instagram: Missing user ID');
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Instagram connected via InstagramConnect: graph ID: ${graphId}, user ID: ${userId}`);
    
    setToast('Instagram account connected successfully!');
  };

  const handleOpenScheduler = () => {
    console.log(`[${new Date().toISOString()}] Opening PostScheduler for user ${igBusinessId}`);
    
    // Check if feature is blocked before opening
    if (isFeatureBlocked('posts')) {
      setToast('You have reached your post limit. Please upgrade to continue.');
      return;
    }
    
    setIsSchedulerOpen(true);
  };

  const handleOpenInsights = () => {
    console.log(`[${new Date().toISOString()}] Opening InsightsModal for user ${igBusinessId}`);
    setIsInsightsOpen(true);
  };

  const handleOpenGoalModal = () => {
    setIsGoalModalOpen(true);
  };

  const handleOpenCampaignModal = () => {
    // Check if feature is blocked before opening
    if (isFeatureBlocked('campaigns')) {
      setToast('Campaigns are a premium feature. Please upgrade to access.');
      return;
    }
    
    setIsCampaignModalOpen(true);
  };

  const handleGoalSuccess = () => {
    setShowCampaignButton(true);
    setIsGoalModalOpen(false);
  };

  const handleCampaignStopped = () => {
    setShowCampaignButton(false);
    setIsCampaignModalOpen(false);
    
    // Refresh campaign status data after stopping
    console.log(`[Dashboard] Refreshing campaign status after stop`);
    checkCampaignStatus();
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

    if (!accountHolder) {
      setToast('Instagram account holder not found. Cannot reset.');
      return;
    }

    setIsResetting(true);
    setIsResetConfirmOpen(false);

    try {
      console.log(`[${new Date().toISOString()}] 🔄 Starting bulletproof reset for Instagram dashboard`);
      console.log(`[${new Date().toISOString()}] 📋 Reset parameters:`, {
        platform: 'instagram',
        accountHolder: accountHolder,
        userId: currentUser.uid,
        hookAvailable: !!resetAndAllowReconnection
      });

      // Use the bulletproof reset hook - this handles everything:
      // 1. Complete cache clearing (localStorage & sessionStorage)
      // 2. Session manager cleanup
      // 3. Context state reset (Instagram hasAccessed = false)
      // 4. Backend API reset
      // 5. Browser history manipulation
      // 6. Navigation to main dashboard (/account)
      // 7. Acquired platforms refresh
      const resetSuccess = await resetAndAllowReconnection('instagram', accountHolder);

      if (resetSuccess) {
        console.log(`[${new Date().toISOString()}] ✅ Bulletproof reset completed successfully for Instagram`);
        setToast('Instagram dashboard reset successfully! Redirecting to main dashboard...');
        
        // Clear local component state immediately for better UX
        clearInstagramFrontendData();
        
        // The navigation is already handled by the reset hook
        // No need for manual navigation or reload here
      } else {
        throw new Error('Reset operation failed');
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Bulletproof reset failed for Instagram:`, error);
      setToast('Failed to reset dashboard. Please try again.');
      
      // Fallback navigation if reset completely fails
      setTimeout(() => {
        window.location.href = '/account';
      }, 2000);
    } finally {
      setIsResetting(false);
    }
  };

  const clearInstagramFrontendData = () => {
    // Clear all Instagram-specific state data
    setNotifications([]);
    setResponses([]);
    setStrategies([]);
    setPosts([]);
    setCompetitorData([]);
    setNews([]);
    setProfileInfo(null);
    setChatMessages([]);
    setResult('');
    
    // Clear localStorage for Instagram - include all relevant keys
    if (currentUser?.uid) {
      const keysToRemove = [
        `instagram_accessed_${currentUser.uid}`,
        `viewed_strategies_instagram_${accountHolder}`,
        `viewed_competitor_data_instagram_${accountHolder}`,
        `viewed_posts_instagram_${accountHolder}`,
        `instagram_conversation_${accountHolder}`,
        `instagram_profile_${accountHolder}`
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
    }
    
    console.log(`[${new Date().toISOString()}] Cleared frontend data for Instagram platform`);
  };

  // Function to check campaign status from the server
  const checkCampaignStatus = async () => {
    try {
      console.log(`[Dashboard] Checking campaign status for ${accountHolder}`);
      // Add bypass_cache=true to ensure we get fresh data from the server
      const response = await axios.get(`/campaign-status/${accountHolder}?platform=instagram&bypass_cache=true`);
      const statusData = response.data;
      
      console.log(`[Dashboard] Campaign status response:`, statusData);
      
      // Update UI based on campaign status
      if (statusData.hasActiveCampaign && statusData.platform === 'instagram') {
        setShowCampaignButton(true);
      } else {
        setShowCampaignButton(false);
      }
    } catch (err) {
      console.error(`[Dashboard] Error checking campaign status:`, err);
      // If there's an error checking status, assume no active campaign
      setShowCampaignButton(false);
    }
  };

  // Handle custom event for opening campaign modal
  useEffect(() => {
    const handleOpenCampaignEvent = (event: any) => {
      const { username, platform } = event.detail;
      if (username === accountHolder && platform === 'Instagram') {
        setShowCampaignButton(true);
        setIsCampaignModalOpen(true);
      }
    };

    const handleCampaignStoppedEvent = (event: any) => {
      const { username, platform } = event.detail;
      console.log(`[Dashboard] Campaign stopped event received: username=${username}, platform=${platform}, accountHolder=${accountHolder}`);
      if (username === accountHolder && platform.toLowerCase() === 'instagram') {
        console.log(`[Dashboard] Campaign stopped event matched: Updating UI state`);
        setShowCampaignButton(false);
        setIsCampaignModalOpen(false);
      }
    };

    const handleShowUpgradePopup = (event: any) => {
      const { feature, reason } = event.detail;
      console.log(`[Dashboard] 🚫 Upgrade needed for ${feature}: ${reason}`);
      setToast(`${feature} limit reached - upgrade to continue`);
    };

    // 🚀 AUTOPILOT: Listen for auto-reply trigger from CampaignModal
    const handleAutoReplyTrigger = (event: CustomEvent) => {
      if (event.detail?.username === accountHolder && event.detail?.platform === 'instagram') {
        console.log(`[AUTOPILOT] Received auto-reply trigger for ${accountHolder} on instagram`);
        
        // First refresh notifications to get the latest data
        if (igBusinessId) {
          fetchNotifications(igBusinessId).then(() => {
            // Use the current notifications state to trigger auto-reply
            const currentNotifications = notifications.filter((notif: any) => 
              !notif.status || notif.status === 'pending'
            );
            
            if (currentNotifications.length > 0) {
              console.log(`[AUTOPILOT] Triggering auto-reply for ${currentNotifications.length} notifications`);
              handleAutoReplyAll(currentNotifications);
            } else {
              console.log(`[AUTOPILOT] No pending notifications found for auto-reply`);
            }
          });
        } else {
          console.warn(`[AUTOPILOT] No Instagram business ID available for auto-reply`);
          setToast('Instagram account not properly connected');
        }
      }
    };

    window.addEventListener('openCampaignModal', handleOpenCampaignEvent);
    window.addEventListener('campaignStopped', handleCampaignStoppedEvent);
    window.addEventListener('showUpgradePopup', handleShowUpgradePopup);
    window.addEventListener('triggerAutoReply', handleAutoReplyTrigger as EventListener);
    
    return () => {
      window.removeEventListener('openCampaignModal', handleOpenCampaignEvent);
      window.removeEventListener('campaignStopped', handleCampaignStoppedEvent);
      window.removeEventListener('showUpgradePopup', handleShowUpgradePopup);
      window.removeEventListener('triggerAutoReply', handleAutoReplyTrigger as EventListener);
    };
  }, [accountHolder, igBusinessId, notifications, handleAutoReplyAll]);

  // Clean old entries from reply tracker (older than 10 minutes)
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
              setReplySentTracker(prev => safeFilter(prev, reply => reply.timestamp > tenMinutesAgo));
    }, 60000); // Check every minute
    
    return () => clearInterval(cleanInterval);
  }, []);

  // 🚀 AUTOPILOT SERVICE: Global autopilot management independent of Campaign Modal
  useEffect(() => {
    if (!accountHolder || !igBusinessId || !isInstagramConnected) return;

    let autoScheduleInterval: NodeJS.Timeout | null = null;
    let autoReplyInterval: NodeJS.Timeout | null = null;
    let autopilotCheckInterval: NodeJS.Timeout | null = null;

    // Function to check and start autopilot if enabled
    const checkAndStartAutopilot = async () => {
      try {
        console.log(`[AutopilotService] 🔍 Checking autopilot settings for ${accountHolder}`);
        
        const response = await fetch(`/autopilot-settings/${accountHolder}?platform=instagram`);
        
        if (response.ok) {
          const autopilotSettings = await response.json();
          
          if (autopilotSettings && autopilotSettings.enabled) {
            console.log(`[AutopilotService] ✅ Autopilot enabled for ${accountHolder}:`, autopilotSettings);
            
            // 🚀 Update UI state for autopilot status
            setAutopilotStatus({
              enabled: true,
              autoSchedule: autopilotSettings.autoSchedule || false,
              autoReply: autopilotSettings.autoReply || false,
              scheduledCount: 0, // Will be updated by event listeners
              repliedCount: 0    // Will be updated by event listeners
            });
            
            // Start auto-schedule interval if enabled and not already running
            if (autopilotSettings.autoSchedule && !autoScheduleInterval) {
              console.log(`[AutopilotService] 🚀 Starting auto-schedule interval (${autopilotSettings.autoScheduleInterval || 60} minutes)`);
              
              // Trigger immediately first
              window.dispatchEvent(new CustomEvent('triggerAutoSchedule', {
                detail: { 
                  username: accountHolder, 
                  platform: 'instagram',
                  interval: autopilotSettings.autoScheduleInterval || 60
                }
              }));
              
              // Set up interval
              autoScheduleInterval = setInterval(() => {
                window.dispatchEvent(new CustomEvent('triggerAutoSchedule', {
                  detail: { 
                    username: accountHolder, 
                    platform: 'instagram',
                    interval: autopilotSettings.autoScheduleInterval || 60
                  }
                }));
              }, (autopilotSettings.autoScheduleInterval || 60) * 60000);
            }
            
            // Start auto-reply interval if enabled and not already running
            if (autopilotSettings.autoReply && !autoReplyInterval) {
              console.log(`[AutopilotService] 💬 Starting auto-reply interval (30 seconds)`);
              
              // Trigger immediately first
              window.dispatchEvent(new CustomEvent('triggerAutoReply', {
                detail: { 
                  username: accountHolder, 
                  platform: 'instagram'
                }
              }));
              
              // Set up 30-second interval
              autoReplyInterval = setInterval(() => {
                window.dispatchEvent(new CustomEvent('triggerAutoReply', {
                  detail: { 
                    username: accountHolder, 
                    platform: 'instagram'
                  }
                }));
              }, 30000); // 30 seconds
            }
          } else {
            console.log(`[AutopilotService] 🔒 Autopilot disabled for ${accountHolder}`);
            
            // 🚀 Update UI state to show autopilot is disabled
            setAutopilotStatus({
              enabled: false,
              autoSchedule: false,
              autoReply: false,
              scheduledCount: 0,
              repliedCount: 0
            });
            
            // Clear intervals if autopilot is disabled
            if (autoScheduleInterval) {
              clearInterval(autoScheduleInterval);
              autoScheduleInterval = null;
            }
            if (autoReplyInterval) {
              clearInterval(autoReplyInterval);
              autoReplyInterval = null;
            }
          }
        } else if (response.status === 404) {
          console.log(`[AutopilotService] 📝 No autopilot settings found for ${accountHolder} - autopilot disabled`);
          
          // 🚀 Update UI state - no settings means autopilot is disabled
          setAutopilotStatus({
            enabled: false,
            autoSchedule: false,
            autoReply: false,
            scheduledCount: 0,
            repliedCount: 0
          });
        }
      } catch (error) {
        console.error(`[AutopilotService] ❌ Error checking autopilot settings:`, error);
      }
    };

    // Check autopilot settings immediately
    checkAndStartAutopilot();

    // Check autopilot settings every 2 minutes to detect changes
    autopilotCheckInterval = setInterval(checkAndStartAutopilot, 2 * 60000);

    console.log(`[AutopilotService] 🎯 Autopilot service initialized for ${accountHolder}`);

    // Cleanup function
    return () => {
      console.log(`[AutopilotService] 🧹 Cleaning up autopilot service for ${accountHolder}`);
      
      if (autoScheduleInterval) {
        clearInterval(autoScheduleInterval);
      }
      if (autoReplyInterval) {
        clearInterval(autoReplyInterval);
      }
      if (autopilotCheckInterval) {
        clearInterval(autopilotCheckInterval);
      }
    };
  }, [accountHolder, igBusinessId, isInstagramConnected]);

  // Load previous conversations when the component mounts
  useEffect(() => {
    if (accountHolder) {
      RagService.loadConversations(accountHolder, 'instagram')
        .then(messages => {
          // Convert RagChatMessage[] to ChatModalMessage[]
          const safeMessages = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content
          }));
          setChatMessages(safeMessages);
        })
        .catch(err => console.error('Failed to load conversations:', err));
    }
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
        const bio = profileInfo.biography!;
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

  // Check campaign status when component mounts or accountHolder changes
  useEffect(() => {
    if (accountHolder) {
      checkCampaignStatus();
    }
  }, [accountHolder]);

  // ✨ MOBILE PROFILE DROPDOWN CLICK OUTSIDE HANDLER
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // ✨ FIX: Check if click is outside both profile-actions and dropdown
      if (!target.closest('.profile-actions') && !target.closest('.mobile-profile-dropdown') && isMobileProfileMenuOpen) {
        setIsMobileProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileProfileMenuOpen]);

  // ✨ RECALCULATE POSITION WHEN DROPDOWN OPENS
  useEffect(() => {
    if (isMobileProfileMenuOpen) {
      console.log('Mobile dropdown opening, calculating position...');
      calculateDropdownPosition();
    }
  }, [isMobileProfileMenuOpen]);

  // ✨ CALCULATE DROPDOWN POSITION
  const calculateDropdownPosition = () => {
    if (profileActionsRef.current) {
      const rect = profileActionsRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownHeight = 350; // Approximate dropdown height
      const dropdownWidth = 240; // Dropdown width
      
      // ✨ FIX: Position dropdown near the profile bar, not center
      let top = rect.bottom + 8;
      let right = viewportWidth - rect.right;
      
      console.log('Profile bar position:', rect);
      console.log('Calculated dropdown position:', { top, right });
      
      // If dropdown would go below viewport, position it above the profile bar
      if (top + dropdownHeight > viewportHeight - 20) {
        top = rect.top - dropdownHeight - 8;
      }
      
      // Ensure minimum top position
      if (top < 20) {
        top = 20;
      }
      
      // Ensure dropdown doesn't go off the right edge
      if (right + dropdownWidth > viewportWidth - 20) {
        right = 20;
      }
      
      setDropdownPosition({
        top,
        right
      });
      
      console.log('Final dropdown position:', { top, right });
    } else {
      console.log('Profile actions ref not found');
    }
  };

  // 🚀 AUTOPILOT: Handlers for autopilot popup
  const handleOpenAutopilotPopup = () => {
    console.log(`[DEBUG] Opening autopilot popup for instagram - ${accountHolder}`);
    setIsAutopilotPopupOpen(true);
  };

  const handleCloseAutopilotPopup = () => {
    console.log(`[DEBUG] Closing autopilot popup for instagram - ${accountHolder}`);
    setIsAutopilotPopupOpen(false);
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

  // Add debug log before return
  console.log('DmsComments username prop:', accountHolder);
  return (
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
        <div className="welcome-subtext-container" style={{ position: 'relative', minHeight: '24px' }}>
          <motion.p 
            className="welcome-subtext"
            animate={{ 
              opacity: showInitialText ? 1 : 0,
              y: showInitialText ? 0 : -10
            }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              margin: 0,
              fontSize: '14px',
              color: '#888',
              textAlign: 'center'
            }}
          >
            Congrats! You are listed as a top initial user of AI powered Account Management!
          </motion.p>
          
          {profileInfo?.biography && profileInfo.biography.trim() && (
            <motion.div
              className="bio-text"
              animate={{ 
                opacity: showBio ? 1 : 0,
                y: showBio ? 0 : 10
              }}
              transition={{ duration: 0.5, ease: 'easeInOut', delay: showBio ? 0.2 : 0 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                margin: 0,
                fontSize: '14px',
                color: '#666',
                textAlign: 'center',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                fontStyle: 'italic'
              }}
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
              {profileLoading ? (
                <div className="profile-loading">Loading...</div>
              ) : (
                <div className="profile-bar">
                  {profileInfo?.profilePicUrlHD && !imageError ? (
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}&t=${Date.now()}`}
                      alt={`${accountHolder}'s profile picture`}
                      className="profile-pic-bar"
                      onError={(e) => {
                        console.error(`Failed to load profile picture for ${accountHolder} ${imageRetryAttemptsRef.current + 1}`);
                        if (imageRetryAttemptsRef.current < maxImageRetryAttempts) {
                          imageRetryAttemptsRef.current++;
                          const imgElement = e.target as HTMLImageElement;
                          
                          if (imageRetryAttemptsRef.current === 1) {
                            // First retry: try direct URL without proxy
                            console.log(`Trying direct URL for profile picture, attempt ${imageRetryAttemptsRef.current}`);
                            setTimeout(() => {
                              imgElement.src = profileInfo.profilePicUrlHD;
                            }, 500);
                          } else {
                            // Final retry: try proxy again
                            console.log(`Final retry with proxy, attempt ${imageRetryAttemptsRef.current}/${maxImageRetryAttempts}`);
                            setTimeout(() => {
                              imgElement.src = `/api/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}&t=${Date.now()}`;
                            }, 1000);
                          }
                        } else {
                          console.log(`Max retries reached, showing fallback for ${accountHolder}`);
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
                  <div className="profile-actions" ref={profileActionsRef}>
                    <InstagramConnect onConnected={handleInstagramConnected} />
                    
                    <InstagramRequiredButton
                      isConnected={!!igBusinessId}
                      onClick={handleOpenInsights}
                      bypassConnectionRequirement={true}
                      className="dashboard-btn insights-btn"
                    >
                      <FaChartLine className="btn-icon" />
                      <span>Insights</span>
                    </InstagramRequiredButton>
                    
                    <InstagramRequiredButton
                      isConnected={!!igBusinessId}
                      onClick={handleOpenScheduler}
                      className="dashboard-btn schedule-btn"
                    >
                      <FaCalendarAlt className="btn-icon" />
                      <span>Schedule</span>
                    </InstagramRequiredButton>
                    
                    <button
                      onClick={handleOpenGoalModal}
                      className="dashboard-btn goal-btn"
                    >
                      <TbTargetArrow className="btn-icon" />
                      <span>Goal</span>
                    </button>
                    
                    <button
                      onClick={handleOpenResetConfirm}
                      className="dashboard-btn reset-btn instagram"
                      disabled={isResetting}
                    >
                      <FaUndo className="btn-icon" />
                      <span>{isResetting ? 'Resetting...' : 'Reset'}</span>
                    </button>
                    
                    {/* 🚀 AUTOPILOT: Autopilot button with glassmorphism style */}
                    <button
                      onClick={handleOpenAutopilotPopup}
                      className="dashboard-btn autopilot-btn instagram"
                      title="Autopilot Mode - Automate your dashboard"
                    >
                      <FaRobot className="btn-icon" />
                      <span>Autopilot</span>
                    </button>
                    
                    {showCampaignButton && (
                      <button
                        onClick={handleOpenCampaignModal}
                        className="dashboard-btn campaign-btn"
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
              )}
              <div className="chart-placeholder"></div>
            </div>
          </div>

          {/* ✨ MOBILE PROFILE DROPDOWN - RENDERED OUTSIDE CONTAINER */}
          {isMobileProfileMenuOpen && (
            <div className="mobile-profile-dropdown" style={{ position: 'fixed', top: dropdownPosition.top, right: dropdownPosition.right }}>
              {/* ✨ CONNECT BUTTON INSIDE DROPDOWN */}
              <div className="mobile-connect-wrapper">
                <InstagramConnect onConnected={handleInstagramConnected} />
              </div>
              
              <InstagramRequiredButton
                isConnected={!!igBusinessId}
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
                isConnected={!!igBusinessId}
                onClick={() => {
                  console.log('Mobile Schedule clicked');
                  handleOpenScheduler();
                  setIsMobileProfileMenuOpen(false);
                }}
                className="dashboard-btn schedule-btn"
              >
                <FaCalendarAlt className="btn-icon" />
                <span>Schedule</span>
              </InstagramRequiredButton>
              
              <button
                onClick={() => {
                  console.log('Mobile Goal clicked');
                  handleOpenGoalModal();
                  setIsMobileProfileMenuOpen(false);
                }}
                className="dashboard-btn goal-btn"
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
                className="dashboard-btn reset-btn instagram"
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
                className="dashboard-btn autopilot-btn instagram"
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

          {/* ✨ NEWS4U MODULE - PLATFORM & USERNAME AWARE */}
          <div 
            className={`news4u ${expandedModules.news4u ? 'mobile-expanded' : ''}`}
            onClick={(e) => handleMobileModuleClick('news4u', e)}
          >
            <h2 style={{ marginBottom: '8px' }}>
              <div className="section-header">
                <span><i className="fas fa-newspaper"></i> News For You</span>
                <div className="content-badge viewed">
                  <span className="badge-text">Updated</span>
                </div>
              </div>
            </h2>
            <News4U 
              accountHolder={accountHolder} 
              platform="instagram"
            />
          </div>

          <div 
            className={`notifications ${expandedModules.notifications ? 'mobile-expanded' : ''}`}
            onClick={(e) => handleMobileModuleClick('notifications', e)}
          >
            <h2 style={{ marginBottom: '8px' }}>
              <div className="section-header">
                <span><i className="fas fa-bell"></i> Notifications</span>
              </div>
            </h2>
            <DmsComments 
              notifications={notifications} 
              onReply={handleReply} 
              onIgnore={handleIgnore} 
              onRefresh={() => {
                setRefreshKey(prev => prev + 1);
                if (igBusinessId) {
                  fetchNotifications(igBusinessId, 1, 3);
                }
              }} 
              onReplyWithAI={handleReplyWithAI}
              onAutoReplyAll={handleAutoReplyAll}
              onStopAutoReply={handleStopAutoReply}
              isAutoReplying={isAutoReplying}
              username={accountHolder}
              onIgnoreAIReply={handleIgnoreAIReply}
              refreshKey={refreshKey}
              igBusinessId={igBusinessId}
              aiRepliesRefreshKey={refreshKey}
              onAIRefresh={() => setRefreshKey(prev => prev + 1)}
              aiProcessingNotifications={aiProcessingNotifications}
              onSendAIReply={handleSendAIReply}
              onEditAIReply={handleEditAIReply}
              autoReplyProgress={autoReplyProgress}
              platform="instagram"
            />
          </div>

          <div className="post-cooked post-cooked-always-expanded">
            <PostCooked
              username={accountHolder}
              profilePicUrl={profileInfo?.profilePicUrlHD ? `/api/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}` : ''}
              posts={posts}
              userId={igBusinessId || undefined}
            />
          </div>

          <div 
            className={`strategies ${expandedModules.strategies ? 'mobile-expanded' : ''}`}
            onClick={(e) => handleMobileModuleClick('strategies', e)}
          >
            <h2 style={{ marginBottom: '8px' }}>
              <div className="section-header">
                <span><i className="fas fa-bullseye"></i> Our Strategies</span>
                {getUnseenStrategiesCount() > 0 ? (
                  <div className="content-badge" onClick={markStrategiesAsViewed}>
                    <span className="badge-count">{getUnseenStrategiesCount()}</span>
                  </div>
                ) : (
                  <div className="content-badge viewed">
                    <span className="badge-text">Viewed</span>
                  </div>
                )}
              </div>
            </h2>
            <OurStrategies accountHolder={accountHolder} accountType="branding" />
          </div>

          <div 
            className={`competitor-analysis ${expandedModules.competitorAnalysis ? 'mobile-expanded' : ''}`}
            onClick={(e) => handleMobileModuleClick('competitorAnalysis', e)}
          >
            <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
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
                  placeholder="What would you like to post on Instagram?"
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
      {toast && (
        <motion.div
          className="toast-notification"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00ffcc"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="toast-icon"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {toast}
        </motion.div>
      )}
      {isSchedulerOpen && (
        <PostScheduler userId={igBusinessId!} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing PostScheduler`);
          setIsSchedulerOpen(false);
        }} />
      )}
      {isInsightsOpen && (
        <InsightsModal userId={igBusinessId!} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing InsightsModal`);
          setIsInsightsOpen(false);
        }} />
      )}
      {isGoalModalOpen && (
        <GoalModal 
          username={accountHolder} 
          platform="Instagram"
          onClose={() => setIsGoalModalOpen(false)}
          onSuccess={handleGoalSuccess}
        />
      )}
      {isCampaignModalOpen && (
        <CampaignModal 
          username={accountHolder}
          platform="Instagram"
          isConnected={isInstagramConnected}
          onClose={() => setIsCampaignModalOpen(false)}
          onCampaignStopped={handleCampaignStopped}
        />
      )}
      {isResetConfirmOpen && (
        <motion.div
          className="post-scheduler-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="post-scheduler-content"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <h3>Reset Instagram Dashboard</h3>
            <p>This will clear all your Instagram dashboard data including:</p>
            <ul>
              <li>Profile information and connection</li>
              <li>Notifications and conversations</li>
              <li>Generated content (strategies, posts, analysis)</li>
              <li>Cached data and viewing history</li>
            </ul>
            <p><strong>This action cannot be undone.</strong> Are you sure you want to continue?</p>
            <div className="modal-actions">
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
                {isResetting ? 'Resetting...' : 'Reset Dashboard'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      {isChatModalOpen && (
        <ChatModal 
          open={isChatModalOpen}
          messages={chatMessages}
          onClose={() => setIsChatModalOpen(false)}
          username={accountHolder}
          onSendMessage={(message: string) => {
            // Handle sending additional messages in the chat modal
            if (!message.trim() || !accountHolder) return;
            setIsProcessing(true);
            RagService.sendDiscussionQuery(accountHolder, message, chatMessages as RagChatMessage[], 'instagram')
              .then(response => {
                const updatedMessages = [
                  ...chatMessages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: response.response }
                ];
                setChatMessages(updatedMessages);
                
                // Save the updated conversation
                RagService.saveConversation(accountHolder, updatedMessages, 'instagram')
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
          platform="instagram"
        />
      )}

      {/* 🚀 AUTOPILOT: Autopilot Popup - Exact same functionality as CampaignModal */}
      {isAutopilotPopupOpen && (
        <AutopilotPopup
          username={accountHolder}
          platform="instagram"
          isConnected={isInstagramConnected}
          onClose={handleCloseAutopilotPopup}
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
      </div>

      {/* ✨ MOBILE CHAT MODAL */}
      {isMobileChatOpen && (
        <ChatModal 
          open={isMobileChatOpen}
          messages={chatMessages}
          onClose={() => setIsMobileChatOpen(false)}
          username={accountHolder}
          onSendMessage={(message: string) => {
            if (!message.trim() || !accountHolder) return;
            setIsProcessing(true);
            RagService.sendDiscussionQuery(accountHolder, message, chatMessages as RagChatMessage[], 'instagram')
              .then(response => {
                const updatedMessages = [
                  ...chatMessages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: response.response }
                ];
                setChatMessages(updatedMessages);
                
                RagService.saveConversation(accountHolder, updatedMessages, 'instagram')
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
          platform="instagram"
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

      {/* ✨ MOBILE PROFILE POPUP */}
      {isMobileProfilePopupOpen && (
        <div className="mobile-profile-popup-overlay">
          <div className="mobile-profile-popup-content">
            <div className="mobile-profile-popup-header">
              <h3>Profile</h3>
              <button 
                className="close-mobile-profile-popup"
                onClick={() => setIsMobileProfilePopupOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mobile-profile-popup-body">
              <p>Profile management functionality coming soon...</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Dashboard;