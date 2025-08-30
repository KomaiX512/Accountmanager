import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import './PlatformUsageChart.css';

interface PlatformUsageData {
  count: number;
  percentage: number;
}

interface PlatformActivityResponse {
  userId: string;
  period: string;
  totalActivity: number;
  platforms: Record<string, PlatformUsageData>;
  lastUpdated: string;
}

interface PlatformUsageChartProps {
  className?: string;
}

const PlatformUsageChart: React.FC<PlatformUsageChartProps> = ({ className }) => {
  const { currentUser } = useAuth();
  
  // ✅ OPTIMIZED: Initialize with cached data for instant loading like other dashboard sections
  const [platformUsage, setPlatformUsage] = useState<Record<string, PlatformUsageData>>(() => {
    if (!currentUser?.uid) return {};
    try {
      const cached = localStorage.getItem(`platformUsage_${currentUser.uid}`);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  
  // ✅ OPTIMIZED: Initialize totalActivity from cache
  const [totalActivity, setTotalActivity] = useState(() => {
    if (!currentUser?.uid) return 0;
    try {
      const cached = localStorage.getItem(`platformTotalActivity_${currentUser.uid}`);
      return cached ? parseInt(cached, 10) : 0;
    } catch {
      return 0;
    }
  });
  // ✅ REMOVED: No loading state - behave like other dashboard sections

  // Map platform names to display names and colors
  const platformConfig = {
    instagram: {
      name: 'Instagram',
      color: '#E4405F',
      icon: '/icons/instagram.svg'
    },
    facebook: {
      name: 'Facebook', 
      color: '#1877F2',
      icon: '/icons/facebook.svg'
    },
    twitter: {
      name: 'Twitter',
      color: '#1DA1F2', 
      icon: '/icons/twitter.svg'
    },
    general: {
      name: 'Platform Activity',
      color: '#6366f1',
      icon: '/icons/activity.svg'
    }
  };

  const fetchPlatformUsage = async () => {
    if (!currentUser?.uid) return;

    // ✅ OPTIMIZED: Silent fetch without loading states - like other dashboard sections
    try {
      const response = await axios.get<PlatformActivityResponse>(
        `/api/user/${currentUser.uid}/platform-activity`
      );
      
      const data = response.data;
      
      // ✅ IMPROVED: Handle platform activity data more intelligently
      let processedPlatforms = { ...data.platforms };
      
      // If we only have 'account' data but no specific platform data, 
      // it means the user's activity is stored under the main userId
      // In this case, we should still show it as general platform activity
      const specificPlatforms = Object.keys(processedPlatforms).filter(p => p !== 'account');
      
      if (specificPlatforms.length === 0 && processedPlatforms.account) {
        // Only account data exists - this represents real user activity
        // Keep the account data but rename it to show as general activity
        processedPlatforms.general = processedPlatforms.account;
        delete processedPlatforms.account;
      } else if (specificPlatforms.length > 0 && processedPlatforms.account) {
        // We have both specific platform data and account data
        // Remove account to avoid duplication since specific platforms are more accurate
        delete processedPlatforms.account;
      }
      
      // Recalculate total activity and percentages
      const filteredTotal = Object.values(processedPlatforms).reduce((sum: number, platform: any) => sum + platform.count, 0);
      
      // Recalculate percentages based on filtered total
      const recalculatedPlatforms: Record<string, PlatformUsageData> = {};
      for (const [platform, data] of Object.entries(processedPlatforms)) {
        const platformData = data as PlatformUsageData;
        recalculatedPlatforms[platform] = {
          count: platformData.count,
          percentage: filteredTotal > 0 ? Math.round((platformData.count / filteredTotal) * 100) : 0
        };
      }
      
      setPlatformUsage(recalculatedPlatforms);
      setTotalActivity(filteredTotal);
      
      // ✅ OPTIMIZED: Cache data locally for instant loading like other dashboard sections
      if (currentUser?.uid) {
        try {
          localStorage.setItem(`platformUsage_${currentUser.uid}`, JSON.stringify(recalculatedPlatforms));
          localStorage.setItem(`platformTotalActivity_${currentUser.uid}`, String(filteredTotal));
        } catch (error) {
          console.warn('[PlatformUsageChart] Failed to cache platform usage data:', error);
        }
      }
      
      console.log('[PlatformUsageChart] ✅ Platform usage data updated (silent):', { platforms: recalculatedPlatforms, totalActivity: filteredTotal });
    } catch (error) {
      console.error('[PlatformUsageChart] ❌ Error fetching platform usage:', error);
      // ✅ IMPROVED: Keep existing data on error instead of clearing
      // Only clear if this is the first load and we have no data
      if (Object.keys(platformUsage).length === 0) {
        setPlatformUsage({});
        setTotalActivity(0);
      }
    }
  };

  useEffect(() => {
    // ✅ OPTIMIZED: Initialize from cache immediately, then fetch fresh data silently
    if (currentUser?.uid) {
      // Load from cache first for instant display
      try {
        const cachedUsage = localStorage.getItem(`platformUsage_${currentUser.uid}`);
        const cachedTotal = localStorage.getItem(`platformTotalActivity_${currentUser.uid}`);
        
        if (cachedUsage && cachedTotal) {
          const parsedUsage = JSON.parse(cachedUsage);
          const parsedTotal = parseInt(cachedTotal, 10);
          
          // Only update if cache has meaningful data
          if (Object.keys(parsedUsage).length > 0 || parsedTotal > 0) {
            setPlatformUsage(parsedUsage);
            setTotalActivity(parsedTotal);
            console.log('[PlatformUsageChart] 🚀 Loaded from cache instantly:', { cachedUsage: parsedUsage, cachedTotal: parsedTotal });
          }
        }
      } catch (error) {
        console.warn('[PlatformUsageChart] Failed to load from cache:', error);
      }
      
      // Then fetch fresh data silently in background
      fetchPlatformUsage();
    }
  }, [currentUser?.uid]);

  // ✅ OPTIMIZED: Aligned with other dashboard sections - refresh every 60 seconds (same as UsageContext)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const interval = setInterval(() => {
      fetchPlatformUsage();
    }, 60000); // 60 seconds to match UsageContext refresh rate

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  const getMaxUsage = () => {
    const counts = Object.values(platformUsage).map(p => p.count);
    return Math.max(...counts, 1);
  };

  const getSortedPlatforms = () => {
    return Object.entries(platformUsage)
      .sort(([, a], [, b]) => b.count - a.count) // Sort by usage count descending
      .filter(([, data]) => data.count >= 0); // Show all platforms (including 0 if needed)
  };

  const sortedPlatforms = getSortedPlatforms();

  // ✅ IMPROVED: Show content immediately - no loading states like other dashboard sections
  if (totalActivity === 0 && sortedPlatforms.length === 0) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage</h3>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No activity data yet</p>
          <span className="empty-hint">Start using the platforms to see usage statistics</span>
        </div>
      </div>
    );
  }

  const maxUsage = getMaxUsage();

  return (
    <div className={`platform-usage-chart ${className || ''}`}>
      <div className="chart-header">
        <h3>Platform Usage</h3>
      </div>

      <div className="chart-content">
        <div className="chart-bars">
          {sortedPlatforms.map(([platform, data]) => {
            const config = platformConfig[platform as keyof typeof platformConfig] || {
              name: platform.charAt(0).toUpperCase() + platform.slice(1),
              color: '#6c757d',
              icon: '/icons/default.svg'
            };

            const heightPercentage = Math.max((data.count / maxUsage) * 100, 5);

            return (
              <div key={platform} className="chart-bar-container">
                <div className="chart-bar-wrapper">
                  <div 
                    className={`chart-bar ${platform}`}
                    style={{ 
                      height: `${heightPercentage}%`,
                      backgroundColor: config.color,
                      boxShadow: `0 0 20px ${config.color}40`
                    }}
                    title={`${config.name}: ${data.count} actions (${data.percentage}%)`}
                  >
                    <div className="bar-value">
                      <span className="usage-count">{data.count}</span>
                      <span className="usage-percentage">{data.percentage}%</span>
                    </div>
                    <div className="bar-glow" style={{ backgroundColor: config.color }}></div>
                  </div>
                </div>
                <div className="chart-label">
                  <img 
                    src={config.icon} 
                    alt={`${config.name} icon`}
                    className="platform-icon"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null;
                      target.src = '/icons/default.svg';
                    }}
                  />
                  <span className="platform-name">{config.name}</span>
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
