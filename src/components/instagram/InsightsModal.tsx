import React, { useState, useEffect } from 'react';
import './InsightsModal.css';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useInstagram } from '../../context/InstagramContext';
import { useAuth } from '../../context/AuthContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface InsightsModalProps {
  userId: string;
  onClose: () => void;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

interface InsightData {
  follower_count: { lifetime: number };
  reach: { daily: { value: number; end_time: string }[] };
  impressions: { daily: { value: number; end_time: string }[] };
  online_followers: { daily: { value: number; end_time: string }[] };
  accounts_engaged: { daily: { value: number; end_time: string }[] };
  total_interactions: { daily: { value: number; end_time: string }[] };
  follower_demographics: { lifetime: { [key: string]: number } };
}

interface ProfitAnalysisData {
  primary_analysis: {
    engagement: {
      content_type_analysis: { [key: string]: { count: number; total_engagement: number; average_engagement: number } };
      category_analysis: { [key: string]: any };
      best_performing_content: string;
      best_performing_category: string | null;
    };
    posting_trends: {
      most_active_day: string;
      most_active_hour: number;
      hour_formatted: string;
      posts_per_day: number;
      day_distribution: { [key: string]: number };
      hour_distribution: { [key: string]: number };
      high_activity_months: { [key: string]: number };
    };
  };
}

