import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { safeNavigate } from '../../utils/navigationGuard';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './MainDashboard.css';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { useAuth } from '../../context/AuthContext';
import { useAcquiredPlatforms } from '../../context/AcquiredPlatformsContext';
import PostScheduler from '../instagram/PostScheduler';
import TwitterCompose from '../twitter/TwitterCompose';
import UsageDashboard from './UsageDashboard';

import { schedulePost } from '../../utils/scheduleHelpers';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import { useUsage } from '../../context/UsageContext';
import GlobalUpgradeHandler from '../common/GlobalUpgradeHandler';
import { useProcessing } from '../../context/ProcessingContext';
import { safeFilter, safeMap, safeLength } from '../../utils/safeArrayUtils';

interface PlatformLoadingState {
  startTime: number;
  endTime: number;
  isComplete: boolean;
}

interface PlatformData {
  id: string;
  name: string;
  icon: string;
  claimed: boolean;   // User has submitted entry details and accessed platform
  connected: boolean; // User has connected their social account
  notifications: {
    total: number;
    breakdown: {
      cs_analysis: number;
      our_strategies: number;
      dms_comments: number;
      cooked_posts: number;
    };
  };
  route: string;
  characterLimit?: number;
  supportsImages?: boolean;
  supportsVideo?: boolean;
  loadingState?: PlatformLoadingState;
}

// Content data structure for instant posts
interface PostContent {
  text: string;
  images: File[];
  platformIds: string[];
  scheduleDate: Date | null;
}

