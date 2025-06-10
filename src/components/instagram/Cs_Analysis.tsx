import React, { useState, useEffect, useCallback } from 'react';
import './Cs_Analysis.css';
import '../../utils/jsonDecoder.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';
import { decodeJSONToReactElements, formatCount } from '../../utils/jsonDecoder';
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
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const Cs_Analysis: React.FC<Cs_AnalysisProps> = ({ accountHolder, competitors, platform = 'instagram' }) => {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [currentAnalysisIndex, setCurrentAnalysisIndex] = useState(0);
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

  const competitorsQuery = localCompetitors.length > 0 ? localCompetitors.join(',') : '';
  const competitorEndpoint = competitorsQuery 
    ? `http://localhost:3000/retrieve-multiple/${normalizedAccountHolder}?competitors=${competitorsQuery}&platform=${platform}` 
    : '';
  
  const allCompetitorsFetch = useR2Fetch<any[]>(competitorEndpoint);

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

  const lastFetchTimeRef = React.useRef<Record<string, number>>({});

  const fetchCompetitorProfile = useCallback(async (competitor: string) => {
    try {
      // Throttle profile pic rendering to once every 30 minutes (1800000 ms)
      const now = Date.now();
      const lastFetchTime = lastFetchTimeRef.current[competitor] || 0;
      if (now - lastFetchTime < 1800000 && competitorProfiles[competitor]) {
        return;
      }
      const response = await axios.get(`http://localhost:3000/profile-info/${competitor}?platform=${platform}`);
      console.log(`Profile info for ${platform} competitor ${competitor}:`, response.data);
      setCompetitorProfiles(prev => ({
        ...prev,
        [competitor]: response.data,
      }));
      setProfileErrors(prev => ({
        ...prev,
        [competitor]: '',
      }));
      lastFetchTimeRef.current[competitor] = now;
    } catch (err: any) {
      setProfileErrors(prev => ({
        ...prev,
        [competitor]: `Failed to load ${platform} profile info.`,
      }));
    }
  }, [competitorProfiles, platform]);

  const fetchAccountInfoWithRetry = useCallback(async (retries = 3, delay = 1000): Promise<string[] | null> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(`http://localhost:3000/retrieve-account-info/${normalizedAccountHolder}?platform=${platform}`);
        const accountInfo: AccountInfo = response.data;
        setError(null);
        setNeedsRefresh(false);
        return accountInfo.competitors || [];
      } catch (err: any) {
        if (err.response?.status === 404 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        setError(`Failed to fetch updated ${platform} account info. Using local state.`);
        setNeedsRefresh(true);
        setToast(`${platform} sync failed. Please refresh to ensure data is up-to-date.`);
        return null;
      }
    }
    return null;
  }, [normalizedAccountHolder, platform]);

  const updateCompetitors = useCallback(async (updatedCompetitors: string[]) => {
    try {
      const response = await axios.post(`http://localhost:3000/save-account-info?platform=${platform}`, {
        username: normalizedAccountHolder,
        accountType: 'branding',
        postingStyle: 'I post about NewYork lives',
        competitors: updatedCompetitors,
        platform: platform
      });
      return response.status === 200;
    } catch (error: any) {
      console.error(`Error updating ${platform} competitors:`, error);
      return false;
    }
  }, [normalizedAccountHolder, platform]);

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

  useEffect(() => {
    localCompetitors.forEach(competitor => {
      if (!competitorProfiles[competitor] && !profileErrors[competitor]) {
        fetchCompetitorProfile(competitor);
      }
    });
  }, [localCompetitors, fetchCompetitorProfile]);

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
    setLocalCompetitors(updatedCompetitors);

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor added successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors);
      }
    } else {
      setLocalCompetitors(originalCompetitors);
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
    setLocalCompetitors(updatedCompetitors);

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor updated successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors);
      }
    } else {
      setLocalCompetitors(originalCompetitors);
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
    setLocalCompetitors(updatedCompetitors);

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor deleted successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors);
      }
    } else {
      setLocalCompetitors(originalCompetitors);
      setToast('Failed to delete competitor.');
    }

    if (selectedCompetitor === competitor) setSelectedCompetitor(null);
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    const serverCompetitors = await fetchAccountInfoWithRetry(5, 2000);
    if (serverCompetitors) {
      setLocalCompetitors(serverCompetitors);
      setToast('Successfully synced with server!');
    }
    setLoading(false);
  };

  const renderAnalysisContent = (analysisData: any) => {
    if (!analysisData || typeof analysisData !== 'object') {
      return <p className="analysis-detail">No details available.</p>;
    }

    // Use the new comprehensive JSON decoder
    const decodedSections = decodeJSONToReactElements(analysisData, {
      customClassPrefix: 'analysis',
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      maxNestingLevel: 4
    });

    return decodedSections.map((section, idx) => (
      <div key={idx} className="analysis-subsection">
        <h6 className="analysis-subheading">{section.heading}</h6>
        <div className="analysis-content-wrapper">
          {section.content}
        </div>
      </div>
    ));
  };

  const handleNextAnalysis = () => {
    if (currentAnalysisIndex < (selectedData?.length || 0) - 1) {
      setCurrentAnalysisIndex(currentAnalysisIndex + 1);
    }
  };

  const handlePrevAnalysis = () => {
    if (currentAnalysisIndex > 0) {
      setCurrentAnalysisIndex(currentAnalysisIndex - 1);
    }
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
            transition={{ delay: index * 0.1, duration: 0.2 }}
            whileHover={{ scale: 1.02 }}
          >
            <div className="competitor-actions">
              <motion.button
                className="action-btn edit-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
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
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAddCompetitor}
                  disabled={loading || !newCompetitor.trim()}
                >
                  {loading ? 'Saving...' : 'Save'}
                </motion.button>
                <motion.button
                  className="modal-btn cancel-btn"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
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
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEditCompetitor}
                  disabled={loading || !editCompetitor.trim()}
                >
                  {loading ? 'Saving...' : 'Save'}
                </motion.button>
                <motion.button
                  className="modal-btn cancel-btn"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
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
                ) : competitorProfiles[selectedCompetitor] ? (
                  <div className="stats">
                    <span>Followers: {formatCount(competitorProfiles[selectedCompetitor].followersCount)}</span>
                    <span>Following: {formatCount(competitorProfiles[selectedCompetitor].followsCount)}</span>
                  </div>
                ) : (
                  <div className="stats">
                    <span>Followers: Loading...</span>
                    <span>Following: Loading...</span>
                  </div>
                )}
              </div>
              <div className="analysis-section">
                <h4>Competitor Analysis Report</h4>
                {selectedData?.length ? (
                  <motion.div
                    key={currentAnalysisIndex}
                    className="analysis-report"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h5>Analysis {currentAnalysisIndex + 1}</h5>
                    {renderAnalysisContent(selectedData[currentAnalysisIndex])}
                    <div className="navigation-buttons">
                      <motion.button
                        className="nav-btn"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePrevAnalysis}
                        disabled={currentAnalysisIndex === 0}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#e0e0ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        Previous
                      </motion.button>
                      <motion.button
                        className="nav-btn"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleNextAnalysis}
                        disabled={currentAnalysisIndex === selectedData.length - 1}
                      >
                        Next
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#e0e0ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </motion.button>
                    </div>
                  </motion.div>
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