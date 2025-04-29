import React, { useState, useEffect } from 'react';
import './InsightsModal.css';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface InsightsModalProps {
  userId: string;
  onClose: () => void;
}

interface InsightData {
  follower_count: { lifetime: number };
  reach: { daily: { value: number; end_time: string }[]; lifetime?: number };
  audience_gender_age: { lifetime: { [key: string]: number } };
  audience_locale: { lifetime: { [key: string]: number } };
}

const InsightsModal: React.FC<InsightsModalProps> = ({ userId, onClose }) => {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
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

  const renderMetric = (title: string, value: number) => (
    <div className="insight-metric">
      <h3>{title}</h3>
      <p>{value.toLocaleString()}</p>
    </div>
  );

  const renderAudienceChart = (data: { [key: string]: number }, title: string) => {
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
            <div className="insights-grid">
              {renderMetric('Follower Count (Lifetime)', insights.follower_count.lifetime)}
              {insights.reach.daily.length > 0 && renderChart(insights.reach.daily, 'Reach (Daily)')}
              {Object.keys(insights.audience_gender_age.lifetime).length > 0 && renderAudienceChart(insights.audience_gender_age.lifetime, 'Audience Gender & Age')}
              {Object.keys(insights.audience_locale.lifetime).length > 0 && renderAudienceChart(insights.audience_locale.lifetime, 'Audience Locale')}
            </div>
            {insights.reach.daily.length === 0 && (
              <div className="insights-note">
                <p>Note: Metrics like Reach may require posting content to generate data.</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default InsightsModal;