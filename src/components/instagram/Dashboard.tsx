import React from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import { motion } from 'framer-motion';

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors }) => {
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
          <div className="strategy-list">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="strategy-item">
                Strategy {index + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Competitor Analysis */}
        <div className="competitor-analysis">
          <h2>Competitor Analysis <span className="badge">5 unseen Cs analysis!!!</span></h2>
          <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
        </div>

        {/* Chatbot */}
        <div className="chatbot">
          <button className="chatbot-btn">
            Leave Order/Message/Query to your MANAGER...
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default Dashboard;