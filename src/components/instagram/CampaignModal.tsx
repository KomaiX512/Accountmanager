import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import useFeatureTracking from '../../hooks/useFeatureTracking';

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

interface AutopilotSettings {
  enabled: boolean;
  autoSchedule: boolean;
  autoReply: boolean;
  lastChecked?: string;
}

const CampaignModal: React.FC<CampaignModalProps> = ({ username, platform, isConnected, onClose, onCampaignStopped }) => {
  const { trackRealCampaign } = useFeatureTracking();
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<GeneratedContentSummary | null>(null);
  // Removed postCooked metric state
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  
  // 🚀 AUTOPILOT: New state for automation features
  const [autopilotSettings, setAutopilotSettings] = useState<AutopilotSettings>({
    enabled: false,
    autoSchedule: false,
    autoReply: false
  });
  const [autopilotLoading, setAutopilotLoading] = useState(false);

  useEffect(() => {
    fetchCampaignData();
    fetchAutopilotSettings(); // 🚀 AUTOPILOT: Fetch automation settings
    
    // Set up periodic refresh only if modal is open and not stopping
    const intervalId = setInterval(() => {
      if (!isStopping) {
        fetchCampaignData();
        fetchAutopilotSettings(); // 🚀 AUTOPILOT: Also refresh automation settings
      }
    }, 300000); // Check every 5 minutes (300,000 ms)
    
    return () => {
      clearInterval(intervalId);
    };
  }, [username, platform, isStopping]);

  // 🚀 AUTOPILOT: Fetch current automation settings
  const fetchAutopilotSettings = async () => {
    try {
      const response = await axios.get(`/autopilot-settings/${username}?platform=${platform}`);
      if (response.data) {
        setAutopilotSettings(response.data);
      }
    } catch (err: any) {
      // If autopilot settings don't exist yet, that's okay - use defaults
      if (err.response?.status !== 404) {
        console.warn('Error fetching autopilot settings:', err);
      }
    }
  };

  // 🚀 AUTOPILOT: Update automation settings
  const updateAutopilotSettings = async (newSettings: Partial<AutopilotSettings>) => {
    setAutopilotLoading(true);
    try {
      const updatedSettings = { ...autopilotSettings, ...newSettings };
      
      const response = await axios.post(`/autopilot-settings/${username}`, {
        platform,
        settings: updatedSettings
      });
      
      if (response.data.success) {
        setAutopilotSettings(updatedSettings);
        setError(null);
        
        // Track automation usage
        await trackRealCampaign(platform.toLowerCase(), {
          action: 'campaign_started' // Using campaign_started for autopilot activation
        });
      }
    } catch (err: any) {
      console.error('Error updating autopilot settings:', err);
      setError('Failed to update automation settings. Please try again.');
    } finally {
      setAutopilotLoading(false);
    }
  };

  const fetchCampaignData = async () => {
    if (isStopping) return; // Don't fetch if we're in the process of stopping
    
    setLoading(true);
    setError(null);

    try {
      // Fetch campaign summary (original endpoint)
      let summaryData = null;
      try {
        const summaryResponse = await axios.get(`/goal-summary/${username}?platform=${platform}`);
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
        const generatedSummaryResponse = await axios.get(`/generated-content-summary/${username}?platform=${platform}`);
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

      // Removed fetching post cooked count since Post Cooked metric is no longer displayed

      // Fetch engagement metrics
      const engagementResponse = await axios.get(`/engagement-metrics/${username}?platform=${platform}&connected=${isConnected}`);
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
    fetchAutopilotSettings(); // 🚀 AUTOPILOT: Also refresh automation settings
  };

  // 🚀 AUTOPILOT: Toggle main autopilot switch
  const handleAutopilotToggle = async () => {
    // ✅ CONNECTION CHECK: Prevent activation if account not connected
    if (!isConnected && !autopilotSettings.enabled) {
      setError('Please connect your account first to enable autopilot features.');
      return;
    }
    
    const newEnabled = !autopilotSettings.enabled;
    await updateAutopilotSettings({ 
      enabled: newEnabled,
      // If disabling autopilot, also disable both features
      autoSchedule: newEnabled ? autopilotSettings.autoSchedule : false,
      autoReply: newEnabled ? autopilotSettings.autoReply : false
    });
  };

  // 🚀 AUTOPILOT: Toggle auto-schedule feature
  const handleAutoScheduleToggle = async () => {
    if (!autopilotSettings.enabled) return; // Can't toggle if autopilot is off
    if (!isConnected) {
      setError('Account connection required for auto-scheduling.');
      return;
    }
    await updateAutopilotSettings({ autoSchedule: !autopilotSettings.autoSchedule });
  };

  // 🚀 AUTOPILOT: Toggle auto-reply feature  
  const handleAutoReplyToggle = async () => {
    if (!autopilotSettings.enabled) return; // Can't toggle if autopilot is off
    if (!isConnected) {
      setError('Account connection required for auto-replies.');
      return;
    }
    await updateAutopilotSettings({ autoReply: !autopilotSettings.autoReply });
  };

  const handleStopCampaign = () => {
    // Remove confirmation and directly stop the campaign
    handleConfirmStop();
  };

  const handleConfirmStop = async () => {
    setIsStopping(true);
    setError(null);

    try {
      console.log(`[CampaignModal] Attempting to stop campaign for ${username} on ${platform.toLowerCase()}`);

      // ✅ REAL USAGE TRACKING: Track campaign stop action
      const trackingSuccess = await trackRealCampaign(platform.toLowerCase(), {
        action: 'campaign_stopped'
      });

      if (trackingSuccess) {
        console.log(`[CampaignModal] ✅ Campaign stop tracked: ${platform} campaign stopped`);
      }

      const response = await axios.delete(`/stop-campaign/${username}?platform=${platform.toLowerCase()}`);
      
      if (response.data.success) {
        console.log('[CampaignModal] Campaign stopped successfully:', response.data);
        
        // Dispatch event to notify dashboard components first
        window.dispatchEvent(new CustomEvent('campaignStopped', { 
          detail: { username, platform: platform.toLowerCase() } 
        }));
        console.log(`[CampaignModal] Dispatched campaignStopped event for ${username} on ${platform.toLowerCase()}`);
        
        // Wait a moment before closing to ensure event is processed
        setTimeout(() => {
          // Close the modal and notify parent component
          if (onCampaignStopped) {
            onCampaignStopped();
          }
          onClose();
        }, 1000); // Wait 1 second before closing
      } else {
        console.error('[CampaignModal] Failed to stop campaign:', response.data);
        setError('Failed to stop campaign. Please try again.');
      }
    } catch (err: any) {
      console.error('[CampaignModal] Error stopping campaign:', err);
      setError(err.response?.data?.error || 'Failed to stop campaign. Please try again.');
      
      // Even if there's an error, still close the modal and notify components
      // This helps prevent UI getting stuck if backend has issues but campaign was actually stopped
      setTimeout(() => {
        // Dispatch event to notify dashboard components
        window.dispatchEvent(new CustomEvent('campaignStopped', { 
          detail: { username, platform: platform.toLowerCase() } 
        }));
        console.log(`[CampaignModal] Dispatched campaignStopped event after error for ${username} on ${platform.toLowerCase()}`);
        
        // Wait a moment before closing to ensure event is processed
        setTimeout(() => {
          if (onCampaignStopped) {
            onCampaignStopped();
          }
          onClose();
        }, 1000);
      }, 2000); // Give user 2 seconds to see the error message
    } finally {
      setIsStopping(false);
    }
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
                gridTemplateColumns: '1fr',
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
              </div>

              {/* 🚀 AUTOPILOT: Automation Control Panel */}
              <div style={{
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                background: 'rgba(138, 43, 226, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ color: '#8a2be2', margin: 0, fontSize: '16px' }}>🚁 Autopilot Mode</h3>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: isConnected ? 'pointer' : 'not-allowed' }}>
                    <input
                      type="checkbox"
                      checked={autopilotSettings.enabled}
                      onChange={handleAutopilotToggle}
                      disabled={autopilotLoading || !isConnected}
                      style={{
                        marginRight: '8px',
                        transform: 'scale(1.2)',
                        accentColor: '#8a2be2',
                        opacity: isConnected ? 1 : 0.5
                      }}
                    />
                    <span style={{ color: '#e0e0ff', fontSize: '14px' }}>
                      {autopilotSettings.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </div>

                {/* 🔗 CONNECTION STATUS CHECK */}
                {!isConnected && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#ffc107', marginRight: '8px' }}>⚠️</span>
                      <h4 style={{ color: '#ffc107', margin: 0, fontSize: '14px' }}>
                        Account Connection Required
                      </h4>
                    </div>
                    <p style={{ color: '#e0e0ff', margin: '0 0 8px 0', fontSize: '13px' }}>
                      Autopilot requires your {platform} account to be connected for auto-replies and scheduling.
                    </p>
                    <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px', fontStyle: 'italic' }}>
                      Please connect your account from the main dashboard to enable automation features.
                    </p>
                  </div>
                )}

                {autopilotSettings.enabled && isConnected && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Autopilot Status Indicator */}
                    <div style={{
                      padding: '10px',
                      borderRadius: '6px',
                      background: 'rgba(138, 43, 226, 0.1)',
                      border: '1px solid rgba(138, 43, 226, 0.2)',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ color: '#8a2be2', marginRight: '6px' }}>🤖</span>
                        <h4 style={{ color: '#8a2be2', margin: 0, fontSize: '13px' }}>
                          Autopilot Status: Active
                        </h4>
                      </div>
                      <p style={{ color: '#a0a0cc', margin: 0, fontSize: '11px' }}>
                        • Auto-Reply: Checks every 5 minutes for new messages
                      </p>
                      <p style={{ color: '#a0a0cc', margin: 0, fontSize: '11px' }}>
                        • Auto-Schedule: Maintains smart posting intervals
                      </p>
                    </div>

                    {/* Auto-Schedule Option */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '6px',
                      background: 'rgba(0, 255, 204, 0.1)',
                      border: '1px solid rgba(0, 255, 204, 0.2)',
                      opacity: !isConnected ? 0.6 : 1
                    }}>
                      <div>
                        <h4 style={{ color: '#00ffcc', margin: '0 0 4px 0', fontSize: '14px' }}>
                          📅 Auto-Schedule Posts
                        </h4>
                        <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px' }}>
                          {isConnected 
                            ? 'Automatically schedule new posts with smart intervals' 
                            : 'Requires account connection for scheduling'
                          }
                        </p>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: isConnected ? 'pointer' : 'not-allowed' }}>
                        <input
                          type="checkbox"
                          checked={autopilotSettings.autoSchedule}
                          onChange={handleAutoScheduleToggle}
                          disabled={autopilotLoading || !autopilotSettings.enabled || !isConnected}
                          style={{
                            transform: 'scale(1.1)',
                            accentColor: '#00ffcc',
                            opacity: isConnected ? 1 : 0.5
                          }}
                        />
                      </label>
                    </div>

                    {/* Auto-Reply Option */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '6px',
                      background: 'rgba(255, 142, 83, 0.1)',
                      border: '1px solid rgba(255, 142, 83, 0.2)',
                      opacity: !isConnected ? 0.6 : 1
                    }}>
                      <div>
                        <h4 style={{ color: '#ff8e53', margin: '0 0 4px 0', fontSize: '14px' }}>
                          💬 Auto-Reply to DMs/Comments
                        </h4>
                        <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px' }}>
                          {isConnected 
                            ? 'AI responds to messages and comments automatically' 
                            : 'Requires account connection for auto-replies'
                          }
                        </p>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: isConnected ? 'pointer' : 'not-allowed' }}>
                        <input
                          type="checkbox"
                          checked={autopilotSettings.autoReply}
                          onChange={handleAutoReplyToggle}
                          disabled={autopilotLoading || !autopilotSettings.enabled || !isConnected}
                          style={{
                            transform: 'scale(1.1)',
                            accentColor: '#ff8e53',
                            opacity: isConnected ? 1 : 0.5
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {!autopilotSettings.enabled && (
                  <p style={{ 
                    color: '#a0a0cc', 
                    margin: 0, 
                    fontSize: '13px', 
                    fontStyle: 'italic',
                    textAlign: 'center'
                  }}>
                    {isConnected 
                      ? 'Enable autopilot to access automation features'
                      : 'Connect your account and enable autopilot for automation'
                    }
                  </p>
                )}
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
    </motion.div>
  );
};

export default CampaignModal; 