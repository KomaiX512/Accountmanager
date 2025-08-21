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
      color: '#1DA1F2', 
      icon: '/icons/twitter.svg'
    },
    account: {
      name: 'Twitter',
      color: '#1DA1F2',
      icon: '/icons/twitter.svg'
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
      setPlatformUsage(data.platforms || {});
      setTotalActivity(data.totalActivity || 0);
      
      console.log('[PlatformUsageChart] Fetched platform usage data:', data);
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
