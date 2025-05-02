import React, { useState, useEffect } from 'react';
import './PostCooked.css';
import { motion } from 'framer-motion';
import { saveFeedback } from '../../utils/FeedbackHandler';
import ErrorBoundary from '../ErrorBoundary';

interface PostCookedProps {
  username: string;
  profilePicUrl: string;
  posts?: { key: string; data: { post: any; status: string; image_url: string }; imageFailed?: boolean }[];
  userId?: string;
}

const PostCooked: React.FC<PostCookedProps> = ({ username, profilePicUrl, posts = [], userId }) => {
  const [imageErrors, setImageErrors] = useState<{ [key: string]: boolean }>({});
  const [profileImageError, setProfileImageError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [autoScheduleProgress, setAutoScheduleProgress] = useState<string | null>(null);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [intervalInput, setIntervalInput] = useState('');
  const [rejectedPosts, setRejectedPosts] = useState<string[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedPostKey, setSelectedPostKey] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');

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

  const handleScheduleClick = (key: string) => {
    const now = new Date();
    const defaultTime = new Date(now.getTime() + 60 * 1000); // 1 min in future
    setScheduleDateTime(defaultTime.toISOString().slice(0, 16));
    setSelectedPostKey(key);
    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = async () => {
    if (!selectedPostKey || !userId) {
      setToastMessage('No post or user ID selected.');
      return;
    }
    const post = posts.find(p => p.key === selectedPostKey);
    if (!post) {
      setToastMessage('Selected post not found.');
      return;
    }
    const scheduleTime = new Date(scheduleDateTime);
    const now = new Date();
    const minSchedule = new Date(now.getTime() + 60 * 1000);
    if (scheduleTime < minSchedule) {
      setToastMessage('Schedule time must be at least 1 minute in the future.');
      return;
    }
    // Fetch image
    let imageKey = '';
    if (post.data.image_url && post.data.image_url.includes('/ready_post/')) {
      const match = post.data.image_url.match(/ready_post\/[\w-]+\/(image_\d+\.jpg)/);
      if (match) imageKey = match[1];
    }
    if (!imageKey && post.key.match(/ready_post_\d+\.json$/)) {
      const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
      if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
    }
    if (!imageKey) {
      setToastMessage('Could not determine image for post.');
      return;
    }
    let signedImageUrl = '';
    try {
      const signedUrlRes = await fetch(`http://localhost:3000/signed-image-url/${username}/${imageKey}`);
      const signedUrlData = await signedUrlRes.json();
      signedImageUrl = signedUrlData.url;
      if (!signedImageUrl) throw new Error('No signed URL returned');
      console.log(`[Schedule] Got signed URL for post ${selectedPostKey}:`, signedImageUrl);
    } catch (err) {
      console.error(`[Schedule] Failed to get signed URL for post ${selectedPostKey}:`, err);
      setToastMessage('Failed to get image for post.');
      return;
    }
    // Fetch image as blob via proxy
    let imageBlob: Blob | null = null;
    try {
      const proxyUrl = `http://localhost:3000/proxy-image?url=${encodeURIComponent(signedImageUrl)}`;
      const imgRes = await fetch(proxyUrl);
      imageBlob = await imgRes.blob();
      console.log(`[Schedule] Image fetched for post ${selectedPostKey} via proxy`);
    } catch (e) {
      console.error(`[Schedule] Failed to fetch image for post ${selectedPostKey}:`, e);
      setToastMessage('Failed to fetch image for post.');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(imageBlob.type)) {
      console.error(`[Schedule] Image is not a valid JPEG/PNG, got: ${imageBlob.type}`);
      setToastMessage('Image is not a valid JPEG/PNG.');
      return;
    }
    // Compose caption
    let caption = post.data.post?.caption || '';
    console.log(`[Schedule] Original caption length: ${caption.length} chars`);
    if (caption.length > 2150) {
      console.warn(`[Schedule] Caption too long, truncating to 2150 chars.`);
      caption = caption.slice(0, 2150);
    }
    console.log(`[Schedule] Caption length after truncation: ${caption.length} chars`);
    const filename = `post_${selectedPostKey}.jpg`;
    const formData = new FormData();
    formData.append('image', imageBlob, filename);
    formData.append('caption', caption);
    formData.append('scheduleDate', scheduleTime.toISOString());
    try {
      console.log(`[Schedule] Sending schedule request for post ${selectedPostKey} to /schedule-post/${userId}`);
      const resp = await fetch(`http://localhost:3000/schedule-post/${userId}`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        console.error(`[Schedule] Failed to schedule post ${selectedPostKey}:`, errData.error || resp.statusText);
        setToastMessage(`Failed to schedule post: ${errData.error || 'Unknown server error'}`);
      } else {
        const respData = await resp.json().catch(() => ({}));
        console.log(`[Schedule] Scheduled post ${selectedPostKey} successfully:`, respData);
        setToastMessage('Your post is on schedule!');
        // Optionally remove post from view after scheduling
        setRejectedPosts(prev => [...prev, selectedPostKey]);
      }
    } catch (err) {
      console.error(`[Schedule] Error scheduling post ${selectedPostKey}:`, err.message);
      setToastMessage(`Error scheduling post: ${err.message}`);
    }
    setShowScheduleModal(false);
    setSelectedPostKey(null);
    setScheduleDateTime('');
  };

  const handleScheduleCancel = () => {
    setShowScheduleModal(false);
    setSelectedPostKey(null);
    setScheduleDateTime('');
  };

  const handleEdit = (key: string) => {
    console.log(`[Edit] Edit clicked for post ${key} (functionality to be implemented)`);
    setToastMessage('Edit feature coming soon!');
  };

  const handleReject = (key: string) => {
    setRejectedPosts(prev => [...prev, key]);
    setToastMessage('Post rejected and removed.');
  };

  // Fetch time delay from R2 bucket
  const fetchTimeDelay = async (): Promise<number> => {
    try {
      const res = await fetch(`http://localhost:3000/time-delay/${username}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const delay = parseInt(data?.Posting_Delay_Intervals);
      return isNaN(delay) ? 12 : delay;
    } catch (err) {
      console.warn(`[AutoSchedule] Failed to fetch time delay, using default 12 hours:`, err);
      return 12; // fallback
    }
  };

  // Auto-schedule logic
  const handleAutoSchedule = async (intervalOverride?: number) => {
    if (!userId || !posts.length) {
      setToastMessage('No user ID or posts to schedule.');
      return;
    }
    setAutoScheduling(true);
    setAutoScheduleProgress('Fetching time delay...');
    try {
      let delayHours: number;
      if (typeof intervalOverride === 'number' && !isNaN(intervalOverride) && intervalOverride > 0) {
        delayHours = intervalOverride;
      } else {
        delayHours = await fetchTimeDelay();
      }
      console.log('[AutoSchedule] Using delay (hours):', delayHours);
      setAutoScheduleProgress(`Scheduling posts every ${delayHours} hours...`);
      let now = new Date();
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        setAutoScheduleProgress(`Scheduling post ${i + 1} of ${posts.length}...`);
        console.log(`[AutoSchedule] Preparing post #${i + 1}:`, post);
        // Always fetch a fresh signed URL for the image
        let imageKey = '';
        if (post.data.image_url && post.data.image_url.includes('/ready_post/')) {
          const match = post.data.image_url.match(/ready_post\/[\w-]+\/(image_\d+\.jpg)/);
          if (match) imageKey = match[1];
        }
        if (!imageKey && post.key && post.key.match(/ready_post_\d+\.json$/)) {
          const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
          if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
        }
        if (!imageKey) {
          console.error(`[AutoSchedule] Could not determine imageKey for post #${i + 1}`);
          setToastMessage(`Could not determine image for post ${i + 1}`);
          continue;
        }
        let signedImageUrl = '';
        try {
          const signedUrlRes = await fetch(`http://localhost:3000/signed-image-url/${username}/${imageKey}`);
          const signedUrlData = await signedUrlRes.json();
          signedImageUrl = signedUrlData.url;
          if (!signedImageUrl) throw new Error('No signed URL returned');
          console.log(`[AutoSchedule] Got fresh signed URL for post #${i + 1}:`, signedImageUrl);
        } catch (err) {
          console.error(`[AutoSchedule] Failed to get signed URL for post #${i + 1}:`, err);
          setToastMessage(`Failed to get image for post ${i + 1}`);
          continue;
        }
        // Fetch image as blob via proxy
        let imageBlob: Blob | null = null;
        try {
          const proxyUrl = `http://localhost:3000/proxy-image?url=${encodeURIComponent(signedImageUrl)}`;
          console.log(`[AutoSchedule] Fetching image for post #${i + 1} via proxy:`, proxyUrl);
          const imgRes = await fetch(proxyUrl);
          imageBlob = await imgRes.blob();
          console.log(`[AutoSchedule] Image fetched for post #${i + 1} via proxy`);
        } catch (e) {
          console.error(`[AutoSchedule] Failed to fetch image for post #${i + 1} via proxy:`, e);
          setToastMessage(`Failed to fetch image for post ${i + 1}`);
          continue;
        }
        // Check image type before scheduling
        if (!['image/jpeg', 'image/png'].includes(imageBlob.type)) {
          console.error(`[AutoSchedule] Image for post #${i + 1} is not a valid JPEG/PNG, got: ${imageBlob.type}`);
          setToastMessage(`Image for post ${i + 1} is not a valid JPEG/PNG, skipping.`);
          continue;
        }
        // Compose caption (truncate to 2150 chars to be safe)
        let caption = post.data.post?.caption || '';
        console.log(`[AutoSchedule] Original caption length for post #${i + 1}: ${caption.length} chars`);
        if (caption.length > 2150) {
          console.warn(`[AutoSchedule] Caption too long for post #${i + 1}, truncating to 2150 chars.`);
          caption = caption.slice(0, 2150);
        }
        console.log(`[AutoSchedule] Caption length after truncation for post #${i + 1}: ${caption.length} chars`);
        // Set image filename and type
        const type = imageBlob.type || 'image/jpeg';
        const filename = `auto_post_${i + 1}.jpg`;
        // Schedule date: always at least 1 minute in the future for the first post
        let scheduleDate;
        if (i === 0) {
          const nowPlusBuffer = new Date(Date.now() + 60 * 1000); // 1 min buffer
          scheduleDate = nowPlusBuffer;
        } else {
          const prevDate = new Date(Date.now() + 60 * 1000 + (i * delayHours * 60 * 60 * 1000));
          scheduleDate = prevDate;
        }
        console.log(`[AutoSchedule] Scheduling post #${i + 1} at:`, scheduleDate.toISOString());
        const formData = new FormData();
        formData.append('image', imageBlob, filename);
        formData.append('caption', caption);
        formData.append('scheduleDate', scheduleDate.toISOString());
        try {
          console.log(`[AutoSchedule] Sending schedule request for post #${i + 1} to /schedule-post/${userId}`);
          const resp = await fetch(`http://localhost:3000/schedule-post/${userId}`, {
            method: 'POST',
            body: formData,
          });
          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            console.error(`[AutoSchedule] Failed to schedule post #${i + 1}:`, errData.error || resp.statusText);
            setToastMessage(`Failed to schedule post ${i + 1}: ${errData.error || 'Unknown server error'}`);
          } else {
            const respData = await resp.json().catch(() => ({}));
            console.log(`[AutoSchedule] Scheduled post #${i + 1} successfully:`, respData);
            setToastMessage(`Scheduled post ${i + 1} successfully!`);
          }
        } catch (err) {
          console.error(`[AutoSchedule] Error scheduling post #${i + 1}:`, err.message);
          setToastMessage(`Error scheduling post ${i + 1}: ${err.message}`);
        }
        // Wait a bit to avoid hammering the server
        await new Promise(res => setTimeout(res, 500));
      }
      setAutoScheduleProgress(null);
      setToastMessage('All posts scheduled!');
    } catch (err) {
      console.error('[AutoSchedule] Auto-scheduling failed:', err.message);
      setAutoScheduleProgress(null);
      setToastMessage(`Auto-scheduling failed: ${err.message}`);
    } finally {
      setAutoScheduling(false);
    }
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

  // Filter out rejected posts
  const filteredPosts = posts.filter(post => !rejectedPosts.includes(post.key));

  return (
    <ErrorBoundary>
      <div className="post-cooked-container">
        <h2>Cooked Posts</h2>
        {/* Auto-Schedule Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            className="insta-btn connect"
            style={{ background: userId && filteredPosts.length ? 'linear-gradient(90deg, #007bff, #00ffcc)' : '#4a4a6a', color: '#e0e0ff', cursor: userId && filteredPosts.length ? 'pointer' : 'not-allowed', borderRadius: 8, padding: '8px 16px', border: '1px solid #00ffcc' }}
            disabled={!userId || !filteredPosts.length || autoScheduling}
            onClick={() => setShowIntervalModal(true)}
          >
            {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
          </button>
        </div>
        {/* Interval Modal */}
        {showIntervalModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ background: '#23234a', borderRadius: 12, padding: 24, minWidth: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ color: '#e0e0ff', marginBottom: 8 }}>Set Auto-Schedule Interval</h3>
              <input
                type="number"
                min={1}
                step={1}
                value={intervalInput}
                onChange={e => setIntervalInput(e.target.value)}
                placeholder="Interval in hours (e.g. 12)"
                style={{ padding: 8, borderRadius: 6, border: '1px solid #00ffcc', fontSize: 16, marginBottom: 8 }}
                autoFocus
              />
              <div style={{ color: '#a0a0cc', fontSize: 14, marginBottom: 8 }}>
                Leave blank to let AI decide the interval automatically.
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  className="insta-btn disconnect"
                  onClick={() => { setShowIntervalModal(false); setIntervalInput(''); }}
                >Cancel</button>
                <button
                  className="insta-btn connect"
                  onClick={() => {
                    setShowIntervalModal(false);
                    const interval = intervalInput.trim() ? parseInt(intervalInput, 10) : undefined;
                    setIntervalInput('');
                    handleAutoSchedule(interval);
                  }}
                  disabled={autoScheduling}
                >Confirm</button>
              </div>
            </div>
          </div>
        )}
        {/* Schedule Modal */}
        {showScheduleModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="schedule-modal">
              <h3>Schedule Post</h3>
              <label style={{ color: '#e0e0ff', fontSize: '1rem', marginBottom: '8px' }}>
                Select Date and Time
              </label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={e => setScheduleDateTime(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #00ffcc', fontSize: 16, width: '100%', background: 'rgba(255, 255, 255, 0.05)', color: '#e0e0ff' }}
              />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  className="schedule-cancel-button"
                  onClick={handleScheduleCancel}
                >Cancel</button>
                <button
                  className="schedule-submit-button"
                  onClick={handleScheduleSubmit}
                  disabled={!scheduleDateTime}
                >Schedule</button>
              </div>
            </div>
          </div>
        )}
        {autoScheduleProgress && (
          <div className="loading">{autoScheduleProgress}</div>
        )}
        {filteredPosts.length === 0 ? (
          <p className="no-posts">No posts ready yet. Stay tuned!</p>
        ) : (
          <div className="post-list">
            {filteredPosts.map((post) => (
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
                  <div className="post-control-buttons">
                    <motion.button
                      className="schedule-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleScheduleClick(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Schedule
                    </motion.button>
                    <motion.button
                      className="edit-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleEdit(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </motion.button>
                    <motion.button
                      className="reject-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleReject(post.key)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ff4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                      Reject
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
              placeholder="What didn't vibe with this post?"
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