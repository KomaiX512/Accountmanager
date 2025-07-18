import React, { useState, useEffect, useRef } from 'react';
import './Dms_Comments.css';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { Notification } from '../../types/notifications';
import { safeFilter } from '../../utils/safeArrayUtils';

interface DmsCommentsProps {
  notifications: Notification[];
  onReply: (notification: Notification, replyText: string) => void;
  onIgnore: (notification: Notification) => void;
  onRefresh: () => void;
  onReplyWithAI: (notification: Notification) => void;
  username: string;
  refreshKey: number;
  igBusinessId?: string | null;
  twitterId?: string | null;
  facebookPageId?: string | null;
  aiRepliesRefreshKey?: number;
  onAIRefresh?: () => void;
  aiProcessingNotifications?: Record<string, boolean>;
  onSendAIReply?: (notification: Notification) => void;
  onIgnoreAIReply?: (notification: Notification) => void;
  onAutoReplyAll?: (notifications: Notification[]) => void;
  onStopAutoReply?: () => void; // 🛑 STOP OPERATION: Add stop callback prop
  isAutoReplying?: boolean; // 🛑 STOP OPERATION: Add auto-reply status prop
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const Dms_Comments: React.FC<DmsCommentsProps> = ({ 
  notifications, 
  onReply, 
  onIgnore, 
  onRefresh, 
  onReplyWithAI, 
  username, 
  refreshKey, 
  igBusinessId: propIgBusinessId, 
  twitterId: propTwitterId,
  facebookPageId: propFacebookPageId,
  aiRepliesRefreshKey = 0, 
  onAIRefresh,
  aiProcessingNotifications = {},
  onSendAIReply,
  onIgnoreAIReply,
  onAutoReplyAll,
  onStopAutoReply, // 🛑 STOP OPERATION: Add stop callback prop
  isAutoReplying: parentIsAutoReplying = false, // 🛑 STOP OPERATION: Parent auto-reply status
  platform = 'instagram'
}) => {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [showReplyInput, setShowReplyInput] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoReplying, setIsAutoReplying] = useState(false);
  const [autoReplyProgress, setAutoReplyProgress] = useState<{ current: number; total: number; currentMessage: string } | null>(null);
  
  // 🛑 STOP OPERATION: Add stop flag and timeout reference for cancellation
  const [shouldStopAutoReply, setShouldStopAutoReply] = useState(false);
  const autoReplyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { userId: contextIgBusinessId, isConnected: isInstagramConnected } = useInstagram();
  const igBusinessId = propIgBusinessId || contextIgBusinessId;
  const { userId: twitterId } = useTwitter();
  const { userId: facebookUserId, isConnected: isFacebookConnected } = useFacebook();
  const facebookPageId = propFacebookPageId || facebookUserId;

