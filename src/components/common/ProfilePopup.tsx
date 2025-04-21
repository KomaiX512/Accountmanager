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
  const [rules, setRules] = useState<string | null>(null);
  const [savedRules, setSavedRules] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const maxRulesLength = 1000;

  useEffect(() => {
    if (activeTab === 'Rules') {
      const fetchRules = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await axios.get(`http://localhost:3000/rules/${username}`);
          setRules(response.data.rules || '');
          setSavedRules(response.data.rules || '');
          setIsEditingRules(false);
          setShowPreview(false);
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setRules('');
            setSavedRules('');
            setIsEditingRules(true);
            setShowPreview(false);
          } else {
            setError('Failed to load rules.');
            setRules('');
            setSavedRules('');
            setIsEditingRules(false);
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchRules();
    }
  }, [activeTab, username]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleSubmitRules = async () => {
    if (!rules?.trim()) {
      setError('Rules cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`http://localhost:3000/rules/${username}`, { rules });
      setSavedRules(rules);
      setIsEditingRules(false);
      setShowPreview(true);
      setToastMessage('Rules saved successfully!');
    } catch (err) {
      setError('Failed to save rules.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setRules(savedRules);
    setIsEditingRules(false);
    setShowPreview(!!savedRules);
    setError(null);
  };

  const handleClearRules = () => {
    setRules('');
    setError(null);
  };

  const handleAddOrEditRules = () => {
    setIsEditingRules(true);
    setShowPreview(false);
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
                <motion.div
                  className="rules-header"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <h3>Manager Rules for {username}</h3>
                  {rules && rules.trim() && !isEditingRules && (
                    <motion.button
                      className="edit-rules-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddOrEditRules}
                    >
                      Edit Rules
                    </motion.button>
                  )}
                </motion.div>
                {isLoading ? (
                  <div className="loading">Loading...</div>
                ) : !rules && !isEditingRules ? (
                  <motion.div
                    className="no-rules-container"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <p className="no-rules-text">
                      No rules set yet. Define how your manager should operate!
                    </p>
                    <motion.button
                      className="add-rules-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddOrEditRules}
                    >
                      Add Rules
                    </motion.button>
                  </motion.div>
                ) : isEditingRules ? (
                  <motion.div
                    className="rules-edit-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="textarea-wrapper">
                      <textarea
                        value={rules || ''}
                        onChange={(e) => setRules(e.target.value)}
                        placeholder="Enter rules for manager behavior (e.g., What things should not discussed in DM with anyone and tone etc.)..."
                        className="rules-textarea"
                        maxLength={maxRulesLength}
                      />
                      <div className="char-counter">
                        {rules?.length || 0}/{maxRulesLength}
                      </div>
                    </div>
                    {error && <p className="error">{error}</p>}
                    <div className="rules-action-buttons">
                      <motion.button
                        className="submit-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSubmitRules}
                        disabled={isLoading || !rules?.trim() || !isDirty}
                      >
                        {isLoading ? 'Saving...' : 'Save Rules'}
                      </motion.button>
                      <motion.button
                        className="clear-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleClearRules}
                        disabled={isLoading || !rules?.trim()}
                      >
                        Clear Rules
                      </motion.button>
                      <motion.button
                        className="cancel-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCancelEdit}
                        disabled={isLoading}
                      >
                        Cancel
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    className="rules-display-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="rules-toggle">
                      <motion.button
                        className={`toggle-button ${showPreview ? 'active' : ''}`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowPreview(true)}
                      >
                        Preview
                      </motion.button>
                      <motion.button
                        className={`toggle-button ${!showPreview ? 'active' : ''}`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowPreview(false)}
                      >
                        Raw
                      </motion.button>
                    </div>
                    <div className="rules-content">
                      {showPreview ? (
                        rules?.split('\n').map((line, index) => (
                          <p key={index} className="rule-line">
                            {line}
                          </p>
                        ))
                      ) : (
                        <pre className="rules-raw">{rules}</pre>
                      )}
                    </div>
                  </motion.div>
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