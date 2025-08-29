import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PLATFORM TIMING CONFIGURATION:
 * - Facebook: 20 minutes initial setup
 * - Instagram: 15 minutes initial setup  
 * - Twitter: 15 minutes initial setup
 * - All platforms: 5 minutes extension when running statistics not found
 * 
 * The component automatically detects whether it's an initial setup or extension
 * based on the remainingMinutes prop and adjusts timing accordingly.
 */
import { 
  FiTarget,
  FiClock,
  FiMessageCircle,
  FiZap,
  FiTrendingUp,
  FiCamera,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiStar,
  FiDatabase,
  FiCpu,
  FiLayers,
  FiCheckCircle,
  FiX,
  FiAlertTriangle
} from 'react-icons/fi';
import './ProcessingLoadingState.css';
import { useNavigate } from 'react-router-dom';
import { safeNavigate } from '../../utils/navigationGuard';
import { FaChartLine, FaFlag, FaInstagram, FaTwitter, FaFacebook } from 'react-icons/fa';
import { MdAnalytics } from 'react-icons/md';
import { BsLightningChargeFill } from 'react-icons/bs';
import { useProcessing } from '../../context/ProcessingContext';
import { useAuth } from '../../context/AuthContext';

interface ProcessingStage {
  id: number;
  name: string;
  description: string;
  status: string;
  icon: React.ReactNode;
  percentage: number;
}

interface ProTip {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

// Define platform configuration type
type PlatformConfigType = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  icon: React.ReactNode;
  initialMinutes: number; // Add initial timing for each platform
  extensionMinutes: number; // Add extension timing for all platforms
};

// Define platform configurations
const PLATFORM_CONFIGS: Record<string, PlatformConfigType> = {
  instagram: {
    name: 'Instagram',
    primaryColor: '#e4405f',
    secondaryColor: '#00ffcc',
    icon: <FaInstagram />,
    initialMinutes: 15, // Instagram gets 15 minutes initially
    extensionMinutes: 5  // 5 minutes extension for all platforms
  },
  twitter: {
    name: 'X (Twitter)',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    icon: <FaTwitter />,
    initialMinutes: 15, // Twitter gets 15 minutes initially
    extensionMinutes: 5  // 5 minutes extension for all platforms
  },
  facebook: {
    name: 'Facebook',
    primaryColor: '#1877f2',
    secondaryColor: '#42a5f5',
    icon: <FaFacebook />,
    initialMinutes: 20, // Facebook gets 20 minutes initially
    extensionMinutes: 5  // 5 minutes extension for all platforms
  }
};

// Default platform config for fallback
const DEFAULT_PLATFORM_CONFIG: PlatformConfigType = {
  name: 'Platform',
  primaryColor: '#666666',
  secondaryColor: '#cccccc',
  icon: <BsLightningChargeFill />,
  initialMinutes: 15, // Default to 15 minutes
  extensionMinutes: 5  // Default extension time
};

