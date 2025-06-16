import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import OurStrategies from './OurStrategies';
import PostCooked from './PostCooked';
import InstagramConnect from './InstagramConnect';
import DmsComments from './Dms_Comments';
import PostScheduler from './PostScheduler';
import InsightsModal from './InsightsModal';
import GoalModal from './GoalModal';
import CampaignModal from './CampaignModal';
import NewsForYou from './NewsForYou';
import { motion } from 'framer-motion';
import axios, { AxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import useUpgradeHandler from '../../hooks/useUpgradeHandler';
import AccessControlPopup from '../common/AccessControlPopup';

import ChatModal from './ChatModal';
import RagService from '../../services/RagService';
import type { ChatMessage as ChatModalMessage } from './ChatModal';
import type { Notification, ProfileInfo, LinkedAccount } from '../../types/notifications';
// Import icons from react-icons
import { FaChartLine, FaCalendarAlt, FaFlag, FaBullhorn, FaLock, FaBell } from 'react-icons/fa';
import { MdAnalytics, MdOutlineSchedule, MdOutlineAutoGraph } from 'react-icons/md';
import { BsLightningChargeFill, BsBinoculars, BsLightbulb } from 'react-icons/bs';
import { IoMdAnalytics } from 'react-icons/io';
import { TbTargetArrow } from 'react-icons/tb';
import { GiSpy } from 'react-icons/gi';

// Define RagService compatible ChatMessage
interface RagChatMessage {
  role: string;
  content: string;
}

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
  accountType: 'branding' | 'non-branding';
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors, accountType, onOpenChat }) => {
  const { trackPost, trackDiscussion, trackAIReply, trackCampaign, isFeatureBlocked, trackRealDiscussion, canUseFeature } = useFeatureTracking();
  const { showUpgradePopup, blockedFeature, handleFeatureAttempt, closeUpgradePopup, currentUsage } = useUpgradeHandler();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  const [chatMode, setChatMode] = useState<'discussion' | 'post'>('discussion');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatModalMessage[]>([]);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  
  // Content viewed tracking - track what has been seen vs unseen with localStorage persistence
  const getViewedStorageKey = (section: string) => `viewed_${section}_instagram_${accountHolder}`;
  
  // Initialize viewed sets from localStorage
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
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  const firstLoadRef = useRef(true);
  const lastProfilePicRenderTimeRef = useRef<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const { currentUser } = useAuth();
  const imageRetryAttemptsRef = useRef(0);
  const maxImageRetryAttempts = 3;
  const [aiRepliesRefreshKey, setAiRepliesRefreshKey] = useState(0);
  const [processingNotifications, setProcessingNotifications] = useState<Record<string, boolean>>({});
  const [aiProcessingNotifications, setAiProcessingNotifications] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState('');
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  // Bio animation states
  const [showInitialText, setShowInitialText] = useState(true);
  const [showBio, setShowBio] = useState(false);
  const [typedBio, setTypedBio] = useState('');
  const [bioAnimationComplete, setBioAnimationComplete] = useState(false);

  // Helper function to get unseen count for each section
  const getUnseenStrategiesCount = () => {
    return strategies.filter(strategy => !viewedStrategies.has(strategy.key)).length;
  };

  const getUnseenCompetitorCount = () => {
    return competitorData.filter(data => !viewedCompetitorData.has(data.key)).length;
  };

  const getUnseenPostsCount = () => {
    return posts.filter(post => !viewedPosts.has(post.key)).length;
  };

  // Function to mark content as viewed with localStorage persistence
  const markStrategiesAsViewed = () => {
    const newViewedStrategies = new Set(strategies.map(s => s.key));
    setViewedStrategies(newViewedStrategies);
    localStorage.setItem(getViewedStorageKey('strategies'), JSON.stringify(Array.from(newViewedStrategies)));
  };

  const markCompetitorDataAsViewed = () => {
    const newViewedCompetitorData = new Set(competitorData.map(c => c.key));
    setViewedCompetitorData(newViewedCompetitorData);
    localStorage.setItem(getViewedStorageKey('competitor'), JSON.stringify(Array.from(newViewedCompetitorData)));
  };

  const markPostsAsViewed = () => {
    const newViewedPosts = new Set(posts.map(p => p.key));
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
      if (now - lastProfilePicRenderTimeRef.current < 1800000 && profileInfo) {
        console.log('Skipping profile pic fetch due to throttle');
        setProfileLoading(false);
        return;
      }
      const response = await axios.get(`/api/profile-info/${accountHolder}?forceRefresh=true`);
      setProfileInfo(response.data);
      lastProfilePicRenderTimeRef.current = now;
      imageRetryAttemptsRef.current = 0;
      console.log('Profile Info Fetched:', response.data);
    } catch (err: any) {
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
          setError('Failed to initialize Instagram account after retries.');
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching profile info (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        console.log(`[${new Date().toISOString()}] Retrying fetchIgBusinessId in 2s...`);
        setTimeout(() => fetchIgBusinessId(attempt + 1, maxAttempts), 2000);
      } else {
        setError('Failed to initialize Instagram account after retries.');
      }
    }
  };

  const fetchNotifications = async (userId: string, attempt = 1, maxAttempts = 3) => {
    if (!userId) return;
    
    console.log(`[${new Date().toISOString()}] Fetching notifications for ${userId} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      // Fetch notifications
      const response = await fetch(`/events-list/${userId}`);
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
    
    // Check feature access and show upgrade popup if blocked
    if (chatMode === 'discussion') {
      if (!handleFeatureAttempt('discussions')) {
        return;
      }
    } else if (chatMode === 'post') {
      if (!handleFeatureAttempt('posts')) {
        return;
      }
    }
    
    setIsProcessing(true);
    setResult('');
    setError(null);
    
    try {
      if (chatMode === 'discussion') {
        console.log(`Sending discussion query to RAG for ${accountHolder}: ${query}`);
        const response = await RagService.sendDiscussionQuery(accountHolder, query, chatMessages, 'instagram');
        
        // Add messages to history
        const userMessage: RagChatMessage = {
          role: 'user',
          content: query
        };
        
        const assistantMessage: RagChatMessage = {
          role: 'assistant',
          content: response.response
        };
        
        // Type assertion to ensure compatibility
        const updatedMessages = [...chatMessages, 
          userMessage as ChatModalMessage, 
          assistantMessage as ChatModalMessage
        ];
        
        setChatMessages(updatedMessages);
        
        // Save to RAG server
        try {
          await RagService.saveConversation(accountHolder, [...chatMessages, userMessage, assistantMessage], 'instagram');
        } catch (saveErr) {
          console.warn('Failed to save conversation, but continuing:', saveErr);
        }
        
        // Set the result
        setResult(response.response);
        
        if (response.response.includes('https://instagram.com/')) {
          const matches = response.response.match(/https:\/\/instagram\.com\/([A-Za-z0-9_.-]+)/g);
          if (matches?.length) {
            setLinkedAccounts(matches.map(url => ({
              url,
              username: url.replace('https://instagram.com/', '')
            })));
          }
        }
        
        // Automatically open chat modal with the conversation
        setIsChatModalOpen(true);
        
      } else if (chatMode === 'post') {
        console.log(`Sending post generation query to RAG for ${accountHolder}: ${query}`);
        const response = await RagService.sendPostQuery(accountHolder, query, 'instagram');
        
        if (response.success && response.post) {
          const postContent = `
Caption: ${response.post.caption}

Hashtags: ${response.post.hashtags?.join(' ')}

Call to Action: ${response.post.call_to_action}

Image Description: ${response.post.image_prompt}
          `;
          
          setResult(postContent);
          
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
          console.log('[Dashboard] NEW POST: Triggered PostCooked refresh event for Instagram');
          
          // DON'T OPEN POPUP FOR POST MODE: Just show success message via toast
          setToast('Post generated successfully! Check the Cooked Posts section.');
        } else {
          // Handle error from post generation
          setError(response.error || 'Failed to generate post');
        }
      }
      
      setQuery('');
    } catch (error: unknown) {
      console.error('Error with RAG query:', error);
      setToast('Failed to process your request.');
      
      // Type guard for AxiosError or any error with response property
      if (error && typeof error === 'object' && 'response' in error && 
          error.response && typeof error.response === 'object' && 'data' in error.response) {
        // Now TypeScript knows error.response.data exists
        const errorData = error.response.data;
        if (errorData && typeof errorData === 'object' && 'error' in errorData) {
          setError(errorData.error as string || 'Failed to process query.');
        } else {
          setError('Failed to process query. Please try again.');
        }
      } else {
        setError('Failed to process query. Please try again.');
      }
    } finally {
      setIsProcessing(false);
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
        await axios.post(`/api/send-dm-reply/${igBusinessId}`, {
          sender_id: notification.sender_id,
          text: replyText,
          message_id: notification.message_id,
        });
        
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
        setNotifications(prev => prev.filter(n => n.message_id !== notification.message_id));
        setToast('DM reply sent!');
      } else if (notification.type === 'comment' && notification.comment_id) {
        await axios.post(`/api/send-comment-reply/${igBusinessId}`, {
          comment_id: notification.comment_id,
          text: replyText,
        });
        
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
        setNotifications(prev => prev.filter(n => n.comment_id !== notification.comment_id));
        setToast('Comment reply sent!');
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
      setToast('Failed to send reply.');
      setError(error.response?.data?.error || 'Failed to send reply.');
    }
  };

  const handleIgnore = async (notification: Notification) => {
    if (!igBusinessId || (!notification.message_id && !notification.comment_id)) return;
    try {
      await axios.post(`http://localhost:3000/ignore-notification/${igBusinessId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
      });
      setNotifications(prev => prev.filter(n =>
        !(
          (notification.message_id && n.message_id === notification.message_id) ||
          (notification.comment_id && n.comment_id === notification.comment_id)
        )
      ));
      setToast('Notification ignored!');
    } catch (error: any) {
      console.error('Error ignoring notification:', error);
      setToast('Failed to ignore notification.');
      setError(error.response?.data?.error || 'Failed to ignore notification.');
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

  // Update the handleReplyWithAI function
  const handleReplyWithAI = async (notification: Notification) => {
    if (!notification || !accountHolder) return;
    
    // Track which notifications we're currently processing
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    
    // Define userId for consistent access throughout the function
    const userId = notification.instagram_user_id || igBusinessId;
    if (!userId) {
      setToast('No user ID available for AI reply');
      return;
    }
    
    // Check if this notification is already being processed to prevent duplicates
    if (aiProcessingNotifications[notifId]) {
      console.log(`[${new Date().toISOString()}] Skipping duplicate AI reply request for ${notifId}`);
      return;
    }
    
    // Mark this notification as being processed by AI
    setAiProcessingNotifications(prev => ({...prev, [notifId]: true}));
    
    // Show loading toast
    setToast(`Generating AI reply for ${notification.username || 'user'}...`);
    
    console.log(`[${new Date().toISOString()}] Generating AI reply for notification:`, 
      JSON.stringify({
        id: notifId,
        sender_id: notification.sender_id,
        text: notification.text?.substring(0, 50) + '...',
        type: notification.type
      })
    );
    
    try {
      // Format message for RAG service
      const message = notification.text || '';
      const conversation = [{
        role: "user",
        content: message
      }];
      
      // First, try using the RAG service
      try {
        console.log(`[${new Date().toISOString()}] Calling RAG service for instant AI reply`);
        
        // Send to RAG service
        const response = await RagService.sendInstantAIReply(
          userId,
          accountHolder,
          conversation,
          {
            sender_id: notification.sender_id,
            message_id: notifId,
            platform: 'instagram'
          }
        );
        
        console.log(`[${new Date().toISOString()}] Successfully generated AI reply via RAG service:`, 
          response.reply?.substring(0, 50) + '...'
        );
        
        // Show success toast
        setToast(`AI reply generated for ${notification.username || 'user'}`);
        
        // Permanently mark this notification as handled on the server
        try {
          console.log(`[${new Date().toISOString()}] Marking notification ${notifId} as handled permanently`);
          
          await axios.post(`http://localhost:3000/mark-notification-handled/${userId}`, {
            notification_id: notifId,
            type: notification.type,
            handled_by: 'ai'
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          console.log(`[${new Date().toISOString()}] Successfully marked notification as handled`);
          
          // QUICK FIX 1: Immediately remove the original notification from the list
          // to prevent duplicate AI replies being generated
          setNotifications(prev => prev.filter(n => 
            !((n.message_id && n.message_id === notification.message_id) || 
              (n.comment_id && n.comment_id === notification.comment_id))
          ));
          
          // Perform immediate AI reply sending if it's a DM and we have all needed info
          if (notification.type === 'message' && notification.sender_id && igBusinessId) {
            try {
              console.log(`[${new Date().toISOString()}] Auto-sending AI reply immediately`);
              
              // Send the DM immediately
              const sendResponse = await fetch(`/api/send-dm-reply/${igBusinessId}`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Origin': window.location.origin
                },
                body: JSON.stringify({
                  sender_id: notification.sender_id,
                  text: response.reply,
                  message_id: notifId,
                }),
              });
              
              if (sendResponse.ok) {
                // QUICK FIX 2: Provide clear feedback on successful send
                console.log(`[${new Date().toISOString()}] Successfully sent AI DM immediately`);
                setToast(`AI reply sent to ${notification.username || 'user'}`);
              } else {
                // Only add to notifications list if it failed to send immediately
                const responseData = await sendResponse.json();
                console.warn(`[${new Date().toISOString()}] Could not auto-send reply immediately:`, responseData);
                
                // Add as a notification with AI reply ready
                setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
              }
            } catch (autoSendError) {
              console.error(`[${new Date().toISOString()}] Error auto-sending AI reply:`, autoSendError);
              
              // Add to notifications list since auto-send failed
              setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
            }
          } else if (notification.type === 'comment') {
            // For comments, we don't auto-send, just add to notifications list
            setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
          }
          
        } catch (markError) {
          console.error(`[${new Date().toISOString()}] Error marking notification as handled:`, markError);
          
          // Even if marking failed, still remove the original notification to prevent duplicates
          setNotifications(prev => prev.filter(n => 
            !((n.message_id && n.message_id === notification.message_id) || 
              (n.comment_id && n.comment_id === notification.comment_id))
          ));
          
          // Add the AI reply to the notifications list
          setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
        }
        
        // Increment key to refresh the list
        setRefreshKey(prev => prev + 1);
        
      } catch (error: any) {
        // Extract the most specific error message possible
        let errorMessage = 'Unknown error';
        
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
          if (error.response.data.details) {
            console.error(`[${new Date().toISOString()}] Error details:`, error.response.data.details);
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        console.error(`[${new Date().toISOString()}] Error using RAG service for instant reply: ${errorMessage}`, error);
        
        // Check if RAG service is completely down
        const isRagServerDown = 
          error.message?.includes('Network Error') || 
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('Failed to connect') ||
          error.response?.status === 503;
          
        if (isRagServerDown) {
          // Show warning toast that we're falling back
          setToast(`RAG server unavailable, using standard AI Manager...`);
          
          // Fall back to original AI reply method
          console.log(`[${new Date().toISOString()}] Falling back to standard AI reply endpoint`);
          
          try {
            // Call the original endpoint
            const result = await axios.post(
              `http://localhost:3000/ai-reply/${accountHolder}`,
              notification,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                withCredentials: false // Important for CORS
              }
            );
            
            console.log(`[${new Date().toISOString()}] Successfully generated AI reply via fallback:`, 
              result.data?.success
            );
            
            // Show success toast for fallback
            setToast(`AI reply generated via standard AI Manager`);
            
            // Permanently mark this notification as handled on the server
            try {
              console.log(`[${new Date().toISOString()}] Marking notification ${notifId} as handled permanently`);
              
              await axios.post(`http://localhost:3000/mark-notification-handled/${userId}`, {
                notification_id: notifId,
                type: notification.type,
                handled_by: 'ai-fallback'
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                }
              });
              
              console.log(`[${new Date().toISOString()}] Successfully marked notification as handled`);
              
              // Refresh notifications to get the latest state
              if (userId) {
                fetchNotifications(userId);
              }
              
            } catch (markError) {
              console.error(`[${new Date().toISOString()}] Error marking notification as handled:`, markError);
              // Continue anyway, as the AI reply was still generated
              if (userId) {
                fetchNotifications(userId);
              }
            }
            
            // Increment refresh key
            setRefreshKey(prev => prev + 1);
            
          } catch (fallbackError: any) {
            // Log fallback error
            const fallbackErrorMsg = fallbackError.response?.data?.error || fallbackError.message || 'Unknown error';
            console.error(`[${new Date().toISOString()}] Error with fallback AI reply: ${fallbackErrorMsg}`, fallbackError);
            
            // Show error toast
            setToast(`Failed to generate AI reply: ${fallbackErrorMsg}`);
          }
        } else {
          // Show error toast for non-server-down issues
          setToast(`Failed to generate AI reply: ${errorMessage}`);
        }
      }
    } catch (error: any) {
      // Log any unexpected errors
      console.error(`[${new Date().toISOString()}] Unexpected error in handleReplyWithAI:`, error);
      
      // Show generic error toast
      setToast(`Error generating AI reply: ${error.message || 'Unknown error'}`);
    } finally {
      // Always clean up processing state
      setAiProcessingNotifications(prev => {
        const newState = {...prev};
        delete newState[notifId];
        return newState;
      });
    }
  };

  // Update the handleSendAIReply function
  const handleSendAIReply = async (notification: Notification) => {
    if (!notification.aiReply || !notification.sender_id || !igBusinessId) return;
    
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    
    console.log(`[${new Date().toISOString()}] Sending AI reply for ${notifId}`);
    
    // QUICK FIX 2: First update UI to show sending status immediately
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
      // Send the reply
      const sendResponse = await fetch(`/api/send-dm-reply/${igBusinessId}`, {
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
        }),
      });
      
      const responseData = await sendResponse.json();
      
      if (sendResponse.ok) {
        console.log(`[${new Date().toISOString()}] Successfully sent AI reply for ${notifId}`, responseData);
        
        // Track AI reply usage
        trackAIReply('instagram', 'ai_reply_sent');
        
        // QUICK FIX 2: Immediately remove the notification on successful send
        setNotifications(prev => prev.filter(n => 
          !((n.message_id && n.message_id === notification.message_id) || 
            (n.comment_id && n.comment_id === notification.comment_id))
        ));
        
        // Show success toast
        setToast(`AI reply sent successfully!`);
        
      } else {
        console.error(`[${new Date().toISOString()}] Server error sending AI reply:`, responseData);
        
        // Handle specific errors
        if (responseData.code === 'USER_NOT_FOUND') {
          // Update notification to show error
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
          
          setToast('Cannot send: Instagram user not found');
        } else {
          // QUICK FIX 2: If the server marked it as handled but not sent,
          // still remove from UI to prevent duplicate sends
          if (responseData.handled) {
            console.log(`[${new Date().toISOString()}] Message marked as handled but not sent: ${responseData.warning || 'unknown reason'}`);
            
            // Remove from notifications to prevent duplicate sends
            setNotifications(prev => prev.filter(n => 
              !((n.message_id && n.message_id === notification.message_id) || 
                (n.comment_id && n.comment_id === notification.comment_id))
            ));
            
            setToast('Message marked as handled, but DM not sent: user not found');
          } else {
            // Update notification to show generic error
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
            
            setToast(`Error sending AI reply: ${typeof responseData.error === 'string' ? responseData.error : 'Unknown error'}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Network error sending AI reply:`, error);
      
      // Update notification to show network error
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
      
      setToast(`Network error sending AI reply: ${error.message || 'Unknown error'}`);
    }
  };

  const handleIgnoreAIReply = async (notification: Notification) => {
    if (!notification.aiReply || !notification.aiReply.replyKey || !notification.aiReply.reqKey) {
      console.error(`[${new Date().toISOString()}] Cannot ignore AI reply: missing replyKey or reqKey`);
      return;
    }
    
    try {
      // First update UI for immediate feedback
      setNotifications(prev => prev.filter(n => 
        !((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id))
      ));
      
      // Then call the server to permanently ignore
      const res = await fetch(`http://localhost:3000/ignore-ai-reply/${accountHolder}`, {
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
        
        // Restore the original notification if needed
        if (notification.status === 'ai_reply_ready') {
          // Get fresh notifications to see if we need to restore the original
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

  // Handle auto-reply to all notifications
  const handleAutoReplyAll = async (notifications: Notification[]) => {
    if (!igBusinessId || !accountHolder) return;

    try {
      console.log(`[${new Date().toISOString()}] Starting Instagram auto-reply for ${notifications.length} notifications`);
      
      for (const notification of notifications) {
        // Generate AI reply using the RAG server
        const response = await axios.post('http://localhost:3001/api/instant-reply', {
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

        if (response.data.success && response.data.reply) {
          // Send the generated reply
          if (notification.type === 'message' && notification.sender_id) {
            await axios.post(`/api/send-dm-reply/${igBusinessId}`, {
              sender_id: notification.sender_id,
              text: response.data.reply,
              message_id: notification.message_id,
            });
          } else if (notification.type === 'comment' && notification.comment_id) {
            await axios.post(`/api/send-comment-reply/${igBusinessId}`, {
              comment_id: notification.comment_id,
              text: response.data.reply,
            });
          }

          // Update notification status locally
          setNotifications(prev => 
            prev.map(notif => 
              (notif.message_id === notification.message_id || notif.comment_id === notification.comment_id)
                ? { ...notif, status: 'replied' as const }
                : notif
            )
          );

          console.log(`[${new Date().toISOString()}] Instagram auto-reply sent for ${notification.message_id || notification.comment_id}`);
        }
      }

    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error in Instagram auto-reply:`, error);
      setError('Auto-reply failed for some notifications');
    }
  };

  const refreshAllData = async () => {
    if (!accountHolder) {
      setError('No account holder specified.');
      return;
    }
    try {
      const forceRefresh = firstLoadRef.current;
      const [responsesData, strategiesData, postsData, competitorData] = await Promise.all([
        axios.get(`/api/responses/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/${accountType === 'branding' ? 'retrieve-strategies' : 'retrieve-engagement-strategies'}/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`/api/posts/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        // Always fetch competitor data for both account types
        Promise.all(
          competitors.map(comp =>
            axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
              if (err.response?.status === 404) {
                console.warn(`No competitor data found for ${comp}`);
                return { data: [] };
              }
              throw err;
            })
          )
        )
      ]);

      setResponses(responsesData.data);
      setStrategies(strategiesData.data);
      setPosts(postsData.data);
      
      // Always set competitor data
      const competitorResponses = competitorData as any[];
      setCompetitorData(competitorResponses.flatMap(res => res.data));

      setError(null);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      setError(error.response?.data?.error || 'Failed to load dashboard data.');
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
      setError(null);
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
            setResponses(res.data);
            setToast('New response received!');
          }).catch(err => {
            console.error('Error fetching responses:', err);
            setError(err.response?.data?.error || 'Failed to fetch responses.');
          });
        }
        if (prefix.startsWith(`recommendations/${accountHolder}/`) || prefix.startsWith(`engagement_strategies/${accountHolder}/`)) {
          const endpoint = accountType === 'branding' 
            ? `/api/retrieve-strategies/${accountHolder}`
            : `/api/retrieve-engagement-strategies/${accountHolder}`;
          
          axios.get(endpoint).then(res => {
            setStrategies(res.data);
            setToast('New strategies available!');
          }).catch(err => {
            console.error('Error fetching strategies:', err);
            setError(err.response?.data?.error || 'Failed to fetch strategies.');
          });
        }
        if (prefix.startsWith(`ready_post/${accountHolder}/`)) {
          axios.get(`/api/posts/${accountHolder}`).then(res => {
            setPosts(res.data);
            setToast('New post cooked!');
          }).catch(err => {
            console.error('Error fetching posts:', err);
            setError(err.response?.data?.error || 'Failed to fetch posts.');
          });
        }
        if (prefix.startsWith(`competitor_analysis/${accountHolder}/`)) {
          Promise.all(
            competitors.map(comp =>
              axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}`).catch(err => {
                if (err.response?.status === 404) return { data: [] };
                throw err;
              })
            )
          )
            .then(res => {
              setCompetitorData(res.flatMap(r => r.data));
              setToast('New competitor analysis available!');
            })
            .catch(err => {
              console.error('Error fetching competitor data:', err);
              setError(err.response?.data?.error || 'Failed to fetch competitor analysis.');
            });
        }
      }

      if (data.event === 'message' || data.event === 'comment') {
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
          setNotifications(prev => {
            const updated = [data.data, ...prev.filter(n => 
              n.message_id !== data.data.message_id && 
              n.comment_id !== data.data.comment_id
            )];
            return updated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
          });
          setToast(data.event === 'message' ? 'New Instagram message received!' : 'New Instagram comment received!');
        } else {
          console.log(`[${new Date().toISOString()}] Filtered out own reply from notifications:`, data.data);
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
        setError('Failed to reconnect to server updates. Will try again in 5 minutes.');
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
      if (username === accountHolder && platform === 'instagram') {
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

  // Clean old entries from reply tracker (older than 10 minutes)
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      setReplySentTracker(prev => prev.filter(reply => reply.timestamp > tenMinutesAgo));
    }, 60000); // Check every minute
    
    return () => clearInterval(cleanInterval);
  }, []);

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

  const handleOpenChatFromMessages = (messageContent: string) => {
    console.log(`[Dashboard] Opening Instagram chat with message: "${messageContent}"`);
    
    // If parent provides onOpenChat, use it and ALWAYS pass the platform
    if (onOpenChat) {
      // CRITICAL FIX: Pass 'instagram' platform to ensure correct platform context
      if (onOpenChat.length >= 2) {
        // New signature: (messageContent: string, platform?: string) => void
        (onOpenChat as any)(messageContent, 'instagram');
      } else {
        // Fallback for old signature
        onOpenChat(messageContent);
      }
    } else {
      // Set chat mode to discussion
      setChatMode('discussion');
      
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

  if (!accountHolder) {
    return <div className="error-message">Please specify an account holder to load the dashboard.</div>;
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
            You are listed in Smart People on Instagram!
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
      {error && <div className="error-message">{error}</div>}
      {profileError && <div className="error-message">{profileError}</div>}
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
                  <div className="profile-actions">
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
                    
                    {showCampaignButton && (
                      <button
                        onClick={handleOpenCampaignModal}
                        className="dashboard-btn campaign-btn"
                      >
                        <FaBullhorn className="btn-icon" />
                        <span>Campaign</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="chart-placeholder"></div>
            </div>
          </div>

          <div className="notifications">
            <h2>Notifications <span className="badge">{notifications.length || 0} new!!!</span></h2>
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
              username={accountHolder}
              onIgnoreAIReply={handleIgnoreAIReply}
              refreshKey={refreshKey}
              igBusinessId={igBusinessId}
              aiRepliesRefreshKey={refreshKey}
              onAIRefresh={() => setRefreshKey(prev => prev + 1)}
              aiProcessingNotifications={aiProcessingNotifications}
              onSendAIReply={handleSendAIReply}
            />
          </div>

          <div className="post-cooked">
            <PostCooked
              username={accountHolder}
              profilePicUrl={profileInfo?.profilePicUrlHD ? `/api/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}` : ''}
              posts={posts}
              userId={igBusinessId || undefined}
            />
          </div>

          <div className="strategies">
            <h2>
              <div className="section-header">
                <BsLightbulb className="section-icon" />
                <span>Our Strategies</span>
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
            <OurStrategies accountHolder={accountHolder} accountType={accountType} />
          </div>

          <div className="competitor-analysis">
            <h2>
              <div className="section-header">
                <GiSpy className="section-icon" />
                <span>Competitor Analysis</span>
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
            <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
          </div>

          <div className="chatbot">
            <div className="chatbot-input-container">
              <div className="chat-mode-selector">
                <select 
                  value={chatMode} 
                  onChange={(e) => setChatMode(e.target.value as 'discussion' | 'post')}
                  className="chat-mode-dropdown"
                >
                  <option value="discussion">Discussion Mode</option>
                  <option value="post">Post Mode</option>
                </select>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={chatMode === 'discussion' 
                  ? "Ask me anything about your Instagram strategy..." 
                  : "Describe the post you want to create..."}
                className="chatbot-input"
                disabled={isProcessing}
              />
              <button 
                className={`chatbot-send-btn ${isProcessing ? 'processing' : ''}`} 
                onClick={handleSendQuery} 
                disabled={!query.trim() || isProcessing}
              >
                {isProcessing ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#e0e0ff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
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
    </motion.div>
  );
};

export default Dashboard;