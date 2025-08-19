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
import PostScheduler from '../instagram/PostScheduler';
import TwitterCompose from '../twitter/TwitterCompose';
import UsageDashboard from './UsageDashboard';

import { schedulePost } from '../../utils/scheduleHelpers';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import { useUsage } from '../../context/UsageContext';
import GlobalUpgradeHandler from '../common/GlobalUpgradeHandler';
import { useProcessing } from '../../context/ProcessingContext';
import { safeFilter, safeMap, safeLength } from '../../utils/safeArrayUtils';
import PrivacyPolicyFooter from '../common/PrivacyPolicyFooter';

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
  const { usage, refreshUsage } = useUsage();
  const [userName, setUserName] = useState<string>('');
  const [showInstantPostModal, setShowInstantPostModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFetchingNotificationsRef = useRef(false);
  
  // Platform-specific modals
  const [showInstagramScheduler, setShowInstagramScheduler] = useState<boolean>(false);
  const [showTwitterComposer, setShowTwitterComposer] = useState<boolean>(false);
  
  // Loading state for instant post
  const [isPostingInstantPost, setIsPostingInstantPost] = useState<boolean>(false);
  
  // Account Agent wishlist state
  const [isWishlisted, setIsWishlisted] = useState<boolean>(false);
  const [showWishlistConfirmation, setShowWishlistConfirmation] = useState<boolean>(false);
  
  // Meta Ads coming soon state
  const [showMetaAdsModal, setShowMetaAdsModal] = useState<boolean>(false);
  const [isMetaAdsWishlisted, setIsMetaAdsWishlisted] = useState<boolean>(false);
  const [showMetaAdsWishlistConfirmation, setShowMetaAdsWishlistConfirmation] = useState<boolean>(false);
  

  
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
  const [, setViewedContent] = useState<Record<string, Set<string>>>({
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

  // 🔍 FACEBOOK DEBUG: Monitor localStorage changes for debugging
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const monitorLocalStorage = () => {
      const facebookKeys = Object.keys(localStorage).filter(key => 
        key.includes('facebook') && key.includes(currentUser.uid)
      );
      
      if (facebookKeys.length === 0) {
        console.log(`🔍 FACEBOOK LOCALSTORAGE MONITOR: No Facebook keys found for user ${currentUser.uid}`);
      } else {
        console.log(`🔍 FACEBOOK LOCALSTORAGE MONITOR: Found keys:`, facebookKeys.map(key => ({
          key,
          value: localStorage.getItem(key)
        })));
      }
    };
    
    // Monitor immediately and every 10 seconds
    monitorLocalStorage();
    const interval = setInterval(monitorLocalStorage, 10000);
    
    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // ✅ CROSS-DEVICE PROCESSING STATUS MIRROR: Periodically fetch backend status and mirror locally
  useEffect(() => {
    if (!currentUser?.uid) return;

    const platformsList = ['instagram', 'twitter', 'facebook', 'linkedin'];
    let lastSyncTime = 0;
    const SYNC_COOLDOWN = 3000; // 3 second cooldown between syncs

    const mirrorFromServer = async () => {
      const now = Date.now();
      if (now - lastSyncTime < SYNC_COOLDOWN) {
        return; // Skip if too soon
      }
      lastSyncTime = now;

      try {
        // ✅ FACEBOOK PRIORITY SYNC: Check Facebook first for faster cross-device sync
        const facebookPriorityCheck = async () => {
          try {
            const resp = await fetch(`/api/user-facebook-status/${currentUser.uid}`);
            if (resp.ok) {
              const json = await resp.json();
              const isFacebookClaimed = json.hasEnteredFacebookUsername === true;
              
              const facebookKey = `facebook_accessed_${currentUser.uid}`;
              const wasFacebookClaimed = localStorage.getItem(facebookKey) === 'true';
              
              if (isFacebookClaimed && !wasFacebookClaimed) {
                console.log(`[MainDashboard] 🚀 FACEBOOK PRIORITY SYNC: Facebook claimed on backend, syncing to localStorage immediately`);
                localStorage.setItem(facebookKey, 'true');
                
                // Also sync username data if available
                if (json.facebook_username) {
                  localStorage.setItem(`facebook_username_${currentUser.uid}`, json.facebook_username);
                }
                if (json.accountType) {
                  localStorage.setItem(`facebook_account_type_${currentUser.uid}`, json.accountType);
                }
                if (json.competitors) {
                  localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(json.competitors));
                }
                
                console.log(`[MainDashboard] ✅ FACEBOOK CROSS-DEVICE SYNC COMPLETE: All data synced to localStorage`);
              } else if (!isFacebookClaimed && wasFacebookClaimed) {
                // Backend says not claimed but localStorage says claimed - check loading state
                const nowTs = Date.now();
                const facebookLoading = platformLoadingStates.facebook;
                const isStillLoading = facebookLoading && !facebookLoading.isComplete && nowTs < facebookLoading.endTime;
                
                if (!isStillLoading) {
                  console.log(`[MainDashboard] 🔄 FACEBOOK SYNC: Backend not claimed and not loading - PRESERVING localStorage (backend may be incomplete)`);
                  // ❌ REMOVED: Don't aggressively clear localStorage when backend might be incomplete
                  // localStorage.removeItem(facebookKey);
                }
              }
            }
          } catch (error) {
            console.warn(`[MainDashboard] Failed Facebook priority check:`, error);
          }
        };
        
        // Execute Facebook priority check first
        await facebookPriorityCheck();

        const resp = await fetch(`/api/processing-status/${currentUser.uid}`);
        if (!resp.ok) return;
        const json = await resp.json();
        const data = json?.data || {};

        console.log(`[MainDashboard] 🔍 BACKEND SYNC: Received processing status data:`, data);

        const now = Date.now();
        const updatedStates: Record<string, PlatformLoadingState> = { ...platformLoadingStates };
        let hasChanges = false;

        platformsList.forEach(pid => {
          const s = data[pid];
          const wasActive = platformLoadingStates[pid] && !platformLoadingStates[pid].isComplete && now < platformLoadingStates[pid].endTime;
          
          console.log(`[MainDashboard] 🔍 Platform ${pid}:`, { 
            exists: !!s, 
            active: s?.active, 
            endTime: s?.endTime, 
            wasActive 
          });
          
          // CRITICAL FIX: Use backend's active flag instead of manual time calculation
          if (s && s.active === true && typeof s.endTime === 'number') {
            // Platform is active on server (in loading state)
            const newState = {
              startTime: s.startTime,
              endTime: s.endTime,
              isComplete: false,
            };
            
            // Check if state actually changed
            const currentState = platformLoadingStates[pid];
            if (!currentState || currentState.endTime !== s.endTime || currentState.startTime !== s.startTime) {
              updatedStates[pid] = newState;
              hasChanges = true;
              console.log(`[MainDashboard] 🔄 Processing status updated for ${pid}: ${Math.ceil((s.endTime - now) / 1000 / 60)}min remaining (LOADING STATE)`);
            }
            
            // Mirror to localStorage for consistency
            localStorage.setItem(getProcessingCountdownKey(pid), String(s.endTime));
            try {
              const info: any = {
                platform: pid,
                startTime: s.startTime,
                endTime: s.endTime,
                totalDuration: s.totalDuration,
              };
              if (s.username) info.username = s.username;
              localStorage.setItem(`${pid}_processing_info`, JSON.stringify(info));
            } catch {}
            
            // CRITICAL FIX: Force clear platform access status while in loading state
            const accessKey = `${pid}_accessed_${currentUser.uid}`;
            const wasClaimed = localStorage.getItem(accessKey) === 'true';
            if (wasClaimed) {
              localStorage.removeItem(accessKey);
              hasChanges = true; // Force UI update
              console.log(`[MainDashboard] 🔥 CRITICAL: Cleared platform access status for ${pid} while in loading state - forcing UI update`);
            }
          } else {
            // Platform not active on server
            if (wasActive) {
              // Was active locally but not on server - clear it
              delete updatedStates[pid];
              hasChanges = true;
              console.log(`[MainDashboard] 🔄 Processing status cleared for ${pid} (no longer active on server)`);
              
              // Also clear localStorage
              localStorage.removeItem(getProcessingCountdownKey(pid));
              localStorage.removeItem(`${pid}_processing_info`);
            }
          }
        });

        if (hasChanges) {
          console.log(`[MainDashboard] 🔄 Processing status changes detected, updating state`);
          setPlatformLoadingStates(updatedStates);
          // Force platform refresh to update "Acquiring" status
          setPlatforms(prev => [...prev]);
          
          // CRITICAL: Force immediate re-render to show loading state
          console.log(`[MainDashboard] 🔥 FORCING IMMEDIATE RE-RENDER for loading state changes`);
          setTimeout(() => {
            setPlatforms(prev => [...prev]);
          }, 100);
        }
      } catch (error) {
        console.warn(`[MainDashboard] Failed to sync processing status:`, error);
      }
    };

    // Initial sync with delay to allow local timer to initialize and persist to backend
    const initialSyncDelay = setTimeout(() => {
      mirrorFromServer();
    }, 2000); // 2 second delay for initial sync
    
    // ✅ OPTIMIZED SYNC: Reduced frequency from 1 second to 5 seconds for better performance
    const id = setInterval(mirrorFromServer, 5000); // Increased from 1 second to 5 seconds
    return () => { 
      clearTimeout(initialSyncDelay);
      clearInterval(id); 
    };
  }, [currentUser?.uid, platformLoadingStates]);

  // ✅ BULLETPROOF TIMER SYSTEM - Synchronized with ProcessingLoadingState
  const getProcessingCountdownKey = (platformId: string) => `${platformId}_processing_countdown`;

  // Function to complete platform loading - MOVED HERE to fix dependency order
  const completePlatformLoading = useCallback((platformId: string) => {
    console.log(`🔥 TIMER COMPLETE: Completing ${platformId} processing`);
    
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
    
    // ✅ CRITICAL FIX: Mark platform as claimed in BOTH backend endpoints for complete cross-device sync
    // This ensures both MainDashboard and App.tsx can see the platform as claimed
    if (currentUser?.uid) {
      // Get the username that was used during processing
      let username = '';
      try {
        const infoKey = `${platformId}_processing_info`;
        const infoRaw = localStorage.getItem(infoKey);
        if (infoRaw) {
          const info = JSON.parse(infoRaw);
          username = info.username || '';
        }
      } catch {}
      
      // ✅ CROSS-DEVICE SYNC FIX: Check if platform already acquired on another device
      const localStorageKey = `${platformId}_accessed_${currentUser.uid}`;
      const alreadyAcquiredElsewhere = localStorage.getItem(localStorageKey) === 'true';
      
      if (alreadyAcquiredElsewhere) {
        console.log(`🔥 CROSS-DEVICE SYNC: Platform ${platformId} already acquired on another device - skipping backend sync to prevent override`);
        // Just mark in localStorage and return - don't sync to backend
        localStorage.setItem(localStorageKey, 'true');
        return;
      }
      
      // ✅ CRITICAL FIX: Update BOTH endpoints to ensure complete synchronization
      
      // Step 1: Update the user-status endpoint (used by App.tsx)
      let userStatusEndpoint = '';
      let userStatusPayload: any = {};
      
      if (platformId === 'instagram') {
        userStatusEndpoint = `/api/user-instagram-status/${currentUser.uid}`;
        userStatusPayload = { instagram_username: username };
      } else if (platformId === 'twitter') {
        userStatusEndpoint = `/api/user-twitter-status/${currentUser.uid}`;
        userStatusPayload = { twitter_username: username };
      } else if (platformId === 'facebook') {
        userStatusEndpoint = `/api/user-facebook-status/${currentUser.uid}`;
        userStatusPayload = { facebook_username: username };
      }
      
      // Step 2: Update the platform-access endpoint (used by MainDashboard)
      const platformAccessEndpoint = `/api/platform-access/${currentUser.uid}`;
      const platformAccessPayload = {
        platform: platformId,
        claimed: true,
        username: username
      };
      
      // Update both endpoints simultaneously
      const updatePromises = [];
      
      if (userStatusEndpoint) {
        updatePromises.push(
          fetch(userStatusEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userStatusPayload)
          }).then(response => {
            if (response.ok) {
              console.log(`🔥 BACKEND SYNC: Platform ${platformId} marked as CLAIMED in user-status endpoint for App.tsx compatibility`);
            } else {
              console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platformId} as claimed in user-status endpoint`);
            }
          }).catch(error => {
            console.error(`🔥 BACKEND SYNC: Error marking platform ${platformId} as claimed in user-status endpoint:`, error);
          })
        );
      }
      
      updatePromises.push(
        fetch(platformAccessEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(platformAccessPayload)
        }).then(response => {
          if (response.ok) {
            console.log(`🔥 BACKEND SYNC: Platform ${platformId} marked as CLAIMED in platform-access endpoint for MainDashboard compatibility`);
          } else {
            console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platformId} as claimed in platform-access endpoint`);
          }
        }).catch(error => {
          console.error(`🔥 BACKEND SYNC: Error marking platform ${platformId} as claimed in platform-access endpoint:`, error);
        })
      );
      
      // Wait for both updates to complete
      Promise.all(updatePromises).then(() => {
        console.log(`🔥 BACKEND SYNC: Platform ${platformId} successfully marked as CLAIMED in both endpoints for complete cross-device sync`);
        // Also update localStorage for immediate consistency
        localStorage.setItem(localStorageKey, 'true');
      });
    }
    
    console.log(`🔥 TIMER CLEANUP: ${platformId} processing completed and cleaned up`);
  }, [completedPlatforms, currentUser?.uid]);

  // ✅ CROSS-DEVICE CLAIMED STATUS MIRROR: Periodically fetch backend claimed state and mirror to localStorage
  useEffect(() => {
    if (!currentUser?.uid) return;

    let lastClaimedSyncTime = 0;
    const CLAIMED_SYNC_COOLDOWN = 3000; // Reduced from 5 seconds to 3 seconds for faster sync

    // Disabled sync function - kept for reference
    const syncClaimedStatus = async () => {
      const now = Date.now();
      if (now - lastClaimedSyncTime < CLAIMED_SYNC_COOLDOWN) {
        return; // Skip if too soon
      }
      lastClaimedSyncTime = now;

      try {
        // ✅ CRITICAL FIX: Use the SAME endpoints as App.tsx for consistency
        // This prevents the cross-device sync mismatch
        const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
        const platformStatuses: Record<string, boolean> = {};
        
        // Check each platform individually using the same endpoints as App.tsx
        for (const platformId of platforms) {
          try {
            let endpoint = '';
            if (platformId === 'instagram') {
              endpoint = `/api/user-instagram-status/${currentUser.uid}`;
            } else if (platformId === 'twitter') {
              endpoint = `/api/user-twitter-status/${currentUser.uid}`;
            } else if (platformId === 'facebook') {
              endpoint = `/api/user-facebook-status/${currentUser.uid}`;
            } else {
              endpoint = `/api/platform-access/${currentUser.uid}`;
            }
            
            const resp = await fetch(endpoint);
            if (resp.ok) {
              const json = await resp.json();
              const data = json?.data || json;
              
              // Check the SAME fields as App.tsx
              let isClaimed = false;
              if (platformId === 'instagram') {
                isClaimed = data.hasEnteredInstagramUsername === true;
              } else if (platformId === 'twitter') {
                isClaimed = data.hasEnteredTwitterUsername === true;
              } else if (platformId === 'facebook') {
                isClaimed = data.hasEnteredFacebookUsername === true;
              } else {
                isClaimed = data[platformId]?.claimed === true;
              }
              
              platformStatuses[platformId] = isClaimed;
            }
          } catch (error) {
            console.warn(`Failed to check ${platformId} status:`, error);
            platformStatuses[platformId] = false;
          }
        }
        
        console.log(`[MainDashboard] 🔍 BACKEND SYNC: Received platform status data:`, platformStatuses);
        
        let hasChanges = false;
        
        platforms.forEach(pid => {
          const isNowClaimed = platformStatuses[pid] || false;
          const key = `${pid}_accessed_${currentUser.uid}`;
          const wasClaimed = localStorage.getItem(key) === 'true';
          
          // CRITICAL FIX: Check if platform is currently in loading state
          // Consider both backend-synced state and localStorage fallback to avoid first-paint races
          const nowTs = Date.now();
          const stateActive = platformLoadingStates[pid] && !platformLoadingStates[pid].isComplete && nowTs < platformLoadingStates[pid].endTime;
          let lsActive = false;
          try {
            const raw = localStorage.getItem(getProcessingCountdownKey(pid));
            const end = raw ? parseInt(raw, 10) : 0;
            lsActive = end > nowTs;
          } catch {}
          const isCurrentlyLoading = stateActive || lsActive;
          
          if (isCurrentlyLoading) {
            // Platform is in loading state - force clear claimed status
            if (wasClaimed) {
              localStorage.removeItem(key);
              hasChanges = true;
              console.log(`[MainDashboard] 🔥 CRITICAL: Platform ${pid} in loading state - forced clear claimed status`);
            }
          } else if (isNowClaimed && !wasClaimed) {
            // ✅ CRITICAL FIX: Platform is now claimed on backend but not locally
            localStorage.setItem(key, 'true');
            hasChanges = true;
            console.log(`[MainDashboard] 🔄 Platform ${pid} now claimed (was not claimed) - CROSS-DEVICE SYNC SUCCESS`);
            
            // ✅ CRITICAL FIX: Also sync username and other data to localStorage for complete cross-device sync
            // We need to fetch the platform data again to get username and account type
            (async () => {
              try {
                let endpoint = '';
                if (pid === 'instagram') {
                  endpoint = `/api/user-instagram-status/${currentUser.uid}`;
                } else if (pid === 'twitter') {
                  endpoint = `/api/user-twitter-status/${currentUser.uid}`;
                } else if (pid === 'facebook') {
                  endpoint = `/api/user-facebook-status/${currentUser.uid}`;
                } else {
                  endpoint = `/api/platform-access/${currentUser.uid}`;
                }
                
                const resp = await fetch(endpoint);
                if (resp.ok) {
                  const json = await resp.json();
                  const platformData = json?.data || json;
                  
                  // Get username from backend response
                  let username = '';
                  if (pid === 'instagram' && platformData.instagram_username) {
                    username = platformData.instagram_username;
                  } else if (pid === 'twitter' && platformData.twitter_username) {
                    username = platformData.twitter_username;
                  } else if (pid === 'facebook' && platformData.facebook_username) {
                    username = platformData.facebook_username;
                  }
                  
                  if (username && username.trim()) {
                    localStorage.setItem(`${pid}_username_${currentUser.uid}`, username.trim());
                    console.log(`[MainDashboard] 🔄 CROSS-DEVICE SYNC: Username ${username} synced to localStorage for ${pid}`);
                  }
                  
                  // Get account type if available
                  if (platformData.accountType) {
                    localStorage.setItem(`${pid}_account_type_${currentUser.uid}`, platformData.accountType);
                    console.log(`[MainDashboard] 🔄 CROSS-DEVICE SYNC: Account type ${platformData.accountType} synced to localStorage for ${pid}`);
                  }
                }
              } catch (error) {
                console.warn(`[MainDashboard] Failed to sync additional data for ${pid}:`, error);
              }
            })();
            
            // ✅ ENHANCED SYNC: Also check if this platform was in loading state and complete it
            if (platformLoadingStates[pid] && !platformLoadingStates[pid].isComplete) {
              console.log(`[MainDashboard] 🔥 AUTO-COMPLETE: Platform ${pid} completed on another device, marking as completed locally`);
              completePlatformLoading(pid);
            }
          } else if (!isNowClaimed && wasClaimed) {
            // ✅ FACEBOOK PROTECTION: Don't clear Facebook status when backend returns false
            if (pid === 'facebook') {
              console.log(`[MainDashboard] 🛡️ FACEBOOK PROTECTION: Backend says not claimed but localStorage says claimed - preserving localStorage to prevent sync conflicts`);
              return; // Skip clearing Facebook status
            }
            
            // Platform no longer claimed on backend
            localStorage.removeItem(key);
            hasChanges = true;
            console.log(`[MainDashboard] 🔄 Platform ${pid} no longer claimed (was claimed)`);
          }
        });
        
        // Only force platform refresh if there were actual changes
        if (hasChanges) {
          console.log(`[MainDashboard] 🔄 Claimed status changes detected, refreshing platforms`);
          setPlatforms(prev => [...prev]);
          
          // CRITICAL: Force immediate re-render for claimed status changes
          console.log(`[MainDashboard] 🔥 FORCING IMMEDIATE RE-RENDER for claimed status changes`);
          setTimeout(() => {
            setPlatforms(prev => [...prev]);
          }, 100);
        }
      } catch (error) {
        console.warn(`[MainDashboard] Failed to sync claimed status:`, error);
      }
    };

    // ✅ DISABLED: Old conflicting sync that was overriding Facebook status
    // This old sync was showing facebook: false and clearing localStorage
    // The new dedicated platform sync system is more accurate
    // syncClaimedStatus();
    console.log(`[MainDashboard] 🚫 DISABLED: Old conflicting sync system to prevent Facebook status override`);
    
    // Suppress unused variable warnings by referencing them
    void syncClaimedStatus;
    void startPlatformLoading;
    void markPlatformAccessed;
    
    // ✅ OPTIMIZED SYNC: Reduced frequency from 5 seconds to 3 seconds for faster cross-device sync
    // const id = setInterval(mirrorClaimed, 3000); // DISABLED - conflicts with new sync
    // return () => clearInterval(id);
    
    return () => {}; // Empty cleanup since we disabled the interval
  }, [currentUser?.uid, platformLoadingStates, completePlatformLoading]);

  // ✅ CRITICAL PLATFORM COMPLETION MONITOR: Monitor for platform completion and update UI
  useEffect(() => {
    if (!currentUser?.uid) return;

    const checkForCompletedPlatforms = () => {
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      let hasCompletion = false;

      platforms.forEach(platformId => {
        // Check if platform was in loading state but is now complete
        const loadingState = platformLoadingStates[platformId];
        if (loadingState && !loadingState.isComplete) {
          const remainingMs = Math.max(0, loadingState.endTime - Date.now());
          if (remainingMs === 0) {
            console.log(`🔥 PLATFORM COMPLETION DETECTED: ${platformId} has finished loading, marking as completed`);
            completePlatformLoading(platformId);
            hasCompletion = true;
          }
        }
      });

      // Force platform refresh if any platform completed
      if (hasCompletion) {
        console.log(`🔥 FORCING PLATFORM REFRESH after completion detection`);
        setPlatforms(prev => [...prev]);
      }
    };

    // Check immediately
    checkForCompletedPlatforms();

    // Check every 2 seconds for platform completion
    const completionInterval = setInterval(checkForCompletedPlatforms, 2000);
    
    return () => clearInterval(completionInterval);
  }, [currentUser?.uid, platformLoadingStates, completePlatformLoading]);

  const getProcessingRemainingMs = useCallback((platformId: string): number => {
    // Never show timer for completed platforms
    if (completedPlatforms.has(platformId)) return 0;

    try {
      // ✅ CRITICAL FIX: Use the already-synced state from platformLoadingStates instead of localStorage
      // This ensures we use the backend-synced state that's updated every 1 second
      const loadingState = platformLoadingStates[platformId];
      if (loadingState && !loadingState.isComplete && Date.now() < loadingState.endTime) {
        const remaining = Math.max(0, loadingState.endTime - Date.now());
        if (remaining > 0) {
          console.log(`🔥 TIMER SYNC: ${platformId} has ${Math.ceil(remaining / 1000 / 60)} minutes remaining (from synced state)`);
          return remaining;
        }
      }

      // Fallback to localStorage if no synced state
      const raw = localStorage.getItem(getProcessingCountdownKey(platformId));
      if (!raw) return 0;
      
      const endTime = parseInt(raw, 10);
      if (Number.isNaN(endTime)) return 0;
      
      const remaining = Math.max(0, endTime - Date.now());
      return remaining;
    } catch (error) {
      console.error(`Error reading timer for ${platformId}:`, error);
      return 0;
    }
  }, [completedPlatforms, platformLoadingStates]);

  const isPlatformLoading = useCallback((platformId: string): boolean => {
    // ✅ CRITICAL FIX: Use the backend-synced state directly for immediate accuracy
    const loadingState = platformLoadingStates[platformId];
    if (loadingState && !loadingState.isComplete && Date.now() < loadingState.endTime) {
      const remaining = Math.max(0, loadingState.endTime - Date.now());
      if (remaining > 0) {
        console.log(`🔥 TIMER SYNC: ${platformId} has ${Math.ceil(remaining / 1000 / 60)} minutes remaining (from backend sync)`);
        return true;
      }
    }

    // Fallback to localStorage if no synced state
    const remaining = getProcessingRemainingMs(platformId);
    if (remaining > 0) {
      console.log(`🔥 TIMER FALLBACK: ${platformId} has ${Math.ceil(remaining / 1000 / 60)} minutes remaining (from localStorage)`);
      return true;
    }

    // Never show loading for completed platforms
    if (completedPlatforms.has(platformId)) return false;

    // DEBUG: Log when platform is not loading
    console.log(`🔥 TIMER DEBUG: ${platformId} is NOT loading - loadingState:`, loadingState, 'remaining:', remaining);
    return false;
  }, [completedPlatforms, platformLoadingStates, getProcessingRemainingMs]);

  // Function to start platform loading state - used internally for processing
  const startPlatformLoading = useCallback((platformId: string, durationMinutes?: number) => {
    // Use platform-specific timing if not explicitly provided
    if (durationMinutes === undefined) {
      durationMinutes = platformId === 'facebook' ? 20 : 15;
    }
    // Don't start loading for completed platforms
    if (completedPlatforms.has(platformId)) {
      console.log(`🔥 TIMER SKIP: ${platformId} already completed, skipping timer`);
      return;
    }

    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const endTime = now + durationMs;
    
    const newLoadingState: PlatformLoadingState = {
      startTime: now,
      endTime: endTime,
      isComplete: false
    };
    
    setPlatformLoadingStates(prev => ({
      ...prev,
      [platformId]: newLoadingState
    }));

    // ✅ BULLETPROOF PERSISTENCE: Store both countdown and processing info
    localStorage.setItem(getProcessingCountdownKey(platformId), endTime.toString());
    // ✅ USERNAME SOURCE OF TRUTH: Prefer the platform dashboard username stored per-user
    let finalUsername = '';
    try {
      if (currentUser?.uid) {
        const platformUsername = localStorage.getItem(`${platformId}_username_${currentUser.uid}`);
        if (platformUsername && platformUsername.trim()) {
          finalUsername = platformUsername.trim();
        }
      }
    } catch {}
    // Fallback only if nothing found (avoid using displayName if we have the canonical key)
    if (!finalUsername && currentUser?.displayName) {
      finalUsername = currentUser.displayName;
    }
    try {
      const existingProcessingInfo = localStorage.getItem(`${platformId}_processing_info`);
      if (existingProcessingInfo) {
        const existingInfo = JSON.parse(existingProcessingInfo);
        if (existingInfo.username && typeof existingInfo.username === 'string' && existingInfo.username.trim()) {
          const preserved = existingInfo.username.trim();
          console.log(`🔒 PRESERVING USERNAME: Keeping existing username '${preserved}' for ${platformId} (not overwriting)`);
          finalUsername = preserved;
        }
      }
    } catch (err) {
      console.error('Error checking existing username in localStorage:', err);
    }
    
    const infoPayload: any = {
      platform: platformId,
      startTime: now,
      endTime,
      totalDuration: durationMs,
    };

    if (finalUsername && finalUsername.trim()) {
      infoPayload.username = finalUsername.trim();
    }

    localStorage.setItem(`${platformId}_processing_info`, JSON.stringify(infoPayload));

    // Persist to backend for cross-device sync
    if (currentUser?.uid) {
      // Step 1: Save processing status (timer data)
      fetch(`/api/processing-status/${currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platformId,
          startTime: now,
          endTime,
          totalDuration: durationMs,
          username: infoPayload.username
        })
      }).catch(() => {});
      
      // Step 2: CRITICAL FIX - Mark platform as NOT claimed (in loading state) for cross-device sync
      // ✅ CRITICAL FIX: Update BOTH endpoints to ensure complete synchronization
      
      // Step 2a: Update the user-status endpoint (used by App.tsx)
      let userStatusEndpoint = '';
      let userStatusPayload: any = {};
      
      if (platformId === 'instagram') {
        userStatusEndpoint = `/api/user-instagram-status/${currentUser.uid}`;
        userStatusPayload = { instagram_username: infoPayload.username };
      } else if (platformId === 'twitter') {
        userStatusEndpoint = `/api/user-twitter-status/${currentUser.uid}`;
        userStatusPayload = { twitter_username: infoPayload.username };
      } else if (platformId === 'facebook') {
        userStatusEndpoint = `/api/user-facebook-status/${currentUser.uid}`;
        userStatusPayload = { facebook_username: infoPayload.username };
      }
      
      // Step 2b: Update the platform-access endpoint (used by MainDashboard)
      const platformAccessEndpoint = `/api/platform-access/${currentUser.uid}`;
      const platformAccessPayload = {
        platform: platformId,
        claimed: false, // NOT claimed while in loading state
        username: infoPayload.username
      };
      
      // Update both endpoints simultaneously
      const updatePromises = [];
      
      if (userStatusEndpoint) {
        updatePromises.push(
          fetch(userStatusEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userStatusPayload)
          }).then(response => {
            if (response.ok) {
              console.log(`🔥 BACKEND SYNC: Platform ${platformId} marked as NOT claimed in user-status endpoint for App.tsx compatibility`);
            } else {
              console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platformId} as NOT claimed in user-status endpoint`);
            }
          }).catch(error => {
            console.error(`🔥 BACKEND SYNC: Error marking platform ${platformId} as NOT claimed in user-status endpoint:`, error);
          })
        );
      }
      
      updatePromises.push(
        fetch(platformAccessEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(platformAccessPayload)
        }).then(response => {
          if (response.ok) {
            console.log(`🔥 BACKEND SYNC: Platform ${platformId} marked as NOT claimed in platform-access endpoint for MainDashboard compatibility`);
          } else {
            console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platformId} as NOT claimed in platform-access endpoint`);
          }
        }).catch(error => {
          console.error(`🔥 BACKEND SYNC: Error marking platform ${platformId} as NOT claimed in platform-access endpoint:`, error);
        })
      );
      
      // Wait for both updates to complete
      Promise.all(updatePromises).then(() => {
        console.log(`🔥 BACKEND SYNC: Platform ${platformId} successfully marked as NOT claimed in both endpoints for complete cross-device sync`);
      });
    }
    
    console.log(`🔥 TIMER START: ${platformId} timer set for ${durationMinutes} minutes (${endTime})`);
  }, [completedPlatforms, currentUser?.uid]);

  // ✅ PLATFORM STATUS SYNC FIX: Improved platform access tracking with real-time backend sync
  const getPlatformAccessStatus = useCallback((platformId: string): boolean => {
    if (!currentUser?.uid) return false;
    
    // ✅ PRIMARY SOURCE: Check localStorage for immediate response
    const accessedFromStorage = localStorage.getItem(`${platformId}_accessed_${currentUser.uid}`) === 'true';
    
    // ✅ CONTEXT FALLBACK: Check context status for platforms that have it
    let accessedFromContext = false;
    if (platformId === 'instagram') accessedFromContext = hasAccessedInstagram;
    if (platformId === 'twitter') accessedFromContext = hasAccessedTwitter;
    if (platformId === 'facebook') accessedFromContext = hasAccessedFacebook;
    
    // ✅ COMBINED STATUS: Use either localStorage or context (whichever is true)
    const localStatus = accessedFromStorage || accessedFromContext;
    
    // ✅ CROSS-DEVICE SYNC FIX: If localStorage says accessed, trust it even if platform is loading
    // This allows cross-device sync to work - another device might have completed acquisition
    if (accessedFromStorage) {
      console.log(`🔍 PLATFORM STATUS: ${platformId} - localStorage override (cross-device sync) - claimed despite loading state`);
      return true;
    }
    
    // ✅ LOADING STATE CHECK: Only apply loading restriction if localStorage doesn't override
    if (isPlatformLoading(platformId)) {
      console.log(`🔥 PLATFORM STATUS: ${platformId} is in loading state, showing as NOT acquired`);
      return false;
    }
    
    console.log(`🔍 PLATFORM STATUS CHECK: ${platformId} - storage:${accessedFromStorage} context:${accessedFromContext} combined:${localStatus}`);
    
    return localStatus;
  }, [currentUser?.uid, hasAccessedInstagram, hasAccessedTwitter, hasAccessedFacebook, isPlatformLoading]);

  // ✅ SEPARATE BACKEND SYNC: Dedicated effect for backend synchronization
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncPlatformStatusWithBackend = async (platformId: string) => {
      try {
        // Use the SAME endpoint as App.tsx for platform status consistency
        let endpoint = '';
        if (platformId === 'instagram') {
          endpoint = `/api/user-instagram-status/${currentUser.uid}`;
        } else if (platformId === 'twitter') {
          endpoint = `/api/user-twitter-status/${currentUser.uid}`;
        } else if (platformId === 'facebook') {
          endpoint = `/api/user-facebook-status/${currentUser.uid}`;
        } else {
          endpoint = `/api/platform-access/${currentUser.uid}`;
        }
        
        const resp = await fetch(endpoint);
        if (resp.ok) {
          const json = await resp.json();
          const data = json?.data || json; // Handle both response formats
          
          // 🔍 FACEBOOK DEBUG: Log all Facebook API response data
          if (platformId === 'facebook') {
            console.log(`🔍 FACEBOOK API DEBUG - Full Response:`, {
              endpoint,
              status: resp.status,
              json,
              data,
              hasEnteredFacebookUsername: data.hasEnteredFacebookUsername,
              facebook_username: data.facebook_username,
              uid: data.uid,
              lastUpdated: data.lastUpdated
            });
          }
          
          // Check the SAME fields as App.tsx
          let backendClaimed = false;
          if (platformId === 'instagram') {
            backendClaimed = data.hasEnteredInstagramUsername === true;
          } else if (platformId === 'twitter') {
            backendClaimed = data.hasEnteredTwitterUsername === true;
          } else if (platformId === 'facebook') {
            backendClaimed = data.hasEnteredFacebookUsername === true;
          } else {
            backendClaimed = data[platformId]?.claimed === true;
          }
          
          const localClaimed = localStorage.getItem(`${platformId}_accessed_${currentUser.uid}`) === 'true';
          
          // 🔍 FACEBOOK DEBUG: Log comparison details
          if (platformId === 'facebook') {
            console.log(`🔍 FACEBOOK SYNC DEBUG:`, {
              platformId,
              backendClaimed,
              localClaimed,
              localStorageKey: `${platformId}_accessed_${currentUser.uid}`,
              localStorageValue: localStorage.getItem(`${platformId}_accessed_${currentUser.uid}`),
              syncNeeded: backendClaimed && !localClaimed
            });
            
            // 🔍 FACEBOOK DEBUG: Check if there's any localStorage data at all
            const allFacebookKeys = Object.keys(localStorage).filter(key => key.includes('facebook') && key.includes(currentUser.uid));
            console.log(`🔍 FACEBOOK LOCALSTORAGE DEBUG:`, {
              allFacebookKeys,
              facebook_accessed: localStorage.getItem(`facebook_accessed_${currentUser.uid}`),
              facebook_username: localStorage.getItem(`facebook_username_${currentUser.uid}`),
              facebook_account_type: localStorage.getItem(`facebook_account_type_${currentUser.uid}`)
            });
          }
          
          // ✅ CRITICAL CROSS-DEVICE SYNC: Sync backend status to localStorage
          if (backendClaimed && !localClaimed) {
            console.log(`� CROSS-DEVICE SYNC: ${platformId} claimed on backend, syncing to localStorage`);
            localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
            
            // Also sync username and other data if available
            if (platformId === 'facebook' && data.facebook_username) {
              localStorage.setItem(`facebook_username_${currentUser.uid}`, data.facebook_username);
              if (data.accountType) {
                localStorage.setItem(`facebook_account_type_${currentUser.uid}`, data.accountType);
              }
              if (data.competitors) {
                localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(data.competitors));
              }
            }
            
            // Force platform state refresh
            setPlatforms(prev => prev.map(platform => {
              if (platform.id === platformId) {
                return { ...platform, claimed: true };
              }
              return platform;
            }));
            
          } else if (!backendClaimed && localClaimed) {
            // Check if platform is in loading state - if not, clear localStorage
            if (!isPlatformLoading(platformId)) {
              console.log(`🔄 BACKEND CLEANUP: ${platformId} not claimed on backend, clearing localStorage`);
              localStorage.removeItem(`${platformId}_accessed_${currentUser.uid}`);
              
              // Force platform state refresh
              setPlatforms(prev => prev.map(platform => {
                if (platform.id === platformId) {
                  return { ...platform, claimed: false };
                }
                return platform;
              }));
            }
          }
          
          console.log(`� BACKEND SYNC COMPLETE: ${platformId} - backend:${backendClaimed} local:${localClaimed}`);
        }
      } catch (error) {
        console.warn(`Failed to sync backend status for ${platformId}:`, error);
      }
    };

    // ✅ FACEBOOK PRIORITY SYNC: Sync Facebook first, then other platforms
    const performBackendSync = async () => {
      const platforms = ['facebook', 'instagram', 'twitter', 'linkedin'];
      
      for (const platformId of platforms) {
        await syncPlatformStatusWithBackend(platformId);
        
        // Small delay between platform checks to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    // Initial sync
    performBackendSync();

    // ✅ REGULAR SYNC: Sync every 3 seconds for cross-device updates
    const syncInterval = setInterval(performBackendSync, 3000);

    return () => {
      clearInterval(syncInterval);
    };
  }, [currentUser?.uid, isPlatformLoading]);

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

  // ✅ INSTANT CROSS-DEVICE SYNC: Listen for localStorage changes from other tabs/devices
  useEffect(() => {
    if (!currentUser?.uid) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (!event.key || !event.newValue) return;

      // Check if it's a Facebook access change
      if (event.key === `facebook_accessed_${currentUser.uid}` && event.newValue === 'true') {
        console.log(`[MainDashboard] 🚀 STORAGE EVENT: Facebook access detected from another tab/device!`);
        
        // Force immediate platform status refresh
        setTimeout(() => {
          setPlatforms(prev => prev.map(platform => {
            if (platform.id === 'facebook') {
              const newClaimed = getPlatformAccessStatus('facebook');
              if (newClaimed !== platform.claimed) {
                console.log(`[MainDashboard] ✅ INSTANT SYNC: Facebook platform updated from storage event`);
                return { ...platform, claimed: newClaimed };
              }
            }
            return platform;
          }));
        }, 100); // Small delay to allow localStorage to settle
      }

      // Also check for other platform access changes
      const platformMatches = event.key.match(/^(instagram|twitter|facebook|linkedin)_accessed_(.+)$/);
      if (platformMatches && platformMatches[2] === currentUser.uid) {
        const platformId = platformMatches[1] as string;
        const isNowAccessed = event.newValue === 'true';
        
        console.log(`[MainDashboard] 🚀 STORAGE EVENT: ${platformId} access changed to ${isNowAccessed} from another device`);
        
        // Force immediate platform status refresh for any platform
        setTimeout(() => {
          setPlatforms(prev => prev.map(platform => {
            if (platform.id === platformId) {
              const newClaimed = getPlatformAccessStatus(platformId);
              if (newClaimed !== platform.claimed) {
                console.log(`[MainDashboard] ✅ INSTANT SYNC: ${platformId} platform updated from storage event`);
                return { ...platform, claimed: newClaimed };
              }
            }
            return platform;
          }));
        }, 100);
      }
    };

    // Listen for storage events
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser?.uid, getPlatformAccessStatus]);

  // ✅ REAL-TIME TIMER SYNC: Update UI when processing timers complete
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncTimers = async () => {
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      let hasExpiredTimer = false;

      for (const platformId of platforms) {
        const remaining = getProcessingRemainingMs(platformId);
        // Only consider completion if local says 0; confirm with backend first to avoid cross-device race
        if (remaining === 0) {
          try {
            if (currentUser?.uid) {
              const resp = await fetch(`/api/processing-status/${currentUser.uid}?platform=${platformId}`);
              if (resp.ok) {
                const json = await resp.json();
                const data = json?.data;
                const nowTs = Date.now();
                if (data && typeof data.endTime === 'number' && nowTs < data.endTime) {
                  // Backend still active; skip completion
                  console.log(`🔥 TIMER BACKEND SAYS ACTIVE: Skipping auto-complete for ${platformId}`);
                } else if (isPlatformLoading(platformId)) {
                  console.log(`🔥 TIMER EXPIRED: ${platformId} processing completed automatically (backend confirmed inactive)`);
                  completePlatformLoading(platformId);
                  hasExpiredTimer = true;
                }
              }
            }
          } catch {}
        }
      }

      // Force platform status refresh if any timer expired
      if (hasExpiredTimer) {
        // This will trigger platform status updates
        setPlatforms(prev => [...prev]);
      }
    };

    // Sync immediately
    syncTimers();

    // Check every 5 seconds for timer completion
    const timerSyncInterval = setInterval(syncTimers, 5000);
    
    return () => clearInterval(timerSyncInterval);
  }, [currentUser?.uid, getProcessingRemainingMs, isPlatformLoading, completePlatformLoading]);

  // ✅ PROCESSING STATE UI SYNC: Force re-render when processing state changes
  useEffect(() => {
    // Force platform status refresh when processing state changes
    // This ensures the "Acquiring" status is displayed immediately
    setPlatforms(prev => [...prev]);
  }, [processingState]);

  // Fetch user's name from authentication
  useEffect(() => {
    if (currentUser) {
      // Get displayName or email from the currentUser object
      const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
      setUserName(name);
      
      // Load wishlist status from localStorage
      const wishlistStatus = localStorage.getItem(`agent_wishlisted_${currentUser.uid}`) === 'true';
      setIsWishlisted(wishlistStatus);
      
      // Load Meta Ads wishlist status from localStorage
      const metaAdsWishlistStatus = localStorage.getItem(`meta_ads_wishlisted_${currentUser.uid}`) === 'true';
      setIsMetaAdsWishlisted(metaAdsWishlistStatus);
    }
  }, [currentUser]);

  // These variables are used for debugging/monitoring but can be removed if not needed
  // const hasAccessedLinkedIn = currentUser?.uid
  //   ? localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true'
  //   : false;
  // const instagramAccessedInLocalStorage = currentUser?.uid 
  //   ? localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true' 
  //   : false;
  // const twitterAccessedInLocalStorage = currentUser?.uid
  //   ? localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true'
  //   : false;

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
          
          // Get the dashboard username (accountHolder) for AI content fetching
          const dashboardUsername = localStorage.getItem(`${platform}_username_${currentUser.uid}`);
          if (dashboardUsername) {
            // Fetch strategies count - using dashboard username for AI content
            try {
              const strategiesResponse = await fetch(`/api/retrieve-strategies/${dashboardUsername}?platform=${platform}`);
              if (strategiesResponse.ok) {
                const strategies = await strategiesResponse.json();
                // Defensive check: ensure strategies is an array before filtering
                if (Array.isArray(strategies)) {
                  // Count unseen strategies - using dashboard username for consistency
                  const viewedKey = `viewed_strategies_${platform}_${dashboardUsername}`;
                  const viewedStrategies = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                  const unseenStrategies = safeFilter(strategies, (s: any) => !viewedStrategies.includes(s.key));
                  totalCount += unseenStrategies.length;
                }
              }
            } catch (err) {
              // Ignore strategy fetch errors - don't log to reduce console noise
            }
            
            // Fetch posts count - using dashboard username for AI content
            try {
              const postsResponse = await fetch(`/api/posts/${dashboardUsername}?platform=${platform}`);
              if (postsResponse.ok) {
                const posts = await postsResponse.json();
                // Defensive check: ensure posts is an array before filtering
                if (Array.isArray(posts)) {
                  // Count unseen posts - using dashboard username for consistency
                  const viewedKey = `viewed_posts_${platform}_${dashboardUsername}`;
                  const viewedPosts = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                  const unseenPosts = safeFilter(posts, (p: any) => !viewedPosts.includes(p.key));
                  totalCount += unseenPosts.length;
                }
              }
            } catch (err) {
              // Ignore posts fetch errors - don't log to reduce console noise
            }
            
            // Fetch competitor analysis count - using dashboard username for AI content
            try {
              const accountInfoResponse = await fetch(`/api/profile-info/${dashboardUsername}?platform=${platform}`);
              if (accountInfoResponse.ok) {
                const accountInfo = await accountInfoResponse.json();
                const competitors = accountInfo.competitors || [];
                
                if (competitors.length > 0) {
                  const competitorResponse = await fetch(`/api/retrieve-multiple/${dashboardUsername}?competitors=${competitors.join(',')}&platform=${platform}`);
                  if (competitorResponse.ok) {
                    const competitorData = await competitorResponse.json();
                    // Defensive check: ensure competitorData is an array before filtering
                    if (Array.isArray(competitorData)) {
                      // Count unseen competitor analysis - using dashboard username for consistency
                      const viewedKey = `viewed_competitor_${platform}_${dashboardUsername}`;
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
    console.log(`[MainDashboard] 🔄 Main dashboard mounted - basic data load`);
    
    // Only fetch initial data on mount, no auto-refresh
    if (currentUser?.uid) {
      refreshUsage();
      fetchRealTimeNotifications();
      
      // ✅ CRITICAL FIX: Immediate platform access status sync on mount
      // This prevents the cross-device sync mismatch where MainDashboard and App.tsx show different statuses
      const immediatePlatformSync = async () => {
        try {
          console.log(`[MainDashboard] 🔄 IMMEDIATE SYNC: Syncing platform access status on mount`);
          
          const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
          const platformStatuses: Record<string, boolean> = {};
          
          // Check each platform individually using the same endpoints as App.tsx
          for (const platformId of platforms) {
            try {
              let endpoint = '';
              if (platformId === 'instagram') {
                endpoint = `/api/user-instagram-status/${currentUser.uid}`;
              } else if (platformId === 'twitter') {
                endpoint = `/api/user-twitter-status/${currentUser.uid}`;
              } else if (platformId === 'facebook') {
                endpoint = `/api/user-facebook-status/${currentUser.uid}`;
              } else {
                endpoint = `/api/platform-access/${currentUser.uid}`;
              }
              
              const resp = await fetch(endpoint);
              if (resp.ok) {
                const json = await resp.json();
                const data = json?.data || json;
                
                // Check the SAME fields as App.tsx
                let isClaimed = false;
                if (platformId === 'instagram') {
                  isClaimed = data.hasEnteredInstagramUsername === true;
                } else if (platformId === 'twitter') {
                  isClaimed = data.hasEnteredTwitterUsername === true;
                } else if (platformId === 'facebook') {
                  isClaimed = data.hasEnteredFacebookUsername === true;
                } else {
                  isClaimed = data[platformId]?.claimed === true;
                }
                
                platformStatuses[platformId] = isClaimed;
                
                // Immediately sync to localStorage for consistency
                if (isClaimed) {
                  localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
                } else {
                  // Treat Facebook the same as other platforms – backend is authoritative
                  localStorage.removeItem(`${platformId}_accessed_${currentUser.uid}`);
                }
              }
            } catch (error) {
              console.warn(`Failed to check ${platformId} status on mount:`, error);
              platformStatuses[platformId] = false;
            }
          }
          
          console.log(`[MainDashboard] 🔄 IMMEDIATE SYNC: Platform statuses synced:`, platformStatuses);
          
          // Force platform refresh to show correct status immediately
          setPlatforms(prev => [...prev]);
          
        } catch (error) {
          console.warn(`[MainDashboard] Failed to sync platform status on mount:`, error);
        }
      };
      
      immediatePlatformSync();
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

  // Get only platforms that are both claimed and connected (ready for posting)
  const connectedPlatforms = safeFilter(platforms, (p: PlatformData) => p.claimed && p.connected);

    // ✅ UNIFIED PLATFORM STATUS UPDATE: Single effect that handles both claimed and connected status
  useEffect(() => {
    // Mirror claimed state from backend - ADDITIVE ONLY to prevent overwrite
    const mirrorClaimedFromServer = async () => {
      if (!currentUser?.uid) return;
      try {
        // ✅ ADDITIVE SYNC: Only set localStorage to true, never remove existing entries
        // This prevents overwriting status when navigating back from accessed dashboards
        const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
        const platformStatuses: Record<string, boolean> = {};
        // Use platformStatuses to suppress warning
        void platformStatuses;
        
        // Check each platform individually using the same endpoints as App.tsx
        for (const platformId of platforms) {
          try {
            let endpoint = '';
            if (platformId === 'instagram') {
              endpoint = `/api/user-instagram-status/${currentUser.uid}`;
            } else if (platformId === 'twitter') {
              endpoint = `/api/user-twitter-status/${currentUser.uid}`;
            } else if (platformId === 'facebook') {
              endpoint = `/api/user-facebook-status/${currentUser.uid}`;
            } else {
              endpoint = `/api/platform-access/${currentUser.uid}`;
            }
            
            const resp = await fetch(endpoint);
            if (resp.ok) {
              const json = await resp.json();
              const data = json?.data || json;
              
              // Check the SAME fields as App.tsx
              let isClaimed = false;
              if (platformId === 'instagram') {
                isClaimed = data.hasEnteredInstagramUsername === true;
              } else if (platformId === 'twitter') {
                isClaimed = data.hasEnteredTwitterUsername === true;
              } else if (platformId === 'facebook') {
                isClaimed = data.hasEnteredFacebookUsername === true;
              } else {
                isClaimed = data[platformId]?.claimed === true;
              }
              
              if (isClaimed) {
                localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
              }
              // ✅ FIX: Never remove localStorage entries - only add when backend confirms
              // This prevents overwriting valid access status when returning from dashboards
            }
          } catch (error) {
            console.warn(`Failed to check ${platformId} status:`, error);
          }
        }
      } catch {}
    };
    mirrorClaimedFromServer();

    setPlatforms(prev => 
      prev.map(platform => {
        const newClaimed = getPlatformAccessStatus(platform.id);
        const newConnected = getPlatformConnectionStatus(platform.id);
        const isCurrentlyLoading = isPlatformLoading(platform.id);
        
        // ✅ CROSS-DEVICE SYNC FIX: Trust getPlatformAccessStatus result 
        // (which already handles localStorage override for loading state)
        const finalClaimed = newClaimed;
        
        // ✅ ENHANCED LOGGING: More detailed status information
        if (platform.claimed !== finalClaimed || platform.connected !== newConnected) {
          console.log(`[MainDashboard] 🔄 Platform ${platform.id} status update:`, {
            claimed: `${platform.claimed} -> ${finalClaimed}`,
            connected: `${platform.connected} -> ${newConnected}`,
            loading: isCurrentlyLoading,
            reason: 'status change from getPlatformAccessStatus'
          });
        }
        
        // Only update if status actually changed
        if (platform.claimed !== finalClaimed || platform.connected !== newConnected) {
          return { 
            ...platform, 
            claimed: finalClaimed,
            connected: newConnected
          };
        }
        
        return platform;
      })
    );
  }, [getPlatformAccessStatus, getPlatformConnectionStatus, isPlatformLoading]);

  // ✅ AUTO-COMPLETE CLAIMED PLATFORMS: Mark claimed platforms as completed to prevent timer
  useEffect(() => {
    if (!currentUser?.uid) return;
    // Verify with backend before auto-completing to avoid deleting an active timer from another device
    const checkAndComplete = async () => {
      const checks: Promise<void>[] = [];
      platforms.forEach((platform) => {
        if (platform.claimed && !completedPlatforms.has(platform.id)) {
          const remainingMs = getProcessingRemainingMs(platform.id);
          if (remainingMs === 0) {
            checks.push(
              (async () => {
                try {
                  const resp = await fetch(`/api/processing-status/${currentUser.uid}?platform=${platform.id}`);
                  if (!resp.ok) return;
                  const json = await resp.json();
                  const data = json?.data;
                  const nowTs = Date.now();
                  if (data && typeof data.endTime === 'number' && nowTs < data.endTime) {
                    // Active on server; DO NOT complete
                    console.log(`[MainDashboard] ⛔ Skipping auto-complete for ${platform.id} - active on server`);
                    return;
                  }
                  console.log(`[MainDashboard] ✅ Auto-marking claimed platform ${platform.id} as completed (confirmed no active timer)`);
                  completePlatformLoading(platform.id);
                } catch {}
              })()
            );
          }
        }
      });
      if (checks.length > 0) {
        await Promise.all(checks);
      }
    };
    checkAndComplete();
  }, [platforms, completedPlatforms, currentUser?.uid, getProcessingRemainingMs, completePlatformLoading]);

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

  // ✅ PLATFORM RESET LISTENER: Handle platform reset events from exit setup
  useEffect(() => {
    const handlePlatformReset = (event: CustomEvent) => {
      const { platform, reason } = event.detail;
      console.log(`[MainDashboard] 🔥 Platform reset event received: ${platform} (${reason})`);
      
      if (currentUser?.uid) {
        // ✅ CRITICAL FIX: Immediately clear platform access status from localStorage
        // This ensures both MainDashboard and TopBar show "not acquired" status
        const accessKey = `${platform}_accessed_${currentUser.uid}`;
        localStorage.removeItem(accessKey);
        console.log(`[MainDashboard] 🔥 Cleared platform access status: ${accessKey}`);
        
        // Remove platform from completed platforms
        setCompletedPlatforms(prev => {
          const newCompleted = new Set(prev);
          newCompleted.delete(platform);
          console.log(`[MainDashboard] 🔥 Removed ${platform} from completed platforms`);
          return newCompleted;
        });
        
        // Clear any loading state
        setPlatformLoadingStates(prev => {
          const newStates = { ...prev };
          delete newStates[platform];
          console.log(`[MainDashboard] 🔥 Cleared loading state for ${platform}`);
          return newStates;
        });
        
        // Force platform status refresh
        setPlatforms(prev => 
          prev.map(p => {
            if (p.id === platform) {
              console.log(`[MainDashboard] 🔥 Reset platform status for ${platform}: claimed=false, connected=false`);
              return { 
                ...p, 
                claimed: false,
                connected: false
              };
            }
            return p;
          })
        );
        
        // Refresh notifications to clear any counts
        fetchRealTimeNotifications();
        
        // ✅ CRITICAL: Force immediate re-render to update UI
        console.log(`[MainDashboard] 🔥 Platform ${platform} fully reset - UI will show "not acquired" status`);
      }
    };
    
    window.addEventListener('platformReset', handlePlatformReset as EventListener);
    return () => {
      window.removeEventListener('platformReset', handlePlatformReset as EventListener);
    };
  }, [currentUser?.uid, fetchRealTimeNotifications]);

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
        
        // ✅ CRITICAL FIX: Force refresh platform access status from backend
        // This ensures cross-device synchronization when returning to dashboard
        const forceRefreshPlatformStatus = async () => {
          try {
            console.log(`[MainDashboard] 🔄 FORCE REFRESH: Checking platform status from backend on focus`);
            
            // ✅ CRITICAL FIX: Use the SAME endpoints as App.tsx for consistency
            const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
            const platformStatuses: Record<string, boolean> = {};
            
            // Check each platform individually using the same endpoints as App.tsx
            for (const platformId of platforms) {
              try {
                let endpoint = '';
                if (platformId === 'instagram') {
                  endpoint = `/api/user-instagram-status/${currentUser.uid}`;
                } else if (platformId === 'twitter') {
                  endpoint = `/api/user-twitter-status/${currentUser.uid}`;
                } else if (platformId === 'facebook') {
                  endpoint = `/api/user-facebook-status/${currentUser.uid}`;
                } else {
                  endpoint = `/api/platform-access/${currentUser.uid}`;
                }
                
                const resp = await fetch(endpoint);
                if (resp.ok) {
                  const json = await resp.json();
                  const data = json?.data || json;
                  
                  // Check the SAME fields as App.tsx
                  let isClaimed = false;
                  if (platformId === 'instagram') {
                    isClaimed = data.hasEnteredInstagramUsername === true;
                  } else if (platformId === 'twitter') {
                    isClaimed = data.hasEnteredTwitterUsername === true;
                  } else if (platformId === 'facebook') {
                    isClaimed = data.hasEnteredFacebookUsername === true;
                  } else {
                    isClaimed = data[platformId]?.claimed === true;
                  }
                  
                  platformStatuses[platformId] = isClaimed;
                }
              } catch (error) {
                console.warn(`Failed to check ${platformId} status:`, error);
                platformStatuses[platformId] = false;
              }
            }
            
            let hasChanges = false;
            platforms.forEach(pid => {
              const key = `${pid}_accessed_${currentUser.uid}`;
              const wasClaimed = localStorage.getItem(key) === 'true';
              const isNowClaimed = platformStatuses[pid] || false;
              
              if (isNowClaimed && !wasClaimed) {
                localStorage.setItem(key, 'true');
                hasChanges = true;
                console.log(`[MainDashboard] 🔄 Platform ${pid} now claimed (was not claimed)`);
              } else if (!isNowClaimed && wasClaimed) {
                // For other platforms, clear as normal
                localStorage.removeItem(key);
                hasChanges = true;
                console.log(`[MainDashboard] 🔄 Platform ${pid} no longer claimed (was claimed)`);
              }
            });
          
            if (hasChanges) {
              console.log(`[MainDashboard] 🔄 FORCE REFRESH: Platform status changes detected, forcing platform refresh`);
              setPlatforms(prev => [...prev]);
              
              // Force immediate re-render
              setTimeout(() => {
                setPlatforms(prev => [...prev]);
                
                // Force immediate re-render
                setTimeout(() => {
                  setPlatforms(prev => [...prev]);
                }, 100);
              }, 100);
            }
          } catch (error) {
            console.warn(`[MainDashboard] Failed to force refresh platform status:`, error);
          }
        };
        
        forceRefreshPlatformStatus();
        
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

  // ✅ REAL-TIME PLATFORM STATUS SYNC: Monitor platform access status changes every 5 seconds
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncPlatformStatus = () => {
      let hasStatusChange = false;
      
      platforms.forEach(platform => {
        const currentClaimed = getPlatformAccessStatus(platform.id);
        const currentConnected = getPlatformConnectionStatus(platform.id);
        
        // Check if status has changed from what we have in state
        if (platform.claimed !== currentClaimed || platform.connected !== currentConnected) {
          console.log(`[MainDashboard] 🔄 Platform ${platform.id} status change detected: claimed=${currentClaimed}, connected=${currentConnected}`);
          hasStatusChange = true;
        }
      });
      
      // If any status changed, force platform refresh
      if (hasStatusChange) {
        console.log('[MainDashboard] 🔄 Platform status changes detected, refreshing platform list');
        setPlatforms(prev => 
          prev.map(platform => {
            const newClaimed = getPlatformAccessStatus(platform.id);
            const newConnected = getPlatformConnectionStatus(platform.id);
            
            return { 
              ...platform, 
              claimed: newClaimed,
              connected: newConnected
            };
          })
        );
      }
    };

    // Sync immediately
    syncPlatformStatus();

    // Check every 5 seconds for status changes
    const statusSyncInterval = setInterval(syncPlatformStatus, 5000);
    
    return () => clearInterval(statusSyncInterval);
  }, [currentUser?.uid, platforms, getPlatformAccessStatus, getPlatformConnectionStatus]);

  // Sort platforms so claimed ones appear first
  const sortedPlatforms = [...platforms].sort((a, b) => {
    if (a.claimed && !b.claimed) return -1;
    if (!a.claimed && b.claimed) return 1;
    return 0;
  });
  
  // Function to mark platform as accessed - used for platform management  
  const markPlatformAccessed = useCallback((platformId: string) => {
    if (!currentUser?.uid) return;
    
    localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    // Persist claimed=true to backend for cross-device sync
    fetch(`/api/platform-access/${currentUser.uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: platformId, claimed: true })
    }).catch(() => {});
    
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
  }, [currentUser?.uid]);

  const navigateToPlatform = (platform: PlatformData) => {
    const remainingMs = getProcessingRemainingMs(platform.id);
    
    // ✅ CRITICAL SAFETY CHECK: Ensure platform is actually claimed
    if (!platform.claimed) {
      console.error(`🔥 NAVIGATION ERROR: Attempted to navigate to platform ${platform.id} but it's not claimed!`);
      console.error(`🔥 PLATFORM STATE:`, {
        id: platform.id,
        claimed: platform.claimed,
        connected: platform.connected,
        loading: isPlatformLoading(platform.id)
      });
      // Fallback to setup instead of crashing
      navigateToSetup(platform.id);
      return;
    }
    
    // ✅ SELECTIVE BLOCKING: Only block access to THIS specific platform if it's processing
    if (remainingMs > 0) {
      const remainingTime = Math.ceil(remainingMs / 1000 / 60);
      console.log(`🔥 SELECTIVE BLOCK: Redirecting ${platform.id} to processing page (${remainingTime} min remaining)`);
      
      // ✅ CRITICAL FIX: NEVER pass username when re-navigating to prevent overwriting inter-username form data
      // The ProcessingLoadingState will get the username from localStorage, which is the source of truth
      safeNavigate(navigate, `/processing/${platform.id}`, {
        state: {
          platform: platform.id,
          // username: currentUser?.displayName || '', // REMOVED: This was overwriting the crucial inter-username form username
          remainingMinutes: remainingTime
        }
      }, 7);
      return;
    }
    
    // ✅ NAVIGATION FLEXIBILITY: Allow access to all other areas normally
    console.log(`🔥 NAVIGATION: Allowing access to ${platform.id} (no active processing)`);
    
    // ✅ CRITICAL FIX: Improved navigation logic for claimed platforms
    if (platform.claimed) {
      // Platform is claimed - navigate to appropriate dashboard
      if (platform.id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6); // Instagram dashboard
      } else if (platform.id === 'twitter') {
        safeNavigate(navigate, '/twitter-dashboard', {}, 6); // Twitter dashboard - explicit path
      } else if (platform.id === 'facebook') {
        safeNavigate(navigate, '/facebook-dashboard', {}, 6); // Facebook dashboard - explicit path
      } else if (platform.id === 'linkedin') {
        safeNavigate(navigate, '/linkedin-dashboard', {}, 6); // LinkedIn dashboard - explicit path
      } else {
        safeNavigate(navigate, `/${platform.route}`, {}, 6);
      }
      return;
    }
    
    // ✅ CRITICAL FIX: Remove redundant navigation logic that was causing confusion
    // The above logic should handle all cases properly
    console.warn(`🔥 NAVIGATION FALLBACK: Unexpected navigation case for ${platform.id} - claimed=${platform.claimed}, loading=${isPlatformLoading(platform.id)}`);
  };

  const navigateToSetup = (platformId: string) => {
    // ✅ CRITICAL FIX: Check if platform is currently in loading state BEFORE navigating to setup
    if (isPlatformLoading(platformId)) {
      const remainingMs = getProcessingRemainingMs(platformId);
      const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
      
      console.log(`🔥 PLATFORM CLICK: ${platformId} is currently in loading state (${remainingMinutes}min remaining), redirecting to processing`);
      
      // Redirect to processing page instead of entry form
      safeNavigate(navigate, `/processing/${platformId}`, {
        state: {
          platform: platformId,
          remainingMinutes
        }
      }, 6);
      return; // Exit early - don't proceed to entry form
    }

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
      
      // ✅ CRITICAL FIX: NEVER pass username when re-navigating to prevent overwriting inter-username form data
      // The ProcessingLoadingState will get the username from localStorage, which is the source of truth
      safeNavigate(navigate, `/processing/${platform.id}`, {
        state: {
          platform: platform.id,
          // username: currentUser?.displayName || '', // REMOVED: This was overwriting the crucial inter-username form username
          remainingMinutes
        }
      }, 7);
      return;
    }

    if (!platform.connected) {
      // Navigate to entry form for unconnected platforms
      if (platform.id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6); // Instagram special case
      } else {
        safeNavigate(navigate, `/${platform.id}`, {}, 6); // Entry form path e.g. /facebook
      }
      return;
    }
    // If platform is connected, go to its dashboard route
    if (platform.connected) {
      if (platform.id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6);
      } else {
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
    // Pre-select platforms that are both claimed (acquired) AND connected
    const connectedPlatformIds = safeMap(
      safeFilter(platforms, (p: PlatformData) => p.claimed && p.connected),
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
    setIsPostingInstantPost(true);
    
    // Verify post has content
    if (postContent.text.trim() === '' && postContent.images.length === 0) {
      alert("Please enter some text or add an image for your post.");
      setIsPostingInstantPost(false);
      return;
    }
    
    // Get selected platforms that are both claimed and connected
    const selectedPlatforms = safeFilter(platforms, (p: PlatformData) => 
      postContent.platformIds.includes(p.id) && p.claimed && p.connected
    );
    
    // If no platforms are claimed and connected, save as draft
    if (selectedPlatforms.length === 0) {
      alert("Your post has been saved as a draft. Please make sure platforms are both acquired and connected to post.");
      setShowInstantPostModal(false);
      setIsPostingInstantPost(false);
      return;
    }
    
    // ✅ PRE-CHECK: Verify post usage limits for all selected platforms
    const postCheckResult = canUseFeature('posts');
    if (!postCheckResult.allowed) {
      // This will trigger the upgrade popup via event
      alert(postCheckResult.reason);
      setShowInstantPostModal(false);
      setIsPostingInstantPost(false);
      return;
    }
    
    // Validate Instagram has images if selected
    const hasInstagram = selectedPlatforms.some(p => p.id === 'instagram');
    if (hasInstagram && postContent.images.length === 0) {
      alert("Instagram posts require at least one image. Please add an image for Instagram or uncheck Instagram.");
      setIsPostingInstantPost(false);
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
    
    setIsPostingInstantPost(false);
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
    return usage.posts + usage.aiReplies + usage.discussions;
  };



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
            {/* Meta Ads Coming Soon Section */}
            <div className="meta-ads-section">
              <button 
                className="meta-ads-button"
                onClick={() => setShowMetaAdsModal(true)}
                title="Run Meta Ads campaigns with AI"
              >
                <div className="meta-ads-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
                  </svg>
                </div>
                <div className="meta-ads-text">
                  <h3>Run Meta Ads</h3>
                  <p>Launch AI-powered ad campaigns with just a few clicks</p>
                </div>
                <div className="meta-ads-status">
                  <span>Coming Soon</span>
                </div>
              </button>
            </div>
            
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
                  <p>Create one post for all your acquired and connected platforms</p>
                </div>
                {connectedPlatforms.length > 0 && (
                  <div className="connected-platforms-count">
                    <span>{connectedPlatforms.length} ready</span>
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
                    onClick={() => {
                      // ✅ CRITICAL FIX: Always check loading state first before any navigation
                      if (isPlatformLoading(platform.id)) {
                        const remainingMs = getProcessingRemainingMs(platform.id);
                        const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
                        
                        console.log(`🔥 PLATFORM CLICK INTERCEPT: ${platform.id} is in loading state (${remainingMinutes}min remaining), redirecting to processing`);
                        
                        // Redirect to processing page instead of any other action
                        safeNavigate(navigate, `/processing/${platform.id}`, {
                          state: {
                            platform: platform.id,
                            remainingMinutes
                          }
                        }, 6);
                        return; // Exit early - don't proceed to any other navigation
                      }
                      
                      // Normal navigation logic
                      if (platform.claimed) {
                        console.log(`🔥 PLATFORM NAVIGATION: ${platform.id} is claimed, navigating to platform dashboard`);
                        navigateToPlatform(platform);
                      } else {
                        console.log(`🔥 PLATFORM NAVIGATION: ${platform.id} is not claimed, navigating to setup`);
                        navigateToSetup(platform.id);
                      }
                    }}
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
                        className={`status-indicator ${
                          isPlatformLoading(platform.id) 
                            ? 'acquiring' 
                            : platform.claimed 
                              ? 'claimed' 
                              : 'unclaimed'
                        }`}
                      >
                        {isPlatformLoading(platform.id) 
                          ? 'Acquiring' 
                          : platform.claimed 
                            ? 'Acquired' 
                            : 'Not Acquired'}
                      </div>
                      
                      <div 
                        className={`connection-indicator ${
                          platform.id === 'linkedin' && !platform.connected 
                            ? 'coming-soon' 
                            : platform.claimed 
                              ? (platform.connected ? 'connected' : 'disconnected')
                              : 'not-applicable'
                        }`}
                        onClick={() => {
                          // ✅ CRITICAL FIX: Always check loading state first before any connection action
                          if (isPlatformLoading(platform.id)) {
                            const remainingMs = getProcessingRemainingMs(platform.id);
                            const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
                            
                            console.log(`🔥 CONNECTION CLICK INTERCEPT: ${platform.id} is in loading state (${remainingMinutes}min remaining), redirecting to processing`);
                            
                            // Redirect to processing page instead of connection action
                            safeNavigate(navigate, `/processing/${platform.id}`, {
                              state: {
                                platform: platform.id,
                                remainingMinutes
                              }
                            }, 6);
                            return; // Exit early - don't proceed to connection action
                          }
                          
                          // Normal connection logic
                          platform.claimed && !platform.connected && platform.id !== 'linkedin' && handleConnectionButtonClick(platform);
                        }}
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
                    <div className="notification-badge-container"
                      onClick={() => {
                        // ✅ CRITICAL FIX: Always check loading state first before any notification action
                        if (isPlatformLoading(platform.id)) {
                          const remainingMs = getProcessingRemainingMs(platform.id);
                          const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
                          
                          console.log(`🔥 NOTIFICATION CLICK INTERCEPT: ${platform.id} is in loading state (${remainingMinutes}min remaining), redirecting to processing`);
                          
                          // Redirect to processing page instead of notification action
                          safeNavigate(navigate, `/processing/${platform.id}`, {
                            state: {
                              platform: platform.id,
                              remainingMinutes
                            }
                          }, 6);
                          return; // Exit early - don't proceed to notification action
                        }
                        
                        // Normal notification logic
                        handleNotificationClick(platform.id);
                      }}
                    >
                      <div 
                        className="notification-badge"
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
            
            {/* Meta Ads Coming Soon Modal */}
            {showMetaAdsModal && (
              <div className="meta-ads-modal">
                <div className="meta-ads-content">
                  <div className="meta-ads-header">
                    <h3>Meta Ads Campaign Manager</h3>
                    <button 
                      className="meta-ads-close-btn"
                      onClick={() => setShowMetaAdsModal(false)}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="meta-ads-body">
                    <div className="meta-ads-icon-large">
                      <svg viewBox="0 0 24 24">
                        <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
                      </svg>
                    </div>
                    
                    <h4>Coming Soon</h4>
                    <p>
                      The Meta Ads Campaign Manager will revolutionize your advertising strategy. 
                      Our AI-powered system will create, optimize, and manage your Facebook and Instagram ad campaigns 
                      with just a few clicks. Get ready for intelligent targeting, automated optimization, 
                      and real-time performance tracking.
                    </p>
                    
                    <div className="meta-ads-features">
                      <div className="feature-item">
                        <svg viewBox="0 0 24 24">
                          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
                        </svg>
                        <span>AI-Powered Campaign Creation</span>
                      </div>
                      <div className="feature-item">
                        <svg viewBox="0 0 24 24">
                          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
                        </svg>
                        <span>Intelligent Audience Targeting</span>
                      </div>
                      <div className="feature-item">
                        <svg viewBox="0 0 24 24">
                          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
                        </svg>
                        <span>Real-Time Performance Analytics</span>
                      </div>
                      <div className="feature-item">
                        <svg viewBox="0 0 24 24">
                          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
                        </svg>
                        <span>Automated Budget Optimization</span>
                      </div>
                    </div>
                    
                    <button 
                      className={`meta-ads-wishlist-btn ${isMetaAdsWishlisted ? 'wishlisted' : ''}`}
                      onClick={() => {
                        if (!isMetaAdsWishlisted) {
                          setIsMetaAdsWishlisted(true);
                          setShowMetaAdsWishlistConfirmation(true);
                          if (currentUser?.uid) {
                            localStorage.setItem(`meta_ads_wishlisted_${currentUser.uid}`, 'true');
                          }
                          setTimeout(() => setShowMetaAdsWishlistConfirmation(false), 3000);
                        }
                      }}
                      disabled={isMetaAdsWishlisted}
                    >
                      {isMetaAdsWishlisted ? 'Added to Wishlist' : 'Add to Wishlist'}
                    </button>
                    
                    {showMetaAdsWishlistConfirmation && (
                      <div className="meta-ads-wishlist-confirmation">
                        <p>Thank you for your interest! You'll be notified when Meta Ads Campaign Manager launches.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                  <p className="stat-value">{safeLength(safeFilter(platforms, (p: PlatformData) => p.claimed && p.connected))}</p>
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
            <div className="agent-content">
              <h2 className="agent-title">Autonomous Account Manager</h2>
              <p className="agent-description">
                The Autonomous Account Manager will arrive soon to revolutionize your social media presence. 
                When you connect your platforms, it will run intelligent campaigns autonomously to achieve your goals. 
                Our AI will handle branding, promotion, and organic growth seamlessly across all your connected accounts.
              </p>
              
              <button 
                className={`wishlist-button ${isWishlisted ? 'wishlisted' : ''}`}
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
              
              {/* Connected & Claimed Platforms */}
              {safeLength(safeFilter(platforms, (platform: PlatformData) => platform.claimed && platform.connected)) > 0 && (
                <div className="connected-platforms-section">
                  <div className="section-title">
                    <span className="status-indicator connected">✓ Ready to Post (Acquired & Connected)</span>
                  </div>
                  <div className="platform-checkboxes">
                    {safeMap(
                      safeFilter(platforms, (platform: PlatformData) => platform.claimed && platform.connected),
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
              
              {safeLength(safeFilter(platforms, (p: PlatformData) => p.claimed && p.connected)) === 0 && (
                <div className="no-connected-platforms">
                  <p>No platforms are ready for posting. Please acquire platforms and connect your accounts from the platform dashboards to start posting.</p>
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
                disabled={isPostingInstantPost}
              >
                Cancel
              </button>
              <button 
                className="post-button"
                disabled={isPostingInstantPost || (postContent.text.trim() === '' && postContent.images.length === 0)}
                onClick={handleInstantPost}
              >
                {isPostingInstantPost 
                  ? 'Processing...' 
                  : postContent.scheduleDate 
                    ? 'Schedule Post' 
                    : 'Post Now'
                }
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Privacy Policy Footer */}
      <PrivacyPolicyFooter />
    </div>
  );
};

export default MainDashboard; 