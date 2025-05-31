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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    // Validate file size (Twitter limit is 5MB for images)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB.');
      return;
    }

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    setError(null);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleSubmit = async () => {
    if (!userIdToUse) {
      setError('Twitter connection required. Please connect your Twitter account.');
      return;
    }

    // Allow posting with just image or just text, but not empty
    if (!tweetText.trim() && !selectedImage) {
      setError('Please enter some text or select an image for your tweet.');
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

        if (selectedImage) {
          // Schedule tweet with image using FormData
          const formData = new FormData();
          formData.append('image', selectedImage);
          formData.append('text', tweetText.trim() || ''); // Always send text field, even if empty
          formData.append('scheduled_time', scheduleDate.toISOString());

          const response = await fetch(`http://localhost:3000/schedule-tweet-with-image/${userIdToUse}`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to schedule tweet with image');
          }

          const responseData = await response.json();
          if (responseData.success) {
            setIsScheduled(true);
            setTimeout(() => {
              onClose();
            }, 2000);
          } else {
            setError('Failed to schedule tweet: ' + responseData.message);
          }
        } else {
          // Schedule text-only tweet
          const response = await axios.post(`http://localhost:3000/schedule-tweet/${userIdToUse}`, {
            text: tweetText.trim()
          });

          if (response.data.success) {
            setIsScheduled(true);
            setTimeout(() => {
              onClose();
            }, 2000);
          } else {
            setError('Failed to schedule tweet: ' + response.data.message);
          }
        }
      } else {
        // Post immediately
        if (selectedImage) {
          // Post tweet with image using FormData
          const formData = new FormData();
          formData.append('image', selectedImage);
          formData.append('text', tweetText.trim() || ''); // Always send text field, even if empty

          const response = await fetch(`http://localhost:3000/post-tweet-with-image/${userIdToUse}`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to post tweet with image');
          }

          const responseData = await response.json();
          if (responseData.success) {
            setIsScheduled(true);
            setTimeout(() => {
              onClose();
            }, 2000);
          } else {
            setError('Failed to post tweet: ' + responseData.message);
          }
        } else {
          // Post text-only tweet
          const response = await axios.post(`http://localhost:3000/post-tweet/${userIdToUse}`, {
            text: tweetText.trim()
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

            {/* Image Upload Section */}
            <div className="image-upload-section">
              <label htmlFor="image-upload" className="image-upload-button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/>
                </svg>
                Add Image
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                disabled={isSubmitting}
              />
            </div>

            {/* Image Preview */}
            {imagePreview && (
              <div className="image-preview-section">
                <div className="image-preview-container">
                  <img src={imagePreview} alt="Tweet preview" className="image-preview" />
                  <button
                    type="button"
                    className="remove-image-button"
                    onClick={removeImage}
                    disabled={isSubmitting}
                  >
                    ×
                  </button>
                </div>
                <p className="image-info">
                  {selectedImage?.name} ({((selectedImage?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                </p>
              </div>
            )}

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
                disabled={isSubmitting || (!tweetText.trim() && !selectedImage) || tweetText.length > 280}
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