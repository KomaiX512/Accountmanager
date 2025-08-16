import React, { useState, useRef, useEffect } from 'react';
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
  username, // 🛡️ DEFENSIVE FILTER: Use username to filter out own replies
  // refreshKey, // Handled by parent
  igBusinessId, // 🛡️ DEFENSIVE FILTER: Instagram Business ID for filtering
  twitterId: propTwitterId, // 🛡️ DEFENSIVE FILTER: Twitter ID for filtering (renamed to avoid conflict)
  facebookPageId, // 🛡️ DEFENSIVE FILTER: Facebook Page ID for filtering
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
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [hasNewItemsAtBottom, setHasNewItemsAtBottom] = useState(false);
  const [lastNotificationCount, setLastNotificationCount] = useState(0);
  
  // NEW: Reference for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Handle scroll events to show/hide scroll-to-top and scroll-to-bottom buttons
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      
      // Show scroll to top button when scrolled down
      setShowScrollTop(scrollTop > 100);
      
      // More precise bottom detection - account for action buttons area
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // Very precise threshold
      setShowScrollBottom(!isAtBottom);
      
      // Clear new items indicator if we're truly at bottom
      if (isAtBottom) {
        setHasNewItemsAtBottom(false);
      }
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



  // ENHANCED SCROLL TO BOTTOM: Ensure perfect visibility of last item including action buttons
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      
      // Use multiple attempts to ensure we reach the absolute bottom
      const scrollToAbsoluteBottom = () => {
        const maxScroll = container.scrollHeight - container.clientHeight + 100; // Extra 100px for action buttons
        container.scrollTop = Math.max(0, maxScroll);
      };
      
      // Immediate scroll
      scrollToAbsoluteBottom();
      
      // Double-check with timeout to ensure DOM is fully rendered
      setTimeout(() => {
        scrollToAbsoluteBottom();
      }, 100);
      
      // Final check with smooth behavior
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight + 150, // More generous padding
          behavior: 'smooth'
        });
      }, 200);
      
      // Clear the new items indicator
      setHasNewItemsAtBottom(false);
    }
  };

  // Derived values after all hooks
  // 🛑 STOP OPERATION: Use parent's isAutoReplying state
  const isAutoReplying = parentIsAutoReplying;



  // CRITICAL FIX: Add validation for notifications array AND defensive filtering for own replies
  const validNotifications = React.useMemo(() => {
    if (!Array.isArray(notifications)) {
      console.error(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Invalid notifications data:`, notifications);
      return [];
    }

    // 🛡️ CRITICAL: Get connected account identifiers for filtering
    const connectedUsername = username;
    const connectedBusinessId = platform === 'instagram' ? igBusinessId : 
                               platform === 'twitter' ? (propTwitterId || twitterId) : 
                               platform === 'facebook' ? facebookPageId : null;

    console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ DEFENSIVE FILTER INFO:`, {
      connectedUsername,
      connectedBusinessId,
      platform,
      igBusinessId,
      contextTwitterId: twitterId,
      propTwitterId,
      facebookPageId
    });

    return notifications.filter((notif: any, index: number) => {
      // 🛡️ CRITICAL: Log notification details for debugging
      console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Processing notification:`, {
        index,
        username: notif.username,
        connectedUsername,
        sender_id: notif.sender_id,
        instagram_user_id: notif.instagram_user_id,
        connectedBusinessId,
        text: notif.text?.substring(0, 50) + '...',
        type: notif.type
      });

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

      // 🛡️ DEFENSIVE FILTER: Exclude own replies/comments to prevent infinite loop
      // CRITICAL: Multiple aggressive checks to catch ALL scenarios where own content appears
      if (connectedUsername && notif.username) {
        // Primary check: exact username match (case insensitive for safety)
        if (notif.username.toLowerCase() === connectedUsername.toLowerCase()) {
          console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ FILTERED OUT own reply/comment from ${notif.username} (matches ${connectedUsername})`);
          return false;
        }
        
        // Additional safety: remove @ symbol if present and compare
        const cleanNotifUsername = notif.username.replace(/^@/, '').toLowerCase();
        const cleanOwnUsername = connectedUsername.replace(/^@/, '').toLowerCase();
        if (cleanNotifUsername === cleanOwnUsername) {
          console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ FILTERED OUT own reply/comment (cleaned usernames match): ${cleanNotifUsername} === ${cleanOwnUsername}`);
          return false;
        }
        
        // AGGRESSIVE: Also check if username contains our connected username
        if (cleanNotifUsername.includes(cleanOwnUsername) || cleanOwnUsername.includes(cleanNotifUsername)) {
          console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ FILTERED OUT own reply/comment (username contains match): ${cleanNotifUsername} ~ ${cleanOwnUsername}`);
          return false;
        }
      }

      // 🛡️ SUPER AGGRESSIVE: Also filter by connected business/user ID
      if (connectedBusinessId && (notif.instagram_user_id || notif.sender_id || notif.twitter_user_id || notif.facebook_user_id)) {
        const notifIds = [notif.instagram_user_id, notif.sender_id, notif.twitter_user_id, notif.facebook_user_id].filter(Boolean);
        for (const notifId of notifIds) {
          if (notifId && notifId.toString() === connectedBusinessId.toString()) {
            console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ FILTERED OUT own reply by business/user ID: ${notifId} matches ${connectedBusinessId}`);
            return false;
          }
        }
      }

      // 🛡️ DEFENSIVE FILTER: Additional platform-specific filtering with Instagram Business ID
      if (platform === 'instagram' && connectedUsername) {
        // For Instagram, also check sender_id or instagram_user_id if available
        if (notif.sender_id && notif.sender_id === connectedUsername) {
          console.log(`[${new Date().toISOString()}] [INSTAGRAM] 🛡️ FILTERED OUT own reply by sender_id: ${notif.sender_id}`);
          return false;
        }
        
        // CRITICAL: Check instagram_user_id against username
        if (notif.instagram_user_id && notif.instagram_user_id === connectedUsername) {
          console.log(`[${new Date().toISOString()}] [INSTAGRAM] 🛡️ FILTERED OUT own reply by instagram_user_id: ${notif.instagram_user_id}`);
          return false;
        }
        
        // AGGRESSIVE: Check if any ID field matches our username pattern
        const idsToCheck = [notif.sender_id, notif.instagram_user_id, notif.from_id, notif.user_id];
        for (const id of idsToCheck) {
          if (id && (id === connectedUsername || id.toString() === connectedUsername)) {
            console.log(`[${new Date().toISOString()}] [INSTAGRAM] 🛡️ FILTERED OUT own reply by ID field: ${id}`);
            return false;
          }
        }
      }
      
      if (platform === 'twitter' && username) {
        // For Twitter, check twitter_user_id or sender variations
        if (notif.twitter_user_id && notif.twitter_user_id === username) {
          console.log(`[${new Date().toISOString()}] [TWITTER] 🛡️ FILTERED OUT own reply by twitter_user_id: ${notif.twitter_user_id}`);
          return false;
        }
      }
      
      if (platform === 'facebook' && username) {
        // For Facebook, check facebook_user_id or page-related IDs
        if (notif.facebook_user_id && notif.facebook_user_id === username) {
          console.log(`[${new Date().toISOString()}] [FACEBOOK] 🛡️ FILTERED OUT own reply by facebook_user_id: ${notif.facebook_user_id}`);
          return false;
        }
        
        // Additional Facebook-specific validation
        if (!notif.facebook_page_id && !notif.facebook_user_id) {
          console.warn(`[${new Date().toISOString()}] [FACEBOOK] Notification missing Facebook ID at index ${index}:`, notif);
          return false;
        }
      }

      // 🛡️ DEFENSIVE FILTER: Enhanced text-based filtering as final safety net
      // If we detect patterns that suggest this is our own reply coming back
      if (connectedUsername && notif.text) {
        // Check if the notification text contains patterns that suggest it's our own automated reply
        const suspiciousPatterns = [
          /^Thanks for your message/i,
          /^Thank you for reaching out/i,
          /^I appreciate your comment/i,
          /^Auto-reply:/i,
          /^Automated response:/i,
          /^\[AI Reply\]/i,
          /^Hi there!/i,
          /^Hello!/i,
          /We appreciate/i,
          /Thank you for contacting/i
        ];
        
        const containsSuspiciousPattern = suspiciousPatterns.some(pattern => pattern.test(notif.text));
        if (containsSuspiciousPattern && notif.username && notif.username.toLowerCase() === connectedUsername.toLowerCase()) {
          console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] 🛡️ FILTERED OUT suspected own auto-reply by text pattern: "${notif.text.substring(0, 50)}..."`);
          return false;
        }
      }

      return true;
    });
  }, [notifications, platform, username, igBusinessId, propTwitterId, twitterId, facebookPageId]);

  // Auto-scroll to bottom when new notifications arrive - ENHANCED: Improved DM arrival detection and visibility
  useEffect(() => {
    if (validNotifications.length > 0 && scrollContainerRef.current) {
      // Check if we have new notifications
      const hasNewNotifications = validNotifications.length > lastNotificationCount;
      
      if (hasNewNotifications) {
        // Update the count
        setLastNotificationCount(validNotifications.length);
        
        // Check if user is at bottom
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // Precise threshold matching handleScroll
        
        if (!isAtBottom) {
          // User is not at bottom, set indicator for new items
          setHasNewItemsAtBottom(true);
        } else {
          // User is at bottom, auto-scroll to show new items completely with enhanced scrolling
          setTimeout(() => {
            if (scrollContainerRef.current) {
              const container = scrollContainerRef.current;
              // Multiple scroll attempts for better reliability
              const maxScroll = container.scrollHeight - container.clientHeight + 120; // Extra 120px for action buttons
              container.scrollTop = Math.max(0, maxScroll);
              
              // Follow up with smooth scroll
              setTimeout(() => {
                container.scrollTo({
                  top: container.scrollHeight + 150,
                  behavior: 'smooth'
                });
              }, 100);
            }
          }, 200); // Increased delay for DOM updates
        }
      }
    }
  }, [validNotifications, lastNotificationCount]);

  console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Dms_Comments render:`, {
    originalCount: notifications?.length || 0, 
    validCount: validNotifications.length,
    ownUsername: username,
    filteredOut: (notifications?.length || 0) - validNotifications.length,
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
    // 🛡️ DEFENSIVE CHECK: Don't reply to own notifications
    if (username && notif.username && notif.username.toLowerCase() === username.toLowerCase()) {
      console.warn(`[${platform.toUpperCase()}] 🛡️ BLOCKED attempt to reply to own notification from ${notif.username}`);
      setError('Cannot reply to your own messages');
      return;
    }
    
    if (!replyText[notif.message_id || notif.comment_id || '']) {
      setError('Please enter a reply message');
      return;
    }
    onReply(notif, replyText[notif.message_id || notif.comment_id || '']);
    setReplyText(prev => ({ ...prev, [notif.message_id || notif.comment_id || '']: '' }));
    setShowReplyInput(prev => ({ ...prev, [notif.message_id || notif.comment_id || '']: false }));
  };

  // 🛡️ DEFENSIVE WRAPPER: Handle AI reply with safety checks
  const handleReplyWithAI = (notif: Notification) => {
    // Don't AI reply to own notifications
    if (username && notif.username && notif.username.toLowerCase() === username.toLowerCase()) {
      console.warn(`[${platform.toUpperCase()}] 🛡️ BLOCKED attempt to AI reply to own notification from ${notif.username}`);
      setError('Cannot AI reply to your own messages');
      return;
    }
    
    // Call the parent's AI reply handler
    onReplyWithAI(notif);
  };

  const handleIgnore = (notif: Notification) => {
    onIgnore(notif);
  };

  const handleSendAIReply = async (notification: Notification) => {
    // 🛡️ DEFENSIVE CHECK: Don't AI reply to own notifications
    if (username && notification.username && notification.username.toLowerCase() === username.toLowerCase()) {
      console.warn(`[${platform.toUpperCase()}] 🛡️ BLOCKED attempt to AI reply to own notification from ${notification.username}`);
      setError('Cannot AI reply to your own messages');
      return;
    }
    
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
    
    // 🛡️ DEFENSIVE FILTER: Remove own notifications from auto-reply candidates
    const filteredForAutoReply = safeFilter(pendingNotifications, (notif: any) => {
      // Skip if this is our own notification
      if (username && notif.username) {
        const isOwnNotification = notif.username.toLowerCase() === username.toLowerCase() ||
                                 notif.username.replace(/^@/, '').toLowerCase() === username.replace(/^@/, '').toLowerCase();
        if (isOwnNotification) {
          console.log(`[${platform.toUpperCase()}] 🛡️ SKIPPING auto-reply to own notification from ${notif.username}`);
          return false;
        }
      }
      return true;
    });
    
    if (filteredForAutoReply.length === 0) {
      console.log(`[${platform.toUpperCase()}] No valid notifications to auto-reply after filtering`);
      return;
    }

    console.log(`[${platform.toUpperCase()}] Auto-replying to ${filteredForAutoReply.length} notifications (filtered from ${pendingNotifications.length} pending)`);

    try {
      // 🛑 STOP OPERATION: Just call parent's auto-reply function
      // Parent handles the state management
      await onAutoReplyAll(filteredForAutoReply);
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
            title="AI will reply to all pending Comments and Dms based on rule set and according to yours personalization."
          >
            {isAutoReplying ? 'Auto-Replying...' : `Auto-Reply All (${safeFilter(validNotifications, (n: any) => !n.status || n.status === 'pending').length})`}
          </button>
        </div>
      )}

      {validNotifications.length === 0 ? (
        <div className="no-notifications">You will receive new DMs and Comments here from now here</div>
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
                        onClick={() => handleReplyWithAI(notif)}
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

      {/* Scroll to bottom button - ENHANCED: For perfect DM visibility */}
      {showScrollBottom && validNotifications.length > 5 && (
        <button 
          className={`scroll-to-bottom-btn ${hasNewItemsAtBottom ? 'has-new-items' : ''}`}
          onClick={scrollToBottom}
          title={hasNewItemsAtBottom ? "New DMs available - Click to view" : "Scroll to bottom for new DMs"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {hasNewItemsAtBottom && (
            <div className="new-items-indicator">
              <span className="new-items-dot"></span>
            </div>
          )}
        </button>
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