import React, { useState, useEffect } from 'react';
import './PostCooked.css';
import { motion } from 'framer-motion';
import { saveFeedback } from '../../utils/FeedbackHandler';
import ErrorBoundary from '../ErrorBoundary';
import CanvasEditor from '../common/CanvasEditor';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import TwitterRequiredButton from '../common/TwitterRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import axios from 'axios';

interface PostCookedProps {
  username: string;
  profilePicUrl: string;
  posts?: { key: string; data: { post: any; status: string; image_url: string; r2_image_url?: string }; imageFailed?: boolean }[];
  userId?: string;
  platform?: 'instagram' | 'twitter';
}

// Define an interface for image error state
interface ImageErrorState {
  failed: boolean;
  retryCount: number;
}

const PostCooked: React.FC<PostCookedProps> = ({ username, profilePicUrl, posts = [], userId: propUserId, platform = 'instagram' }) => {
  const { isConnected: isInstagramConnected, userId: instagramUserId } = useInstagram();
  const { isConnected: isTwitterConnected, userId: twitterUserId } = useTwitter();
  
  // Determine platform-specific values
  const isConnected = platform === 'twitter' ? isTwitterConnected : isInstagramConnected;
  const contextUserId = platform === 'twitter' ? twitterUserId : instagramUserId;
  const userId = propUserId || (isConnected ? (contextUserId ?? undefined) : undefined);

  const [localPosts, setLocalPosts] = useState<typeof posts>([]);
  const [imageErrors, setImageErrors] = useState<{ [key: string]: ImageErrorState }>({});
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
  const [showCanvasEditor, setShowCanvasEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<{ key: string; imageUrl: string; caption: string } | null>(null);
  const [editingCaption, setEditingCaption] = useState<{ key: string; caption: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    console.log('Posts prop in PostCooked:', posts);
    setLocalPosts(posts);
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
    
    // Try to reload a few times with timestamp before giving up
    const retryCount = imageErrors[key] ? imageErrors[key].retryCount || 0 : 0;
    
    if (retryCount < 3) {
      // Try again with a cache-busting timestamp
      const img = new Image();
      const newUrl = `${url}?t=${Date.now()}&retry=${retryCount + 1}`;
      
      img.onload = () => {
        // Image loaded successfully on retry
        const updatedErrors = {...imageErrors};
        delete updatedErrors[key];
        setImageErrors(updatedErrors);
        
        // Force a refresh
        setLocalPosts(prev => [...prev]);
      };
      
      img.onerror = () => {
        // Still failing, increment retry count
        setImageErrors(prev => ({
          ...prev,
          [key]: { 
            failed: true,
            retryCount: retryCount + 1
          }
        }));
        
        // If this is a retry of the r2_image_url, try falling back to the regular image_url
        const post = localPosts.find(p => p.key === key);
        if (post && post.data.r2_image_url && post.data.image_url && url.includes(post.data.r2_image_url)) {
          console.log(`[ImageError] R2 image failed, trying regular image URL for ${key}`);
          // Find the post in the local posts array
          const postIndex = localPosts.findIndex(p => p.key === key);
          if (postIndex >= 0) {
            // Create a copy of the post without the r2_image_url to force using the regular image_url
            const updatedPost = {
              ...localPosts[postIndex],
              data: {
                ...localPosts[postIndex].data,
                r2_image_url: undefined // Clear the r2_image_url to force using image_url
              }
            };
            
            // Update the posts array
            const updatedPosts = [...localPosts];
            updatedPosts[postIndex] = updatedPost;
            setLocalPosts(updatedPosts);
            
            // Reset error state for this image
            const updatedErrors = {...imageErrors};
            delete updatedErrors[key];
            setImageErrors(updatedErrors);
          }
        }
      };
      
      img.src = newUrl;
    } else {
      // Max retries reached, mark as permanently failed
      setImageErrors(prev => ({ 
        ...prev, 
        [key]: { 
          failed: true,
          retryCount: retryCount
        }
      }));
      
      // Check if we're already trying the fallback URL
      const post = localPosts.find(p => p.key === key);
      if (post && post.data.r2_image_url && url.includes(post.data.r2_image_url)) {
        console.log(`[ImageError] R2 image permanently failed, trying fallback for ${key}`);
        // Try the fallback image path
        const fallbackUrl = `/r2-images/${username}/fallback.jpg`;
        
        // Try loading the fallback image
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          console.log(`[ImageError] Fallback image loaded successfully for ${key}`);
          // Update the post to use the fallback image
          const postIndex = localPosts.findIndex(p => p.key === key);
          if (postIndex >= 0) {
            const updatedPost = {
              ...localPosts[postIndex],
              data: {
                ...localPosts[postIndex].data,
                r2_image_url: fallbackUrl
              }
            };
            
            const updatedPosts = [...localPosts];
            updatedPosts[postIndex] = updatedPost;
            setLocalPosts(updatedPosts);
            
            // Reset error state for this image
            const updatedErrors = {...imageErrors};
            delete updatedErrors[key];
            setImageErrors(updatedErrors);
          }
        };
        
        fallbackImg.onerror = () => {
          console.error(`[ImageError] Even fallback image failed for ${key}`);
        };
        
        fallbackImg.src = fallbackUrl;
      }
    }
  };

  // Enhanced image placeholder component
  const ImagePlaceholder = ({ postKey }: { postKey: string }) => {
    const retryImage = () => {
      // Reset error state for this image
      const updatedErrors = {...imageErrors};
      delete updatedErrors[postKey];
      setImageErrors(updatedErrors);
      
      // Force refresh
      setLocalPosts(prev => [...prev]);
    };
    
    return (
      <div className="post-image-placeholder">
        <div className="placeholder-content">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e0e0ff"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p>Image unavailable</p>
          <button
            className="retry-image-button"
            onClick={retryImage}
          >
            Retry
          </button>
        </div>
      </div>
    );
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
    const post = localPosts.find(p => p.key === selectedPostKey);
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

    try {
      console.log(`[Schedule] Updating post status to scheduled for ${selectedPostKey}`);
      const statusUpdateResponse = await fetch(`http://localhost:3000/update-post-status/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postKey: selectedPostKey, status: 'scheduled' }),
      });

      if (!statusUpdateResponse.ok) {
        const errorData = await statusUpdateResponse.json().catch(() => ({}));
        console.error(`[Schedule] Failed to update post status to scheduled for ${selectedPostKey}:`, errorData.error || statusUpdateResponse.statusText);
        setToastMessage('Failed to mark post as scheduled persistently, but attempting to schedule anyway.');
      } else {
        console.log(`[Schedule] Successfully updated post status to scheduled for ${selectedPostKey}`);
        setRejectedPosts(prev => [...prev, selectedPostKey]);
      }
    } catch (err: any) {
      console.error(`[Schedule] Error calling update-post-status endpoint for ${selectedPostKey}:`, err);
      setToastMessage('Network error marking post as scheduled, but attempting to schedule anyway.');
    }

    if (platform === 'twitter') {
      // For Twitter, handle text-only scheduling
      const caption = post.data.post?.caption || '';
      console.log(`[Schedule] Scheduling Twitter post for ${selectedPostKey}: "${caption}"`);
      
      if (caption.length > 280) {
        setToastMessage('Tweet text exceeds 280 characters.');
        return;
      }
      
      try {
        const response = await axios.post(`http://localhost:3000/schedule-tweet/${userId}`, {
          text: caption.trim(),
          scheduled_time: scheduleTime.toISOString()
        });

        if (response.data.success) {
          setToastMessage('Your tweet is scheduled!');
        } else {
          setToastMessage('Failed to schedule tweet: ' + response.data.message);
        }
      } catch (err: any) {
        console.error(`[Schedule] Error scheduling tweet for ${selectedPostKey}:`, err.message);
        setToastMessage(`Error scheduling tweet: ${err.response?.data?.error || err.message}`);
      }
    } else {
      // Instagram scheduling logic (existing)
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
      } catch (err: any) {
        console.error(`[Schedule] Failed to get signed URL for post ${selectedPostKey}:`, err);
        setToastMessage('Failed to get image for post.');
        return;
      }
      let imageBlob: Blob | null = null;
      try {
        const proxyUrl = `http://localhost:3000/proxy-image?url=${encodeURIComponent(signedImageUrl)}`;
        const imgRes = await fetch(proxyUrl);
        imageBlob = await imgRes.blob();
        console.log(`[Schedule] Image fetched for post ${selectedPostKey} via proxy`);
      } catch (e: any) {
        console.error(`[Schedule] Failed to fetch image for post ${selectedPostKey}:`, e);
        setToastMessage('Failed to fetch image for post.');
        return;
      }
      if (!['image/jpeg', 'image/png'].includes(imageBlob.type)) {
        console.error(`[Schedule] Image is not a valid JPEG/PNG, got: ${imageBlob.type}`);
        setToastMessage('Image is not a valid JPEG/PNG.');
        return;
      }
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
        }
      } catch (err: any) {
        console.error(`[Schedule] Error scheduling post ${selectedPostKey}:`, err.message);
        setToastMessage(`Error scheduling post: ${err.message}`);
      }
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

  const handleEdit = async (key: string) => {
    console.log(`[Edit] Edit clicked for post ${key}`);
    const post = localPosts.find(p => p.key === key);
    if (!post) {
      setToastMessage('Post not found.');
      return;
    }

    let imageKey = '';
    if (post.data.image_url && post.data.image_url.includes('/ready_post/')) {
      const match = post.data.image_url.match(/ready_post\/[\w-]+\/(image_\d+\.jpg)/);
      if (match) imageKey = match[1];
    }
    if (!imageKey && post.key.match(/ready_post_\d+\.json$/)) {
      const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
      if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
    }

    try {
      const signedUrlRes = await fetch(`http://localhost:3000/signed-image-url/${username}/${imageKey}`);
      const signedUrlData = await signedUrlRes.json();
      const signedImageUrl = signedUrlData.url;
      
      if (!signedImageUrl) {
        throw new Error('No signed URL returned');
      }

      setEditingPost({
        key: key,
        imageUrl: signedImageUrl,
        caption: post.data.post?.caption || ''
      });
      
      setShowCanvasEditor(true);
    } catch (err) {
      console.error('[Edit] Failed to get signed URL:', err);
      setToastMessage('Failed to prepare image for editing.');
    }
    setScheduleDateTime('');
  };

  const handleCanvasClose = () => {
    setShowCanvasEditor(false);
    setEditingPost(null);
  };

  const handleReject = async (key: string) => {
    console.log(`[Reject] Reject clicked for post ${key}`);
    setRejectedPosts(prev => [...prev, key]);
    setToastMessage('Post rejected and removed.');

    try {
      const response = await fetch(`http://localhost:3000/update-post-status/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postKey: key, status: 'rejected' }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[Reject] Failed to update post status in backend for ${key}:`, errorData.error || response.statusText);
      } else {
        console.log(`[Reject] Successfully updated post status to rejected for ${key}`);
      }
    } catch (err) {
      console.error(`[Reject] Error calling update-post-status endpoint for ${key}:`, err);
    }
  };

  const fetchTimeDelay = async (): Promise<number> => {
    try {
      const res = await fetch(`http://localhost:3000/time-delay/${username}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const delay = parseInt(data?.Posting_Delay_Intervals);
      return isNaN(delay) ? 12 : delay;
    } catch (err) {
      console.warn(`[AutoSchedule] Failed to fetch time delay, using default 12 hours:`, err);
      return 12;
    }
  };

  const handleAutoSchedule = async (intervalOverride?: number) => {
    if (!userId || !localPosts.length) {
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
      setAutoScheduleProgress(`Scheduling ${platform === 'twitter' ? 'tweets' : 'posts'} every ${delayHours} hours...`);
      let now = new Date();
      
      for (let i = 0; i < localPosts.length; i++) {
        const post = localPosts[i];
        setAutoScheduleProgress(`Scheduling ${platform === 'twitter' ? 'tweet' : 'post'} ${i + 1} of ${localPosts.length}...`);
        console.log(`[AutoSchedule] Preparing ${platform} post #${i + 1}:`, post);
        
        if (platform === 'twitter') {
          // Twitter auto-scheduling logic
          const caption = post.data.post?.caption || '';
          console.log(`[AutoSchedule] Twitter caption for post #${i + 1}: "${caption}"`);
          
          if (caption.length > 280) {
            console.warn(`[AutoSchedule] Tweet text too long for post #${i + 1}, truncating to 280 chars.`);
            const truncatedCaption = caption.slice(0, 280);
            
            let scheduleDate;
            if (i === 0) {
              const nowPlusBuffer = new Date(Date.now() + 60 * 1000);
              scheduleDate = nowPlusBuffer;
            } else {
              const prevDate = new Date(Date.now() + 60 * 1000 + (i * delayHours * 60 * 60 * 1000));
              scheduleDate = prevDate;
            }
            
            console.log(`[AutoSchedule] Scheduling tweet #${i + 1} at:`, scheduleDate.toISOString());
            
            try {
              const response = await axios.post(`http://localhost:3000/schedule-tweet/${userId}`, {
                text: truncatedCaption,
                scheduled_time: scheduleDate.toISOString()
              });

              if (response.data.success) {
                console.log(`[AutoSchedule] Scheduled tweet #${i + 1} successfully:`, response.data);
                setToastMessage(`Scheduled tweet ${i + 1} successfully!`);
              } else {
                console.error(`[AutoSchedule] Failed to schedule tweet #${i + 1}:`, response.data.message);
                setToastMessage(`Failed to schedule tweet ${i + 1}: ${response.data.message}`);
              }
            } catch (err: any) {
              console.error(`[AutoSchedule] Error scheduling tweet #${i + 1}:`, err.message);
              setToastMessage(`Error scheduling tweet ${i + 1}: ${err.response?.data?.error || err.message}`);
            }
          } else {
            let scheduleDate;
            if (i === 0) {
              const nowPlusBuffer = new Date(Date.now() + 60 * 1000);
              scheduleDate = nowPlusBuffer;
            } else {
              const prevDate = new Date(Date.now() + 60 * 1000 + (i * delayHours * 60 * 60 * 1000));
              scheduleDate = prevDate;
            }
            
            console.log(`[AutoSchedule] Scheduling tweet #${i + 1} at:`, scheduleDate.toISOString());
            
            try {
              const response = await axios.post(`http://localhost:3000/schedule-tweet/${userId}`, {
                text: caption.trim(),
                scheduled_time: scheduleDate.toISOString()
              });

              if (response.data.success) {
                console.log(`[AutoSchedule] Scheduled tweet #${i + 1} successfully:`, response.data);
                setToastMessage(`Scheduled tweet ${i + 1} successfully!`);
              } else {
                console.error(`[AutoSchedule] Failed to schedule tweet #${i + 1}:`, response.data.message);
                setToastMessage(`Failed to schedule tweet ${i + 1}: ${response.data.message}`);
              }
            } catch (err: any) {
              console.error(`[AutoSchedule] Error scheduling tweet #${i + 1}:`, err.message);
              setToastMessage(`Error scheduling tweet ${i + 1}: ${err.response?.data?.error || err.message}`);
            }
          }
        } else {
          // Instagram auto-scheduling logic (existing)
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
          if (!['image/jpeg', 'image/png'].includes(imageBlob.type)) {
            console.error(`[AutoSchedule] Image for post #${i + 1} is not a valid JPEG/PNG, got: ${imageBlob.type}`);
            setToastMessage(`Image for post ${i + 1} is not a valid JPEG/PNG, skipping.`);
            continue;
          }
          let caption = post.data.post?.caption || '';
          console.log(`[AutoSchedule] Original caption length for post #${i + 1}: ${caption.length} chars`);
          if (caption.length > 2150) {
            console.warn(`[AutoSchedule] Caption too long for post #${i + 1}, truncating to 2150 chars.`);
            caption = caption.slice(0, 2150);
          }
          console.log(`[AutoSchedule] Caption length after truncation for post #${i + 1}: ${caption.length} chars`);
          const type = imageBlob.type || 'image/jpeg';
          const filename = `auto_post_${i + 1}.jpg`;
          let scheduleDate;
          if (i === 0) {
            const nowPlusBuffer = new Date(Date.now() + 60 * 1000);
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
          } catch (err: any) {
            console.error(`[AutoSchedule] Error scheduling post #${i + 1}:`, err.message);
            setToastMessage(`Error scheduling post ${i + 1}: ${err.message}`);
          }
        }
        
        await new Promise(res => setTimeout(res, 500));
      }
      setAutoScheduleProgress(null);
      setToastMessage(`All ${platform === 'twitter' ? 'tweets' : 'posts'} scheduled!`);
    } catch (err: any) {
      console.error('[AutoSchedule] Auto-scheduling failed:', err.message);
      setAutoScheduleProgress(null);
      setToastMessage(`Auto-scheduling failed: ${err.message}`);
    } finally {
      setAutoScheduling(false);
    }
  };

  const handleCloseEditCaption = () => {
    setEditingCaption(null);
  };

  const handleSaveCaption = async (key: string, newCaption: string) => {
    const postIndex = localPosts.findIndex(p => p.key === key);
    if (postIndex === -1) {
      setToastMessage('Post not found.');
      return;
    }

    const updatedPosts = [...localPosts];
    
    const updatedPost = {
      ...updatedPosts[postIndex],
      data: {
        ...updatedPosts[postIndex].data,
        post: {
          ...updatedPosts[postIndex].data.post,
          caption: newCaption
        }
      }
    };
    
    updatedPosts[postIndex] = updatedPost;
    
    setLocalPosts(updatedPosts);
    setEditingCaption(null);
    setToastMessage('Caption updated successfully!');
  };

  const handleEditCaption = (key: string) => {
    const post = localPosts.find(p => p.key === key);
    if (!post) {
      setToastMessage('Post not found.');
      return;
    }
    
    setEditingCaption({
      key: key,
      caption: post.data.post?.caption || ''
    });
  };

  const handleRefreshPosts = async () => {
    if (!username) return;
    
    setIsRefreshing(true);
    setToastMessage('Refreshing posts...');
    
    try {
      const platformParam = platform ? `&platform=${platform}` : '';
      const response = await axios.get(`http://localhost:3000/posts/${username}?forceRefresh=true${platformParam}`);
      setLocalPosts(response.data);
      setToastMessage('Posts refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing posts:', error);
      setToastMessage('Failed to refresh posts. Please try again.');
    } finally {
      setIsRefreshing(false);
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

  const filteredPosts = localPosts.filter(post => !rejectedPosts.includes(post.key));

  return (
    <ErrorBoundary>
      <div className="post-cooked-container">
        <div className="post-cooked-header">
          <h2>Cooked Posts</h2>
          <button 
            className="refresh-button"
            onClick={handleRefreshPosts}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <div className="refresh-spinner"></div>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            )}
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          {platform === 'twitter' ? (
            <TwitterRequiredButton
              onClick={() => setShowIntervalModal(true)}
              className="twitter-btn connect"
              disabled={!filteredPosts.length || autoScheduling}
              style={{ 
                background: 'linear-gradient(90deg, #1da1f2, #00acee)', 
                color: '#ffffff', 
                cursor: filteredPosts.length ? 'pointer' : 'not-allowed', 
                borderRadius: 8, 
                padding: '8px 16px', 
                border: '1px solid #1da1f2',
                opacity: filteredPosts.length ? 1 : 0.5
              }}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </TwitterRequiredButton>
          ) : (
            <InstagramRequiredButton
              onClick={() => setShowIntervalModal(true)}
              className="insta-btn connect"
              disabled={!filteredPosts.length || autoScheduling}
              style={{ 
                background: 'linear-gradient(90deg, #007bff, #00ffcc)', 
                color: '#e0e0ff', 
                cursor: filteredPosts.length ? 'pointer' : 'not-allowed', 
                borderRadius: 8, 
                padding: '8px 16px', 
                border: '1px solid #00ffcc',
                opacity: filteredPosts.length ? 1 : 0.5
              }}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </InstagramRequiredButton>
          )}
        </div>
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
        {showCanvasEditor && editingPost && (
          <CanvasEditor
            username={username}
            userId={userId}
            onClose={handleCanvasClose}
            initialImageUrl={editingPost.imageUrl}
            postKey={editingPost.key}
            postCaption={editingPost.caption}
            platform={platform}
          />
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
                      <img
                        src={profilePicUrl}
                        alt={`${username}'s profile picture`}
                        className="profile-pic"
                        onError={() => {
                          console.error(`Failed to load profile picture for ${username} in post`);
                          setProfileImageError(true);
                        }}
                      />
                    ) : (
                      <div className="profile-pic" />
                    )}
                    <span className="username">{username}</span>
                  </div>
                  {post.key in imageErrors || !post.data.image_url ? (
                    <ImagePlaceholder postKey={post.key} />
                  ) : (
                    <img
                      src={(post.data.r2_image_url || post.data.image_url) + `?t=${Date.now()}`} // Use r2_image_url if available, falling back to image_url
                      alt="Post visual"
                      className="post-image"
                      onError={() => handleImageError(post.key, post.data.r2_image_url || post.data.image_url)}
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
                    {platform === 'twitter' ? (
                      <TwitterRequiredButton
                        isConnected={!!userId}
                        onClick={() => handleScheduleClick(post.key)}
                        className="schedule-button"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '5px', 
                          backgroundColor: '#1da1f2', 
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                        notificationPosition="bottom"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Schedule
                      </TwitterRequiredButton>
                    ) : (
                      <InstagramRequiredButton
                        isConnected={!!userId}
                        onClick={() => handleScheduleClick(post.key)}
                        className="schedule-button"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '5px', 
                          backgroundColor: '#007bff', 
                          color: '#e0e0ff',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                        notificationPosition="bottom"
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
                      </InstagramRequiredButton>
                    )}
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
                  <div className="post-caption">
                    <span className="username">{username}</span>{' '}
                    {editingCaption && editingCaption.key === post.key ? (
                      <div className="caption-edit-container">
                        <textarea
                          value={editingCaption.caption}
                          onChange={(e) => setEditingCaption({...editingCaption, caption: e.target.value})}
                          className="caption-edit-textarea"
                          placeholder="Edit caption..."
                        />
                        <div className="caption-edit-actions">
                          <button 
                            className="caption-save-button"
                            onClick={() => handleSaveCaption(post.key, editingCaption.caption)}
                          >
                            Save
                          </button>
                          <button 
                            className="caption-cancel-button"
                            onClick={handleCloseEditCaption}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.data.post?.caption || 'No caption available'}
                        <button 
                          className="caption-edit-icon" 
                          onClick={() => handleEditCaption(post.key)}
                          title="Edit caption"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#00ffcc"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
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