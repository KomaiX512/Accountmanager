import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './QuotaStatusToast.css';

interface QuotaStatusToastProps {
  quotaInfo?: {
    exhausted: boolean;
    resetTime?: string;
    message: string;
  } | null;
  usingFallbackProfile?: boolean;
  platform?: string;
  onClose?: () => void;
}

const QuotaStatusToast: React.FC<QuotaStatusToastProps> = ({
  quotaInfo,
  usingFallbackProfile,
  platform = 'instagram',
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';

  useEffect(() => {
    // Show toast if we have quota info or using fallback profile
    if (quotaInfo || usingFallbackProfile) {
      setIsVisible(true);
      
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onClose) onClose();
      }, 10000);
      
      setAutoHideTimer(timer);
    }

    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [quotaInfo, usingFallbackProfile, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
    }
    if (onClose) onClose();
  };

  if (!isVisible || (!quotaInfo && !usingFallbackProfile)) {
    return null;
  }

  const getToastContent = () => {
    if (quotaInfo?.exhausted) {
      return {
        type: 'warning',
        icon: '⚡',
        title: 'AI Manager - Limited Mode',
        message: quotaInfo.message || 'Running in fallback mode with proven strategies!',
        details: quotaInfo.resetTime ? `Full capabilities return: ${new Date(quotaInfo.resetTime).toLocaleString()}` : undefined
      };
    }
    
    if (usingFallbackProfile) {
      return {
        type: 'info',
        icon: '🔄',
        title: `${platformName} AI Manager`,
        message: `Using general ${platformName} strategies - still here to help you grow!`,
        details: 'For personalized advice, ensure your profile data is properly synced.'
      };
    }

    return null;
  };

  const content = getToastContent();
  if (!content) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`quota-status-toast ${content.type}`}
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -100, scale: 0.9 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="toast-header">
            <div className="toast-icon-title">
              <span className="toast-icon">{content.icon}</span>
              <h3 className="toast-title">{content.title}</h3>
            </div>
            <button className="toast-close" onClick={handleClose}>
              ✕
            </button>
          </div>
          
          <div className="toast-content">
            <p className="toast-message">{content.message}</p>
            {content.details && (
              <p className="toast-details">{content.details}</p>
            )}
          </div>
          
          <div className="toast-progress-bar">
            <motion.div
              className="toast-progress"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 10, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QuotaStatusToast; 