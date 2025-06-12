import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './PostCooked.css';
import { motion } from 'framer-motion';
import { saveFeedback } from '../../utils/FeedbackHandler';
import ErrorBoundary from '../ErrorBoundary';
import CanvasEditor from '../common/CanvasEditor';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import TwitterRequiredButton from '../common/TwitterRequiredButton';
import FacebookRequiredButton from '../common/FacebookRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { schedulePost, fetchImageFromR2, extractImageKey } from '../../utils/scheduleHelpers';
import axios from 'axios';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography,
  useTheme
} from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { BsLightbulb } from 'react-icons/bs';
import { FaBell } from 'react-icons/fa';
// Missing modules - comment out until they're available
// import EditCaption from '../common/EditCaption';
// import { ScheduleItem } from '../../types/schedule';

// Type definition for ScheduleItem as a temporary replacement
interface ScheduleItem {
  id: string;
  postKey: string;
  scheduledTime: Date;
  status: 'pending' | 'posted' | 'failed';
  platform: string;
  username: string;
}

interface PostCookedProps {
  username: string;
  profilePicUrl: string;
  posts?: { key: string; data: { post: any; status: string; image_url: string; r2_image_url?: string }; imageFailed?: boolean }[];
  userId?: string;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

// Define an interface for image error state
interface ImageErrorState {
  failed: boolean;
  retryCount: number;
}

// Base URL for all API requests
const API_BASE_URL = 'http://localhost:3000';

const PostCooked: React.FC<PostCookedProps> = ({ username, profilePicUrl, posts = [], userId: propUserId, platform = 'instagram' }) => {
  const { isConnected: isInstagramConnected, userId: instagramUserId } = useInstagram();
  const { isConnected: isTwitterConnected, userId: twitterUserId } = useTwitter();
  const { isConnected: isFacebookConnected, userId: facebookUserId } = useFacebook();
  
  // Determine platform-specific values
  const isConnected = platform === 'twitter' ? isTwitterConnected : platform === 'facebook' ? isFacebookConnected : isInstagramConnected;
  const contextUserId = platform === 'twitter' ? twitterUserId : platform === 'facebook' ? facebookUserId : instagramUserId;
  const userId = propUserId || (isConnected ? (contextUserId ?? undefined) : undefined);

  const [localPosts, setLocalPosts] = useState<typeof posts>([]);
  const [imageErrors, setImageErrors] = useState<{ [key: string]: ImageErrorState }>({});
  const [profileImageError, setProfileImageError] = useState(false);
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(new Date());
  const [scheduleKeyToPost, setScheduleKeyToPost] = useState<string | null>(null);
  const [editCaptionOpen, setEditCaptionOpen] = useState(false);
  const [editCaptionKey, setEditCaptionKey] = useState<string | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [dialogPostKey, setDialogPostKey] = useState<string | null>(null);
  const [interval, setInterval] = useState<number>(180);
  const [showPostNowModal, setShowPostNowModal] = useState(false);
  const [selectedPostForPosting, setSelectedPostForPosting] = useState<any>(null);
  const [isPosting, setIsPosting] = useState(false);

  // Viewed posts tracking with localStorage persistence 
  const getViewedStorageKey = () => `${platform}_viewed_posts_${username}`;
  
  const [viewedPosts, setViewedPosts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(getViewedStorageKey());
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // Helper function to get unseen count
  const getUnseenPostsCount = () => {
    return localPosts.filter(post => !viewedPosts.has(post.key)).length;
  };

  // Function to mark posts as viewed
  const markPostsAsViewed = () => {
    const newViewedPosts = new Set(localPosts.map(p => p.key));
    setViewedPosts(newViewedPosts);
    localStorage.setItem(getViewedStorageKey(), JSON.stringify(Array.from(newViewedPosts)));
  };

  // Auto-mark posts as viewed when container is in view
  useEffect(() => {
    if (localPosts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setTimeout(() => {
              if (entry.isIntersecting && getUnseenPostsCount() > 0) {
                markPostsAsViewed();
              }
            }, 3000); // Mark as viewed after 3 seconds of viewing
          }
        });
      },
      { threshold: 0.5 }
    );

    const container = document.querySelector('.post-cooked-container');
    if (container) {
      observer.observe(container);
    }

