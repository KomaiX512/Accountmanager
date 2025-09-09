import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { FaTimes, FaRocket, FaCalendarAlt, FaReply, FaExclamationTriangle } from 'react-icons/fa';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import './AutopilotPopup.css';

// 🚀 AUTOPILOT: Interface definitions matching CampaignModal
interface AutopilotSettings {
  enabled: boolean;
  autoSchedule: boolean;
  autoReply: boolean;
  autoScheduleInterval: number;
  scheduledPostsCount: number;
  autoRepliesCount: number;
}

interface AutopilotPopupProps {
  username: string;
  platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  isConnected: boolean;
  onClose: () => void;
}

const AutopilotPopup: React.FC<AutopilotPopupProps> = ({ 
  username, 
  platform, 
  isConnected, 
  onClose 
}) => {
  const { trackRealCampaign } = useFeatureTracking();
  
  // 🚀 AUTOPILOT: State management matching CampaignModal
  const [autopilotSettings, setAutopilotSettings] = useState<AutopilotSettings>({
    enabled: false,
    autoSchedule: false,
    autoReply: false,
    autoScheduleInterval: 60, // default 1 hour
    scheduledPostsCount: 0,
    autoRepliesCount: 0
  });
  
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 🚀 AUTOPILOT: Fetch current automation settings
  const fetchAutopilotSettings = async () => {
    try {
      const response = await axios.get(`/api/autopilot-settings/${username}?platform=${platform}`);
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
          scheduledPostsCount: 0,
          autoRepliesCount: 0
        });
      } else {
        console.warn('Error fetching autopilot settings:', err);
        setError('Failed to load autopilot settings.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 🚀 AUTOPILOT: Update automation settings
  const updateAutopilotSettings = async (newSettings: Partial<AutopilotSettings>) => {
    setAutopilotLoading(true);
    try {
      const updatedSettings = { ...autopilotSettings, ...newSettings };
      
      const response = await axios.post(`/api/autopilot-settings/${username}`, {
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
    if (!autopilotSettings.enabled) return;
    if (!isConnected) {
      setError('Account connection required for auto-scheduling.');
      return;
    }
    
    const newAutoSchedule = !autopilotSettings.autoSchedule;
    await updateAutopilotSettings({ autoSchedule: newAutoSchedule });
  };

  // 🚀 AUTOPILOT: Toggle auto-reply feature
  const handleAutoReplyToggle = async () => {
    if (!autopilotSettings.enabled) return;
    if (!isConnected) {
      setError('Account connection required for auto-replies.');
      return;
    }
    
    const newAutoReply = !autopilotSettings.autoReply;
    await updateAutopilotSettings({ autoReply: newAutoReply });
  };

  // 🚀 AUTOPILOT: Button triggering functions
  const triggerAutoScheduleButton = () => {
    if (!autopilotSettings.autoSchedule || !isConnected) return;
    
    // Dispatch event to trigger the Auto Schedule button in PostCooked component
    window.dispatchEvent(new CustomEvent('triggerAutoSchedule', {
      detail: {
        username,
        platform: platform.toLowerCase(),
        interval: autopilotSettings.autoScheduleInterval || 60
      }
    }));
    
    console.log(`[AutopilotPopup] Triggered auto-schedule for ${username} on ${platform}`);
    
    // Update counter
    setAutopilotSettings(prev => ({
      ...prev,
      scheduledPostsCount: (prev.scheduledPostsCount || 0) + 1
    }));
  };

  const triggerAutoReplyButton = () => {
    if (!autopilotSettings.autoReply || !isConnected) return;
    
    // Dispatch event to trigger the Auto Reply All button in Dashboard component
    window.dispatchEvent(new CustomEvent('triggerAutoReply', {
      detail: {
        username,
        platform: platform.toLowerCase()
      }
    }));
    
    console.log(`[AutopilotPopup] Triggered auto-reply for ${username} on ${platform}`);
    
    // Update counter
    setAutopilotSettings(prev => ({
      ...prev,
      autoRepliesCount: (prev.autoRepliesCount || 0) + 1
    }));
  };

  // Load settings on component mount
  useEffect(() => {
    fetchAutopilotSettings();
  }, [username, platform]);

  // Handle click outside popup to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Platform-specific colors
  const platformColors = {
    instagram: '#E4405F',
    twitter: '#1DA1F2',
  facebook: '#1877F2',
  linkedin: '#0A66C2'
  };

  const platformColor = platformColors[platform] || '#8a2be2';

  if (loading) {
    return (
      <div className="autopilot-popup-overlay" onClick={handleOverlayClick}>
        <motion.div
          className="autopilot-popup"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
        >
          <div className="autopilot-popup-header">
            <div className="autopilot-popup-title">
              <h3>Loading Autopilot Settings...</h3>
            </div>
            <button className="autopilot-popup-close" onClick={onClose}>
              <FaTimes />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="autopilot-popup-overlay" onClick={handleOverlayClick}>
      <motion.div
        className="autopilot-popup"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", duration: 0.3 }}
      >
        {/* Header */}
        <div className="autopilot-popup-header">
          <div className="autopilot-popup-title">
            <h3>
              <FaRocket style={{ marginRight: '8px', color: platformColor }} />
              Autopilot Control Center
            </h3>
            <div 
              className="platform-badge" 
              style={{ backgroundColor: platformColor }}
            >
              {platform}
            </div>
          </div>
          <button className="autopilot-popup-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="autopilot-error">
            <FaExclamationTriangle />
            {error}
          </div>
        )}

        {/* Connection Warning */}
        {!isConnected && (
          <div className="autopilot-connection-warning">
            <FaExclamationTriangle />
            Account not connected. Please connect your {platform} account to use autopilot features.
          </div>
        )}

        {/* Main Autopilot Control */}
        <div className="autopilot-main-control">
          <div className="autopilot-main-toggle">
            <h4>🚁 Autopilot Mode</h4>
            <label className="autopilot-switch">
              <input
                type="checkbox"
                checked={autopilotSettings.enabled}
                onChange={handleAutopilotToggle}
                disabled={autopilotLoading || !isConnected}
              />
              <span className="autopilot-slider"></span>
              <span className="autopilot-switch-label">
                {autopilotSettings.enabled ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* Autopilot Features */}
        {autopilotSettings.enabled && (
          <div className="autopilot-features">
            {/* Auto-Schedule Feature */}
            <div className="autopilot-feature">
              <div className="autopilot-feature-header">
                <div className="autopilot-feature-info">
                  <FaCalendarAlt className="autopilot-feature-icon" />
                  <div>
                    <h5>Auto-Schedule Posts</h5>
                    <p>Automatically schedule new posts with smart intervals</p>
                  </div>
                </div>
                <label className="autopilot-feature-toggle">
                  <input
                    type="checkbox"
                    checked={autopilotSettings.autoSchedule}
                    onChange={handleAutoScheduleToggle}
                    disabled={autopilotLoading || !isConnected}
                  />
                  <span className="autopilot-feature-slider"></span>
                </label>
              </div>
              
              {autopilotSettings.autoSchedule && (
                <div className="autopilot-feature-controls">
                  <span className="autopilot-counter">
                    Scheduled: {autopilotSettings.scheduledPostsCount || 0}
                  </span>
                </div>
              )}
            </div>

            {/* Auto-Reply Feature */}
            <div className="autopilot-feature">
              <div className="autopilot-feature-header">
                <div className="autopilot-feature-info">
                  <FaReply className="autopilot-feature-icon" />
                  <div>
                    <h5>Auto-Reply to DMs/Comments</h5>
                    <p>AI responds to messages and comments automatically</p>
                  </div>
                </div>
                <label className="autopilot-feature-toggle">
                  <input
                    type="checkbox"
                    checked={autopilotSettings.autoReply}
                    onChange={handleAutoReplyToggle}
                    disabled={autopilotLoading || !isConnected}
                  />
                  <span className="autopilot-feature-slider"></span>
                </label>
              </div>
              
              {autopilotSettings.autoReply && (
                <div className="autopilot-feature-controls">
                  <span className="autopilot-counter">
                    Replied: {autopilotSettings.autoRepliesCount || 0}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Display */}
        {autopilotSettings.enabled && (autopilotSettings.autoSchedule || autopilotSettings.autoReply) && (
          <div className="autopilot-status">
            <div className="status-indicator">
              <div className="status-dot"></div>
              <strong>Autopilot Active</strong>
            </div>
            <p>
              Background automation is running. Features will operate automatically based on your settings.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AutopilotPopup;