  // CRITICAL FIX: Add validation for notifications array
  const validNotifications = React.useMemo(() => {
    if (!Array.isArray(notifications)) {
      console.error(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Invalid notifications data:`, notifications);
      return [];
    }

    return notifications.filter((notif: any, index: number) => {
      // Basic validation
      if (!notif || typeof notif !== 'object') {
        console.warn(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Invalid notification at index ${index}:`, notif);
        return false;
      }

      // Check for required fields
      const hasRequiredFields = notif.type && 
                              (notif.message_id || notif.comment_id) && 
                              typeof notif.text === 'string' && 
                              typeof notif.timestamp === 'number';
      if (!hasRequiredFields) {
        console.warn(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Notification missing required fields at index ${index}:`, notif);
        return false;
      }

      // Platform-specific validation
      if (platform === 'facebook') {
        // Additional Facebook-specific validation
        if (!notif.facebook_page_id && !notif.facebook_user_id) {
          console.warn(`[${new Date().toISOString()}] [FACEBOOK] Notification missing Facebook ID at index ${index}:`, notif);
          return false;
        }
      }

      return true;
    });
  }, [notifications, platform]);

  console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Dms_Comments render:`, {
    originalCount: notifications?.length || 0, validCount: validNotifications.length,
    platform,
    isConnected: platform === 'instagram' ? isInstagramConnected : 
                 platform === 'twitter' ? !!twitterId : 
                 platform === 'facebook' ? isFacebookConnected : false
  });

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleReply = (notif: Notification) => {
    if (!replyText[notif.message_id || notif.comment_id || '']) {
      setError('Please enter a reply message');
      return;
    }
    onReply(notif, replyText[notif.message_id || notif.comment_id || '']);
    setReplyText(prev => ({ ...prev, [notif.message_id || notif.comment_id || '']: '' }));
    setShowReplyInput(prev => ({ ...prev, [notif.message_id || notif.comment_id || '']: false }));
  };

  const handleIgnore = (notif: Notification) => {
    onIgnore(notif);
  };

  const handleSendAIReply = async (notification: Notification) => {
    if (!onSendAIReply) return;
    try {
      setIsLoading(true);
      await onSendAIReply(notification);
    } catch (error) {
      setError('Failed to send AI reply');
    } finally {
      setIsLoading(false);
    }
  };

  const handleIgnoreAIReply = (notification: Notification) => {
    if (!onIgnoreAIReply) return;
    onIgnoreAIReply(notification);
  };

  const handleAutoReplyAll = async () => {
    if (!onAutoReplyAll || isAutoReplying) return;
    
    // Filter notifications that can be auto-replied (not already replied/ignored)
    const pendingNotifications = safeFilter(notifications, (notif: any) => 
      !notif.status || notif.status === 'pending'
    );
    
    if (pendingNotifications.length === 0) {
      setError('No pending notifications to reply to');
      return;
    }

    try {
      setIsAutoReplying(true);
      setShouldStopAutoReply(false); // 🛑 STOP OPERATION: Reset stop flag
      setAutoReplyProgress({ current: 0, total: pendingNotifications.length, currentMessage: 'Starting auto-reply...' });
      setError(null);

      // Process notifications with intelligent rate limiting
      for (let i = 0; i < pendingNotifications.length; i++) {
        // 🛑 STOP OPERATION: Check if user requested to stop
        if (shouldStopAutoReply) {
          console.log(`[${platform.toUpperCase()}] Auto-reply stopped by user at ${i + 1}/${pendingNotifications.length}`);
          setAutoReplyProgress({ 
            current: i, 
            total: pendingNotifications.length, 
            currentMessage: `Auto-reply stopped (${i}/${pendingNotifications.length} completed)` 
          });
          break;
        }
        
        const notification = pendingNotifications[i];
        const notificationId = notification.message_id || notification.comment_id || '';
        
        setAutoReplyProgress({ 
          current: i + 1, 
          total: pendingNotifications.length, 
          currentMessage: `Replying to ${notification.username || 'user'}...` 
        });

        try {
          // 🛑 STOP OPERATION: Check stop flag before making request
          if (shouldStopAutoReply) break;
          
          // Generate and send AI reply for this notification
          await onAutoReplyAll([notification]);
          
          // 🛑 STOP OPERATION: Check stop flag before delay
          if (shouldStopAutoReply) break;
          
          // Rate limiting: Wait between requests to avoid platform limits
          if (i < pendingNotifications.length - 1) {
            const delay = platform === 'twitter' ? 90000 : // 1.5 minutes for Twitter (strict limits)
                         platform === 'facebook' ? 60000 : // 1 minute for Facebook  
                         45000; // 45 seconds for Instagram
            
            setAutoReplyProgress({ 
              current: i + 1, 
              total: pendingNotifications.length, 
              currentMessage: `Waiting ${delay/1000}s before next reply...` 
            });
            
            // 🛑 STOP OPERATION: Use cancellable timeout
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
          console.error(`Error auto-replying to notification ${notificationId}:`, error);
          
          // Handle specific Instagram API errors
          if (error.response?.data?.code === 'TIME_RESTRICTION') {
            console.log(`Instagram time restriction for notification ${notificationId} - will retry later`);
            // Continue with next notification - time restrictions are temporary
          } else if (error.response?.data?.code === 'USER_NOT_FOUND') {
            console.log(`User not found for notification ${notificationId} - skipping`);
            // Continue with next notification - user not found is permanent
          } else {
            console.error(`Unknown error for notification ${notificationId}:`, error);
            // Continue with next notification even if one fails
          }
        }
      }

      // 🛑 STOP OPERATION: Set final message based on completion status
      if (shouldStopAutoReply) {
        setAutoReplyProgress({ 
          current: pendingNotifications.length, 
          total: pendingNotifications.length, 
          currentMessage: 'Auto-reply stopped by user' 
        });
      } else {
        setAutoReplyProgress({ 
          current: pendingNotifications.length, 
          total: pendingNotifications.length, 
          currentMessage: 'Auto-reply complete!' 
        });
      }

      // Clear progress after 3 seconds
      setTimeout(() => {
        setAutoReplyProgress(null);
      }, 3000);

    } catch (error) {
      setError('Auto-reply failed. Please try again.');
      console.error('Auto-reply error:', error);
    } finally {
      setIsAutoReplying(false);
      setShouldStopAutoReply(false); // 🛑 STOP OPERATION: Reset stop flag
      
      // 🛑 STOP OPERATION: Cancel any pending timeout
      if (autoReplyTimeoutRef.current) {
        clearTimeout(autoReplyTimeoutRef.current);
        autoReplyTimeoutRef.current = null;
      }
    }
  };

  // 🛑 STOP OPERATION: Handle stop button click
  const handleStopAutoReply = () => {
    console.log(`[${platform.toUpperCase()}] Stop auto-reply requested by user`);
    setShouldStopAutoReply(true);
    
    // Cancel any pending timeout immediately
    if (autoReplyTimeoutRef.current) {
      clearTimeout(autoReplyTimeoutRef.current);
      autoReplyTimeoutRef.current = null;
    }
    
    setAutoReplyProgress(prev => prev ? {
      ...prev,
      currentMessage: 'Stopping auto-reply...'
    } : null);
  };

  const renderNotConnectedMessage = () => {
    if (platform === 'instagram' && !isInstagramConnected) {
      return (
        <div className="not-connected-message">
          Please connect your Instagram account to view notifications
        </div>
      );
    }
    if (platform === 'twitter' && !twitterId) {
      return (
        <div className="not-connected-message">
          Please connect your Twitter account to view notifications
        </div>
      );
    }
    if (platform === 'facebook' && !isFacebookConnected) {
      return (
        <div className="not-connected-message">
          Please connect your Facebook account to view notifications
        </div>
      );
    }
    return null;
  };

  if (renderNotConnectedMessage()) {
    return renderNotConnectedMessage();
  }

  return (
    <div className="dms-comments-container">
      {error && <div className="error-message">{error}</div>}
      {/* Header Row with Notification Count and Tiny Refresh Icon */}
      <div className="notifications-header-row">
        <span className="notifications-header-title">Notifications</span>
        <span className="notifications-count-dot" />
        <button
          className="tiny-refresh-btn"
          onClick={onRefresh}
          disabled={isLoading}
          title="Reload notifications"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.93 4.93a8 8 0 1 1-2.34 5.66" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="1 1 1 7 7 7" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      {/* Auto-Reply Progress */}
      {autoReplyProgress && (
        <div className="auto-reply-progress">
          <div className="progress-header">
            <span>Auto-Reply Progress</span>
            <div className="progress-controls">
              <span>{autoReplyProgress.current}/{autoReplyProgress.total}</span>
              {/* 🛑 STOP BUTTON: Beautiful stop button for cancelling auto-reply */}
              {isAutoReplying && (
                <button 
                  onClick={handleStopAutoReply}
                  className="stop-auto-reply-btn"
                  title="Stop auto-reply operation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(autoReplyProgress.current / autoReplyProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-message">{autoReplyProgress.currentMessage}</div>
        </div>
      )}

      {/* Auto-Reply Button */}
      {validNotifications.length > 0 && onAutoReplyAll && (
        <div className="auto-reply-section">
          <button 
            onClick={handleAutoReplyAll}
            disabled={isAutoReplying || isLoading}
            className="auto-reply-all-btn"
          >
            {isAutoReplying ? 'Auto-Replying...' : `Auto-Reply All (${safeFilter(validNotifications, (n: any) => !n.status || n.status === 'pending').length})`}
          </button>
          <span className="auto-reply-info">
            AI will reply to all pending Comments and Dms based on rule set and according to yours personalization.
          </span>
        </div>
      )}

      {validNotifications.length === 0 ? (
        <div className="no-notifications">No new notifications</div>
      ) : (
        validNotifications.map((notif) => (
          <div key={notif.message_id || notif.comment_id} className="notification-item">
            <div className="notification-header">
              <span className="notification-type">
                {notif.type === 'message' 
                  ? (platform === 'twitter' ? 'Tweet' : platform === 'facebook' ? 'Message' : 'DM')
                  : 'Comment'} from {/* Enhanced Facebook sender display */}
                {platform === 'facebook' && notif.page_name ? (
                  <span className="facebook-sender-info">
                    <strong className="sender-name">{notif.username || 'Unknown User'}</strong>
                    <span className="page-tag">via {notif.page_name}</span>
                  </span>
                ) : (
                  notif.username || 'Unknown'
                )}
              </span>
              <span className="notification-time">{formatTimestamp(notif.timestamp)}</span>
            </div>
            <div className="notification-content">{notif.text}</div>
            
            {notif.status === 'ai_reply_ready' && notif.aiReply ? (
              <div className="ai-reply-container">
                <div className="ai-reply-content">{notif.aiReply.reply}</div>
                <div className="ai-reply-actions">
                  <button 
                    onClick={() => handleSendAIReply(notif)}
                    disabled={isLoading || notif.aiReply.sendStatus === 'sending'}
                    className="send-ai-reply-btn"
                  >
                    {notif.aiReply.sendStatus === 'sending' ? 'Sending...' : 'Send AI Reply'}
                  </button>
                  <button 
                    onClick={() => handleIgnoreAIReply(notif)}
                    className="ignore-ai-reply-btn"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ) : (
              <div className="notification-actions">
                {showReplyInput[notif.message_id || notif.comment_id || ''] ? (
                  <div className="reply-input-container">
                    <textarea
                      value={replyText[notif.message_id || notif.comment_id || ''] || ''}
                      onChange={(e) => setReplyText(prev => ({
                        ...prev,
                        [notif.message_id || notif.comment_id || '']: e.target.value
                      }))}
                      placeholder="Type your reply..."
                      className="reply-textarea"
                    />
                    <div className="reply-buttons">
                      <button onClick={() => handleReply(notif)} className="send-reply-btn">
                        Send
                      </button>
                      <button 
                        onClick={() => setShowReplyInput(prev => ({
                          ...prev,
                          [notif.message_id || notif.comment_id || '']: false
                        }))}
                        className="cancel-reply-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setShowReplyInput(prev => ({
                        ...prev,
                        [notif.message_id || notif.comment_id || '']: true
                      }))}
                      className="reply-btn"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => onReplyWithAI(notif)}
                      disabled={aiProcessingNotifications[notif.message_id || notif.comment_id || '']}
                      className="ai-reply-btn"
                    >
                      {aiProcessingNotifications[notif.message_id || notif.comment_id || ''] 
                        ? 'Generating...' 
                        : 'AI Reply'}
                    </button>
                    <button onClick={() => handleIgnore(notif)} className="ignore-btn">
                      Ignore
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default Dms_Comments;