import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import Dms_Comments from '../instagram/Dms_Comments';
import FacebookConnect from './FacebookConnect';
import InsightsModal from '../instagram/InsightsModal';
import { Notification } from '../../types/notifications';
import FacebookNotificationService from '../../services/facebookNotificationService';
import axios from 'axios';
import '../instagram/Dashboard.css';

interface FacebookDashboardProps {
  onClose?: () => void;
}

const FacebookDashboard: React.FC<FacebookDashboardProps> = ({ onClose }) => {
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

  // Fetch Facebook notifications
  const fetchNotifications = async () => {
    if (!facebookPageId || !currentUser?.uid) return;
    
    setIsLoadingNotifications(true);
    setError(null);
    
    try {
      console.log(`[${new Date().toISOString()}] Fetching Facebook notifications for page ${facebookPageId}`);
      const response = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
      
      if (response.data && Array.isArray(response.data)) {
        const facebookNotifications = response.data.map((notif: any) => ({
          ...notif,
          platform: 'facebook',
          facebook_page_id: facebookPageId
        }));
        
        setNotifications(facebookNotifications);
        console.log(`[${new Date().toISOString()}] Loaded ${facebookNotifications.length} Facebook notifications`);
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error fetching Facebook notifications:`, error);
      setError('Failed to load Facebook notifications');
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
    
    try {
      const endpoint = notification.type === 'message' ? 'send-dm-reply' : 'send-comment-reply';
      
      await axios.post(`http://localhost:3000/${endpoint}/${facebookPageId}`, {
        sender_id: notification.sender_id,
        text: replyText,
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: 'facebook'
      });

      // Update notification status
      setNotifications(prev => 
        prev.map(notif => 
          notif.message_id === notification.message_id || notif.comment_id === notification.comment_id
            ? { ...notif, status: 'replied' as const }
            : notif
        )
      );
      
      console.log(`[${new Date().toISOString()}] Facebook ${notification.type} reply sent successfully`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error sending Facebook reply:`, error);
      setError('Failed to send reply');
    }
  };

  // Handle ignore notification
  const handleIgnore = async (notification: Notification) => {
    if (!facebookPageId) return;
    
    try {
      await axios.post(`http://localhost:3000/ignore-notification/${facebookPageId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
        platform: 'facebook'
      });

      // Update notification status
      setNotifications(prev => 
        prev.map(notif => 
          notif.message_id === notification.message_id || notif.comment_id === notification.comment_id
            ? { ...notif, status: 'ignored' as const }
            : notif
        )
      );
      
      console.log(`[${new Date().toISOString()}] Facebook notification ignored`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error ignoring Facebook notification:`, error);
      setError('Failed to ignore notification');
    }
  };

  // Handle AI reply generation
  const handleReplyWithAI = async (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    if (!notifId) return;

    setAiProcessingNotifications(prev => ({ ...prev, [notifId]: true }));

    try {
      await axios.post(`http://localhost:3000/generate-ai-reply/${facebookPageId}`, {
        notification_id: notifId,
        notification_text: notification.text,
        notification_type: notification.type,
        platform: 'facebook'
      });

      console.log(`[${new Date().toISOString()}] Facebook AI reply generation started for ${notifId}`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error generating Facebook AI reply:`, error);
      setError('Failed to generate AI reply');
    } finally {
      setAiProcessingNotifications(prev => ({ ...prev, [notifId]: false }));
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
          <h1>Facebook Account Manager</h1>
          {onClose && (
            <button onClick={onClose} className="close-button">×</button>
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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Facebook Dashboard - @{facebookUsername}</h1>
        {onClose && (
          <button onClick={onClose} className="close-button">×</button>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2>Quick Actions</h2>
          <div className="action-buttons">
            <button 
              onClick={() => setIsInsightsOpen(true)}
              className="dashboard-btn insights-btn facebook"
            >
              <span>📊</span>
              <span>Insights</span>
            </button>
            
            <button 
              onClick={() => setIsSchedulerOpen(!isSchedulerOpen)}
              className="dashboard-btn schedule-btn"
            >
              <span>📅</span>
              <span>Schedule Post</span>
            </button>
            
            <button 
              onClick={() => setRefreshKey(prev => prev + 1)}
              className="dashboard-btn refresh-btn"
              disabled={isLoadingNotifications}
            >
              <span>🔄</span>
              <span>{isLoadingNotifications ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Post Scheduler */}
        {isSchedulerOpen && (
          <div className="dashboard-section">
            <h2>Schedule Facebook Post</h2>
            <form onSubmit={handleSchedulePost} className="schedule-form">
              <textarea
                value={scheduleForm.caption}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, caption: e.target.value }))}
                placeholder="Write your post caption..."
                className="caption-input"
                rows={4}
              />
              
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setScheduleForm(prev => ({ 
                  ...prev, 
                  image: e.target.files?.[0] || null 
                }))}
                className="file-input"
              />
              
              <input
                type="datetime-local"
                value={scheduleForm.scheduleDate}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduleDate: e.target.value }))}
                className="schedule-input"
                required
              />
              
              <div className="schedule-actions">
                <button type="submit" className="schedule-submit-btn">
                  Schedule Post
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsSchedulerOpen(false)}
                  className="schedule-cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Notifications */}
        <div className="dashboard-section">
          <h2>Facebook Notifications ({notifications.length})</h2>
          <Dms_Comments
            notifications={notifications}
            onReply={handleReply}
            onIgnore={handleIgnore}
            onRefresh={() => setRefreshKey(prev => prev + 1)}
            onReplyWithAI={handleReplyWithAI}
            username={facebookUsername || ''}
            refreshKey={refreshKey}
            facebookPageId={facebookPageId}
            aiRepliesRefreshKey={aiRepliesRefreshKey}
            aiProcessingNotifications={aiProcessingNotifications}
            platform="facebook"
          />
        </div>
      </div>

      {/* Insights Modal */}
      {isInsightsOpen && (
        <InsightsModal 
          userId={facebookPageId!} 
          onClose={() => setIsInsightsOpen(false)}
          platform="facebook"
        />
      )}
    </div>
  );
};

export default FacebookDashboard; 