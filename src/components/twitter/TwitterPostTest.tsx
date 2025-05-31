import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './TwitterPostTest.css';

interface TwitterPostTestProps {
  twitterUserId?: string;
  className?: string;
}

const TwitterPostTest: React.FC<TwitterPostTestProps> = ({ twitterUserId, className = '' }) => {
  const [tweetText, setTweetText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string; tweet_id?: string } | null>(null);
  const { currentUser } = useAuth();

  const handlePostTweet = async () => {
    if (!twitterUserId) {
      setResult({ success: false, message: 'No Twitter user ID available. Please connect your Twitter account first.' });
      return;
    }

    if (!tweetText.trim()) {
      setResult({ success: false, message: 'Please enter some text for your tweet.' });
      return;
    }

    if (tweetText.length > 280) {
      setResult({ success: false, message: 'Tweet text exceeds 280 characters.' });
      return;
    }

    setIsPosting(true);
    setResult(null);

    try {
      console.log(`[${new Date().toISOString()}] Posting tweet: "${tweetText}"`);
      
      const response = await axios.post(`http://localhost:3000/post-tweet/${twitterUserId}`, {
        text: tweetText
      });

      if (response.data.success) {
        setResult({
          success: true,
          message: 'Tweet posted successfully!',
          tweet_id: response.data.tweet_id
        });
        setTweetText(''); // Clear the input
        console.log(`[${new Date().toISOString()}] Tweet posted successfully:`, response.data);
      } else {
        setResult({ success: false, message: 'Failed to post tweet: ' + response.data.message });
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error posting tweet:`, error);
      
      let errorMessage = 'Failed to post tweet';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
        if (error.response.data.details) {
          errorMessage += ': ' + error.response.data.details;
        }
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setResult({ success: false, message: errorMessage });
    } finally {
      setIsPosting(false);
    }
  };

  const handleScheduleTweet = async () => {
    if (!twitterUserId) {
      setResult({ success: false, message: 'No Twitter user ID available. Please connect your Twitter account first.' });
      return;
    }

    if (!tweetText.trim()) {
      setResult({ success: false, message: 'Please enter some text for your tweet.' });
      return;
    }

    if (!scheduledTime) {
      setResult({ success: false, message: 'Please select a time to schedule your tweet.' });
      return;
    }

    if (tweetText.length > 280) {
      setResult({ success: false, message: 'Tweet text exceeds 280 characters.' });
      return;
    }

    const scheduledDate = new Date(scheduledTime);
    if (scheduledDate <= new Date()) {
      setResult({ success: false, message: 'Scheduled time must be in the future.' });
      return;
    }

    setIsPosting(true);
    setResult(null);

    try {
      console.log(`[${new Date().toISOString()}] Scheduling tweet for ${scheduledDate.toISOString()}: "${tweetText}"`);
      
      const response = await axios.post(`http://localhost:3000/schedule-tweet/${twitterUserId}`, {
        text: tweetText,
        scheduled_time: scheduledDate.toISOString()
      });

      if (response.data.success) {
        setResult({
          success: true,
          message: `Tweet scheduled successfully for ${new Date(response.data.scheduled_time).toLocaleString()}!`
        });
        setTweetText(''); // Clear the input
        setScheduledTime(''); // Clear the scheduled time
        console.log(`[${new Date().toISOString()}] Tweet scheduled successfully:`, response.data);
      } else {
        setResult({ success: false, message: 'Failed to schedule tweet: ' + response.data.message });
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Error scheduling tweet:`, error);
      
      let errorMessage = 'Failed to schedule tweet';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
        if (error.response.data.details) {
          errorMessage += ': ' + error.response.data.details;
        }
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setResult({ success: false, message: errorMessage });
    } finally {
      setIsPosting(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Minimum 5 minutes from now
    return now.toISOString().slice(0, 16); // Format for datetime-local input
  };

  return (
    <div className={`twitter-post-test ${className}`}>
      <div className="twitter-post-header">
        <h3>Twitter Post Test</h3>
        {twitterUserId && (
          <p className="twitter-user-id">Connected User ID: {twitterUserId}</p>
        )}
      </div>

      <div className="tweet-composer">
        <div className="tweet-input-section">
          <textarea
            value={tweetText}
            onChange={(e) => setTweetText(e.target.value)}
            placeholder="What's happening?"
            maxLength={280}
            className="tweet-textarea"
            disabled={isPosting}
          />
          <div className="tweet-meta">
            <span className={`character-count ${tweetText.length > 260 ? 'warning' : tweetText.length > 280 ? 'error' : ''}`}>
              {tweetText.length}/280
            </span>
          </div>
        </div>

        <div className="scheduling-section">
          <label htmlFor="scheduled-time">Schedule for later (optional):</label>
          <input
            id="scheduled-time"
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            min={getMinDateTime()}
            className="schedule-input"
            disabled={isPosting}
          />
        </div>

        <div className="action-buttons">
          <button
            onClick={handlePostTweet}
            disabled={isPosting || !tweetText.trim() || tweetText.length > 280 || !twitterUserId}
            className="post-button"
          >
            {isPosting ? 'Posting...' : 'Post Now'}
          </button>

          <button
            onClick={handleScheduleTweet}
            disabled={isPosting || !tweetText.trim() || tweetText.length > 280 || !twitterUserId || !scheduledTime}
            className="schedule-button"
          >
            {isPosting ? 'Scheduling...' : 'Schedule Tweet'}
          </button>
        </div>

        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <p>{result.message}</p>
            {result.tweet_id && (
              <p className="tweet-link">
                <a 
                  href={`https://twitter.com/intent/tweet?in_reply_to=${result.tweet_id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  View on Twitter
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TwitterPostTest; 