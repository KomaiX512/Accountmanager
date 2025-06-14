import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import Dms_Comments from '../instagram/Dms_Comments';
import FacebookConnect from './FacebookConnect';
import InsightsModal from '../instagram/InsightsModal';
import { Notification } from '../../types/notifications';
import FacebookNotificationService from '../../services/facebookNotificationService';
import axios from 'axios';
import '../instagram/Dashboard.css';
import { motion } from 'framer-motion';
import PlatformDashboard from '../dashboard/PlatformDashboard';

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

  // Fetch Facebook notifications with proper refresh handling
  const fetchNotifications = async (forceRefresh = false) => {
    if (!facebookPageId || !currentUser?.uid) return;
    
    setIsLoadingNotifications(true);
    setError(null);
    
    try {
      if (forceRefresh) {
        console.log(`[${new Date().toISOString()}] Force refreshing Facebook notifications...`);
      }
      
      const response = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook${forceRefresh ? '&forceRefresh=true' : ''}`);
      
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
  };

  // Setup SSE connection for real-time updates
  useEffect(() => {
    if (!facebookPageId || !currentUser?.uid) return;

    const eventSource = new EventSource(`http://localhost:3000/stream/${facebookPageId}`);
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
      }
    };
  }, [facebookPageId, currentUser?.uid]);

  // Initialize notifications on connection
  useEffect(() => {
    if (isConnected && facebookPageId) {
      fetchNotifications();
      
      // Initialize web push notifications
      notificationService.current.initializeWebPush().then(success => {
        if (success) {
          console.log('Facebook web push notifications initialized');
        }
      });
    }
  }, [isConnected, facebookPageId, refreshKey]);

  // Handle real-time notifications
  useEffect(() => {
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
  }, [eventSourceRef.current]);

  // Handle Facebook notification reply
  const handleReply = async (notification: Notification, replyText: string) => {
    if (!facebookPageId) return;
    
    // ✅ PRE-ACTION CHECK: Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      console.warn(`[FacebookDashboard] Discussion blocked: ${discussionAccessCheck.reason}`);
      return;
    }
    
    try {
      const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
      
      await axios.post(`http://localhost:3000/${endpoint}/${facebookPageId}`, {
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
  };

  // Handle ignore notification - permanently remove
  const handleIgnore = async (notification: Notification) => {
    if (!facebookPageId) return;
    
    try {
      await axios.post(`http://localhost:3000/ignore-notification/${facebookPageId}`, {
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
  };

  // Create AI ready notification helper
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

  // Handle AI reply generation with preview
  const handleReplyWithAI = async (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    if (!notifId) return;

    setAiProcessingNotifications(prev => ({ ...prev, [notifId]: true }));

    try {
      console.log(`[${new Date().toISOString()}] Generating Facebook AI reply for ${notifId}`);
      
      // Use enhanced RAG service for instant reply generation
      const message = notification.text || '';
      const conversation = [{
        role: "user",
        content: message
      }];
      
      // Call the RAG service directly for instant reply
      const response = await axios.post('http://localhost:3001/api/instant-reply', {
        username: currentUser?.uid || facebookUsername,
        notification: {
          type: notification.type,
          message_id: notification.message_id,
          comment_id: notification.comment_id,
          text: notification.text,
          username: notification.username,
          timestamp: notification.timestamp,
          platform: 'facebook'
        },
        platform: 'facebook'
      });

      if (response.data && response.data.success) {
        console.log(`[${new Date().toISOString()}] Successfully generated Facebook AI reply:`, 
          response.data.reply?.substring(0, 50) + '...'
        );
        
        // Remove original notification and add AI reply preview
        setNotifications(prev => prev.filter(n => 
          !((n.message_id && n.message_id === notification.message_id) || 
            (n.comment_id && n.comment_id === notification.comment_id))
        ));
        
        // Add as AI reply ready notification for preview
        setNotifications(prev => [...prev, createAIReadyNotification(notification, response.data.reply)]);
        
        // Mark notification as handled to prevent re-appearance
        try {
          await axios.post(`http://localhost:3000/mark-notification-handled/${facebookPageId}`, {
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
      setError(`Failed to generate AI reply: ${error.response?.data?.error || error.message}`);
    } finally {
      setAiProcessingNotifications(prev => ({ ...prev, [notifId]: false }));
    }
  };

  // Handle sending AI reply preview
  const handleSendAIReply = async (notification: Notification, notifId: string) => {
    if (!notification.aiReply || !notification.sender_id || !facebookPageId) return;
    
    // ✅ PRE-ACTION CHECK: Verify AI reply limits before proceeding  
    const aiReplyAccessCheck = canUseFeature('aiReplies');
    if (!aiReplyAccessCheck.allowed) {
      console.warn(`[FacebookDashboard] AI Reply blocked: ${aiReplyAccessCheck.reason}`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Sending Facebook AI reply for ${notifId}`);
    
    try {
      const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
      
      const sendResponse = await fetch(`http://localhost:3000/${endpoint}/${facebookPageId}`, {
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
  };

  // Handle ignoring AI reply preview
  const handleIgnoreAIReply = async (notification: Notification) => {
    if (!notification.aiReply) return;
    
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
  };

  // Handle auto-reply to all notifications
  const handleAutoReplyAll = async (notifications: Notification[]) => {
    if (!facebookPageId || !currentUser?.uid) return;

    try {
      console.log(`[${new Date().toISOString()}] Starting Facebook auto-reply for ${notifications.length} notifications`);
      
      for (const notification of notifications) {
        // Generate AI reply using the RAG server
        const response = await axios.post('http://localhost:3001/api/instant-reply', {
          username: currentUser.uid,
          notification: {
            type: notification.type,
            message_id: notification.message_id,
            comment_id: notification.comment_id,
            text: notification.text,
            username: notification.username,
            timestamp: notification.timestamp,
            platform: 'facebook'
          },
          platform: 'facebook'
        });

        if (response.data.success && response.data.reply) {
          // Send the generated reply
          const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
          
          await axios.post(`http://localhost:3000/${endpoint}/${facebookPageId}`, {
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
  };

  // Handle post scheduling
  const handleSchedulePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facebookPageId || !scheduleForm.scheduleDate) return;

    try {
      const formData = new FormData();
      formData.append('caption', scheduleForm.caption);
      formData.append('scheduleDate', scheduleForm.scheduleDate);
      formData.append('platform', 'facebook');
      
      if (scheduleForm.image) {
        formData.append('image', scheduleForm.image);
      }

      await axios.post(`http://localhost:3000/schedule-post/${facebookPageId}`, formData, {
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
  };

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