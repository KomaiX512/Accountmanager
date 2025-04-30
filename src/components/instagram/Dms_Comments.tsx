import React, { useState } from 'react';
import './Dms_Comments.css';

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
  status: 'pending' | 'replied' | 'ignored' | 'sent';
}

interface DmsCommentsProps {
  notifications: Notification[];
  onReply: (notification: Notification, replyText: string) => void;
  onIgnore: (notification: Notification) => void;
  onRefresh: () => void;
}

const Dms_Comments: React.FC<DmsCommentsProps> = ({ notifications, onReply, onIgnore, onRefresh }) => {
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [sending, setSending] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<{ [key: string]: string }>({});

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

  // Filter for pending notifications
  const filteredNotifications = notifications.filter(notif => notif.status === 'pending' && (notif.type === 'message' || notif.type === 'comment'));

  return (
    <div className="dms-comments">
      <button
        onClick={() => {
          console.log(`[${new Date().toISOString()}] Manual refresh triggered`);
          onRefresh();
        }}
        className="refresh-button"
      >
        Refresh Notifications
      </button>
      {filteredNotifications.length === 0 ? (
        <p className="no-notifications">No pending notifications.</p>
      ) : (
        <ul className="notification-list">
          {filteredNotifications.map((notif, index) => (
            <li
              key={`${notif.type}-${notif.message_id || notif.comment_id}-${index}`}
              className="notification-item"
            >
              {notif.type === 'message' ? (
                <div>
                  <strong>Message</strong> from {notif.sender_id || 'Unknown'}: {notif.text}
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
                  </div>
                  {error[notif.message_id || ''] && (
                    <span className="error-message">{error[notif.message_id || '']}</span>
                  )}
                </div>
              ) : (
                <div>
                  <strong>Comment</strong> from @{notif.username || 'Unknown'} on post {notif.post_id || 'Unknown'}: {notif.text}
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
                  </div>
                  {error[notif.comment_id || ''] && (
                    <span className="error-message">{error[notif.comment_id || '']}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Dms_Comments;