import React from 'react';
import { motion } from 'framer-motion';

interface ButtonNotificationProps {
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const ButtonNotification: React.FC<ButtonNotificationProps> = ({ 
  message = "Please first connect your Instagram.",
  position = 'top'
}) => {
  const getPositionStyles = () => {
    switch(position) {
      case 'bottom':
        return { bottom: '-40px', left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { left: '-120px', top: '50%', transform: 'translateY(-50%)' };
      case 'right':
        return { right: '-120px', top: '50%', transform: 'translateY(-50%)' };
      case 'top':
      default:
        return { top: '-40px', left: '50%', transform: 'translateX(-50%)' };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: position === 'top' ? -5 : position === 'bottom' ? 5 : 0, x: position === 'left' ? -5 : position === 'right' ? 5 : 0 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'absolute',
        backgroundColor: 'rgba(24, 24, 36, 0.95)',
        color: '#ff2e63',
        padding: '6px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        zIndex: 1000,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
        border: '1px solid #ff2e63',
        ...getPositionStyles()
      }}
    >
      {message}
    </motion.div>
  );
};

export default ButtonNotification; 