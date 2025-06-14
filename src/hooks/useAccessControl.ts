import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import UserService from '../services/UserService';
import { User, AccessControlResult } from '../types/user';

interface AccessState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface FeatureAccess {
  allowed: boolean;
  reason?: string;
  limitReached?: boolean;
  upgradeRequired?: boolean;
  redirectToPricing?: boolean;
}

export const useAccessControl = () => {
  const { currentUser } = useAuth();
  const [accessState, setAccessState] = useState<AccessState>({
    user: null,
    loading: true,
    error: null
  });

  // Cache for access checks to avoid repeated API calls
  const [accessCache, setAccessCache] = useState<Map<string, { result: FeatureAccess; timestamp: number }>>(new Map());
  const CACHE_TTL = 30 * 1000; // 30 seconds

  // Load user data
  const loadUserData = useCallback(async () => {
    if (!currentUser?.uid) {
      setAccessState({ user: null, loading: false, error: null });
      return;
    }

    try {
      setAccessState(prev => ({ ...prev, loading: true, error: null }));
      const userData = await UserService.getUserData(currentUser.uid);
      setAccessState({ user: userData, loading: false, error: null });
    } catch (error) {
      console.error('[useAccessControl] Error loading user data:', error);
      setAccessState({ 
        user: null, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to load user data' 
      });
    }
  }, [currentUser?.uid]);

  // Check access for a specific feature
  const checkAccess = useCallback(async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'autoSchedule' | 'autoReply' | 'goalModel'): Promise<FeatureAccess> => {
    if (!currentUser?.uid) {
      return { allowed: false, reason: 'User not authenticated', upgradeRequired: true };
    }

    // Check cache first
    const cacheKey = `${currentUser.uid}_${feature}`;
    const cached = accessCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }

    try {
      const result = await UserService.checkAccessNew(currentUser.uid, feature);
      const featureAccess: FeatureAccess = {
        allowed: result.allowed,
        reason: result.reason,
        limitReached: result.limitReached,
        upgradeRequired: result.upgradeRequired,
        redirectToPricing: result.redirectToPricing
      };

      // Cache the result
      setAccessCache(prev => {
        const newCache = new Map(prev);
        newCache.set(cacheKey, {
          result: featureAccess,
          timestamp: Date.now()
        });
        return newCache;
      });

      return featureAccess;
    } catch (error) {
      console.error('[useAccessControl] Error checking access:', error);
      // Default to allowing access if there's an error
      return { allowed: true };
    }
  }, [currentUser?.uid, accessCache]);

  // Increment usage for a feature
  const incrementUsage = useCallback(async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns') => {
    if (!currentUser?.uid) return;

    try {
      await UserService.incrementUsage(currentUser.uid, feature);
      
      // Clear relevant cache entries
      setAccessCache(prev => {
        const newCache = new Map(prev);
        const keysToDelete = Array.from(newCache.keys()).filter(key => 
          key.startsWith(currentUser.uid) && key.includes(feature)
        );
        keysToDelete.forEach(key => newCache.delete(key));
        return newCache;
      });

      // Reload user data to get updated usage stats
      await loadUserData();
    } catch (error) {
      console.error('[useAccessControl] Error incrementing usage:', error);
    }
  }, [currentUser?.uid, loadUserData]);

  // Clear cache (useful after upgrades)
  const clearCache = useCallback(() => {
    setAccessCache(new Map());
    if (currentUser?.uid) {
      UserService.clearUserCache(currentUser.uid);
    }
  }, [currentUser?.uid]);

  // Refresh user data
  const refresh = useCallback(async () => {
    clearCache();
    await loadUserData();
  }, [clearCache, loadUserData]);

  // Load user data on mount and when user changes
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Helper functions for easy access to common checks
  const isAdmin = accessState.user?.userType === 'admin';
  const isPremium = accessState.user?.userType === 'premium' || isAdmin;
  const isFree = accessState.user?.userType === 'free' || !accessState.user?.userType;
  const isFreemium = accessState.user?.userType === 'freemium';
  const isTrialActive = accessState.user?.isTrialActive && accessState.user?.trialEndsAt ? 
    new Date(accessState.user.trialEndsAt) > new Date() : false;

  const subscription = accessState.user?.subscription;
  const limits = subscription?.limits;

  return {
    // State
    user: accessState.user,
    loading: accessState.loading,
    error: accessState.error,
    
    // User type helpers
    isAdmin,
    isPremium,
    isFree,
    isTrialActive,
    
    // Subscription info
    subscription,
    limits,
    
    // Methods
    checkAccess,
    incrementUsage,
    refresh,
    clearCache,
    
    // Quick access checks
    canAutoSchedule: limits?.autoSchedule ?? false,
    canAutoReply: limits?.autoReply ?? false,
    hasUnlimitedPosts: typeof limits?.posts === 'string' || limits?.posts === 999999,
    hasUnlimitedDiscussions: typeof limits?.discussions === 'string' || limits?.discussions === 999999,
    hasUnlimitedAiReplies: limits?.aiReplies === 'unlimited',
    
    // Trial info
    trialDaysRemaining: subscription?.trialDaysRemaining ?? 0,
    trialEndsAt: accessState.user?.trialEndsAt
  };
};

export default useAccessControl; 