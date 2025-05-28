import React, { useState, useEffect } from 'react';
import './Dms_Comments.css';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { Notification } from '../../types/notifications';

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
  aiRepliesRefreshKey?: number;
  onAIRefresh?: () => void;
  aiProcessingNotifications?: Record<string, boolean>;
  onSendAIReply?: (notification: Notification) => void;
  onIgnoreAIReply?: (notification: Notification) => void;
  platform?: 'instagram' | 'twitter';
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
  aiRepliesRefreshKey = 0, 
  onAIRefresh,
  aiProcessingNotifications = {},
  onSendAIReply,
  onIgnoreAIReply,
  platform = 'instagram'
}) => {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [showReplyInput, setShowReplyInput] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { userId: contextIgBusinessId, isConnected: isInstagramConnected } = useInstagram();
  const igBusinessId = propIgBusinessId || contextIgBusinessId;
  const { userId: twitterId } = useTwitter();

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
    return null;
  };

  if (renderNotConnectedMessage()) {
    return renderNotConnectedMessage();
  }

  return (
    <div className="dms-comments-container">
      {error && <div className="error-message">{error}</div>}
      {notifications.length === 0 ? (
        <div className="no-notifications">No new notifications</div>
      ) : (
        notifications.map((notif) => (
          <div key={notif.message_id || notif.comment_id} className="notification-item">
            <div className="notification-header">
              <span className="notification-type">
                {notif.type === 'message' ? 'DM' : 'Comment'} from {notif.username || 'Unknown'}
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