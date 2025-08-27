import React from 'react';
import { usePlatformUsageTracking } from '../../hooks/usePlatformUsageTracking';
import './PlatformUsageChart.css';

interface PlatformUsageChartProps {
  className?: string;
}

const PlatformUsageChart: React.FC<PlatformUsageChartProps> = ({ className }) => {
  const {
    platformUsage,
    platformStatuses,
    isLoading,
    getAcquiredPlatforms,
    getTotalApiCalls
  } = usePlatformUsageTracking();

  // ✅ EMPTY STATE: Show meaningful message when no platforms are acquired
  if (!isLoading && Object.keys(platformStatuses).length === 0) {
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

  // ✅ NO ACQUIRED PLATFORMS: Show guidance message
  const acquiredPlatforms = getAcquiredPlatforms();
  if (!isLoading && acquiredPlatforms.length === 0) {
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

  // ✅ NO USAGE DATA: Show guidance when platforms are acquired but no usage
  if (!isLoading && platformUsage.length === 0) {
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

  if (isLoading) {
    return (
      <div className={`platform-usage-chart ${className || ''}`}>
        <div className="chart-header">
          <h3>Platform Usage Activity</h3>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading platform usage...</p>
        </div>
      </div>
    );
  }

  // ✅ HORIZONTAL CHART RENDERING: Right-to-left horizontal bars
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
