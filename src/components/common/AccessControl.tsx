import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import UserService from '../../services/UserService';
import { AccessControlResult } from '../../types/user';
import './AccessControl.css';

interface AccessControlProps {
  feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'autoSchedule' | 'autoReply' | 'goalModel';
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onAccessDenied?: () => void;
  inlineTooltip?: boolean;
}

const AccessControl: React.FC<AccessControlProps> = ({ 
  feature, 
  children, 
  fallback,
  onAccessDenied,
  inlineTooltip = false
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [accessResult, setAccessResult] = useState<AccessControlResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      if (!currentUser?.uid) {
        setAccessResult({ 
          allowed: false, 
          reason: 'Please log in to access this feature',
          upgradeRequired: false 
        });
        setLoading(false);
        return;
      }

      try {
        const result = await UserService.checkAccess(currentUser.uid, feature);
        setAccessResult(result);
        
        if (!result.allowed && onAccessDenied) {
          onAccessDenied();
        }
      } catch (error) {
        console.error('[AccessControl] Error checking access:', error);
        // Default to allowing access if there's an error
        setAccessResult({ allowed: true });
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [currentUser, feature, onAccessDenied]);

  const handleUpgradeClick = () => {
    setShowUpgradeModal(false);
    navigate('/pricing');
  };

  const handleTryClick = () => {
    if (accessResult?.redirectToPricing) {
      navigate('/pricing');
    } else {
      setShowUpgradeModal(true);
    }
  };

  const handleInlineUpgrade = () => {
    setShowTooltip(false);
    navigate('/pricing');
  };

  if (loading) {
    return (
      <div className="access-control-loading">
        <div className="access-spinner"></div>
      </div>
    );
  }

  if (!accessResult?.allowed) {
    if (inlineTooltip) {
      return (
        <div className="access-control-inline">
          <div 
            className="access-control-wrapper"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip(!showTooltip)}
          >
            <div className="disabled-overlay">
              {children}
            </div>
            {showTooltip && (
              <div className="access-tooltip">
                <div className="tooltip-content">
                  <div className="tooltip-icon">🔒</div>
                  <p>Premium Feature Required</p>
                  <button 
                    className="tooltip-upgrade-btn"
                    onClick={handleInlineUpgrade}
                  >
                    Upgrade to Premium
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <>
        {fallback || (
          <div className="access-denied-container">
            <div className="access-denied-content">
              <div className="access-denied-icon">🔒</div>
              <h3>Feature Locked</h3>
              <p>{accessResult?.reason || 'You need to upgrade to access this feature'}</p>
              
              {accessResult?.limitReached && (
                <div className="limit-info">
                  <span className="limit-badge">Limit Reached</span>
                  <p>You've reached your monthly limit for this feature.</p>
                </div>
              )}

              <div className="access-denied-actions">
                <button 
                  className="btn-upgrade-primary"
                  onClick={handleTryClick}
                >
                  {accessResult?.redirectToPricing ? 'View Pricing' : 'Upgrade Now'}
                </button>
                <button 
                  className="btn-upgrade-secondary"
                  onClick={() => navigate(-1)}
                >
                  Go Back
                </button>
              </div>

              <div className="upgrade-benefits">
                <h4>Unlock with Premium:</h4>
                <ul>
                  {feature === 'posts' && (
                    <>
                      <li>✓ 160 instant posts per month</li>
                      <li>✓ Advanced scheduling</li>
                      <li>✓ Analytics & insights</li>
                    </>
                  )}
                  {feature === 'discussions' && (
                    <>
                      <li>✓ 200 AI discussions per month</li>
                      <li>✓ Advanced conversation tracking</li>
                      <li>✓ Context-aware responses</li>
                    </>
                  )}
                  {feature === 'aiReplies' && (
                    <>
                      <li>✓ Unlimited AI replies</li>
                      <li>✓ Smart auto-responses</li>
                      <li>✓ Custom reply templates</li>
                    </>
                  )}
                  {feature === 'campaigns' && (
                    <>
                      <li>✓ 10 goal model campaigns</li>
                      <li>✓ Advanced targeting</li>
                      <li>✓ Performance analytics</li>
                    </>
                  )}
                  {(feature === 'autoSchedule' || feature === 'autoReply') && (
                    <>
                      <li>✓ Full automation features</li>
                      <li>✓ Smart scheduling</li>
                      <li>✓ 24/7 automated responses</li>
                    </>
                  )}
                  {feature === 'goalModel' && (
                    <>
                      <li>✓ Unlimited goal campaigns</li>
                      <li>✓ Advanced AI-driven goals</li>
                      <li>✓ Comprehensive analytics</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {showUpgradeModal && (
          <div className="upgrade-modal-overlay" onClick={() => setShowUpgradeModal(false)}>
            <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
              <button 
                className="modal-close"
                onClick={() => setShowUpgradeModal(false)}
              >
                ×
              </button>
              
              <div className="modal-header">
                <div className="modal-icon">⚡</div>
                <h2>Upgrade to Premium</h2>
                <p>Unlock unlimited access to all features</p>
              </div>

              <div className="modal-features">
                <div className="feature-item">
                  <span className="feature-check">✓</span>
                  <span>160 Instant Posts</span>
                </div>
                <div className="feature-item">
                  <span className="feature-check">✓</span>
                  <span>200 AI Discussions</span>
                </div>
                <div className="feature-item">
                  <span className="feature-check">✓</span>
                  <span>Unlimited AI Replies</span>
                </div>
                <div className="feature-item">
                  <span className="feature-check">✓</span>
                  <span>Auto Schedule & Reply</span>
                </div>
                <div className="feature-item">
                  <span className="feature-check">✓</span>
                  <span>10 Goal Model Campaigns</span>
                </div>
              </div>

              <div className="modal-pricing">
                <div className="price-highlight">
                  <span className="price">$29</span>
                  <span className="period">/month</span>
                </div>
                <p className="price-note">Cancel anytime • 30-day money-back guarantee</p>
              </div>

              <div className="modal-actions">
                <button 
                  className="btn-modal-upgrade"
                  onClick={handleUpgradeClick}
                >
                  View All Plans
                </button>
                <button 
                  className="btn-modal-cancel"
                  onClick={() => setShowUpgradeModal(false)}
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};

export default AccessControl; 