const InsightsModal: React.FC<InsightsModalProps> = ({ userId, onClose, platform = 'instagram' }) => {
  // Get userId from context if not provided as prop
  const { userId: contextUserId, isConnected } = useInstagram();
  const { currentUser } = useAuth();
  const userIdFromContext = isConnected ? contextUserId : null;
  const userIdToUse = userId || userIdFromContext;

  const [insights, setInsights] = useState<InsightData | null>(null);
  const [profitAnalysis, setProfitAnalysis] = useState<ProfitAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'reach' | 'other'>('analysis');
  const [accountUsername, setAccountUsername] = useState<string | null>(null);

  // Fetch account username for profit analysis
  useEffect(() => {
    const fetchAccountUsername = async () => {
      if (!currentUser?.uid) return;
      
      try {
        const statusEndpoint = platform === 'twitter' 
          ? `http://localhost:3000/user-twitter-status/${currentUser.uid}`
          : `http://localhost:3000/user-instagram-status/${currentUser.uid}`;
        
        const response = await axios.get(statusEndpoint);
        const username = platform === 'twitter' 
          ? response.data.twitter_username 
          : response.data.instagram_username;
        
        if (username) {
          setAccountUsername(username);
          console.log(`[${new Date().toISOString()}] Found ${platform} username: ${username}`);
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error fetching ${platform} username:`, err);
      }
    };
    
    fetchAccountUsername();
  }, [currentUser?.uid, platform]);

  // Fetch profit analysis data (works without connection)
  useEffect(() => {
    const fetchProfitAnalysis = async () => {
      if (!accountUsername) {
        setAnalysisLoading(false);
        return;
      }

      try {
        console.log(`[${new Date().toISOString()}] Fetching profit analysis for ${platform} user: ${accountUsername}`);
        const response = await axios.get(`http://localhost:3000/profit-analysis/${accountUsername}?platform=${platform}`);
        setProfitAnalysis(response.data);
        console.log(`[${new Date().toISOString()}] Profit analysis fetched:`, response.data);
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] Error fetching profit analysis:`, err);
        setAnalysisError(err.response?.data?.message || 'No profit analysis data available for this account.');
      } finally {
        setAnalysisLoading(false);
      }
    };
    
    if (accountUsername) {
      fetchProfitAnalysis();
    }
  }, [accountUsername, platform]);

  // Fetch Instagram insights (only when connected)
  useEffect(() => {
    const fetchInsights = async () => {
      if (!userIdToUse) {
        setError('No Instagram userId available. Please connect your Instagram account.');
        setLoading(false);
        return;
      }

      try {
        console.log(`[${new Date().toISOString()}] Fetching insights for user ${userIdToUse}`);
        const response = await axios.get(`http://localhost:3000/insights/${userIdToUse}`);
        setInsights(response.data);
        console.log(`[${new Date().toISOString()}] Insights fetched:`, response.data);
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] Error fetching insights:`, err);
        setError(err.response?.data?.error || 'Failed to load insights.');
      } finally {
        setLoading(false);
      }
    };
    
    if (activeTab === 'reach' || activeTab === 'other') {
      fetchInsights();
    } else {
      setLoading(false);
    }
  }, [userIdToUse, activeTab]);

  const renderChart = (data: { value: number; end_time: string }[], title: string) => {
    const labels = data.map(d => new Date(d.end_time).toLocaleDateString());
    const values = data.map(d => d.value);

    return (
      <div className="insight-chart">
        <h3>{title}</h3>
        <Bar
          data={{
            labels,
            datasets: [{
              label: title,
              data: values,
              backgroundColor: 'rgba(0, 255, 204, 0.6)',
              borderColor: '#00ffcc',
              borderWidth: 1,
            }],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: { y: { beginAtZero: true } },
          }}
        />
      </div>
    );
  };

  const renderDemographicsChart = (data: { [key: string]: number }, title: string) => {
    const labels = Object.keys(data);
    const values = Object.values(data);

    return (
      <div className="insight-chart">
        <h3>{title}</h3>
        <Bar
          data={{
            labels,
            datasets: [{
              label: title,
              data: values,
              backgroundColor: 'rgba(0, 255, 204, 0.6)',
              borderColor: '#00ffcc',
              borderWidth: 1,
            }],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: { y: { beginAtZero: true } },
          }}
        />
      </div>
    );
  };

  const renderEngagementAnalysis = (engagement: ProfitAnalysisData['primary_analysis']['engagement']) => {
    return (
      <div className="analysis-section">
        <h3>📊 Content Performance Analysis</h3>
        <div className="analysis-cards">
          {Object.entries(engagement.content_type_analysis).map(([type, data]) => (
            <div key={type} className="analysis-card">
              <h4>{type.charAt(0).toUpperCase() + type.slice(1)} Content</h4>
              <div className="metric-row">
                <span className="metric-label">Total Posts:</span>
                <span className="metric-value">{data.count.toLocaleString()}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Total Engagement:</span>
                <span className="metric-value">{data.total_engagement.toLocaleString()}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Average Engagement:</span>
                <span className="metric-value">{Math.round(data.average_engagement).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
        {engagement.best_performing_content && (
          <div className="best-performing">
            <h4>🏆 Best Performing Content Type</h4>
            <p className="highlight-text">{engagement.best_performing_content}</p>
          </div>
        )}
      </div>
    );
  };

  const renderPostingTrends = (trends: ProfitAnalysisData['primary_analysis']['posting_trends']) => {
    const sortedDays = Object.entries(trends.day_distribution).sort(([,a], [,b]) => b - a);
    const sortedHours = Object.entries(trends.hour_distribution).sort(([,a], [,b]) => b - a).slice(0, 5);
    
    return (
      <div className="analysis-section">
        <h3>📅 Posting Trends & Optimal Times</h3>
        
        <div className="trends-grid">
          <div className="trend-card">
            <h4>⭐ Most Active Day</h4>
            <p className="highlight-text">{trends.most_active_day}</p>
          </div>
          
          <div className="trend-card">
            <h4>🕐 Best Posting Hour</h4>
            <p className="highlight-text">{trends.hour_formatted}</p>
          </div>
          
          <div className="trend-card">
            <h4>📈 Daily Post Rate</h4>
            <p className="highlight-text">{trends.posts_per_day.toFixed(1)} posts/day</p>
          </div>
        </div>

        <div className="distribution-section">
          <div className="distribution-card">
            <h4>📊 Day Distribution</h4>
            <div className="distribution-bars">
              {sortedDays.map(([day, count]) => (
                <div key={day} className="distribution-bar">
                  <span className="bar-label">{day}</span>
                  <div className="bar-container">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${(count / Math.max(...Object.values(trends.day_distribution))) * 100}%` }}
                    ></div>
                  </div>
                  <span className="bar-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="distribution-card">
            <h4>🕒 Top 5 Hours</h4>
            <div className="distribution-bars">
              {sortedHours.map(([hour, count]) => (
                <div key={hour} className="distribution-bar">
                  <span className="bar-label">{hour}:00</span>
                  <div className="bar-container">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${(count / Math.max(...sortedHours.map(([,c]) => c))) * 100}%` }}
                    ></div>
                  </div>
                  <span className="bar-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {Object.keys(trends.high_activity_months).length > 0 && (
          <div className="activity-months">
            <h4>📆 High Activity Months</h4>
            <div className="months-list">
              {Object.entries(trends.high_activity_months).map(([month, count]) => (
                <span key={month} className="month-badge">
                  {month}: {count} posts
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProfitAnalysis = () => {
    if (analysisLoading) {
      return <div className="insights-loading">Loading profit analysis...</div>;
    }

    if (analysisError) {
      return <div className="insights-error">{analysisError}</div>;
    }

    if (!profitAnalysis) {
      return (
        <div className="insights-error">
          {!accountUsername 
            ? `Please set up your ${platform === 'instagram' ? 'Instagram' : 'Twitter'} account to view profit analysis.`
            : 'No profit analysis data available for this account.'
          }
        </div>
      );
    }

    return (
      <div className="profit-analysis-content">
        <div className="analysis-header">
          <h2>STATISTICAL ANALYSIS</h2>
          <p className="analysis-subtitle">
            Comprehensive insights for @{accountUsername} on {platform === 'instagram' ? 'Instagram' : 'Twitter'}
          </p>
        </div>
        
        {profitAnalysis.primary_analysis.engagement && renderEngagementAnalysis(profitAnalysis.primary_analysis.engagement)}
        {profitAnalysis.primary_analysis.posting_trends && renderPostingTrends(profitAnalysis.primary_analysis.posting_trends)}
      </div>
    );
  };

  const renderConnectionRequired = () => {
    return (
      <div className="connection-required">
        <div className="connection-icon">🔗</div>
        <h3>Platform Connection Required</h3>
        <p>Please connect your {platform === 'instagram' ? 'Instagram' : 'Twitter'} account to view these detailed insights.</p>
        <div className="connection-benefits">
          <h4>What you'll get after connecting:</h4>
          <ul>
            <li>Real-time engagement metrics</li>
            <li>Audience demographics</li>
            <li>Reach and impression analytics</li>
            <li>Interactive performance charts</li>
          </ul>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="insights-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
    >
      <motion.div
        className="insights-modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="insights-close-btn" onClick={onClose}>×</button>
        <h2>{platform === 'instagram' ? 'Instagram' : 'Twitter'} Insights</h2>
        
        <div className="insights-tabs">
          <button
            className={activeTab === 'analysis' ? 'active' : ''}
            onClick={() => setActiveTab('analysis')}
          >
            Profit Analysis
          </button>
          <button
            className={activeTab === 'reach' ? 'active' : ''}
            onClick={() => setActiveTab('reach')}
          >
            Daily Reach
          </button>
          <button
            className={activeTab === 'other' ? 'active' : ''}
            onClick={() => setActiveTab('other')}
          >
            Other Insights
          </button>
        </div>
        
        <div className="insights-content">
          {activeTab === 'analysis' && renderProfitAnalysis()}
          
          {activeTab === 'reach' && (
            <>
              {!isConnected ? renderConnectionRequired() : (
                <>
                  {loading && <div className="insights-loading">Loading insights...</div>}
                  {error && <div className="insights-error">{error}</div>}
                  {insights && (
                    <div className="insights-grid">
                      {renderChart(insights.reach.daily, 'Daily Reach')}
                      {insights.reach.daily.length === 0 && (
                        <div className="insights-note">
                          <p>Your account is new, so reach data may be limited. Continue posting to generate more reach.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          
          {activeTab === 'other' && (
            <>
              {!isConnected ? renderConnectionRequired() : (
                <>
                  {loading && <div className="insights-loading">Loading insights...</div>}
                  {error && <div className="insights-error">{error}</div>}
                  {insights && (
                    <div className="insights-grid">
                      {renderChart(insights.impressions.daily, 'Daily Impressions')}
                      {renderChart(insights.online_followers.daily, 'Daily Online Followers')}
                      {renderChart(insights.accounts_engaged.daily, 'Daily Accounts Engaged')}
                      {renderChart(insights.total_interactions.daily, 'Daily Total Interactions')}
                      {Object.keys(insights.follower_demographics.lifetime).length > 0 &&
                        renderDemographicsChart(insights.follower_demographics.lifetime, 'Follower Demographics')}
                      {insights.impressions.daily.length === 0 &&
                        insights.online_followers.daily.length === 0 &&
                        insights.accounts_engaged.daily.length === 0 &&
                        insights.total_interactions.daily.length === 0 &&
                        Object.keys(insights.follower_demographics.lifetime).length === 0 && (
                          <div className="insights-note">
                            <p>Your account is new, so some insights may be limited. Engage with followers to generate data.</p>
                          </div>
                        )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default InsightsModal;