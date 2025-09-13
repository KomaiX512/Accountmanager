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
  const [platformUsage, setPlatformUsage] = useState<Record<string, PlatformUsageData>>({});
  const [totalActivity, setTotalActivity] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
      color: '#000000ff', 
      icon: '/icons/twitter.svg'
    },
    // Fallback aggregate when platform-specific mapping is unavailable
    account: {
      name: 'Total',
      color: '#6c757d',
      icon: '/icons/default.svg'
    }
  };

  const fetchPlatformUsage = async () => {
    if (!currentUser?.uid) return;

    try {
      setIsLoading(true);
      const response = await axios.get<PlatformActivityResponse>(
        `/api/user/${currentUser.uid}/platform-activity`
      );
      
      const data = response.data;
      // Determine if we have any non-account platform entries
      const rawPlatforms = data.platforms || {};
      const hasNonAccount = Object.keys(rawPlatforms).some(k => k !== 'account' && (rawPlatforms as any)[k]?.count > 0);

      // Build working set: if we have platform-specific data, drop 'account'.
      // Otherwise, keep 'account' to show the total instead of empty state.
      let workingPlatforms: Record<string, PlatformUsageData> = {};
      if (hasNonAccount) {
        const cloned: Record<string, PlatformUsageData> = { ...(rawPlatforms as any) };
        if ((cloned as any).account) {
          delete (cloned as any).account;
        }
        workingPlatforms = cloned;
      } else if ((rawPlatforms as any).account) {
        // Preserve aggregate as 'account' and set 100%
        workingPlatforms = {
          account: {
            count: (rawPlatforms as any).account.count || 0,
            percentage: (rawPlatforms as any).account.count > 0 ? 100 : 0
          }
        };
      }

      // Recalculate totals and percentages for non-account platforms
      const filteredTotal = Object.values(workingPlatforms).reduce((sum: number, p: PlatformUsageData) => sum + (p?.count || 0), 0);
      const recalculatedPlatforms: Record<string, PlatformUsageData> = {};

      for (const [platform, pdata] of Object.entries(workingPlatforms)) {
        const count = (pdata as PlatformUsageData).count || 0;
        const isAccount = platform === 'account';
        recalculatedPlatforms[platform] = {
          count,
          percentage: isAccount
            ? (count > 0 ? 100 : 0)
            : (filteredTotal > 0 ? Math.round((count / filteredTotal) * 100) : 0)
        };
      }

      setPlatformUsage(recalculatedPlatforms);
      setTotalActivity(filteredTotal);
      console.log('[PlatformUsageChart] Fetched platform usage data:', { platforms: recalculatedPlatforms, totalActivity: filteredTotal });
    } catch (error) {
      console.error('[PlatformUsageChart] Error fetching platform usage:', error);
      // Set empty data on error
      setPlatformUsage({});
      setTotalActivity(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlatformUsage();
  }, [currentUser?.uid]);

  // Refresh data every 30 seconds
  useEffect(() => {
    if (!currentUser?.uid) return;

    const interval = setInterval(() => {
      fetchPlatformUsage();
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  const getMaxUsage = () => {
    const counts = Object.values(platformUsage).map(p => p.count);
    return Math.max(...counts, 1);
  };

  const getSortedPlatforms = () => {
    return Object.entries(platformUsage)
      .sort(([, a], [, b]) => b.count - a.count) // Sort by usage count descending
      .filter(([, data]) => data.count > 0); // Only show platforms with usage
  };

  if (isLoading) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage</h3>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  const sortedPlatforms = getSortedPlatforms();

  if (totalActivity === 0 || sortedPlatforms.length === 0) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage</h3>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No usage data yet</p>
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
