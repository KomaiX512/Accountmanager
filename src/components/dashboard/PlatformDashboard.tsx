import React, { useState, useEffect, useRef } from 'react';
import '../instagram/Dashboard.css'; // Reuse the same styles
import Cs_Analysis from '../instagram/Cs_Analysis';
import OurStrategies from '../instagram/OurStrategies';
import PostCooked from '../instagram/PostCooked';
import InstagramConnect from '../instagram/InstagramConnect';
import TwitterConnect from '../twitter/TwitterConnect';
import TwitterCompose from '../twitter/TwitterCompose';
import DmsComments from '../instagram/Dms_Comments';
import PostScheduler from '../instagram/PostScheduler';
import InsightsModal from '../instagram/InsightsModal';
import GoalModal from '../instagram/GoalModal';
import CampaignModal from '../instagram/CampaignModal';
import NewsForYou from '../instagram/NewsForYou';
import { motion } from 'framer-motion';
import axios, { AxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import TwitterRequiredButton from '../common/TwitterRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import ChatModal from '../instagram/ChatModal';
import RagService from '../../services/RagService';
import type { ChatMessage as ChatModalMessage } from '../instagram/ChatModal';
import { Notification, ProfileInfo, LinkedAccount } from '../../types/notifications';

// Define RagService compatible ChatMessage
interface RagChatMessage {
  role: string;
  content: string;
}

interface PlatformDashboardProps {
  accountHolder: string;
  competitors: string[];
  accountType: 'branding' | 'non-branding';
  platform: 'instagram' | 'twitter';
}

const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ 
  accountHolder, 
  competitors, 
  accountType, 
  platform 
}) => {
  // Platform-specific context hooks
  const { userId: igUserId, isConnected: isInstagramConnected, connectInstagram } = useInstagram();
  const { userId: twitterId, isConnected: isTwitterConnected, connectTwitter } = useTwitter();
  
  // Determine current platform connection info
  const userId = platform === 'twitter' ? twitterId : igUserId;
  const isConnected = platform === 'twitter' ? isTwitterConnected : isInstagramConnected;
  
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
      supportsInsights: false // Not implemented yet for Twitter
    }
  }[platform];

  // Platform-specific query parameter
  const platformParam = platform === 'instagram' ? '' : `?platform=${platform}`;

  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<any | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [chatMode, setChatMode] = useState<'discussion' | 'post'>('discussion');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatModalMessage[]>([]);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [result, setResult] = useState('');
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [aiProcessingNotifications, setAiProcessingNotifications] = useState<Record<string, boolean>>({});
  const { currentUser } = useAuth();
  const firstLoadRef = useRef(true);
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  const lastProfilePicRenderTimeRef = useRef<number>(0);
  const imageRetryAttemptsRef = useRef(0);
  const maxImageRetryAttempts = 3;
  const [aiRepliesRefreshKey, setAiRepliesRefreshKey] = useState(0);
  const [processingNotifications, setProcessingNotifications] = useState<Record<string, boolean>>({});
  const [isTwitterSchedulerOpen, setIsTwitterSchedulerOpen] = useState(false);
  const [isTwitterInsightsOpen, setIsTwitterInsightsOpen] = useState(false);
  const [isTwitterComposeOpen, setIsTwitterComposeOpen] = useState(false);

  // Platform-specific notification handlers
  const handleReply = async (notification: any, replyText: string) => {
    const currentUserId = platform === 'twitter' ? twitterId : igUserId;
    if (!currentUserId || !replyText.trim()) return;

    try {
      if (notification.type === 'message' && notification.sender_id && notification.message_id) {
        await axios.post(`http://localhost:3000/send-dm-reply/${currentUserId}`, {
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
        setNotifications(prev => prev.filter(n => n.message_id !== notification.message_id));
        setToast(`${platform === 'twitter' ? 'Tweet' : 'DM'} reply sent!`);
      } else if (notification.type === 'comment' && notification.comment_id) {
        await axios.post(`http://localhost:3000/send-comment-reply/${currentUserId}`, {
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
        setNotifications(prev => prev.filter(n => n.comment_id !== notification.comment_id));
        setToast(`${platform === 'twitter' ? 'Reply' : 'Comment reply'} sent!`);
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
      setToast('Failed to send reply.');
      setError(error.response?.data?.error || 'Failed to send reply.');
    }
  };

  const handleIgnore = async (notification: any) => {
    const currentUserId = platform === 'twitter' ? twitterId : igUserId;
    if (!currentUserId || (!notification.message_id && !notification.comment_id)) return;
    
    try {
      await axios.post(`http://localhost:3000/ignore-notification/${currentUserId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: platform
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

  const handleReplyWithAI = async (notification: any) => {
    if (!notification || !accountHolder) return;
    
    const notifId = notification.message_id || notification.comment_id;
    if (!notifId) return;
    
    if (aiProcessingNotifications[notifId]) {
      console.log(`[${new Date().toISOString()}] Skipping duplicate AI reply request for ${notifId}`);
      return;
    }
    
    setAiProcessingNotifications(prev => ({...prev, [notifId]: true}));
    setToast(`Generating AI reply for ${notification.username || 'user'}...`);
    
    console.log(`[${new Date().toISOString()}] Generating AI reply for ${platform} notification:`, 
      JSON.stringify({
        id: notifId,
        sender_id: notification.sender_id,
        text: notification.text?.substring(0, 50) + '...',
        type: notification.type,
        platform: platform
      })
    );
    
    try {
      const message = notification.text || '';
      const conversation = [{
        role: "user",
        content: message
      }];
      
      try {
        console.log(`[${new Date().toISOString()}] Calling RAG service for instant ${platform} AI reply`);
        
        const currentUserId = platform === 'twitter' ? twitterId : igUserId;
        const response = await RagService.sendInstantAIReply(
          currentUserId || notification.twitter_user_id || notification.instagram_user_id,
          accountHolder,
          conversation,
          {
            sender_id: notification.sender_id,
            message_id: notifId
          }
        );
        
        console.log(`[${new Date().toISOString()}] Successfully generated ${platform} AI reply via RAG service:`, 
          response.reply?.substring(0, 50) + '...'
        );
        
        setToast(`AI reply generated for ${notification.username || 'user'}`);
        
        try {
          console.log(`[${new Date().toISOString()}] Marking ${platform} notification ${notifId} as handled permanently`);
          
          await axios.post(`http://localhost:3000/mark-notification-handled/${currentUserId || notification.twitter_user_id || notification.instagram_user_id}`, {
            notification_id: notifId,
            type: notification.type,
            handled_by: 'ai',
            platform: platform
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          console.log(`[${new Date().toISOString()}] Successfully marked ${platform} notification as handled`);
          
          setNotifications(prev => prev.filter(n => 
            !((n.message_id && n.message_id === notification.message_id) || 
              (n.comment_id && n.comment_id === notification.comment_id))
          ));
          
          if (notification.type === 'message' && notification.sender_id && currentUserId) {
            try {
              console.log(`[${new Date().toISOString()}] Auto-sending ${platform} AI reply immediately`);
              
              const sendResponse = await fetch(`http://localhost:3000/send-dm-reply/${currentUserId}`, {
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
                  platform: platform
                }),
              });
              
              if (sendResponse.ok) {
                console.log(`[${new Date().toISOString()}] Successfully sent ${platform} AI DM immediately`);
                setToast(`AI reply sent to ${notification.username || 'user'}`);
              } else {
                const responseData = await sendResponse.json();
                console.warn(`[${new Date().toISOString()}] Could not auto-send ${platform} reply immediately:`, responseData);
                setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
              }
            } catch (autoSendError) {
              console.error(`[${new Date().toISOString()}] Error auto-sending ${platform} AI reply:`, autoSendError);
              setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
            }
          } else if (notification.type === 'comment') {
            setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
          }
          
        } catch (markError) {
          console.error(`[${new Date().toISOString()}] Error marking ${platform} notification as handled:`, markError);
          setNotifications(prev => prev.filter(n => 
            !((n.message_id && n.message_id === notification.message_id) || 
              (n.comment_id && n.comment_id === notification.comment_id))
          ));
          setNotifications(prev => [...prev, createAIReadyNotification(notification, response.reply)]);
        }
        
        setRefreshKey(prev => prev + 1);
        
      } catch (error: any) {
        let errorMessage = 'Unknown error';
        
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
          if (error.response.data.details) {
            console.error(`[${new Date().toISOString()}] Error details:`, error.response.data.details);
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        console.error(`[${new Date().toISOString()}] Error using RAG service for instant ${platform} reply: ${errorMessage}`, error);
        setToast(`Failed to generate AI reply: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Unexpected error in handle${platform}ReplyWithAI:`, error);
      setToast(`Error generating AI reply: ${error.message || 'Unknown error'}`);
    } finally {
      setAiProcessingNotifications(prev => {
        const newState = {...prev};
        delete newState[notifId];
        return newState;
      });
    }
  };

  const handleSendAIReply = async (notification: any) => {
    if (!notification.aiReply || !notification.sender_id) return;
    
    const currentUserId = platform === 'twitter' ? twitterId : igUserId;
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
      const sendResponse = await fetch(`http://localhost:3000/send-dm-reply/${currentUserId}`, {
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
        
        setNotifications(prev => prev.filter(n => 
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
        } else {
          if (responseData.handled) {
            console.log(`[${new Date().toISOString()}] ${platform} message marked as handled but not sent: ${responseData.warning || 'unknown reason'}`);
            
            setNotifications(prev => prev.filter(n => 
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
      console.error(`[${new Date().toISOString()}] Network error sending ${platform} AI reply:`, error);
      
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
      setNotifications(prev => prev.filter(n => 
        !((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id))
      ));
      
      const res = await fetch(`http://localhost:3000/ignore-ai-reply/${accountHolder}`, {
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

  const fetchNotifications = async (attempt = 1, maxAttempts = 3) => {
    const currentUserId = platform === 'twitter' ? twitterId : igUserId;
    if (!currentUserId) return;
    
    console.log(`[${new Date().toISOString()}] Fetching ${platform} notifications for ${currentUserId} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      const response = await fetch(`http://localhost:3000/events-list/${currentUserId}?platform=${platform}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${platform} notifications: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[${new Date().toISOString()}] Received ${data.length} ${platform} notifications`);

      const aiRepliesResponse = await fetch(`http://localhost:3000/ai-replies/${accountHolder}?platform=${platform}`);
      let aiReplies: any[] = [];
      
      if (aiRepliesResponse.ok) {
        aiReplies = await aiRepliesResponse.json();
        console.log(`[${new Date().toISOString()}] Received ${aiReplies.length} ${platform} AI replies`);
      } else {
        console.error(`[${new Date().toISOString()}] Failed to fetch ${platform} AI replies: ${aiRepliesResponse.status}`);
      }
      
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
      
      setNotifications(processedNotifications);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error fetching ${platform} notifications (attempt ${attempt}/${maxAttempts}):`, error);
      if (attempt < maxAttempts) {
        setTimeout(() => fetchNotifications(attempt + 1, maxAttempts), 2000);
      }
    }
  };

  const setupSSE = (userId: string, attempt = 1) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`http://localhost:3000/events/${userId}?platform=${platform}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[${new Date().toISOString()}] ${platform} SSE connection established for ${userId}`);
      reconnectAttempts.current = 0;
      setError(null);
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
          axios.get(`http://localhost:3000/responses/${accountHolder}${platformParam}`).then(res => {
            setResponses(res.data);
            setToast(`New ${platform} response received!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} responses:`, err);
            setError(err.response?.data?.error || `Failed to fetch ${platform} responses.`);
          });
        }
        
        if (prefix.startsWith(`recommendations/${platform}/${accountHolder}/`) || prefix.startsWith(`engagement_strategies/${platform}/${accountHolder}/`)) {
          const endpoint = accountType === 'branding' 
            ? `http://localhost:3000/retrieve-strategies/${accountHolder}${platformParam}`
            : `http://localhost:3000/retrieve-engagement-strategies/${accountHolder}${platformParam}`;
          
          axios.get(endpoint).then(res => {
            setStrategies(res.data);
            setToast(`New ${platform} strategies available!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} strategies:`, err);
            setError(err.response?.data?.error || `Failed to fetch ${platform} strategies.`);
          });
        }
        
        if (prefix.startsWith(`ready_post/${platform}/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/posts/${accountHolder}${platformParam}`).then(res => {
            setPosts(res.data);
            setToast(`New ${platform} post cooked!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} posts:`, err);
            setError(err.response?.data?.error || `Failed to fetch ${platform} posts.`);
          });
        }
        
        if (accountType === 'branding' && prefix.startsWith(`competitor_analysis/${platform}/${accountHolder}/`)) {
          Promise.all(
            competitors.map(comp =>
              axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}${platformParam}`).catch(err => {
                if (err.response?.status === 404) return { data: [] };
                throw err;
              })
            )
          )
            .then(res => {
              setCompetitorData(res.flatMap(r => r.data));
              setToast(`New ${platform} competitor analysis available!`);
            })
            .catch(err => {
              console.error(`Error fetching ${platform} competitor data:`, err);
              setError(err.response?.data?.error || `Failed to fetch ${platform} competitor analysis.`);
            });
        }
        
        if (accountType === 'non-branding' && prefix.startsWith(`NewForYou/${platform}/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/news-for-you/${accountHolder}${platformParam}`).then(res => {
            setNews(res.data);
            setToast(`New ${platform} news article available!`);
          }).catch(err => {
            console.error(`Error fetching ${platform} news:`, err);
            setError(err.response?.data?.error || `Failed to fetch ${platform} news articles.`);
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
          setToast(data.event === 'message' 
            ? `New ${platform === 'twitter' ? 'Twitter DM' : 'Instagram message'} received!` 
            : `New ${platform === 'twitter' ? 'Twitter mention' : 'Instagram comment'} received!`);
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
      } else {
        setError(`Failed to reconnect to ${platform} server updates. Will try again in 5 minutes.`);
      }
    };
  };

  const handleSendQuery = async () => {
    if (!accountHolder || !query.trim()) return;
    
    setIsProcessing(true);
    setResult('');
    setError(null);
    
    try {
      if (chatMode === 'discussion') {
        console.log(`Sending ${platform} discussion query to RAG for ${accountHolder}: ${query}`);
        const response = await RagService.sendDiscussionQuery(accountHolder, query, chatMessages);
        
        const userMessage: RagChatMessage = {
          role: 'user',
          content: query
        };
        
        const assistantMessage: RagChatMessage = {
          role: 'assistant',
          content: response.response
        };
        
        const updatedMessages = [...chatMessages, 
          userMessage as ChatModalMessage, 
          assistantMessage as ChatModalMessage
        ];
        
        setChatMessages(updatedMessages);
        
        try {
          await RagService.saveConversation(accountHolder, [...chatMessages, userMessage, assistantMessage]);
        } catch (saveErr) {
          console.warn('Failed to save conversation, but continuing:', saveErr);
        }
        
        setResult(response.response);
        
        // Handle platform-specific linked accounts
        const urlPattern = platform === 'twitter' 
          ? /https:\/\/twitter\.com\/([A-Za-z0-9_]+)/g
          : /https:\/\/instagram\.com\/([A-Za-z0-9_.-]+)/g;
          
        if (response.response.match(urlPattern)) {
          const matches = response.response.match(urlPattern);
          if (matches?.length) {
            setLinkedAccounts(matches.map(url => ({
              url,
              username: url.replace(config.baseUrl, '')
            })));
          }
        }
        
        setIsChatModalOpen(true);
        
      } else if (chatMode === 'post') {
        console.log(`Sending ${platform} post generation query to RAG for ${accountHolder}: ${query}`);
        const response = await RagService.sendPostQuery(accountHolder, query);
        
        if (response.success && response.post) {
          const postContent = `
Caption: ${response.post.caption}

Hashtags: ${response.post.hashtags?.join(' ')}

Call to Action: ${response.post.call_to_action}

Image Description: ${response.post.image_prompt}
          `;
          
          setResult(postContent);
          
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
          
          setChatMessages(updatedMessages);
          setIsChatModalOpen(true);
        } else {
          setError(response.error || `Failed to generate ${platform} post`);
        }
      }
      
      setQuery('');
    } catch (error: unknown) {
      console.error(`Error with ${platform} RAG query:`, error);
      setToast(`Failed to process your ${platform} request.`);
      
      if (error && typeof error === 'object' && 'response' in error && 
          error.response && typeof error.response === 'object' && 'data' in error.response) {
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

  const refreshAllData = async () => {
    if (!accountHolder) {
      setError('No account holder specified.');
      return;
    }
    try {
      const forceRefresh = firstLoadRef.current;
      const platformParam = `?platform=${platform}${forceRefresh ? '&forceRefresh=true' : ''}`;
      
      const [responsesData, strategiesData, postsData, otherData] = await Promise.all([
        axios.get(`http://localhost:3000/responses/${accountHolder}${platformParam}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/${accountType === 'branding' ? 'retrieve-strategies' : 'retrieve-engagement-strategies'}/${accountHolder}${platformParam}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/posts/${accountHolder}${platformParam}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        accountType === 'branding' 
          ? Promise.all(
              competitors.map(comp =>
                axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}${platformParam}`).catch(err => {
                  if (err.response?.status === 404) {
                    console.warn(`No ${platform} competitor data found for ${comp}`);
                    return { data: [] };
                  }
                  throw err;
                })
              )
            )
          : axios.get(`http://localhost:3000/news-for-you/${accountHolder}${platformParam}`).catch(err => {
              if (err.response?.status === 404) return { data: [] };
              throw err;
            })
      ]);

      setResponses(responsesData.data);
      setStrategies(strategiesData.data);
      setPosts(postsData.data);
      
      if (accountType === 'branding') {
        const competitorResponses = otherData as any[];
        setCompetitorData(competitorResponses.flatMap(res => res.data));
      } else {
        const newsResponse = otherData as any;
        setNews(newsResponse.data || []);
      }

      setError(null);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      }
    } catch (error: any) {
      console.error(`Error refreshing ${platform} data:`, error);
      setError(error.response?.data?.error || `Failed to load ${platform} dashboard data.`);
    }
  };

  const fetchProfileInfo = async () => {
    if (!accountHolder) return;
    setProfileLoading(true);
    setProfileError(null);
    setImageError(false);
    try {
      const response = await axios.get(`http://localhost:3000/profile-info/${accountHolder}${platformParam ? `${platformParam}&forceRefresh=true` : '?forceRefresh=true'}`);
      setProfileInfo(response.data);
      console.log(`${config.name} Profile Info Fetched:`, response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setProfileInfo(null);
        setProfileError(`${config.name} profile info not available.`);
      } else {
        setProfileError(`Failed to load ${config.name} profile info.`);
      }
    } finally {
      setProfileLoading(false);
    }
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
    }
  }, [accountHolder, competitors, platform]);

  // Load previous conversations when the component mounts
  useEffect(() => {
    if (accountHolder) {
      RagService.loadConversations(accountHolder)
        .then(messages => {
          const safeMessages = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content
          }));
          setChatMessages(safeMessages);
        })
        .catch(err => console.error('Failed to load conversations:', err));
    }
  }, [accountHolder]);

  // Initialize notifications and SSE for the current platform
  useEffect(() => {
    const currentUserId = platform === 'twitter' ? twitterId : igUserId;
    if (currentUserId) {
      fetchNotifications();
      setupSSE(currentUserId);

      // Fallback polling every 5 minutes
      const interval = setInterval(() => {
        fetchNotifications();
      }, 300000);

      return () => {
        clearInterval(interval);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    }
  }, [platform === 'twitter' ? twitterId : igUserId, platform]);

  // Clean old entries from reply tracker
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      setReplySentTracker(prev => prev.filter(reply => reply.timestamp > tenMinutesAgo));
    }, 60000);
    
    return () => clearInterval(cleanInterval);
  }, []);

  // Handle custom event for opening campaign modal
  useEffect(() => {
    const handleOpenCampaignEvent = (event: any) => {
      const { username, platform: eventPlatform } = event.detail;
      if (username === accountHolder && eventPlatform.toLowerCase() === platform) {
        setShowCampaignButton(true);
        setIsCampaignModalOpen(true);
      }
    };

    window.addEventListener('openCampaignModal', handleOpenCampaignEvent);
    return () => {
      window.removeEventListener('openCampaignModal', handleOpenCampaignEvent);
    };
  }, [accountHolder, platform]);

  if (!accountHolder) {
    return <div className="error-message">Please specify an account holder to load the {config.name} dashboard.</div>;
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

  const handleOpenTwitterScheduler = () => {
    console.log(`[${new Date().toISOString()}] Opening Twitter PostScheduler for user ${twitterId}`);
    setIsTwitterSchedulerOpen(true);
  };

  const handleOpenTwitterInsights = () => {
    if (!config.supportsInsights) {
      setToast(`Insights not available for ${config.name} yet`);
      return;
    }
    console.log(`[${new Date().toISOString()}] Opening Twitter InsightsModal for user ${twitterId}`);
    setIsTwitterInsightsOpen(true);
  };

  const handleOpenTwitterCompose = () => {
    console.log(`[${new Date().toISOString()}] Opening Twitter Compose for user ${twitterId}`);
    setIsTwitterComposeOpen(true);
  };

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
        <p className="welcome-subtext">You are listed in Smart People on {config.name}!</p>
      </div>
      {error && <div className="error-message">{error}</div>}
      {profileError && <div className="error-message">{profileError}</div>}
      <div className="modules-container">
        <div className="dashboard-grid">
          <div className="profile-metadata">
            <div className="profile-header">
              <div className="profile-bar">
                {profileLoading ? (
                  <div className="profile-loading">Loading...</div>
                ) : (
                  <>
                    {profileInfo?.profilePicUrlHD && !imageError ? (
                      <img
                        src={`http://localhost:3000/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}&t=${Date.now()}`}
                        alt={`${accountHolder}'s profile picture`}
                        className="profile-pic-bar"
                        onError={(e) => {
                          console.error(`Failed to load profile picture for ${accountHolder}`);
                          if (imageRetryAttemptsRef.current < maxImageRetryAttempts) {
                            imageRetryAttemptsRef.current++;
                            console.log(`Retrying profile picture load, attempt ${imageRetryAttemptsRef.current}/${maxImageRetryAttempts}`);
                            const imgElement = e.target as HTMLImageElement;
                            setTimeout(() => {
                              imgElement.src = `http://localhost:3000/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}&t=${Date.now()}`;
                            }, 1000);
                          } else {
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
                  {/* Platform-specific Connect button */}
                  {platform === 'instagram' ? (
                    <>
                      <InstagramConnect onConnected={handleInstagramConnected} />
                      <InstagramRequiredButton
                        isConnected={isConnected}
                        onClick={handleOpenInsights}
                        className="insta-btn insights"
                        style={{
                          background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                          color: '#e0e0ff',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #00ffcc',
                          zIndex: 20,
                        }}
                      >
                        Insights
                      </InstagramRequiredButton>
                      
                      <InstagramRequiredButton
                        isConnected={isConnected}
                        onClick={handleOpenScheduler}
                        className="insta-btn connect"
                        style={{
                          background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                          color: '#e0e0ff',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #00ffcc',
                          zIndex: 20,
                        }}
                      >
                        Schedule Post
                      </InstagramRequiredButton>
                    </>
                  ) : (
                    <>
                      <TwitterConnect onConnected={handleTwitterConnected} />
                      <TwitterRequiredButton
                        isConnected={isTwitterConnected}
                        onClick={handleOpenTwitterCompose}
                        className="twitter-btn compose"
                        style={{
                          background: 'linear-gradient(90deg, #1da1f2, #00acee)',
                          color: '#ffffff',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #1da1f2',
                          zIndex: 20,
                        }}
                      >
                        Compose
                      </TwitterRequiredButton>
                      <TwitterRequiredButton
                        isConnected={isTwitterConnected}
                        onClick={handleOpenTwitterInsights}
                        className="twitter-btn insights"
                        style={{
                          background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                          color: '#e0e0ff',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #00ffcc',
                          zIndex: 20,
                        }}
                      >
                        Insights
                      </TwitterRequiredButton>
                      
                      <TwitterRequiredButton
                        isConnected={isTwitterConnected}
                        onClick={handleOpenTwitterScheduler}
                        className="twitter-btn connect"
                        style={{
                          background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                          color: '#e0e0ff',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #00ffcc',
                          zIndex: 20,
                        }}
                      >
                        Schedule Tweet
                      </TwitterRequiredButton>
                    </>
                  )}
                  
                  <button
                    onClick={handleOpenGoalModal}
                    className={`${platform}-btn connect`}
                    style={{
                      background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                      color: '#e0e0ff',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid #00ffcc',
                      zIndex: 20,
                      marginLeft: '10px',
                    }}
                  >
                    Goal
                  </button>
                  
                  {showCampaignButton && (
                    <button
                      onClick={handleOpenCampaignModal}
                      className={`${platform}-btn connect`}
                      style={{
                        background: 'linear-gradient(90deg, #ff6b6b, #ff8e53)',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #ff6b6b',
                        zIndex: 20,
                        marginLeft: '10px',
                      }}
                    >
                      Campaign
                    </button>
                  )}
                </div>
              </div>
              <div className="chart-placeholder"></div>
            </div>
          </div>

          {config.supportsNotifications && (
            <div className="notifications">
              <h2>{config.name} Notifications <span className="badge">{notifications.length || 0} new!!!</span></h2>
              <DmsComments 
                notifications={notifications} 
                onReply={handleReply} 
                onIgnore={handleIgnore} 
                onRefresh={() => setRefreshKey(prev => prev + 1)} 
                onReplyWithAI={handleReplyWithAI}
                username={accountHolder}
                onIgnoreAIReply={handleIgnoreAIReply}
                refreshKey={refreshKey}
                igBusinessId={platform === 'instagram' ? igUserId : undefined}
                twitterId={platform === 'twitter' ? twitterId : undefined}
                aiRepliesRefreshKey={refreshKey}
                onAIRefresh={() => setRefreshKey(prev => prev + 1)}
                aiProcessingNotifications={aiProcessingNotifications}
                onSendAIReply={handleSendAIReply}
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

          <div className="strategies">
            <h2>Our {config.name} Strategies <span className="badge">{strategies.length || 3} unseen!!!</span></h2>
            <OurStrategies accountHolder={accountHolder} accountType={accountType} platform={platform} />
          </div>

          <div className="competitor-analysis">
            {accountType === 'branding' ? (
              <>
                <h2>{config.name} Competitor Analysis <span className="badge">{competitorData.length || 5} unseen!!!</span></h2>
                <Cs_Analysis accountHolder={accountHolder} competitors={competitors} platform={platform} />
              </>
            ) : (
              <>
                <h2>News For You <span className="badge">{news.length || 5} new articles!!!</span></h2>
                <NewsForYou accountHolder={accountHolder} platform={platform} />
              </>
            )}
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
                  ? `Ask me anything about your ${config.name} strategy...` 
                  : `Describe the ${config.name} post you want to create...`}
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
      {isGoalModalOpen && (
        <GoalModal 
          username={accountHolder} 
          platform={config.name}
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
        <InsightsModal userId={userId!} onClose={() => {
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
          onSendMessage={(message: string) => {
            if (!message.trim() || !accountHolder) return;
            setIsProcessing(true);
            RagService.sendDiscussionQuery(accountHolder, message, chatMessages as RagChatMessage[])
              .then(response => {
                const updatedMessages = [
                  ...chatMessages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: response.response }
                ];
                setChatMessages(updatedMessages);
                
                RagService.saveConversation(accountHolder, updatedMessages)
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
      {isCampaignModalOpen && (
        <CampaignModal 
          username={accountHolder}
          platform={config.name}
          isConnected={isConnected}
          onClose={() => setIsCampaignModalOpen(false)}
        />
      )}
    </motion.div>
  );
};

export default PlatformDashboard; 