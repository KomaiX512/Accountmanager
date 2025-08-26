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

  // ✅ DYNAMIC CHART RENDERING: Render chart based on real data
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
        <div className="chart-bars">
          {platformUsage.map((platformData) => {
            const heightPercentage = Math.max((platformData.count / maxUsage) * 100, 8);

            return (
              <div key={platformData.platform} className="chart-bar-container">
                <div className="chart-bar-wrapper">
                  <div 
                    className={`chart-bar ${platformData.platform}`}
                    style={{ 
                      height: `${heightPercentage}%`,
                      backgroundColor: platformData.color,
                      boxShadow: `0 0 20px ${platformData.color}40`
                    }}
                    title={`${platformData.displayName}: ${platformData.count} API calls (${platformData.percentage}%)`}
                  >
                    <div className="bar-value">
                      <span className="usage-count">{platformData.count}</span>
                      <span className="usage-percentage">{platformData.percentage}%</span>
                    </div>
                  </div>
                </div>
                <div className="chart-label">
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
              </div>
            );
          })}
        </div>

        {/* ✅ ENHANCED LEGEND: Show total API calls and platform count */}
        <div className="chart-legend">
          <div className="legend-stats">
            <div className="stat-item">
              <span className="stat-label">Total API Calls:</span>
              <span className="stat-value">{getTotalApiCalls()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Active Platforms:</span>
              <span className="stat-value">{platformUsage.length}</span>
            </div>
          </div>
          <div className="legend-note">
            <p>💡 Usage is distributed across acquired platforms based on feature activity</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformUsageChart;
