import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface UsageStats {
  posts: number;
  discussions: number;
  aiReplies: number;
  campaigns: number;
  views: number;
  resets: number;
}

interface UsageContextType {
  usage: UsageStats;
  incrementUsage: (feature: keyof UsageStats, platform?: string, count?: number) => Promise<void>;
  resetUsage: () => void;
  resetDashboard: () => void;
  getUsageForFeature: (feature: keyof UsageStats) => number;
  trackFeatureUsage: (feature: keyof UsageStats, platform: string, action: string, count?: number) => Promise<void>;
  isFeatureBlocked: (feature: keyof UsageStats) => boolean;
  getUserLimits: () => { posts: number; discussions: number; aiReplies: number; campaigns: number; views: number; resets: number };
  refreshUsage: () => Promise<void>;
  isLoading: boolean;
  currentPlatform?: string;
  currentUsername?: string;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export const useUsage = () => {
  const context = useContext(UsageContext);
  if (!context) {
    console.error('[UsageContext] useUsage hook called outside of UsageProvider!');
    console.error('[UsageContext] Make sure the component is wrapped with <UsageProvider>');
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
};

interface UsageProviderProps {
  children: React.ReactNode;
}

export const UsageProvider: React.FC<UsageProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [usage, setUsage] = useState<UsageStats>({
    posts: 0,
    discussions: 0,
    aiReplies: 0,
    campaigns: 0,
    views: 0,
    resets: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState<string>('');
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const isIncrementInProgress = React.useRef(false);

  // Get current platform and username from localStorage or URL
  useEffect(() => {
    const getPlatformAndUsername = () => {
      // Try to get from localStorage (accountHolder pattern)
      const accountHolder = localStorage.getItem('accountHolder');
      if (accountHolder) {
        try {
          const parsed = JSON.parse(accountHolder);
          if (parsed.platform && parsed.username) {
            setCurrentPlatform(parsed.platform);
            setCurrentUsername(parsed.username);
            return;
          }
        } catch (error) {
          console.warn('[UsageContext] Error parsing accountHolder:', error);
        }
      }

      // Fallback: try to determine from URL or other sources
      const path = window.location.pathname;
      if (path.includes('/instagram')) {
        setCurrentPlatform('instagram');
        const instagramAccount = localStorage.getItem('instagramAccountInfo');
        if (instagramAccount) {
          try {
            const parsed = JSON.parse(instagramAccount);
            setCurrentUsername(parsed.username || '');
          } catch (error) {
            console.warn('[UsageContext] Error parsing Instagram account:', error);
          }
        }
      } else if (path.includes('/facebook')) {
        setCurrentPlatform('facebook');
        const facebookAccount = localStorage.getItem('facebookAccountInfo');
        if (facebookAccount) {
          try {
            const parsed = JSON.parse(facebookAccount);
            setCurrentUsername(parsed.username || '');
          } catch (error) {
            console.warn('[UsageContext] Error parsing Facebook account:', error);
          }
        }
      } else if (path.includes('/twitter')) {
        setCurrentPlatform('twitter');
        const twitterAccount = localStorage.getItem('twitterAccountInfo');
        if (twitterAccount) {
          try {
            const parsed = JSON.parse(twitterAccount);
            setCurrentUsername(parsed.username || '');
          } catch (error) {
            console.warn('[UsageContext] Error parsing Twitter account:', error);
          }
        }
      }
    };

    getPlatformAndUsername();

    // Listen for storage changes to update platform/username
    const handleStorageChange = () => {
      getPlatformAndUsername();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Load usage from backend on mount and user change
  const refreshUsage = useCallback(async () => {
    if (!currentUser?.uid) {
      console.warn('[UsageContext] No current user, skipping usage refresh');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log(`[UsageContext] 🔄 Refreshing usage for userId: ${currentUser.uid}`);
      
      // Get usage from userId-based backend API 
      const response = await fetch(`/api/user/${currentUser.uid}/usage`);
      
      if (response.ok) {
        const backendUsage = await response.json();
        const normalizedUsage = {
          posts: backendUsage.postsUsed || 0,
          discussions: backendUsage.discussionsUsed || 0,
          aiReplies: backendUsage.aiRepliesUsed || 0,
          campaigns: backendUsage.campaignsUsed || 0,
          views: backendUsage.viewsUsed || 0,
          resets: backendUsage.resetsUsed || 0
        };
        
        setUsage(normalizedUsage);
        console.log(`[UsageContext] ✅ Usage loaded from backend:`, normalizedUsage);
      } else {
        console.warn(`[UsageContext] ⚠️ Backend usage not found, initializing empty stats`);
        // Initialize with empty usage stats instead of localStorage fallback
        setUsage({
          posts: 0,
          discussions: 0,
          aiReplies: 0,
          campaigns: 0,
          views: 0,
          resets: 0
        });
      }
    } catch (error) {
      console.error(`[UsageContext] ❌ Error loading usage:`, error);
      
      // Initialize with empty stats on error - no localStorage fallback
      setUsage({
        posts: 0,
        discussions: 0,
        aiReplies: 0,
        campaigns: 0,
        views: 0,
        resets: 0
      });
      console.log(`[UsageContext] 🔄 Initialized empty usage stats due to backend error`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.uid]);

  // Load usage on mount and user change
  useEffect(() => {
    if (currentUser?.uid) {
      refreshUsage();
    }
  }, [refreshUsage, currentUser?.uid]);

  // Auto-refresh usage every 60 seconds for real-time updates (increased to reduce conflicts)
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const interval = setInterval(() => {
      // Only refresh if we're not in the middle of an increment operation
      if (!isIncrementInProgress.current) {
        refreshUsage();
      }
    }, 60000); // 60 seconds - increased from 30 to reduce race conditions
    
    return () => clearInterval(interval);
  }, [currentUser?.uid, refreshUsage]);

  // Listen for usage updates from other tabs/windows
  useEffect(() => {
    const handleUsageUpdate = (event: CustomEvent) => {
      if (currentUser?.uid && event.detail.userId === currentUser.uid) {
        setUsage(event.detail.usage);
        console.log(`[UsageContext] 🔄 Cross-tab usage update:`, event.detail.usage);
      }
    };

    window.addEventListener('usageUpdated', handleUsageUpdate as EventListener);
    
    return () => {
      window.removeEventListener('usageUpdated', handleUsageUpdate as EventListener);
    };
  }, [currentUser?.uid]);

  const getUserLimits = useCallback(() => {
    // Get user type from UserService or localStorage
    const userType = localStorage.getItem(`userType_${currentUser?.uid}`) || 'freemium';
    
    switch (userType) {
      case 'premium':
        return {
          posts: 160,
          discussions: 200,
          aiReplies: -1,
          campaigns: 10,
          views: -1,
          resets: -1
        };
      case 'admin':
        return {
          posts: -1,
          discussions: -1,
          aiReplies: -1,
          campaigns: -1,
          views: -1,
          resets: -1
        };
      case 'freemium':
        return {
          posts: 20,
          discussions: 50,
          aiReplies: 50,
          campaigns: 3,
          views: -1,
          resets: 3
        };
      default: // free
        return {
          posts: 5,
          discussions: 10,
          aiReplies: 2,
          campaigns: 0,
          views: -1,
          resets: 3
        };
    }
  }, [currentUser?.uid]);

  const incrementUsage = useCallback(async (feature: keyof UsageStats, _platform?: string, count: number = 1) => {
    if (!currentUser?.uid) {
      console.warn(`[UsageContext] ⚠️ No current user available, skipping ${feature} increment`);
      return;
    }

    // Prevent concurrent increment operations
    if (isIncrementInProgress.current) {
      console.warn(`[UsageContext] ⚠️ Increment already in progress, skipping ${feature}`);
      return;
    }

    isIncrementInProgress.current = true;

    try {
      console.log(`[UsageContext] 🚀 INCREMENT STARTED: ${feature} usage by ${count} for userId: ${currentUser.uid}`);
      console.log(`[UsageContext] 📊 Current platform/username: ${currentPlatform}/${currentUsername}`);
      console.log(`[UsageContext] 📊 Current usage before increment: ${feature} = ${usage[feature]}`);
      
      let response;
      
      // ✅ UNIFIED APPROACH: Always use userId-based endpoint (platform mapping not reliable)
      console.log(`[UsageContext] 🌐 Calling userId-based usage increment API for ${currentPlatform}/${currentUsername}...`);
      response = await fetch(`/api/usage/increment/${currentUser.uid}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feature, count }),
      });
      
      if (!response.ok) {
        throw new Error(`Backend increment failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`[UsageContext] ✅ Backend increment successful for ${feature}:`, result);
      
      // Refresh to get the authoritative backend state
      console.log(`[UsageContext] 🔄 Refreshing usage from backend after increment...`);
      await refreshUsage();
      console.log(`[UsageContext] ✅ INCREMENT COMPLETED: ${feature} usage successfully updated`);
      
      // Broadcast usage update to other tabs
      window.dispatchEvent(new CustomEvent('usageUpdated', { 
        detail: { 
          userId: currentUser.uid, 
          usage: usage // Use updated usage
        } 
      }));
      
    } catch (error) {
      console.error(`[UsageContext] ❌ Error incrementing ${feature} usage:`, error);
      console.error(`[UsageContext] ❌ Error details:`, {
        feature,
        userId: currentUser.uid,
        platform: currentPlatform,
        username: currentUsername,
        count,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Re-throw the error so calling code knows it failed
      throw error;
    } finally {
      isIncrementInProgress.current = false;
    }
  }, [currentUser?.uid, usage, refreshUsage, currentPlatform, currentUsername]);


  const trackFeatureUsage = useCallback(async (feature: keyof UsageStats, platform: string, action: string, count: number = 1) => {
    if (!currentUser?.uid) {
      console.warn(`[UsageContext] ⚠️ No current user available, skipping ${feature} tracking`);
      return;
    }

    // Log detailed usage tracking
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      feature,
      platform,
      userId: currentUser.uid,
      action,
      count,
      currentUsage: usage[feature]
    };
    
    console.log(`[UsageContext] 📊 TRACKING STARTED:`, logEntry);
    
    // Log usage increment (no localStorage storage to prevent conflicts)
    console.log(`[UsageContext] 📊 Usage increment logged:`, logEntry);
    
    // Increment the usage
    try {
      console.log(`[UsageContext] 🔄 Calling incrementUsage for ${feature}...`);
      await incrementUsage(feature, platform, count);
      console.log(`[UsageContext] ✅ TRACKING COMPLETED: ${feature} -> ${action} for ${platform}`);
    } catch (error) {
      console.error(`[UsageContext] ❌ TRACKING FAILED for ${feature}:`, error);
      throw error; // Re-throw to let calling code handle the error
    }
  }, [currentUser?.uid, usage, incrementUsage]);

  const isFeatureBlocked = useCallback((feature: keyof UsageStats) => {
    const limits = getUserLimits();
    const limit = limits[feature];
    
    // -1 means unlimited
    if (limit === -1) return false;
    
    const isBlocked = usage[feature] >= limit;
    
    if (isBlocked) {
      console.log(`[UsageContext] 🚫 Feature ${feature} blocked: ${usage[feature]}/${limit}`);
    }
    
    return isBlocked;
  }, [usage, getUserLimits]);

  const getUsageForFeature = useCallback((feature: keyof UsageStats) => {
    return usage[feature];
  }, [usage]);

  const resetUsage = useCallback(() => {
    const resetUsageStats = {
      posts: 0,
      discussions: 0,
      aiReplies: 0,
      campaigns: 0,
      views: 0,
      resets: 0
    };
    
    setUsage(resetUsageStats);
    
    console.log(`[UsageContext] 🔄 Usage reset for ${currentPlatform}/${currentUsername}`);
  }, [currentPlatform, currentUsername]);

  // Reset only dashboard usage counts (keep resets count)
  const resetDashboard = useCallback(() => {
    setUsage(prev => {
      const newUsage = {
        ...prev,
        posts: 0,
        discussions: 0,
        aiReplies: 0,
        campaigns: 0,
        views: 0
      };
      if (currentUser?.uid) {
        window.dispatchEvent(new CustomEvent('usageUpdated', { 
          detail: { 
            userId: currentUser.uid, 
            usage: newUsage 
          } 
        }));
        console.log(`[UsageContext] 🔄 Dashboard reset for userId: ${currentUser.uid}`);
      }
      return newUsage;
    });
  }, [currentUser?.uid]);

  const value: UsageContextType = {
    usage,
    incrementUsage,
    resetUsage,
    getUsageForFeature,
    trackFeatureUsage,
    isFeatureBlocked,
    getUserLimits,
    refreshUsage,
    resetDashboard,
    isLoading,
    currentPlatform,
    currentUsername
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
};

export default UsageContext; 