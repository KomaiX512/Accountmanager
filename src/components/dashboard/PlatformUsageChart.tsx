import React from 'react';
import { useUsage } from '../../context/UsageContext';
import { useAuth } from '../../context/AuthContext';
import { PlatformUsageService, PlatformUsageBreakdown } from '../../services/PlatformUsageService';
import './PlatformUsageChart.css';

interface PlatformUsageChartProps {
  className?: string;
}

// ✅ CACHE PLATFORM STATUSES: Avoid repeated API calls like main dashboard
const platformStatusCache = new Map<string, {[key: string]: boolean}>();

const PlatformUsageChart: React.FC<PlatformUsageChartProps> = ({ className }) => {
  const { currentUser } = useAuth();
  const { usage } = useUsage();
  
  // ✅ INSTANT RENDERING: Use same data source as main Usage Dashboard
  // ✅ CACHED PLATFORM STATUSES: Avoid repeated API calls
  const [platformStatuses, setPlatformStatuses] = React.useState<{[key: string]: boolean}>({});
  const [platformUsage, setPlatformUsage] = React.useState<PlatformUsageBreakdown[]>([]);
  const [hasCheckedStatuses, setHasCheckedStatuses] = React.useState(false);

  // ✅ CACHED PLATFORM STATUS: Get from cache first, then backend if needed (like main dashboard)
  React.useEffect(() => {
    if (!currentUser?.uid) return;

    const getPlatformStatuses = async () => {
      // ✅ CHECK CACHE FIRST: Use cached statuses if available (instant)
      const cacheKey = currentUser.uid;
      if (platformStatusCache.has(cacheKey)) {
        const cachedStatuses = platformStatusCache.get(cacheKey)!;
        console.log('[PlatformUsageChart] Using cached platform statuses:', cachedStatuses);
        setPlatformStatuses(cachedStatuses);
        setHasCheckedStatuses(true);
        return;
      }

      console.log('[PlatformUsageChart] Cache miss, checking backend for platform statuses...');
      
      const statuses: {[key: string]: boolean} = {};
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      
      // Check each platform individually using the SAME endpoints as MainDashboard
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
            console.log(`[PlatformUsageChart] ${platformId} status:`, isClaimed, 'from endpoint:', endpoint);
          } else {
            statuses[platformId] = false;
            console.log(`[PlatformUsageChart] ${platformId} endpoint failed:`, resp.status);
          }
        } catch (error) {
          console.warn(`[PlatformUsageChart] Failed to check ${platformId} status:`, error);
          statuses[platformId] = false;
        }
      }

      console.log('[PlatformUsageChart] Final platform statuses from backend:', statuses);
      
      // ✅ CACHE THE RESULTS: Store for future use (like main dashboard)
      platformStatusCache.set(cacheKey, statuses);
      
      setPlatformStatuses(statuses);
      setHasCheckedStatuses(true);
    };

    getPlatformStatuses();

    // ✅ CLEAR CACHE ON USER CHANGE: Ensure data consistency
    return () => {
      if (currentUser?.uid) {
        platformStatusCache.delete(currentUser.uid);
      }
    };
  }, [currentUser?.uid]);

  // ✅ INSTANT USAGE CALCULATION: Calculate platform usage when data changes (instant)
  React.useEffect(() => {
    if (!currentUser?.uid || !hasCheckedStatuses || Object.keys(platformStatuses).length === 0) {
      setPlatformUsage([]);
      return;
    }

    const calculatePlatformUsage = () => {
      // Get list of acquired platforms
      const acquiredPlatforms = Object.entries(platformStatuses)
        .filter(([, acquired]) => acquired)
        .map(([id]) => id);

      if (acquiredPlatforms.length === 0) {
        setPlatformUsage([]);
        return;
      }

      try {
        // Use the service to calculate platform usage with real backend data (synchronous)
        const usageData = PlatformUsageService.calculatePlatformUsage(usage, acquiredPlatforms);
        setPlatformUsage(usageData);
      } catch (error) {
        console.error('[PlatformUsageChart] Error calculating platform usage:', error);
        setPlatformUsage([]);
      }
    };

    calculatePlatformUsage();
  }, [currentUser?.uid, platformStatuses, usage, hasCheckedStatuses]);

  // ✅ UTILITY FUNCTIONS: Helper functions (instant)
  const getAcquiredPlatforms = React.useCallback(() => {
    return Object.entries(platformStatuses).filter(([, acquired]) => acquired).map(([id]) => id);
  }, [platformStatuses]);

  // ✅ INITIAL STATE: Show checking message only briefly while getting platform statuses
  if (!hasCheckedStatuses) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage Activity</h3>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>Checking platform status...</p>
        </div>
      </div>
    );
  }

  // ✅ NO ACQUIRED PLATFORMS: Show guidance message (instant)
  const acquiredPlatforms = getAcquiredPlatforms();
  if (acquiredPlatforms.length === 0) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage Activity</h3>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🚀</div>
          <p>No platforms acquired yet</p>
          <p className="empty-subtitle">Acquire platforms to see your usage activity</p>
        </div>
      </div>
    );
  }

  // ✅ NO USAGE DATA: Show guidance when platforms are acquired but no usage (instant)
  if (platformUsage.length === 0) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage Activity</h3>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No usage activity yet</p>
          <p className="empty-subtitle">Start using your acquired platforms to see activity data</p>
        </div>
      </div>
    );
  }

  // ✅ HORIZONTAL CHART RENDERING: Right-to-left horizontal bars (instant)
  const maxUsage = Math.max(...platformUsage.map(p => p.count), 1);

  return (
    <div className={`platform-usage-chart ${className || ''}`}>
      <div className="chart-header">
        <h3>Platform Usage Activity</h3>
        <div className="chart-subtitle">
          API calls distribution across acquired platforms
        </div>
      </div>

      <div className="chart-content">
        <div className="horizontal-chart-bars">
          {platformUsage.map((platformData) => {
            const widthPercentage = Math.max((platformData.count / maxUsage) * 100, 8);

            return (
              <div key={platformData.platform} className="horizontal-bar-container">
                <div className="platform-label">
                  <img 
                    src={platformData.icon} 
                    alt={`${platformData.displayName} icon`}
                    className="platform-icon"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null;
                      target.src = '/icons/default.svg';
                    }}
                  />
                  <span className="platform-name">{platformData.displayName}</span>
                </div>
                <div className="horizontal-bar-track">
                  <div 
                    className={`horizontal-bar ${platformData.platform}`}
                    style={{ 
                      width: `${widthPercentage}%`,
                      backgroundColor: platformData.color,
                      boxShadow: `0 0 15px ${platformData.color}30`
                    }}
                    title={`${platformData.displayName}: ${platformData.count} API calls (${platformData.percentage}%)`}
                  >
                    <div className="bar-value">
                      <span className="usage-count">{platformData.count}</span>
                      <span className="usage-percentage">{platformData.percentage}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlatformUsageChart;
