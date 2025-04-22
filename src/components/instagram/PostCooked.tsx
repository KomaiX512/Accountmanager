import React, { useState, useEffect } from 'react';
import './PostCooked.css';
import { motion } from 'framer-motion';
import { saveFeedback } from '../../utils/FeedbackHandler';
import ErrorBoundary from '../ErrorBoundary';

interface PostCookedProps {
  username: string;
  profilePicUrl: string;
  posts?: { key: string; data: { post: any; status: string; image_url: string }; imageFailed?: boolean }[];
}

const PostCooked: React.FC<PostCookedProps> = ({ username, profilePicUrl, posts = [] }) => {
  const [imageErrors, setImageErrors] = useState<{ [key: string]: boolean }>({});
  const [profileImageError, setProfileImageError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  useEffect(() => {
    console.log('Posts prop in PostCooked:', posts);
  }, [posts]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleLike = (key: string) => {
    setToastMessage('Liked! Thanks for the love! ❤️');
  };

  const handleDislike = (key: string) => {
    setIsFeedbackOpen(key);
  };

  const handleComment = (key: string) => {
    setToastMessage('Comment feature coming soon! 📝');
  };

  const handleShare = (key: string) => {
    setToastMessage('Share feature coming soon! 📲');
  };

  const handleFeedbackSubmit = async (key: string) => {
    if (!feedbackText.trim() || !username) return;
    const result = await saveFeedback(username, key, feedbackText);
    setFeedbackText('');
    setIsFeedbackOpen(null);
    setToastMessage(
      result.success
        ? 'Feedback submitted—thanks for your input! 🙌'
        : 'Failed to submit feedback. Try again.'
    );
  };

  const handleImageError = (key: string, url: string) => {
    console.error(`Failed to load image for ${key}: ${url}`);
    setImageErrors(prev => ({ ...prev, [key]: true }));
  };

  if (!username) {
    return (
      <ErrorBoundary>
        <div className="post-cooked-container">
          <h2>Cooked Posts</h2>
          <p className="no-posts">No username provided. Please specify a username.</p>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="post-cooked-container">
        <h2>Cooked Posts</h2>
        {posts.length === 0 ? (
          <p className="no-posts">No posts ready yet. Stay tuned!</p>
        ) : (
          <div className="post-list">
            {posts.map((post) => (
              <motion.div
                key={post.key}
                className="post-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="post-content">
                  <div className="post-header">
                    {profilePicUrl && !profileImageError ? (
                      <>
                        {console.log('Rendering profilePicUrl in post:', profilePicUrl)}
                        <img
                          src={profilePicUrl}
                          alt={`${username}'s profile picture`}
                          className="profile-pic"
                          onError={() => {
                            console.error(`Failed to load profile picture for ${username} in post`);
                            setProfileImageError(true);
                          }}
                        />
                      </>
                    ) : (
                      <div className="profile-pic" />
                    )}
                    <span className="username">{username}</span>
                  </div>
                  {imageErrors[post.key] || !post.data.image_url ? (
                    <div className="post-image-placeholder">
                      Image unavailable
                    </div>
                  ) : (
                    <img
                      src={post.data.image_url}
                      alt="Post visual"
                      className="post-image"
                      onError={() => handleImageError(post.key, post.data.image_url)}
                    />
                  )}
                  <div className="post-actions">
                    <motion.button
                      className="like-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleLike(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#000000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </motion.button>
                    <motion.button
                      className="comment-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleComment(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#000000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </motion.button>
                    <motion.button
                      className="share-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleShare(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#000000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h1a4 4 0 0 0 0 8H2m16-8l-5 4m5-4l-5-4" />
                      </svg>
                    </motion.button>
                    <motion.button
                      className="dislike-button"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDislike(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ff4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 2v9h-3v6a3 3 0 0 1-3 3h-2l-3-3v-6h-3l8-8 6 6h-3z" />
                      </svg>
                    </motion.button>
                  </div>
                  <p className="post-caption">
                    <span className="username">{username}</span> {post.data.post?.caption || 'No caption available'}
                  </p>
                  <div className="post-hashtags">
                    {post.data.post?.hashtags?.length ? (
                      post.data.post.hashtags.map((tag: string, index: number) => (
                        <a
                          key={index}
                          href={`https://www.instagram.com/explore/tags/${tag.slice(1)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hashtag"
                        >
                          {tag}
                        </a>
                      ))
                    ) : (
                      <span>No hashtags available</span>
                    )}
                  </div>
                  <p className="post-cta">{post.data.post?.call_to_action || 'No call to action'}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
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
              placeholder="What didn’t vibe with this post?"
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
        {toastMessage && (
          <motion.div
            className="post-toast"
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
      </div>
    </ErrorBoundary>
  );
};

export default PostCooked;