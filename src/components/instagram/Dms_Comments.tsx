import React, { useState, useRef, useEffect } from 'react';
import './Dms_Comments.css';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { useLinkedIn } from '../../context/LinkedInContext';
import { Notification } from '../../types/notifications';
import { safeFilter } from '../../utils/safeArrayUtils';

// Hook to fetch and cache sender usernames
const useSenderUsername = (senderId: string | undefined, platform: string) => {
  const [senderUsername, setSenderUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!senderId || platform !== 'instagram') {
      setSenderUsername(null);
      return;
    }

    const cachedUsername = localStorage.getItem(`sender_username_${senderId}`);
    if (cachedUsername) {
      // Don't display "not_found" cached values
      if (cachedUsername !== 'not_found') {
        setSenderUsername(cachedUsername);
      }
      return;
    }

    const fetchSenderUsername = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/instagram-sender-username/${senderId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(8000) // 8 second timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.username) {
            setSenderUsername(data.username);
            localStorage.setItem(`sender_username_${senderId}`, data.username);
          }
        } else if (response.status === 404) {
          console.log(`[Instagram] Sender username not found for ID: ${senderId}`);
          // Cache empty result to avoid repeated requests
          localStorage.setItem(`sender_username_${senderId}`, 'not_found');
        } else {
          console.warn(`[Instagram] Failed to fetch sender username: ${response.status}`);
        }
      } catch (error: any) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          console.log(`[Instagram] Timeout fetching sender username for ID: ${senderId}`);
        } else {
          console.error('Error fetching sender username:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSenderUsername();
  }, [senderId, platform]);

  return { senderUsername, loading };
};

