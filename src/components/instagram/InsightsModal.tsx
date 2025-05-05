import React, { useState, useEffect } from 'react';
import './InsightsModal.css';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useInstagram } from '../../context/InstagramContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface InsightsModalProps {
  userId?: string;
  onClose: () => void;
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

const InsightsModal: React.FC<InsightsModalProps> = ({ userId: propUserId, onClose }) => {
  // Get userId from context if not provided as prop
  const { userId: contextUserId, isConnected } = useInstagram();
  const userId = propUserId || (isConnected ? contextUserId : null);

  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'reach' | 'other'>('reach');

  useEffect(() => {
    const fetchInsights = async () => {
      if (!userId) {
        setError('No Instagram userId available. Please connect your Instagram account.');
        setLoading(false);
        return;
      }

      try {
        console.log(`[${new Date().toISOString()}] Fetching insights for user ${userId}`);
        const response = await axios.get(`http://localhost:3000/insights/${userId}`);
        setInsights(response.data);
        console.log(`[${new Date().toISOString()}] Insights fetched:`, response.data);
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] Error fetching insights:`, err);
        setError(err.response?.data?.error || 'Failed to load insights.');
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [userId]);

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
        <h2>Instagram Insights</h2>
        {loading && <div className="insights-loading">Loading insights...</div>}
        {error && <div className="insights-error">{error}</div>}
        {insights && (
          <div className="insights-content">
            <div className="insights-tabs">
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
            <div className="insights-grid">
              {activeTab === 'reach' && (
                <>
                  {renderChart(insights.reach.daily, 'Daily Reach')}
                  {insights.reach.daily.length === 0 && (
                    <div className="insights-note">
                      <p>Your account is new, so reach data may be limited. Continue posting to generate more reach.</p>
                    </div>
                  )}
                </>
              )}
              {activeTab === 'other' && (
                <>
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
                </>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default InsightsModal;