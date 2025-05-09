import React, { useState, useEffect } from 'react';
import './Dms_Comments.css';
import { useInstagram } from '../../context/InstagramContext';

interface Notification {
  type: 'message' | 'comment' | 'reply' | 'comment_reply';
  instagram_user_id: string;
  sender_id?: string;
  message_id?: string;
  text: string;
  post_id?: string;
  comment_id?: string;
  timestamp: number;
  received_at: string;
  username?: string;
  status: 'pending' | 'replied' | 'ignored' | 'sent' | 'ai_handled' | 'ai_reply_ready';
  aiReply?: {
    reply: string;
    replyKey?: string;
    reqKey?: string;
    timestamp?: number;
    generated_at?: string;
    sendStatus?: 'sending' | 'sent' | 'error' | 'user-not-found' | 'network-error';
    sendError?: string;
  };
}

interface DmsCommentsProps {
  notifications: Notification[];
  onReply: (notification: Notification, replyText: string) => void;
  onIgnore: (notification: Notification) => void;
  onRefresh: () => void;
  onReplyWithAI: (notification: Notification) => void;
  username: string;
  refreshKey: number;
  igBusinessId?: string | null;
  aiRepliesRefreshKey?: number;
  onAIRefresh?: () => void;
  aiProcessingNotifications?: Record<string, boolean>;
  onSendAIReply?: (notification: Notification) => void;
  onIgnoreAIReply?: (notification: Notification) => void;
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
  aiRepliesRefreshKey = 0, 
  onAIRefresh,
  aiProcessingNotifications = {},
  onSendAIReply,
  onIgnoreAIReply
}) => {
  const { userId: contextUserId, isConnected } = useInstagram();
  const igBusinessId = propIgBusinessId || (isConnected ? contextUserId : null);

  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [sending, setSending] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<{ [key: string]: string }>({});
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorAI, setErrorAI] = useState<string | null>(null);
  const [sentAI, setSentAI] = useState<{ [replyKey: string]: boolean }>({});

  console.log('DmsComments username:', username);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleReply = (notif: Notification) => {
    const id = notif.message_id || notif.comment_id || '';
    const text = replyText[id] || '';
    if (!text.trim() || (!notif.message_id && !notif.comment_id)) return;

    setSending({ ...sending, [id]: true });
    setError({ ...error, [id]: '' });

    onReply(notif, text);
    setReplyText({ ...replyText, [id]: '' });
    setSending({ ...sending, [id]: false });
  };

  const handleIgnore = (notif: Notification) => {
    if (!notif.message_id && !notif.comment_id) return;

    const id = notif.message_id || notif.comment_id || '';
    setSending({ ...sending, [id]: true });
    onIgnore(notif);
    setSending({ ...sending, [id]: false });
  };

  // Handle sending an AI reply from notification
  const handleSendAIReply = async (notification: Notification) => {
    if (!notification.aiReply || !notification.aiReply.reply || !onSendAIReply) return;
    
    const notifId = notification.message_id || notification.comment_id || '';
    if (!notifId) return;
    
    setSending({ ...sending, [notifId]: true });
    
    try {
      // Call parent component to handle sending
      await onSendAIReply(notification);
      console.log(`[${new Date().toISOString()}] Successfully sent AI reply for ${notifId}`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error sending AI reply:`, err);
      setError({ ...error, [notifId]: 'Failed to send AI reply' });
    } finally {
      setSending({ ...sending, [notifId]: false });
    }
  };

  // Handle ignoring an AI reply
  const handleIgnoreAIReply = (notification: Notification) => {
    if (!notification.aiReply || !onIgnoreAIReply) return;
    
    // Call parent component to handle ignoring
    onIgnoreAIReply(notification);
  };

  const renderNotConnectedMessage = () => {
    if (!igBusinessId) {
      return (
        <div className="instagram-not-connected">
          <p>Connect your Instagram account to manage direct messages and comments.</p>
        </div>
      );
    }
    return null;
  };

  // Count notifications with AI replies ready to send
  const aiRepliesCount = notifications.filter(notif => 
    notif.aiReply && notif.status === 'ai_reply_ready'
  ).length;

  // Sort notifications to show AI replies at the top
  const sortedNotifications = [...notifications].sort((a, b) => {
    // First priority: Show AI replies at top
    if (a.aiReply && !b.aiReply) return -1;
    if (!a.aiReply && b.aiReply) return 1;
    
    // Second priority: Sort by timestamp, newest first
    return b.timestamp - a.timestamp;
  });

  return (
    <div className="dms-comments">
      <div className="notifications-header">
        <button
          onClick={() => {
            console.log(`[${new Date().toISOString()}] Manual refresh triggered`);
            onRefresh();
            if (onAIRefresh) onAIRefresh();
          }}
          className="refresh-button"
          disabled={!igBusinessId}
        >
          Refresh Notifications
        </button>
        
        {aiRepliesCount > 0 && (
          <div className="ai-replies-counter">
            <span>{aiRepliesCount} AI {aiRepliesCount === 1 ? 'reply' : 'replies'} ready</span>
          </div>
        )}
      </div>
      
      {renderNotConnectedMessage()}
      
      {!igBusinessId ? null : (
        sortedNotifications.length === 0 ? (
          <p className="no-notifications">No pending notifications.</p>
        ) : (
          <ul className="notification-list">
            {sortedNotifications.map((notif, index) => {
              const notifId = notif.message_id || notif.comment_id || '';
              
              // Notification with AI reply ready to be sent or reviewed
              if (notif.aiReply) {
                return (
                  <li key={`ai-${notifId}-${index}`} className="notification-item ai-reply-item">
                    <div className="notification-header">
                      <strong>{notif.type === 'message' ? 'Message' : 'Comment'}</strong> from {notif.username || notif.sender_id || 'Unknown'}
                      <span className="timestamp">{formatTimestamp(notif.timestamp)}</span>
                    </div>
                    
                    <div className="notification-content">
                      <p>{notif.text}</p>
                    </div>
                    
                    <div className="ai-reply-section">
                      <div className="ai-reply-answer">
                        <span className="ai-reply-label">AI Reply:</span> {notif.aiReply.reply}
                      </div>
                      
                      <div className="ai-reply-actions">
                        {notif.status === 'ai_reply_ready' && (
                          <>
                            <button
                              onClick={() => handleSendAIReply(notif)}
                              className="send-ai-button"
                              disabled={sending[notifId] || !igBusinessId}
                            >
                              {sending[notifId] ? 'Sending...' : 'Send Reply'}
                            </button>
                            <button
                              onClick={() => handleIgnoreAIReply(notif)}
                              className="ignore-button"
                              disabled={sending[notifId]}
                            >
                              Ignore
                            </button>
                          </>
                        )}
                        
                        {notif.aiReply.sendStatus === 'sent' && (
                          <span className="ai-reply-status sent">Sent as {notif.type === 'message' ? 'DM' : 'Reply'}</span>
                        )}
                        
                        {notif.aiReply.sendStatus === 'user-not-found' && (
                          <span className="ai-reply-status error">Cannot send: user not found</span>
                        )}
                        
                        {(notif.aiReply.sendStatus === 'error' || notif.aiReply.sendStatus === 'network-error') && (
                          <span className="ai-reply-status error">{notif.aiReply.sendError || 'Error sending'}</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              }
              
              // Regular notification
              return (
                <li
                  key={`${notif.type}-${notifId}-${index}`}
                  className="notification-item"
                >
                  {notif.type === 'message' ? (
                    <div>
                      <strong>Message</strong> from {notif.username || notif.sender_id || 'Unknown'}: {notif.text}
                      <span className="timestamp">{formatTimestamp(notif.timestamp)}</span>
                      <div className="reply-container">
                        <input
                          type="text"
                          value={replyText[notif.message_id || ''] || ''}
                          onChange={(e) =>
                            setReplyText({ ...replyText, [notif.message_id || '']: e.target.value })
                          }
                          placeholder="Type your reply..."
                          className="reply-input"
                          disabled={sending[notif.message_id || '']}
                        />
                        <div className="reply-actions">
                          <button
                            onClick={() => handleReply(notif)}
                            className="reply-button"
                            disabled={sending[notif.message_id || ''] || !replyText[notif.message_id || '']?.trim()}
                          >
                            {sending[notif.message_id || ''] ? 'Sending...' : 'Reply'}
                          </button>
                          <button
                            onClick={() => handleIgnore(notif)}
                            className="ignore-button"
                            disabled={sending[notif.message_id || '']}
                          >
                            {sending[notif.message_id || ''] ? 'Ignoring...' : 'Ignore'}
                          </button>
                          <button
                            onClick={() => onReplyWithAI(notif)}
                            className="ai-reply-button"
                            disabled={sending[notif.message_id || ''] || 
                                      aiProcessingNotifications[notif.message_id || '']}
                            title="Let AI Manager reply"
                          >
                            {aiProcessingNotifications[notif.message_id || ''] 
                              ? 'AI Processing...' 
                              : 'Reply with AI'}
                          </button>
                        </div>
                      </div>
                      {error[notif.message_id || ''] && (
                        <span className="error-message">{error[notif.message_id || '']}</span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <strong>Comment</strong> from @{notif.username || notif.sender_id || 'Unknown'} on post {notif.post_id || 'Unknown'}: {notif.text}
                      <span className="timestamp">{formatTimestamp(notif.timestamp)}</span>
                      <div className="reply-container">
                        <input
                          type="text"
                          value={replyText[notif.comment_id || ''] || ''}
                          onChange={(e) =>
                            setReplyText({ ...replyText, [notif.comment_id || '']: e.target.value })
                          }
                          placeholder="Type your reply..."
                          className="reply-input"
                          disabled={sending[notif.comment_id || '']}
                        />
                        <div className="reply-actions">
                          <button
                            onClick={() => handleReply(notif)}
                            className="reply-button"
                            disabled={sending[notif.comment_id || ''] || !replyText[notif.comment_id || '']?.trim()}
                          >
                            {sending[notif.comment_id || ''] ? 'Sending...' : 'Reply'}
                          </button>
                          <button
                            onClick={() => handleIgnore(notif)}
                            className="ignore-button"
                            disabled={sending[notif.comment_id || '']}
                          >
                            {sending[notif.comment_id || ''] ? 'Ignoring...' : 'Ignore'}
                          </button>
                          <button
                            onClick={() => onReplyWithAI(notif)}
                            className="ai-reply-button"
                            disabled={sending[notif.comment_id || ''] || 
                                      aiProcessingNotifications[notif.comment_id || '']}
                            title="Let AI Manager reply"
                          >
                            {aiProcessingNotifications[notif.comment_id || ''] 
                              ? 'AI Processing...' 
                              : 'Reply with AI'}
                          </button>
                        </div>
                      </div>
                      {error[notif.comment_id || ''] && (
                        <span className="error-message">{error[notif.comment_id || '']}</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
};

export default Dms_Comments;