import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUsage } from '../../context/UsageContext';
import useAccessControl from '../../hooks/useAccessControl';
import UsageTracker from '../common/UsageTracker';
import PremiumIndicator from '../common/PremiumIndicator';
import AccessControlPopup from '../common/AccessControlPopup';
import { 
  FiEdit3,
  FiMessageCircle,
  FiCpu,
  FiTarget,
  FiLock
} from 'react-icons/fi';
import './UsageDashboard.css';

interface UsageDashboardProps {
  className?: string;
}

const UsageDashboard: React.FC<UsageDashboardProps> = ({ className }) => {
  const { currentUser } = useAuth();
  const { usage, getUserLimits, isFeatureBlocked } = useUsage();
  const { user, checkAccess, refresh } = useAccessControl();
  
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string>('');
  const [blockedFeature, setBlockedFeature] = useState<'posts' | 'discussions' | 'aiReplies' | 'campaigns' | null>(null);

  // Refresh usage data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [refresh]);



  const getUsagePercentage = (used: number, limit: number | 'unlimited') => {
    if (typeof limit !== 'number') return 0;
    return Math.min(100, (used / limit) * 100);
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return '#dc3545';
    if (percentage >= 80) return '#ffc107';
    if (percentage >= 60) return '#fd7e14';
    return '#28a745';
  };

  const userLimits = getUserLimits();
  
  const features = [
    {
      key: 'posts' as const,
      name: 'Posts',
      icon: <FiEdit3 size={24} />,
      used: usage.posts,
      limit: userLimits.posts === -1 ? 'unlimited' : userLimits.posts,
      description: 'Create and schedule posts',
      isPremium: false
    },
    {
      key: 'discussions' as const,
      name: 'Discussions',
      icon: <FiMessageCircle size={24} />,
      used: usage.discussions,
      limit: userLimits.discussions === -1 ? 'unlimited' : userLimits.discussions,
      description: 'Engage in discussions and comments',
      isPremium: false
    },
    {
      key: 'aiReplies' as const,
      name: 'AI Replies',
      icon: <FiCpu size={24} />,
      used: usage.aiReplies,
      limit: userLimits.aiReplies === -1 ? 'unlimited' : userLimits.aiReplies,
      description: 'AI-powered automatic replies',
      isPremium: user?.userType === 'free'
    },
    {
      key: 'campaigns' as const,
      name: 'Campaigns',
      icon: <FiTarget size={24} />,
      used: usage.campaigns,
      limit: userLimits.campaigns === -1 ? 'unlimited' : userLimits.campaigns,
      description: 'Marketing campaigns and automation',
      isPremium: true
    }
  ];

  if (!currentUser || !user) {
    return null;
  }

  return (
    <>
      <div className={`usage-dashboard ${className || ''}`}>
        <div className="usage-header">
          <h2>Usage Overview</h2>
          <div className="usage-tier">
            <span className="tier-label">Current Plan:</span>
            <span className={`tier-value ${user.userType}`}>
              {user.userType.charAt(0).toUpperCase() + user.userType.slice(1)}
            </span>
          </div>
        </div>

        <div className="usage-grid">
          {features.map((feature) => {
            const percentage = getUsagePercentage(feature.used, typeof feature.limit === 'string' ? 'unlimited' : feature.limit);
            const statusColor = getStatusColor(percentage);
            const isBlocked = typeof feature.limit === 'number' && feature.used >= feature.limit;

            return (
              <div 
                key={feature.key} 
                className={`usage-card ${isBlocked ? 'blocked' : ''}`}
                data-feature={feature.key}
              >
                <div className="usage-card-header">
                  <div className="feature-info">
                    <span className="feature-icon">{feature.icon}</span>
                    <div className="feature-details">
                      <h3 className="feature-name">{feature.name}</h3>
                      <p className="feature-description">{feature.description}</p>
                    </div>
                  </div>
                  {feature.isPremium && (
                    <PremiumIndicator 
                      feature={feature.key} 
                      size="small" 
                      position="inline"
                      showLabel={false}
                    />
                  )}
                </div>

                <div className="usage-stats">
                  <div className="usage-numbers">
                    <span className="usage-current">{feature.used}</span>
                    <span className="usage-separator">/</span>
                    <span className="usage-limit">
                      {typeof feature.limit === 'number' ? feature.limit : '∞'}
                    </span>
                  </div>
                  {typeof feature.limit === 'number' && (
                    <span className="usage-percentage">
                      {percentage.toFixed(0)}%
                    </span>
                  )}
                </div>

                {typeof feature.limit === 'number' && (
                  <div className="usage-progress">
                    <div 
                      className="usage-progress-bar"
                      style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                    >
                      <div 
                        className="usage-progress-fill"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: statusColor,
                          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      />
                    </div>
                  </div>
                )}

                {isBlocked && (
                  <div className="usage-blocked">
                    <span className="blocked-icon"><FiLock size={16} /></span>
                    <span className="blocked-text">Limit Reached</span>
                    <button 
                      className="btn-upgrade-card"
                      onClick={() => {
                        setBlockedFeature(feature.key);
                        setUpgradeReason(`You've reached your ${feature.name} limit`);
                        setShowUpgradePopup(true);
                      }}
                    >
                      Upgrade
                    </button>
                  </div>
                )}


              </div>
            );
          })}
        </div>

        <div className="usage-footer">
          <div className="usage-summary">
            <p>
              You're on the <strong>{user.userType}</strong> plan. 
              {user.userType === 'free' && (
                <span> Upgrade to Premium for unlimited access to all features.</span>
              )}
            </p>
          </div>
          
          {user.userType === 'free' && (
            <button 
              className="btn-upgrade-main"
              onClick={() => {
                setUpgradeReason('Upgrade to Premium for unlimited access');
                setShowUpgradePopup(true);
              }}
            >
              Upgrade to Premium
            </button>
          )}
        </div>
      </div>

      {/* Upgrade Popup */}
      <AccessControlPopup
        isOpen={showUpgradePopup}
        onClose={() => setShowUpgradePopup(false)}
        feature={blockedFeature || 'posts'}
        reason={upgradeReason}
        limitReached={true}
        upgradeRequired={true}
        redirectToPricing={true}
        currentUsage={{
          used: blockedFeature ? usage[blockedFeature] : 0,
          limit: blockedFeature ? (userLimits[blockedFeature] === -1 ? 'unlimited' : userLimits[blockedFeature]) : 0
        }}
      />
    </>
  );
};

export default UsageDashboard; 