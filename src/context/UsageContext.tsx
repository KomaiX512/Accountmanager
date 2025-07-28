import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import UserService from '../services/UserService';

interface UsageStats {
  posts: number;
  discussions: number;
  aiReplies: number;
  campaigns: number;
  resets: number;
}

interface UsageContextType {
  usage: UsageStats;
  incrementUsage: (feature: keyof UsageStats, platform?: string) => Promise<void>;
  resetUsage: () => void;
  resetDashboard: () => void;
  getUsageForFeature: (feature: keyof UsageStats) => number;
  trackFeatureUsage: (feature: keyof UsageStats, platform: string, action: string) => Promise<void>;
  isFeatureBlocked: (feature: keyof UsageStats) => boolean;
  getUserLimits: () => { posts: number; discussions: number; aiReplies: number; campaigns: number; resets: number };
  refreshUsage: () => Promise<void>;
  isLoading: boolean;
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
    resets: 0
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load usage from backend on mount and user change
  const refreshUsage = useCallback(async () => {
    if (!currentUser?.uid) return;
    
    setIsLoading(true);
    try {
      console.log(`[UsageContext] 🔄 Refreshing usage for user ${currentUser.uid}`);
      
      // Get usage from backend
      const response = await fetch(`/api/user/${currentUser.uid}/usage`);
      
      if (response.ok) {
        const backendUsage = await response.json();
        const normalizedUsage = {
          posts: backendUsage.postsUsed || 0,
          discussions: backendUsage.discussionsUsed || 0,
          aiReplies: backendUsage.aiRepliesUsed || 0,
          campaigns: backendUsage.campaignsUsed || 0,
          resets: backendUsage.resetsUsed || 0
        };
        
        setUsage(normalizedUsage);
        console.log(`[UsageContext] ✅ Usage loaded from backend:`, normalizedUsage);
        
        // Also update localStorage for offline access
        localStorage.setItem(`usage_${currentUser.uid}`, JSON.stringify(normalizedUsage));
      } else {
        console.warn(`[UsageContext] ⚠️ Backend usage not found, using localStorage fallback`);
        
        // Fallback to localStorage
        const savedUsage = localStorage.getItem(`usage_${currentUser.uid}`);
        if (savedUsage) {
          const parsedUsage = JSON.parse(savedUsage);
          setUsage(parsedUsage);
          console.log(`[UsageContext] 📱 Usage loaded from localStorage:`, parsedUsage);
        }
      }
    } catch (error) {
      console.error(`[UsageContext] ❌ Error loading usage:`, error);
      
      // Fallback to localStorage on error
      const savedUsage = localStorage.getItem(`usage_${currentUser.uid}`);
      if (savedUsage) {
        try {
          const parsedUsage = JSON.parse(savedUsage);
          setUsage(parsedUsage);
          console.log(`[UsageContext] 📱 Fallback to localStorage:`, parsedUsage);
        } catch (parseError) {
          console.error(`[UsageContext] ❌ Error parsing localStorage usage:`, parseError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.uid]);

  // Load usage on mount and user change
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Auto-refresh usage every 30 seconds for real-time updates
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const interval = setInterval(() => {
      refreshUsage();
    }, 30000); // 30 seconds
    
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

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `usage_${currentUser?.uid}` && event.newValue) {
        try {
          const newUsage = JSON.parse(event.newValue);
          setUsage(newUsage);
          console.log(`[UsageContext] 🔄 Storage change usage update:`, newUsage);
        } catch (error) {
          console.error(`[UsageContext] ❌ Error parsing storage change:`, error);
        }
      }
    };

    window.addEventListener('usageUpdated', handleUsageUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('usageUpdated', handleUsageUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
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
          resets: -1
        };
      case 'admin':
        return {
          posts: -1,
          discussions: -1,
          aiReplies: -1,
          campaigns: -1,
          resets: -1
        };
      case 'freemium':
        return {
          posts: 20,
          discussions: 50,
          aiReplies: 50,
          campaigns: 3,
          resets: 3
        };
      default: // free
        return {
          posts: 5,
          discussions: 10,
          aiReplies: 2,
          campaigns: 0,
          resets: 3
        };
    }
  }, [currentUser?.uid]);

