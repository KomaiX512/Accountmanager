import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import Dms_Comments from '../instagram/Dms_Comments';
import FacebookConnect from './FacebookConnect';
import InsightsModal from '../instagram/InsightsModal';
import { Notification } from '../../types/notifications';
import FacebookNotificationService from '../../services/facebookNotificationService';
import RagService from '../../services/RagService';
import axios from 'axios';
import '../instagram/Dashboard.css';
import { motion } from 'framer-motion';
import PlatformDashboard from '../dashboard/PlatformDashboard';
import { getApiUrl } from '../../config/api';

interface FacebookDashboardProps {
  accountHolder: string;
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const FacebookDashboard: React.FC<FacebookDashboardProps> = ({ accountHolder, onOpenChat }) => {
  const { trackRealDiscussion, trackRealAIReply, canUseFeature } = useFeatureTracking();
  const { currentUser } = useAuth();
  const { userId: facebookPageId, username: facebookUsername, isConnected } = useFacebook();
  
  // State management
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [aiRepliesRefreshKey, setAiRepliesRefreshKey] = useState(0);
  const [aiProcessingNotifications, setAiProcessingNotifications] = useState<Record<string, boolean>>({});
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComponentMounted, setIsComponentMounted] = useState(false);
  
  // Post scheduling state
  const [scheduleForm, setScheduleForm] = useState({
    caption: '',
    scheduleDate: '',
    image: null as File | null
  });
  
  // SSE connection for real-time notifications
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Facebook notification service
  const notificationService = useRef<FacebookNotificationService>(
    FacebookNotificationService.getInstance()
  );

  // Component mount effect to prevent lexical declaration issues
  useEffect(() => {
    setIsComponentMounted(true);
    return () => {
      setIsComponentMounted(false);
      // Clean up SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Fetch Facebook notifications with proper refresh handling
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    if (!facebookPageId || !currentUser?.uid || !isComponentMounted) return;
    
    setIsLoadingNotifications(true);
    setError(null);
    
    try {
      if (forceRefresh) {
        console.log(`[${new Date().toISOString()}] Force refreshing Facebook notifications...`);
      }
      
      // Use getApiUrl to ensure correct URL in all environments
      const response = await axios.get(`${getApiUrl(`/events-list/${facebookPageId}`)}?platform=facebook${forceRefresh ? '&forceRefresh=true' : ''}`);
      
      if (response.data && Array.isArray(response.data)) {
        const facebookNotifications = response.data.map((notif: any) => ({
          ...notif,
          platform: 'facebook',
          facebook_page_id: facebookPageId
        }));
        
        setNotifications(facebookNotifications);
        console.log(`[${new Date().toISOString()}] Loaded ${facebookNotifications.length} Facebook notifications`);
        
        // Clear any previous errors on successful fetch
        setError(null);
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error fetching Facebook notifications:`, error);
      setError('Failed to load Facebook notifications');
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [facebookPageId, currentUser?.uid, isComponentMounted]);

  // Setup SSE connection for real-time updates
  useEffect(() => {
    if (!facebookPageId || !currentUser?.uid || !isComponentMounted) return;

    try {
      // Use getApiUrl for SSE endpoint
      const eventSource = new EventSource(`${getApiUrl(`/events/${facebookPageId}`)}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`[${new Date().toISOString()}] Facebook SSE received:`, data);
          
          if (data.event === 'facebook_message' || data.event === 'facebook_comment') {
            // Add platform info to the notification
            const facebookNotification = {
              ...data.data,
              platform: 'facebook',
              facebook_page_id: facebookPageId
            };
            
            setNotifications(prev => [facebookNotification, ...prev]);
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error parsing Facebook SSE data:`, error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`[${new Date().toISOString()}] Facebook SSE connection error:`, error);
      };

      return () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error setting up SSE connection:`, error);
    }
  }, [facebookPageId, currentUser?.uid, isComponentMounted]);

  // Initialize notifications on connection
  useEffect(() => {
    if (isConnected && facebookPageId && isComponentMounted) {
      fetchNotifications();
      
      // Initialize web push notifications
      notificationService.current.initializeWebPush().then(success => {
        if (success) {
          console.log('Facebook web push notifications initialized');
        }
      }).catch(error => {
        console.error('Failed to initialize Facebook web push notifications:', error);
      });
    }
  }, [isConnected, facebookPageId, refreshKey, isComponentMounted, fetchNotifications]);

  // Handle real-time notifications
  useEffect(() => {
    if (!isComponentMounted) return;

    const handleNotification = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'facebook_message' || data.event === 'facebook_comment') {
          const notification = data.data as Notification;
          
          // Send browser notification
          notificationService.current.sendLocalNotification(notification);
          
          // Add to notifications list
          setNotifications(prev => [notification, ...prev]);
        }
      } catch (error) {
        console.error('Error handling Facebook notification:', error);
      }
    };

