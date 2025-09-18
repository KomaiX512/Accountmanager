import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const UserDropdown: React.FC = () => {
  // ✨ SAFETY CHECK: Handle AuthContext initialization
  let currentUser = null;
  let signOut = async () => {};
  
  try {
    const authContext = useAuth();
    currentUser = authContext.currentUser;
    signOut = authContext.signOut;
  } catch (error) {
    console.log('AuthContext not ready in UserDropdown');
    return null; // Don't render if auth context is not ready
  }

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const toggleDropdown = () => setIsOpen(!isOpen);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!currentUser) return null;

  // Get user's display name or email for avatar
  const userInitial = currentUser.displayName
    ? currentUser.displayName.charAt(0).toUpperCase()
    : currentUser.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="user-profile" ref={dropdownRef}>
      <motion.div
        className="user-avatar"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleDropdown}
        style={{
          /* 🔒 VPS COMPATIBILITY: Inline styles as backup for circular profile image */
          borderRadius: '50%',
          overflow: 'hidden',
          width: '40px',
          height: '40px'
        }}
      >
        {currentUser.photoURL ? (
          <img 
            src={currentUser.photoURL} 
            alt={currentUser.displayName || 'User'} 
            style={{
              /* 🔒 VPS COMPATIBILITY: Inline styles as backup for circular profile image */
              borderRadius: '50%',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
          />
        ) : (
          userInitial
        )}
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="user-dropdown"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="dropdown-menu-item logout" onClick={handleLogout}>
              <svg viewBox="0 0 24 24">
                <path d="M16,17V14H9V10H16V7L21,12L16,17M14,2A2,2 0 0,1 16,4V6H14V4H5V20H14V18H16V20A2,2 0 0,1 14,22H5A2,2 0 0,1 3,20V4A2,2 0 0,1 5,2H14Z" />
              </svg>
              <span>Logout</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserDropdown; 