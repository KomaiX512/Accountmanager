import React, { useState, useEffect } from 'react';
import './ProfilePopup.css';
import { motion } from 'framer-motion';
import axios from 'axios';
import ErrorBoundary from '../ErrorBoundary';

interface ProfilePopupProps {
  username: string;
  onClose: () => void;
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ username, onClose }) => {
  const [activeTab, setActiveTab] = useState<'Rules' | 'Billing Method' | 'Name'>('Rules');
  const [rules, setRules] = useState('');
  const [savedRules, setSavedRules] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch rules on Rules tab activation
  useEffect(() => {
    if (activeTab === 'Rules') {
      const fetchRules = async () => {
        setIsLoading(true);
        try {
          const response = await axios.get(`http://localhost:3000/rules/${username}`);
          setRules(response.data.rules || '');
          setSavedRules(response.data.rules || '');
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setRules('');
            setSavedRules('');
          } else {
            setError('Failed to load rules.');
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchRules();
    }
  }, [activeTab, username]);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleSubmitRules = async () => {
    if (!rules.trim()) {
      setError('Rules cannot be empty.');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`http://localhost:3000/rules/${username}`, { rules });
      setSavedRules(rules);
      setError(null);
      setToastMessage('Your rules are saved with us!');
    } catch (err) {
      setError('Failed to save rules.');
    } finally {
      setIsLoading(false);
    }
  };

  const isDirty = rules !== savedRules;

  return (
    <ErrorBoundary>
      <motion.div
        className="profile-popup-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="profile-popup-content"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="popup-sidebar">
            <motion.button
              className={`sidebar-button ${activeTab === 'Rules' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('Rules')}
            >
              Rules
            </motion.button>
            <motion.button
              className="sidebar-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled
            >
              Billing Method
            </motion.button>
            <motion.button
              className="sidebar-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled
            >
              Name
            </motion.button>
          </div>
          <div className="popup-main">
            {activeTab === 'Rules' ? (
              <div className="rules-section">
                <h3>Manager Rules</h3>
                {isLoading ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <>
                    <textarea
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                      placeholder="Enter rules for manager behavior..."
                      className="rules-textarea"
                    />
                    {error && <p className="error">{error}</p>}
                    <motion.button
                      className="submit-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSubmitRules}
                      disabled={isLoading || !rules.trim() || !isDirty}
                    >
                      Submit Rules
                    </motion.button>
                  </>
                )}
              </div>
            ) : (
              <div className="logo-placeholder">
                <svg
                  className="placeholder-logo"
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="50" cy="50" r="40" fill="#4a4a6a" />
                  <path
                    d="M50 20 A30 30 0 0 1 80 50 A30 30 0 0 1 50 80 A30 30 0 0 1 20 50 A30 30 0 0 1 50 20 Z"
                    fill="#00ffcc"
                    opacity="0.3"
                  />
                </svg>
                <p>Profile Placeholder</p>
              </div>
            )}
          </div>
          <motion.button
            className="close-button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
          >
            Close
          </motion.button>
          {toastMessage && (
            <motion.div
              className="rules-toast"
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
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {toastMessage}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </ErrorBoundary>
  );
};

export default ProfilePopup;