import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface CampaignModalProps {
  username: string;
  platform: string;
  isConnected: boolean;
  onClose: () => void;
  onCampaignStopped?: () => void;
}

interface CampaignSummary {
  Summary: string;
  Post_Estimated: string;
}

interface GeneratedContentSummary {
  success: boolean;
  summary: string;
  postCount: number;
  platform: string;
  username: string;
  retrievedAt: string;
}

interface EngagementMetrics {
  connected: boolean;
  currentFactor?: number;
  previousFactor?: number;
  delta?: number;
  message: string;
}

const CampaignModal: React.FC<CampaignModalProps> = ({ username, platform, isConnected, onClose, onCampaignStopped }) => {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<GeneratedContentSummary | null>(null);
  const [postCooked, setPostCooked] = useState<number>(0);
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    fetchCampaignData();
  }, [username, platform]);

  const fetchCampaignData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch campaign summary (original endpoint)
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

      // Fetch generated content summary (new endpoint for posts.json)
      let generatedSummaryData = null;
      try {
        const generatedSummaryResponse = await axios.get(`http://localhost:3000/generated-content-summary/${username}?platform=${platform}`);
        generatedSummaryData = generatedSummaryResponse.data;
        setGeneratedSummary(generatedSummaryData);
      } catch (generatedSummaryError: any) {
        if (generatedSummaryError.response?.status === 404) {
          console.log('Generated content summary not yet available');
          setGeneratedSummary(null);
        } else {
          console.warn('Error fetching generated content summary:', generatedSummaryError);
          // Don't throw here, as this is a new feature and might not always be available
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

  const handleStopCampaign = () => {
    setShowStopConfirmation(true);
  };

  const handleConfirmStop = async () => {
    setIsStopping(true);
    setError(null);

    try {
      const response = await axios.delete(`http://localhost:3000/stop-campaign/${username}?platform=${platform.toLowerCase()}`);
      
      if (response.data.success) {
        console.log('Campaign stopped successfully:', response.data);
        
        // Close the modal and notify parent component
        onClose();
        
        if (onCampaignStopped) {
          onCampaignStopped();
        }
        
        // Dispatch event to notify dashboard components
        window.dispatchEvent(new CustomEvent('campaignStopped', { 
          detail: { username, platform: platform.toLowerCase() } 
        }));
      } else {
        setError('Failed to stop campaign. Please try again.');
      }
    } catch (err: any) {
      console.error('Error stopping campaign:', err);
      setError(err.response?.data?.error || 'Failed to stop campaign. Please try again.');
    } finally {
      setIsStopping(false);
      setShowStopConfirmation(false);
    }
  };

  const handleCancelStop = () => {
    setShowStopConfirmation(false);
  };

  // Helper function to get the best available summary and post count
  const getSummaryData = () => {
    // Prefer generated content summary if available, fallback to original
    if (generatedSummary && generatedSummary.success) {
      return {
        summary: generatedSummary.summary,
        postEstimated: generatedSummary.postCount
      };
    } else if (summary) {
      return {
        summary: summary.Summary,
        postEstimated: summary.Post_Estimated
      };
    }
    return {
      summary: null,
      postEstimated: null
    };
  };

  const { summary: displaySummary, postEstimated } = getSummaryData();

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
            <div style={{ display: 'flex', gap: '8px' }}>
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
              <button
                onClick={handleStopCampaign}
                className="insta-btn disconnect"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(90deg, #ff4444, #cc3333)',
                  color: '#fff',
                  border: '1px solid #ff4444'
                }}
                disabled={loading || isStopping}
              >
                {isStopping ? 'Stopping...' : 'Stop Campaign'}
              </button>
            </div>
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
                {displaySummary ? (
                  <p style={{ 
                    color: '#e0e0ff', 
                    fontStyle: 'italic',
                    lineHeight: '1.5',
                    margin: '0 16px'
                  }}>
                    {displaySummary}
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
                    {postEstimated || (generatedSummary?.postCount ? generatedSummary.postCount : '-')}
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

              {/* Debug Information (only show if generatedSummary is available) */}
              {generatedSummary && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '8px',
                  color: '#666',
                  fontSize: '11px',
                  borderTop: '1px solid #333'
                }}>
                  Generated content retrieved at: {new Date(generatedSummary.retrievedAt).toLocaleString()}
                </div>
              )}

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

      {/* Stop Campaign Confirmation Modal */}
      {showStopConfirmation && (
        <motion.div
          className="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ zIndex: 3000 }}
        >
          <motion.div
            className="popup-content"
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 50 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, width: '100%' }}
          >
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ color: '#ff4444', marginBottom: '16px' }}>Stop Campaign</h3>
              <p style={{ color: '#e0e0ff', marginBottom: '24px', lineHeight: '1.5' }}>
                Are you sure you want to stop the campaign? This will delete all campaign files and cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={handleCancelStop}
                  className="insta-btn disconnect"
                  disabled={isStopping}
                  style={{ padding: '10px 20px' }}
                >
                  No, Keep Campaign
                </button>
                <button
                  onClick={handleConfirmStop}
                  className="insta-btn connect"
                  disabled={isStopping}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(90deg, #ff4444, #cc3333)',
                    borderColor: '#ff4444'
                  }}
                >
                  {isStopping ? 'Stopping...' : 'Yes, Stop Campaign'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default CampaignModal; 