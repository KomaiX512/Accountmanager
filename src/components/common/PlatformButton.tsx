import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { safeNavigate } from '../../utils/navigationGuard';
import { FiClock } from 'react-icons/fi';
import './PlatformButton.css';

export interface PlatformButtonProps {
  id: string;
  name: string;
  icon: string;
  route: string;
  isActive?: boolean;
  className?: string;
  showIcon?: boolean;
  bypassTimer?: { endTime: number; startTime: number } | null;
}

/**
 * A reusable platform button component that can be used in both the TopBar and MainDashboard
 */
const PlatformButton: React.FC<PlatformButtonProps> = ({
  id,
  name,
  icon,
  route,
  isActive = false,
  className = '',
  showIcon = true,
  bypassTimer = null,
}) => {
  const navigate = useNavigate();
  const [showTooltip, setShowTooltip] = useState(false);
  const [remainingTime, setRemainingTime] = useState('');
  
  // Update remaining time every second when bypass timer is active
  useEffect(() => {
    if (!bypassTimer) return;
    
    const updateTime = () => {
      const remaining = Math.max(0, bypassTimer.endTime - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [bypassTimer]);
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // ✅ HARD RELOAD NAVIGATION: Force full page reload to replicate manual refresh
    try {
      if (id === 'instagram') {
        window.location.assign('/dashboard'); // Instagram dashboard
      } else if (id === 'twitter') {
        window.location.assign('/twitter-dashboard'); // Twitter dashboard
      } else if (id === 'facebook') {
        window.location.assign('/facebook-dashboard'); // Facebook dashboard
      } else if (id === 'linkedin') {
        window.location.assign('/linkedin-dashboard'); // LinkedIn dashboard
      } else {
        // For other platforms or generic routes
        window.location.assign(`/${route}`);
      }
    } catch {
      // Fallback to React navigation if window navigation fails
      if (id === 'instagram') {
        safeNavigate(navigate, '/dashboard', {}, 6);
      } else if (id === 'twitter') {
        safeNavigate(navigate, '/twitter-dashboard', {}, 6);
      } else if (id === 'facebook') {
        safeNavigate(navigate, '/facebook-dashboard', {}, 6);
      } else if (id === 'linkedin') {
        safeNavigate(navigate, '/linkedin-dashboard', {}, 6);
      } else {
        safeNavigate(navigate, `/${route}`, {}, 6);
      }
    }
  };

  return (
    <div 
      className="platform-button-wrapper"
      onMouseEnter={() => bypassTimer && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.a
        href="#"
        className={`nav-link platform-button ${isActive ? 'active' : ''} ${className} ${bypassTimer ? 'has-timer' : ''}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        title={name}
      >
        {showIcon && <img src={icon} alt={name} className="platform-icon" />}
        {name}
        {bypassTimer && (
          <span className="platform-timer">
            <FiClock size={12} />
            {remainingTime}
          </span>
        )}
      </motion.a>
      
      {/* Tooltip showing context arrival time */}
      <AnimatePresence>
        {showTooltip && bypassTimer && (
          <motion.div
            className="bypass-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <FiClock size={14} />
            <span>{remainingTime} remaining to arrive your whole context</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlatformButton;
