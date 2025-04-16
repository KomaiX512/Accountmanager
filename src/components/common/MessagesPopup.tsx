import React, { useState, useEffect } from 'react';
import './MessagesPopup.css';
import { motion } from 'framer-motion';
import axios from 'axios';
import ErrorBoundary from '../ErrorBoundary';
import { saveFeedback } from '../../utils/FeedbackHandler';

interface MessagesPopupProps {
  username: string;
  onClose: () => void;
  setHasNewMessages: (value: boolean) => void;
}

const MessagesPopup: React.FC<MessagesPopupProps> = ({ username, onClose, setHasNewMessages }) => {
  const [recentResponses, setRecentResponses] = useState<{ key: string; data: any }[]>([]);
  const [viewedKeys, setViewedKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  // Fetch top 3 recent responses
  useEffect(() => {
    const fetchResponses = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get(`http://localhost:3000/responses/${username}`);
        const responses = response.data;
        if (responses.length > 0) {
          // Sort by response ID descending, take top 3
          const sorted = responses
            .sort((a: any, b: any) => {
              const aId = parseInt(a.key.match(/response_(\d+)\.json$/)?.[1] || '0');
              const bId = parseInt(b.key.match(/response_(\d+)\.json$/)?.[1] || '0');
              return bId - aId;
            })
            .slice(0, 3);
          setRecentResponses(sorted);
          // Update notification dot
          const unviewed = sorted.some((r: any) => !viewedKeys.includes(r.key));
          setHasNewMessages(unviewed);
        } else {
          setRecentResponses([]);
          setHasNewMessages(false);
        }
      } catch (error) {
        console.error('Error fetching responses:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchResponses();
  }, [username, viewedKeys, setHasNewMessages]);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Mark response as viewed
  const handleViewResponse = (key: string) => {
    if (!viewedKeys.includes(key)) {
      const newViewedKeys = [...viewedKeys, key];
      setViewedKeys(newViewedKeys);
      const unviewed = recentResponses.some(r => !newViewedKeys.includes(r.key));
      setHasNewMessages(unviewed);
    }
  };

  // Handle like
  const handleLike = (key: string) => {
    handleViewResponse(key);
    setToastMessage('Your enthusiasm lights up our path—thank you for the love!');
  };

  // Handle dislike and feedback submission
  const handleDislike = (key: string) => {
    handleViewResponse(key);
    setIsFeedbackOpen(key);
  };

  const handleFeedbackSubmit = async (key: string) => {
    if (!feedbackText.trim()) return;
    const result = await saveFeedback(username, key, feedbackText);
    setFeedbackText('');
    setIsFeedbackOpen(null);
    setToastMessage(
      result.success
        ? 'Your insights are a gift—we’re grateful for your feedback!'
        : 'Failed to submit feedback. Try again.'
    );
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp || isNaN(new Date(timestamp).getTime())) {
      return new Date().toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  };

  return (
    <ErrorBoundary>
      <motion.div
        className="messages-popup-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="messages-popup-content"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Manager’s Insights</h2>
          <div className="messages-list">
            {isLoading ? (
              <div className="loading">Loading messages...</div>
            ) : recentResponses.length === 0 ? (
              <p className="no-messages">No new insights yet. Your manager’s wisdom is on the way!</p>
            ) : (
              recentResponses.map((res) => (
                <motion.div
                  key={res.key}
                  className="message-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => handleViewResponse(res.key)}
                >
                  <div className="message-header">
                    <span className="message-id">
                      Response #{res.key.match(/response_(\d+)\.json$/)?.[1]}
                    </span>
                    <span className="message-timestamp">
                      {formatTimestamp(res.data.timestamp)}
                    </span>
                  </div>
                  <div className="message-content-wrapper">
                    <p className="message-intro">
                      Your strategy is poised for brilliance—here’s how to elevate it:
                    </p>
                    <p className="message-content">{res.data.response}</p>
                  </div>
                  <div className="message-actions">
                    <motion.button
                      className="like-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleLike(res.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00ffcc"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 22v-9h3V7a3 3 0 0 1 3-3h2l3 3v6h3l-8 8-6-6h3z" />
                      </svg>
                    </motion.button>
                    <motion.button
                      className="dislike-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDislike(res.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ff4444"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 2v9h-3v6a3 3 0 0 1-3 3h-2l-3-3v-6h-3l8-8 6 6h-3z" />
                      </svg>
                    </motion.button>
                  </div>
                  {!viewedKeys.includes(res.key) && <span className="new-badge">New</span>}
                </motion.div>
              ))
            )}
          </div>
          {isFeedbackOpen && (
            <motion.div
              className="feedback-canvas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h3>Share Your Thoughts</h3>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What didn’t resonate with this insight?"
                className="feedback-textarea"
              />
              <div className="feedback-actions">
                <motion.button
                  className="submit-feedback-button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleFeedbackSubmit(isFeedbackOpen)}
                  disabled={!feedbackText.trim()}
                >
                  Submit
                </motion.button>
                <motion.button
                  className="cancel-feedback-button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsFeedbackOpen(null)}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          )}
          <motion.button
            className="close-button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
          >
            Close
          </motion.button>
          {toastMessage && (
            <motion.div
              className="messages-toast"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00ffcc"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="toast-icon"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {toastMessage}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </ErrorBoundary>
  );
};

export default MessagesPopup;