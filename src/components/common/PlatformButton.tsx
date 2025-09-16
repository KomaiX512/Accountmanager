import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { safeNavigate } from '../../utils/navigationGuard';
import './PlatformButton.css';

export interface PlatformButtonProps {
  id: string;
  name: string;
  icon: string;
  route: string;
  isActive?: boolean;
  className?: string;
  showIcon?: boolean;
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
}) => {
  const navigate = useNavigate();
  
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
    <motion.a
      href="#"
      className={`nav-link platform-button ${isActive ? 'active' : ''} ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      title={name}
    >
      {showIcon && <img src={icon} alt={name} className="platform-icon" />}
      {name}
    </motion.a>
  );
};

export default PlatformButton;
