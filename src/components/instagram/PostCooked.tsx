import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM, { createPortal } from 'react-dom';
import './PostCooked.css';
import { motion } from 'framer-motion';
import { saveFeedback } from '../../utils/FeedbackHandler';
import ErrorBoundary from '../ErrorBoundary';
import CanvasEditor from '../common/CanvasEditor';
import OptimizedImage from '../common/OptimizedImage';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import TwitterRequiredButton from '../common/TwitterRequiredButton';
import FacebookRequiredButton from '../common/FacebookRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { useLinkedIn } from '../../context/LinkedInContext';
import { schedulePost, fetchImageFromR2 } from '../../utils/scheduleHelpers';
import axios from 'axios';
import { safeFilter } from '../../utils/safeArrayUtils';
import { BsLightbulb } from 'react-icons/bs';
import { FaBell, FaPalette, FaDownload } from 'react-icons/fa';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import { getApiUrl } from '../../config/api';
import CacheManager from '../../utils/cacheManager';
import { BatchImageLoader } from '../common/ProgressiveImage';
// Missing modules - comment out until they're available

// Extend Window interface for proxy server status
declare global {
  interface Window {
    proxyServerDown?: boolean;
  }
}

interface PostCookedProps {
  username: string;
  profilePicUrl: string;
  posts?: { key: string; data: { post: any; status: string; image_url: string; r2_image_url?: string; image_path?: string; isEdited?: boolean }; imageFailed?: boolean }[];
  userId?: string;
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
}

// Define an interface for image error state
interface ImageErrorState {
  failed: boolean;
  retryCount: number;
}

// Base URL for all API requests (using relative URLs with Vite proxy)
// Base URL for all API requests – use relative path so that reverse-proxy / nginx can
// automatically route to the correct upstream no matter which host serves the bundle.
// An empty string forces every fetch to be relative to window.location.origin.
const API_BASE_URL = '';


