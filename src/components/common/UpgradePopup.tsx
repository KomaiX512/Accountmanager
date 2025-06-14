import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import './UpgradePopup.css';

interface UpgradePopupProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  currentUsage: number;
  limit: number;
  userType?: string;
}

const UpgradePopup: React.FC<UpgradePopupProps> = ({
  isOpen,
  onClose,
  feature,
  currentUsage,
  limit,
  userType = 'freemium'
}) => {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate('/pricing');
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'posts':
        return '📝';
      case 'discussions':
        return '💬';
      case 'aiReplies':
        return '🤖';
      case 'campaigns':
        return '🎯';
      default:
        return '⭐';
    }
  };

  const getFeatureDisplayName = (feature: string) => {
    switch (feature) {
      case 'posts':
        return 'Posts';
      case 'discussions':
        return 'Discussions';
      case 'aiReplies':
        return 'AI Replies';
      case 'campaigns':
        return 'Campaigns';
      default:
        return 'Feature';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="upgrade-popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="upgrade-popup"
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            transition={{ type: "spring", duration: 0.3 }}
          >
            <div className="upgrade-popup-header">
              <div className="feature-icon">
                {getFeatureIcon(feature)}
              </div>
              <h2>Your Trial Has Ended</h2>
              <button className="close-btn" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="upgrade-popup-content">
              <div className="limit-info">
                <div className="usage-meter">
                  <div className="usage-bar">
                    <div 
                      className="usage-fill" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="usage-text">
                    <span className="feature-name">{getFeatureDisplayName(feature)}</span>
                    <span className="usage-count">{currentUsage}/{limit}</span>
                  </div>
                </div>
              </div>

              <div className="upgrade-message">
                <p className="main-message">
                  You've reached your {getFeatureDisplayName(feature).toLowerCase()} limit for this period.
                </p>
                <p className="cta-message">
                  <strong>Please upgrade to Pro to be Pro in Social Media!</strong>
                </p>
              </div>

              <div className="upgrade-benefits">
                <h3>🚀 Upgrade to Premium and get:</h3>
                <ul>
                  <li>✅ 160 Instant Posts per month</li>
                  <li>✅ 200 AI Discussions</li>
                  <li>✅ Unlimited AI Replies</li>
                  <li>✅ 10 Goal Model Campaigns</li>
                  <li>✅ Auto Schedule Posts</li>
                  <li>✅ Auto Reply with AI</li>
                  <li>✅ Advanced Analytics</li>
                  <li>✅ Premium Support</li>
                </ul>
              </div>
            </div>

            <div className="upgrade-popup-actions">
              <button 
                className="upgrade-btn"
                onClick={handleUpgrade}
              >
                🔥 Upgrade to Premium - $29/month
              </button>
              <button 
                className="maybe-later-btn"
                onClick={onClose}
              >
                Maybe Later
              </button>
            </div>

            <div className="trial-info">
              <p>
                💡 <strong>Current Plan:</strong> {userType.charAt(0).toUpperCase() + userType.slice(1)} Trial
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default UpgradePopup; 