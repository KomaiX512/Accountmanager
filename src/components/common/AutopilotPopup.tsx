import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FaRocket, FaCalendarAlt, FaReply, FaTimes, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import './AutopilotPopup.css';

interface AutopilotSettings {
  enabled: boolean;
  autoSchedule: boolean;
  autoReply: boolean;
  lastChecked?: string;
  autoScheduleInterval?: number; // in minutes
  autoReplyInterval?: number; // in minutes
  scheduledPostsCount?: number;
  autoRepliesCount?: number;
}

interface AutopilotPopupProps {
  username: string;
  platform: string;
  isConnected: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const AutopilotPopup: React.FC<AutopilotPopupProps> = ({
  username,
  platform,
  isConnected,
  isOpen,
  onClose
}) => {
  const { trackRealCampaign } = useFeatureTracking();
  
  // 🚀 AUTOPILOT: Exact same state as CampaignModal
  const [autopilotSettings, setAutopilotSettings] = useState<AutopilotSettings>({
    enabled: false,
    autoSchedule: false,
    autoReply: false,
    autoScheduleInterval: 60, // default 1 hour
    autoReplyInterval: 5, // default 5 minutes
    scheduledPostsCount: 0,
    autoRepliesCount: 0
  });
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🚀 AUTOPILOT: Fetch current automation settings (same as CampaignModal)
  const fetchAutopilotSettings = async () => {
    try {
      const response = await axios.get(`/autopilot-settings/${username}?platform=${platform}`);
      if (response.data) {
        setAutopilotSettings(response.data);
      }
    } catch (err: any) {
      // If autopilot settings don't exist yet, that's okay - use fresh defaults
      if (err.response?.status === 404) {
        console.log(`[AutopilotPopup] No existing autopilot settings found - using fresh defaults`);
        setAutopilotSettings({
          enabled: false,
          autoSchedule: false,
          autoReply: false,
          autoScheduleInterval: 60,
          autoReplyInterval: 5,
          scheduledPostsCount: 0,
          autoRepliesCount: 0
        });
      } else {
        console.warn('Error fetching autopilot settings:', err);
      }
    }
  };

  // 🚀 AUTOPILOT: Update automation settings (same as CampaignModal)
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
          action: 'campaign_started'
        });
      }
    } catch (err: any) {
      console.error('Error updating autopilot settings:', err);
      setError('Failed to update automation settings. Please try again.');
    } finally {
      setAutopilotLoading(false);
    }
  };

  // 🚀 AUTOPILOT: Toggle main autopilot switch (same as CampaignModal)
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

  // 🚀 AUTOPILOT: Enhanced toggle functions - intervals managed globally by Dashboard
  const handleAutoScheduleToggleWithInterval = async () => {
    if (!autopilotSettings.enabled) return;
    if (!isConnected) {
      setError('Account connection required for auto-scheduling.');
      return;
    }
    
    const newAutoSchedule = !autopilotSettings.autoSchedule;
    await updateAutopilotSettings({ autoSchedule: newAutoSchedule });
    
    console.log(`[AutopilotPopup] Auto-schedule ${newAutoSchedule ? 'enabled' : 'disabled'} - Dashboard service will handle intervals`);
  };

  const handleAutoReplyToggleWithInterval = async () => {
    if (!autopilotSettings.enabled) return;
    if (!isConnected) {
      setError('Account connection required for auto-replies.');
      return;
    }
    
    const newAutoReply = !autopilotSettings.autoReply;
    await updateAutopilotSettings({ autoReply: newAutoReply });
    
    console.log(`[AutopilotPopup] Auto-reply ${newAutoReply ? 'enabled' : 'disabled'} - Dashboard service will handle intervals`);
  };

  // 🚀 AUTOPILOT: Update auto-schedule interval (same as CampaignModal)
  const handleIntervalChange = async (newInterval: number) => {
    await updateAutopilotSettings({ autoScheduleInterval: newInterval });
  };

  // 🚀 AUTOPILOT: Update auto-reply interval
  const handleAutoReplyIntervalChange = async (newInterval: number) => {
    await updateAutopilotSettings({ autoReplyInterval: newInterval });
  };

  // Fetch settings when popup opens
  useEffect(() => {
    if (isOpen) {
      fetchAutopilotSettings();
    }
  }, [isOpen, username, platform]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const platformConfig = {
    instagram: { color: '#e4405f', name: 'Instagram' },
    twitter: { color: '#000000', name: 'X (Twitter)' },
    facebook: { color: '#1877f2', name: 'Facebook' }
  }[platform] || { color: '#6366f1', name: platform };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="autopilot-popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="autopilot-popup"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="autopilot-popup-header">
              <div className="autopilot-popup-title">
                <FaRocket className="title-icon" style={{ color: platformConfig.color }} />
                <h3>Autopilot Dashboard</h3>
                <span className="platform-badge" style={{ backgroundColor: platformConfig.color }}>
                  {platformConfig.name}
                </span>
              </div>
              <button className="autopilot-popup-close" onClick={onClose}>
                <FaTimes />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                className="autopilot-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <FaExclamationTriangle />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Connection Status */}
            {!isConnected && (
              <div className="autopilot-connection-warning">
                <FaExclamationTriangle />
                <span>Connect your {platformConfig.name} account to enable autopilot features</span>
              </div>
            )}

            {/* Main Autopilot Toggle */}
            <div className="autopilot-main-control">
              <div className="autopilot-main-toggle">
                <div className="toggle-info">
                  <h4>Enable Autopilot Mode</h4>
                  <p>Automate your entire {platformConfig.name} dashboard</p>
                </div>
                <button
                  className={`autopilot-toggle-btn ${autopilotSettings.enabled ? 'active' : ''}`}
                  onClick={handleAutopilotToggle}
                  disabled={autopilotLoading || (!isConnected && !autopilotSettings.enabled)}
                >
                  <div className="toggle-slider">
                    <div className="toggle-knob">
                      {autopilotLoading ? (
                        <div className="loading-spinner" />
                      ) : autopilotSettings.enabled ? (
                        <FaCheck />
                      ) : null}
                    </div>
                  </div>
                  <span>{autopilotSettings.enabled ? 'Active' : 'Inactive'}</span>
                </button>
              </div>
            </div>

            {/* Feature Controls */}
            <div className={`autopilot-features ${!autopilotSettings.enabled ? 'disabled' : ''}`}>
              {/* Auto-Schedule Feature */}
              <div className="autopilot-feature">
                <div className="feature-header">
                  <div className="feature-icon">
                    <FaCalendarAlt style={{ color: platformConfig.color }} />
                  </div>
                  <div className="feature-info">
                    <h5>Auto-Schedule Posts</h5>
                    <p>Automatically schedule your ready posts with smart intervals</p>
                  </div>
                  <button
                    className={`feature-toggle ${autopilotSettings.autoSchedule ? 'active' : ''}`}
                    onClick={handleAutoScheduleToggleWithInterval}
                    disabled={!autopilotSettings.enabled || autopilotLoading}
                  >
                    <div className="toggle-slider">
                      <div className="toggle-knob">
                        {autopilotSettings.autoSchedule && <FaCheck />}
                      </div>
                    </div>
                  </button>
                </div>

                {autopilotSettings.autoSchedule && (
                  <motion.div
                    className="feature-details"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="interval-selector">
                      <label>Posting Interval:</label>
                      <select
                        value={autopilotSettings.autoScheduleInterval || 60}
                        onChange={(e) => handleIntervalChange(Number(e.target.value))}
                        disabled={autopilotLoading}
                      >
                        <option value={0.33}>20 Seconds (Testing)</option>
                        <option value={1}>1 Minute (Testing)</option>
                        <option value={5}>5 Minutes (Testing)</option>
                        <option value={60}>1 Hour</option>
                        <option value={120}>2 Hours</option>
                        <option value={240}>4 Hours</option>
                        <option value={480}>8 Hours</option>
                        <option value={720}>12 Hours</option>
                        <option value={1440}>24 Hours</option>
                      </select>
                    </div>
                    <div className="feature-stats">
                      <span>Scheduled: {autopilotSettings.scheduledPostsCount || 0}</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Auto-Reply Feature */}
              <div className="autopilot-feature">
                <div className="feature-header">
                  <div className="feature-icon">
                    <FaReply style={{ color: platformConfig.color }} />
                  </div>
                  <div className="feature-info">
                    <h5>Auto-Reply Messages</h5>
                    <p>AI responses to DMs and comments automatically</p>
                  </div>
                  <button
                    className={`feature-toggle ${autopilotSettings.autoReply ? 'active' : ''}`}
                    onClick={handleAutoReplyToggleWithInterval}
                    disabled={!autopilotSettings.enabled || autopilotLoading}
                  >
                    <div className="toggle-slider">
                      <div className="toggle-knob">
                        {autopilotSettings.autoReply && <FaCheck />}
                      </div>
                    </div>
                  </button>
                </div>

                {autopilotSettings.autoReply && (
                  <motion.div
                    className="feature-details"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="interval-selector">
                      <label>Reply Check Interval:</label>
                      <select
                        value={autopilotSettings.autoReplyInterval || 5}
                        onChange={(e) => handleAutoReplyIntervalChange(Number(e.target.value))}
                        disabled={autopilotLoading}
                      >
                        <option value={0.33}>20 Seconds (Testing)</option>
                        <option value={1}>1 Minute (Testing)</option>
                        <option value={5}>5 Minutes</option>
                        <option value={10}>10 Minutes</option>
                        <option value={30}>30 Minutes</option>
                        <option value={60}>1 Hour</option>
                      </select>
                    </div>
                    <div className="feature-stats">
                      <span>Replies Sent: {autopilotSettings.autoRepliesCount || 0}</span>
                    </div>
                    <div className="feature-note">
                      <small>AI automatically replies to new messages and comments</small>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Status Summary */}
            {autopilotSettings.enabled && (
              <motion.div
                className="autopilot-status"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="status-indicator">
                  <div className="status-dot active" />
                  <span>Autopilot Active</span>
                </div>
                <p>Your {platformConfig.name} dashboard is now automated!</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AutopilotPopup;
