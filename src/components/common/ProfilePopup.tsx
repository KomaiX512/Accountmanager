import React, { useState, useEffect } from 'react';
import './ProfilePopup.css';
import { motion } from 'framer-motion';
import axios from 'axios';
import ErrorBoundary from '../ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { disconnectInstagramAccount, isInstagramConnected } from '../../utils/instagramSessionManager';

interface ProfilePopupProps {
  username: string;
  onClose: () => void;
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ username, onClose }) => {
  const [activeTab, setActiveTab] = useState<'Rules' | 'Billing Method' | 'Name' | 'Account'>('Rules');
  const [rules, setRules] = useState<string | null>(null);
  const [savedRules, setSavedRules] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const maxRulesLength = 1000;
  const [isConnectedToInstagram, setIsConnectedToInstagram] = useState(false);
  const { currentUser } = useAuth();

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

  // Check if Instagram is connected on component mount
  useEffect(() => {
    if (currentUser?.uid) {
      const connected = isInstagramConnected(currentUser.uid);
      setIsConnectedToInstagram(connected);
    }
  }, [currentUser]);

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

  // Handle Instagram disconnect
  const handleDisconnectInstagram = async () => {
    if (!currentUser?.uid) {
      setError('No authenticated user found');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await disconnectInstagramAccount(currentUser.uid);
      setToastMessage('Instagram account disconnected successfully!');
      setIsConnectedToInstagram(false);
      
      // Refresh the page after a brief delay to update the UI
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Error disconnecting Instagram:', error);
      setError('Failed to disconnect Instagram account');
    } finally {
      setIsLoading(false);
    }
  };

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
              className={`sidebar-button ${activeTab === 'Account' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('Account')}
            >
              Account
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
            ) : activeTab === 'Account' ? (
              <motion.div
                className="account-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="account-header"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <h3>Account Settings for {username}</h3>
                </motion.div>
                
                <div className="account-options">
                  <div className="account-option">
                    <h4>Instagram Connection</h4>
                    {isConnectedToInstagram ? (
                      <>
                        <p>Your Instagram account is connected. You can disconnect it at any time.</p>
                        <motion.button
                          className="disconnect-instagram-button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleDisconnectInstagram}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Disconnecting...' : 'Disconnect Instagram'}
                        </motion.button>
                      </>
                    ) : (
                      <p>No Instagram account connected. You can connect your Instagram account from the dashboard.</p>
                    )}
                  </div>
                </div>
                
                {error && <p className="error">{error}</p>}
              </motion.div>
            ) : (
              <div className="placeholder">
                <p>This feature is coming soon.</p>
              </div>
            )}
          </div>
          
          {toastMessage && (
            <motion.div
              className="toast-message"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
            >
              {toastMessage}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </ErrorBoundary>
  );
};

export default ProfilePopup;