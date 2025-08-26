import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../context/UsageContext';
import { PlatformUsageService, PlatformUsageBreakdown } from '../services/PlatformUsageService';

interface PlatformStatus {
  [key: string]: boolean;
}

export const usePlatformUsageTracking = () => {
  const { currentUser } = useAuth();
  const { usage, refreshUsage } = useUsage();
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus>({});
  const [isLoading, setIsLoading] = useState(true);

  // ✅ REAL-TIME PLATFORM STATUS FETCHING: Get platform acquisition status from backend
  const fetchPlatformStatuses = useCallback(async (): Promise<PlatformStatus> => {
    if (!currentUser?.uid) return {};

    try {
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      const statuses: PlatformStatus = {};
      
      // Check each platform individually using the same endpoints as MainDashboard
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
            
            // Check the SAME fields as MainDashboard for consistency
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
            
            statuses[platformId] = isClaimed;
          } else {
            statuses[platformId] = false;
          }
        } catch (error) {
          console.warn(`[usePlatformUsageTracking] Failed to check ${platformId} status:`, error);
          statuses[platformId] = false;
        }
      }
      
      return statuses;
    } catch (error) {
      console.error('[usePlatformUsageTracking] Failed to fetch platform statuses:', error);
      return {};
    }
  }, [currentUser?.uid]);

  // ✅ REAL-TIME PLATFORM STATUS MONITORING: Monitor platform status changes
  useEffect(() => {
    const updatePlatformStatuses = async () => {
      if (!currentUser?.uid) return;
      
      try {
        const statuses = await fetchPlatformStatuses();
        setPlatformStatuses(statuses);
        console.log('[usePlatformUsageTracking] Platform statuses updated:', statuses);
      } catch (error) {
        console.error('[usePlatformUsageTracking] Error updating platform statuses:', error);
      }
    };

    updatePlatformStatuses();
    
    // Refresh platform statuses every 10 seconds for real-time updates
    const interval = setInterval(updatePlatformStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchPlatformStatuses, currentUser?.uid]);

  // ✅ REAL-TIME USAGE DATA MONITORING: Monitor usage changes
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    // Initial usage refresh
    refreshUsage();
    
    // Refresh usage every 30 seconds for real-time updates
    const interval = setInterval(refreshUsage, 30000);
    return () => clearInterval(interval);
  }, [currentUser?.uid, refreshUsage]);

  // ✅ REALISTIC PLATFORM USAGE CALCULATION: Use PlatformUsageService for accurate calculations
  const platformUsage = useMemo((): PlatformUsageBreakdown[] => {
    if (!currentUser?.uid || Object.keys(platformStatuses).length === 0) return [];

    // Get list of acquired platforms
    const acquiredPlatforms = Object.entries(platformStatuses)
      .filter(([, acquired]) => acquired)
      .map(([id]) => id);

    // Use the service to calculate platform usage
    const usageData = PlatformUsageService.calculatePlatformUsage(usage, acquiredPlatforms);

    console.log('[usePlatformUsageTracking] Calculated platform usage:', {
      platformUsage: usageData,
      acquiredPlatforms,
      totalApiCalls: usage.posts + usage.aiReplies + usage.discussions + usage.campaigns
    });

    return usageData;
  }, [currentUser?.uid, platformStatuses, usage]);

  // ✅ LOADING STATE MANAGEMENT: Show loading while fetching data
  useEffect(() => {
    if (currentUser?.uid && Object.keys(platformStatuses).length > 0) {
      setIsLoading(false);
    }
  }, [currentUser?.uid, platformStatuses]);

  // ✅ UTILITY FUNCTIONS: Helper functions for components
  const getAcquiredPlatforms = useCallback(() => {
    return Object.entries(platformStatuses).filter(([, acquired]) => acquired).map(([id]) => id);
  }, [platformStatuses]);

  const getTotalApiCalls = useCallback(() => {
    return usage.posts + usage.aiReplies + usage.discussions + usage.campaigns;
  }, [usage]);

  const getPlatformUsageBreakdown = useCallback((platformId: string) => {
    return platformUsage.find(p => p.platform === platformId);
  }, [platformUsage]);

  const getPlatformConfig = useCallback((platformId: string) => {
    return PlatformUsageService.getPlatformConfig(platformId);
  }, []);

  const getPlatformCharacteristics = useCallback((platformId: string) => {
    return PlatformUsageService.getPlatformCharacteristics(platformId);
  }, []);

  return {
    platformUsage,
    platformStatuses,
    isLoading,
    getAcquiredPlatforms,
    getTotalApiCalls,
    getPlatformUsageBreakdown,
    getPlatformConfig,
    getPlatformCharacteristics,
    refreshUsage
  };
};
