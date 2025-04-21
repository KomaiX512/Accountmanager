import React, { useState, useEffect, useCallback } from 'react';
import './Cs_Analysis.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';
import axios from 'axios';

interface ProfileInfo {
  followersCount: number;
  followsCount: number;
}

interface AccountInfo {
  username: string;
  accountType: string;
  postingStyle: string;
  competitors: string[];
}

interface Cs_AnalysisProps {
  accountHolder: string;
  competitors: string[];
}

const Cs_Analysis: React.FC<Cs_AnalysisProps> = ({ accountHolder, competitors }) => {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [competitorProfiles, setCompetitorProfiles] = useState<Record<string, ProfileInfo>>({});
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editCompetitor, setEditCompetitor] = useState('');
  const [currentCompetitor, setCurrentCompetitor] = useState<string | null>(null);
  const [localCompetitors, setLocalCompetitors] = useState<string[]>(competitors);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const normalizedAccountHolder = accountHolder;

  // Fetch competitor data dynamically
  // Refactor to avoid calling hooks inside map by using a single hook that fetches all competitors data
  const competitorsQuery = localCompetitors.length > 0 ? localCompetitors.join(',') : '';
  const allCompetitorsFetch = useR2Fetch<any[]>(competitorsQuery ? `http://localhost:3000/retrieve-multiple/${normalizedAccountHolder}?competitors=${competitorsQuery}` : '');

  // Map competitor to their data from the fetched array
  const competitorData = localCompetitors.map(competitor => {
    const dataForCompetitor = allCompetitorsFetch.data?.find(item => item.competitor === competitor) || null;
    return {
      competitor,
      fetch: {
        data: dataForCompetitor ? dataForCompetitor.data : undefined,
        loading: allCompetitorsFetch.loading,
        error: allCompetitorsFetch.error,
      },
    };
  });

  const selectedData = selectedCompetitor
    ? competitorData.find(data => data.competitor === selectedCompetitor)?.fetch.data
    : null;

  const fetchCompetitorProfile = useCallback(async (competitor: string) => {
    try {
      const response = await axios.get(`http://localhost:3000/profile-info/${competitor}`);
      setCompetitorProfiles(prev => ({
        ...prev,
        [competitor]: response.data,
      }));
    } catch (err: any) {
      setProfileErrors(prev => ({
        ...prev,
        [competitor]: 'Failed to load profile info.',
      }));
    }
  }, []);

  const fetchAccountInfoWithRetry = useCallback(async (retries = 3, delay = 1000): Promise<string[] | null> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(`http://localhost:3000/retrieve-account-info/${normalizedAccountHolder}`);
        const accountInfo: AccountInfo = response.data;
        setError(null);
        setNeedsRefresh(false);
        return accountInfo.competitors || [];
      } catch (err: any) {
        if (err.response?.status === 404 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        setError('Failed to fetch updated account info. Using local state.');
        setNeedsRefresh(true);
        setToast('Sync failed. Please refresh to ensure data is up-to-date.');
        return null;
      }
    }
    return null;
  }, [normalizedAccountHolder]);

  const updateCompetitors = useCallback(async (updatedCompetitors: string[]) => {
    try {
      const response = await axios.post(`http://localhost:3000/save-account-info`, {
        username: normalizedAccountHolder,
        accountType: 'branding',
        postingStyle: 'I post about NewYork lives',
        competitors: updatedCompetitors,
      });
      return response.status === 200;
    } catch (error: any) {
      console.error('Error updating competitors:', error);
      return false;
    }
  }, [normalizedAccountHolder]);

  // Initial sync with props
  useEffect(() => {
    const syncInitialState = async () => {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
      } else {
        setLocalCompetitors(competitors);
      }
    };
    syncInitialState();
  }, [competitors, fetchAccountInfoWithRetry]);

  // Fetch profiles for all competitors
  useEffect(() => {
    localCompetitors.forEach(competitor => {
      if (!competitorProfiles[competitor] && !profileErrors[competitor]) {
        fetchCompetitorProfile(competitor);
      }
    });
  }, [localCompetitors, fetchCompetitorProfile]);

  // Toast timing
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleAddCompetitor = async () => {
    if (!newCompetitor.trim()) {
      setToast('Competitor username cannot be empty.');
      return;
    }
    if (localCompetitors.includes(newCompetitor)) {
      setToast('Competitor already exists.');
      return;
    }

    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = [...localCompetitors, newCompetitor];
    setLocalCompetitors(updatedCompetitors); // Optimistic update

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor added successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors); // Keep optimistic update if fetch fails
      }
    } else {
      setLocalCompetitors(originalCompetitors); // Revert on failure
      setToast('Failed to add competitor.');
    }

    setNewCompetitor('');
    setShowAddModal(false);
    setLoading(false);
  };

  const handleEditCompetitor = async () => {
    if (!editCompetitor.trim()) {
      setToast('Competitor username cannot be empty.');
      return;
    }
    if (!currentCompetitor) {
      setToast('No competitor selected for editing.');
      return;
    }
    if (localCompetitors.includes(editCompetitor) && editCompetitor !== currentCompetitor) {
      setToast('Competitor username already exists.');
      return;
    }

    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = localCompetitors.map(comp =>
      comp === currentCompetitor ? editCompetitor : comp
    );
    setLocalCompetitors(updatedCompetitors); // Optimistic update

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor updated successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors); // Keep optimistic update if fetch fails
      }
    } else {
      setLocalCompetitors(originalCompetitors); // Revert on failure
      setToast('Failed to update competitor.');
    }

    setEditCompetitor('');
    setCurrentCompetitor(null);
    setShowEditModal(false);
    setLoading(false);
  };

  const handleDeleteCompetitor = async (competitor: string) => {
    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = localCompetitors.filter(comp => comp !== competitor);
    setLocalCompetitors(updatedCompetitors); // Optimistic update

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor deleted successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors); // Keep optimistic update if fetch fails
      }
    } else {
      setLocalCompetitors(originalCompetitors); // Revert on failure
      setToast('Failed to delete competitor.');
    }

    if (selectedCompetitor === competitor) setSelectedCompetitor(null);
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    const serverCompetitors = await fetchAccountInfoWithRetry(5, 2000); // More retries, longer delay
    if (serverCompetitors) {
      setLocalCompetitors(serverCompetitors);
      setToast('Successfully synced with server!');
    }
    setLoading(false);
  };

  const formatCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <ErrorBoundary>
      <motion.div
        className="cs-analysis-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {error && (
          <div className="error-message">
            {error}
            {needsRefresh && (
              <motion.button
                className="refresh-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleManualRefresh}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh Now'}
              </motion.button>
            )}
          </div>
        )}

        <div className="competitor-header">
          <motion.button
            className="add-competitor-btn"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowAddModal(true)}
            disabled={loading}
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
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Competitor
          </motion.button>
        </div>

        {competitorData.map(({ competitor, fetch }, index) => (
          <motion.div
            key={competitor}
            className={`competitor-sub-container ${fetch.data !== undefined ? 'loaded' : ''} ${fetch.data?.length === 0 ? 'no-data' : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.2, duration: 0.4 }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)' }}
          >
            <div className="competitor-actions">
              <motion.button
                className="action-btn edit-btn"
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setCurrentCompetitor(competitor);
                  setEditCompetitor(competitor);
                  setShowEditModal(true);
                }}
                disabled={loading}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#e0e0ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </motion.button>
              <motion.button
                className="action-btn delete-btn"
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleDeleteCompetitor(competitor)}
                disabled={loading}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ff4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </motion.button>
            </div>
            <span
              className="overlay-text"
              onClick={() => fetch.data !== undefined && setSelectedCompetitor(competitor)}
            >
              {competitor}
            </span>
            {fetch.loading && (
              <div className="futuristic-loading">
                <span className="loading-text">Analyzing {competitor}...</span>
                <div className="particle-effect" />
              </div>
            )}
            {fetch.data?.length === 0 && !fetch.loading && (
              <span className="no-data-text">No data available</span>
            )}
          </motion.div>
        ))}

        {showAddModal && (
          <motion.div
            className="popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setShowAddModal(false);
              setNewCompetitor('');
            }}
          >
            <motion.div
              className="popup-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Add Competitor</h3>
              <input
                type="text"
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                placeholder="Enter competitor username"
                className="competitor-input"
                disabled={loading}
              />
              <div className="modal-actions">
                <motion.button
                  className="modal-btn save-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleAddCompetitor}
                  disabled={loading || !newCompetitor.trim()}
                >
                  {loading ? 'Saving...' : 'Save'}
                </motion.button>
                <motion.button
                  className="modal-btn cancel-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setShowAddModal(false);
                    setNewCompetitor('');
                  }}
                  disabled={loading}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showEditModal && (
          <motion.div
            className="popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setShowEditModal(false);
              setEditCompetitor('');
              setCurrentCompetitor(null);
            }}
          >
            <motion.div
              className="popup-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Edit Competitor</h3>
              <input
                type="text"
                value={editCompetitor}
                onChange={(e) => setEditCompetitor(e.target.value)}
                placeholder="Edit competitor username"
                className="competitor-input"
                disabled={loading}
              />
              <div className="modal-actions">
                <motion.button
                  className="modal-btn save-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleEditCompetitor}
                  disabled={loading || !editCompetitor.trim()}
                >
                  {loading ? 'Saving...' : 'Save'}
                </motion.button>
                <motion.button
                  className="modal-btn cancel-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setShowEditModal(false);
                    setEditCompetitor('');
                    setCurrentCompetitor(null);
                  }}
                  disabled={loading}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedCompetitor && (
          <motion.div
            className="popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedCompetitor(null)}
          >
            <motion.div
              className="popup-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profile-section">
                <h3>{selectedCompetitor}</h3>
                {profileErrors[selectedCompetitor] ? (
                  <p className="error-text">{profileErrors[selectedCompetitor]}</p>
                ) : (
                  <div className="stats">
                    <span>
                      Followers: {competitorProfiles[selectedCompetitor]
                        ? formatCount(competitorProfiles[selectedCompetitor].followersCount)
                        : 'Loading...'}
                    </span>
                    <span>
                      Following: {competitorProfiles[selectedCompetitor]
                        ? formatCount(competitorProfiles[selectedCompetitor].followsCount)
                        : 'Loading...'}
                    </span>
                  </div>
                )}
              </div>
              <div className="analysis-section">
                <h4>Competitor Analysis</h4>
                {selectedData?.length ? (
                  selectedData.map((analysis: any, index: number) => (
                    <motion.div
                      key={index}
                      className="analysis-card"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <h5>Analysis {index + 1}</h5>
                      <pre>{JSON.stringify(analysis, null, 2)}</pre>
                    </motion.div>
                  ))
                ) : (
                  <p>No analysis available.</p>
                )}
              </div>
              <motion.button
                className="close-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedCompetitor(null)}
              >
                Close
              </motion.button>
            </motion.div>
          </motion.div>
        )}

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
      </motion.div>
    </ErrorBoundary>
  );
};

export default Cs_Analysis;