const MainDashboard: React.FC = () => {
  const { processingState } = useProcessing();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'agent'>('overview');
  const { isConnected: isInstagramConnected, userId: instagramUserId, hasAccessed: hasAccessedInstagram = false } = useInstagram();
  const { isConnected: isTwitterConnected, userId: twitterUserId, hasAccessed: hasAccessedTwitter = false, refreshConnection: refreshTwitterConnection } = useTwitter();
  const { isConnected: isFacebookConnected, userId: facebookUserId, hasAccessed: hasAccessedFacebook = false } = useFacebook();
  const { currentUser } = useAuth();
  const { trackRealPostCreation, canUseFeature } = useFeatureTracking();
  const { usage, getUserLimits, refreshUsage } = useUsage();
  const [userName, setUserName] = useState<string>('');
  const [showInstantPostModal, setShowInstantPostModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFetchingNotificationsRef = useRef(false);
  
  // Platform-specific modals
  const [showInstagramScheduler, setShowInstagramScheduler] = useState<boolean>(false);
  const [showTwitterComposer, setShowTwitterComposer] = useState<boolean>(false);
  
  // Account Agent wishlist state
  const [isWishlisted, setIsWishlisted] = useState<boolean>(false);
  const [showWishlistConfirmation, setShowWishlistConfirmation] = useState<boolean>(false);
  

  
  // Platform time tracking state
  const [platformTimeData, setPlatformTimeData] = useState<Record<string, number>>({
    instagram: 0,
    twitter: 0,
    facebook: 0,
    linkedin: 0
  });
  
  // Real-time notification counts
  const [realTimeNotifications, setRealTimeNotifications] = useState<Record<string, number>>({
    instagram: 0,
    twitter: 0,
    facebook: 0,
    linkedin: 0
  });
  
  // Viewed content tracking
  const [viewedContent, setViewedContent] = useState<Record<string, Set<string>>>({
    instagram: new Set(),
    twitter: new Set(),
    facebook: new Set(),
    linkedin: new Set()
  });
  
  const [postContent, setPostContent] = useState<PostContent>({
    text: '',
    images: [],
    platformIds: [],
    scheduleDate: null
  });

  // Add new state for tracking loading states
  const [platformLoadingStates, setPlatformLoadingStates] = useState<Record<string, PlatformLoadingState>>(() => {
    const saved = localStorage.getItem('platformLoadingStates');
    return saved ? JSON.parse(saved) : {};
  });

  // Track completed platforms to never show loading again
  const [completedPlatforms, setCompletedPlatforms] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('completedPlatforms');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  // Save loading states to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('platformLoadingStates', JSON.stringify(platformLoadingStates));
  }, [platformLoadingStates]);

  // Save completed platforms to localStorage
  useEffect(() => {
    localStorage.setItem('completedPlatforms', JSON.stringify(Array.from(completedPlatforms)));
  }, [completedPlatforms]);

  // -------- Bullet-proof timer check using shared countdown key --------
  const getProcessingCountdownKey = (platformId: string) => `${platformId}_processing_countdown`;

  const getProcessingRemainingMs = (platformId: string): number => {
    // Never show timer for completed platforms
    if (completedPlatforms.has(platformId)) return 0;

    const raw = localStorage.getItem(getProcessingCountdownKey(platformId));
    if (!raw) return 0;
    const endTime = parseInt(raw, 10);
    if (Number.isNaN(endTime)) return 0;
    return Math.max(0, endTime - Date.now());
  };

  const isPlatformLoading = (platformId: string): boolean => {
    // Never show loading for completed platforms
    if (completedPlatforms.has(platformId)) return false;

    const remaining = getProcessingRemainingMs(platformId);
    if (remaining > 0) return true;

    // fallback to in-memory state
    const loadingState = platformLoadingStates[platformId];
    if (!loadingState) return false;
    return !loadingState.isComplete && Date.now() < loadingState.endTime;
  };

  // Function to start platform loading state
  const startPlatformLoading = (platformId: string, durationMinutes: number = 15) => {
    // Don't start loading for completed platforms
    if (completedPlatforms.has(platformId)) return;

    const now = Date.now();
    const newLoadingState: PlatformLoadingState = {
      startTime: now,
      endTime: now + (durationMinutes * 60 * 1000),
      isComplete: false
    };
    
    setPlatformLoadingStates(prev => ({
      ...prev,
      [platformId]: newLoadingState
    }));

    // Persist countdown so all tabs/routes share it
    const endTime = newLoadingState.endTime;
    localStorage.setItem(getProcessingCountdownKey(platformId), endTime.toString());
    // minimal info for ProcessingLoadingState UI
    localStorage.setItem(`${platformId}_processing_info`, JSON.stringify({ platform: platformId, username: currentUser?.displayName || '', startTime: now, endTime }));
  };

  // Function to complete platform loading
  const completePlatformLoading = (platformId: string) => {
    // Mark platform as completed
    setCompletedPlatforms(prev => new Set([...prev, platformId]));

    // Clean up all loading state data
    setPlatformLoadingStates(prev => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        isComplete: true
      }
    }));

    // Clean up localStorage
    localStorage.removeItem(getProcessingCountdownKey(platformId));
    localStorage.removeItem(`${platformId}_processing_info`);
  };

  // ✅ PLATFORM STATUS SYNC FIX: Improved platform access tracking
  const getPlatformAccessStatus = useCallback((platformId: string): boolean => {
    if (!currentUser?.uid) return false;
    
    // Check localStorage for platform access (fallback)
    const accessedFromStorage = localStorage.getItem(`${platformId}_accessed_${currentUser.uid}`) === 'true';
    
    // Check context status for platforms that have it (fallback)
    let accessedFromContext = false;
    if (platformId === 'instagram') accessedFromContext = hasAccessedInstagram;
    if (platformId === 'twitter') accessedFromContext = hasAccessedTwitter;
    if (platformId === 'facebook') accessedFromContext = hasAccessedFacebook;
    
    // If either localStorage or context shows accessed, return true
    // This ensures that once a user has submitted the entry form, they won't see it again
    return accessedFromStorage || accessedFromContext;
  }, [currentUser?.uid, hasAccessedInstagram, hasAccessedTwitter, hasAccessedFacebook]);

  // ✅ PLATFORM CONNECTION SYNC FIX: Improved connection status tracking
  const getPlatformConnectionStatus = useCallback((platformId: string): boolean => {
    switch (platformId) {
      case 'instagram':
        return isInstagramConnected && Boolean(instagramUserId);
      case 'twitter':
        return isTwitterConnected && Boolean(twitterUserId);
      case 'facebook':
        return isFacebookConnected && Boolean(facebookUserId);
      case 'linkedin':
        return false; // Not yet implemented
      default:
        return false;
    }
  }, [isInstagramConnected, isTwitterConnected, isFacebookConnected, instagramUserId, twitterUserId, facebookUserId]);

  // Simulate platform time tracking - in a real app, this would come from actual usage data
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const loadPlatformTimeData = () => {
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      const timeData: Record<string, number> = {};
      
      platforms.forEach(platform => {
        // Get platform access status using improved function
        const isAccessed = getPlatformAccessStatus(platform);
        
        if (isAccessed) {
          // Simulate time spent based on platform activity
          const baseTime = Math.floor(Math.random() * 120) + 30; // 30-150 minutes
          const storageKey = `platform_time_${platform}_${currentUser.uid}`;
          
          // Check if we have stored time, otherwise generate new
          const storedTime = localStorage.getItem(storageKey);
          if (storedTime) {
            timeData[platform] = parseInt(storedTime);
          } else {
            timeData[platform] = baseTime;
            localStorage.setItem(storageKey, baseTime.toString());
          }
        } else {
          timeData[platform] = 0;
        }
      });
      
      setPlatformTimeData(timeData);
    };
    
    loadPlatformTimeData();
    
    // Update time data every minute when platforms are active
    const interval = setInterval(() => {
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      platforms.forEach(platform => {
        const isAccessed = getPlatformAccessStatus(platform);
        if (isAccessed) {
          const storageKey = `platform_time_${platform}_${currentUser.uid}`;
          const currentTime = parseInt(localStorage.getItem(storageKey) || '0');
          const newTime = currentTime + Math.floor(Math.random() * 3); // Add 0-2 minutes randomly
          localStorage.setItem(storageKey, newTime.toString());
          setPlatformTimeData(prev => ({ ...prev, [platform]: newTime }));
        }
      });
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [currentUser?.uid, getPlatformAccessStatus]);

  // Fetch user's name from authentication
  useEffect(() => {
    if (currentUser) {
      // Get displayName or email from the currentUser object
      const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
      setUserName(name);
      
      // Load wishlist status from localStorage
      const wishlistStatus = localStorage.getItem(`agent_wishlisted_${currentUser.uid}`) === 'true';
      setIsWishlisted(wishlistStatus);
    }
  }, [currentUser]);

  // Check localStorage for platform access status for platforms not managed by contexts
  const hasAccessedLinkedIn = currentUser?.uid
    ? localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true'
    : false;

  // Check localStorage directly for Instagram and Twitter access status as a fallback
  const instagramAccessedInLocalStorage = currentUser?.uid 
    ? localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true' 
    : false;
    
  const twitterAccessedInLocalStorage = currentUser?.uid
    ? localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true'
    : false;

  // ✅ NOTIFICATION SYNC FIX: Improved notification counting
  const fetchRealTimeNotifications = useCallback(async () => {
    if (!currentUser?.uid || isFetchingNotificationsRef.current) return;
    
    isFetchingNotificationsRef.current = true;
    
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    const counts: Record<string, number> = {};
    
    // Get actually claimed platforms using improved function
        const claimedPlatforms = safeFilter(platforms, (platform: PlatformData) => getPlatformAccessStatus(platform.id));
    
    if (claimedPlatforms.length === 0) {
      // No claimed platforms, set all counts to 0
      platforms.forEach(platform => {
        counts[platform] = 0;
      });
      setRealTimeNotifications(counts);
      isFetchingNotificationsRef.current = false;
      return;
    }
    
    for (const platform of platforms) {
      try {
        let userId = null;
        if (platform === 'instagram' && instagramUserId) userId = instagramUserId;
        if (platform === 'twitter' && twitterUserId) userId = twitterUserId;
        if (platform === 'facebook' && facebookUserId) userId = facebookUserId;
        
        let totalCount = 0;
        
        // Only count notifications if platform is claimed (accessed)
        const isClaimedPlatform = getPlatformAccessStatus(platform);
        
        if (isClaimedPlatform) {
          // Real-time notifications (DMs/comments) - only if connected
          if (userId) {
            try {
              const response = await fetch(`/events-list/${userId}?platform=${platform}`);
              if (response.ok) {
                const notifications = await response.json();
                totalCount += notifications.length;
              }
            } catch (err) {
              console.warn(`Failed to fetch ${platform} notifications:`, err);
            }
          }
          
          // Get a real username for this platform instead of using dummy
          const platformUsername = localStorage.getItem(`${platform}_username_${currentUser.uid}`);
          if (platformUsername) {
            // Fetch strategies count
            try {
              const strategiesResponse = await fetch(`/api/retrieve-strategies/${platformUsername}?platform=${platform}`);
              if (strategiesResponse.ok) {
                const strategies = await strategiesResponse.json();
                // Defensive check: ensure strategies is an array before filtering
                if (Array.isArray(strategies)) {
                  // Count unseen strategies
                  const viewedKey = `viewed_strategies_${platform}_${platformUsername}`;
                  const viewedStrategies = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                  const unseenStrategies = safeFilter(strategies, (s: any) => !viewedStrategies.includes(s.key));
                  totalCount += unseenStrategies.length;
                }
              }
            } catch (err) {
              // Ignore strategy fetch errors - don't log to reduce console noise
            }
            
            // Fetch posts count  
            try {
              const postsResponse = await fetch(`/api/posts/${platformUsername}?platform=${platform}`);
              if (postsResponse.ok) {
                const posts = await postsResponse.json();
                // Defensive check: ensure posts is an array before filtering
                if (Array.isArray(posts)) {
                  // Count unseen posts
                  const viewedKey = `viewed_posts_${platform}_${platformUsername}`;
                  const viewedPosts = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                  const unseenPosts = safeFilter(posts, (p: any) => !viewedPosts.includes(p.key));
                  totalCount += unseenPosts.length;
                }
              }
            } catch (err) {
              // Ignore posts fetch errors - don't log to reduce console noise
            }
            
            // Fetch competitor analysis count
            try {
              const accountInfoResponse = await fetch(`/api/profile-info/${platformUsername}?platform=${platform}`);
              if (accountInfoResponse.ok) {
                const accountInfo = await accountInfoResponse.json();
                const competitors = accountInfo.competitors || [];
                
                if (competitors.length > 0) {
                  const competitorResponse = await fetch(`/api/retrieve-multiple/${platformUsername}?competitors=${competitors.join(',')}&platform=${platform}`);
                  if (competitorResponse.ok) {
                    const competitorData = await competitorResponse.json();
                    // Defensive check: ensure competitorData is an array before filtering
                    if (Array.isArray(competitorData)) {
                      // Count unseen competitor analysis
                      const viewedKey = `viewed_competitor_${platform}_${platformUsername}`;
                      const viewedCompetitor = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                      const unseenCompetitor = safeFilter(competitorData, (c: any) => !viewedCompetitor.includes(c.key || `${c.competitor}_${c.timestamp}`));
                      totalCount += unseenCompetitor.length;
                    }
                  }
                }
              }
            } catch (err) {
              // Ignore competitor fetch errors - don't log to reduce console noise
            }
          }
        }
        
        counts[platform] = totalCount;
      } catch (error) {
        console.warn(`Failed to fetch notifications for ${platform}:`, error);
        counts[platform] = 0;
      }
    }
    
    setRealTimeNotifications(counts);
    isFetchingNotificationsRef.current = false;
  }, [currentUser?.uid, instagramUserId, twitterUserId, facebookUserId, getPlatformAccessStatus]);

  // ✅ CLEAN MAIN DASHBOARD: No auto-refresh, just basic data loading
  useEffect(() => {
    console.log(`[MainDashboard] � Main dashboard mounted - basic data load`);
    
    // Only fetch initial data on mount, no auto-refresh
    if (currentUser?.uid) {
      refreshUsage();
      fetchRealTimeNotifications();
    }
    
  }, [currentUser?.uid]); // Only trigger when user changes

  // ✅ PLATFORM STATE MANAGEMENT FIX: Improved platform data structure
  const [platforms, setPlatforms] = useState<PlatformData[]>([
    {
      id: 'instagram',
      name: 'Instagram',
      icon: '/icons/instagram.svg',
      claimed: false, // Will be updated by useEffect
      connected: false, // Will be updated by useEffect
      notifications: {
        total: 0,
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: 'instagram', // Entry form route
      characterLimit: 2200,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: '/icons/twitter.svg',
      claimed: false, // Will be updated by useEffect
      connected: false, // Will be updated by useEffect
      notifications: {
        total: 0,
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: 'twitter-dashboard', // Fixed: removed leading slash
      characterLimit: 280,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: '/icons/facebook.svg',
      claimed: false, // Will be updated by useEffect
      connected: false, // Will be updated by useEffect
      notifications: {
        total: 0,
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: 'facebook-dashboard', // Fixed: removed leading slash
      characterLimit: 63206,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: '/icons/linkedin.svg',
      claimed: false, // Will be updated by useEffect
      connected: false,
      notifications: {
        total: 0,
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: 'linkedin-dashboard', // Fixed: removed leading slash
      characterLimit: 3000,
      supportsImages: true,
      supportsVideo: true
    }
  ]);

  // Get only connected platforms
  const connectedPlatforms = safeFilter(platforms, (p: PlatformData) => p.connected);

  // ✅ UNIFIED PLATFORM STATUS UPDATE: Single effect that handles both claimed and connected status
  useEffect(() => {
    setPlatforms(prev => 
      prev.map(platform => {
        const newClaimed = getPlatformAccessStatus(platform.id);
        const newConnected = getPlatformConnectionStatus(platform.id);
        
        // Only update if status actually changed
        if (platform.claimed !== newClaimed || platform.connected !== newConnected) {
          console.log(`[MainDashboard] 🔄 Platform ${platform.id} status update: claimed=${newClaimed}, connected=${newConnected}`);
          return { 
            ...platform, 
            claimed: newClaimed,
            connected: newConnected
          };
        }
        
        return platform;
      })
    );
  }, [getPlatformAccessStatus, getPlatformConnectionStatus]);

  // ✅ AUTO-COMPLETE CLAIMED PLATFORMS: Mark claimed platforms as completed to prevent timer
  useEffect(() => {
    platforms.forEach(platform => {
      // Only mark as completed if platform is claimed AND has no active timer
      if (platform.claimed && !completedPlatforms.has(platform.id)) {
        const remainingMs = getProcessingRemainingMs(platform.id);
        if (remainingMs === 0) {
          console.log(`[MainDashboard] ✅ Auto-marking claimed platform ${platform.id} as completed (no active timer)`);
          completePlatformLoading(platform.id);
        }
      }
    });
  }, [platforms, completedPlatforms]);

  // ✅ NOTIFICATION COUNT UPDATE: Separate effect for notification updates
  useEffect(() => {
    setPlatforms(prev => 
      prev.map(platform => {
        const platformNotificationCount = realTimeNotifications[platform.id] || 0;
        const currentNotificationCount = platform.notifications.total;
        
        // Only update if notification count actually changed and platform is claimed
        if (platform.claimed && currentNotificationCount !== platformNotificationCount) {
          console.log(`[MainDashboard] 🔔 Platform ${platform.id} notifications: ${platformNotificationCount}`);
          return {
            ...platform,
            notifications: {
              total: platformNotificationCount,
              breakdown: { cs_analysis: 0, our_strategies: 0, dms_comments: 0, cooked_posts: 0 }
            }
          };
        }
        
        return platform;
      })
    );
  }, [realTimeNotifications]);

  // ✅ PLATFORM STATUS MONITORING: Effect to monitor and refresh platform status
  useEffect(() => {
    let lastFocusTime = 0;
    const FOCUS_DEBOUNCE_MS = 2000;
    
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusTime < FOCUS_DEBOUNCE_MS) return;
      lastFocusTime = now;
      
      if (currentUser?.uid) {
        // Refresh Twitter connection if we don't already have one
        if (!twitterUserId) {
          refreshTwitterConnection();
        }
        
        // Refresh usage data
        refreshUsage();
        
        // Refresh notification counts for newly claimed platforms
        const hasNewClaims = platforms.some(platform => {
          const currentClaimed = getPlatformAccessStatus(platform.id);
          return currentClaimed && !platform.claimed;
        });
        
        if (hasNewClaims) {
          console.log('[MainDashboard] 🆕 New platform claims detected, refreshing notifications');
          fetchRealTimeNotifications();
        }
      }
    };

    // Check on initial mount with debounce
    const initialCheckTimer = setTimeout(handleFocus, 100);
    
    // Also check when window regains focus
    window.addEventListener('focus', handleFocus);
    return () => {
      clearTimeout(initialCheckTimer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.uid, refreshTwitterConnection, twitterUserId, refreshUsage, fetchRealTimeNotifications, getPlatformAccessStatus, platforms]);

  // Sort platforms so claimed ones appear first
  const sortedPlatforms = [...platforms].sort((a, b) => {
    if (a.claimed && !b.claimed) return -1;
    if (!a.claimed && b.claimed) return 1;
    return 0;
  });
  
  // Restore the markPlatformAccessed function
  const markPlatformAccessed = (platformId: string) => {
    if (!currentUser?.uid) return;
    
    localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    
    setPlatforms(prev => 
      prev.map(p => {
        if (p.id === platformId) {
          return { 
            ...p, 
            claimed: true,
            notifications: {
              ...p.notifications,
              total: p.notifications.breakdown.cs_analysis + 
                     p.notifications.breakdown.our_strategies + 
                     p.notifications.breakdown.dms_comments + 
                     p.notifications.breakdown.cooked_posts
            }
          };
        }
        return p;
      })
    );
  };

  const navigateToPlatform = (platform: PlatformData) => {
    const remainingMs = getProcessingRemainingMs(platform.id);
    
    // If platform is in loading state and time isn't complete
    if (remainingMs > 0) {
      const remainingTime = Math.ceil(remainingMs / 1000 / 60);
      safeNavigate(navigate, `/processing/${platform.id}`, {
        state: {
          platform: platform.id,
          username: currentUser?.displayName || '',
          remainingMinutes: remainingTime
        }
      }, 7);
      return;
    }
    
    // If platform is claimed but not connected and has no active timer, navigate normally
    if (platform.claimed && !platform.connected && remainingMs === 0) {
      // Navigate to the appropriate dashboard
      if (platform.id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6); // Instagram dashboard
      } else {
        safeNavigate(navigate, `/${platform.route}`, {}, 6);
      }
      return;
    }
    
    // If this is first access and not claimed, start loading state
    if (!isPlatformLoading(platform.id) && !platform.claimed) {
      startPlatformLoading(platform.id);
      safeNavigate(navigate, `/processing/${platform.id}`, {
        state: {
          platform: platform.id,
          username: currentUser?.displayName || '',
          remainingMinutes: 15
        }
      }, 7);
      return;
    }
    
    // Normal navigation if loading is complete or not required
    // Handle Instagram routing specifically
    if (platform.id === 'instagram') {
      if (platform.claimed) {
        safeNavigate(navigate, '/dashboard', {}, 6); // Instagram dashboard
      } else {
        safeNavigate(navigate, '/instagram', {}, 6); // Instagram entry form
      }
    } else {
      // All other platforms: add leading slash to route
      safeNavigate(navigate, `/${platform.route}`, {}, 6);
    }
  };

  // Add a function to navigate to the entry setup
  const navigateToSetup = (platformId: string) => {
    // Set a flag in localStorage to indicate that this platform should be marked as acquired upon successful submission
    if (currentUser?.uid) {
      localStorage.setItem(`mark_${platformId}_pending_${currentUser.uid}`, 'true');
    }

    if (platformId === 'instagram') {
      safeNavigate(navigate, '/instagram', { 
        state: { 
          platformId: 'instagram'
        } 
      }, 6);
    } else if (platformId === 'twitter') {
      safeNavigate(navigate, '/twitter', { 
        state: { 
          platformId: 'twitter'
        } 
      }, 6);
    } else if (platformId === 'facebook') {
      safeNavigate(navigate, '/facebook', { 
        state: { 
          platformId: 'facebook'
        } 
      }, 6);
    } else if (platformId === 'linkedin') {
      safeNavigate(navigate, '/linkedin', { 
        state: { 
          platformId: 'linkedin'
        } 
      }, 6);
    }
  };

  const handleConnectionButtonClick = (platform: PlatformData) => {
    // Always respect processing timer guard first
    if (isPlatformLoading(platform.id)) {
      const remainingMs = getProcessingRemainingMs(platform.id);
      const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
      safeNavigate(navigate, `/processing/${platform.id}`, {
        state: {
          platform: platform.id,
          username: currentUser?.displayName || '',
          remainingMinutes
        }
      }, 7);
      return;
    }

    if (!platform.connected) {
      // Navigate to platform dashboard using the platform's route
      if (platform.id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6);
      } else {
        // Use the platform's route for consistent navigation
        safeNavigate(navigate, `/${platform.route}`, {}, 6);
      }
    }
  };
  
  // Open the file selector for images
  const handleImageUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files);
      setPostContent(prev => ({
        ...prev,
        images: [...prev.images, ...newImages]
      }));
    }
  };
  
  // Remove an image from the post content
  const removeImage = (index: number) => {
    setPostContent(prev => ({
      ...prev,
              images: safeFilter(prev.images, (_, i) => i !== index)
    }));
  };
  
  // Toggle a platform selection for posting
  const togglePlatformSelection = (platformId: string) => {
    setPostContent(prev => {
      if (prev.platformIds.includes(platformId)) {
        return {
          ...prev,
          platformIds: safeFilter(prev.platformIds, id => id !== platformId)
        };
      } else {
        return {
          ...prev,
          platformIds: [...prev.platformIds, platformId]
        };
      }
    });
  };
  
  // Calculate remaining characters based on selected platforms
  const getRemainingCharacters = () => {
    if (postContent.platformIds.length === 0) return null;
    
    const selectedPlatforms = safeFilter(platforms, (p: PlatformData) => postContent.platformIds.includes(p.id));
    if (selectedPlatforms.length === 0) return null;
    
    const minCharLimit = Math.min(...safeMap(selectedPlatforms, (p: PlatformData) => p.characterLimit || Infinity));
    return minCharLimit === Infinity ? null : minCharLimit - postContent.text.length;
  };
  
  // Open the instant post modal without checking for connected platforms
  const openInstantPostModal = () => {
    // Pre-select connected platforms
    const connectedPlatformIds = safeMap(
      safeFilter(platforms, (p: PlatformData) => p.connected),
      (p: PlatformData) => p.id
    );
    
    setPostContent({
      text: '',
      images: [],
      platformIds: connectedPlatformIds,
      scheduleDate: null
    });
    
    setShowInstantPostModal(true);
  };
  
  // ✅ INSTANT POST FIX: Enhanced instant post handler with proper tracking
  const handleInstantPost = async () => {
    // Verify post has content
    if (postContent.text.trim() === '' && postContent.images.length === 0) {
      alert("Please enter some text or add an image for your post.");
      return;
    }
    
    // Get selected platforms that are connected
    const selectedPlatforms = safeFilter(platforms, (p: PlatformData) => 
      postContent.platformIds.includes(p.id) && p.connected
    );
    
    // If no platforms are connected, save as draft
    if (selectedPlatforms.length === 0) {
      alert("Your post has been saved as a draft.");
      setShowInstantPostModal(false);
      return;
    }
    
    // ✅ PRE-CHECK: Verify post usage limits for all selected platforms
    const postCheckResult = canUseFeature('posts');
    if (!postCheckResult.allowed) {
      // This will trigger the upgrade popup via event
      alert(postCheckResult.reason);
      setShowInstantPostModal(false);
      return;
    }
    
    // Validate Instagram has images if selected
    const hasInstagram = selectedPlatforms.some(p => p.id === 'instagram');
    if (hasInstagram && postContent.images.length === 0) {
      alert("Instagram posts require at least one image. Please add an image for Instagram or uncheck Instagram.");
      return;
    }
    
    // Close the instant post modal first
    setShowInstantPostModal(false);
    
    // Determine schedule time (immediate or scheduled)
    const scheduleTime = postContent.scheduleDate || new Date(Date.now() + 60 * 1000);
    const isScheduled = !!postContent.scheduleDate;
    
    // Process all selected platforms simultaneously
    const results: Array<{platform: string, success: boolean, message: string}> = [];
    
    for (const platform of selectedPlatforms) {
      try {
        console.log(`[MainDashboard] 📝 Processing post for ${platform.name}...`);
        
        // ✅ REAL USAGE TRACKING: Check limits BEFORE creating the post
        const trackingSuccess = await trackRealPostCreation(platform.id, {
          scheduled: isScheduled,
          immediate: !isScheduled,
          type: 'multi_platform_post'
        });
        
        if (!trackingSuccess) {
          console.warn(`[MainDashboard] 🚫 Post creation blocked for ${platform.name} - limit reached`);
          results.push({
            platform: platform.name,
            success: false,
            message: 'Usage limit reached - upgrade to continue'
          });
          continue; // Skip this platform and continue with others
        }
        
        // Call the existing schedule functionality
        const result = await schedulePost({
          platform: platform.id as 'instagram' | 'twitter' | 'facebook',
          userId: currentUser?.uid || '',
          imageBlob: postContent.images[0],
          caption: postContent.text,
          scheduleTime: scheduleTime,
          postKey: undefined
        });
        
        if (result.success) {
          console.log(`[MainDashboard] ✅ Post ${isScheduled ? 'scheduled' : 'created'} for ${platform.name} with usage tracking`);
        }
        
        results.push({
          platform: platform.name,
          success: result.success,
          message: result.message
        });
        
      } catch (error) {
        console.error(`Error posting to ${platform.name}:`, error);
        results.push({
          platform: platform.name,
          success: false,
          message: `Failed to post to ${platform.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
    
    // Show consolidated results
    const successfulPosts = safeFilter(results, (r: {platform: string, success: boolean, message: string}) => r.success);
    const failedPosts = safeFilter(results, (r: {platform: string, success: boolean, message: string}) => !r.success);
    
    let alertMessage = '';
    
    if (successfulPosts.length > 0) {
      const action = postContent.scheduleDate ? 'scheduled' : 'posted';
      alertMessage += `✅ Successfully ${action} to: ${safeMap(successfulPosts, (r: {platform: string, success: boolean, message: string}) => r.platform).join(', ')}\n`;
      alertMessage += `📊 Usage tracked for ${successfulPosts.length} platform(s)\n`;
    }
    
    if (failedPosts.length > 0) {
      alertMessage += `❌ Failed to post to: ${safeMap(failedPosts, (r: {platform: string, success: boolean, message: string}) => `${r.platform} (${r.message})`).join(', ')}`;
    }
    
    alert(alertMessage);
    
    // Reset the post content
    setPostContent({
      text: '',
      images: [],
      platformIds: [],
      scheduleDate: null
    });
  };

  // Handle change of schedule date
  const handleScheduleDateChange = (date: Date | null) => {
    setPostContent(prev => ({
      ...prev,
      scheduleDate: date
    }));
  };

  // Handle notification click to mark content as viewed
  const handleNotificationClick = (platformId: string) => {
    setViewedContent(prev => ({
      ...prev,
      [platformId]: new Set() // Reset viewed content when clicking notification
    }));
    
    // Navigate to platform
    const platform = platforms.find(p => p.id === platformId);
    if (platform?.claimed) {
      navigateToPlatform(platform);
    } else {
      navigateToSetup(platformId);
    }
  };



  // Calculate total API calls for the usage section
  const getTotalApiCalls = () => {
    const limits = getUserLimits();
    return usage.posts + usage.aiReplies + usage.discussions;
  };

  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'instagram') {
      navigate('/processing/instagram', { replace: true });
    }
  }, [processingState, navigate]);

  return (
    <div className="dashboard-page">
      <GlobalUpgradeHandler />
      
      <div className="welcome-banner">
        <h2>Welcome <span className="user-name">{userName}</span>!</h2>
      </div>
      
      <motion.div
        className="main-dashboard-wrapper"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="main-dashboard-header">
          <h1>Account Dashboard</h1>
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
              onClick={() => setActiveTab('usage')}
            >
              Usage
            </button>
            <button 
              className={`tab ${activeTab === 'agent' ? 'active' : ''}`}
              onClick={() => setActiveTab('agent')}
            >
              Account Agent
            </button>
          </div>
        </div>

                {activeTab === 'overview' && (
          <div className="dashboard-content-grid">
            {/* Action Buttons Section - Premium Layout */}
            <div className="instant-post-section">
              <button 
                className="instant-post-button"
                onClick={openInstantPostModal}
                title="Create a post for your platforms"
              >
                <div className="instant-post-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M3,20V4A1,1 0 0,1 4,3H20A1,1 0 0,1 21,4V20A1,1 0 0,1 20,21H4A1,1 0 0,1 3,20M5,19H19V5H5V19M7.5,17L9.5,14L11.5,16.5L14.5,12.5L18.5,17H7.5Z" />
                  </svg>
                </div>
                <div className="instant-post-text">
                  <h3>Instant Post</h3>
                  <p>Create one post for all your connected platforms</p>
                </div>
                {connectedPlatforms.length > 0 && (
                  <div className="connected-platforms-count">
                    <span>{connectedPlatforms.length} connected</span>
                  </div>
                )}
              </button>
            </div>
              
            {/* Platform Cards Grid - Perfect Square Layout */}
            <div className="platforms-container">
              {sortedPlatforms.map(platform => (
                <div 
                  key={platform.id} 
                  className={`platform-row ${platform.claimed ? 'claimed' : 'unclaimed'}`}
                >
                  <div 
                    className="clickable-area"
                    onClick={() => platform.claimed ? navigateToPlatform(platform) : navigateToSetup(platform.id)}
                  >
                    <div className="platform-icon">
                      <img 
                        src={platform.icon} 
                        alt={`${platform.name} icon`}
                        onError={(e) => {
                          // Fallback for missing icons
                          const target = e.target as HTMLImageElement;
                          target.onerror = null; 
                          target.src = `/icons/default.svg`;
                        }}
                      />
                    </div>
                    
                    <div className="platform-name">
                      {platform.name}
                    </div>
                  </div>
                  
                  <div className="platform-info">
                    <div className="status-indicators">
                      <div 
                        className={`status-indicator ${platform.claimed ? 'claimed' : 'unclaimed'}`}
                      >
                        {platform.claimed ? 'Acquired' : 'Not Acquired'}
                      </div>
                      
                      <div 
                        className={`connection-indicator ${
                          platform.id === 'linkedin' && !platform.connected 
                            ? 'coming-soon' 
                            : platform.claimed 
                              ? (platform.connected ? 'connected' : 'disconnected')
                              : 'not-applicable'
                        }`}
                        onClick={() => platform.claimed && !platform.connected && platform.id !== 'linkedin' && handleConnectionButtonClick(platform)}
                        style={{ cursor: platform.claimed && !platform.connected && platform.id !== 'linkedin' ? 'pointer' : 'default' }}
                      >
                        {platform.id === 'linkedin' && !platform.connected 
                          ? 'Coming Soon' 
                          : !platform.claimed 
                            ? 'Not Applicable'
                            : platform.connected 
                              ? 'Connected' 
                              : 'Connect'}
                      </div>
                    </div>
                  </div>
                  
                  {platform.claimed && platform.notifications.total > 0 && (
                    <div className="notification-badge-container">
                      <div 
                        className="notification-badge"
                        onClick={() => handleNotificationClick(platform.id)}
                      >
                        <svg className="notification-bell-icon" viewBox="0 0 24 24" width="16" height="16" style={{marginRight: '4px'}}>
                          <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-5-6.32V4a1 1 0 1 0-2 0v.68C7.63 5.36 6 7.92 6 11v5l-1.29 1.29A1 1 0 0 0 6 19h12a1 1 0 0 0 .71-1.71L18 16zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" fill="#fff"/>
                        </svg>
                        <span className="notification-number">{platform.notifications.total}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
            
            {/* Platform-specific post components */}
            {showInstagramScheduler && instagramUserId && (
              <PostScheduler 
                userId={instagramUserId}
                onClose={() => setShowInstagramScheduler(false)}
              />
            )}
            
            {showTwitterComposer && twitterUserId && (
              <TwitterCompose 
                userId={twitterUserId}
                onClose={() => setShowTwitterComposer(false)}
              />
        )}
        
        {activeTab === 'usage' && (
          <div className="usage-container">
            <UsageDashboard />
            
            <div className="platform-usage-stats">
            <div className="usage-header">
              <h2>Platform Usage</h2>
            </div>
            
            <div className="usage-stats">
              <div className="usage-stat">
                <div className="stat-icon claimed">
                  <svg viewBox="0 0 24 24">
                    <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Claimed Platforms</h4>
                  <p className="stat-value">{safeLength(safeFilter(platforms, (p: PlatformData) => p.claimed))}</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon connected">
                  <svg viewBox="0 0 24 24">
                    <path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Connected APIs</h4>
                  <p className="stat-value">{safeLength(safeFilter(platforms, (p: PlatformData) => p.connected))}</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon api">
                  <svg viewBox="0 0 24 24">
                    <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Total API Calls</h4>
                  <p className="stat-value">{getTotalApiCalls().toLocaleString()}</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon ai inactive">
                  <svg viewBox="0 0 24 24">
                    <path d="M21,15.61L19.59,17.02L17.7,15.13L16.29,16.54L18.17,18.44L16.76,19.85L14.87,17.95L13.46,19.36L15.35,21.25L13.94,22.66L9.17,17.88L17.88,9.17L22.66,13.94L21.25,15.35L19.35,13.46L17.95,14.87L19.84,16.76L18.43,18.17L16.54,16.29L15.13,17.7L17.02,19.59L15.61,21L13.71,19.1L12.3,20.51L14.19,22.41L12.78,23.82L8,19.05V21H3V16L4.95,17.95L6.36,16.54L4.46,14.64L5.87,13.23L7.77,15.13L9.18,13.72L7.28,11.82L8.69,10.41L10.59,12.31L12,10.9L10.1,9L11.51,7.59L13.41,9.49L14.82,8.08L12.92,6.18L14.33,4.77L18.55,9L19.96,7.59L15.75,3.38L17.16,1.97L22.25,7.06L21.26,8.04L19.37,6.15L17.96,7.56L19.85,9.46L18.44,10.87L16.55,8.97L15.14,10.38L17.03,12.28L15.62,13.69L13.73,11.79L12.32,13.2L14.21,15.1L12.8,16.51L10.91,14.61L9.5,16.02L11.39,17.92L9.98,19.33L8.09,17.43L6.68,18.84L8.57,20.74L7.16,22.15L3,18V13H1V8H3V3H8V1H13V3H16.12L21,7.88V15.61Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>AI Agent (Coming Soon)</h4>
                  <p className="stat-value">Inactive</p>
                </div>
              </div>
            </div>
            
            <div className="usage-chart-container">
              <h3>Platform Activity Time</h3>
              <div className="dynamic-chart">
                <div className="chart-bars">
                  {Object.entries(platformTimeData).map(([platform, time]) => (
                    <div key={platform} className="chart-bar-container">
                      <div className="chart-bar-wrapper">
                        <div 
                          className={`chart-bar ${platform}`}
                          style={{ 
                            height: `${Math.max((time / Math.max(...Object.values(platformTimeData), 1)) * 100, 2)}%` 
                          }}
                        >
                          <div className="bar-value">{time}min</div>
                        </div>
                      </div>
                      <div className="chart-label">{platform.charAt(0).toUpperCase() + platform.slice(1)}</div>
                    </div>
                  ))}
                </div>
                <div className="chart-y-axis">
                  <span className="y-axis-label">Time (minutes)</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="agent-container">
            <div className="agent-glass-content">
              <h2 className="agent-title">Autonomous Account Manager</h2>
              <p className="agent-description">
                The Autonomous Account Manager will arrive soon to revolutionize your social media presence. 
                When you connect your platforms, it will run intelligent campaigns autonomously to achieve your goals. 
                Our AI will handle branding, promotion, and organic growth seamlessly across all your connected accounts.
              </p>
              
              <button 
                className={`dashboard-glass-button ${isWishlisted ? 'wishlisted' : ''}`}
                onClick={() => {
                  if (!isWishlisted) {
                    setIsWishlisted(true);
                    setShowWishlistConfirmation(true);
                    if (currentUser?.uid) {
                      localStorage.setItem(`agent_wishlisted_${currentUser.uid}`, 'true');
                    }
                    setTimeout(() => setShowWishlistConfirmation(false), 3000);
                  }
                }}
                disabled={isWishlisted}
              >
                {isWishlisted ? 'Added to Wishlist' : 'Add to Wishlist'}
              </button>
              
              {showWishlistConfirmation && (
                <div className="wishlist-confirmation">
                  <p>Thank you for your interest! You'll be notified when the Autonomous Account Manager launches.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
      
      {/* Render modal using Portal - completely independent of wrapper */}
      {showInstantPostModal && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Post to Your Platforms</h3>
              <button 
                className="modal-close-btn"
                onClick={() => setShowInstantPostModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            
            {/* Platform Selection */}
            <div className="platform-selection">
              <h4>Select platforms to post to:</h4>
              
              {/* Connected Platforms */}
              {safeLength(safeFilter(platforms, (platform: PlatformData) => platform.connected)) > 0 && (
                <div className="connected-platforms-section">
                  <div className="section-title">
                    <span className="status-indicator connected">✓ Connected Platforms</span>
                  </div>
                  <div className="platform-checkboxes">
                    {safeMap(
                      safeFilter(platforms, (platform: PlatformData) => platform.connected),
                      (platform: PlatformData) => (
                        <div 
                          key={platform.id} 
                          className={`platform-checkbox ${postContent.platformIds.includes(platform.id) ? 'selected' : ''}`}
                          onClick={() => togglePlatformSelection(platform.id)}
                        >
                          <img 
                            src={platform.icon} 
                            alt={platform.name}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = "/icons/default.svg";
                            }}
                          />
                          <span>{platform.name}</span>
                          <div className="platform-requirements">
                            {platform.id === 'instagram' && <span className="requirement">Requires image</span>}
                            {platform.characterLimit && (
                              <span className="char-limit">Max {platform.characterLimit} chars</span>
                            )}
                          </div>
                          <div className="checkbox-indicator">
                            {postContent.platformIds.includes(platform.id) && (
                              <svg viewBox="0 0 24 24">
                                <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                              </svg>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {/* Disconnected Platforms */}
              {safeLength(safeFilter(platforms, (platform: PlatformData) => !platform.connected && platform.claimed)) > 0 && (
                <div className="disconnected-platforms-section">
                  <div className="section-title">
                    <span className="status-indicator disconnected">⚠ Not Connected (Connect to post)</span>
                  </div>
                  <div className="platform-checkboxes disabled">
                    {safeMap(
                      safeFilter(platforms, (platform: PlatformData) => !platform.connected && platform.claimed),
                      (platform: PlatformData) => (
                        <div 
                          key={platform.id} 
                          className="platform-checkbox disabled"
                          onClick={() => handleConnectionButtonClick(platform)}
                          title={`Click to connect your ${platform.name} account`}
                        >
                          <img 
                            src={platform.icon} 
                            alt={platform.name}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = "/icons/default.svg";
                            }}
                          />
                          <span>{platform.name}</span>
                          <div className="connect-hint">Click to connect</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {safeLength(safeFilter(platforms, (p: PlatformData) => p.connected)) === 0 && (
                <div className="no-connected-platforms">
                  <p>No connected platforms. Please connect your accounts from the platform dashboards to start posting.</p>
                </div>
              )}
            </div>
            
            {/* Text Content */}
            <div className="post-content-section">
              <textarea 
                placeholder="What would you like to share?" 
                className="instant-post-textarea"
                rows={5}
                value={postContent.text}
                onChange={(e) => setPostContent(prev => ({...prev, text: e.target.value}))}
              ></textarea>
              
              {getRemainingCharacters() !== null && (
                <div className={`character-counter ${getRemainingCharacters()! < 20 ? 'warning' : ''}`}>
                  {getRemainingCharacters()} characters remaining
                </div>
              )}
            </div>
            
            {/* Schedule Options */}
            <div className="schedule-section">
              <h4>When to post:</h4>
              <div className="date-picker-wrapper">
                <DatePicker
                  selected={postContent.scheduleDate}
                  onChange={handleScheduleDateChange}
                  showTimeSelect
                  dateFormat="Pp"
                  minDate={new Date()}
                  placeholderText="Schedule for later (optional)"
                  className="schedule-datepicker"
                />
                {postContent.scheduleDate && (
                  <button 
                    className="clear-date-btn"
                    onClick={() => handleScheduleDateChange(null)}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="schedule-note">
                {postContent.scheduleDate 
                  ? `Your post will be scheduled for ${postContent.scheduleDate.toLocaleString()}`
                  : "Your post will be published immediately"}
              </div>
            </div>
            
            {/* Image Upload */}
            <div className="image-upload-section">
              <div className="upload-button" onClick={handleImageUploadClick}>
                <svg viewBox="0 0 24 24">
                  <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                </svg>
                <span>Add Images</span>
              </div>
              
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              
              {postContent.images.length > 0 && (
                <div className="image-previews">
                  {postContent.images.map((image, index) => (
                    <div key={index} className="image-preview">
                      <img src={URL.createObjectURL(image)} alt={`Preview ${index}`} />
                      <button 
                        className="remove-image" 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="modal-buttons">
              <button 
                className="cancel-button"
                onClick={() => setShowInstantPostModal(false)}
              >
                Cancel
              </button>
              <button 
                className="post-button"
                disabled={postContent.text.trim() === '' && postContent.images.length === 0}
                onClick={handleInstantPost}
              >
                {postContent.scheduleDate ? 'Schedule Post' : 'Post Now'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MainDashboard; 