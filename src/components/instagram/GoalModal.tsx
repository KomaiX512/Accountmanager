import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import useFeatureTracking from '../../hooks/useFeatureTracking';
import { useAccessControl } from '../../hooks/useAccessControl';
import { useUpgradePopup } from '../../context/UpgradePopupContext';

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


// Platform-isolated Goal Modal - ensures each platform has independent campaign states
const GoalModal: React.FC<GoalModalProps> = ({ username, platform, onClose, onSuccess }) => {
  const { trackRealCampaign, canUseFeature } = useFeatureTracking();
  const { isPremium } = useAccessControl();
  const { showUpgradePopup } = useUpgradePopup();
  const [form, setForm] = useState<GoalForm>({ persona: '', timeline: '', goal: '', instruction: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCampaignButton, setShowCampaignButton] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null);
  const normalizedPlatform = (platform || 'instagram').toLowerCase();
  const displayPlatform = normalizedPlatform === 'instagram' ? 'Instagram' :
                         normalizedPlatform === 'twitter' ? 'Twitter' :
                         normalizedPlatform === 'facebook' ? 'Facebook' :
                         normalizedPlatform === 'linkedin' ? 'LinkedIn' :
                         'Instagram';

  const MAX_TRIAL_DAYS = 3; // Non-premium cap

  const goalSuggestions: string[] = [
    'Run a brand awareness campaign tailored to my audience',
    'Branding campaign to strengthen recognition and recall',
    'Engage my audience with informative, value-rich posts',
    'Share daily industry news with short, useful insights',
    'Grow community affinity using light, human, relatable content'
  ];

  const instructionSuggestions: string[] = [
    'Be informative and genuinely helpful',
    'Keep tone respectful and on-brand',
    'Add light humor when appropriate (never offensive)',
    'Align with the visual and voice of my previous posts',
    'Avoid controversial or polarizing topics'
  ];

  useEffect(() => {
    checkCampaignStatus();
  }, [username, normalizedPlatform]);

  // Refresh campaign status once when the modal mounts
  useEffect(() => {
    console.log(`[GoalModal] Modal opened - refreshing campaign status for ${username} on ${platform}`);
    checkCampaignStatus();
  }, []);

  // Listen for campaign stopped events
  useEffect(() => {
    const handleCampaignStoppedEvent = (event: any) => {
      const { username: stoppedUsername, platform: stoppedPlatform } = event.detail;
      console.log(`[GoalModal] Campaign stopped event received: ${stoppedUsername}/${String(stoppedPlatform).toLowerCase()} vs current ${username}/${normalizedPlatform}`);
      
      if (stoppedUsername === username && String(stoppedPlatform).toLowerCase() === normalizedPlatform) {
        console.log(`[GoalModal] Campaign stopped event matched: Updating UI state`);
        setCampaignStatus({
          hasActiveCampaign: false,
          platform: normalizedPlatform,
          username,
          goalFiles: 0
        });
        setShowCampaignButton(false);
        
        // Force a refresh from the server to ensure we have the latest status
        setTimeout(() => {
          checkCampaignStatus();
        }, 500);
      }
    };

    window.addEventListener('campaignStopped', handleCampaignStoppedEvent);
    
    return () => {
      window.removeEventListener('campaignStopped', handleCampaignStoppedEvent);
    };
  }, [username, normalizedPlatform]);

  const checkCampaignStatus = async () => {
    // ✅ BACKGROUND VALIDATION - Start validation but don't block UI
    try {
      console.log(`[GoalModal] Checking campaign status for ${username} on ${normalizedPlatform}`);
      // Add bypass_cache=true to ensure we get fresh data from the server
      const response = await axios.get(`/api/campaign-status/${username}?platform=${normalizedPlatform}&bypass_cache=true`);
      const statusData = response.data;
      
      console.log(`[GoalModal] Backend response:`, statusData);
      
      // Ensure platform isolation - only consider status for the current platform
      const platformSpecificStatus = {
        hasActiveCampaign: statusData.hasActiveCampaign && statusData.platform === normalizedPlatform,
        platform: normalizedPlatform,
        username,
        goalFiles: statusData.goalFiles
      };
      
      console.log(`[GoalModal] Platform-specific status:`, platformSpecificStatus);
      console.log(`[GoalModal] Has active campaign: ${platformSpecificStatus.hasActiveCampaign}`);
      
      // Update UI state based on campaign status
      setCampaignStatus(platformSpecificStatus);
      setShowCampaignButton(platformSpecificStatus.hasActiveCampaign);
      
      // Clear any cached form data if campaign is active
      if (platformSpecificStatus.hasActiveCampaign) {
        console.log(`[GoalModal] Active campaign detected - showing campaign button`);
        setShowCampaignButton(true);
      } else {
        console.log(`[GoalModal] No active campaign detected - hiding campaign button`);
        setShowCampaignButton(false);
      }
    } catch (err: any) {
      console.error(`[GoalModal] Error checking campaign status for ${normalizedPlatform}:`, err);
      // If there's an error checking status, assume no active campaign for this platform
      setCampaignStatus({ 
        hasActiveCampaign: false, 
        platform: normalizedPlatform, 
        username,
        goalFiles: 0 
      });
      setShowCampaignButton(false);
    } finally {
      // Status checking complete
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'timeline' && value && !/^\d*$/.test(value)) return; // Only allow numbers
    // Enforce 3-day cap for non-premium users
    if (name === 'timeline') {
      const numeric = value ? parseInt(value, 10) : NaN;
      if (!isPremium && !Number.isNaN(numeric) && numeric > MAX_TRIAL_DAYS) {
        // Show upgrade popup and keep within cap
        try {
          showUpgradePopup('campaigns', numeric, MAX_TRIAL_DAYS);
        } catch {}
        setForm((prev) => ({ ...prev, [name]: String(MAX_TRIAL_DAYS) }));
        return;
      }
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Platform-specific validation - only check campaign status for current platform
  const isCurrentPlatformBlocked = campaignStatus?.hasActiveCampaign && 
    campaignStatus?.platform === normalizedPlatform;

  const canSubmit =
    !!form.timeline &&
    !!form.goal.trim() &&
    !!form.instruction.trim() &&
    /^\d+$/.test(form.timeline) &&
    // Restrict non-premium users to 3 days max
    (isPremium || (!isPremium && Number(form.timeline) <= MAX_TRIAL_DAYS)) &&
    !isCurrentPlatformBlocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard timeline for non-premium users
    if (!isPremium && Number(form.timeline) > MAX_TRIAL_DAYS) {
      try {
        showUpgradePopup('campaigns', Number(form.timeline), MAX_TRIAL_DAYS);
      } catch {}
      setError(`Trial limit is ${MAX_TRIAL_DAYS} days. Please upgrade to set longer timelines.`);
      return;
    }
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
      console.log(`[GoalModal] 🚀 Saving goal for ${username} on ${normalizedPlatform}:`, {
        persona: form.persona,
        timeline: Number(form.timeline),
        goal: form.goal,
        instruction: form.instruction,
      });
      
      // First, save the goal to the server
      const response = await axios.post(`/api/save-goal/${username}?platform=${normalizedPlatform}`, {
        persona: form.persona,
        timeline: Number(form.timeline),
        goal: form.goal,
        instruction: form.instruction,
      });
      
      console.log(`[GoalModal] ✅ Goal saved successfully:`, response.data);
      
      // ✅ TRACKING: Try to track usage but don't block success if it fails
      try {
        const trackingSuccess = await trackRealCampaign(normalizedPlatform, {
          action: 'goal_set'
        });
        
        if (trackingSuccess) {
          console.log(`[GoalModal] ✅ Campaign goal tracked successfully for ${normalizedPlatform}`);
        } else {
          console.warn(`[GoalModal] ⚠️ Campaign tracking failed but goal was saved`);
        }
      } catch (trackingError) {
        console.warn(`[GoalModal] ⚠️ Campaign tracking error (non-blocking):`, trackingError);
        // Don't block success - tracking is secondary to goal saving
      }
      
      // Goal saved successfully - show success state
      setSuccess(true);
      
      // Show campaign button after successful submission
      setTimeout(() => {
        setSuccess(false);
        setShowCampaignButton(true);
        setCampaignStatus({ hasActiveCampaign: true, platform: normalizedPlatform, username });
      }, 1200);
      
      if (onSuccess) {
        onSuccess();
      }
      
    } catch (err: any) {
      console.error(`[GoalModal] ❌ Error saving goal:`, err);
      
      if (err.response?.status === 409) {
        // Campaign already active for this specific platform
        setError(`You already have an active ${displayPlatform} campaign. Please stop the current ${displayPlatform} campaign before starting a new one.`);
        setCampaignStatus({ 
          hasActiveCampaign: true, 
          platform: normalizedPlatform, 
          username,
          goalFiles: campaignStatus?.goalFiles || 0
        });
        setShowCampaignButton(true);
      } else if (err.response?.status === 404) {
        setError(`Server endpoint not found. Please check if the server is running.`);
      } else if (err.response?.status >= 500) {
        setError(`Server error (${err.response.status}). Please try again later.`);
      } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('Network Error')) {
        setError(`Network error. Please check your connection and try again.`);
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to save goal. Please try again.');
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
    console.log(`[GoalModal] Dispatching openCampaignModal event: username=${username}, platform=${normalizedPlatform}`);
    window.dispatchEvent(new CustomEvent('openCampaignModal', { detail: { username, platform: normalizedPlatform } }));
  };

  // ✅ NO LOADING SCREEN - Show content immediately while validating in background
  // Campaign status validation happens seamlessly without blocking the user interface

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
          Platform: {displayPlatform} | Status: {campaignStatus?.hasActiveCampaign ? 'Campaign Active' : 'No Campaign'} | Backend Platform: {campaignStatus?.platform}
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
              ⚠️ Stop the {displayPlatform} campaign to enable the Goal Button.
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
                placeholder="Whose voice to emulate? (e.g., account holder, brand manager)"
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
                placeholder={`Days to run (number only${isPremium ? '' : `, max ${MAX_TRIAL_DAYS} on trial`})`}
                required
                disabled={isCurrentPlatformBlocked}
              />
              {!isPremium && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: '#a0a0cc',
                  borderLeft: '2px solid #555',
                  paddingLeft: 8
                }}>
                  Trial users can run up to {MAX_TRIAL_DAYS} days. Upgrade for longer timelines.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Goal <span style={{ color: '#ff4444' }}>*</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {goalSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, goal: s }))}
                    style={{
                      background: '#1e1e1e',
                      color: '#ccc',
                      border: '1px solid #333',
                      borderRadius: 14,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                name="goal"
                value={form.goal}
                onChange={handleChange}
                className="form-input"
                rows={3}
                placeholder="Choose or describe the goal: awareness, branding, engaging audience, daily news, product push..."
                required
                disabled={isCurrentPlatformBlocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Instruction <span style={{ color: '#ff4444' }}>*</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {instructionSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, instruction: prev.instruction ? `${prev.instruction}\n- ${s}` : `- ${s}` }))}
                    style={{
                      background: '#1e1e1e',
                      color: '#ccc',
                      border: '1px solid #333',
                      borderRadius: 14,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                name="instruction"
                value={form.instruction}
                onChange={handleChange}
                className="form-input"
                rows={3}
                placeholder="Guidance: tone, do/don'ts (e.g., be informative, light humor, respectful, align with my past posts, avoid controversies)"
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
                {isSubmitting ? 'Saving...' : isCurrentPlatformBlocked ? `${displayPlatform} Campaign Active` : 'Save Goal'}
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