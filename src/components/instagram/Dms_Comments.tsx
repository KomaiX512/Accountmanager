import React, { useState, useRef } from 'react';
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
  onEditAIReply?: (notification: Notification, editedReply: string) => void; // NEW: Edit AI reply functionality
  autoReplyProgress?: { current: number; total: number; nextReplyIn?: number }; // NEW: Auto-reply progress
}

const Dms_Comments: React.FC<DmsCommentsProps> = ({ 
  notifications, 
  onReply, 
  onIgnore, 
  onRefresh, 
  onReplyWithAI, 
  // username, // TODO: Use for display if needed
  // refreshKey, // Handled by parent
  // aiRepliesRefreshKey = 0, // Handled by parent 
  // onAIRefresh, // Handled by parent
  aiProcessingNotifications = {},
  onSendAIReply,
  onIgnoreAIReply,
  onAutoReplyAll,
  onStopAutoReply, // 🛑 STOP OPERATION: Add stop callback prop
  isAutoReplying: parentIsAutoReplying = false, // 🛑 STOP OPERATION: Parent auto-reply status
  platform = 'instagram',
  onEditAIReply, // NEW: Edit AI reply functionality
  autoReplyProgress: parentAutoReplyProgress // NEW: Auto-reply progress from parent
}) => {
  // Fix: Ensure all hooks are called in the same order every render
  const { isConnected: isInstagramConnected } = useInstagram();
  const { userId: twitterId } = useTwitter();
  const { isConnected: isFacebookConnected } = useFacebook();

  // State hooks in consistent order
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [showReplyInput, setShowReplyInput] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // NEW: State for editing AI replies
  const [editingAIReply, setEditingAIReply] = useState<Record<string, boolean>>({});
  const [aiReplyEditText, setAiReplyEditText] = useState<Record<string, string>>({});
  
  // 🛑 STOP OPERATION: Simple timeout reference for cancellation
  const autoReplyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // NEW: State for scroll position
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  // NEW: Reference for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Handle scroll events to show/hide scroll-to-top button
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current;
      setShowScrollTop(scrollTop > 200);
    }
  };

  // Scroll to top function
  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Derived values after all hooks
  // 🛑 STOP OPERATION: Use parent's isAutoReplying state
  const isAutoReplying = parentIsAutoReplying;

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

  // NEW: Handle editing AI reply
  const handleEditAIReply = (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    setEditingAIReply(prev => ({ ...prev, [notifId]: true }));
    setAiReplyEditText(prev => ({ 
      ...prev, 
      [notifId]: notification.aiReply?.reply || '' 
    }));
  };

  // NEW: Handle saving edited AI reply
  const handleSaveEditedAIReply = (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    const editedText = aiReplyEditText[notifId];
    
    if (!editedText || !editedText.trim()) {
      setError('Please enter a valid reply');
      return;
    }

    if (onEditAIReply) {
      onEditAIReply(notification, editedText.trim());
    }

    // Exit edit mode
    setEditingAIReply(prev => ({ ...prev, [notifId]: false }));
    setAiReplyEditText(prev => ({ ...prev, [notifId]: '' }));
  };

  // NEW: Handle canceling edit
  const handleCancelEditAIReply = (notification: Notification) => {
    const notifId = notification.message_id || notification.comment_id || '';
    setEditingAIReply(prev => ({ ...prev, [notifId]: false }));
    setAiReplyEditText(prev => ({ ...prev, [notifId]: '' }));
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
      // 🛑 STOP OPERATION: Just call parent's auto-reply function
      // Parent handles the state management
      await onAutoReplyAll(pendingNotifications);
    } catch (error) {
      console.error('Error in handleAutoReplyAll:', error);
      setError('Auto-reply failed. Please try again.');
    }
  };

  // 🛑 STOP OPERATION: Handle stop button click  
  const handleStopAutoReply = () => {
    console.log(`[${platform.toUpperCase()}] Stop auto-reply requested by user`);
    
    // Call parent's stop function if available
    if (onStopAutoReply) {
      onStopAutoReply();
    }
    
    // Cancel any pending timeout immediately
    if (autoReplyTimeoutRef.current) {
      clearTimeout(autoReplyTimeoutRef.current);
      autoReplyTimeoutRef.current = null;
    }
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
        <span className="notifications-header-title">
          Notifications
          {validNotifications.length > 0 && (
            <span className="notifications-count-badge">{validNotifications.length}</span>
          )}
        </span>
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
      
            {/* Auto-Reply Progress - Show when parent is auto-replying */}
      {isAutoReplying && (
        <div className="auto-reply-progress">
          <div className="progress-header">
            <span>Auto-Reply Progress</span>
            <div className="progress-controls">
              <button 
                className="stop-auto-reply-btn" 
                onClick={handleStopAutoReply}
                title="Stop Auto-Reply"
              >
                🛑
              </button>
            </div>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: parentAutoReplyProgress && parentAutoReplyProgress.total > 0 
                  ? `${(parentAutoReplyProgress.current / parentAutoReplyProgress.total) * 100}%` 
                  : '50%' 
              }} 
            />
          </div>
          <div className="progress-message">
            {parentAutoReplyProgress && parentAutoReplyProgress.total > 0 ? (
              <>
                Processing {parentAutoReplyProgress.current} of {parentAutoReplyProgress.total} notifications
                {parentAutoReplyProgress.nextReplyIn && parentAutoReplyProgress.nextReplyIn > 0 && (
                  <span className="next-reply-timer"> • Next reply in {parentAutoReplyProgress.nextReplyIn}s</span>
                )}
              </>
            ) : (
              'Processing auto-replies...'
            )}
          </div>
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
        <div 
          className="notifications-scroll-container" 
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          {validNotifications.map((notif) => (
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
                  {editingAIReply[notif.message_id || notif.comment_id || ''] ? (
                    // Edit mode for AI reply
                    <div className="ai-reply-edit-container">
                      <div className="ai-reply-label">Edit AI Reply:</div>
                      <textarea
                        value={aiReplyEditText[notif.message_id || notif.comment_id || ''] || ''}
                        onChange={(e) => setAiReplyEditText(prev => ({
                          ...prev,
                          [notif.message_id || notif.comment_id || '']: e.target.value
                        }))}
                        placeholder="Edit your AI reply..."
                        className="ai-reply-edit-textarea"
                        rows={3}
                      />
                      <div className="ai-reply-edit-actions">
                        <button 
                          onClick={() => handleSaveEditedAIReply(notif)}
                          className="save-ai-reply-btn"
                          disabled={!aiReplyEditText[notif.message_id || notif.comment_id || '']?.trim()}
                        >
                          Save Changes
                        </button>
                        <button 
                          onClick={() => handleCancelEditAIReply(notif)}
                          className="cancel-ai-reply-edit-btn"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Preview mode for AI reply
                    <>
                      <div className="ai-reply-label">AI Reply Preview:</div>
                      <div className="ai-reply-content">{notif.aiReply.reply}</div>
                      <div className="ai-reply-actions">
                        <button 
                          onClick={() => handleSendAIReply(notif)}
                          disabled={isLoading || notif.aiReply.sendStatus === 'sending'}
                          className={`send-ai-reply-btn ${notif.aiReply.sendStatus === 'sending' ? 'loading' : ''}`}
                        >
                          {notif.aiReply.sendStatus === 'sending' ? (
                            <>
                              <span className="loading-spinner"></span>
                              Sending...
                            </>
                          ) : (
                            'Send AI Reply'
                          )}
                        </button>
                        <button 
                          onClick={() => handleEditAIReply(notif)}
                          className="edit-ai-reply-btn"
                          title="Edit this AI reply"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="m18.5 2.5 a 2.121 2.121 0 0 1 3 3 l -9.5 9.5 l -4 1 l 1 -4 l 9.5 -9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleIgnoreAIReply(notif)}
                          className="ignore-ai-reply-btn"
                        >
                          Ignore
                        </button>
                      </div>
                    </>
                  )}
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
                        className={`ai-reply-btn ${aiProcessingNotifications[notif.message_id || notif.comment_id || ''] ? 'loading' : ''}`}
                      >
                        {aiProcessingNotifications[notif.message_id || notif.comment_id || ''] 
                          ? (
                            <>
                              <span className="loading-spinner"></span>
                              Generating...
                            </>
                          ) 
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
          ))}
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollTop && validNotifications.length > 5 && (
        <button 
          className="scroll-to-top-btn"
          onClick={scrollToTop}
          title="Scroll to top"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
};

export default Dms_Comments;