import React, { useState } from 'react';
import './LeftBar.css';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ProfilePopup from './ProfilePopup';
import MessagesPopup from './MessagesPopup';

interface LeftBarProps {
  accountHolder: string;
}

const LeftBar: React.FC<LeftBarProps> = ({ accountHolder }) => {
  const navigate = useNavigate();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showMessagesPopup, setShowMessagesPopup] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const menuItems = [
    { icon: 'settings', path: '/settings', label: 'Settings' },
    { icon: 'edit', path: '/edit', label: 'Edit' },
    { icon: 'profile', label: 'Profile', action: () => setShowProfilePopup(true) },
    { 
      icon: 'messages', 
      label: 'Messages', 
      action: () => setShowMessagesPopup(true),
      hasNotification: hasNewMessages,
    },
  ];

  return (
    <motion.div
      className="left-bar"
      initial={{ x: -80 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="icon-container">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.icon}
            className="icon-button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={item.action || (() => navigate(item.path))}
          >
            {item.icon === 'settings' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
              </svg>
            )}
            {item.icon === 'edit' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
              </svg>
            )}
            {item.icon === 'profile' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
              </svg>
            )}
            {item.icon === 'messages' && (
              <div className="icon-wrapper">
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z" />
                </svg>
                {item.hasNotification && <span className="notification-dot"></span>}
              </div>
            )}
            <span>{item.label}</span>
          </motion.button>
        ))}
      </div>
      {showProfilePopup && (
        <ProfilePopup username={accountHolder} onClose={() => setShowProfilePopup(false)} />
      )}
      {showMessagesPopup && (
        <MessagesPopup
          username={accountHolder}
          onClose={() => setShowMessagesPopup(false)}
          setHasNewMessages={setHasNewMessages}
        />
      )}
    </motion.div>
  );
};

export default LeftBar;