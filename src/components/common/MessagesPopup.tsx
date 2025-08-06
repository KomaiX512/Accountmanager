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
  onOpenChat?: (messageContent: string, platform?: string) => void;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const MessagesPopup: React.FC<MessagesPopupProps> = ({ username, onClose, setHasNewMessages, onOpenChat, platform = 'instagram' }) => {
  const [recentResponses, setRecentResponses] = useState<{ key: string; data: any }[]>([]);
  const [viewedKeys, setViewedKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';

  useEffect(() => {
    const fetchResponses = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get(`/api/responses/${username}?platform=${platform}`);
        const responses = response.data;
        if (responses.length > 0) {
          const sorted = responses
            .sort((a: any, b: any) => {
              const aId = parseInt(a.key.match(/response_(\d+)\.json$/)?.[1] || '0');
              const bId = parseInt(b.key.match(/response_(\d+)\.json$/)?.[1] || '0');
              return bId - aId;
            })
            .slice(0, 3);
          setRecentResponses(sorted);
          const unviewed = sorted.some((r: any) => !viewedKeys.includes(r.key));
          setHasNewMessages(unviewed);
        } else {
          setRecentResponses([]);
          setHasNewMessages(false);
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setRecentResponses([]);
          setHasNewMessages(false);
        } else {
          setError('Failed to fetch AI insights.');
          setRecentResponses([]);
          setHasNewMessages(false);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchResponses();
  }, [username, viewedKeys, setHasNewMessages, platform]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleViewResponse = (key: string) => {
    if (!viewedKeys.includes(key)) {
      const newViewedKeys = [...viewedKeys, key];
      setViewedKeys(newViewedKeys);
      const unviewed = recentResponses.some(r => !newViewedKeys.includes(r.key));
      setHasNewMessages(unviewed);
    }
  };

  const handleOpenChat = (response: any) => {
    // Mark as viewed
    handleViewResponse(response.key);
    // Close the messages popup
    onClose();
    // Trigger chat modal with the response content and platform information
    if (onOpenChat) {
      onOpenChat(response.data.response, platform);
    }
  };

  const handleStartNewDiscussion = () => {
    // Close the messages popup
    onClose();
    // Open chat with empty content to start a new discussion
    if (onOpenChat) {
      onOpenChat('', platform);
    }
  };

  // Removed social interaction handlers - no longer needed

  const handleFeedbackSubmit = async (key: string) => {
    if (!feedbackText.trim()) return;
    const result = await saveFeedback(username, key, feedbackText);
    setFeedbackText('');
    setIsFeedbackOpen(null);
    setToastMessage(
      result.success
        ? 'Your insights are a gift - we are grateful for your feedback!'
        : 'Failed to submit feedback. Try again.'
    );
  };

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
          <div className="manager-chat-header">
            <svg 
              className="ai-chat-icon"
              xmlns="http://www.w3.org/2000/svg" 
              width="32" 
              height="32" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#00ffcc" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <path d="M8 9h8"/>
              <path d="M8 13h6"/>
            </svg>
            <h2>AI Manager Chat for {username} ({platformName})</h2>
          </div>
          
          <div className="messages-list">
            {isLoading ? (
              <div className="loading">Loading AI insights...</div>
            ) : error ? (
              <p className="error">{error}</p>
            ) : recentResponses.length === 0 ? (
              <div className="no-insights-container">
                <div className="ai-avatar">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="48" 
                    height="48" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="#00ffcc" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="5"/>
                    <path d="m9 9 1.5 1.5L16 6"/>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                    <path d="M3 5v14c0 1.1.9 2 2 2h14c0-1.1-.9-2-2-2V5"/>
                  </svg>
                </div>
                <h3>Ready to strategize your {platformName} success!</h3>
                <p className="ai-intro">
                  Your AI manager is here to help you create winning strategies, optimize content, 
                  and boost engagement on {platformName}. Let's start building your path to success!
                </p>
                <motion.button
                  className="start-discussion-btn"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStartNewDiscussion}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    <path d="M12 7v6"/>
                    <path d="M9 10h6"/>
                  </svg>
                  Start AI Discussion
                </motion.button>
              </div>
            ) : (
              <>
                <div className="recent-insights-header">
                  <h3>Recent AI Insights</h3>
                  <motion.button
                    className="new-discussion-btn"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStartNewDiscussion}
                  >
                    New Discussion
                  </motion.button>
                </div>
                {recentResponses.map((res) => (
                  <motion.div
                    key={res.key}
                    className="message-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => handleOpenChat(res)}
                  >
                    <div className="message-header">
                      <span className="message-id">
                        AI Insight #{res.key.match(/response_(\d+)\.json$/)?.[1]}
                      </span>
                      <span className="message-timestamp">
                        {formatTimestamp(res.data.timestamp)}
                      </span>
                    </div>
                    <div className="message-content-wrapper">
                      <p className="message-intro">
                        Your strategy is poised for brilliance - here's how to elevate it:
                      </p>
                      <p className="message-content">{res.data.response}</p>
                    </div>
                    {/* Removed social interaction buttons */}
                    {!viewedKeys.includes(res.key) && <span className="new-badge">New</span>}
                  </motion.div>
                ))}
              </>
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
                placeholder="What didn't resonate with this AI insight?"
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