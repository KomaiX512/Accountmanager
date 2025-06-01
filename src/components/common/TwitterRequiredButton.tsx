import React, { useState } from 'react';
import { useTwitter } from '../../context/TwitterContext';

interface TwitterRequiredButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  isConnected?: boolean;
  notificationPosition?: 'top' | 'bottom' | 'left' | 'right';
  bypassConnectionRequirement?: boolean;
}

const TwitterRequiredButton: React.FC<TwitterRequiredButtonProps> = ({ 
  children, 
  onClick, 
  className = '',
  style = {},
  disabled = false,
  isConnected: propIsConnected,
  notificationPosition = 'top',
  bypassConnectionRequirement = false
}) => {
  const { isConnected: contextIsConnected } = useTwitter();
  const [showNotification, setShowNotification] = useState(false);
  
  // Use prop if provided, otherwise use context
  const isConnected = propIsConnected !== undefined ? propIsConnected : contextIsConnected;
  
  const handleClick = () => {
    if (!isConnected && !bypassConnectionRequirement) {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      return;
    }
    
    if (onClick && !disabled) {
      onClick();
    }
  };

  const getNotificationStyle = () => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      background: '#000000',
      color: '#ffffff',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      zIndex: 1000,
      border: '1px solid #333333',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    };

    switch (notificationPosition) {
      case 'top':
        return { ...baseStyle, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '5px' };
      case 'bottom':
        return { ...baseStyle, top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '5px' };
      case 'left':
        return { ...baseStyle, right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '5px' };
      case 'right':
        return { ...baseStyle, left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '5px' };
      default:
        return { ...baseStyle, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '5px' };
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        onClick={handleClick}
        className={className}
        style={{
          ...style,
          cursor: (isConnected || bypassConnectionRequirement) && !disabled ? 'pointer' : 'not-allowed',
          opacity: (isConnected || bypassConnectionRequirement) && !disabled ? 1 : 0.6
        }}
        disabled={disabled}
      >
        {children}
      </button>
      
      {showNotification && !bypassConnectionRequirement && (
        <div style={getNotificationStyle()}>
          Connect X (Twitter) first!
        </div>
      )}
    </div>
  );
};

export default TwitterRequiredButton; 