// Component to display sender name with dynamic username fetching
const SenderNameDisplay: React.FC<{ 
  notification: Notification; 
  platform: string; 
}> = ({ notification, platform }) => {
  const { senderUsername, loading } = useSenderUsername(notification.sender_id, platform);
  
  // For Instagram DMs, use sender username if available, otherwise fall back to notification username
  if (platform === 'instagram' && notification.sender_id) {
    if (loading) {
      return <span className="sender-name loading">Loading...</span>;
    }
    return <span className="sender-name">{senderUsername || notification.username || 'Unknown User'}</span>;
  }
  
  // For other platforms or when no sender_id, use original logic
  return <span className="sender-name">{notification.username || 'Unknown User'}</span>;
};

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
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
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
  const { isConnected: isLinkedInConnected } = useLinkedIn();

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

      // Check for required fields - MADE MORE PERMISSIVE to allow legitimate notifications
      const hasRequiredFields = notif.type && 
                              (notif.message_id || notif.comment_id) && 
                              notif.text && // Just check text exists, not strict type checking
                              notif.timestamp; // Just check timestamp exists
      if (!hasRequiredFields) {
        console.warn(`[${new Date().toISOString()}] [${platform.toUpperCase()}] Notification missing required fields at index ${index}:`, {
          type: notif.type,
          hasMessageOrCommentId: !!(notif.message_id || notif.comment_id),
          hasText: !!notif.text,
          hasTimestamp: !!notif.timestamp
        });
        return false;
      }

      // 🛡️ DEFENSIVE FILTER: Exclude own replies/comments to prevent infinite loop
      // FOCUSED: Only filter exact matches for our own account to avoid false positives
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
        
        // REMOVED AGGRESSIVE PATTERN: Stop blocking notifications that contain our username
        // This was causing false positives where legitimate messages were blocked
      }

      // 🛡️ BUSINESS ID FILTER: Only filter if we have a clear match (platform-specific)
      if (platform === 'instagram' && connectedBusinessId && (notif.sender_id || notif.instagram_user_id)) {
        const notifSenderId = notif.sender_id || notif.instagram_user_id;
        if (notifSenderId === connectedBusinessId) {
          console.log(`[${new Date().toISOString()}] [INSTAGRAM] 🛡️ FILTERED OUT own message by business ID: ${notifSenderId} === ${connectedBusinessId}`);
          return false;
        } else {
          console.log(`[${new Date().toISOString()}] [INSTAGRAM] ✅ BUSINESS ID CHECK PASSED: ${notifSenderId} !== ${connectedBusinessId}`);
        }
      } else {
        console.log(`[${new Date().toISOString()}] [INSTAGRAM] ⏭️ BUSINESS ID CHECK SKIPPED: platform=${platform}, connectedBusinessId=${connectedBusinessId}, hasSenderId=${!!(notif.sender_id || notif.instagram_user_id)}`);
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

      // 🛡️ DISABLED AGGRESSIVE TEXT FILTERING: Allow all text patterns through
      // Backend already handles filtering effectively (63→3), frontend should be permissive
      // Only keeping basic own-username check above to prevent obvious self-replies
      console.log(`[${new Date().toISOString()}] [${platform.toUpperCase()}] ✅ NOTIFICATION PASSED ALL FILTERS:`, {
        username: notif.username,
        type: notif.type,
        sender_id: notif.sender_id,
        text_preview: notif.text?.substring(0, 30) + '...'
      });

      return true;
    });
  }, [notifications, platform, username, igBusinessId, propTwitterId, twitterId, facebookPageId]);

  // Unified Auto-Reply eligibility (used for both label and action)
  const autoReplyEligibleNotifications = React.useMemo(() => {
    return validNotifications.filter((n: any) => {
      const hasId = !!(n.message_id || n.comment_id);
      const isSupportedType = n.type === 'message' || n.type === 'comment';
      const isEligibleStatus = !n.status || n.status === 'pending' || n.status === 'ai_reply_ready';
      return hasId && isSupportedType && isEligibleStatus;
    });
  }, [validNotifications]);

  // DIAGNOSTICS: Provide hard-proof analysis of counts mismatch between header and Auto-Reply
  useEffect(() => {
    try {
      const totalIncoming = Array.isArray(notifications) ? notifications.length : 0;
      const validCount = validNotifications.length;
      const eligibleCount = autoReplyEligibleNotifications.length;

      const typeCountsAll: Record<string, number> = {};
      const typeCountsValid: Record<string, number> = {};
      const statusCountsValid: Record<string, number> = {};

      (Array.isArray(notifications) ? notifications : []).forEach((n: any) => {
        const t = (n?.type || 'unknown').toString();
        typeCountsAll[t] = (typeCountsAll[t] || 0) + 1;
      });

      validNotifications.forEach((n: any) => {
        const t = (n?.type || 'unknown').toString();
        const s = (n?.status || 'undefined').toString();
        typeCountsValid[t] = (typeCountsValid[t] || 0) + 1;
        statusCountsValid[s] = (statusCountsValid[s] || 0) + 1;
      });

      let excludedByType = 0;
      let excludedByStatus = 0;
      let excludedByMissingId = 0;
      const unsupportedTypeSamples: Array<{ id: string | undefined; type: string; status?: string; text?: string }> = [];

      const excludedSamples: Array<{ id: string | undefined; type: string; status?: string; hasId: boolean; text?: string; reason: string }>= [];

      validNotifications.forEach((n: any) => {
        const id = n.message_id || n.comment_id;
        const hasId = !!id;
        const isSupportedType = n.type === 'message' || n.type === 'comment';
        const isEligibleStatus = !n.status || n.status === 'pending' || n.status === 'ai_reply_ready';

        if (!hasId) {
          excludedByMissingId += 1;
          excludedSamples.push({ id, type: n.type, status: n.status, hasId, text: n.text?.slice(0, 80), reason: 'missing_id' });
          return;
        }
        if (!isSupportedType) {
          excludedByType += 1;
          if (unsupportedTypeSamples.length < 5) {
            unsupportedTypeSamples.push({ id, type: n.type, status: n.status, text: n.text?.slice(0, 80) });
          }
          excludedSamples.push({ id, type: n.type, status: n.status, hasId, text: n.text?.slice(0, 80), reason: 'unsupported_type' });
          return;
        }
        if (!isEligibleStatus) {
          excludedByStatus += 1;
          if (excludedSamples.length < 10) {
            excludedSamples.push({ id, type: n.type, status: n.status, hasId, text: n.text?.slice(0, 80), reason: 'ineligible_status' });
          }
          return;
        }
      });

      console.group(`[${new Date().toISOString()}] [${platform.toUpperCase()}] DM Eligibility Diagnostics`);
      console.log('Counts:', { totalIncoming, validAfterDefensiveFilter: validCount, eligibleForAutoReply: eligibleCount });
      console.log('Type counts (ALL incoming):', typeCountsAll);
      console.log('Type counts (VALID after filters):', typeCountsValid);
      console.log('Status counts (VALID after filters):', statusCountsValid);
      console.log('Exclusions among VALID ->', {
        byUnsupportedType: excludedByType,
        byIneligibleStatus: excludedByStatus,
        byMissingId: excludedByMissingId
      });
      if (unsupportedTypeSamples.length > 0) {
        console.log('Samples excluded due to unsupported type (only "message" and "comment" are eligible):', unsupportedTypeSamples);
      }
      if (excludedSamples.length > 0) {
        console.log('Sample excluded items with reasons:', excludedSamples.slice(0, 10));
      }
      console.groupEnd();
    } catch (e) {
      // No-op diagnostics failure
    }
  }, [notifications, validNotifications, autoReplyEligibleNotifications, platform]);

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
    eligibleCount: autoReplyEligibleNotifications.length,
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

    // Use the same eligibility used for the label to keep UI consistent
    const eligible = safeFilter(autoReplyEligibleNotifications, (notif: any) => {
      // Extra safety: Skip if this is our own notification (should already be filtered by validNotifications)
      if (username && notif.username) {
        const cleanNotif = notif.username.replace(/^@/, '').toLowerCase();
        const cleanOwn = username.replace(/^@/, '').toLowerCase();
        if (cleanNotif === cleanOwn) {
          console.log(`[${platform.toUpperCase()}] 🛡️ SKIPPING auto-reply to own notification from ${notif.username}`);
          return false;
        }
      }
      return true;
    });

    if (eligible.length === 0) {
      console.log(`[${platform.toUpperCase()}] No valid notifications to auto-reply after filtering`);
      return;
    }

    console.log(`[${platform.toUpperCase()}] Auto-replying to ${eligible.length} notifications`);

    try {
      await onAutoReplyAll(eligible);
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
    if (platform === 'linkedin' && !isLinkedInConnected) {
      return (
        <div className="not-connected-message">
          Please connect your LinkedIn account to view notifications
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
            {isAutoReplying ? 'Auto-Replying...' : `Auto-Reply All (${autoReplyEligibleNotifications.length})`}
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
                      <strong><SenderNameDisplay notification={notif} platform={platform || 'instagram'} /></strong>
                      <span className="page-tag">via {notif.page_name}</span>
                    </span>
                  ) : (
                    <strong><SenderNameDisplay notification={notif} platform={platform || 'instagram'} /></strong>
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