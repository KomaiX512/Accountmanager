import React, { useState, useRef, ReactNode } from 'react';
import ButtonNotification from './ButtonNotification';
import { useInstagram } from '../../context/InstagramContext';

interface InstagramRequiredButtonProps {
  children: ReactNode;
  isConnected?: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  notificationPosition?: 'top' | 'bottom' | 'left' | 'right';
  message?: string;
  bypassConnectionRequirement?: boolean;
}

const InstagramRequiredButton: React.FC<InstagramRequiredButtonProps> = ({
  children,
  isConnected: isConnectedProp,
  onClick,
  className = '',
  disabled = false,
  style = {},
  notificationPosition = 'top',
  message = "Please first connect your Instagram.",
  bypassConnectionRequirement = false
}) => {
  const [showNotification, setShowNotification] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { isConnected: isConnectedContext } = useInstagram();
  const isConnected = isConnectedProp !== undefined ? isConnectedProp : isConnectedContext;

  const handleClick = () => {
    if (isConnected || bypassConnectionRequirement) {
      onClick();
    } else {
      // Show notification
      setShowNotification(true);
      
      // Hide notification after 3 seconds
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setShowNotification(false);
      }, 3000);
    }
  };

  const buttonDisabledStyle: React.CSSProperties = (isConnected || bypassConnectionRequirement) ? {} : {
    opacity: 0.7,
    cursor: 'not-allowed',
    filter: 'grayscale(40%)',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className={className}
        onClick={handleClick}
        disabled={disabled}
        style={{ ...style, ...buttonDisabledStyle }}
      >
        {children}
      </button>
      
      {showNotification && !isConnected && !bypassConnectionRequirement && (
        <ButtonNotification position={notificationPosition} message={message} />
      )}
    </div>
  );
};

export default InstagramRequiredButton; 