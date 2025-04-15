import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import OurStrategies from './OurStrategies';
import { motion } from 'framer-motion';
import axios from 'axios';

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors }) => {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const handleSendQuery = async () => {
    if (!query.trim()) return;

    try {
      await axios.post(`http://localhost:3000/save-query/${accountHolder}`, { query });
      setQuery('');
      setToast('You will get a thoughtful response within 15 minutes, thank you for patience.');
    } catch (error) {
      console.error('Error saving query:', error);
      setToast('Failed to send query. Try again.');
    }
  };

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="dashboard-grid">
        {/* Profile Metadata */}
        <div className="profile-metadata">
          <div className="profile-header">
            <div className="profile-pic"></div>
            <div className="stats">
              <div className="stat">
                <span className="label">Followers</span>
                <span className="value">10.3K</span>
              </div>
              <div className="stat">
                <span className="label">Following</span>
                <span className="value">304</span>
              </div>
            </div>
            <div className="chart-placeholder"></div>
          </div>
        </div>

        {/* Notifications */}
        <div className="notifications">
          <h2>Notifications <span className="badge">2 regular queries answered!!!</span></h2>
          <div className="notification-list">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="notification-item">
                Notification {index + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Post Cooked */}
        <div className="post-cooked">
          <h2>Post Cooked! <span className="badge">2 unseen!!!</span></h2>
          <div className="post-list">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="post-item">
                Post {index + 1}
                {index === 0 && <span className="action">Apply BrandKit on this</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Our Strategies */}
        <div className="strategies">
          <h2>Our Strategies <span className="badge">3 unseen!!!</span></h2>
          <OurStrategies accountHolder={accountHolder} />
        </div>

        {/* Competitor Analysis */}
        <div className="competitor-analysis">
          <h2>Competitor Analysis <span className="badge">5 unseen Cs analysis!!!</span></h2>
          <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
        </div>

        {/* Chatbot */}
        <div className="chatbot">
          <div className="chatbot-input-container">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Leave Order/Message/Query to your MANAGER..."
              className="chatbot-input"
            />
            <button className="chatbot-send-btn" onClick={handleSendQuery} disabled={!query.trim()}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#e0e0ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toast && (
          <motion.div
            className="toast-notification"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00ffcc"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="toast-icon"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            {toast}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default Dashboard;