    if (eventSourceRef.current) {
      eventSourceRef.current.addEventListener('message', handleNotification);
      return () => {
        eventSourceRef.current?.removeEventListener('message', handleNotification);
      };
    }
  }, [isComponentMounted]);

  // Handle Facebook notification reply
  const handleReply = useCallback(async (notification: Notification, replyText: string) => {
    if (!facebookPageId || !currentUser?.uid || !isComponentMounted) return;
    
    // ✅ PRE-ACTION CHECK: Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      console.warn(`[FacebookDashboard] Discussion blocked: ${discussionAccessCheck.reason}`);
      return;
    }
    
    try {
      const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
      
      // Use getApiUrl for all API calls
      await axios.post(`${getApiUrl(`/${endpoint}/${facebookPageId}`)}`, {
        sender_id: notification.sender_id,
        text: replyText,
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: 'facebook'
      });

      // ✅ REAL USAGE TRACKING: Check limits BEFORE sending reply
      const trackingSuccess = await trackRealDiscussion('facebook', {
        messageCount: 1,
        type: notification.type === 'message' ? 'dm_reply' : 'comment_reply'
      });
      
      if (!trackingSuccess) {
        console.warn(`[FacebookDashboard] 🚫 Reply blocked for Facebook - limit reached`);
        setError('Discussion limit reached - upgrade to continue');
        return;
      }
      
      console.log(`[FacebookDashboard] ✅ Discussion tracked: Facebook ${notification.type} reply`);
      
      console.log(`[${new Date().toISOString()}] Facebook ${notification.type} reply sent successfully`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error sending Facebook reply:`, error);
    }
  }, [facebookPageId, currentUser?.uid, isComponentMounted, canUseFeature, trackRealDiscussion]);

  // Handle ignore notification - permanently remove
  const handleIgnore = useCallback(async (notification: Notification) => {
    if (!facebookPageId || !currentUser?.uid || !isComponentMounted) return;
    
    try {
      // Use getApiUrl for API calls
      await axios.post(`${getApiUrl(`/ignore-notification/${facebookPageId}`)}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: 'facebook'
      });

      // PERMANENTLY REMOVE ignored notifications from UI
      setNotifications(prev => prev.filter(notif =>
        !(
          (notification.message_id && notif.message_id === notification.message_id) ||
          (notification.comment_id && notif.comment_id === notification.comment_id)
        )
      ));
      
      console.log(`[${new Date().toISOString()}] Facebook notification permanently ignored and removed`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error ignoring Facebook notification:`, error);
      setError('Failed to ignore notification');
    }
  }, [facebookPageId, currentUser?.uid, isComponentMounted]);

  // Create AI ready notification helper
  const createAIReadyNotification = useCallback((notification: Notification, reply: string): Notification => {
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
  }, []);

  // Handle AI reply generation with preview
  const handleReplyWithAI = useCallback(async (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    if (!notifId || !isComponentMounted) return;

    setAiProcessingNotifications(prev => ({ ...prev, [notifId]: true }));

    try {
      console.log(`[${new Date().toISOString()}] Generating Facebook AI reply for ${notifId}`);
      
      // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding
      const aiReplyAccessCheck = canUseFeature('aiReplies');
      if (!aiReplyAccessCheck.allowed) {
        console.warn(`[FacebookDashboard] AI Reply blocked: ${aiReplyAccessCheck.reason}`);
        setError(`AI reply blocked: ${aiReplyAccessCheck.reason}`);
        return;
      }
      
      // Use direct axios call to the backend endpoint instead of RagService
      const message = notification.text || '';
      const userId = currentUser?.uid || facebookUsername;
      if (!userId) {
        throw new Error('No user ID available for AI reply');
      }
      
      // Format the request as expected by the backend
      const notificationData = {
        type: notification.type || 'message',
        facebook_user_id: facebookPageId,
        sender_id: notification.sender_id,
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        text: message,
        timestamp: Date.now(),
        received_at: new Date().toISOString(),
        status: 'pending',
        platform: 'facebook'
      };
      
      console.log(`[${new Date().toISOString()}] Sending AI reply request to backend for Facebook`);
      
      // Call the backend endpoint directly using getApiUrl
      const response = await axios.post(getApiUrl('/api/instant-reply'), {
        username: userId,
        notification: notificationData
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data && response.data.success) {
        console.log(`[${new Date().toISOString()}] Successfully generated Facebook AI reply:`, 
          response.data.reply?.substring(0, 50) + '...'
        );
        
        // ✅ REAL USAGE TRACKING: Check limits AFTER successful generation
        const trackingSuccess = await trackRealAIReply('facebook', {
          type: notification.type === 'message' ? 'dm' : 'comment',
          mode: 'instant'
        });
        
        if (!trackingSuccess) {
          console.warn(`[FacebookDashboard] 🚫 AI Reply blocked for Facebook - limit reached`);
          setError('AI reply limit reached - upgrade to continue');
          return;
        }
        
        console.log(`[FacebookDashboard] ✅ AI Reply tracked: Facebook ${notification.type} reply`);
        
        // Remove original notification and add AI reply preview
        setNotifications(prev => prev.filter(n => 
          !((n.message_id && n.message_id === notification.message_id) || 
            (n.comment_id && n.comment_id === notification.comment_id))
        ));
        
        // Add as AI reply ready notification for preview
        setNotifications(prev => [...prev, createAIReadyNotification(notification, response.data.reply)]);
        
        // Mark notification as handled to prevent re-appearance
        try {
          await axios.post(`${getApiUrl(`/mark-notification-handled/${facebookPageId}`)}`, {
            notification_id: notifId,
            type: notification.type,
            handled_by: 'ai',
            platform: 'facebook'
          });
        } catch (markError) {
          console.warn(`[${new Date().toISOString()}] Could not mark Facebook notification as handled:`, markError);
        }
        
      } else {
        throw new Error(response.data?.error || 'No reply generated');
      }

    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error generating Facebook AI reply:`, error);
      
      // Handle specific error cases
      if (error.message?.includes('ERR_NAME_NOT_RESOLVED') || error.message?.includes('net::ERR_NAME_NOT_RESOLVED')) {
        setError(`AI reply failed: URL resolution error. Please check your proxy configuration.`);
      } else if (error.response?.status === 503) {
        setError(`AI service temporarily unavailable. Please try again later.`);
      } else if (error.response?.status === 429) {
        setError(`Rate limit exceeded. Please try again later.`);
      } else {
        setError(`Failed to generate AI reply: ${error.response?.data?.error || error.message}`);
      }
    } finally {
      setAiProcessingNotifications(prev => ({ ...prev, [notifId]: false }));
    }
  }, [facebookPageId, currentUser?.uid, facebookUsername, isComponentMounted, canUseFeature, trackRealAIReply, createAIReadyNotification]);

  // Handle sending AI reply preview
  const handleSendAIReply = useCallback(async (notification: Notification, notifId: string) => {
    if (!notification.aiReply || !notification.sender_id || !facebookPageId || !isComponentMounted) return;
    
    // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding  
    const aiReplyAccessCheck = canUseFeature('aiReplies');
    if (!aiReplyAccessCheck.allowed) {
      console.warn(`[FacebookDashboard] AI Reply blocked: ${aiReplyAccessCheck.reason}`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Sending Facebook AI reply for ${notifId}`);
    
    try {
      const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
      
      // Use getApiUrl for API calls
      const sendResponse = await fetch(`${getApiUrl(`/${endpoint}/${facebookPageId}`)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          sender_id: notification.sender_id,
          text: notification.aiReply.reply,
          message_id: notification.message_id,
          comment_id: notification.comment_id,
          platform: 'facebook'
        }),
      });
      
      const responseData = await sendResponse.json();
      
      if (sendResponse.ok) {
        console.log(`[${new Date().toISOString()}] Successfully sent Facebook AI reply for ${notifId}`);
        
        // ✅ REAL USAGE TRACKING: Check limits BEFORE sending AI reply
        const trackingSuccess = await trackRealAIReply('facebook', {
          type: notification.type === 'message' ? 'dm' : 'comment',
          mode: 'instant'
        });
        
        if (!trackingSuccess) {
          console.warn(`[FacebookDashboard] 🚫 AI Reply blocked for Facebook - limit reached`);
          return; // Don't send the AI reply
        }
        
        console.log(`[FacebookDashboard] ✅ AI Reply tracked: Facebook ${notification.type} reply`);
        
        console.log(`Facebook AI reply sent successfully!`);
        
      } else {
        console.error(`[${new Date().toISOString()}] Server error sending Facebook AI reply:`, responseData);
      }
      
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error sending Facebook AI reply:`, error);
    }
  }, [facebookPageId, isComponentMounted, canUseFeature, trackRealAIReply]);

  // Handle ignoring AI reply preview
  const handleIgnoreAIReply = useCallback(async (notification: Notification) => {
    if (!notification.aiReply || !isComponentMounted) return;
    
    try {
      // Simply remove the notification from the list
      setNotifications(prev => prev.filter(n => 
        !((n.message_id && n.message_id === notification.message_id) || 
          (n.comment_id && n.comment_id === notification.comment_id))
      ));
      
      console.log(`[${new Date().toISOString()}] Ignored Facebook AI reply preview`);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error ignoring Facebook AI reply:`, error);
    }
  }, [isComponentMounted]);

  // Handle auto-reply to all notifications
  const handleAutoReplyAll = useCallback(async (notifications: Notification[]) => {
    if (!facebookPageId || !currentUser?.uid || !isComponentMounted) return;

    try {
      console.log(`[${new Date().toISOString()}] Starting Facebook auto-reply for ${notifications.length} notifications`);
      
      for (const notification of notifications) {
        // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding
        const aiReplyAccessCheck = canUseFeature('aiReplies');
        if (!aiReplyAccessCheck.allowed) {
          console.warn(`[FacebookDashboard] Auto-reply blocked: ${aiReplyAccessCheck.reason}`);
          continue;
        }
        
        // Generate AI reply using direct backend call
        const message = notification.text || '';
        const userId = currentUser?.uid || facebookUsername;
        if (!userId) {
          console.error('No user ID available for auto-reply');
          continue;
        }
        
        // Format the request as expected by the backend
        const notificationData = {
          type: notification.type || 'message',
          facebook_user_id: facebookPageId,
          sender_id: notification.sender_id,
          message_id: notification.message_id,
          comment_id: notification.comment_id,
          text: message,
          timestamp: Date.now(),
          received_at: new Date().toISOString(),
          status: 'pending',
          platform: 'facebook'
        };
        
        // Use getApiUrl for API calls
        const response = await axios.post(getApiUrl('/api/instant-reply'), {
          username: userId,
          notification: notificationData
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        });

        if (response.data && response.data.success && response.data.reply) {
          // ✅ REAL USAGE TRACKING: Check limits AFTER successful generation
          const trackingSuccess = await trackRealAIReply('facebook', {
            type: notification.type === 'message' ? 'dm' : 'comment',
            mode: 'instant'
          });
          
          if (!trackingSuccess) {
            console.warn(`[FacebookDashboard] 🚫 Auto-reply blocked for Facebook - limit reached`);
            continue;
          }
          
          console.log(`[FacebookDashboard] ✅ Auto-reply tracked: Facebook ${notification.type} reply`);
          
          // Send the generated reply
          const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
          
          // Use getApiUrl for API calls
          await axios.post(`${getApiUrl(`/${endpoint}/${facebookPageId}`)}`, {
            sender_id: notification.sender_id,
            text: response.data.reply,
            message_id: notification.message_id,
            comment_id: notification.comment_id,
            platform: 'facebook'
          });

          // Update notification status locally
          setNotifications(prev => 
            prev.map(notif => 
              (notif.message_id === notification.message_id || notif.comment_id === notification.comment_id)
                ? { ...notif, status: 'replied' as const }
                : notif
            )
          );

          console.log(`[${new Date().toISOString()}] Facebook auto-reply sent for ${notification.message_id || notification.comment_id}`);
        }
      }

    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error in Facebook auto-reply:`, error);
      setError('Auto-reply failed for some notifications');
    }
  }, [facebookPageId, currentUser?.uid, facebookUsername, isComponentMounted, canUseFeature, trackRealAIReply]);

  // Handle post scheduling
  const handleSchedulePost = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facebookPageId || !scheduleForm.scheduleDate || !isComponentMounted) return;

    try {
      const formData = new FormData();
      formData.append('caption', scheduleForm.caption);
      formData.append('scheduleDate', scheduleForm.scheduleDate);
      formData.append('platform', 'facebook');
      
      if (scheduleForm.image) {
        formData.append('image', scheduleForm.image);
      }

      // Use getApiUrl for API calls
      await axios.post(`${getApiUrl(`/api/schedule-post/${facebookPageId}`)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

              // Note: Post scheduling would be tracked separately by the post creation system

      // Reset form
      setScheduleForm({ caption: '', scheduleDate: '', image: null });
      setIsSchedulerOpen(false);
      
      console.log(`[${new Date().toISOString()}] Facebook post scheduled successfully`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error scheduling Facebook post:`, error);
      setError('Failed to schedule post');
    }
  }, [facebookPageId, scheduleForm, isComponentMounted]);

  // Render connection screen if not connected
  if (!isConnected) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-logo">
            <img 
              src="/Logo/logo.png" 
              alt="Logo" 
              className="dashboard-logo"
            />
            <h1>Facebook Dashboard</h1>
          </div>
          {onOpenChat && (
            <button onClick={() => onOpenChat('', 'facebook')} className="close-button">×</button>
          )}
        </div>
        
        <div className="connection-container">
          <div className="connection-card">
            <h2>Connect Your Facebook Account</h2>
            <p>Connect your Facebook page to manage messages, comments, and schedule posts.</p>
            <FacebookConnect />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlatformDashboard 
            platform="facebook"
      accountHolder={accountHolder}
      competitors={[]} // Facebook competitors would be set separately
      accountType="branding" // Default to branding for Facebook
      onOpenChat={onOpenChat}
    />
  );
};

export default FacebookDashboard; 