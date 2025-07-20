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
    
    // Special case for Instagram
    if (id === 'instagram') {
      safeNavigate(navigate, '/dashboard', {}, 6); // Instagram dashboard
    } else {
      // For all other platforms
      safeNavigate(navigate, `/${route}`, {}, 6);
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
