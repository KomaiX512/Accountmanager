import React, { useState } from 'react';
import './Dms_Comments.css';

interface Notification {
  type: 'message' | 'comment';
  instagram_user_id: string;
  sender_id?: string;
  message_id?: string;
  text: string;
  post_id?: string;
  comment_id?: string;
  timestamp: number;
  received_at: string;
}

interface DmsCommentsProps {
  notifications: Notification[];
  onReply: (messageId: string, replyText: string, senderId: string) => void;
}

const Dms_Comments: React.FC<DmsCommentsProps> = ({ notifications, onReply }) => {
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
    if (notif.type !== 'message' || !notif.sender_id || !notif.message_id) return;

    const text = replyText[notif.message_id] || '';
    if (!text.trim()) return;

    setSending({ ...sending, [notif.message_id]: true });
    setError({ ...error, [notif.message_id]: '' });

    onReply(notif.message_id, text, notif.sender_id);
    setReplyText({ ...replyText, [notif.message_id]: '' });
    setSending({ ...sending, [notif.message_id]: false });
  };

  return (
    <div className="dms-comments">
      {notifications.length === 0 ? (
        <p className="no-notifications">No notifications yet.</p>
      ) : (
        <ul className="notification-list">
          {notifications.map((notif, index) => (
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
                  </div>
                  {error[notif.message_id || ''] && (
                    <span className="error-message">{error[notif.message_id || '']}</span>
                  )}
                </div>
              ) : (
                <div>
                  <strong>Comment</strong> on post {notif.post_id || 'Unknown'}: {notif.text}
                  <span className="timestamp">{formatTimestamp(notif.timestamp)}</span>
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