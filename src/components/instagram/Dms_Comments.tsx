import React from 'react';
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
}

const DmsComments: React.FC<DmsCommentsProps> = ({ notifications }) => {
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

export default DmsComments;
