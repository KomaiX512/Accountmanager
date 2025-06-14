import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserService from '../../services/UserService';
import PremiumIndicator from './PremiumIndicator';
import './AccessControlPopup.css';

interface AccessControlPopupProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  reason?: string;
  limitReached?: boolean;
  upgradeRequired?: boolean;
  redirectToPricing?: boolean;
  currentUsage?: {
    used: number;
    limit: number | 'unlimited';
  };
}

const AccessControlPopup: React.FC<AccessControlPopupProps> = ({
  isOpen,
  onClose,
  feature,
  reason,
  limitReached = false,
  upgradeRequired = false,
  redirectToPricing = false,
  currentUsage
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const getFeatureDisplayName = () => {
    switch (feature) {
      case 'posts':
        return 'Instant Posts';
      case 'discussions':
        return 'AI Discussions';
      case 'aiReplies':
        return 'AI Replies';
      case 'campaigns':
        return 'Goal Model Campaigns';
      case 'autoSchedule':
        return 'Auto Schedule';
      case 'autoReply':
        return 'Auto Reply with AI';
      case 'goalModel':
        return 'Goal Model';
      default:
        return feature;
    }
  };

  const getFeatureIcon = () => {
    switch (feature) {
      case 'posts':
        return '📝';
      case 'discussions':
        return '💬';
      case 'aiReplies':
        return '🤖';
      case 'campaigns':
        return '🎯';
      case 'autoSchedule':
        return '⏰';
      case 'autoReply':
        return '🔄';
      case 'goalModel':
        return '🎯';
      default:
        return '⭐';
    }
  };

  const getUpgradeMessage = () => {
    if (limitReached) {
      return `You've reached your ${getFeatureDisplayName()} limit for this month.`;
    }
    if (upgradeRequired) {
      return `${getFeatureDisplayName()} is a Premium feature.`;
    }
    return reason || `Access to ${getFeatureDisplayName()} is restricted.`;
  };

  const handleUpgrade = async () => {
    if (redirectToPricing) {
      navigate('/pricing');
      onClose();
    } else {
      // Quick upgrade flow
      setIsProcessing(true);
      try {
        // For demo purposes, simulate upgrade to premium
        if (currentUser?.uid) {
          const result = await UserService.processPayment(currentUser.uid, 'premium');
          if (result.success) {
            onClose();
            window.location.reload(); // Refresh to update user data
          } else {
            alert(result.message);
          }
        }
      } catch (error) {
        console.error('Upgrade error:', error);
        alert('Upgrade failed. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleViewPricing = () => {
    navigate('/pricing');
    onClose();
  };

  return (
    <div className="access-control-overlay" onClick={onClose}>
      <div className="access-control-popup" onClick={(e) => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>
          ✕
        </button>

        <div className="popup-header">
          <div className="feature-icon">{getFeatureIcon()}</div>
          <h3>{getFeatureDisplayName()}</h3>
          <PremiumIndicator 
            feature={feature as any} 
            size="small" 
            position="inline"
            showLabel={false}
          />
        </div>

        <div className="popup-content">
          <div className="upgrade-message">
            <p>{getUpgradeMessage()}</p>
          </div>

          {currentUsage && (
            <div className="usage-info">
              <div className="usage-bar-container">
                <div className="usage-label">
                  Current Usage: {currentUsage.used}
                  {typeof currentUsage.limit === 'number' ? ` / ${currentUsage.limit}` : ' (Unlimited)'}
                </div>
                {typeof currentUsage.limit === 'number' && (
                  <div className="usage-bar">
                    <div 
                      className="usage-fill"
                      style={{ 
                        width: `${Math.min(100, (currentUsage.used / currentUsage.limit) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="premium-benefits">
            <h4>🌟 Premium Benefits</h4>
            <ul>
              <li>✅ Unlimited AI-powered features</li>
              <li>✅ Auto Schedule & Auto Reply</li>
              <li>✅ Advanced Analytics & Insights</li>
              <li>✅ Priority Support</li>
              <li>✅ Goal Model Campaigns</li>
            </ul>
          </div>
        </div>

        <div className="popup-actions">
          <button 
            className="btn-secondary" 
            onClick={handleViewPricing}
            disabled={isProcessing}
          >
            View All Plans
          </button>
          <button 
            className="btn-primary" 
            onClick={handleUpgrade}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              'Upgrade to Premium'
            )}
          </button>
        </div>

        <div className="popup-footer">
          <p>💰 30-day money-back guarantee</p>
        </div>
      </div>
    </div>
  );
};

export default AccessControlPopup; 