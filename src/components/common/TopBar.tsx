import React from 'react';
import './TopBar.css';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import UserDropdown from '../auth/UserDropdown';
import { useAuth } from '../../context/AuthContext';
import PlatformButton from './PlatformButton';
import { useAcquiredPlatforms } from '../../context/AcquiredPlatformsContext';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { acquiredPlatforms } = useAcquiredPlatforms();

  // Debug logging
  console.log('[TopBar] Rendering with:', {
    currentUser: currentUser?.uid,
    acquiredPlatforms,
    location: location.pathname
  });

  return (
    <motion.div
      className="top-bar"
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        // 🔒 BULLETPROOF STATIC POSITIONING - Always visible, highest priority
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: 999999, // FIXED: Much higher z-index to stay above everything
        height: '70px',
        background: 'rgba(26, 26, 46, 0.95)', // FIXED: More opaque for better visibility
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        boxSizing: 'border-box',
        // FIXED: Additional bulletproof properties
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '100px',
        paddingRight: '30px',
        // Prevent any layout shifts
        minHeight: '70px',
        maxHeight: '70px'
      }}
    >
      <div className="logo" onClick={() => navigate('/')}>
        <img 
          src="/Logo/logo.png" 
          alt="Logo" 
          className="logo-image"
        />
      </div>

      <div className="nav-links">
        {currentUser && (
          <>
            <motion.a
              href="#"
              className={`nav-link ${location.pathname === '/account' ? 'active' : ''}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => {
                e.preventDefault();
                navigate('/account');
              }}
            >
              Dashboard
            </motion.a>
            
            {/* Dynamic Platform Buttons */}
            {acquiredPlatforms.map(platform => (
              <PlatformButton
                key={platform.id}
                id={platform.id}
                name={platform.name}
                icon={platform.icon}
                route={platform.route}
                isActive={
                  (platform.id === 'instagram' && location.pathname === '/dashboard') ||
                  location.pathname.includes(platform.route)
                }
                showIcon={false}
              />
            ))}
          </>
        )}
      </div>

      <div className="right-controls">
      
      {currentUser ? (
        <UserDropdown />
      ) : (
        <motion.button
          className="login-button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/login')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Sign In
        </motion.button>
      )}
      </div>
    </motion.div>
  );
};

export default TopBar;