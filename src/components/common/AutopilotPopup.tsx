import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import useFeatureTracking from '../../hooks/useFeatureTracking';

interface AutopilotSettings {
  enabled: boolean;
  autoSchedule: boolean;
  autoReply: boolean;
  lastChecked?: string;
  autoScheduleInterval?: number; // in minutes
  scheduledPostsCount?: number;
  autoRepliesCount?: number;
}

interface AutopilotPopupProps {
  username: string;
  platform: string;
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
  
  // 🚀 AUTOPILOT: Exact same state structure as CampaignModal
  const [autopilotSettings, setAutopilotSettings] = useState<AutopilotSettings>({
    enabled: false,
    autoSchedule: false,
    autoReply: false,
    autoScheduleInterval: 60, // default 1 hour
    scheduledPostsCount: 0,
    autoRepliesCount: 0
  });
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autoScheduleActive] = useState(false);
  const [autoReplyActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAutopilotSettings();
  }, [username, platform]);

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Fetch current automation settings
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
          scheduledPostsCount: 0,  // ✅ FRESH START
          autoRepliesCount: 0      // ✅ FRESH START
        });
      } else {
        console.warn('Error fetching autopilot settings:', err);
      }
    }
  };

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Update automation settings
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

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Toggle main autopilot switch
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

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Update auto-schedule interval
  const handleIntervalChange = async (newInterval: number) => {
    await updateAutopilotSettings({ autoScheduleInterval: newInterval });
  };

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Button triggering functions
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

  // 🚀 AUTOPILOT: Exact same logic as CampaignModal - Enhanced toggle functions
  const handleAutoScheduleToggleWithInterval = async () => {
    if (!autopilotSettings.enabled) return;
    if (!isConnected) {
      setError('Account connection required for auto-scheduling.');
      return;
    }
    
    const newAutoSchedule = !autopilotSettings.autoSchedule;
    await updateAutopilotSettings({ autoSchedule: newAutoSchedule });
    
    // Note: Interval management is now handled globally by Dashboard service
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
    
    // Note: Interval management is now handled globally by Dashboard service
    console.log(`[AutopilotPopup] Auto-reply ${newAutoReply ? 'enabled' : 'disabled'} - Dashboard service will handle intervals`);
  };

  return (
    <motion.div
      className="autopilot-popup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <motion.div
        className="autopilot-popup-content"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 20, 40, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          border: '1px solid rgba(138, 43, 226, 0.3)',
          boxShadow: '0 20px 40px rgba(138, 43, 226, 0.2), 0 0 30px rgba(138, 43, 226, 0.1)',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(138, 43, 226, 0.2)'
        }}>
          <h2 style={{ 
            color: '#8a2be2', 
            margin: 0, 
            fontSize: '20px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🚁 Autopilot Mode
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a0a0cc',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ff4444'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#a0a0cc'}
          >
            ×
          </button>
        </div>

        {/* Platform Info */}
        <div style={{
          textAlign: 'center',
          marginBottom: '20px',
          padding: '12px',
          borderRadius: '8px',
          background: 'rgba(138, 43, 226, 0.1)',
          border: '1px solid rgba(138, 43, 226, 0.2)'
        }}>
          <p style={{ color: '#e0e0ff', margin: 0, fontSize: '14px' }}>
            <strong>{platform.charAt(0).toUpperCase() + platform.slice(1)}</strong> Dashboard Automation for <strong>{username}</strong>
          </p>
        </div>

        {error && (
          <div style={{ 
            color: '#ff4444', 
            textAlign: 'center', 
            margin: '0 0 20px 0',
            padding: '10px',
            border: '1px solid #ff4444',
            borderRadius: '6px',
            background: 'rgba(255, 68, 68, 0.1)'
          }}>
            {error}
          </div>
        )}

        {/* Main Autopilot Toggle */}
        <div style={{
          marginBottom: '20px',
          padding: '16px',
          borderRadius: '8px',
          background: 'rgba(138, 43, 226, 0.05)',
          border: '1px solid rgba(138, 43, 226, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ color: '#8a2be2', margin: '0 0 4px 0', fontSize: '16px' }}>
                Enable Autopilot
              </h3>
              <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px' }}>
                Automate your entire {platform} dashboard activities
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: isConnected ? 'pointer' : 'not-allowed' }}>
              <input
                type="checkbox"
                checked={autopilotSettings.enabled}
                onChange={handleAutopilotToggle}
                disabled={autopilotLoading || !isConnected}
                style={{
                  marginRight: '8px',
                  transform: 'scale(1.3)',
                  accentColor: '#8a2be2',
                  opacity: isConnected ? 1 : 0.5
                }}
              />
              <span style={{ color: '#e0e0ff', fontSize: '14px', fontWeight: 'bold' }}>
                {autopilotSettings.enabled ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* 🔗 CONNECTION STATUS CHECK - Exact same as CampaignModal */}
        {!isConnected && (
          <div style={{
            padding: '12px',
            borderRadius: '6px',
            background: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            marginBottom: '20px'
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

        {/* Automation Features - Only show when autopilot is enabled and connected */}
        {autopilotSettings.enabled && isConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Autopilot Status Indicator - Exact same as CampaignModal */}
            <div style={{
              padding: '12px',
              borderRadius: '6px',
              background: 'rgba(138, 43, 226, 0.1)',
              border: '1px solid rgba(138, 43, 226, 0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: '#8a2be2', marginRight: '6px' }}>🤖</span>
                <h4 style={{ color: '#8a2be2', margin: 0, fontSize: '14px' }}>
                  Autopilot Status: Active
                </h4>
              </div>
              <p style={{ color: '#a0a0cc', margin: '0 0 4px 0', fontSize: '11px' }}>
                • Auto-Reply: Checks every 30 seconds for new messages
              </p>
              <p style={{ color: '#a0a0cc', margin: 0, fontSize: '11px' }}>
                • Auto-Schedule: Maintains smart posting intervals
              </p>
              
              {/* Manual Trigger Buttons for Testing - Exact same as CampaignModal */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(138, 43, 226, 0.2)' }}>
                <button
                  onClick={triggerAutoScheduleButton}
                  disabled={!autopilotSettings.autoSchedule || !isConnected}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: 'rgba(0, 255, 204, 0.2)',
                    border: '1px solid rgba(0, 255, 204, 0.3)',
                    color: '#00ffcc',
                    borderRadius: '4px',
                    cursor: autopilotSettings.autoSchedule && isConnected ? 'pointer' : 'not-allowed',
                    opacity: autopilotSettings.autoSchedule && isConnected ? 1 : 0.5
                  }}
                >
                  📅 Trigger Schedule
                </button>
                <button
                  onClick={triggerAutoReplyButton}
                  disabled={!autopilotSettings.autoReply || !isConnected}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: 'rgba(255, 142, 83, 0.2)',
                    border: '1px solid rgba(255, 142, 83, 0.3)',
                    color: '#ff8e53',
                    borderRadius: '4px',
                    cursor: autopilotSettings.autoReply && isConnected ? 'pointer' : 'not-allowed',
                    opacity: autopilotSettings.autoReply && isConnected ? 1 : 0.5
                  }}
                >
                  💬 Trigger Reply
                </button>
              </div>
            </div>

            {/* Auto-Schedule Option - Exact same as CampaignModal */}
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(0, 255, 204, 0.1)',
              border: '1px solid rgba(0, 255, 204, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <h4 style={{ color: '#00ffcc', margin: '0 0 4px 0', fontSize: '14px' }}>
                    📅 Auto-Schedule Posts
                  </h4>
                  <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px' }}>
                    Automatically schedule new posts with smart intervals
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autopilotSettings.autoSchedule}
                    onChange={handleAutoScheduleToggleWithInterval}
                    disabled={autopilotLoading || !autopilotSettings.enabled}
                    style={{
                      transform: 'scale(1.2)',
                      accentColor: '#00ffcc'
                    }}
                  />
                </label>
              </div>
              
              {/* Interval Dropdown and Counter - Exact same as CampaignModal */}
              {autopilotSettings.autoSchedule && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(0, 255, 204, 0.2)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: '#a0a0cc', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                      Interval:
                    </label>
                    <select
                      value={autopilotSettings.autoScheduleInterval || 60}
                      onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
                      disabled={autopilotLoading}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(0, 255, 204, 0.3)',
                        color: '#00ffcc',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        width: '100%'
                      }}
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={180}>3 hours</option>
                      <option value={240}>4 hours</option>
                      <option value={360}>6 hours</option>
                      <option value={480}>8 hours</option>
                      <option value={720}>12 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: '#00ffcc', fontSize: '16px', fontWeight: 'bold' }}>
                      {autopilotSettings.scheduledPostsCount || 0}
                    </div>
                    <div style={{ color: '#a0a0cc', fontSize: '10px' }}>
                      Posts Scheduled
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ 
                      color: autoScheduleActive ? '#00ffcc' : '#666',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {autoScheduleActive ? '🟢 Active' : '⚪ Standby'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-Reply Option - Exact same as CampaignModal */}
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(255, 142, 83, 0.1)',
              border: '1px solid rgba(255, 142, 83, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <h4 style={{ color: '#ff8e53', margin: '0 0 4px 0', fontSize: '14px' }}>
                    💬 Auto-Reply to DMs/Comments
                  </h4>
                  <p style={{ color: '#a0a0cc', margin: 0, fontSize: '12px' }}>
                    AI responds to messages and comments automatically
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autopilotSettings.autoReply}
                    onChange={handleAutoReplyToggleWithInterval}
                    disabled={autopilotLoading || !autopilotSettings.enabled}
                    style={{
                      transform: 'scale(1.2)',
                      accentColor: '#ff8e53'
                    }}
                  />
                </label>
              </div>
              
              {/* Auto-Reply Counter and Status - Exact same as CampaignModal */}
              {autopilotSettings.autoReply && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255, 142, 83, 0.2)' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: '#ff8e53', fontSize: '16px', fontWeight: 'bold' }}>
                      {autopilotSettings.autoRepliesCount || 0}
                    </div>
                    <div style={{ color: '#a0a0cc', fontSize: '10px' }}>
                      Auto-Replies Sent
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ 
                      color: autoReplyActive ? '#ff8e53' : '#666',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {autoReplyActive ? '🟢 Active' : '⚪ Standby'}
                    </div>
                    <div style={{ color: '#a0a0cc', fontSize: '10px' }}>
                      Status
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inactive State Message - Exact same as CampaignModal */}
        {!autopilotSettings.enabled && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            borderRadius: '8px',
            background: 'rgba(160, 160, 204, 0.05)',
            border: '1px solid rgba(160, 160, 204, 0.2)'
          }}>
            <p style={{ 
              color: '#a0a0cc', 
              margin: 0, 
              fontSize: '14px', 
              fontStyle: 'italic'
            }}>
              {isConnected 
                ? 'Enable autopilot to access automation features'
                : 'Connect your account and enable autopilot for automation'
              }
            </p>
          </div>
        )}

        {/* Footer with Platform Info */}
        <div style={{ 
          textAlign: 'center', 
          padding: '12px 0 0 0',
          marginTop: '20px',
          color: '#666',
          fontSize: '12px',
          borderTop: '1px solid rgba(138, 43, 226, 0.2)'
        }}>
          Platform: {platform} | User: {username}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AutopilotPopup;