    return () => observer.disconnect();
  }, [localPosts, viewedPosts]);

  // Update viewed set when new posts arrive
  useEffect(() => {
    const currentViewed = localStorage.getItem(getViewedStorageKey());
    if (currentViewed) {
      setViewedPosts(new Set(JSON.parse(currentViewed)));
    }
  }, [localPosts]);

  useEffect(() => {
    console.log('Posts prop in PostCooked:', posts);
    setLocalPosts(posts);
    
    // REAL-TIME INITIALIZATION: Auto-refresh on mount to ensure fresh data
    if (username && posts.length === 0) {
      console.log('[PostCooked] Auto-refreshing for real-time data on mount');
      setTimeout(() => handleRefreshPosts(), 500);
    }
  }, [posts, username]);

  // AUTO-REFRESH: Set up periodic refresh for new posts created in post mode
  useEffect(() => {
    if (!username) return;

         let refreshInterval: number;
     let lastPostCount = localPosts.length;

     // Check for new posts every 3 seconds when in active use
     const checkForNewPosts = async () => {
       try {
         const response = await axios.get(`${API_BASE_URL}/posts/${username}?platform=${platform}&nocache=${Date.now()}`, {
           headers: {
             'Cache-Control': 'no-cache, no-store, must-revalidate',
             'Pragma': 'no-cache'
           },
           timeout: 5000 // Quick timeout for background checks
         });

         const newPostCount = response.data.length;
         
         // If we have new posts, update immediately
         if (newPostCount > lastPostCount) {
           console.log(`[PostCooked] AUTO-REFRESH: New posts detected! ${lastPostCount} → ${newPostCount}`);
           setLocalPosts(response.data);
           setToastMessage('✨ New post arrived! PostCooked module refreshed automatically.');
           lastPostCount = newPostCount;
         }
       } catch (error: any) {
         // Silently handle errors for background refresh to avoid spam
         console.log('[PostCooked] Background refresh failed (silent):', error.message);
       }
     };

     // Start periodic checking
     refreshInterval = window.setInterval(checkForNewPosts, 3000);

    // Also listen for custom events from post creation
    const handleNewPostEvent = (event: CustomEvent) => {
      const { username: eventUsername, platform: eventPlatform } = event.detail;
      
      if (eventUsername === username && eventPlatform === platform) {
        console.log('[PostCooked] NEW POST EVENT: Refreshing immediately');
        setTimeout(() => handleRefreshPosts(), 1000); // Small delay to allow server processing
      }
    };

    window.addEventListener('newPostCreated', handleNewPostEvent as EventListener);

         // Cleanup
     return () => {
       if (refreshInterval) window.clearInterval(refreshInterval);
       window.removeEventListener('newPostCreated', handleNewPostEvent as EventListener);
     };
  }, [username, platform, localPosts.length]);

  // State for forcing image refresh
  const [imageRefreshKey, setImageRefreshKey] = useState(0);

  // Listen for post updates from Canvas Editor
  useEffect(() => {
    const handlePostUpdate = (event: CustomEvent) => {
      const { postKey, platform: updatedPlatform, timestamp } = event.detail;
      
      if (updatedPlatform === platform) {
        console.log(`[PostCooked] INSTANT UPDATE for ${postKey}`);
        setToastMessage('✅ Image updated instantly!');
        
        // INSTANT METHOD: Force all images to reload with cache busting
        const now = Date.now();
        const postIndex = localPosts.findIndex(p => p.key === postKey);
        
        if (postIndex >= 0) {
          // Extract image identifier
          let imageId = '';
          const match = postKey.match(/ready_post_(\d+)\.json$/);
          if (match) imageId = match[1];
          
          // Create super cache-busted URL
          const cacheBust = `?platform=${platform}&INSTANT=${now}&edited=true&v=${Math.random()}&force=1`;
          const freshUrl = `${API_BASE_URL}/api/r2-image/${username}/image_${imageId}.jpg${cacheBust}`;
          
          // Update ONLY the edited post instantly
          setLocalPosts(prev => {
            const updated = [...prev];
            updated[postIndex] = {
              ...updated[postIndex],
              data: {
                ...updated[postIndex].data,
                image_url: freshUrl,
                r2_image_url: freshUrl
              }
            };
            return updated;
          });
          
          // Force React re-render
          setImageRefreshKey(now);
          
          console.log(`[PostCooked] ⚡ INSTANT REFRESH: ${freshUrl}`);
        }
      }
    };

    window.addEventListener('postUpdated', handlePostUpdate as EventListener);
    return () => window.removeEventListener('postUpdated', handlePostUpdate as EventListener);
  }, [platform, localPosts, username]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // CACHE OPTIMIZATION: Get optimized image URL for a post
  const getCachedImageUrl = useCallback((post: any) => {
    const postKey = post.key;
    let imageId = '';
    const match = postKey.match(/ready_post_(\d+)\.json$/);
    if (match) imageId = match[1];
    
    // Generate URL with minimal cache busting and platform parameter
    const cacheBust = imageRefreshKey > 0 
      ? `&refresh=${imageRefreshKey}`
      : '';
    
    return `${API_BASE_URL}/api/r2-image/${username}/image_${imageId}.jpg?platform=${platform}${cacheBust}`;
  }, [imageRefreshKey, username, platform]);

  // PERFORMANCE: Handle image load success
  const handleImageLoad = useCallback((postKey: string) => {
    setLoadingImages(prev => {
      const newSet = new Set(prev);
      newSet.delete(postKey);
      return newSet;
    });
  }, []);

  // PERFORMANCE: Handle image load start
  const handleImageLoadStart = useCallback((postKey: string) => {
    setLoadingImages(prev => new Set([...prev, postKey]));
  }, []);

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
    
    // First check if this is the problematic narsissist image
    if (url.includes('narsissist') && url.includes('image_1749203937329.jpg')) {
      console.log(`[ImageError] Detected problematic narsissist image - using direct proxy`);
      
      // Update the post to use our direct proxy
      const postIndex = localPosts.findIndex(p => p.key === key);
      if (postIndex >= 0) {
        const updatedPost = {
          ...localPosts[postIndex],
          data: {
            ...localPosts[postIndex].data,
            image_url: `${API_BASE_URL}/fix-image/narsissist/image_1749203937329.jpg?platform=${platform}`,
            r2_image_url: `${API_BASE_URL}/fix-image/narsissist/image_1749203937329.jpg?platform=${platform}`
          }
        };
        
        const updatedPosts = [...localPosts];
        updatedPosts[postIndex] = updatedPost;
        setLocalPosts(updatedPosts);
        
        // Reset error state for this image
        const updatedErrors = {...imageErrors};
        delete updatedErrors[key];
        setImageErrors(updatedErrors);
        
        return;
      }
    }
    
    // Check if this is any R2 URL that should be proxied
    const isR2Url = url.includes('r2.cloudflarestorage.com') || 
                    url.includes('r2.dev') ||
                    url.includes('tasks.b21d96e73b908d7d7b822d41516ccc64') ||
                    url.includes('pub-ba72672df3c041a3844f278dd3c32b22');
    
    if (isR2Url) {
      console.log(`[ImageError] Detected R2 URL, using our proxy server`);
      
      // Extract filename from URL
      let filename = '';
      const urlParts = url.split('/');
      for (let i = 0; i < urlParts.length; i++) {
        if (urlParts[i].includes('.jpg')) {
          filename = urlParts[i].split('?')[0]; // Remove query params
          break;
        }
      }
      
      if (filename) {
        // Update the post to use our proxy
        const postIndex = localPosts.findIndex(p => p.key === key);
        if (postIndex >= 0) {
          const updatedPost = {
            ...localPosts[postIndex],
            data: {
              ...localPosts[postIndex].data,
              image_url: `${API_BASE_URL}/fix-image/${username}/${filename}?platform=${platform}`,
              r2_image_url: `${API_BASE_URL}/fix-image/${username}/${filename}?platform=${platform}`
            }
          };
          
          const updatedPosts = [...localPosts];
          updatedPosts[postIndex] = updatedPost;
          setLocalPosts(updatedPosts);
          
          // Reset error state for this image
          const updatedErrors = {...imageErrors};
          delete updatedErrors[key];
          setImageErrors(updatedErrors);
          
          return;
        }
      }
    }
    
    // Try to reload a few times with timestamp before giving up
    const retryCount = imageErrors[key] ? imageErrors[key].retryCount || 0 : 0;
    
    // Use our proxy server for the retry
    if (retryCount < 3) {
      // Try again with a cache-busting timestamp
      const img = new Image();
      
      // Create a proxied URL
      let newUrl = url;
      if (url.includes('r2.cloudflarestorage.com') || url.includes('r2.dev')) {
        // Extract filename if possible
        const parts = url.split('/');
        const filename = parts[parts.length - 1].split('?')[0];
        newUrl = `${API_BASE_URL}/fix-image/${username}/${filename}?platform=${platform}&t=${Date.now()}&retry=${retryCount + 1}`;
      } else {
        newUrl = `${url}?t=${Date.now()}&retry=${retryCount + 1}`;
      }
      
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
        
        // Try our backup proxy as last resort
        if (retryCount === 2) {
          console.log(`[ImageError] All retries failed, using placeholder for ${key}`);
          // Update the post to use a placeholder
          const postIndex = localPosts.findIndex(p => p.key === key);
          if (postIndex >= 0) {
            const updatedPost = {
              ...localPosts[postIndex],
              data: {
                ...localPosts[postIndex].data,
                image_url: `${API_BASE_URL}/placeholder.jpg?src=${encodeURIComponent(url)}`,
                r2_image_url: undefined
              }
            };
            
            const updatedPosts = [...localPosts];
            updatedPosts[postIndex] = updatedPost;
            setLocalPosts(updatedPosts);
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
      
      // Update the post to use a placeholder
      const postIndex = localPosts.findIndex(p => p.key === key);
      if (postIndex >= 0) {
        const updatedPost = {
          ...localPosts[postIndex],
          data: {
            ...localPosts[postIndex].data,
            image_url: `${API_BASE_URL}/placeholder.jpg?src=${encodeURIComponent(url)}`,
            r2_image_url: undefined
          }
        };
        
        const updatedPosts = [...localPosts];
        updatedPosts[postIndex] = updatedPost;
        setLocalPosts(updatedPosts);
      }
    }
  };

  // Enhanced image placeholder component
  const ImagePlaceholder: React.FC<{ postKey: string }> = ({ postKey }) => {
    const retryImage = () => {
      // Reset error state for this image
      const updatedErrors = {...imageErrors};
      delete updatedErrors[postKey];
      setImageErrors(updatedErrors);
      
      // Force refresh
      setLocalPosts(prev => [...prev]);
    };
    
    const post = localPosts.find(p => p.key === postKey);
    const imageUrl = post ? post.data.image_url || post.data.r2_image_url : '';

    return (
      <div className="post-image-placeholder">
        <div className="placeholder-content">
          <p style={{
            color: '#666',
            fontSize: '14px',
            marginBottom: '10px'
          }}>
            Image Failed to Load
          </p>
          <button
            className="retry-image-button"
            onClick={retryImage}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '8px'
            }}
          >
            Retry
          </button>
          <p style={{
            color: '#999',
            fontSize: '12px',
            marginTop: '8px'
          }}>
            URL: {imageUrl && imageUrl.substring(0, 50)}...
          </p>
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
      const statusUpdateResponse = await fetch(`${API_BASE_URL}/api/update-post-status/${username}`, {
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

    // Use smart reusable schedule helper for all platforms
    const caption = post.data.post?.caption || '';
    let imageBlob: Blob | null = null;
    
    // Fetch image for platforms that support it
    if (platform !== 'twitter' || (platform === 'twitter' && post.data.image_url)) {
      const imageKey = extractImageKey(post);
      if (imageKey) {
        imageBlob = await fetchImageFromR2(username, imageKey, platform);
        if (!imageBlob) {
          setToastMessage('Failed to fetch image for post.');
          return;
        }
      } else if (platform === 'instagram') {
        setToastMessage('Could not determine image for Instagram post.');
        return;
      }
    }
    
    // Truncate caption for Instagram
    const finalCaption = platform === 'instagram' && caption.length > 2150 
      ? caption.slice(0, 2150) 
      : caption;
    
    const result = await schedulePost({
      platform,
      userId,
      imageBlob: imageBlob || undefined,
      caption: finalCaption,
      scheduleTime,
      postKey: selectedPostKey
    });
    
    setToastMessage(result.message);
    
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
    // Enhanced image key extraction from the post key itself
    if (key.match(/ready_post_\d+\.json$/)) {
      const postIdMatch = key.match(/ready_post_(\d+)\.json$/);
      if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
    }
    
    // Fallback: extract from image URL if available
    if (!imageKey && post.data.image_url) {
      const urlMatch = post.data.image_url.match(/(image_\d+\.jpg)/);
      if (urlMatch) imageKey = urlMatch[1];
    }

    if (!imageKey) {
      console.error(`[Edit] Could not determine image key for post ${key}`);
      setToastMessage('Could not determine image for editing.');
      return;
    }

    console.log(`[Edit] Extracted imageKey: ${imageKey} for post ${key}`);

    try {
      // Use our direct R2 image endpoint instead of signed URL for editing
      const directImageUrl = `${API_BASE_URL}/api/r2-image/${username}/${imageKey}?platform=${platform}`;
      
      console.log(`[Edit] Using direct image URL: ${directImageUrl}`);

      // Test if the image is accessible
      const testResponse = await fetch(directImageUrl, { method: 'HEAD' });
      
      if (!testResponse.ok) {
        console.warn(`[Edit] Direct image not accessible, trying signed URL...`);
        
        // Fallback to signed URL
        const signedUrlRes = await fetch(`${API_BASE_URL}/api/signed-image-url/${username}/${imageKey}?platform=${platform}`);
        
        if (!signedUrlRes.ok) {
          throw new Error(`Failed to get signed URL: ${signedUrlRes.status}`);
        }
        
        const signedUrlData = await signedUrlRes.json();
        const imageUrl = signedUrlData.url;
        
        if (!imageUrl) {
          throw new Error('No signed URL returned');
        }

        setEditingPost({
          key: key,
          imageUrl: imageUrl,
          caption: post.data.post?.caption || ''
        });
      } else {
        // Direct image is accessible, use it
        setEditingPost({
          key: key,
          imageUrl: directImageUrl,
          caption: post.data.post?.caption || ''
        });
      }
      
      setShowCanvasEditor(true);
      console.log(`[Edit] Successfully prepared post for editing: ${key}`);
      
    } catch (err) {
      console.error('[Edit] Failed to prepare image for editing:', err);
      setToastMessage('Failed to prepare image for editing. Please try again.');
    }
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
      const response = await fetch(`${API_BASE_URL}/api/update-post-status/${username}`, {
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

  const fetchTimeDelay = async (userDefinedInterval?: number): Promise<number> => {
    // Priority 1: User-defined interval
    if (typeof userDefinedInterval === 'number' && !isNaN(userDefinedInterval) && userDefinedInterval > 0) {
      console.log(`[AutoSchedule] Using user-defined interval: ${userDefinedInterval} hours`);
      return userDefinedInterval;
    }

    // Priority 2: Fallback to generated content timeline
    try {
      console.log(`[AutoSchedule] Fetching timeline from generated content for ${username} on ${platform}`);
      const timelineResponse = await fetch(`${API_BASE_URL}/api/generated-content-timeline/${username}?platform=${platform}`);
      
      if (timelineResponse.ok) {
        const timelineData = await timelineResponse.json();
        if (timelineData.success && timelineData.timeline && timelineData.timeline > 0) {
          console.log(`[AutoSchedule] Using timeline from generated content: ${timelineData.timeline} hours`);
          return timelineData.timeline;
        } else {
          console.log(`[AutoSchedule] Generated content timeline not available or invalid, using default`);
        }
      } else {
        console.log(`[AutoSchedule] Generated content timeline endpoint returned ${timelineResponse.status}, using default`);
      }
    } catch (timelineError) {
      console.warn(`[AutoSchedule] Error fetching timeline from generated content:`, timelineError);
    }

    // Priority 3: Original time delay endpoint
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-delay/${username}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const delay = parseInt(data?.Posting_Delay_Intervals);
      const finalDelay = isNaN(delay) ? 12 : delay;
      console.log(`[AutoSchedule] Using time delay from endpoint: ${finalDelay} hours`);
      return finalDelay;
    } catch (err) {
      console.warn(`[AutoSchedule] Failed to fetch time delay from endpoint, using default 6 hours:`, err);
      return 6; // Changed default from 12 to 6 hours as specified in requirements
    }
  };

  const handleAutoSchedule = async (intervalOverride?: number) => {
    if (!userId || !localPosts.length) {
      setToastMessage('No user ID or posts to schedule.');
      return;
    }
    setAutoScheduling(true);
    setAutoScheduleProgress('Determining scheduling interval...');
    
    try {
      // Use the enhanced fetchTimeDelay with priority system
      const delayHours = await fetchTimeDelay(intervalOverride);
      
      console.log('[AutoSchedule] Final interval determined:', delayHours, 'hours');
      setAutoScheduleProgress(`Scheduling ${platform === 'twitter' ? 'tweets' : 'posts'} every ${delayHours} hours...`);
      
      const now = new Date();
      
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
              const response = await axios.post(`${API_BASE_URL}/api/schedule-tweet/${userId}`, {
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
              const response = await axios.post(`${API_BASE_URL}/api/schedule-tweet/${userId}`, {
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
        } else if (platform === 'facebook') {
          // Facebook auto-scheduling logic (supports optional images)
          const caption = post.data.post?.caption || '';
          console.log(`[AutoSchedule] Facebook post #${i + 1} caption:`, caption);
          
          let scheduleDate;
          if (i === 0) {
            const nowPlusBuffer = new Date(Date.now() + 60 * 1000);
            scheduleDate = nowPlusBuffer;
          } else {
            const prevDate = new Date(Date.now() + 60 * 1000 + (i * delayHours * 60 * 60 * 1000));
            scheduleDate = prevDate;
          }
          
          console.log(`[AutoSchedule] Scheduling Facebook post #${i + 1} at:`, scheduleDate.toISOString());
          
          try {
            const formData = new FormData();
            formData.append('caption', caption);
            formData.append('scheduleDate', scheduleDate.toISOString());
            formData.append('platform', 'facebook');

            // Attempt to add image if available
            let imageBlob: Blob | null = null;
            if (post.data.image_url) {
              try {
                const proxyUrl = `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(post.data.image_url)}`;
                const imgRes = await fetch(proxyUrl);
                imageBlob = await imgRes.blob();
                const filename = `auto_facebook_post_${i + 1}.jpg`;
                formData.append('image', imageBlob, filename);
                console.log(`[AutoSchedule] Added image to Facebook post #${i + 1}`);
              } catch (imgErr) {
                console.warn(`[AutoSchedule] Unable to fetch image for Facebook post #${i + 1}, proceeding with text-only`);
              }
            }

            const resp = await fetch(`${API_BASE_URL}/schedule-post/${userId}`, {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              console.error(`[AutoSchedule] Failed to schedule Facebook post #${i + 1}:`, errData.error || resp.statusText);
              setToastMessage(`Failed to schedule Facebook post ${i + 1}: ${errData.error || 'Unknown error'}`);
            } else {
              const respData = await resp.json().catch(() => ({}));
              console.log(`[AutoSchedule] Scheduled Facebook post #${i + 1} successfully:`, respData);
              setToastMessage(`Scheduled Facebook post ${i + 1} successfully!`);
            }
          } catch (err: any) {
            console.error(`[AutoSchedule] Error scheduling Facebook post #${i + 1}:`, err.message);
            setToastMessage(`Error scheduling Facebook post ${i + 1}: ${err.message}`);
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
            const signedUrlRes = await fetch(`${API_BASE_URL}/api/signed-image-url/${username}/${imageKey}`);
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
            const proxyUrl = `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(signedImageUrl)}`;
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
            const resp = await fetch(`${API_BASE_URL}/schedule-post/${userId}`, {
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
      setToastMessage(`All ${platform === 'twitter' ? 'tweets' : 'posts'} scheduled successfully! Interval: ${delayHours} hours`);
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
      const realTimeTimestamp = Date.now();
      
      // REAL-TIME REQUEST: Always bypass cache with multiple parameters
      const response = await axios.get(`${API_BASE_URL}/posts/${username}?forceRefresh=true${platformParam}&realtime=${realTimeTimestamp}&nocache=1&v=${Math.random()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      setLocalPosts(response.data);
      setToastMessage('Posts refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing posts:', error);
      setToastMessage('Failed to refresh posts. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePostNow = (post: any) => {
    if (!isConnected || !userId) {
      setToastMessage('Please connect your Instagram account first.');
      return;
    }
    
    setSelectedPostForPosting(post);
    setShowPostNowModal(true);
  };

  const handleConfirmPostNow = async () => {
    if (!selectedPostForPosting || !userId) return;
    
    setIsPosting(true);
    
    try {
      const post = selectedPostForPosting;
      const caption = post.data.post?.caption || '';
      
      // Get image blob with fresh signed URL and robust error handling
      let imageBlob: Blob | null = null;
      if (post.data.image_url) {
        try {
          // Use direct R2 endpoint instead of signed URLs for reliability
          let imageUrl = post.data.image_url;
          
          if (imageUrl.includes('X-Amz-Signature') && imageUrl.includes('r2.cloudflarestorage.com')) {
            // This is a signed R2 URL, convert to direct R2 endpoint
            const pathMatch = imageUrl.match(/ready_post\/instagram\/([^\/]+)\/([^?]+)/);
            if (pathMatch) {
              const [, username, imageKey] = pathMatch;
              imageUrl = `${API_BASE_URL}/api/r2-image/${username}/${imageKey}?platform=instagram`;
              console.log(`[PostNow] Using direct R2 endpoint for ${imageKey}`);
            }
          }
          
          const proxyUrl = `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
          const imgRes = await fetch(proxyUrl);
          
          // Check if response is actually an image
          const contentType = imgRes.headers.get('content-type') || '';
          if (!imgRes.ok || !contentType.startsWith('image/')) {
            // Try to get error details if it's JSON
            let errorMsg = `Failed to fetch image via proxy (${imgRes.status})`;
            try {
              const errorData = await imgRes.json();
              errorMsg = errorData.error || errorMsg;
            } catch (e) {
              // Not JSON, check if it's a common error
              if (imgRes.status === 403) {
                errorMsg = 'Image URL expired or access denied';
              } else if (imgRes.status === 404) {
                errorMsg = 'Image not found';
              }
            }
            throw new Error(errorMsg);
          }
          
          imageBlob = await imgRes.blob();
          console.log(`[PostNow] Successfully fetched image blob: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
        } catch (imgErr: any) {
          console.error('Failed to fetch image for posting:', imgErr);
          setToastMessage(`Failed to fetch image: ${imgErr.message || 'Unknown error'}`);
          setIsPosting(false);
          return;
        }
      }
      
      if (!imageBlob) {
        setToastMessage('No image found for this post.');
        setIsPosting(false);
        return;
      }
      
      const formData = new FormData();
      formData.append('image', imageBlob, 'post_image.jpg');
      formData.append('caption', caption);
      
      console.log(`[PostNow] Posting to Instagram for user ${userId}`);
      
      const response = await fetch(`${API_BASE_URL}/post-instagram-now/${userId}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[PostNow] Failed to post:', errorData);
        setToastMessage(`Failed to post: ${errorData.error || 'Unknown error'}`);
      } else {
        const resultData = await response.json();
        console.log('[PostNow] Posted successfully:', resultData);
        setToastMessage('🎉 Posted to Instagram successfully!');
        
        // Update post status to posted (visual feedback)
        setLocalPosts(prev => 
          prev.map(p => 
            p.key === selectedPostForPosting.key 
              ? { ...p, data: { ...p.data, status: 'posted' } }
              : p
          )
        );
      }
    } catch (error: any) {
      console.error('[PostNow] Error posting:', error);
      setToastMessage(`Error posting: ${error.message}`);
    } finally {
      setIsPosting(false);
      setShowPostNowModal(false);
      setSelectedPostForPosting(null);
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
          <h2>
            <div className="section-header">
              <BsLightbulb className="section-icon" />
              <span>Cooked Posts</span>
              {getUnseenPostsCount() > 0 ? (
                <div className="content-badge" onClick={markPostsAsViewed}>
                  <FaBell className="badge-icon" />
                  <span className="badge-count">{getUnseenPostsCount()}</span>
                </div>
              ) : (
                <div className="content-badge viewed">
                  <FaBell className="badge-icon" />
                  <span className="badge-text">Viewed</span>
                </div>
              )}
            </div>
          </h2>
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
              isConnected={isConnected}
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
          ) : platform === 'facebook' ? (
            <FacebookRequiredButton
              isConnected={isConnected}
              onClick={() => setShowIntervalModal(true)}
              className="facebook-btn connect"
              disabled={!filteredPosts.length || autoScheduling}
              style={{ 
                background: 'linear-gradient(90deg, #3b5998, #4267b2)', 
                color: '#ffffff', 
                cursor: filteredPosts.length ? 'pointer' : 'not-allowed', 
                borderRadius: 8, 
                padding: '8px 16px', 
                border: '1px solid #3b5998',
                opacity: filteredPosts.length ? 1 : 0.5
              }}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </FacebookRequiredButton>
          ) : (
            <InstagramRequiredButton
              isConnected={isConnected}
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
            <div style={{ background: '#23234a', borderRadius: 12, padding: 24, minWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ color: '#e0e0ff', marginBottom: 8 }}>Set Auto-Schedule Interval</h3>
              <input
                type="number"
                min={1}
                
                step={1}
                value={intervalInput}
                onChange={e => setIntervalInput(e.target.value)}
                placeholder="Interval in hours (e.g. 4)"
                style={{ padding: 8, borderRadius: 6, border: '1px solid #00ffcc', fontSize: 16, marginBottom: 8 }}
                autoFocus
              />
              <div style={{ color: '#a0a0cc', fontSize: 14, marginBottom: 8, lineHeight: '1.4' }}>
                <strong>Priority System:</strong><br />
                1. Your custom interval (if provided)<br />
                2. Campaign timeline from goal settings<br />
                3. Default interval (6 hours)
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
                >Start Auto-Schedule</button>
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
                      src={getCachedImageUrl(post)}
                      alt="Post visual"
                      className={`post-image ${loadingImages.has(post.key) ? 'loading' : 'loaded'}`}
                      onLoadStart={() => handleImageLoadStart(post.key)}
                      onLoad={() => handleImageLoad(post.key)}
                      onError={() => handleImageError(post.key, post.data.r2_image_url || post.data.image_url)}
                      key={`${post.key}-${imageRefreshKey}`} // CACHED key for React
                    />
                  )}
                  <div className="post-actions">
                    <motion.button
                      className="like-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
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
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
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
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
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
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
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
                        isConnected={isConnected}
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
                    ) : platform === 'facebook' ? (
                      <FacebookRequiredButton
                        isConnected={isConnected}
                        onClick={() => handleScheduleClick(post.key)}
                        className="schedule-button"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '5px', 
                          backgroundColor: '#3b5998', 
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
                      </FacebookRequiredButton>
                    ) : (
                      <InstagramRequiredButton
                        isConnected={isConnected}
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
                    {platform === 'instagram' && isConnected && (
                      <motion.button
                        className="post-now-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handlePostNow(post)}
                        style={{
                          background: 'linear-gradient(45deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          marginLeft: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Post Now
                      </motion.button>
                    )}
                    <motion.button
                      className="reject-button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
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
                        {post.data.post?.caption && post.data.post.caption.trim() ? 
                          post.data.post.caption : 
                          <em style={{ color: '#888', fontStyle: 'italic' }}>Click edit to add a caption</em>
                        }
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
                    {post.data.post?.hashtags && post.data.post.hashtags.length > 0 ? (
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
                      <em style={{ color: '#888', fontStyle: 'italic' }}>No hashtags</em>
                    )}
                  </div>
                  <p className="post-cta">
                    {post.data.post?.call_to_action && post.data.post.call_to_action.trim() ? 
                      post.data.post.call_to_action : 
                      <em style={{ color: '#888', fontStyle: 'italic' }}>No call to action</em>
                    }
                  </p>
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleFeedbackSubmit(isFeedbackOpen)}
                disabled={!feedbackText.trim()}
              >
                Submit
              </motion.button>
              <motion.button
                className="cancel-feedback-button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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
        
        {/* Post Now Confirmation Modal */}
        {showPostNowModal && selectedPostForPosting && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowPostNowModal(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                border: '1px solid #00ffcc',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                position: 'relative'
              }}
            >
              <h3 style={{ color: '#00ffcc', marginBottom: '16px', textAlign: 'center' }}>
                🚀 Post to Instagram Now?
              </h3>
              
              <div style={{ marginBottom: '16px', textAlign: 'center', color: '#e0e0ff' }}>
                <p>This will immediately post to your connected Instagram account:</p>
                <div style={{
                  background: 'rgba(0, 255, 204, 0.1)',
                  border: '1px solid rgba(0, 255, 204, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  margin: '12px 0',
                  maxHeight: '100px',
                  overflow: 'auto'
                }}>
                  <strong>Caption:</strong> {selectedPostForPosting.data.post?.caption || 'No caption'}
                </div>
                <p style={{ fontSize: '14px', color: '#888' }}>
                  ⚠️ This action cannot be undone. The post will be live on Instagram.
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowPostNowModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #666',
                    color: '#e0e0ff',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                  disabled={isPosting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPostNow}
                  disabled={isPosting}
                  style={{
                    background: isPosting 
                      ? 'linear-gradient(45deg, #666, #777)' 
                      : 'linear-gradient(45deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D)',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: isPosting ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {isPosting ? '🔄 Posting...' : '📤 Yes, Post Now!'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default PostCooked;