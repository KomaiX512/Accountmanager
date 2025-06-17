import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import useFeatureTracking from '../../hooks/useFeatureTracking';

interface GoalModalProps {
  username: string;
  platform?: string; // Make platform optional with default to Instagram
  onClose: () => void;
  onSuccess?: () => void; // Add success callback
}

interface GoalForm {
  persona: string;
  timeline: string;
  goal: string;
  instruction: string;
}

interface CampaignStatus {
  hasActiveCampaign: boolean;
  platform: string;
  username: string;
  goalFiles?: number;
}

interface PlatformSpecificStatus {
  [key: string]: CampaignStatus;
}

// Platform-isolated Goal Modal - ensures each platform has independent campaign states
const GoalModal: React.FC<GoalModalProps> = ({ username, platform = 'Instagram', onClose, onSuccess }) => {
  const { trackRealCampaign, canUseFeature } = useFeatureTracking();
  const [form, setForm] = useState<GoalForm>({ persona: '', timeline: '', goal: '', instruction: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCampaignButton, setShowCampaignButton] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  useEffect(() => {
    checkCampaignStatus();
  }, [username, platform]);

  const checkCampaignStatus = async () => {
    setIsCheckingStatus(true);
    try {
      console.log(`[GoalModal] Checking campaign status for ${username} on ${platform}`);
      const response = await axios.get(`http://localhost:3000/campaign-status/${username}?platform=${platform.toLowerCase()}`);
      const statusData = response.data;
      
      console.log(`[GoalModal] Backend response:`, statusData);
      
      // Ensure platform isolation - only consider status for the current platform
      const platformSpecificStatus = {
        hasActiveCampaign: statusData.hasActiveCampaign && statusData.platform === platform.toLowerCase(),
        platform: platform.toLowerCase(),
        username,
        goalFiles: statusData.goalFiles
      };
      
      console.log(`[GoalModal] Platform-specific status:`, platformSpecificStatus);
      
      setCampaignStatus(platformSpecificStatus);
      
      if (platformSpecificStatus.hasActiveCampaign) {
        setShowCampaignButton(true);
      }
    } catch (err: any) {
      console.error(`Error checking campaign status for ${platform}:`, err);
      // If there's an error checking status, assume no active campaign for this platform
      setCampaignStatus({ 
        hasActiveCampaign: false, 
        platform: platform.toLowerCase(), 
        username,
        goalFiles: 0 
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'timeline' && value && !/^\d*$/.test(value)) return; // Only allow numbers
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Platform-specific validation - only check campaign status for current platform
  const isCurrentPlatformBlocked = campaignStatus?.hasActiveCampaign && 
    campaignStatus?.platform === platform.toLowerCase();

  const canSubmit =
    !!form.timeline &&
    !!form.goal.trim() &&
    !!form.instruction.trim() &&
    /^\d+$/.test(form.timeline) &&
    !isCurrentPlatformBlocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    
    // ✅ PRE-ACTION CHECK: Verify campaign limits before proceeding
    const campaignAccessCheck = canUseFeature('campaigns');
    if (!campaignAccessCheck.allowed) {
      setError(campaignAccessCheck.reason || 'Campaigns feature is not available');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    try {
      await axios.post(`http://localhost:3000/save-goal/${username}?platform=${platform.toLowerCase()}`, {
        persona: form.persona,
        timeline: Number(form.timeline),
        goal: form.goal,
        instruction: form.instruction,
      });
      
      // ✅ REAL USAGE TRACKING: Check limits BEFORE setting campaign goal
      const trackingSuccess = await trackRealCampaign(platform.toLowerCase(), {
        action: 'goal_set'
      });
      
      if (!trackingSuccess) {
        console.warn(`[GoalModal] 🚫 Campaign goal blocked for ${platform} - limit reached`);
        setError('Campaign limit reached - upgrade to continue');
        setIsSubmitting(false);
        return;
      }
      
      console.log(`[GoalModal] ✅ Campaign goal tracked: ${platform} goal submission`);
      
      setSuccess(true);
      // Show campaign button after successful submission
      setTimeout(() => {
        setSuccess(false);
        setShowCampaignButton(true);
        setCampaignStatus({ hasActiveCampaign: true, platform: platform.toLowerCase(), username });
      }, 1200);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Campaign already active for this specific platform
        setError(`You already have an active ${platform} campaign. Please stop the current ${platform} campaign before starting a new one.`);
        setCampaignStatus({ 
          hasActiveCampaign: true, 
          platform: platform.toLowerCase(), 
          username,
          goalFiles: campaignStatus?.goalFiles || 0
        });
        setShowCampaignButton(true);
      } else {
        setError(err.response?.data?.error || 'Failed to save goal.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCampaignClick = () => {
    // Close this modal and trigger campaign modal
    onClose();
    // The parent component should handle opening the campaign modal
    // We'll pass this information through an event or callback
    window.dispatchEvent(new CustomEvent('openCampaignModal', { detail: { username, platform } }));
  };

  if (isCheckingStatus) {
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
          style={{ maxWidth: 500, width: '100%' }}
        >
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 20px' }}></div>
            <p style={{ color: '#a0a0cc' }}>Checking campaign status...</p>
          </div>
        </motion.div>
      </motion.div>
    );
  }

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
        style={{ maxWidth: 500, width: '100%' }}
      >
        <h2 style={{ color: '#00ffcc', textAlign: 'center', marginBottom: 10 }}>Set Your Goal</h2>
        
        {/* Debug Platform Info */}
        <div style={{ 
          textAlign: 'center', 
          padding: '8px',
          color: '#666',
          fontSize: '11px',
          borderBottom: '1px solid #333',
          marginBottom: '16px'
        }}>
          Platform: {platform} | Status: {campaignStatus?.hasActiveCampaign ? 'Campaign Active' : 'No Campaign'} | Backend Platform: {campaignStatus?.platform}
        </div>
        
        {/* Platform-Specific Campaign Status Warning */}
        {isCurrentPlatformBlocked && (
          <div style={{
            background: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            <p style={{ 
              color: '#ffc107', 
              margin: 0, 
              fontSize: '14px',
              fontWeight: '500'
            }}>
              ⚠️ Stop the {platform} campaign to enable the Goal Button.
            </p>
          </div>
        )}
        
        {!showCampaignButton ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Persona <span style={{ color: '#a0a0cc', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                name="persona"
                value={form.persona}
                onChange={handleChange}
                className="form-input"
                placeholder="Whom should I mimic? (e.g. as Account holder)"
                disabled={isCurrentPlatformBlocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Timeline <span style={{ color: '#ff4444' }}>*</span></label>
              <input
                type="text"
                name="timeline"
                value={form.timeline}
                onChange={handleChange}
                className="form-input"
                placeholder="Days to accomplish (number only)"
                required
                disabled={isCurrentPlatformBlocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Goal <span style={{ color: '#ff4444' }}>*</span></label>
              <textarea
                name="goal"
                value={form.goal}
                onChange={handleChange}
                className="form-input"
                rows={3}
                placeholder="What do you want to achieve? (e.g. engagement, reach, followers, etc.)"
                required
                disabled={isCurrentPlatformBlocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Instruction <span style={{ color: '#ff4444' }}>*</span></label>
              <textarea
                name="instruction"
                value={form.instruction}
                onChange={handleChange}
                className="form-input"
                rows={3}
                placeholder="What should be the theme? What should be avoided?"
                required
                disabled={isCurrentPlatformBlocked}
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            {success && <div style={{ color: '#00ffcc', textAlign: 'center', margin: '10px 0' }}>Goal saved!</div>}
            <div className="form-actions">
              <button
                type="button"
                onClick={onClose}
                className="insta-btn disconnect"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`insta-btn connect${!canSubmit || isSubmitting ? ' disabled' : ''}`}
                disabled={!canSubmit || isSubmitting}
                style={isCurrentPlatformBlocked ? { 
                  opacity: 0.5, 
                  cursor: 'not-allowed',
                  background: '#666' 
                } : {}}
              >
                {isSubmitting ? 'Saving...' : isCurrentPlatformBlocked ? `${platform} Campaign Active` : 'Save Goal'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ color: '#00ffcc', marginBottom: '20px', fontSize: '16px' }}>
              Goal saved successfully! Your campaign is being prepared.
            </div>
            <button
              onClick={handleCampaignClick}
              className="insta-btn connect"
              style={{
                background: 'linear-gradient(90deg, #ff6b6b, #ff8e53)',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              View Campaign Progress
            </button>
            <button
              onClick={onClose}
              className="insta-btn disconnect"
              style={{ marginLeft: '10px' }}
            >
              Close
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default GoalModal; 