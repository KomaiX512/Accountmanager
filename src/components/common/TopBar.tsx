import React, { useState, useEffect } from 'react';
import './TopBar.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import UserDropdown from '../auth/UserDropdown';
import { useAuth } from '../../context/AuthContext';
import PlatformButton from './PlatformButton';
import PWAInstallButton from './PWAInstallButton';
import { usePlatformStatus } from '../../hooks/usePlatformStatus';
import { useMobileDetection } from '../../hooks/useMobileDetection';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { getAcquiredPlatforms } = usePlatformStatus();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useMobileDetection();

  // ✅ SIMPLE LOGIC: Get acquired platforms directly from MainDashboard logic
  const acquiredPlatforms = getAcquiredPlatforms();

  // ✅ REAL-TIME PLATFORM STATUS SYNC: Force re-render every 5 seconds to catch status changes
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncInterval = setInterval(() => {
      // Force re-render to catch any platform status changes by updating acquired platforms
      getAcquiredPlatforms();
    }, 5000);

    return () => clearInterval(syncInterval);
  }, [currentUser?.uid, getAcquiredPlatforms]);

  // Platform configuration (EXACT same as MainDashboard)
  const platformConfig = [
    { id: 'instagram', name: 'Instagram', icon: '📷', route: 'instagram' },
    { id: 'twitter', name: 'Twitter', icon: '🐦', route: 'twitter-dashboard' },
    { id: 'facebook', name: 'Facebook', icon: '📘', route: 'facebook-dashboard' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', route: 'linkedin-dashboard' }
  ];

  // Filter to only show acquired platforms
  const platformsToShow = platformConfig.filter(platform => 
    acquiredPlatforms.includes(platform.id)
  );

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleMobileNavClick = (route: string) => {
    // Use hard reload for dashboard routes to ensure full refresh
    if (
      route === '/dashboard' ||
      route === '/twitter-dashboard' ||
      route === '/facebook-dashboard' ||
      route === '/linkedin-dashboard'
    ) {
      window.location.assign(route);
      return;
    }
    navigate(route);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
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
            className="logo-image"
          />
        </div>

        {/* Desktop Navigation - Only show on desktop */}
        {!isMobile && (
          <div className="nav-links desktop-nav">
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
                {platformsToShow.map(platform => (
                  <PlatformButton
                    key={platform.id}
                    id={platform.id}
                    name={platform.name}
                    icon={platform.icon}
                    route={platform.route}
                    isActive={
                      (platform.id === 'instagram' && location.pathname === '/dashboard') ||
                      (platform.id === 'twitter' && location.pathname === '/twitter-dashboard') ||
                      (platform.id === 'facebook' && location.pathname === '/facebook-dashboard') ||
                      (platform.id === 'linkedin' && location.pathname === '/linkedin-dashboard')
                    }
                    showIcon={false}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* Mobile Dashboard Button - Only show on mobile */}
        {isMobile && currentUser && (
          <div className="mobile-dashboard-button-container">
            <motion.a
              href="#"
              className="dashboard-button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => {
                e.preventDefault();
                navigate('/account');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
              <span>Dashboard</span>
            </motion.a>
          </div>
        )}

        <div className="right-controls">
          {/* PWA Install Button - Only show when install prompt is available */}
          <PWAInstallButton />
          
          {/* Mobile Hamburger Menu - Only show on desktop (for non-mobile users) */}
          {!isMobile && (
            <div className="mobile-menu-toggle">
              <motion.button
                className="hamburger-menu"
                onClick={toggleMobileMenu}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}></span>
                <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}></span>
                <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}></span>
              </motion.button>
            </div>
          )}
          
          {currentUser ? (
            <div style={{ 
              /* 🔒 VPS COMPATIBILITY: Inline styles as backup for circular profile image */
              display: 'flex',
              alignItems: 'center'
            }}>
              <UserDropdown />
            </div>
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

      {/* Mobile Navigation Menu - Only show on desktop */}
      {!isMobile && (
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              className="mobile-nav-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <motion.div
                className="mobile-nav-menu"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mobile-nav-header">
                  <h3>Navigation</h3>
                  <button 
                    className="close-mobile-menu"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    ×
                  </button>
                </div>
                
                <div className="mobile-nav-items">
                  {currentUser && (
                    <>
                      <motion.button
                        className={`mobile-nav-item ${location.pathname === '/account' ? 'active' : ''}`}
                        onClick={() => handleMobileNavClick('/account')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        📊 Dashboard
                      </motion.button>
                      
                      {platformsToShow.map(platform => (
                        <motion.button
                          key={platform.id}
                          className={`mobile-nav-item ${
                            (platform.id === 'instagram' && location.pathname === '/dashboard') ||
                            (platform.id === 'twitter' && location.pathname === '/twitter-dashboard') ||
                            (platform.id === 'facebook' && location.pathname === '/facebook-dashboard') ||
                            (platform.id === 'linkedin' && location.pathname === '/linkedin-dashboard')
                              ? 'active' : ''
                          }`}
                          onClick={() => handleMobileNavClick(
                            platform.id === 'instagram' ? '/dashboard' : `/${platform.route}`
                          )}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {platform.icon} {platform.name}
                        </motion.button>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
};

export default TopBar;