const PostCooked: React.FC<PostCookedProps> = ({ username, profilePicUrl, posts = [], userId: propUserId, platform = 'instagram' }) => {
  const { isConnected: isInstagramConnected, userId: instagramUserId } = useInstagram();
  const { isConnected: isTwitterConnected, userId: twitterUserId } = useTwitter();
  const { isConnected: isFacebookConnected, userId: facebookUserId } = useFacebook();
  const { isConnected: isLinkedInConnected, userId: linkedinUserId } = useLinkedIn();
  const { trackRealPostCreation, canUseFeature } = useFeatureTracking();
  
  // Determine platform-specific values
  const isConnected = platform === 'twitter'
    ? isTwitterConnected
    : platform === 'facebook'
    ? isFacebookConnected
    : platform === 'linkedin'
    ? isLinkedInConnected
    : isInstagramConnected;
  const contextUserId = platform === 'twitter'
    ? twitterUserId
    : platform === 'facebook'
    ? facebookUserId
    : platform === 'linkedin'
    ? linkedinUserId
    : instagramUserId;
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
  
  // ✨ NEW: Auto-schedule progress tracking similar to auto-replies
  const [autoScheduleTracking, setAutoScheduleTracking] = useState<{
    current: number;
    total: number;
    successCount: number;
    failureCount: number;
    isRunning: boolean;
    processedPosts: string[];
  }>({ current: 0, total: 0, successCount: 0, failureCount: 0, isRunning: false, processedPosts: [] });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedPostKey, setSelectedPostKey] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');
  const [showCanvasEditor, setShowCanvasEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<{ key: string; imageUrl: string; caption: string } | null>(null);
  const [editingCaption, setEditingCaption] = useState<{ key: string; caption: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPostNowModal, setShowPostNowModal] = useState(false);
  const [selectedPostForPosting, setSelectedPostForPosting] = useState<any>(null);
  const [isPosting, setIsPosting] = useState(false);
  
  // ✨ NEW: Schedule loading state
  const [isScheduling, setIsScheduling] = useState(false);
  
  // NEW: State for scroll position
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  // NEW: Reference for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  // ✨ NEW: Reimagine Image Feature State
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number; postKey: string } | null>(null);
  const [showReimagineModal, setShowReimagineModal] = useState(false);
  const [reimaginePostKey, setReimaginePostKey] = useState<string | null>(null);
  const [reimagineExtraPrompt, setReimagineExtraPrompt] = useState('');
  const [isReimagining, setIsReimagining] = useState(false);
  const [reimagineToastMessage, setReimagineToastMessage] = useState<string | null>(null);
  // Add preview modal state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Handle scroll events to show/hide scroll-to-top button
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current;
      setShowScrollTop(scrollTop > 200);
    }
  };

  // Scroll to top function
  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }; // 30 seconds

  // ✨ BULLETPROOF: Comprehensive processed posts tracking
  const getProcessedStorageKey = () => `${platform}_processed_posts_${username}`;
  const getViewedStorageKey = () => `${platform}_viewed_posts_${username}`;
  
  const [processedPosts, setProcessedPosts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(getProcessedStorageKey());
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const [viewedPosts, setViewedPosts] = useState<Set<string>>(() => {
    const cacheKey = getViewedStorageKey();
    const cachedData = CacheManager.getCacheData<string[]>(cacheKey, platform, username, 'posts');
    return cachedData ? new Set(cachedData) : new Set();
  });

  // ✨ BULLETPROOF: Function to mark posts as permanently processed
  const markPostAsProcessed = useCallback((postKey: string, reason: string) => {
    console.log(`[ProcessedPosts] 🚫 Marking post as processed: ${postKey} (${reason})`);
    
    setProcessedPosts(prev => {
      const newProcessedPosts = new Set(prev);
      newProcessedPosts.add(postKey);
      localStorage.setItem(getProcessedStorageKey(), JSON.stringify(Array.from(newProcessedPosts)));
      return newProcessedPosts;
    });
    
    // Also mark as viewed to double-ensure it doesn't reappear
    setViewedPosts((prev: Set<string>) => {
      const newViewedPosts = new Set(prev);
      newViewedPosts.add(postKey);
      localStorage.setItem(getViewedStorageKey(), JSON.stringify(Array.from(newViewedPosts)));
      return newViewedPosts;
    });
    
    // Immediately remove from current UI
    setLocalPosts(prev => prev.filter(p => p.key !== postKey));
  }, [platform, username, getViewedStorageKey, getProcessedStorageKey]);

  // ✨ BULLETPROOF: Filter out ALL processed posts from display
  const getFilteredPosts = useCallback(() => {
    return safeFilter(localPosts, (post: any) => {
      // Filter out rejected posts
      if (rejectedPosts.includes(post.key)) return false;
      
      // Filter out permanently processed posts
      if (processedPosts.has(post.key)) return false;
      
      // Filter out posts with processed status
      if (post.data?.status === 'scheduled' || 
          post.data?.status === 'posted' || 
          post.data?.status === 'rejected' ||
          post.data?.status === 'ignored' ||
          post.data?.status === 'processed' ||
          post.data?.status === 'published') {
        // Mark as processed if not already
        if (!processedPosts.has(post.key)) {
          markPostAsProcessed(post.key, `status: ${post.data.status}`);
        }
        return false;
      }
      
      // 🔥 ENHANCED: Additional status checks for edge cases
      if (post.data?.status && typeof post.data.status === 'string' && 
          post.data.status.toLowerCase().includes('scheduled')) {
        console.log(`[PostCooked] 🚫 Filtering out post with scheduled-like status: ${post.data.status}`);
        if (!processedPosts.has(post.key)) {
          markPostAsProcessed(post.key, `scheduled-like-status: ${post.data.status}`);
        }
        return false;
      }
      
      return true;
    });
  }, [localPosts, rejectedPosts, processedPosts, markPostAsProcessed]);

  // Helper function to get unseen count
  const getUnseenPostsCount = () => {
    return safeFilter(localPosts, (post: any) => !viewedPosts.has(post.key)).length;
  };

  // Function to mark posts as viewed
  const markPostsAsViewed = () => {
    const newViewedPosts = new Set(localPosts.map(p => p.key));
    setViewedPosts(newViewedPosts);
    CacheManager.setCacheData(getViewedStorageKey(), Array.from(newViewedPosts), platform, username, 'posts');
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
    console.log('🔍 [DEBUG] Posts detailed structure:', posts.map(p => ({
      key: p.key,
      hasImageUrl: !!p.data?.image_url,
      hasR2ImageUrl: !!p.data?.r2_image_url,
      hasImagePath: !!p.data?.image_path,
      imageUrl: p.data?.image_url,
      r2ImageUrl: p.data?.r2_image_url,
      imagePath: p.data?.image_path
    })));
    setLocalPosts(posts);
    
    // Clear any existing image errors when new posts are loaded to prevent white images
    if (posts && posts.length > 0) {
      setImageErrors({});
      // setImageRefreshKey(prev => prev + 1); // REMOVED: This was forcing re-renders on every post load
      console.log(`[PostCooked] Cleared image errors for ${posts.length} fresh posts`);
    }
    
    // REAL-TIME INITIALIZATION: Auto-refresh on mount to ensure fresh data
    if (username && posts.length === 0) {
      console.log('[PostCooked] Auto-refreshing for real-time data on mount');
      setTimeout(() => handleRefreshPosts(), 500);
    }
  }, [posts, username]);

  // AUTO-REFRESH: Set up periodic refresh for new posts created in post mode
  useEffect(() => {
    if (!username) return;

    // Also listen for custom events from post creation
    const handleNewPostEvent = (event: CustomEvent) => {
      const { username: eventUsername, platform: eventPlatform } = event.detail;
      
      if (eventUsername === username && eventPlatform === platform) {
        // Only log if needed for debugging
        // console.log('[PostCooked] NEW POST EVENT: Refreshing immediately');
        setTimeout(() => handleRefreshPosts(), 1000); // Small delay to allow server processing
      }
    };

    window.addEventListener('newPostCreated', handleNewPostEvent as EventListener);

         // Cleanup
     return () => {
        window.removeEventListener('newPostCreated', handleNewPostEvent as EventListener);
     };
  }, [username, platform, localPosts.length]);

  // Ref for forcing image refresh - persists across re-renders
  const imageRefreshKey = useRef(Date.now());

  // Listen for post updates from Canvas Editor
  useEffect(() => {
    const handlePostUpdate = (event: CustomEvent) => {
      const { postKey, platform: updatedPlatform, imageKey, serverTimestamp } = event.detail;
      
      if (updatedPlatform === platform) {
        console.log(`[PostCooked] 🎯 INSTANT UPDATE received for ${postKey} on ${platform}`);
        console.log(`[PostCooked] 🎯 Event details:`, event.detail);
        setToastMessage('✅ Image updated instantly!');
        
        // INSTANT METHOD: Force all images to reload with cache busting
        const now = Date.now();
        const postIndex = localPosts.findIndex(p => p.key === postKey);
        
        if (postIndex >= 0) {
          // Use imageKey from server if available, otherwise extract from postKey
          let finalImageKey = imageKey;
          
          if (!finalImageKey) {
            // Handle campaign posts: campaign_ready_post_123_hash.json -> edited_campaign_ready_post_123_hash.png
            if (postKey.includes('campaign_ready_post_') && postKey.endsWith('.json')) {
              const baseName = postKey.replace(/^.*\/([^\/]+)\.json$/, '$1');
              finalImageKey = `edited_${baseName}.png`;
            }
            // Handle regular posts: ready_post_123.json -> edited_image_123.png  
            else {
              const match = postKey.match(/ready_post_(\d+)\.json$/);
              if (match && match[1]) {
                finalImageKey = `edited_image_${match[1]}.png`;
              } else {
                console.error(`[handlePostUpdate] ❌ Could not extract image key from: ${postKey}`);
                return; // Don't create malformed URLs
              }
            }
          }
          
          // Create super cache-busted URL for edited PNG image
          const cacheBustParams = [
            `platform=${platform}`,
            `INSTANT=${now}`,
            `edited=true`,
            `v=${Math.random()}`,
            `force=1`,
            `nuclear=1`,
            `bypass=1`,
            `nocache=1`,
            `serverTS=${serverTimestamp || now}`,
            `${Date.now()}` // Additional timestamp
          ].join('&');
          
          const freshUrl = `${API_BASE_URL}/api/r2-image/${username}/${finalImageKey}?${cacheBustParams}`;
          
          console.log(`[PostCooked] 🔥 Generated fresh edited URL: ${freshUrl}`);
          
          // DELAY UPDATE: Give the server a moment to complete the save before updating the URL
          // This prevents race conditions where the frontend updates before the backend finishes
          setTimeout(() => {
            // Update ONLY the edited post instantly with both URLs pointing to edited version
            setLocalPosts(prev => {
              const updated = [...prev];
              const currentPost = updated[postIndex];
              
              // Double-check the post still exists (it might have been removed)
              if (!currentPost) {
                console.warn(`[PostCooked] ⚠️ Post disappeared during update: ${postKey}`);
                return prev;
              }
              
              updated[postIndex] = {
                ...currentPost,
                data: {
                  ...currentPost.data,
                  image_url: freshUrl,
                  r2_image_url: freshUrl,
                  isEdited: true // 🎯 PERMANENT FLAG: Mark as edited for consistent display
                } as any // Temporary fix for edited properties
              };
              
              console.log(`[PostCooked] 🎯 Updated post data for ${postKey}:`, updated[postIndex].data);
              return updated;
            });
            
            // Force React re-render by updating the refresh key
            imageRefreshKey.current = now;
            
            // Clear any image errors for this post to prevent fallback to white image
            setImageErrors(prev => {
              const newErrors = { ...prev };
              delete newErrors[postKey];
              return newErrors;
            });
            
            // Force clear any loading states
            setLoadingImages(prev => {
              const newLoading = new Set(prev);
              newLoading.delete(postKey);
              return newLoading;
            });
            
            console.log(`[PostCooked] ⚡ INSTANT REFRESH completed for: ${postKey}`);
          }, 500); // 500ms delay to ensure server processing is complete
        } else {
          console.warn(`[PostCooked] ⚠️ Post not found in localPosts: ${postKey}`);
        }
      }
    };

    window.addEventListener('postUpdated', handlePostUpdate as EventListener);
    return () => window.removeEventListener('postUpdated', handlePostUpdate as EventListener);
  }, [platform, localPosts, username]);

  // ✨ BULLETPROOF: Listen for post scheduling events from Canvas Editor
  useEffect(() => {
    const handlePostScheduled = (event: CustomEvent) => {
      const { postKey, platform: scheduledPlatform, success } = event.detail;
      
      if (scheduledPlatform === platform && success) {
        console.log(`[PostCooked] 🚫 Canvas Editor scheduled post ${postKey} - marking as permanently processed`);
        markPostAsProcessed(postKey, 'canvas-editor-scheduled');
        setToastMessage('✅ Post scheduled from editor and permanently removed!');
      }
    };

    window.addEventListener('postScheduled', handlePostScheduled as EventListener);
    
    // 🚀 AUTOPILOT: Listen for auto-schedule trigger from Dashboard
    const handleAutoScheduleTrigger = (event: CustomEvent) => {
      if (event.detail?.username === username && event.detail?.platform === platform) {
        console.log(`[AUTOPILOT] Received auto-schedule trigger for ${username} on ${platform}`);
        handleAutoSchedule(); // Trigger the existing auto-schedule function
      }
    };
    
    window.addEventListener('triggerAutoSchedule', handleAutoScheduleTrigger as EventListener);
    
    return () => {
      window.removeEventListener('postScheduled', handlePostScheduled as EventListener);
      window.removeEventListener('triggerAutoSchedule', handleAutoScheduleTrigger as EventListener);
    };
  }, [platform, markPostAsProcessed]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 🎯 GENIUS: Enhanced image URL generation with intelligent pattern matching
  const getReliableImageUrl = useCallback((post: any, forceRefresh: boolean = false) => {
    // Check if proxy server is down - if so, don't try to load images
    if (typeof window !== 'undefined' && window.proxyServerDown) {
      console.log(`[PostCooked] Proxy server is down, skipping image load for ${post.key}`);
      return '';
    }

    const postKey = post.key;
    let imageFilename = '';
    let imageExtension = 'jpg'; // Default to jpg
    
    console.log(`[ImageURL] Processing post key: ${postKey}`);
    
    // 🎯 PRIORITY CHECK: Look for edited image URLs first (highest priority)
    if (post.data?.image_url && post.data.image_url.includes('edited_')) {
      console.log(`[ImageURL] 🎯 Found edited image URL in post data: ${post.data.image_url}`);
      // 🔧 FIX 1: Use content-based versioning instead of timestamp for edited images
      const timestamp = `&edited=true&v=${imageRefreshKey.current}`;
      return post.data.image_url + timestamp;
    }
    
    if (post.data?.r2_image_url && post.data.r2_image_url.includes('edited_')) {
      console.log(`[ImageURL] 🎯 Found edited R2 image URL in post data: ${post.data.r2_image_url}`);
      // 🔧 FIX 1: Use content-based versioning instead of timestamp for edited images
      const timestamp = `&edited=true&v=${imageRefreshKey.current}`;
      return post.data.r2_image_url + timestamp;
    }
    
    // 🔥 SECONDARY CHECK: Look for any edited_* filename in existing URLs and use that directly
    const existingImageUrl = post.data?.image_url || post.data?.r2_image_url || '';
    if (existingImageUrl.includes('/edited_')) {
      console.log(`[ImageURL] 🎯 Found edited filename in existing URL: ${existingImageUrl}`);
      // 🔧 FIX 1: Use content-based versioning instead of timestamp for edited images
      const timestamp = `&edited=true&v=${imageRefreshKey.current}`;
      return existingImageUrl + timestamp;
    }
    
    // 🔍 INTELLIGENT PATTERN DETECTION: Handle multiple file naming patterns
    
    // Pattern 1: Standard format - ready_post_<ID>.json → Check for edited_image_<ID>.png FIRST, then image_<ID>.(jpg|png|jpeg|webp)
    const standardMatch = postKey.match(/ready_post_(\d+)\.json$/);
    if (standardMatch) {
      const imageId = standardMatch[1];
      console.log(`[ImageURL] Standard pattern detected, ID: ${imageId}`);
      
      // 🎯 PRIORITY: Check for edited version first (edited images are always PNG)
      const editedFilename = `edited_image_${imageId}.png`;
      const editedUrl = `${API_BASE_URL}/api/r2-image/${username}/${editedFilename}?platform=${platform}&v=${imageRefreshKey.current}&post=${encodeURIComponent(postKey)}&edited=true`;
      
      // 🔧 FIX 2: ALWAYS check edited version first with aggressive cache busting
      const editedUrlWithCacheBust = `${editedUrl}&nuclear=${Date.now()}&bypass=1&nocache=1`;
      
      // 🔧 CONSISTENT DISPLAY FIX: Always show edited version if post is marked as edited OR if edited version exists
      if (forceRefresh || 
          post.data?.isEdited === true || 
          post.data?.image_url?.includes('edited_') || 
          post.data?.r2_image_url?.includes('edited_')) {
        console.log(`[ImageURL] 🎯 Using edited version: ${editedFilename}`);
        return editedUrlWithCacheBust;
      }
      
      // For non-edited posts, continue with original image logic
      console.log(`[ImageURL] 🎯 Post not marked as edited, using original image`);
      
      // Fallback to original image with proper extension detection
      // Try to determine extension from post data with priority order
      if (post.data?.image_path) {
        const pathMatch = post.data.image_path.match(/\.(jpg|jpeg|png|webp)$/i);
        if (pathMatch) {
          imageExtension = pathMatch[1].toLowerCase();
        }
      } else if (post.data?.image_url) {
        const urlMatch = post.data.image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        if (urlMatch) {
          imageExtension = urlMatch[1].toLowerCase();
        }
      } else if (post.data?.r2_image_url) {
        const urlMatch = post.data.r2_image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        if (urlMatch) {
          imageExtension = urlMatch[1].toLowerCase();
        }
      }
      
      imageFilename = `image_${imageId}.${imageExtension}`;
      console.log(`[ImageURL] Standard pattern result: ${imageFilename}`);
    }
    
    // Pattern 2: Campaign format - campaign_ready_post_<ID>_<hash>.json → Check for edited_campaign_ready_post_<ID>_<hash>.png FIRST, then campaign_ready_post_<ID>_<hash>.(jpg|png|jpeg|webp)
    else {
      const campaignMatch = postKey.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
      if (campaignMatch) {
        const campaignId = campaignMatch[1]; // This includes both ID and hash
        console.log(`[ImageURL] Campaign pattern detected, ID: ${campaignId}`);
        
        // 🎯 PRIORITY: Check for edited campaign version first (edited images are always PNG)
        const editedFilename = `edited_campaign_ready_post_${campaignId}.png`;
        const editedUrl = `${API_BASE_URL}/api/r2-image/${username}/${editedFilename}?platform=${platform}&v=${imageRefreshKey.current}&post=${encodeURIComponent(postKey)}&edited=true`;
        
        // 🔧 FIX 2: Use content-based versioning for edited images to enable caching
        const editedUrlWithCacheBust = `${editedUrl}&edited=true&v=${imageRefreshKey.current}`;
        
        // 🔧 CONSISTENT DISPLAY FIX: Always show edited version if post is marked as edited OR if edited version exists
        if (forceRefresh || 
            post.data?.isEdited === true || 
            post.data?.image_url?.includes('edited_') || 
            post.data?.r2_image_url?.includes('edited_')) {
          console.log(`[ImageURL] 🎯 Using edited campaign version: ${editedFilename}`);
          return editedUrlWithCacheBust;
        }
        
        // For non-edited posts, continue with original image logic
        console.log(`[ImageURL] 🎯 Campaign post not marked as edited, using original image`);
        
        // Fallback to original campaign image with proper extension detection
        // For campaign posts, extract extension from post data with smart fallbacks
        if (post.data?.image_path) {
          const pathMatch = post.data.image_path.match(/\.(jpg|jpeg|png|webp)$/i);
          if (pathMatch) {
            imageExtension = pathMatch[1].toLowerCase();
          }
        } else if (post.data?.image_url) {
          const urlMatch = post.data.image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
          if (urlMatch) {
            imageExtension = urlMatch[1].toLowerCase();
          }
        } else if (post.data?.r2_image_url) {
          const urlMatch = post.data.r2_image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
          if (urlMatch) {
            imageExtension = urlMatch[1].toLowerCase();
          }
        }
        
        imageFilename = `campaign_ready_post_${campaignId}.${imageExtension}`;
        console.log(`[ImageURL] Campaign pattern result: ${imageFilename}`);
      }
      
      // Pattern 3: Legacy fallback - try to extract from existing URLs
      else {
        console.log(`[ImageURL] Using legacy fallback pattern detection`);
        const imageUrl = post.data.image_url || post.data.r2_image_url || '';
        
        // Try campaign pattern from URL
        const campaignUrlMatch = imageUrl.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.(jpg|jpeg|png|webp)/i);
        if (campaignUrlMatch) {
          imageFilename = `campaign_ready_post_${campaignUrlMatch[1]}.${campaignUrlMatch[2].toLowerCase()}`;
          console.log(`[ImageURL] Legacy campaign pattern from URL: ${imageFilename}`);
        }
        // Try standard pattern from URL
        else {
          const standardUrlMatch = imageUrl.match(/(image_\d+)\.(jpg|jpeg|png|webp)/i);
          if (standardUrlMatch) {
            imageFilename = `${standardUrlMatch[1]}.${standardUrlMatch[2].toLowerCase()}`;
            console.log(`[ImageURL] Legacy standard pattern from URL: ${imageFilename}`);
          }
        }
      }
    }
    
    // 🚨 SAFETY: If no pattern matched, return error - don't use direct R2 URLs
    if (!imageFilename) {
      console.error(`[PostCooked] Could not determine image filename for post ${postKey}, no fallback available`);
      // Return empty string to trigger UI placeholder component rendering
      return '';
    }
    
    // Create timestamp for cache busting ONLY when explicitly forced
    const timestamp = forceRefresh ? `&t=${Date.now()}` : '';

    // 🎯 FIXED: Use the R2 image endpoint to avoid CORS issues
    const reliableUrl = `${API_BASE_URL}/api/r2-image/${username}/${imageFilename}?platform=${platform}&v=${imageRefreshKey.current}&post=${encodeURIComponent(postKey)}${timestamp}`;
    
    console.log(`[ImageURL] Final URL: ${reliableUrl}`);
    return reliableUrl;
  }, [username, platform, imageRefreshKey.current]);

  // Prefetch next-batch images (beyond initially eager-loaded ones) to eliminate “stuck bluish” tiles
  useEffect(() => {
    try {
      // Eager-load first 12 via the component; prefetch the next 12 here
      const PREFETCH_START = 12;
      const PREFETCH_COUNT = 12;

      const preloader = new BatchImageLoader();
      const filtered = getFilteredPosts();
      if (!filtered || filtered.length <= PREFETCH_START) return;

      const candidates = filtered
        .slice(PREFETCH_START, PREFETCH_START + PREFETCH_COUNT)
        .map(p => getReliableImageUrl(p))
        .filter((u): u is string => Boolean(u));

      if (candidates.length) {
        // Run outside main thread when browser is idle to avoid contention
        const run = () => preloader.loadImages(candidates).catch(() => {});
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(run, { timeout: 1500 });
        } else {
          setTimeout(run, 300);
        }
      }
    } catch {
      // best-effort prefetch; ignore errors
    }
  }, [localPosts, username, platform, getReliableImageUrl, getFilteredPosts]);

  // Helper to ensure preview/download use original quality
  const toOriginalQualityUrl = useCallback((url: string) => {
    if (!url) return url;
    try {
      if (url.includes('quality=')) {
        return url.replace(/quality=[^&]*/i, 'quality=original');
      }
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}quality=original`;
    } catch {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}quality=original`;
    }
  }, []);

  // Simplified and more reliable image error handling
  const handleImageError = useCallback((key: string, imgElement: HTMLImageElement) => {
    const currentRetries = imageErrors[key]?.retryCount || 0;
    
    console.log(`[PostCooked] Image error for ${key}, retry ${currentRetries + 1}/3`);
    
    if (currentRetries >= 3) {
      // 🔧 FIX 4: Don't give up on edited images - they should always exist
      const post = localPosts.find(p => p.key === key);
      if (post && (post.data?.isEdited || post.data?.image_url?.includes('edited_') || post.data?.r2_image_url?.includes('edited_'))) {
        console.log(`[PostCooked] 🎯 Edited image failed loading, trying fallback to original`);
        // For edited images that fail, try the original image as last resort
        const originalUrl = getReliableImageUrl(post, true).replace(/edited_/, '');
        imgElement.src = originalUrl;
        return;
      }
      
      // Max retries reached - use placeholder
      console.error(`[PostCooked] Max retries reached for ${key}, falling back to UI placeholder`);
      setImageErrors(prev => ({
        ...prev,
        [key]: { failed: true, retryCount: currentRetries + 1 }
      }));
      return;
    }
    
    // Increment retry count
    setImageErrors(prev => ({
      ...prev,
      [key]: { failed: false, retryCount: currentRetries + 1 }
    }));
    
    // Get the post and generate a fresh URL
    const post = localPosts.find(p => p.key === key);
    if (!post) {
      setImageErrors(prev => ({
        ...prev,
        [key]: { failed: true, retryCount: currentRetries + 1 }
      }));
      return;
    }
    
    // Generate fresh URL with force refresh
    const freshUrl = getReliableImageUrl(post, true);
    
    // Check if proxy server is down before retrying
    if (typeof window !== 'undefined' && window.proxyServerDown) {
      console.log(`[PostCooked] Proxy server is down, showing placeholder for ${key}`);
      setImageErrors(prev => ({
        ...prev,
        [key]: { failed: true, retryCount: 3 }
      }));
      return;
    }
    
    // Add small delay to prevent rapid retries
    setTimeout(() => {
      console.log(`[PostCooked] Retrying with fresh URL: ${freshUrl}`);
      imgElement.src = freshUrl;
    }, 500 * currentRetries); // Progressive delay
    
  }, [imageErrors, localPosts, getReliableImageUrl]);

  // Client-side image validation to prevent white/corrupted images
  const validateImageOnLoad = useCallback((post: any, imgElement: HTMLImageElement) => {
    try {
      // Basic checks first
      if (!imgElement.naturalWidth || !imgElement.naturalHeight) {
        console.warn(`[PostCooked] Image has no dimensions for ${post.key}`);
        handleImageError(post.key, imgElement);
        return false;
      }
      
      // Minimum size validation (too small might be corrupted)
      if (imgElement.naturalWidth < 50 || imgElement.naturalHeight < 50) {
        console.warn(`[PostCooked] Image too small for ${post.key}: ${imgElement.naturalWidth}x${imgElement.naturalHeight}`);
        handleImageError(post.key, imgElement);
        return false;
      }
      
      // Create canvas for pixel analysis (detect white/blank images)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.warn(`[PostCooked] Could not create canvas context for validation`);
        return true; // Skip validation if canvas not available
      }
      
      // Sample a small area of the image for analysis
      const sampleSize = Math.min(100, imgElement.naturalWidth, imgElement.naturalHeight);
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      
      try {
        // Draw the image to canvas for analysis
        ctx.drawImage(imgElement, 0, 0, sampleSize, sampleSize);
        
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const pixels = imageData.data;
        
        let whitePixels = 0;
        let totalPixels = 0;
        let colorVariance = 0;
        let prevR = 0, prevG = 0, prevB = 0;
        
        // Analyze pixels for whiteness and variation
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          
          totalPixels++;
          
          // Check for white/near-white pixels (RGB > 240)
          if (r > 240 && g > 240 && b > 240 && a > 200) {
            whitePixels++;
          }
          
          // Calculate color variance to detect uniform/blank images
          if (totalPixels > 1) {
            colorVariance += Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
          }
          
          prevR = r; prevG = g; prevB = b;
        }
        
        const whitePercentage = (whitePixels / totalPixels) * 100;
        const avgVariance = colorVariance / totalPixels;
        
        console.log(`[PostCooked] Image analysis for ${post.key}: ${whitePercentage.toFixed(1)}% white, variance: ${avgVariance.toFixed(1)}`);
        
        // Reject if too much white content (likely corrupted/blank)
        if (whitePercentage > 85) {
          console.error(`[PostCooked] Image appears to be mostly white (${whitePercentage.toFixed(1)}%) - rejecting`);
          handleImageError(post.key, imgElement);
          return false;
        }
        
        // Reject if very low color variance (likely blank/corrupted)
        if (avgVariance < 5 && whitePercentage > 50) {
          console.error(`[PostCooked] Image appears to be blank/uniform (variance: ${avgVariance.toFixed(1)}) - rejecting`);
          handleImageError(post.key, imgElement);
          return false;
        }
        
        // Image passed validation
        console.log(`[PostCooked] ✅ Image validation passed for ${post.key}`);
        return true;
        
             } catch (canvasError: any) {
         console.warn(`[PostCooked] Canvas analysis failed for ${post.key}:`, canvasError?.message || canvasError);
         return true; // Skip validation on error, don't block valid images
       }
       
     } catch (error: any) {
       console.warn(`[PostCooked] Image validation error for ${post.key}:`, error?.message || error);
       return true; // Skip validation on error
     }
  }, [handleImageError]);

  // PERFORMANCE: Handle image load success with validation
  const handleImageLoad = useCallback((postKey: string, imgElement?: HTMLImageElement) => {
    // Find the post for validation
    const post = localPosts.find(p => p.key === postKey);
    
    // If we have both post and image element, validate the image
    if (post && imgElement) {
      const isValid = validateImageOnLoad(post, imgElement);
      if (!isValid) {
        // Validation failed, handleImageError was already called
        return;
      }
    }
    
    // Image is valid, proceed with normal load handling
    setLoadingImages(prev => {
      const newSet = new Set(prev);
      newSet.delete(postKey);
      return newSet;
    });
    
    // Clear any previous errors for this image
    setImageErrors(prev => {
      const newErrors = {...prev};
      delete newErrors[postKey];
      return newErrors;
    });
    
  }, [localPosts, validateImageOnLoad]);

  // PERFORMANCE: Handle image load start
  const handleImageLoadStart = useCallback((postKey: string) => {
    setLoadingImages(prev => new Set([...prev, postKey]));
  }, []);

  // Removed social interaction handlers - no longer needed

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

  // Legacy error handler - now handled by the new handleImageError callback

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

  const toLocalDateTimeString = (date: Date) => {
    // Ensure we always get a string in the format YYYY-MM-DDTHH:mm for the browser's local time zone
    const offsetMs = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offsetMs);
    return localDate.toISOString().slice(0, 16);
  };

  const handleScheduleClick = (key: string) => {
    const now = new Date();
    // Add 3 minutes so that, after seconds are stripped, we are guaranteed to be > 3-minute ahead
    const defaultTime = new Date(now.getTime() + 3 * 60 * 1000);
    setScheduleDateTime(toLocalDateTimeString(defaultTime));
    setSelectedPostKey(key);
    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = async () => {
    setIsScheduling(true);
    // Close modal immediately for better UX
    setShowScheduleModal(false);
    setSelectedPostKey(null);
    setScheduleDateTime('');
    
    // Show processing toast to confirm action was received
    setToastMessage('📅 Post is being scheduled... Please wait.');
    
    if (!selectedPostKey || !userId) {
      setToastMessage('No post or user ID selected.');
      setIsScheduling(false);
      return;
    }
    const post = localPosts.find(p => p.key === selectedPostKey);
    if (!post) {
      setToastMessage('Selected post not found.');
      setIsScheduling(false);
      return;
    }
    const scheduleTime = new Date(scheduleDateTime);
    const now = new Date();
    const minSchedule = new Date(now.getTime() + 60 * 1000);
    if (scheduleTime < minSchedule) {
      setToastMessage('Schedule time must be at least 1 minute in the future.');
      setIsScheduling(false);
      return;
    }

    try {
      console.log(`[Schedule] Updating post status to scheduled for ${selectedPostKey}`);
      const updateStatusUrl = getApiUrl('/api/update-post-status', `/${username}`);
      const statusUpdateResponse = await fetch(updateStatusUrl, {
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
          setIsScheduling(false);
          return;
        }
      } else {
        // ✨ BULLETPROOF: Handle missing image key for ALL image-required platforms
        if (platform === 'instagram' || platform === 'facebook') {
          setToastMessage(`Could not determine image for ${platform} post.`);
          setIsScheduling(false);
          return;
        }
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
    
    // ✨ BULLETPROOF: Mark post as permanently processed if successfully scheduled
    if (result.success) {
      console.log(`[Schedule] 🚫 Marking post ${selectedPostKey} as permanently processed (manually scheduled)`);
      markPostAsProcessed(selectedPostKey, 'manually-scheduled');
      
      // 🔥 ENHANCED: Force refresh after scheduling to ensure status is updated
      setTimeout(() => {
        console.log(`[Schedule] 🔄 Forcing refresh after scheduling to update status`);
        handleRefreshPosts();
      }, 2000); // 2 second delay to ensure R2 update is processed
    }
    
    setIsScheduling(false);
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
    
    // 🎯 GENIUS: Enhanced pattern matching for edit functionality
    
    // Pattern 1: Standard format - ready_post_<ID>.json → image_<ID>.(extension)
    const standardMatch = key.match(/ready_post_(\d+)\.json$/);
    if (standardMatch) {
      const imageId = standardMatch[1];
      console.log(`[Edit] Standard pattern detected, ID: ${imageId}`);
      
      // Determine the correct extension from post data
      let extension = 'jpg'; // Default
      if (post.data?.image_path) {
        const pathMatch = post.data.image_path.match(/\.(jpg|jpeg|png|webp)$/i);
        if (pathMatch) extension = pathMatch[1].toLowerCase();
      } else if (post.data?.image_url) {
        const urlMatch = post.data.image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        if (urlMatch) extension = urlMatch[1].toLowerCase();
      } else if (post.data?.r2_image_url) {
        const urlMatch = post.data.r2_image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        if (urlMatch) extension = urlMatch[1].toLowerCase();
      }
      
      imageKey = `image_${imageId}.${extension}`;
      console.log(`[Edit] Standard pattern result: ${imageKey}`);
    }
    
    // Pattern 2: Campaign format - campaign_ready_post_<ID>_<hash>.json → campaign_ready_post_<ID>_<hash>.(extension)
    else {
      const campaignMatch = key.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
      if (campaignMatch) {
        const campaignId = campaignMatch[1]; // This includes both ID and hash
        console.log(`[Edit] Campaign pattern detected, ID: ${campaignId}`);
        
        // Determine the correct extension from post data
        let extension = 'jpg'; // Default
        if (post.data?.image_path) {
          const pathMatch = post.data.image_path.match(/\.(jpg|jpeg|png|webp)$/i);
          if (pathMatch) extension = pathMatch[1].toLowerCase();
        } else if (post.data?.image_url) {
          const urlMatch = post.data.image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
          if (urlMatch) extension = urlMatch[1].toLowerCase();
        } else if (post.data?.r2_image_url) {
          const urlMatch = post.data.r2_image_url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
          if (urlMatch) extension = urlMatch[1].toLowerCase();
        }
        
        imageKey = `campaign_ready_post_${campaignId}.${extension}`;
        console.log(`[Edit] Campaign pattern result: ${imageKey}`);
      }
      
      // Pattern 3: Legacy fallback - extract from existing URLs
      else {
        console.log(`[Edit] Using legacy fallback pattern detection`);
        
        // Try campaign pattern from URL first
        if (post.data.image_url) {
          const campaignUrlMatch = post.data.image_url.match(/(campaign_ready_post_\d+_[a-f0-9]+\.(jpg|jpeg|png|webp))/i);
          if (campaignUrlMatch) {
            imageKey = campaignUrlMatch[1];
            console.log(`[Edit] Legacy campaign pattern from image_url: ${imageKey}`);
          }
          // Try standard pattern from URL
          else {
            const standardUrlMatch = post.data.image_url.match(/(image_\d+\.(jpg|jpeg|png|webp))/i);
            if (standardUrlMatch) {
              imageKey = standardUrlMatch[1];
              console.log(`[Edit] Legacy standard pattern from image_url: ${imageKey}`);
            }
          }
        }
        
        // Additional fallback: extract from r2_image_url if available
        if (!imageKey && post.data.r2_image_url) {
          const campaignUrlMatch = post.data.r2_image_url.match(/(campaign_ready_post_\d+_[a-f0-9]+\.(jpg|jpeg|png|webp))/i);
          if (campaignUrlMatch) {
            imageKey = campaignUrlMatch[1];
            console.log(`[Edit] Legacy campaign pattern from r2_image_url: ${imageKey}`);
          }
          // Try standard pattern
          else {
            const standardUrlMatch = post.data.r2_image_url.match(/(image_\d+\.(jpg|jpeg|png|webp))/i);
            if (standardUrlMatch) {
              imageKey = standardUrlMatch[1];
              console.log(`[Edit] Legacy standard pattern from r2_image_url: ${imageKey}`);
            }
          }
        }
      }
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

    // ✨ BULLETPROOF: Mark rejected post as permanently processed
    markPostAsProcessed(key, 'rejected');

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

      // Ensure we fall back to a safe default if the value is missing, zero, or negative
      let delay = parseInt(data?.Posting_Delay_Intervals);
      if (isNaN(delay) || delay <= 0) {
        console.warn(`[AutoSchedule] Invalid delay received ("${data?.Posting_Delay_Intervals}"), defaulting to 6 hours`);
        delay = 6;
      }

      console.log(`[AutoSchedule] Using time delay from endpoint: ${delay} hours`);
      return delay;
    } catch (err) {
      console.warn(`[AutoSchedule] Failed to fetch time delay from endpoint, using default 6 hours:`, err);
      return 6; // Changed default from 12 to 6 hours as specified in requirements
    }
  };

  // Helper function to extract image key from post data (moved before auto-schedule)
  const extractImageKey = useCallback((post: any): string | null => {
    try {
      let imageKey = '';
      
      console.log(`[extractImageKey] 🔍 Processing post:`, {
        key: post.key,
        platform: platform,
        hasImageUrl: !!post.data?.image_url,
        hasR2ImageUrl: !!post.data?.r2_image_url,
        imageUrl: post.data?.image_url,
        r2ImageUrl: post.data?.r2_image_url
      });
      
      // Helper to detect original extension from URLs - updated to prefer PNG for edited images
      const detectExt = () => {
        const url = post.data?.r2_image_url || post.data?.image_url || '';
        const m = url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
        
        // If URL indicates edited image or we see PNG, prefer PNG (for edited images)
        if (url.includes('edited=true') || (m && m[1].toLowerCase() === 'png')) {
          return 'png';
        }
        
        return m ? m[1].replace('jpeg', 'jpg').toLowerCase() : 'jpg';
      };

      // Method 1: Check for edited images first (highest priority for Post Now after Canvas Editor)
      if (post.key) {
        // Handle campaign posts: campaign_ready_post_123_hash.json -> edited_campaign_ready_post_123_hash.png
        if (post.key.includes('campaign_ready_post_') && post.key.endsWith('.json')) {
          const baseName = post.key.replace(/^.*\/([^\/]+)\.json$/, '$1');
          const editedImageKey = `edited_${baseName}.png`;
          
          // Check if this looks like it could be an edited image
          if (post.data?.r2_image_url && 
              (post.data.r2_image_url.includes('edited=true') || 
               post.data.r2_image_url.includes('.png') ||
               post.data.r2_image_url.includes('edited_'))) {
            imageKey = editedImageKey;
            console.log(`[extractImageKey] ✅ Edited campaign image pattern detected: ${imageKey}`);
          }
        }
        // Handle regular posts: ready_post_123.json -> edited_image_123.png
        else if (post.key.includes('ready_post_') && post.key.endsWith('.json')) {
          const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
          if (postIdMatch && postIdMatch[1]) {
            const editedImageKey = `edited_image_${postIdMatch[1]}.png`;
            
            // Check if this looks like it could be an edited image
            if (post.data?.r2_image_url && 
                (post.data.r2_image_url.includes('edited=true') || 
                 post.data.r2_image_url.includes('.png') ||
                 post.data.r2_image_url.includes('edited_'))) {
              imageKey = editedImageKey;
              console.log(`[extractImageKey] ✅ Edited regular image pattern detected: ${imageKey}`);
            }
          }
        }
      }

      // Method 2: Extract from post key (standard patterns)
      if (!imageKey && post.key) {
        // Campaign pattern: campaign_ready_post_...json -> same basename with real ext
        if (post.key.includes('campaign_ready_post_') && post.key.endsWith('.json')) {
          const baseName = post.key.replace(/^.*\/([^\/]+)\.json$/, '$1');
          imageKey = `${baseName}.${detectExt()}`;
          console.log(`[extractImageKey] ✅ Campaign pattern match: ${imageKey}`);
        }
        // Regular pattern: ready_post_<ts>.json -> image_<ts>.<ext>
        else if (post.key.match(/ready_post_\d+\.json$/)) {
          const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
          if (postIdMatch && postIdMatch[1]) {
            imageKey = `image_${postIdMatch[1]}.${detectExt()}`;
            console.log(`[extractImageKey] ✅ Standard pattern match: ${imageKey}`);
          }
        }
      }
      
      // Method 3: Extract from image URL if available (for both direct R2 URLs and API URLs)
      if (!imageKey && (post.data?.image_url || post.data?.r2_image_url)) {
        const imageUrl = post.data.image_url || post.data.r2_image_url;
        
        // Try to extract image filename from URL including edited images
        const urlPatterns = [
          /(edited_[^\/]+\.(?:jpg|jpeg|png|webp))/i,
          /(image_\d+\.(?:jpg|jpeg|png|webp))/i,
          /(campaign_ready_post_\d+_[a-f0-9]+\.(?:jpg|jpeg|png|webp))/i,
          /\/([^\/]+\.(?:jpg|jpeg|png|webp))(?:\?|$)/i
        ];
        
        for (const pattern of urlPatterns) {
          const urlMatch = imageUrl.match(pattern);
          if (urlMatch && urlMatch[1]) {
            imageKey = urlMatch[1];
            console.log(`[extractImageKey] ✅ URL pattern match: ${imageKey} from ${imageUrl}`);
            break;
          }
        }
      }
      
      // Method 4: Fallback for Facebook/platform-specific patterns if still no key
      if (!imageKey && post.key) {
        console.log(`[extractImageKey] ⚠️ No standard pattern found, trying fallbacks for ${platform}`);
        
        // Try extracting any numeric ID and create a standard image key - FIXED: validate the extracted ID
        const idMatch = post.key.match(/(\d+)/);
        if (idMatch && idMatch[1] && idMatch[1].length > 0) {
          imageKey = `image_${idMatch[1]}.${detectExt()}`;
          console.log(`[extractImageKey] 🔄 Fallback pattern created: ${imageKey}`);
        } else {
          console.warn(`[extractImageKey] ⚠️ Could not extract valid numeric ID from post key: ${post.key}`);
        }
      }
      
      console.log(`[extractImageKey] 🎯 Final result: imageKey="${imageKey}" for post key="${post.key}"`);
      return imageKey || null;
    } catch (error) {
      console.error(`[extractImageKey] ❌ Error extracting imageKey:`, error);
      return null;
    }
  }, [platform]);

  // Enhanced image fetching with comprehensive error handling and fallbacks (moved before auto-schedule)
  const fetchImageBlob = useCallback(async (post: any, purpose: string = 'general'): Promise<Blob | null> => {
    try {
      const imageKey = extractImageKey(post);
      if (!imageKey) {
        throw new Error('Could not determine image key for post');
      }
      
      console.log(`[PostCooked] 📤 Fetching image for ${purpose}: ${imageKey}`);
      
             // Try multiple endpoints with fallbacks
       const endpoints = [
         // Primary: Use R2 image proxy endpoint that handles CORS properly
         `${API_BASE_URL}/api/r2-image/${username}/${imageKey}?platform=${platform}`,
         // Fallback 1: Proxy-image endpoint for local files
         `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(`${API_BASE_URL}/ready_post/${platform}/${username}/${imageKey}`)}`,
         // Fallback 2: Fix-image endpoint if it exists
         `${API_BASE_URL}/fix-image/${username}/${imageKey}?platform=${platform}`
       ].filter(Boolean); // Remove undefined URLs
      
      let lastError: Error | null = null;
      
      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        console.log(`[PostCooked] 🎯 Trying endpoint ${i + 1}/${endpoints.length}: ${endpoint}`);
        
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Accept': 'image/*,*/*',
              'Cache-Control': purpose === 'postNow' ? 'no-cache' : 'default'
            }
          });
          
          console.log(`[PostCooked] 📊 Response ${i + 1}: Status ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Check content type
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
            if (contentType.includes('text/html')) {
              const htmlContent = await response.text();
              console.warn(`[PostCooked] ⚠️ Endpoint ${i + 1} returned HTML (probably error page): ${htmlContent.substring(0, 200)}...`);
              throw new Error(`Invalid content type: ${contentType} (HTML error page)`);
            }
            throw new Error(`Invalid content type: ${contentType}. Expected image data.`);
          }
          
          const imageBlob = await response.blob();
          
          // Validate image blob
          if (!imageBlob || imageBlob.size === 0) {
            throw new Error('Empty image blob received');
          }
          
          if (imageBlob.size < 100) {
            throw new Error(`Image too small: ${imageBlob.size} bytes (likely corrupted)`);
          }
          
          // Check blob type
          if (!['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'].includes(imageBlob.type)) {
            console.warn(`[PostCooked] ⚠️ Unusual blob type: ${imageBlob.type}, but proceeding`);
          }
          
          console.log(`[PostCooked] ✅ Image fetched successfully from endpoint ${i + 1}: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
          return imageBlob;
          
        } catch (endpointError: any) {
          console.warn(`[PostCooked] ⚠️ Endpoint ${i + 1} failed: ${endpointError.message}`);
          lastError = endpointError;
          continue;
        }
      }
      
      // All endpoints failed
      throw new Error(`All ${endpoints.length} endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
      
    } catch (error: any) {
      console.error(`[PostCooked] ❌ Image fetch failed for ${purpose}:`, error.message);
      return null;
    }
  }, [username, platform, extractImageKey]);

  // Helper function to refresh posts data
  const handleRefreshPosts = useCallback(async () => {
    if (!username || isRefreshing) return;
    
    console.log(`[PostCooked] 🔄 Starting manual refresh for ${username} on ${platform}`);
    setIsRefreshing(true);
    
    
    try {
      // 🔥 ENHANCED: Force fresh data with multiple cache-busting parameters
      const timestamp = Date.now();
      const randomBust = Math.random().toString(36).substr(2, 9);
      const refreshUrl = `${API_BASE_URL}/posts/${username}?platform=${platform}&nocache=${timestamp}&forceRefresh=true&t=${timestamp}&v=${randomBust}&realtime=true`;
      
      console.log(`[PostCooked] 📡 Fetching fresh posts from: ${refreshUrl}`);
      
      const response = await axios.get(refreshUrl, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Force-Refresh': 'true'
        },
        timeout: 15000 // Increased timeout for reliability
      });
      
      console.log(`[PostCooked] 📦 Received ${response.data.length} fresh posts`);
      
      // Clear all caches and force fresh data
      setLocalPosts(response.data);
      setImageErrors({});
      imageRefreshKey.current = timestamp; // Use timestamp for unique refresh
      
      
      console.log(`[PostCooked] ✅ Successfully refreshed ${response.data.length} posts with fresh data`);
      
    } catch (error: any) {
      console.error('[PostCooked] ❌ Error refreshing posts:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [username, platform, isRefreshing, localPosts, imageRefreshKey]);

  const handleAutoSchedule = async (intervalOverride?: number) => {
    if (!userId || !localPosts.length) {
      setToastMessage('❌ No user ID or posts to schedule.');
      return;
    }

    // ✅ PRE-VALIDATION: Check if user is connected for this platform
    if (!isConnected) {
  setToastMessage(`❌ Please connect your ${platform === 'twitter' ? 'Twitter' : platform === 'facebook' ? 'Facebook' : platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} account first.`);
      return;
    }

    // 🚫 CRITICAL FIX 1: Prevent multiple simultaneous auto-schedule operations
    if (autoScheduling) {
      setToastMessage('⚠️ Auto-scheduling already in progress. Please wait...');
      return;
    }

    // 🚫 CRITICAL FIX 2: Filter out already processed/scheduled posts BEFORE scheduling
    const filteredPosts = getFilteredPosts();
    
    if (filteredPosts.length === 0) {
      setToastMessage('✅ All posts are already processed. No posts available for scheduling.');
      return;
    }

    console.log(`[AutoSchedule] 🔍 Filtered posts: ${filteredPosts.length} unprocessed out of ${localPosts.length} total posts`);

    setAutoScheduling(true);
    setAutoScheduleProgress('🔍 Determining scheduling interval...');
    
    // ✨ ENHANCED: Initialize comprehensive progress tracking with FILTERED posts
    const totalPosts = filteredPosts.length;
    setAutoScheduleTracking({
      current: 0,
      total: totalPosts,
      successCount: 0,
      failureCount: 0,
      isRunning: true,
      processedPosts: []
    });
    
    let successCount = 0;
    let failureCount = 0;
    const processedPostKeys: string[] = [];
    
    try {
      // Enhanced time delay fetching with better error handling
      console.log(`[AutoSchedule] 🚀 Starting auto-schedule for ${totalPosts} ${platform} posts`);
      let delayHours = await fetchTimeDelay(intervalOverride);
      
      // Final sanity-check: never allow zero or negative intervals
      if (delayHours <= 0) {
        console.warn(`[AutoSchedule] Resolved interval (${delayHours}) is invalid, forcing to 6 hours.`);
        delayHours = 6;
      }
      
      console.log(`[AutoSchedule] ⏰ Using interval: ${delayHours} hours`);
      setAutoScheduleProgress(`⏰ Scheduling ${totalPosts} ${platform === 'twitter' ? 'tweets' : 'posts'} every ${delayHours} hours...`);
      
      // 🚫 CRITICAL FIX 3: Process only FILTERED posts to prevent duplicates
      for (let i = 0; i < filteredPosts.length; i++) {
        const post = filteredPosts[i];
        const postNumber = i + 1;
        
        // 🚫 CRITICAL FIX 4: Skip if post is already being processed or was processed
        if (processedPosts.has(post.key) || processedPostKeys.includes(post.key)) {
          console.log(`[AutoSchedule] ⚠️ Skipping already processed post: ${post.key}`);
          continue;
        }
        
        // 🚫 CRITICAL FIX 5: Immediately mark as being processed to prevent race conditions
        markPostAsProcessed(post.key, 'auto-schedule-in-progress');
        
        // ✨ ENHANCED: Update progress tracking in real-time
        setAutoScheduleTracking(prev => ({
          ...prev,
          current: postNumber,
          successCount,
          failureCount
        }));
        
        setAutoScheduleProgress(`📝 Processing ${platform === 'twitter' ? 'tweet' : 'post'} ${postNumber}/${totalPosts}...`);
        
        // Calculate schedule time for this post
        const baseTime = Date.now() + 60 * 1000; // Start 1 minute from now
        const scheduleTime = new Date(baseTime + (i * delayHours * 60 * 60 * 1000));
        
        console.log(`[AutoSchedule] 📅 Post ${postNumber} (${post.key}) scheduled for: ${scheduleTime.toISOString()}`);
        
        try {
          if (platform === 'twitter') {
            // ============= TWITTER SCHEDULING =============
            const caption = post.data.post?.caption || '';
            const finalCaption = caption.length > 280 ? caption.slice(0, 280) : caption.trim();
            
            console.log(`[AutoSchedule] 🐦 Twitter post ${postNumber}: "${finalCaption.substring(0, 50)}..."`);
            
            const response = await axios.post(`${API_BASE_URL}/api/schedule-tweet/${userId}`, {
              text: finalCaption,
              scheduled_time: scheduleTime.toISOString()
            }, {
              timeout: 10000, // 10 second timeout
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (response.data.success) {
              console.log(`[AutoSchedule] ✅ Tweet ${postNumber} scheduled successfully`);
              successCount++;
              processedPostKeys.push(post.key);
              setToastMessage(`✅ Tweet ${postNumber} scheduled for ${scheduleTime.toLocaleString()}`);
            } else {
              throw new Error(response.data.message || 'Unknown Twitter API error');
            }
            
          } else if (platform === 'facebook') {
            // ============= FACEBOOK SCHEDULING =============
            const caption = post.data.post?.caption || '';
            console.log(`[AutoSchedule] 📘 Facebook post ${postNumber}: "${caption.substring(0, 50)}..."`);
            
            const formData = new FormData();
            formData.append('caption', caption);
            formData.append('scheduleDate', scheduleTime.toISOString());
            formData.append('platform', 'facebook');

            // Enhanced image handling for Facebook using new robust method
            if (post.data.image_url) {
              try {
                setAutoScheduleProgress(`📷 Fetching image for Facebook post ${postNumber}...`);
                const imageBlob = await fetchImageBlob(post, 'facebookAutoSchedule');
                
                if (imageBlob && imageBlob.size > 0) {
                  // 🔥 FIX: Detect actual image format instead of hardcoding JPG
                  let detectedFormat = 'jpeg';
                  
                  // Check image blob type to detect actual format
                  if (imageBlob.type === 'image/png') {
                    detectedFormat = 'png';
                  } else if (imageBlob.type === 'image/webp') {
                    detectedFormat = 'webp';
                  }
                  // JPEG is the default
                  
                  formData.append('image', imageBlob, `facebook_post_${postNumber}.${detectedFormat}`);
                  console.log(`[AutoSchedule] 📷 Image added to Facebook post ${postNumber} (${imageBlob.size} bytes, format: ${detectedFormat})`);
                } else {
                  console.warn(`[AutoSchedule] ⚠️ Facebook post ${postNumber}: Image fetch failed, posting text-only`);
                }
              } catch (imgErr) {
                console.warn(`[AutoSchedule] ⚠️ Facebook post ${postNumber}: Image fetch failed, posting text-only`);
              }
            }

            const resp = await fetch(`${API_BASE_URL}/api/schedule-post/${userId}`, {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              throw new Error(errData.error || `HTTP ${resp.status}: ${resp.statusText}`);
            }

            await resp.json();
            console.log(`[AutoSchedule] ✅ Facebook post ${postNumber} scheduled successfully`);
            successCount++;
            processedPostKeys.push(post.key);
            setToastMessage(`✅ Facebook post ${postNumber} scheduled for ${scheduleTime.toLocaleString()}`);
            
          } else {
            // ============= INSTAGRAM SCHEDULING (NATIVE SCHEDULER) =============
            console.log(`[AutoSchedule] 📸 Instagram post ${postNumber}: Processing...`);
            
            // Enhanced image fetching using the new robust method
            setAutoScheduleProgress(`📷 Fetching image for Instagram post ${postNumber}...`);
            const imageBlob = await fetchImageBlob(post, 'autoSchedule');
            
            if (!imageBlob) {
              console.error(`[AutoSchedule] ❌ Image fetch failed for post ${postNumber}`);
              failureCount++;
              setToastMessage(`❌ Post ${postNumber} failed: Image fetch failed`);
              continue;
            }

            // Enhanced caption handling
            let caption = post.data.post?.caption || '';
            console.log(`[AutoSchedule] 📝 Original caption length: ${caption.length} chars`);
            
            if (caption.length > 2150) {
              console.warn(`[AutoSchedule] ✂️ Truncating caption from ${caption.length} to 2150 chars`);
              caption = caption.slice(0, 2150);
            }

            // Submit to our NATIVE Instagram scheduler
            const formData = new FormData();
            
            // 🔥 FIX: Detect actual image format instead of hardcoding JPG
            let detectedFormat = 'jpeg';
            
            // Check image blob type to detect actual format
            if (imageBlob.type === 'image/png') {
              detectedFormat = 'png';
            } else if (imageBlob.type === 'image/webp') {
              detectedFormat = 'webp';
            }
            // JPEG is the default
            
            formData.append('image', imageBlob, `auto_instagram_post_${postNumber}.${detectedFormat}`);
            formData.append('caption', caption);
            formData.append('scheduleDate', scheduleTime.toISOString());
            formData.append('platform', 'instagram');

            console.log(`[AutoSchedule] 📤 Submitting Instagram post ${postNumber} to NATIVE scheduler...`);
            
            const resp = await fetch(`${API_BASE_URL}/api/schedule-post/${userId}`, {
              method: 'POST',
              body: formData,
            });

            // 🚫 CRITICAL FIX: Handle duplicate scheduling errors gracefully
            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              
              // Handle duplicate error specifically
              if (resp.status === 409 && errData.error === 'Duplicate schedule detected') {
                console.log(`[AutoSchedule] ⚠️ Post ${postNumber}: Duplicate schedule detected, marking as processed`);
                processedPostKeys.push(post.key);
                successCount++; // Count as success since it's already scheduled
                setToastMessage(`⚠️ Post ${postNumber}: Already scheduled (duplicate prevented)`);
              } else {
                throw new Error(errData.error || `HTTP ${resp.status}: ${resp.statusText}`);
              }
            } else {
              const respData = await resp.json();
              console.log(`[AutoSchedule] ✅ Instagram post ${postNumber} scheduled successfully:`, respData.scheduleId);
              successCount++;
              processedPostKeys.push(post.key);
              setToastMessage(`✅ Instagram post ${postNumber} scheduled for ${scheduleTime.toLocaleString()}`);
            }
          }
          
        } catch (postError: any) {
          console.error(`[AutoSchedule] ❌ Failed to schedule ${platform} post ${postNumber}:`, postError.message);
          failureCount++;
          setToastMessage(`❌ Post ${postNumber} failed: ${postError.message}`);
          
          // Continue with next post rather than stopping entire process
          continue;
        }
        
        // Small delay between posts to prevent API spam
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // ✨ BULLETPROOF: Mark successfully processed posts as permanently processed
      if (processedPostKeys.length > 0) {
        console.log(`[AutoSchedule] 🧹 Permanently marking ${processedPostKeys.length} successfully scheduled posts as processed`);
        
        // Mark each post as permanently processed
        processedPostKeys.forEach(postKey => {
          markPostAsProcessed(postKey, 'auto-scheduled');
        });
        
        console.log(`[AutoSchedule] ✅ All ${processedPostKeys.length} posts marked as permanently processed`);
      }
      
      // Final results with enhanced completion tracking
      setAutoScheduleProgress(null);
      setAutoScheduleTracking(prev => ({
        ...prev,
        isRunning: false,
        processedPosts: processedPostKeys
      }));
      
      const resultMessage = `🎉 Auto-schedule completed! ✅ ${successCount} scheduled, ❌ ${failureCount} failed. Interval: ${delayHours}h`;
      setToastMessage(resultMessage);
      console.log(`[AutoSchedule] 🏁 COMPLETED: ${successCount}/${totalPosts} posts scheduled successfully`);
      
      // ✨ ENHANCED: Track usage if any posts were successfully scheduled
      if (successCount > 0) {
        console.log(`[AutoSchedule] 📊 Tracking usage for ${successCount} scheduled posts...`);
        const trackingSuccess = await trackRealPostCreation(platform, {
          scheduled: true,
          immediate: false,
          type: 'auto_schedule_batch'
        });
        
        if (!trackingSuccess) {
          console.warn(`[AutoSchedule] 🚫 Usage tracking failed for ${platform} - but posts were scheduled successfully`);
        } else {
          console.log(`[AutoSchedule] ✅ Usage tracking successful: ${successCount} posts tracked`);
        }
      }
      
    } catch (err: any) {
      console.error('[AutoSchedule] 💥 Fatal error during auto-scheduling:', err);
      setAutoScheduleProgress(null);
      setAutoScheduleTracking(prev => ({ ...prev, isRunning: false }));
      setToastMessage(`💥 Auto-scheduling failed: ${err.message}`);
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

  // ✨ NEW: Reimagine Image Feature Handlers
  const handleImageRightClick = useCallback((e: React.MouseEvent, postKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setShowContextMenu({
      x: e.clientX,
      y: e.clientY,
      postKey
    });
  }, []);
  
  const handleDownloadImage = useCallback(async (postKey: string) => {
    try {
      const post = localPosts.find(p => p.key === postKey);
      if (!post) return;
      
      // Get the cache-busted image URL with proper proxy endpoint
      const imageUrl = toOriginalQualityUrl(getReliableImageUrl(post, true));
      console.log('[Download] Image URL:', imageUrl);
      
      // Fetch the image as blob to ensure proper download
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} - ${response.statusText}`);
      }
      // Determine file extension from content-type
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      let fileExt = 'jpg';
      if (contentType.includes('png')) fileExt = 'png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) fileExt = 'jpg';
      else if (contentType.includes('gif')) fileExt = 'gif';
      else if (contentType.includes('bmp')) fileExt = 'bmp';
      else if (contentType.includes('webp')) fileExt = 'jpg'; // server converts webp to jpeg

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link with proper filename
      const link = document.createElement('a');
      link.href = url;
      link.download = `${username}_${postKey}_${Date.now()}.${fileExt}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(url);
      
      setToastMessage('✅ Image downloaded successfully!');
    } catch (error) {
      console.error('Failed to download image:', error);
      setToastMessage('❌ Failed to download image: ' + (error instanceof Error ? error.message : String(error)));
    }
    setShowContextMenu(null);
  }, [localPosts, username, getReliableImageUrl, toOriginalQualityUrl]);
  
  const handleReimagineSubmit = useCallback(async () => {
    if (!reimaginePostKey) return;
    
    setIsReimagining(true);
    setReimagineToastMessage('🎨 Reimagining your image...');
    
    try {
      console.log('[Reimagine] Sending request with data:', {
        username,
        postKey: reimaginePostKey,
        extraPrompt: reimagineExtraPrompt.trim(),
        platform
      });
      
      const response = await axios.post(`/api/reimagine-image`, {
        username,
        postKey: reimaginePostKey,
        extraPrompt: reimagineExtraPrompt.trim(),
        platform
      });
      
      console.log('[Reimagine] Response received:', response.data);
      
      if (response.data.success) {
        setReimagineToastMessage('🎉 Image reimagined successfully! Refreshing...');
        
        // Update the local post with new image information
        setLocalPosts(prev => 
          prev.map(post => 
            post.key === reimaginePostKey 
              ? {
                  ...post,
                  data: {
                    ...post.data,
                    image_url: response.data.newImageUrl,
                    r2_image_url: response.data.newImageUrl,
                    image_filename: response.data.newImageFilename,
                    image_path: response.data.newImageFilename
                  }
                }
              : post
          )
        );
        
        // Clear image cache to force reload
        setImageErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[reimaginePostKey];
          return newErrors;
        });
        
        // Force image refresh
        imageRefreshKey.current = Date.now();
        
        setTimeout(() => {
          setReimagineToastMessage(null);
          setShowReimagineModal(false);
          setReimaginePostKey(null);
          setReimagineExtraPrompt('');
        }, 2000);
      } else {
        throw new Error(response.data.error || 'Failed to reimagine image');
      }
    } catch (error: any) {
      console.error('Failed to reimagine image:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      const errorMessage = error.response?.data?.error || error.message || 'Failed to reimagine image';
      setReimagineToastMessage(`❌ ${errorMessage}`);
      
      setTimeout(() => {
        setReimagineToastMessage(null);
      }, 4000);
    } finally {
      setIsReimagining(false);
    }
  }, [reimaginePostKey, reimagineExtraPrompt, username, platform, imageRefreshKey]);
  
  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showContextMenu) {
        setShowContextMenu(null);
      }
    };
    
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  const handlePostNow = async (post: any) => {
    // ✅ PRE-ACTION CHECK: Verify post limits before proceeding
    const postAccessCheck = canUseFeature('posts');
    if (!postAccessCheck.allowed) {
      alert(postAccessCheck.reason || 'Posts feature is not available');
      return;
    }
    
    setSelectedPostForPosting(post);
    setShowPostNowModal(true);
  };

  const handleConfirmPostNow = async () => {
    if (!selectedPostForPosting || !userId) {
      console.error('[PostNow] Missing required data:', { selectedPostForPosting: !!selectedPostForPosting, userId });
      setToastMessage('Missing post or user information.');
      setIsPosting(false);
      setShowPostNowModal(false);
      return;
    }
    
    setIsPosting(true);
    // Close modal immediately for better UX
    setShowPostNowModal(false);
    setSelectedPostForPosting(null);
    
    // Show processing toast to confirm action was received
    setToastMessage('🚀 Post is processing... Please wait.');
    
    console.log(`[PostNow] 🚀 Starting PostNow process for user ${userId}`);
    
    // ✨ CUSTOMER NETWORK SUPPORT: Add retry mechanism for network issues
    let retryCount = 0;
    const maxRetries = 2; // Allow 2 retries for customer network issues
    
    while (retryCount <= maxRetries) {
      try {
        const post = selectedPostForPosting;
        const caption = post.data.post?.caption || '';
        
        if (retryCount > 0) {
          console.log(`[PostNow] 🔄 Retry attempt ${retryCount}/${maxRetries} for customer network reliability`);
          setToastMessage(`🔄 Retrying post... (attempt ${retryCount + 1}/${maxRetries + 1})`);
        }
        
        // ✅ PRE-VALIDATION: Check all requirements before starting
        console.log(`[PostNow] 🔍 Validating post requirements...`);
        
        // Validate platform connection
        if (!isConnected) {
          const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
          throw new Error(`${platformLabel} account not connected. Please connect your ${platformLabel} account first.`);
        }
        
        // Validate post data
        if (!post.key) {
          throw new Error('Post key is missing. Cannot identify post.');
        }
        
        // Validate caption length for Instagram
        if (platform === 'instagram' && caption.length > 2200) {
          throw new Error('Caption too long. Instagram captions must be under 2200 characters.');
        }
        
        console.log(`[PostNow] ✅ Pre-validation passed. Post key: ${post.key}, Caption length: ${caption.length}`);
        
        // Enhanced image fetching using the new robust method
        console.log(`[PostNow] 📷 Fetching image for posting...`);
        const imageBlob = await fetchImageBlob(post, 'postNow');
        
        // Image is required for Instagram; for Facebook we allow text-only fallback
        if (!imageBlob && platform === 'instagram') {
          throw new Error('Failed to fetch image for posting. Please try again or contact support.');
        }
        
        if (imageBlob) {
          // Additional image validation
          if (imageBlob.size < 1000) {
            throw new Error(`Image too small (${imageBlob.size} bytes). Please use a larger image.`);
          }
          
          if (imageBlob.size > 8 * 1024 * 1024) {
            throw new Error(`Image too large (${Math.round(imageBlob.size / 1024 / 1024)}MB). Please use an image under 8MB.`);
          }
          
          console.log(`[PostNow] ✅ Image validated: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
        }
        
        // Prepare form data
        const formData = new FormData();
        if (imageBlob) {
          formData.append('image', imageBlob, 'post_image.jpg');
        }
        formData.append('caption', caption);
        formData.append('platform', platform);
        formData.append('postKey', post.key);
        
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
        console.log(`[PostNow] 📤 Submitting to ${platformLabel} API for user ${userId}...`);
        console.log(`[PostNow] 📝 Caption preview: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
        
        // Make the API call with enhanced error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout - accommodates slower customer connections
        
        const endpoint = platform === 'facebook' ? '/api/post-facebook-now' : '/api/post-instagram-now';
        const postNowUrl = getApiUrl(endpoint, `/${userId}`);
        
        const response = await fetch(postNowUrl, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            // Don't set Content-Type header, let browser set it for FormData
          }
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[PostNow] 📊 ${platformLabel} API Response: Status ${response.status}`);
        
        // Enhanced response handling
        let responseData: any = {};
        let responseText = '';
        
        try {
          responseText = await response.text();
          console.log(`[PostNow] 📋 Raw response: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);
          
          if (responseText.trim()) {
            responseData = JSON.parse(responseText);
          }
        } catch (parseError) {
          console.warn(`[PostNow] ⚠️ Could not parse response as JSON: ${parseError}`);
          responseData = { rawResponse: responseText };
        }
        
        if (!response.ok) {
          // Enhanced error handling with detailed diagnosis
          let errorMessage = 'Unknown error occurred';
          
          if (response.status === 400) {
            errorMessage = responseData.error || responseData.message || 'Bad request - check your post content and try again';
          } else if (response.status === 401) {
            errorMessage = `${platformLabel} authentication failed. Please reconnect your ${platformLabel} account.`;
          } else if (response.status === 403) {
            errorMessage = `${platformLabel} API access denied. Your account may need verification.`;
          } else if (response.status === 429) {
            errorMessage = `${platformLabel} rate limit exceeded. Please wait a few minutes and try again.`;
          } else if (response.status >= 500) {
            errorMessage = `${platformLabel} server error. Please try again in a few minutes.`;
          } else {
            errorMessage = responseData.error || responseData.message || `HTTP ${response.status}: ${response.statusText}`;
          }
          
          console.error(`[PostNow] ❌ ${platformLabel} API Error (${response.status}):`, {
            status: response.status,
            statusText: response.statusText,
            responseData,
            responseText: responseText.substring(0, 1000)
          });
          
          throw new Error(errorMessage);
        }
        
        // Success handling
        console.log(`[PostNow] ✅ ${platformLabel} posting successful:`, responseData);
        
        // ✅ REAL USAGE TRACKING: Track actual post publication
        console.log(`[PostNow] 📊 Tracking usage...`);
        const trackingSuccess = await trackRealPostCreation(platform, {
          scheduled: false,
          immediate: true,
          type: 'instant_post_now'
        });
        
        if (!trackingSuccess) {
          console.warn(`[PostCooked] 🚫 Post publication blocked for ${platform} - limit reached`);
          setToastMessage('⚠️ Post was successful but usage limit reached. Upgrade to continue posting.');
          return;
        }
        
        console.log(`[PostCooked] ✅ Usage tracking successful: ${platform} post tracked`);
        
        // Update UI to reflect successful post
        setLocalPosts(prev => 
          prev.map(p => 
            p.key === selectedPostForPosting.key 
              ? { ...p, data: { ...p.data, status: 'posted' } }
              : p
          )
        );
        
        // Success message with post details
        const postId = responseData.id || responseData.post_id || 'unknown';
        setToastMessage(`🎉 Posted to ${platformLabel} successfully! Post ID: ${postId}`);
        
        // ✨ BULLETPROOF: Mark successfully posted post as permanently processed
        console.log(`[PostNow] 🚫 Marking successfully posted post ${post.key} as permanently processed`);
        markPostAsProcessed(post.key, 'posted-successfully');
        
        // Success - break retry loop
        break;
        
      } catch (error: any) {
        // ✨ CUSTOMER NETWORK SUPPORT: Implement smart retry logic
        const isNetworkError = error.name === 'AbortError' || 
                              error.message.includes('fetch') || 
                              error.message.includes('network') ||
                              error.message.includes('timeout');
        
        const isRetryableServerError = error.message.includes('server error') ||
                                      error.message.toLowerCase().includes('rate limit');
        
        if ((isNetworkError || isRetryableServerError) && retryCount < maxRetries) {
          retryCount++;
          console.warn(`[PostNow] 🔄 Network/server error, retrying (${retryCount}/${maxRetries}):`, error.message);
          
          // Progressive delay: 3s, 6s for network reliability
          const delayMs = retryCount * 3000;
          setToastMessage(`🔄 Network issue detected. Retrying in ${delayMs/1000} seconds... (${retryCount}/${maxRetries})`);
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue; // Retry the loop
        }
        
        // Non-retryable error or max retries reached
        console.error(`[PostNow] 💥 PostNow failed (attempt ${retryCount + 1}):`, {
          error: error.message,
          stack: error.stack,
          userId,
          postKey: selectedPostForPosting?.key,
          platform,
          retryCount
        });
        
        // User-friendly error messages
        let userMessage = error.message;
        
        if (error.name === 'AbortError') {
          userMessage = 'Upload timed out. This usually happens with slower internet connections. Please try again or use a smaller image.';
        } else if (error.message.includes('fetch')) {
          userMessage = 'Network connection interrupted. Please check your internet stability and try again.';
        } else if (error.message.includes('Failed to fetch image')) {
          userMessage = 'Could not load image. Please refresh the page and try again.';
        } else if (error.message.toLowerCase().includes('rate limit')) {
          userMessage = `${platform.charAt(0).toUpperCase() + platform.slice(1)} is temporarily limiting posts. Please wait 5 minutes and try again.`;
        } else if (error.message.includes('authentication') || error.message.includes('token')) {
          userMessage = `${platform.charAt(0).toUpperCase() + platform.slice(1)} connection expired. Please reconnect your ${platform.charAt(0).toUpperCase() + platform.slice(1)} account.`;
        }
        
        const finalMessage = retryCount > 0 
          ? `❌ PostNow failed after ${retryCount + 1} attempts: ${userMessage}`
          : `❌ PostNow failed: ${userMessage}`;
        
        setToastMessage(finalMessage);
        break; // Exit retry loop
      }
    }
    
    setIsPosting(false);
    console.log(`[PostNow] 🏁 PostNow process completed (attempts: ${retryCount + 1})`);
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

  // ✨ BULLETPROOF: Use comprehensive filtering for final display
  const filteredPosts = getFilteredPosts();

  return (
    <>
      <ErrorBoundary>
        <div className="post-cooked-container">
        <div className="post-cooked-header">
          <div className="section-header">
            <BsLightbulb className="section-icon" />
            <span>Cooked Posts</span>
            {getUnseenPostsCount() > 0 ? (
              <div className="content-badge minimal-badge" onClick={markPostsAsViewed}>
                <FaBell className="badge-icon" />
                <span className="badge-count">{getUnseenPostsCount()}</span>
              </div>
            ) : (
              <div className="content-badge minimal-badge viewed">
                <FaBell className="badge-icon" />
                <span className="badge-text">Viewed</span>
              </div>
            )}
          </div>
          <button 
            className="refresh-button minimal-refresh"
            onClick={handleRefreshPosts}
            disabled={isRefreshing}
            aria-label="Refresh posts"
          >
            {isRefreshing ? (
              <div className="refresh-spinner"></div>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="refresh-icon"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            )}
          </button>
        </div>
        <div className="auto-schedule-row">
          {platform === 'twitter' ? (
            <TwitterRequiredButton
              isConnected={isConnected}
              onClick={() => setShowIntervalModal(true)}
              className="minimal-auto-schedule-btn twitter"
              disabled={!filteredPosts.length || autoScheduling}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </TwitterRequiredButton>
          ) : platform === 'facebook' ? (
            <FacebookRequiredButton
              isConnected={isConnected}
              onClick={() => setShowIntervalModal(true)}
              className="minimal-auto-schedule-btn facebook"
              disabled={!filteredPosts.length || autoScheduling}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </FacebookRequiredButton>
          ) : (
            <InstagramRequiredButton
              isConnected={isConnected}
              onClick={() => setShowIntervalModal(true)}
              className="minimal-auto-schedule-btn instagram"
              disabled={!filteredPosts.length || autoScheduling}
            >
              {autoScheduling ? 'Auto-Scheduling...' : 'Auto-Schedule All'}
            </InstagramRequiredButton>
          )}
        </div>
        {showIntervalModal && ReactDOM.createPortal(
          <div className="auto-schedule-interval-modal">
            <div className="auto-schedule-interval-content">
              <h3 className="auto-schedule-interval-title">Set Auto-Schedule Interval</h3>
              <input
                type="number"
                min={1}
                step={1}
                value={intervalInput}
                onChange={e => setIntervalInput(e.target.value)}
                placeholder="Interval in hours (e.g. 4)"
                className="auto-schedule-interval-input"
                autoFocus
              />
              <div className="auto-schedule-interval-description">
                <strong>Priority System:</strong><br />
                1. Your custom interval (if provided)<br />
                2. Campaign timeline from goal settings<br />
                3. Default interval (6 hours)<br /><br />
                <strong>🧪 Testing Mode:</strong> Use the "Quick Test (5 min)" button for immediate testing without waiting for long intervals
              </div>
              <div className="auto-schedule-interval-actions">
                <button
                  className="auto-schedule-quick-btn"
                  onClick={() => {
                    setShowIntervalModal(false);
                    setIntervalInput('');
                    handleAutoSchedule(0.083); // 5 minutes (5/60 = 0.083 hours)
                  }}
                  disabled={autoScheduling}
                >🚀 Quick Test (5 min)</button>
                <button
                  className="auto-schedule-cancel-btn"
                  onClick={() => { setShowIntervalModal(false); setIntervalInput(''); }}
                >Cancel</button>
                <button
                  className="auto-schedule-start-btn"
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
          </div>,
          document.body
        )}
        {showScheduleModal && ReactDOM.createPortal(
          <div className="schedule-modal-overlay">
            <div className="schedule-modal-content">
              <h3 className="schedule-modal-title">Schedule Post</h3>
              <label className="schedule-modal-label">
                Select Date and Time
              </label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={e => setScheduleDateTime(e.target.value)}
                className="schedule-modal-input"
              />
              <div className="schedule-modal-actions">
                <button
                  className="schedule-cancel-button"
                  onClick={handleScheduleCancel}
                >Cancel</button>
                <button
                  className="schedule-submit-button"
                  onClick={handleScheduleSubmit}
                  disabled={!scheduleDateTime || isScheduling}
                  style={isScheduling ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                >{isScheduling ? 'Scheduling...' : 'Schedule'}</button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {showCanvasEditor && editingPost && ReactDOM.createPortal(
          <CanvasEditor
            username={username}
            userId={userId}
            onClose={handleCanvasClose}
            initialImageUrl={editingPost.imageUrl}
            postKey={editingPost.key}
            postCaption={editingPost.caption}
            platform={platform}
          />,
          document.body
        )}
        {autoScheduleProgress && (
          <div className="loading">{autoScheduleProgress}</div>
        )}
        
        {/* ✨ NEW: Auto-Schedule Progress Bar - Similar to Auto-Reply Progress */}
        {autoScheduleTracking.isRunning && (
          <motion.div
            className="auto-schedule-progress"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            style={{
              background: 'rgba(0, 255, 204, 0.08)',
              border: '1px solid rgba(0, 255, 204, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              margin: '16px 0',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '12px',
              color: '#00ffcc',
              fontWeight: 600
            }}>
              <span>🚀 Auto-Schedule Progress</span>
              <span>{autoScheduleTracking.current}/{autoScheduleTracking.total}</span>
            </div>
            
            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '12px'
            }}>
              <motion.div
                style={{
                  height: '100%',
                  background: 'rgba(0, 255, 204, 0.6)',
                  borderRadius: '4px',
                  width: `${autoScheduleTracking.total > 0 ? (autoScheduleTracking.current / autoScheduleTracking.total) * 100 : 0}%`
                }}
                initial={{ width: 0 }}
                animate={{ width: `${autoScheduleTracking.total > 0 ? (autoScheduleTracking.current / autoScheduleTracking.total) * 100 : 0}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '14px', 
              color: '#e0e0ff' 
            }}>
              <span>✅ Scheduled: {autoScheduleTracking.successCount}</span>
              <span>❌ Failed: {autoScheduleTracking.failureCount}</span>
              <span>⏳ Remaining: {autoScheduleTracking.total - autoScheduleTracking.current}</span>
            </div>
          </motion.div>
        )}
        {filteredPosts.length === 0 ? (
          <p className="no-posts">Start by creating your first post with your Account Manager with one prompt!</p>
        ) : (
          
          <div 
            className="posts-scroll-container" 
            ref={scrollContainerRef}
            onScroll={handleScroll}
          >
            <div className="post-list">
              {filteredPosts.map((post, index) => (
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
                      <OptimizedImage
                        src={profilePicUrl}
                        alt={`${username}'s profile picture`}
                        className="profile-pic"
                        width={24}
                        height={24}
                        aggressiveMobileOptimization={true}
                        maxWidth={60}
                        quality={0.6}
                        enableOptimization={true}
                        enableWebP={true}
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
                  {(() => {
                    // Ensure imageUrl is cache-busting after refresh
                    let imageUrl = getReliableImageUrl(post);
                    if (imageUrl && typeof imageUrl === 'string') {
                      const hasQuery = imageUrl.includes('?');
                      imageUrl += (hasQuery ? '&' : '?') + 'refreshKey=' + imageRefreshKey.current;
                      
                      // Add debug logging for edited posts
                      if (imageUrl.includes('edited_')) {
                        console.log(`[PostCooked] 🎯 Rendering EDITED image for ${post.key}: ${imageUrl}`);
                      }
                    }
                    const shouldShowPlaceholder = (post.key in imageErrors && imageErrors[post.key]?.failed && imageErrors[post.key]?.retryCount >= 3) || 
                                                !imageUrl;
                    
                    return shouldShowPlaceholder ? (
                      <ImagePlaceholder postKey={post.key} />
                    ) : (
                      <OptimizedImage
                        src={imageUrl}
                        alt="Post visual"
                        className={`post-image ${loadingImages.has(post.key) ? 'loading' : 'loaded'}`}
                        aggressiveMobileOptimization={true}
                        enableProgressiveLoading={true}
                        preserveOriginalForActions={true}
                        enableOptimization={false}
                        maxWidth={600}
                        quality={0.5}
                        width={600}
                        height={600}
                        aspectRatio="1 / 1"
                        isLCP={index === 0}
                        forceEagerLoading={index < 12}
                        sizes="(max-width: 768px) 100vw, 600px"
                        onLoadStart={() => {
                          console.log(`[PostCooked] Image load started for ${post.key}: ${imageUrl}`);
                          handleImageLoadStart(post.key);
                        }}
                        onLoad={(e) => {
                          console.log(`[PostCooked] Image loaded successfully for ${post.key}`);
                          handleImageLoad(post.key, e.target as HTMLImageElement);
                        }}
                        onError={(e) => {
                          console.log(`[PostCooked] ❌ Image load error for ${post.key}:`, imageUrl);
                          const target = e.target as HTMLImageElement;
                          handleImageError(post.key, target);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setShowContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            postKey: post.key
                          });
                        }}
                        key={`${post.key}-${imageRefreshKey.current}`}
                        style={{
                          backgroundColor: '#2a2a4a',
                          minHeight: '450px'
                        }}
                        // Smart optimization settings
                      />
                    );
                  })()}
                  {/* Removed social interaction icons */}
                  <div className="post-actions">
                    <div className="post-control-buttons">
                    {platform === 'twitter' ? (
                      <TwitterRequiredButton
                        isConnected={isConnected}
                        onClick={() => handleScheduleClick(post.key)}
                        className="schedule-button"
                        notificationPosition="bottom"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
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
                        notificationPosition="bottom"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
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
                        notificationPosition="bottom"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
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
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </motion.button>
                    {/* AI Edit button temporarily hidden - will be re-enabled in future
                    <motion.button
                      className="reimagine-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setReimaginePostKey(post.key);
                        setShowReimagineModal(true);
                      }}
                    >
                      <FaRobot />
                      AI Edit
                    </motion.button>
                    */}
                    {(platform === 'instagram' || platform === 'facebook') && isConnected && (
                      <motion.button
                        className="post-now-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handlePostNow(post)}
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
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
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
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
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
        
        {/* Scroll to top button */}
        {showScrollTop && filteredPosts.length > 5 && (
          <button 
            className="scroll-to-top-btn"
            onClick={scrollToTop}
            title="Scroll to top"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        </div>
      </ErrorBoundary>

      {/* Post Now Modal rendered as React Portal for absolute screen positioning */}
      {showPostNowModal && selectedPostForPosting && createPortal(
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
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '24px',
              padding: '28px',
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
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
                  background: 'rgba(255, 68, 68, 0.15)',
                  border: '1px solid rgba(255, 68, 68, 0.3)',
                  color: '#ff6b6b',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
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
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : 'rgba(0, 255, 204, 0.15)',
                  color: isPosting ? '#666' : '#00ffcc',
                  border: `1px solid ${isPosting ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 255, 204, 0.3)'}`,
                  padding: '10px 20px',
                  borderRadius: '12px',
                  cursor: isPosting ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease'
                }}
              >
                {isPosting ? '🔄 Posting...' : '📤 Yes, Post Now!'}
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
      
      {/* ✨ NEW: Context Menu for Image Right-Click */}
      {showContextMenu && createPortal(
        <div
          className="image-context-menu"
          style={{
            position: 'fixed',
            top: showContextMenu.y,
            left: showContextMenu.x,
            background: 'rgba(20, 20, 40, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '8px 0',
            minWidth: '160px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(20px)',
            zIndex: 10000,
            overflow: 'hidden'
          }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const post = localPosts.find(p => p.key === showContextMenu.postKey);
              if (post) {
                setPreviewImageUrl(toOriginalQualityUrl(getReliableImageUrl(post, true)));
              }
              setShowContextMenu(null);
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: '14px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 204, 0.1)';
              e.currentTarget.style.color = '#00ffcc';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#ffffff';
            }}
          >
            <FaPalette /> Preview Image
          </button>
          <button
            className="context-menu-item"
            onClick={() => handleDownloadImage(showContextMenu.postKey)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: '14px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 204, 0.1)';
              e.currentTarget.style.color = '#00ffcc';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#ffffff';
            }}
          >
            <FaDownload /> Download Image
          </button>
        </div>,
        document.body
      )}
      
      {/* ✨ NEW: Reimagine Image Modal - Temporarily hidden - will be re-enabled in future
      {showReimagineModal && createPortal(
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => !isReimagining && setShowReimagineModal(false)}
        >
          <motion.div
            className="reimagine-modal"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(20, 20, 40, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              borderRadius: '16px',
              backdropFilter: 'blur(20px)'
            }}
          >
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ 
                color: '#ffffff', 
                fontSize: '20px', 
                fontWeight: 'bold', 
                margin: '0 0 8px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                🎨 Reimagine Image
              </h3>
              <p style={{ 
                color: 'rgba(255, 255, 255, 0.7)', 
                fontSize: '14px', 
                margin: 0,
                lineHeight: '1.4'
              }}>
                Add improvements or modifications to generate a new version of this image.
              </p>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                color: '#ffffff', 
                fontSize: '14px', 
                fontWeight: '500',
                display: 'block',
                marginBottom: '8px'
              }}>
                Additional Prompt (Optional):
              </label>
              <textarea
                value={reimagineExtraPrompt}
                onChange={(e) => setReimagineExtraPrompt(e.target.value)}
                placeholder="e.g., make it more colorful, add sunset lighting, change to minimalist style..."
                disabled={isReimagining}
                style={{
                  width: '100%',
                  height: '100px',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(0, 255, 204, 0.3)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
              />
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              justifyContent: 'flex-end' 
            }}>
              <button
                onClick={() => setShowReimagineModal(false)}
                disabled={isReimagining}
                style={{
                  background: 'rgba(255, 68, 68, 0.15)',
                  border: '1px solid rgba(255, 68, 68, 0.3)',
                  color: '#ff6b6b',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: isReimagining ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.3s ease',
                  opacity: isReimagining ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReimagineSubmit}
                disabled={isReimagining}
                style={{
                  background: isReimagining 
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : 'rgba(0, 255, 204, 0.15)',
                  color: isReimagining ? '#666' : '#00ffcc',
                  border: `1px solid ${isReimagining ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 255, 204, 0.3)'}`,
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: isReimagining ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isReimagining ? (
                  <>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      borderTop: '2px solid #666',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Reimagining...
                  </>
                ) : (
                  '🎨 Reimagine'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
      */}
      
      {/* ✨ NEW: Reimagine Toast Messages - Temporarily hidden - will be re-enabled in future
      {reimagineToastMessage && createPortal(
        <motion.div
          className="reimagine-toast"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(20, 20, 40, 0.95)',
            color: '#ffffff',
            padding: '16px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(0, 255, 204, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(20px)',
            zIndex: 10001,
            fontSize: '14px',
            fontWeight: '500',
            maxWidth: '300px',
            wordWrap: 'break-word'
          }}
        >
          {reimagineToastMessage}
        </motion.div>,
        document.body
      )}
      */}
      {previewImageUrl && createPortal(
        <div
          className="image-preview-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000
          }}
          onClick={() => setPreviewImageUrl(null)}
          tabIndex={-1}
          onKeyDown={e => { if (e.key === 'Escape') setPreviewImageUrl(null); }}
        >
          <OptimizedImage
            src={previewImageUrl}
            alt="Preview"
            enableOptimization={false}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              background: '#222',
              objectFit: 'contain'
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
};

export default PostCooked;