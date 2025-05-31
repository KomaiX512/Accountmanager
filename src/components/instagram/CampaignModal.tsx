import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface CampaignModalProps {
  username: string;
  platform: string;
  isConnected: boolean;
  onClose: () => void;
}

interface CampaignSummary {
  Summary: string;
  Post_Estimated: string;
}

interface EngagementMetrics {
  connected: boolean;
  currentFactor?: number;
  previousFactor?: number;
  delta?: number;
  message: string;
}

const CampaignModal: React.FC<CampaignModalProps> = ({ username, platform, isConnected, onClose }) => {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [postCooked, setPostCooked] = useState<number>(0);
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaignData();
  }, [username, platform]);

  const fetchCampaignData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch campaign summary
      let summaryData = null;
      try {
        const summaryResponse = await axios.get(`http://localhost:3000/goal-summary/${username}?platform=${platform}`);
        summaryData = summaryResponse.data;
        setSummary(summaryData);
      } catch (summaryError: any) {
        if (summaryError.response?.status === 404) {
          console.log('Campaign summary not yet available');
          setSummary(null);
        } else {
          throw summaryError;
        }
      }

      // Fetch post cooked count
      const postsResponse = await axios.get(`http://localhost:3000/campaign-posts-count/${username}?platform=${platform}`);
      setPostCooked(postsResponse.data.postCooked || 0);

      // Fetch engagement metrics
      const engagementResponse = await axios.get(`http://localhost:3000/engagement-metrics/${username}?platform=${platform}&connected=${isConnected}`);
      setEngagement(engagementResponse.data);

    } catch (err: any) {
      console.error('Error fetching campaign data:', err);
      setError('Failed to load campaign data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchCampaignData();
  };

  return (
    <motion.div
      className="popup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="popup-content"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ color: '#00ffcc', margin: 0 }}>Campaign Progress</h2>
            <button
              onClick={handleRefresh}
              className="insta-btn connect"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                background: 'transparent',
                border: '1px solid #00ffcc',
                color: '#00ffcc'
              }}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div style={{ 
              color: '#ff4444', 
              textAlign: 'center', 
              margin: '20px 0',
              padding: '10px',
              border: '1px solid #ff4444',
              borderRadius: '6px',
              background: 'rgba(255, 68, 68, 0.1)'
            }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
              <p style={{ color: '#a0a0cc', marginTop: '10px' }}>Loading campaign data...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Campaign Summary */}
              <div style={{
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                background: 'rgba(0, 255, 204, 0.05)'
              }}>
                <h3 style={{ color: '#00ffcc', marginBottom: '12px', fontSize: '16px' }}>Summary</h3>
                {summary ? (
                  <p style={{ 
                    color: '#e0e0ff', 
                    fontStyle: 'italic',
                    lineHeight: '1.5',
                    margin: '0 16px'
                  }}>
                    {summary.Summary}
                  </p>
                ) : (
                  <p style={{ 
                    color: '#a0a0cc', 
                    fontStyle: 'italic',
                    margin: '0 16px'
                  }}>
                    Your campaign is processing. Progress will be available shortly.
                  </p>
                )}
              </div>

              {/* Post Metrics */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px'
              }}>
                <div style={{
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'rgba(0, 123, 255, 0.05)'
                }}>
                  <h4 style={{ color: '#007bff', margin: '0 0 8px 0', fontSize: '14px' }}>Post Estimated</h4>
                  <p style={{ color: '#e0e0ff', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                    {summary?.Post_Estimated || '-'}
                  </p>
                </div>

                <div style={{
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'rgba(255, 107, 107, 0.05)'
                }}>
                  <h4 style={{ color: '#ff6b6b', margin: '0 0 8px 0', fontSize: '14px' }}>Post Cooked</h4>
                  <p style={{ color: '#e0e0ff', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                    {postCooked}
                  </p>
                </div>
              </div>

              {/* Engagement Results */}
              <div style={{
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                background: 'rgba(255, 142, 83, 0.05)'
              }}>
                <h3 style={{ color: '#ff8e53', marginBottom: '12px', fontSize: '16px' }}>Result</h3>
                {engagement ? (
                  <div>
                    {engagement.connected ? (
                      <div>
                        <p style={{ 
                          color: '#e0e0ff', 
                          fontSize: '18px',
                          fontWeight: 'bold',
                          margin: '0 0 8px 0'
                        }}>
                          +{engagement.delta?.toFixed(2) || '0.00'}
                        </p>
                        <p style={{ color: '#a0a0cc', margin: 0 }}>
                          {engagement.message}
                        </p>
                      </div>
                    ) : (
                      <p style={{ color: '#a0a0cc', margin: 0 }}>
                        {engagement.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#a0a0cc', margin: 0 }}>
                    Loading engagement data...
                  </p>
                )}
              </div>

              {/* Platform Info */}
              <div style={{ 
                textAlign: 'center', 
                padding: '12px',
                color: '#666',
                fontSize: '12px',
                borderTop: '1px solid #333'
              }}>
                Platform: {platform} | User: {username}
              </div>

            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button
              onClick={onClose}
              className="insta-btn disconnect"
              style={{
                padding: '10px 24px',
                fontSize: '14px'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CampaignModal; 