import React from 'react';
import './TopBar.css';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import UserDropdown from '../auth/UserDropdown';
import { useAuth } from '../../context/AuthContext';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  // Determine if we're on a platform-specific page
  const isPlatformPage = ['/instagram', '/twitter', '/facebook', '/linkedin'].some(
    path => location.pathname.startsWith(path)
  );
  
  // Get current platform if on a platform page
  const getCurrentPlatform = () => {
    if (!isPlatformPage) return null;
    
    const platforms = [
      { icon: 'facebook', path: '/facebook' },
      { icon: 'instagram', path: '/instagram' },
      { icon: 'twitter', path: '/twitter' },
      { icon: 'linkedin', path: '/linkedin' },
    ];
    
    return platforms.find(platform => 
      location.pathname.startsWith(platform.path)
    );
  };
  
  const currentPlatform = getCurrentPlatform();
  
  // Show platform icons ONLY on platform pages
  const showPlatformIcons = isPlatformPage;
  
  // Show navigation links ONLY on main dashboard (not on platform pages)
  const showNavLinks = !isPlatformPage;
  
  // Show home button ONLY on platform pages
  const showHomeButton = isPlatformPage;

  const platforms = [
    { icon: 'facebook', path: '/facebook' },
    { icon: 'instagram', path: '/instagram' },
    { icon: 'twitter', path: '/twitter' },
    { icon: 'linkedin', path: '/linkedin' },
  ];

  // Get platform name with proper capitalization
  const getPlatformName = () => {
    if (!currentPlatform) return 'Platform';
    return currentPlatform.icon.charAt(0).toUpperCase() + currentPlatform.icon.slice(1);
  };

  return (
    <motion.div
      className="top-bar"
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {showPlatformIcons && (
      <div className="social-icons">
        {platforms.map((platform, index) => (
          <motion.a
            key={platform.icon}
            href="#"
              className={`social-icon ${isPlatformPage && currentPlatform?.icon === platform.icon ? 'active' : ''}`}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={(e) => {
              e.preventDefault();
              navigate(platform.path);
            }}
          >
            {platform.icon === 'facebook' && (
              <svg viewBox="0 0 24 24">
                <path d="M22,12C22,6.48 17.52,2 12,2C6.48,2 2,6.48 2,12C2,16.84 5.44,20.87 10,21.8V15H8V12H10V9.5C10,7.57 11.57,6 13.5,6H16V9H14C13.45,9 13,9.45 13,10V12H16V15H13V21.95C18.05,21.45 22,17.19 22,12Z" />
              </svg>
            )}
            {platform.icon === 'instagram' && (
              <svg viewBox="0 0 24 24">
                <path d="M7.8,2H16.2C19.4,2 22,4.6 22,7.8V16.2A5.8,5.8 0 0,1 16.2,22H7.8C4.6,22 2,19.4 2,16.2V7.8A5.8,5.8 0 0,1 7.8,2M7.6,4A3.6,3.6 0 0,0 4,7.6V16.4C4,18.39 5.61,20 7.6,20H16.4A3.6,3.6 0 0,0 20,16.4V7.6C20,5.61 18.39,4 16.4,4H7.6M17.25,5.5A1.25,1.25 0 0,1 18.5,6.75A1.25,1.25 0 0,1 17.25,8A1.25,1.25 0 0,1 16,6.75A1.25,1.25 0 0,1 17.25,5.5M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z" />
              </svg>
            )}
            {platform.icon === 'twitter' && (
              <svg viewBox="0 0 24 24">
                <path d="M22.46,6C21.69,6.35 20.86,6.58 20,6.69C20.88,6.16 21.56,5.32 21.88,4.31C21.05,4.81 20.13,5.16 19.16,5.36C18.37,4.5 17.26,4 16,4C13.65,4 11.73,5.92 11.73,8.29C11.73,8.63 11.77,8.96 11.84,9.27C8.28,9.09 5.11,7.38 3,4.79C2.63,5.42 2.42,6.16 2.42,6.94C2.42,8.43 3.17,9.75 4.33,10.5C3.62,10.5 2.96,10.3 2.38,10C2.38,10 2.38,10 2.38,10.03C2.38,12.11 3.86,13.85 5.82,14.24C5.46,14.34 5.08,14.39 4.69,14.39C4.42,14.39 4.15,14.36 3.89,14.31C4.43,16 6,17.26 7.89,17.29C6.43,18.45 4.58,19.13 2.56,19.13C2.22,19.13 1.88,19.11 1.54,19.07C3.44,20.29 5.7,21 8.12,21C16,21 20.33,14.46 20.33,8.79C20.33,8.6 20.33,8.42 20.32,8.23C21.16,7.63 21.88,6.87 22.46,6Z" />
              </svg>
            )}
            {platform.icon === 'linkedin' && (
              <svg viewBox="0 0 24 24">
                <path d="M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19M18.5,18.5V13.2A3.26,3.26 0 0,0 15.24,9.94C14.39,9.94 13.4,10.46 12.92,11.24V10.13H10.13V18.5H12.92V13.57C12.92,12.8 13.54,12.17 14.31,12.17A1.4,1.4 0 0,1 15.71,13.57V18.5H18.5M6.88,8.56A1.68,1.68 0 0,0 8.56,6.88C8.56,5.95 7.81,5.19 6.88,5.19A1.69,1.69 0 0,0 5.19,6.88C5.19,7.81 5.95,8.56 6.88,8.56M8.27,18.5V10.13H5.5V18.5H8.27Z" />
              </svg>
            )}
          </motion.a>
        ))}
      </div>
      )}
      
      {!isPlatformPage && (
        <div className="logo" onClick={() => navigate('/')}>
          <span>Account Manager</span>
        </div>
      )}
      
      {isPlatformPage && (
        <div className="platform-title">
          <span>{getPlatformName()} Dashboard</span>
        </div>
      )}
      
      {showNavLinks && (
        <div className="nav-links">
          <motion.a
            href="#"
            className={`nav-link ${location.pathname === '/account' ? 'active' : ''}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.preventDefault();
              navigate('/account');
            }}
          >
            Dashboard
          </motion.a>
          <motion.a
            href="#"
            className="nav-link"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.preventDefault();
              // No functionality for now
            }}
          >
            Pricing
          </motion.a>
          <motion.a
            href="#"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            Home
          </motion.a>
        </div>
      )}
      
      <div className="right-controls">
        {currentUser && showHomeButton && (
          <motion.a
            href="#"
            className="home-button"
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={(e) => {
              e.preventDefault();
              navigate('/account');
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z" />
            </svg>
            <span>Main Dashboard</span>
          </motion.a>
        )}
      
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