interface ProcessingLoadingStateProps {
  platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  username: string;
  onComplete?: () => void;
  countdownMinutes?: number;
  remainingMinutes?: number;
  extensionMessage?: string;
  allowAutoComplete?: boolean;
  onExit?: () => void; // Add exit callback prop
}

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username: propUsername,
  onComplete,
  countdownMinutes, // Remove default value - we'll use platform-specific timing
  remainingMinutes,
  extensionMessage,
  allowAutoComplete = true,
  onExit
}) => {
  const navigate = useNavigate();
  const { completeProcessing } = useProcessing();
  const { currentUser } = useAuth();
  
  // Add exit confirmation modal state
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // Get platform configuration with fallback
  const platformConfig = PLATFORM_CONFIGS[platform] || DEFAULT_PLATFORM_CONFIG;

  // ✅ BULLETPROOF TIMER SYSTEM - Real-time calculation based approach
  
  // ✅ NO FALLBACKS: Username must be preserved exactly as stored
  const getUsernameFromStorage = (platformId: string): string | null => {
    try {
      const processingInfo = localStorage.getItem(`${platformId}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        if (info.username && typeof info.username === 'string' && info.username.trim()) {
          return info.username.trim();
        }
      }
            } catch (error) {
          console.error('Error reading username from localStorage:', error instanceof Error ? error.message : 'Unknown error');
        }
    return null; // NO FALLBACKS - return null if no valid username
  };

  // ✅ NO FALLBACKS: Get username with absolute priority preservation
  const username = React.useMemo(() => {
    const stored = getUsernameFromStorage(platform);
    if (stored) {
      console.log(`🔒 LOCKED USERNAME: Using stored username '${stored}' for ${platform}`);
      return stored;
    }
    if (propUsername && typeof propUsername === 'string') {
      const trimmed = propUsername.trim();
      if (trimmed) {
        console.log(`🔑 PROP USERNAME: Using prop username '${trimmed}' for ${platform}`);
        return trimmed;
      }
    }
    // Do NOT throw here. Allow backend sync effect to repair username from server.
    console.error(`🚨 FATAL: No username available for platform ${platform}. Deferring to backend sync to repair.`);
    return '';
  }, [platform, propUsername]);

  // ✅ CRITICAL FIX: Check if platform is already completed on mount to prevent dual timer issue
  useEffect(() => {
    if (!currentUser?.uid || !username) return;
    
    const checkPlatformCompletion = async () => {
      try {
        const accessResp = await fetch(`/api/platform-access/${currentUser.uid}`);
        if (accessResp.ok) {
          const accessJson = await accessResp.json();
          const accessData = accessJson?.data || accessJson;
          let isClaimed = false;
          
          if (platform === 'instagram') {
            isClaimed = accessData.hasEnteredInstagramUsername === true;
          } else if (platform === 'twitter') {
            isClaimed = accessData.hasEnteredTwitterUsername === true;
          } else if (platform === 'facebook') {
            isClaimed = accessData.hasEnteredFacebookUsername === true;
          } else {
            isClaimed = accessData[platform]?.claimed === true;
          }
          
          if (isClaimed) {
            console.log(`🔥 PLATFORM COMPLETION DETECTED ON MOUNT: ${platform} is already completed, completing immediately`);
            // Clear any existing timers
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
            setCachedTimerData(null);
            setTimerCompleted(true);
            return;
          }
        }
              } catch (error) {
          console.warn(`🔥 PLATFORM COMPLETION CHECK ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
    
    // Run completion check after a short delay to allow component to mount
    const completionCheckDelay = setTimeout(checkPlatformCompletion, 1000);
    return () => clearTimeout(completionCheckDelay);
  }, [platform, currentUser?.uid, username]);

  // ✅ PLATFORM-SPECIFIC TIMING LOGIC
  // Determine the appropriate countdown duration based on platform and context
  const getCountdownDuration = (): number => {
    // If remainingMinutes is provided (extension scenario), use that
    if (remainingMinutes !== undefined) {
      return remainingMinutes;
    }
    
    // If countdownMinutes is explicitly provided, use that
    if (countdownMinutes !== undefined) {
      return countdownMinutes;
    }
    
    // Otherwise, use platform-specific initial timing
    return platformConfig.initialMinutes;
  };

  // Get the final countdown duration
  const finalCountdownMinutes = getCountdownDuration();

  // Helper function to get appropriate extension message
  const getExtensionMessage = (): string => {
    if (remainingMinutes !== undefined) {
      return `⚡ Extension: ${remainingMinutes} minutes remaining to complete setup`;
    }
    return '⚡ This one-time setup ensures lightning-fast performance forever';
  };

  // Helper function to get appropriate setup description
  const getSetupDescription = (): string => {
    if (remainingMinutes !== undefined) {
      return `Extension setup: ${remainingMinutes} minutes remaining to complete your dashboard configuration.`;
    }
    return `This ${platformConfig.initialMinutes}-minute initialization creates your custom analytics engine, competitor analysis, and automation tools. You'll never have to wait again!`;
  };

  // State to trigger re-renders for real-time updates
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
  const [timerCompleted, setTimerCompleted] = useState(false);
  const [timerJustCreated, setTimerJustCreated] = useState(false);

  // ✅ OPTIMIZED TIMER CACHING: Cache timer data to avoid excessive localStorage reads
  const [cachedTimerData, setCachedTimerData] = useState<{
    endTime: number;
    startTime: number;
    totalDuration: number;
    username: string;
    lastCacheTime: number;
  } | null>(null);

  // ✅ SMART TIMER DATA CACHING: Only read from localStorage when necessary
  const getTimerData = useCallback(() => {
    const now = Date.now();
    
    // Use cached data if it's fresh (less than 1 second old)
    if (cachedTimerData && (now - cachedTimerData.lastCacheTime) < 1000) {
      return cachedTimerData;
    }

    try {
      const endTimeRaw = localStorage.getItem(`${platform}_processing_countdown`);
      const processingInfoRaw = localStorage.getItem(`${platform}_processing_info`);
      
      // ✅ OPTIMIZED LOGGING: Only log when cache is refreshed, not every read
      if (!cachedTimerData) {
        console.log(`🔍 TIMER CACHE: Initializing timer cache for ${platform}`);
      }
      
      if (!endTimeRaw || !processingInfoRaw) {
        if (cachedTimerData) {
          // Clear cache if data no longer exists
          setCachedTimerData(null);
        }
        return null;
      }
      
      const endTime = parseInt(endTimeRaw, 10);
      const processingInfo = JSON.parse(processingInfoRaw);
      
      if (Number.isNaN(endTime) || !processingInfo.startTime) {
        if (cachedTimerData) {
          setCachedTimerData(null);
        }
        return null;
      }
      
      const newTimerData = {
        endTime,
        startTime: processingInfo.startTime,
        totalDuration: processingInfo.totalDuration || (finalCountdownMinutes * 60 * 1000),
        username: processingInfo.username,
        lastCacheTime: now
      };
      
      // Update cache
      setCachedTimerData(newTimerData);
      
      // Only log cache refresh in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 TIMER CACHE: Refreshed timer cache for ${platform} - ${Math.ceil((endTime - now) / 60000)}min remaining`);
      }
      
      return newTimerData;
            } catch (error) {
          console.error(`🔍 TIMER CACHE: Error reading timer data for ${platform}:`, error instanceof Error ? error.message : 'Unknown error');
          if (cachedTimerData) {
            setCachedTimerData(null);
          }
          return null;
        }
  }, [platform, finalCountdownMinutes, cachedTimerData]);

  // ✅ CRITICAL FIX: Initialize timer data if not exists (first time setup)
  useEffect(() => {
    // If the timer has already completed, do NOT create a new one
    if (timerCompleted) {
      return;
    }

    const existingTimer = getTimerData();
    
    if (!existingTimer) {
      // If username is missing, do not initialize a fresh timer locally.
      // Wait for backend sync to mirror authoritative state and username.
      if (!username) {
        console.log(`⏳ TIMER INIT DEFERRED: Missing username for ${platform}. Awaiting backend sync before creating timer.`);
        return;
      }
      
      // ✅ CRITICAL FIX: Check if processing is already complete before creating new timer
      if (currentUser?.uid) {
        // Check if platform is already claimed (completed)
        fetch(`/api/platform-access/${currentUser.uid}`)
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error('Failed to check platform access');
          })
          .then(data => {
            const accessData = data?.data || data;
            let isClaimed = false;
            
            if (platform === 'instagram') {
              isClaimed = accessData.hasEnteredInstagramUsername === true;
            } else if (platform === 'twitter') {
              isClaimed = accessData.hasEnteredTwitterUsername === true;
            } else if (platform === 'facebook') {
              isClaimed = accessData.hasEnteredFacebookUsername === true;
            } else {
              isClaimed = accessData[platform]?.claimed === true;
            }
            
            if (isClaimed) {
              console.log(`🔥 PLATFORM COMPLETION DETECTED: ${platform} is already completed, not creating new timer`);
              // Mark as completed locally and trigger completion
              setTimerCompleted(true);
              return;
            }
            
            // Platform not claimed, proceed with timer creation
            createNewTimer();
          })
          .catch(error => {
            console.warn(`🔥 PLATFORM CHECK ERROR: ${error instanceof Error ? error.message : 'Unknown error'}, proceeding with timer creation`);
            createNewTimer();
          });
      } else {
        // No user context, proceed with timer creation
        createNewTimer();
      }
    } else {
      console.log(`🔥 BULLETPROOF TIMER: Resumed existing ${platform} timer with username '${existingTimer.username}'`);
    }
    
    // ✅ CRITICAL FIX: Extract timer creation logic to prevent infinite loops
    function createNewTimer() {
      const now = Date.now();
      const durationMs = finalCountdownMinutes * 60 * 1000;
      const endTime = now + durationMs;
      
      console.log(`🔥 TIMER INIT: Creating new timer for ${platform} - duration: ${finalCountdownMinutes}min, endTime: ${new Date(endTime).toISOString()}`);
      
      // ✅ CRITICAL: NEVER overwrite existing username - check if username already exists
      let finalUsername = username;
      try {
        const existingProcessingInfo = localStorage.getItem(`${platform}_processing_info`);
        if (existingProcessingInfo) {
          const existingInfo = JSON.parse(existingProcessingInfo);
          if (existingInfo.username && typeof existingInfo.username === 'string' && existingInfo.username.trim()) {
            const preserved = existingInfo.username.trim();
            console.log(`🔒 PRESERVING EXISTING USERNAME: Keeping existing username '${preserved}' for ${platform} (not overwriting with '${username}')`);
            finalUsername = preserved; // ALWAYS preserve existing username
          }
        }
              } catch (err) {
          console.error('Error checking existing username in localStorage:', err instanceof Error ? err.message : 'Unknown error');
        }
      
      localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
      localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
        platform,
        username: finalUsername,
        startTime: now,
        endTime,
        totalDuration: durationMs,
        isExtension: remainingMinutes !== undefined
      }));
      
      // Update cache immediately
      setCachedTimerData({
        endTime,
        startTime: now,
        totalDuration: durationMs,
        username: finalUsername,
        lastCacheTime: now
      });
      
      // ✅ CRITICAL: Persist to backend for cross-device sync
      if (currentUser?.uid) {
        // Step 1: Save processing status (timer data)
        fetch(`/api/processing-status/${currentUser.uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            startTime: now,
            endTime,
            totalDuration: durationMs,
            username: finalUsername
          })
        }).then(response => {
          if (response.ok) {
            console.log(`🔥 BACKEND SYNC: Processing status saved to backend for ${platform}`);
          } else {
            console.warn(`🔥 BACKEND SYNC: Failed to save processing status for ${platform}`);
          }
        }).catch(error => {
          console.error(`🔥 BACKEND SYNC: Error saving processing status for ${platform}:`, error);
        });
        
        // Step 2: Mark platform as NOT claimed (in loading state) for cross-device sync
        fetch(`/api/platform-access/${currentUser.uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            claimed: false,
            username: finalUsername
          })
        }).then(response => {
          if (response.ok) {
            console.log(`🔥 BACKEND SYNC: Platform ${platform} marked as NOT claimed (loading state) for cross-device sync`);
          } else {
            console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platform} as NOT claimed`);
          }
        }).catch(error => {
          console.error(`🔥 BACKEND SYNC: Error marking platform ${platform} as NOT claimed:`, error);
        });
      }
      
      console.log(`🔥 BULLETPROOF TIMER: Initialized ${platform} timer for ${finalCountdownMinutes} minutes (${remainingMinutes !== undefined ? 'EXTENSION' : `INITIAL - ${platformConfig.initialMinutes}min`}) with username '${finalUsername}'`);
      
      // Set flag to prevent backend sync from clearing the timer immediately
      setTimerJustCreated(true);
      setTimeout(() => setTimerJustCreated(false), 5000);
    }
  }, [platform, username, finalCountdownMinutes, remainingMinutes, timerCompleted, currentUser?.uid]); // ✅ REMOVED getTimerData from dependencies to prevent infinite loops

  // Real-time calculation functions
  const getRemainingMs = (): number => {
    const timerData = getTimerData();
    if (!timerData) return 0;
    
    const remaining = Math.max(0, timerData.endTime - currentTime);
    return remaining;
  };

  const getRemainingSeconds = (): number => {
    return Math.ceil(getRemainingMs() / 1000);
  };

  const getProgressPercentage = (): number => {
    const timerData = getTimerData();
    if (!timerData) return 100;
    
    const elapsed = currentTime - timerData.startTime;
    const progress = Math.min(100, Math.max(0, (elapsed / timerData.totalDuration) * 100));
    return progress;
  };

  // ✅ OPTIMIZED REAL-TIME TIMER - Smart update intervals based on remaining time
  useEffect(() => {
    if (timerCompleted) return;
    
    const updateTimer = () => {
      const now = Date.now();
      setCurrentTime(now);
      
      const remaining = getRemainingMs();
      
      if (remaining <= 0 && !timerCompleted) {
        if (allowAutoComplete) {
          setTimerCompleted(true);
          // Clean up localStorage only when auto-completing
          try {
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
            // Clear cache
            setCachedTimerData(null);
            
            // Mark platform as completed
            const completedPlatforms = localStorage.getItem('completedPlatforms');
            const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
            if (!completed.includes(platform)) {
              completed.push(platform);
              localStorage.setItem('completedPlatforms', JSON.stringify(completed));
            }
            
            // ✅ CRITICAL: Mark platform as claimed in backend when processing completes
            if (currentUser?.uid) {
              // Get username from localStorage or use the current username prop
              let usernameToUse = username;
              try {
                const processingInfo = localStorage.getItem(`${platform}_processing_info`);
                if (processingInfo) {
                  const info = JSON.parse(processingInfo);
                  if (info.username && typeof info.username === 'string' && info.username.trim()) {
                    usernameToUse = info.username.trim();
                  }
                }
              } catch {}

              // (1) Update platform-access endpoint (used by MainDashboard)
              fetch(`/api/platform-access/${currentUser.uid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  platform, 
                  claimed: true,
                  username: usernameToUse
                })
              }).then(response => {
                if (response.ok) {
                  console.log(`🔥 BACKEND SYNC: Platform ${platform} marked as claimed after completion`);
                } else {
                  console.warn(`🔥 BACKEND SYNC: Failed to mark platform ${platform} as claimed`);
                }
              }).catch(error => {
                console.error(`🔥 BACKEND SYNC: Error marking platform ${platform} as claimed:`, error);
              });

              // (2) Update user-status endpoint (used by App/pages) to ensure cross-device Facebook claimed sync
              try {
                let userStatusEndpoint = '';
                let payload: any = {};
                if (platform === 'instagram') {
                  userStatusEndpoint = `/api/user-instagram-status/${currentUser.uid}`;
                  payload = { instagram_username: usernameToUse };
                } else if (platform === 'twitter') {
                  userStatusEndpoint = `/api/user-twitter-status/${currentUser.uid}`;
                  payload = { twitter_username: usernameToUse };
                } else if (platform === 'facebook') {
                  userStatusEndpoint = `/api/user-facebook-status/${currentUser.uid}`;
                  payload = { facebook_username: usernameToUse };
                }
                if (userStatusEndpoint) {
                  fetch(userStatusEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  }).then(res => {
                    if (res.ok) {
                      console.log(`🔥 BACKEND SYNC: ${platform} user-status updated for cross-device claimed sync`);
                      // Mirror to localStorage for instant recognition on other tabs/devices sharing storage
                      try {
                        localStorage.setItem(`${platform}_accessed_${currentUser.uid}`, 'true');
                        if (usernameToUse && usernameToUse.trim()) {
                          localStorage.setItem(`${platform}_username_${currentUser.uid}`, usernameToUse.trim());
                        }
                      } catch {}
                    } else {
                      console.warn(`🔥 BACKEND SYNC: Failed to update ${platform} user-status endpoint`);
                    }
                  }).catch(err => {
                    console.warn(`🔥 BACKEND SYNC: Error updating ${platform} user-status endpoint:`, err);
                  });
                }
              } catch {}

              // (3) Proactively clear backend processing status (avoids any race on next reads)
              try {
                fetch(`/api/processing-status/${currentUser.uid}`, {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ platform })
                }).catch(() => {});
              } catch {}
            }
            
            console.log(`🔥 BULLETPROOF TIMER: Completed ${platform} processing`);
                  } catch (error) {
          console.error('Error cleaning up timer:', error instanceof Error ? error.message : 'Unknown error');
        }
        } else {
          // Do not mark as completed; parent may extend time and continue updates
          // Keep interval running so UI can reflect extended endTime written by parent
        }
      }
    };
    
    // Update immediately
    updateTimer();
    
    // ✅ SMART UPDATE INTERVALS: Use different intervals based on remaining time and tab visibility
    const getUpdateInterval = () => {
      const remaining = getRemainingMs();
      const remainingMinutes = Math.ceil(remaining / 60000);
      
      if (remainingMinutes <= 1) {
        // Last minute: update every 100ms for smooth countdown
        return isTabVisible ? 100 : 500;
      } else if (remainingMinutes <= 5) {
        // Last 5 minutes: update every 500ms
        return isTabVisible ? 500 : 1000;
      } else if (remainingMinutes <= 10) {
        // Last 10 minutes: update every 1 second
        return isTabVisible ? 1000 : 2000;
      } else {
        // More than 10 minutes: update every 2 seconds
        return isTabVisible ? 2000 : 5000;
      }
    };
    
    const interval = setInterval(updateTimer, getUpdateInterval());
    
    return () => clearInterval(interval);
  }, [platform, isTabVisible, timerCompleted, allowAutoComplete, currentUser?.uid, username]); // ✅ Dependencies optimized

  // ✅ PAGE VISIBILITY API - Perfect tab switching synchronization
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsTabVisible(isVisible);
      
      if (isVisible) {
        // Tab became visible - force immediate time sync
        const now = Date.now();
        setCurrentTime(now);
        console.log(`🔥 BULLETPROOF TIMER: Tab visible - synced time for ${platform}`);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [platform]);

  // ✅ STORAGE SYNC - Sync across multiple tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `${platform}_processing_countdown` || e.key === `${platform}_processing_info`) {
        // Timer data changed in another tab - force sync
        const now = Date.now();
        setCurrentTime(now);
        console.log(`🔥 BULLETPROOF TIMER: Cross-tab sync for ${platform}`);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [platform]);

  // ✅ BACKEND STATUS SYNC - Keep endTime mirrored from server for cross-device consistency
  useEffect(() => {
    if (!currentUser?.uid) return;
    let cancelled = false;
    let lastSyncTime = 0;
    const SYNC_COOLDOWN = 8000; // ✅ OPTIMIZED: Increased to 8 seconds for better performance

    const syncFromServer = async () => {
      const now = Date.now();
      if (now - lastSyncTime < SYNC_COOLDOWN) {
        return; // Skip if too soon
      }
      lastSyncTime = now;

      try {
        const resp = await fetch(`/api/processing-status/${currentUser.uid}?platform=${platform}`);
        if (!resp.ok) return;
        const json = await resp.json();
        const data = json?.data;
        const nowTs = Date.now();
        
        if (!cancelled) {
          if (data && typeof data.endTime === 'number' && nowTs < data.endTime) {
            // Server has active status - mirror to local
            localStorage.setItem(`${platform}_processing_countdown`, String(data.endTime));
            try {
              const info: any = {
                platform,
                startTime: data.startTime,
                endTime: data.endTime,
                totalDuration: data.totalDuration,
              };
              if (data.username) info.username = data.username;
              localStorage.setItem(`${platform}_processing_info`, JSON.stringify(info));
              console.log(`🔍 BACKEND SYNC: ${platform} - mirrored server status to local`);
            } catch {}
            setCurrentTime(Date.now());
          } else {
            // ✅ CRITICAL FIX: Check if platform is completed on server before clearing local timer
            try {
              const accessResp = await fetch(`/api/platform-access/${currentUser.uid}`);
              if (accessResp.ok) {
                const accessJson = await accessResp.json();
                const accessData = accessJson?.data || accessJson;
                let isClaimed = false;
                
                if (platform === 'instagram') {
                  isClaimed = accessData.hasEnteredInstagramUsername === true;
                } else if (platform === 'twitter') {
                  isClaimed = accessData.hasEnteredTwitterUsername === true;
                } else if (platform === 'facebook') {
                  isClaimed = accessData.hasEnteredFacebookUsername === true;
                } else {
                  isClaimed = accessData[platform]?.claimed === true;
                }
                
                if (isClaimed) {
                  console.log(`🔍 BACKEND SYNC: ${platform} - platform completed on server, clearing local timer and completing`);
                  localStorage.removeItem(`${platform}_processing_countdown`);
                  localStorage.removeItem(`${platform}_processing_info`);
                  setCachedTimerData(null);
                  setTimerCompleted(true);
                  return;
                }
              }
                    } catch (accessError) {
          console.warn(`🔍 BACKEND SYNC: ${platform} - error checking platform access:`, accessError instanceof Error ? accessError.message : 'Unknown error');
        }
            
            // No active status on server and platform not completed - check local timer
            const localEndTime = localStorage.getItem(`${platform}_processing_countdown`);
            const localProcessingInfo = localStorage.getItem(`${platform}_processing_info`);
            
            if (localEndTime && localProcessingInfo) {
              try {
                const localEndTimeNum = parseInt(localEndTime);
                JSON.parse(localProcessingInfo); // parsed for validation only
                
                // CRITICAL SAFEGUARD: Don't clear timer if it was just created
                if (timerJustCreated) {
                  console.log(`🔍 BACKEND SYNC: ${platform} - timer just created, preserving local timer`);
                  setCurrentTime(Date.now());
                  return;
                }

                // Only clear if local timer has actually expired
                if (nowTs >= localEndTimeNum) {
                  console.log(`🔍 BACKEND SYNC: ${platform} - clearing expired local timer`);
                  localStorage.removeItem(`${platform}_processing_countdown`);
                  localStorage.removeItem(`${platform}_processing_info`);
                  setCachedTimerData(null);
                } else {
                  // Local timer still active - sync back to server if missing
                  if (!data || !data.endTime) {
                    console.log(`🔍 BACKEND SYNC: ${platform} - local timer active but missing on server, syncing back`);
                    try {
                      const localInfo = JSON.parse(localProcessingInfo);
                      await fetch(`/api/processing-status/${currentUser.uid}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          platform,
                          username: localInfo.username || '',
                          startTime: localInfo.startTime || nowTs,
                          endTime: localEndTimeNum,
                          totalDuration: localInfo.totalDuration || (localEndTimeNum - (localInfo.startTime || nowTs))
                        })
                      });
                      console.log(`🔍 BACKEND SYNC: ${platform} - successfully synced local timer back to server`);
                            } catch (syncError) {
          console.warn(`🔍 BACKEND SYNC: ${platform} - failed to sync local timer back to server:`, syncError instanceof Error ? syncError.message : 'Unknown error');
        }
                  }
                }
                      } catch (error) {
          console.warn(`🔍 BACKEND SYNC: ${platform} - error parsing local timer data:`, error instanceof Error ? error.message : 'Unknown error');
        }
            }
            setCurrentTime(Date.now());
          }
        }
              } catch (error) {
          console.warn(`🔍 BACKEND SYNC: ${platform} - error:`, error instanceof Error ? error.message : 'Unknown error');
        }
    };
    
    // Initial sync with delay to allow local timer to initialize and persist to backend
    const initialSyncDelay = setTimeout(() => {
      if (!cancelled) {
        console.log(`🔍 BACKEND SYNC: ${platform} - initial sync after delay`);
        syncFromServer();
      }
    }, 5000); // ✅ OPTIMIZED: Increased to 5 seconds for better performance
    
    // ✅ OPTIMIZED SYNC FREQUENCY: Increased to 10 seconds for better performance
    const id = setInterval(syncFromServer, 10000); // Increased to 10 seconds
    return () => { 
      cancelled = true; 
      clearTimeout(initialSyncDelay);
      clearInterval(id); 
    };
  }, [platform, currentUser?.uid, timerJustCreated]);

  // Current values for display
  const countdown = getRemainingSeconds();

  const handleContinue = () => {
    // Call ProcessingContext completeProcessing
    completeProcessing();
    
    if (onComplete) onComplete();
  };

  // Handle completion on mount if countdown is already 0
  useEffect(() => {
    if (timerCompleted && onComplete && allowAutoComplete) {
      completeProcessing();
      onComplete();
    }
  }, [timerCompleted, onComplete, completeProcessing, allowAutoComplete]);

  // ✅ SELECTIVE NAVIGATION BLOCKING - Only block the specific platform being processed
  // This allows users to explore other parts of the app while timer runs
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (countdown > 0) {
        e.preventDefault();
        e.returnValue = 'Your dashboard setup is still in progress. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [countdown]);

  // Handle direct navigation attempts - but ONLY for this specific platform
  useEffect(() => {
    const handleNavigation = () => {
      if (countdown > 0) {
        // Only redirect if they try to access THIS platform's dashboard
        const currentPath = window.location.pathname;
        const isPlatformDashboard = (
          (platform === 'instagram' && currentPath.includes('/dashboard') && !currentPath.includes('twitter') && !currentPath.includes('facebook') && !currentPath.includes('linkedin')) ||
          (platform === 'twitter' && currentPath.includes('/twitter-dashboard')) ||
          (platform === 'facebook' && currentPath.includes('/facebook-dashboard')) ||
          (platform === 'linkedin' && currentPath.includes('/linkedin-dashboard'))
        );
        
        if (isPlatformDashboard) {
          safeNavigate(navigate, `/processing/${platform}`, { 
            state: { 
              platform, 
              username,
              remainingMinutes: Math.ceil(countdown / 60) 
            },
            replace: true
          }, 8);
        }
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [countdown, navigate, platform, username]);

  const [currentStage, setCurrentStage] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [tipProgress, setTipProgress] = useState(0);

  // Reusable stage system - automatically splits time into 5 equal stages
  const processingStages: ProcessingStage[] = [
    {
      id: 1,
      name: 'Initialize',
      description: 'Setting up your secure AI workspace',
      status: 'Establishing encrypted connections and preparing your personalized environment...',
      icon: <FiLayers size={20} />,
      percentage: 20
    },
    {
      id: 2,
      name: 'Analyze',
      description: 'Scanning your social media presence',
      status: 'Analyzing your content history, engagement patterns, and audience insights...',
      icon: <FiDatabase size={20} />,
      percentage: 40
    },
    {
      id: 3,
      name: 'Intelligence',
      description: 'Building competitive intelligence engine',
      status: 'Processing market data, competitor analysis, and trend predictions...',
      icon: <FiCpu size={20} />,
      percentage: 60
    },
    {
      id: 4,
      name: 'Optimize',
      description: 'Creating your personalized strategy',
      status: 'Generating AI-powered recommendations and automation workflows...',
      icon: <FiZap size={20} />,
      percentage: 80
    },
    {
      id: 5,
      name: 'Launch',
      description: 'Finalizing your dashboard experience',
      status: 'Almost ready! Preparing your complete social media command center...',
      icon: <FiCheckCircle size={20} />,
      percentage: 100
    }
  ];

  // Update current stage based on time progress - BULLETPROOF real-time calculation
  useEffect(() => {
    const progress = getProgressPercentage();
    const newStageIndex = processingStages.findIndex(stage => progress < stage.percentage);
    const stageIndex = newStageIndex === -1 ? processingStages.length - 1 : Math.max(0, newStageIndex - 1);
    
    if (stageIndex !== currentStage) {
      setCurrentStage(stageIndex);
    }
  }, [currentTime, currentStage, processingStages]);

  const calculateProgress = (): number => {
    return getProgressPercentage();
  };

  const proTips: ProTip[] = [
    {
      id: 'goal-optimization',
      title: '🎯 Master Goal Optimization for Maximum Engagement',
      description: 'Transform your social strategy with intelligent goal optimization. Set specific targets like increasing followers, boosting engagement, or driving conversions, and watch our AI analyze your past performance to create personalized campaigns. The system studies your audience behavior, optimal posting times, and content preferences from our vast database of successful campaigns. Based on your unique goals, it automatically generates content, schedules posts, and adjusts strategies in real-time to maximize your reach and engagement.',
      icon: <FiTarget size={20} />
    },
    {
      id: 'dm-rules-safety',
      title: '🛡️ Smart DM Rules & Safety Automation',
      description: 'Protect your account while maximizing opportunities with intelligent DM management. Create custom rules to automatically filter spam, identify genuine business inquiries, and route important messages to your attention. Our AI learns from millions of conversations to detect potentially harmful content, promotional spam, and genuine engagement. Set up automated responses for common inquiries while maintaining authentic interactions that build real relationships with your audience.',
      icon: <FiMessageCircle size={20} />
    },
    {
      id: 'ai-reply-system',
      title: '🤖 Revolutionary AI Reply for Comments & DMs',
      description: 'Experience the future of social media management with context-aware AI responses. Our advanced GPT models understand your brand voice, analyze conversation context, and generate replies that feel authentically human. The system learns from your previous interactions, maintains conversation flow, and adapts responses based on user sentiment and intent. Perfect for handling customer support, engagement, and building meaningful connections at scale.',
      icon: <FiZap size={20} />
    },
    {
      id: 'auto-scheduling',
      title: '⏰ Intelligent Auto-Scheduling That Never Sleeps',
      description: 'Revolutionize your content strategy with AI-powered scheduling that analyzes over 50 million data points to predict peak engagement times. Our algorithm considers your audience timezone, historical engagement patterns, platform-specific optimal windows, and real-time trending topics. Schedule weeks or months of content in advance while maintaining the flexibility to adapt to breaking news, viral trends, or unexpected opportunities.',
      icon: <FiClock size={20} />
    },
    {
      id: 'post-generation',
      title: '✨ Next-Level Post Generation & Content Creation',
      description: 'Create viral-ready content that resonates with your audience using our advanced AI content engine. Input your brand guidelines, target audience, and campaign goals, and watch as our system generates engaging captions, selects optimal hashtags, and even suggests visual themes. The AI analyzes trending topics, competitor content, and successful posts in your niche to create content that drives engagement and growth.',
      icon: <FiCamera size={20} />
    },
    {
      id: 'discussion-mode',
      title: '💬 Strategic Discussion Mode for Optimal Planning',
      description: 'Unlock powerful strategic insights with our discussion mode feature. Collaborate with AI to brainstorm content ideas, analyze campaign performance, and develop winning strategies. The system provides data-driven recommendations, identifies growth opportunities, and helps you navigate complex social media challenges. Perfect for planning seasonal campaigns, product launches, or pivoting your strategy based on market changes.',
      icon: <FiUsers size={20} />
    },
    {
      id: 'live-insights',
      title: '📊 Real-Time API Insights & Live Analytics',
      description: 'Access live, synchronized data directly from platform APIs to make informed decisions instantly. Monitor follower growth, engagement rates, reach metrics, and audience demographics in real-time. Our system connects directly to Instagram, Twitter, and Facebook APIs to provide the most accurate, up-to-date information about your account performance, helping you spot trends and opportunities as they happen.',
      icon: <MdAnalytics size={20} />
    },
    {
      id: 'estimation-insights',
      title: '🧠 Advanced Estimation Model & Predictive Analytics',
      description: 'Leverage our proprietary estimation model built from millions of scraped data points to predict future performance and identify growth opportunities. Our AI analyzes patterns from successful accounts in your niche, predicting optimal content types, posting frequency, and engagement strategies. This predictive intelligence helps you stay ahead of trends and make data-driven decisions for sustained growth.',
      icon: <FiTrendingUp size={20} />
    },
    {
      id: 'goal-planning',
      title: '🎯 Strategic Goal Planning & Future Roadmapping',
      description: 'Plan your social media success with comprehensive goal-setting tools that align with your business objectives. Our system helps you set realistic yet ambitious targets, break them down into actionable milestones, and track progress over time. Whether you\'re aiming for 10K followers, launching a product, or building brand awareness, our strategic planning tools guide you every step of the way.',
      icon: <FaFlag size={20} />
    },
    {
      id: 'competitor-analysis',
      title: '🔍 Deep Competitor Analysis & Market Intelligence',
      description: 'Gain the competitive edge with comprehensive competitor analysis that reveals winning strategies in your niche. Our AI monitors competitor content, engagement patterns, growth tactics, and audience interactions to identify what works and what doesn\'t. Use these insights to refine your strategy, discover content gaps, and capitalize on opportunities your competitors might be missing.',
      icon: <FaChartLine size={20} />
    },
    {
      id: 'channel-automation',
      title: '🚀 Complete Channel Automation & Growth Engine',
      description: 'Transform your social presence into a self-sustaining growth machine with complete channel automation. Our system handles everything from content creation and scheduling to engagement and community management. Based on your goals and target audience, it continuously optimizes your strategy, adapts to algorithm changes, and scales your presence while maintaining authentic engagement and brand consistency.',
      icon: <BsLightningChargeFill size={20} />
    }
  ];

  // Auto-advance tips effect - 1 minute per tip for comprehensive reading
  useEffect(() => {
    if (isAutoPlaying && !timerCompleted) {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
        setTipProgress(0); // Reset progress when moving to next tip
      }, 60000); // 60 seconds per tip for thorough reading
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying, timerCompleted, proTips.length]);

  // Tip progress tracking
  useEffect(() => {
    if (isAutoPlaying && !timerCompleted) {
      const progressInterval = setInterval(() => {
        setTipProgress((prev) => {
          const newProgress = prev + (100 / 60); // 60 seconds = 100%
          return newProgress >= 100 ? 0 : newProgress;
        });
      }, 1000); // Update every second
      return () => clearInterval(progressInterval);
    }
  }, [isAutoPlaying, timerCompleted, currentTipIndex]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleTipNavigation = (index: number) => {
    setCurrentTipIndex(index);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes to allow for thorough reading
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + proTips.length) % proTips.length);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  // Keyboard navigation for tips
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!timerCompleted) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault();
            prevTip();
            break;
          case 'ArrowRight':
            event.preventDefault();
            nextTip();
            break;
          case ' ':
            event.preventDefault();
            setIsAutoPlaying(prev => !prev);
            break;
          case 'Escape':
            if (isExitModalOpen) {
              event.preventDefault();
              handleCloseExitModal();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timerCompleted, isExitModalOpen]);

  // Touch/swipe support for mobile
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && countdown > 0) {
      nextTip();
    }
    if (isRightSwipe && countdown > 0) {
      prevTip();
    }
  };

  // Handle exit button click
  const handleExitClick = () => {
    setIsExitModalOpen(true);
  };

  // Handle exit confirmation - COMPREHENSIVE RESET LIKE RESET BUTTON
  const handleConfirmExit = async () => {
    if (!currentUser?.uid) {
      console.error('🔥 EXIT: No authenticated user found');
      return;
    }

    console.log(`🔥 EXIT LOADING STATE: User confirmed exit for ${platform} (user: ${currentUser.uid})`);
    setIsExiting(true);
    const userId = currentUser.uid;
    const broadcastKey = `processing_exit_broadcast_${platform}_${userId}`;
    const nowTs = Date.now();
    try {
      // Step 0: Optimistic broadcast so other tabs stop any guard redirects immediately
      try {
        localStorage.setItem(broadcastKey, nowTs.toString());
      } catch {}

      // Step 1: Clear frontend caches first (immediate feedback)
      console.log(`🔥 EXIT: Clearing frontend caches for ${platform}`);
      const keysToRemove = [
        `${platform}_processing_countdown`,
        `${platform}_processing_info`,
        'processingState'
      ];
      keysToRemove.forEach(key => { localStorage.removeItem(key); });

      // Preserve completedPlatforms (do NOT blanket remove here) but ensure platform not marked completed prematurely
      try {
        const completedRaw = localStorage.getItem('completedPlatforms');
        if (completedRaw) {
          const arr = JSON.parse(completedRaw).filter((p: string) => p !== platform);
          localStorage.setItem('completedPlatforms', JSON.stringify(arr));
        }
      } catch {}

      // Step 2: Backend explicit delete of processing status BEFORE reset so guard sees cleared state
      try {
        const delResp = await fetch(`/api/processing-status/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        if (!delResp.ok) console.warn('🔥 EXIT: Backend processing-status delete failed');
      } catch (e) {
        console.warn('🔥 EXIT: Error deleting backend processing status', e);
      }

      // Step 3: Call backend reset API (same as reset button)
      console.log(`🔥 EXIT: Calling backend reset API for ${platform}`);
      try {
        const response = await fetch(`/api/platform-reset/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        if (!response.ok) {
          console.warn(`🔥 EXIT: Backend reset failed: ${response.statusText}`);
        } else {
          const result = await response.json();
          console.log(`🔥 EXIT: Backend reset successful:`, result);
        }
      } catch (e) {
        console.warn('🔥 EXIT: platform-reset request error', e);
      }

      // Step 4: Processing context reset & claimed false
      completeProcessing();
      try {
        await fetch(`/api/platform-access/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, claimed: false })
        });
      } catch (e) {
        console.warn('🔥 EXIT: Failed clearing platform-access claimed flag', e);
      }

      // Step 5: Broadcast finalization (second write to trigger storage event even if same second)
      try { localStorage.setItem(broadcastKey, (nowTs + 1).toString()); } catch {}
      window.dispatchEvent(new CustomEvent('processingExit', { detail: { platform, userId, ts: Date.now() }}));

      // Step 6: Navigate out
      if (onExit) {
        onExit();
      } else {
        safeNavigate(navigate, '/account', {
          replace: true,
          state: {
            resetPlatform: platform,
            resetTimestamp: Date.now(),
            exitReason: 'setup_exited'
          }
        }, 8);
      }

      console.log(`🔥 EXIT: Successfully exited loading state for ${platform}`);

    } catch (error) {
      console.error('🔥 EXIT: Error during exit cleanup:', error instanceof Error ? error.message : 'Unknown error');
      completeProcessing();
      if (onExit) { onExit(); } else { safeNavigate(navigate, '/account', { replace: true }, 8); }
    } finally {
      setIsExiting(false);
    }
  };

  // Handle exit modal close
  const handleCloseExitModal = () => {
    if (!isExiting) {
      setIsExitModalOpen(false);
    }
  };

  return (
    <div className="processing-container">
      <div className="processing-backdrop" />
      
      {/* Exit Button - Fixed position at bottom right, only show when timer is running */}
      {countdown > 0 && (
        <motion.button
          className="exit-loading-button"
          onClick={handleExitClick}
          disabled={isExiting}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.0, duration: 0.4 }}
          whileHover={{ scale: isExiting ? 1 : 1.05 }}
          whileTap={{ scale: isExiting ? 1 : 0.95 }}
          title="Exit Loading State (Esc)"
          aria-label="Exit setup process"
          role="button"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleExitClick();
            }
          }}
        >
          <FiX size={20} />
          <span className="exit-button-text">{isExiting ? 'Exiting...' : 'Exit'}</span>
        </motion.button>
      )}
      
      <motion.div
        className="processing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Header */}
        <motion.div
          className="processing-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div 
            className="platform-badge" 
            style={{ 
              backgroundColor: platformConfig.primaryColor,
              color: platformConfig.secondaryColor 
            }}
          >
            <span className="platform-icon">
              {platformConfig.icon}
            </span>
            <span className="platform-name">{platformConfig.name}</span>
          </div>
          
          <h1 className="main-title">
            Setting Up Your {platformConfig.name} Dashboard
          </h1>
          
          <div className="setup-message">
            <div className="one-time-badge">
              <FiCheckCircle size={14} />
              <span>One-Time Setup</span>
            </div>
            <p className="subtitle">
              We're preparing your personalized dashboard with AI-powered insights.
            </p>
            <p className="setup-description">
              {getSetupDescription()}
            </p>
          </div>
          
          <p className="username-welcome">
            Welcome, <span className="username-highlight">{username}</span>
          </p>
        </motion.div>

        {/* Progress Section */}
        <motion.div
          className="progress-section"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          {/* Stage Indicators */}
          <div className="stage-indicators">
            {processingStages.map((stage, index) => (
              <motion.div
                key={stage.id}
                className={`stage-indicator ${index <= currentStage ? 'active' : ''} ${index === currentStage ? 'current' : ''}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + index * 0.1 }}
              >
                <div className="stage-icon">{stage.icon}</div>
                <span className="stage-name">{stage.name}</span>
              </motion.div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="progress-track">
            <motion.div
              className="progress-fill"
              style={{ backgroundColor: platformConfig.primaryColor }}
              initial={{ width: 0 }}
              animate={{ width: `${calculateProgress()}%` }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>

          {/* Current Stage Info */}
          <AnimatePresence mode="wait">
            {allowAutoComplete && timerCompleted ? (
              <motion.div
                className="completion-stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="completion-header">
                  <div className="completion-check">
                    <FiCheckCircle size={24} />
                  </div>
                  <h3>🎉 Your Dashboard is Ready!</h3>
                </div>
                <p className="completion-message">
                  Congratulations! Your personalized {platformConfig.name} command center is now fully configured 
                  with AI-powered insights, automation tools, and competitive intelligence.
                </p>
                <motion.button
                  className="continue-button"
                  style={{ backgroundColor: platformConfig.primaryColor }}
                  onClick={handleContinue}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <span>Continue to Dashboard</span>
                  <FiChevronRight size={18} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key={currentStage}
                className="current-stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <div className="stage-header">
                  <div className="stage-pulse" style={{ backgroundColor: platformConfig.primaryColor }} />
                  <h3>{processingStages[currentStage].description}</h3>
                </div>
                <p className="stage-status">{processingStages[currentStage].status}</p>
                <div className="time-display">
                  <FiClock size={14} />
                  <span>{formatTime(countdown)}</span>
                </div>
                <div className="remaining-setup-info">
                  <span className="setup-note">
                    {extensionMessage || getExtensionMessage()}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Pro Tips */}
        <motion.div
          className="tips-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <div className="tips-header">
            <FiStar size={16} />
            <span>Pro Insights</span>
            <div className="reading-time">
              <span>~1 min read</span>
            </div>
            <div className="navigation-hint">
              <span>← → keys or swipe to navigate</span>
            </div>
          </div>

          <div className="tips-carousel">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                className="tip-card"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5 }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="tip-icon">{proTips[currentTipIndex].icon}</div>
                <div className="tip-content">
                  <h4>{proTips[currentTipIndex].title}</h4>
                  <p>{proTips[currentTipIndex].description}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Tip Progress Bar */}
            {isAutoPlaying && (
              <div className="tip-progress-track">
                <motion.div
                  className="tip-progress-fill"
                  style={{ 
                    backgroundColor: platformConfig.primaryColor,
                    width: `${tipProgress}%`
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${tipProgress}%` }}
                  transition={{ duration: 0.2, ease: "linear" }}
                />
              </div>
            )}

            <div className="tips-controls">
              <button onClick={prevTip} className="tip-nav">
                <FiChevronLeft size={16} />
              </button>
              
              <div className="tip-indicators">
                <div className="tip-slider-track">
                  <motion.div
                    className="tip-slider-fill"
                    style={{ backgroundColor: platformConfig.primaryColor }}
                    initial={{ x: 0 }}
                    animate={{ x: `${(currentTipIndex / (proTips.length - 1)) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  />
                </div>
                <div className="tip-dots">
                  {proTips.map((_, index) => (
                    <button
                      key={index}
                      className={`tip-dot ${index === currentTipIndex ? 'active' : ''}`}
                      onClick={() => handleTipNavigation(index)}
                      style={{
                        backgroundColor: index === currentTipIndex 
                          ? platformConfig.primaryColor 
                          : 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                  ))}
                </div>
                <div className="tip-counter">
                  <span>{currentTipIndex + 1} / {proTips.length}</span>
                </div>
              </div>
              
              <button onClick={nextTip} className="tip-nav">
                <FiChevronRight size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {isExitModalOpen && (
          <motion.div
            className="exit-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseExitModal}
          >
            <motion.div
              className="exit-modal-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="exit-modal-header">
                <div className="exit-modal-icon">
                  <FiAlertTriangle size={24} />
                </div>
                <h3>Exit Setup Process?</h3>
              </div>
              
              <div className="exit-modal-body">
                <p>Are you sure you want to exit the {platformConfig.name} setup process?</p>
                <div className="exit-warning">
                  <strong>This will completely reset the platform:</strong>
                  <ul>
                    <li>Stop the current setup process</li>
                    <li>Clear your username entry for this platform</li>
                    <li>Remove platform from "acquired" status</li>
                    <li>Delete backend cache and mapping data</li>
                    <li>Return you to the main dashboard</li>
                    <li>Require you to re-enter username details to restart</li>
                  </ul>
                  <p><strong>Note:</strong> This is the same as a complete platform reset - you'll need to start over.</p>
                </div>
              </div>
              
              <div className="exit-modal-actions">
                <button
                  className="exit-modal-cancel"
                  onClick={handleCloseExitModal}
                  disabled={isExiting}
                >
                  Continue Setup
                </button>
                <button
                  className="exit-modal-confirm"
                  onClick={handleConfirmExit}
                  disabled={isExiting}
                  style={{ backgroundColor: platformConfig.primaryColor }}
                >
                  {isExiting ? 'Exiting...' : 'Exit Setup'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProcessingLoadingState;