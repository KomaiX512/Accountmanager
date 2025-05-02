import React, { useState, useEffect } from 'react';
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
  onReplyWithAI: (notification: Notification) => void;
  username: string;
  onIgnoreAIReply: (pair: any) => void;
}

const Dms_Comments: React.FC<DmsCommentsProps> = ({ notifications, onReply, onIgnore, onRefresh, onReplyWithAI, username, onIgnoreAIReply }) => {
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [sending, setSending] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<{ [key: string]: string }>({});
  const [aiReplies, setAIReplies] = useState<any[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorAI, setErrorAI] = useState<string | null>(null);

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

  useEffect(() => {
    if (!username) {
      console.warn('Dms_Comments: username prop is empty, skipping AI replies fetch');
      return;
    }
    setLoadingAI(true);
    setErrorAI(null);
    const url = `http://localhost:3000/ai-replies/${username}`;
    console.log('Fetching AI replies for username:', username, 'URL:', url);
    fetch(url)
      .then(res => {
        console.log('AI replies fetch status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('AI replies response:', data);
        setAIReplies(data);
      })
      .catch(err => {
        console.error('AI replies fetch error:', err);
        setErrorAI('Failed to load AI replies.');
      })
      .finally(() => setLoadingAI(false));
  }, [username]);

  // Filter for pending notifications
  const filteredNotifications = notifications.filter(notif => notif.status === 'pending' && (notif.type === 'message' || notif.type === 'comment'));

  // Helper to match notification to AI reply pair
  const getPairForNotif = (notif: Notification) => {
    if (!aiReplies || aiReplies.length === 0) return null;
    // Match only by type and message_id/comment_id (not text)
    return aiReplies.find(pair =>
      pair.type === (notif.type === 'message' ? 'dm' : 'comment') &&
      ((notif.type === 'message' && pair.request.message_id === notif.message_id) ||
       (notif.type === 'comment' && pair.request.comment_id === notif.comment_id))
    );
  };

  // Handler for ignoring AI reply pairs (remove only the selected pair)
  const handleIgnoreAIReply = async (pair: any) => {
    try {
      const res = await fetch(`http://localhost:3000/ignore-ai-reply/${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyKey: pair.replyKey, reqKey: pair.reqKey }),
      });
      if (res.ok) {
        setAIReplies(prev => prev.filter(p => p.replyKey !== pair.replyKey));
      } else {
        // Optionally show error
        alert('Failed to ignore AI reply.');
      }
    } catch (err) {
      alert('Failed to ignore AI reply.');
    }
  };

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
      {filteredNotifications.length === 0 && aiReplies.length === 0 ? (
        <p className="no-notifications">No pending notifications.</p>
      ) : (
        <ul className="notification-list">
          {filteredNotifications.map((notif, index) => {
            const pair = getPairForNotif(notif);
            if (pair) {
              // If reply exists, show only the pair with Ignore
              return (
                <li key={pair.replyKey} className="ai-reply-item">
                  <div className="ai-reply-question">
                    <span className="ai-reply-label">Q:</span> {pair.request.text}
                  </div>
                  <div className="ai-reply-answer">
                    <span className="ai-reply-label">AI:</span> {pair.reply.reply}
                  </div>
                  <button
                    className="ignore-button"
                    style={{ marginTop: 8, minWidth: 80 }}
                    onClick={() => handleIgnoreAIReply(pair)}
                  >
                    Ignore
                  </button>
                </li>
              );
            } else {
              // No reply yet, show normal notification
              return (
                <li
                  key={`${notif.type}-${notif.message_id || notif.comment_id}-${index}`}
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
                            disabled={sending[notif.message_id || '']}
                            title="Let AI Manager reply"
                          >
                            Reply with AI
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
                            disabled={sending[notif.comment_id || '']}
                            title="Let AI Manager reply"
                          >
                            Reply with AI
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
            }
          })}
        </ul>
      )}
      {/* AI Replies Section */}
      <div className="ai-replies-section">
        <h3 style={{ color: '#00ffcc', marginTop: 20, marginBottom: 10 }}>AI Answered</h3>
        {loadingAI ? (
          <div className="ai-replies-loading">Loading AI replies...</div>
        ) : errorAI ? (
          <div className="error-message">{errorAI}</div>
        ) : aiReplies.length === 0 ? (
          <div className="no-notifications">No AI replies yet.</div>
        ) : (
          <ul className="ai-replies-list">
            {aiReplies.map((pair, idx) => (
              <li key={pair.replyKey} className="ai-reply-item">
                <div className="ai-reply-question">
                  <span className="ai-reply-label">Q:</span> {pair.request.text}
                </div>
                <div className="ai-reply-answer">
                  <span className="ai-reply-label">AI:</span> {pair.reply.reply}
                </div>
                <button
                  className="ignore-button"
                  style={{ marginTop: 8, minWidth: 80 }}
                  onClick={() => onIgnoreAIReply(pair)}
                >
                  Ignore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Dms_Comments;