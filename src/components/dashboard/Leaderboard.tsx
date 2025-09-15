import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './Leaderboard.css';

// Business metrics interface
interface PlatformMetrics {
  id: string;
  name: string;
  icon: string;
  followers: number;
  engagement: number;
  revenue: number;
  audienceHappiness: number;
  postsCount: number;
  reachRate: number;
  conversionRate: number;
  overallScore: number;
  trend: 'up' | 'down' | 'stable';
  connected: boolean;
  claimed: boolean;
}

interface LeaderboardProps {
  acquiredPlatforms: string[];
  platformConnectionStatus: Record<string, boolean>;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ acquiredPlatforms, platformConnectionStatus }) => {
  const [sortBy, setSortBy] = useState<'overallScore' | 'engagement' | 'revenue' | 'followers' | 'audienceHappiness'>('overallScore');
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d'>('30d');

  // Demo platform data with business metrics
  const getAllPlatformMetrics = (): PlatformMetrics[] => [
    {
      id: 'instagram',
      name: 'Instagram',
      icon: '/icons/instagram.svg',
      followers: 45200,
      engagement: 8.7,
      revenue: 12450,
      audienceHappiness: 92,
      postsCount: 124,
      reachRate: 34.2,
      conversionRate: 4.8,
      overallScore: 87,
      trend: 'up',
      connected: platformConnectionStatus.instagram || false,
      claimed: acquiredPlatforms.includes('instagram')
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: '/icons/twitter.svg',
      followers: 23800,
      engagement: 6.4,
      revenue: 8920,
      audienceHappiness: 78,
      postsCount: 89,
      reachRate: 28.1,
      conversionRate: 3.2,
      overallScore: 74,
      trend: 'stable',
      connected: platformConnectionStatus.twitter || false,
      claimed: acquiredPlatforms.includes('twitter')
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: '/icons/facebook.svg',
      followers: 67500,
      engagement: 5.2,
      revenue: 15680,
      audienceHappiness: 85,
      postsCount: 156,
      reachRate: 22.7,
      conversionRate: 5.1,
      overallScore: 79,
      trend: 'up',
      connected: platformConnectionStatus.facebook || false,
      claimed: acquiredPlatforms.includes('facebook')
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: '/icons/linkedin.svg',
      followers: 18900,
      engagement: 12.3,
      revenue: 22100,
      audienceHappiness: 94,
      postsCount: 67,
      reachRate: 41.5,
      conversionRate: 7.2,
      overallScore: 91,
      trend: 'up',
      connected: platformConnectionStatus.linkedin || false,
      claimed: acquiredPlatforms.includes('linkedin')
    }
  ];

  // Filter to only show acquired platforms
  const getAcquiredPlatformMetrics = (): PlatformMetrics[] => {
    const allMetrics = getAllPlatformMetrics();
    return allMetrics.filter(platform => platform.claimed);
  };

  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics[]>([]);

  useEffect(() => {
    const metrics = getAcquiredPlatformMetrics();
    const sorted = [...metrics].sort((a, b) => b[sortBy] - a[sortBy]);
    setPlatformMetrics(sorted);
  }, [sortBy, acquiredPlatforms, platformConnectionStatus]);

  // Get medal/position colors
  const getPositionColor = (index: number): string => {
    switch (index) {
      case 0: return '#FFD700'; // Gold
      case 1: return '#C0C0C0'; // Silver
      case 2: return '#CD7F32'; // Bronze
      default: return '#64748B'; // Slate
    }
  };

  // Get trend icon
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <svg className="trend-icon up" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5H7z"/></svg>;
      case 'down':
        return <svg className="trend-icon down" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>;
      case 'stable':
        return <svg className="trend-icon stable" viewBox="0 0 24 24"><path d="M8 12h8v2H8z"/></svg>;
    }
  };

  // Format numbers for display
  const formatNumber = (num: number, type: 'currency' | 'percentage' | 'count' = 'count'): string => {
    if (type === 'currency') {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    if (type === 'percentage') {
      return `${num}%`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // Get score color
  const getScoreColor = (score: number): string => {
    if (score >= 85) return '#10B981'; // Green
    if (score >= 70) return '#F59E0B'; // Yellow
    return '#EF4444'; // Red
  };

  if (platformMetrics.length === 0) {
    return (
      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <div className="header-content">
            <div className="header-title">
              <h2>🏆 Platform Leaderboard</h2>
              <p>Performance competition among your acquired platforms</p>
            </div>
          </div>
        </div>
        
        <div className="empty-leaderboard">
          <div className="empty-leaderboard-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11.03L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11.03C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
            </svg>
          </div>
          <h3>No Platforms Acquired Yet</h3>
          <p>Acquire your first platform to see performance metrics and competition rankings.</p>
          <div className="acquisition-hint">
            <span>💡 Tip: Start by connecting Instagram or Twitter for immediate insights!</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <div className="header-content">
          <div className="header-title">
            <h2>🏆 Platform Leaderboard</h2>
            <p>Performance competition among your {platformMetrics.length} acquired platforms</p>
          </div>
          
          <div className="header-controls">
            <div className="time-filter">
              <button 
                className={timeFilter === '7d' ? 'active' : ''}
                onClick={() => setTimeFilter('7d')}
              >
                7D
              </button>
              <button 
                className={timeFilter === '30d' ? 'active' : ''}
                onClick={() => setTimeFilter('30d')}
              >
                30D
              </button>
              <button 
                className={timeFilter === '90d' ? 'active' : ''}
                onClick={() => setTimeFilter('90d')}
              >
                90D
              </button>
            </div>
            
            <div className="sort-dropdown">
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="overallScore">Overall Score</option>
                <option value="engagement">Engagement Rate</option>
                <option value="revenue">Revenue</option>
                <option value="followers">Followers</option>
                <option value="audienceHappiness">Audience Happiness</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="leaderboard-content">
        <div className="metrics-overview">
          <div className="metric-card">
            <div className="metric-icon">💰</div>
            <div className="metric-info">
              <div className="metric-value">
                ${platformMetrics.reduce((sum, p) => sum + p.revenue, 0).toLocaleString()}
              </div>
              <div className="metric-label">Total Revenue</div>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">👥</div>
            <div className="metric-info">
              <div className="metric-value">
                {formatNumber(platformMetrics.reduce((sum, p) => sum + p.followers, 0))}
              </div>
              <div className="metric-label">Total Reach</div>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">📈</div>
            <div className="metric-info">
              <div className="metric-value">
                {(platformMetrics.reduce((sum, p) => sum + p.engagement, 0) / platformMetrics.length).toFixed(1)}%
              </div>
              <div className="metric-label">Avg Engagement</div>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">😊</div>
            <div className="metric-info">
              <div className="metric-value">
                {Math.round(platformMetrics.reduce((sum, p) => sum + p.audienceHappiness, 0) / platformMetrics.length)}%
              </div>
              <div className="metric-label">Audience Happiness</div>
            </div>
          </div>
        </div>

        <div className="leaderboard-list">
          {platformMetrics.map((platform, index) => (
            <motion.div
              key={platform.id}
              className="leaderboard-item"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="platform-rank">
                <div 
                  className="rank-number"
                  style={{ backgroundColor: getPositionColor(index) }}
                >
                  {index + 1}
                </div>
                {index < 3 && (
                  <div className="medal">
                    {index === 0 && '🥇'}
                    {index === 1 && '🥈'}
                    {index === 2 && '🥉'}
                  </div>
                )}
              </div>

              <div className="platform-info">
                <div className="platform-header">
                  <img 
                    src={platform.icon} 
                    alt={platform.name}
                    className="platform-icon"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/icons/default.svg';
                    }}
                  />
                  <div className="platform-name-score">
                    <div className="platform-name">{platform.name}</div>
                    <div className="connection-status">
                      {platform.connected ? (
                        <span className="connected">✓ Connected</span>
                      ) : (
                        <span className="disconnected">⚠ Not Connected</span>
                      )}
                    </div>
                  </div>
                  <div className="overall-score">
                    <div 
                      className="score-circle"
                      style={{ borderColor: getScoreColor(platform.overallScore) }}
                    >
                      <span style={{ color: getScoreColor(platform.overallScore) }}>
                        {platform.overallScore}
                      </span>
                    </div>
                    <div className="trend">
                      {getTrendIcon(platform.trend)}
                    </div>
                  </div>
                </div>

                <div className="platform-metrics">
                  <div className="metric">
                    <div className="metric-label">Followers</div>
                    <div className="metric-value">{formatNumber(platform.followers)}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Engagement</div>
                    <div className="metric-value">{platform.engagement}%</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Revenue</div>
                    <div className="metric-value">{formatNumber(platform.revenue, 'currency')}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Happiness</div>
                    <div className="metric-value">{platform.audienceHappiness}%</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Posts</div>
                    <div className="metric-value">{platform.postsCount}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Reach Rate</div>
                    <div className="metric-value">{platform.reachRate}%</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="leaderboard-insights">
          <div className="insights-header">
            <h3>🎯 Performance Insights</h3>
          </div>
          <div className="insights-grid">
            <div className="insight-card">
              <div className="insight-icon">👑</div>
              <div className="insight-content">
                <div className="insight-title">Top Performer</div>
                <div className="insight-value">
                  {platformMetrics[0]?.name} with {platformMetrics[0]?.overallScore} score
                </div>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">💎</div>
              <div className="insight-content">
                <div className="insight-title">Highest Engagement</div>
                <div className="insight-value">
                  {[...platformMetrics].sort((a, b) => b.engagement - a.engagement)[0]?.name} - {[...platformMetrics].sort((a, b) => b.engagement - a.engagement)[0]?.engagement}%
                </div>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">💰</div>
              <div className="insight-content">
                <div className="insight-title">Revenue Leader</div>
                <div className="insight-value">
                  {[...platformMetrics].sort((a, b) => b.revenue - a.revenue)[0]?.name} - {formatNumber([...platformMetrics].sort((a, b) => b.revenue - a.revenue)[0]?.revenue, 'currency')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
