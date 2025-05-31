import React, { useState } from 'react';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import './TwitterCompose.css';
import { useTwitter } from '../../context/TwitterContext';

interface TwitterComposeProps {
  userId: string;
  onClose: () => void;
}

const TwitterCompose: React.FC<TwitterComposeProps> = ({ userId, onClose }) => {
  const { isConnected, userId: contextUserId } = useTwitter();
  const userIdToUse = userId || contextUserId;

  const [tweetText, setTweetText] = useState('');
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);

  const handleSubmit = async () => {
    if (!userIdToUse) {
      setError('Twitter connection required. Please connect your Twitter account.');
      return;
    }

    if (!tweetText.trim()) {
      setError('Please enter some text for your tweet.');
      return;
    }

    if (tweetText.length > 280) {
      setError('Tweet text exceeds 280 characters.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (scheduleDate) {
        // Schedule the tweet
        if (scheduleDate <= new Date()) {
          setError('Scheduled time must be in the future.');
          setIsSubmitting(false);
          return;
        }

        const response = await axios.post(`http://localhost:3000/schedule-tweet/${userIdToUse}`, {
          text: tweetText,
          scheduled_time: scheduleDate.toISOString()
        });

        if (response.data.success) {
          setIsScheduled(true);
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          setError('Failed to schedule tweet: ' + response.data.message);
        }
      } else {
        // Post immediately
        const response = await axios.post(`http://localhost:3000/post-tweet/${userIdToUse}`, {
          text: tweetText
        });

        if (response.data.success) {
          setIsScheduled(true);
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          setError('Failed to post tweet: ' + response.data.message);
        }
      }
    } catch (err: any) {
      console.error('Error posting/scheduling tweet:', err);
      let errorMessage = 'Failed to process tweet';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage += ': ' + err.message;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now;
  };

  if (isScheduled) {
    return (
      <motion.div
        className="twitter-compose-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="twitter-compose-container success"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="success-content">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00ffcc"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <h3>{scheduleDate ? 'Tweet Scheduled!' : 'Tweet Posted!'}</h3>
            <p>
              {scheduleDate 
                ? `Your tweet will be posted on ${scheduleDate.toLocaleString()}` 
                : 'Your tweet has been posted successfully!'}
            </p>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="twitter-compose-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="twitter-compose-container"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="twitter-compose-header">
          <h2>Compose Tweet</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {!userIdToUse ? (
          <div className="twitter-not-connected">
            <p>Connect your Twitter account to compose tweets.</p>
            <button
              type="button"
              onClick={onClose}
              className="twitter-btn disconnect"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="compose-content">
            <div className="tweet-input-section">
              <textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                placeholder="What's happening?"
                maxLength={280}
                className="tweet-textarea"
                disabled={isSubmitting}
                autoFocus
              />
              <div className="tweet-meta">
                <span className={`character-count ${tweetText.length > 260 ? 'warning' : tweetText.length > 280 ? 'error' : ''}`}>
                  {tweetText.length}/280
                </span>
              </div>
            </div>

            <div className="scheduling-section">
              <label className="schedule-label">
                <input
                  type="checkbox"
                  checked={scheduleDate !== null}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setScheduleDate(getMinDateTime());
                    } else {
                      setScheduleDate(null);
                    }
                  }}
                />
                Schedule for later
              </label>
              
              {scheduleDate && (
                <DatePicker
                  selected={scheduleDate}
                  onChange={(date: Date | null) => setScheduleDate(date)}
                  showTimeSelect
                  dateFormat="Pp"
                  minDate={getMinDateTime()}
                  className="schedule-input"
                  placeholderText="Select date and time"
                />
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="compose-actions">
              <button
                type="button"
                onClick={onClose}
                className="twitter-btn cancel"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !tweetText.trim() || tweetText.length > 280}
                className="twitter-btn primary"
              >
                {isSubmitting 
                  ? 'Processing...' 
                  : scheduleDate 
                    ? 'Schedule Tweet' 
                    : 'Post Tweet'
                }
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default TwitterCompose; 