  const incrementUsage = useCallback(async (feature: keyof UsageStats, platform?: string) => {
    if (!currentUser?.uid) {
      console.warn(`[UsageContext] ⚠️ No current user, skipping ${feature} increment`);
      return;
    }

    try {
      console.log(`[UsageContext] 🚀 INCREMENT STARTED: ${feature} usage for ${platform || 'unknown'} platform`);
      console.log(`[UsageContext] 📊 Current usage before increment: ${feature} = ${usage[feature]}`);
      
      // Optimistically update local state first for immediate UI feedback
      const previousUsage = usage[feature];
      setUsage(prev => {
        const newUsage = {
          ...prev,
          [feature]: prev[feature] + 1
        };
        
        // Update localStorage immediately
        localStorage.setItem(`usage_${currentUser.uid}`, JSON.stringify(newUsage));
        
        // Broadcast to other tabs
        window.dispatchEvent(new CustomEvent('usageUpdated', { 
          detail: { userId: currentUser.uid, usage: newUsage } 
        }));
        
        console.log(`[UsageContext] ⚡ Optimistic update: ${feature} ${previousUsage} -> ${newUsage[feature]}`);
        return newUsage;
      });

      // Call backend to persist the change
      console.log(`[UsageContext] 🌐 Calling backend UserService.incrementUsage...`);
      await UserService.incrementUsage(currentUser.uid, feature);
      console.log(`[UsageContext] ✅ Backend increment successful for ${feature}`);
      
      // Refresh from backend to ensure consistency
      setTimeout(() => {
        console.log(`[UsageContext] 🔄 Refreshing usage from backend for consistency...`);
        refreshUsage();
      }, 1000);
      
    } catch (error) {
      console.error(`[UsageContext] ❌ Error incrementing ${feature} usage:`, error);
      console.error(`[UsageContext] ❌ Error details:`, {
        feature,
        platform,
        userId: currentUser.uid,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Revert optimistic update on error
      setUsage(prev => {
        const revertedUsage = {
          ...prev,
          [feature]: Math.max(0, prev[feature] - 1)
        };
        
        localStorage.setItem(`usage_${currentUser.uid}`, JSON.stringify(revertedUsage));
        console.log(`[UsageContext] ↩️ Reverted optimistic update for ${feature}`);
        return revertedUsage;
      });
      
      // Re-throw the error so calling code knows it failed
      throw error;
    }
  }, [currentUser?.uid, usage, refreshUsage]);

  const trackFeatureUsage = useCallback(async (feature: keyof UsageStats, platform: string, action: string) => {
    if (!currentUser?.uid) {
      console.warn(`[UsageContext] ⚠️ No current user, skipping ${feature} tracking`);
      return;
    }

    // Log detailed usage tracking
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      feature,
      platform,
      action,
      userId: currentUser.uid,
      currentUsage: usage[feature]
    };
    
    console.log(`[UsageContext] 📊 TRACKING STARTED:`, logEntry);
    
    // Store in usage history for analytics
    try {
      const historyKey = `usage_history_${currentUser.uid}`;
      const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
      existingHistory.push(logEntry);
      
      // Keep only last 100 entries
      if (existingHistory.length > 100) {
        existingHistory.splice(0, existingHistory.length - 100);
      }
      
      localStorage.setItem(historyKey, JSON.stringify(existingHistory));
      console.log(`[UsageContext] 💾 Usage history stored successfully`);
    } catch (error) {
      console.warn(`[UsageContext] ⚠️ Error storing usage history:`, error);
    }
    
    // Increment the usage
    try {
      console.log(`[UsageContext] 🔄 Calling incrementUsage for ${feature}...`);
      await incrementUsage(feature, platform);
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
    const resetUsage = {
      posts: 0,
      discussions: 0,
      aiReplies: 0,
      campaigns: 0,
      resets: 0
    };
    
    setUsage(resetUsage);
    
    if (currentUser?.uid) {
      localStorage.setItem(`usage_${currentUser.uid}`, JSON.stringify(resetUsage));
      console.log(`[UsageContext] 🔄 Usage reset for user ${currentUser.uid}`);
    }
  }, [currentUser?.uid]);

  // Reset only dashboard usage counts (keep resets count)
  const resetDashboard = useCallback(() => {
    setUsage(prev => {
      const newUsage = {
        ...prev,
        posts: 0,
        discussions: 0,
        aiReplies: 0,
        campaigns: 0
      };
      if (currentUser?.uid) {
        localStorage.setItem(`usage_${currentUser.uid}`, JSON.stringify(newUsage));
        window.dispatchEvent(new CustomEvent('usageUpdated', { detail: { userId: currentUser.uid, usage: newUsage } }));
        console.log(`[UsageContext] 🔄 Dashboard reset for user ${currentUser.uid}`);
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
    isLoading
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
};

export default UsageContext; 