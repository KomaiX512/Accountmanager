import React from 'react';
import './PremiumIndicator.css';

interface PremiumIndicatorProps {
  feature?: string;
  size?: 'small' | 'medium' | 'large';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';
  showLabel?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const PremiumIndicator: React.FC<PremiumIndicatorProps> = ({
  feature,
  size = 'medium',
  position = 'top-right',
  showLabel = true,
  className = '',
  onClick,
  disabled = false
}) => {
  const getFeatureIcon = () => {
    switch (feature) {
      case 'autoSchedule':
        return '⏰';
      case 'autoReply':
        return '🤖';
      case 'goalModel':
        return '🎯';
      case 'unlimited':
        return '♾️';
      case 'analytics':
        return '📊';
      case 'priority':
        return '⚡';
      default:
        return '⭐';
    }
  };

  const getFeatureLabel = () => {
    switch (feature) {
      case 'autoSchedule':
        return 'Auto Schedule';
      case 'autoReply':
        return 'Auto Reply';
      case 'goalModel':
        return 'Goal Model';
      case 'unlimited':
        return 'Unlimited';
      case 'analytics':
        return 'Analytics';
      case 'priority':
        return 'Priority';
      default:
        return 'Premium';
    }
  };

  return (
    <div 
      className={`premium-indicator ${size} ${position} ${disabled ? 'disabled' : ''} ${className}`}
      onClick={onClick && !disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
    >
      <div className="premium-icon">
        {getFeatureIcon()}
      </div>
      {showLabel && (
        <span className="premium-label">
          {getFeatureLabel()}
        </span>
      )}
      <div className="premium-glow"></div>
    </div>
  );
};

export default PremiumIndicator; 