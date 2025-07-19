import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './LeftBar.css';
import { useNavigate } from 'react-router-dom';
import ProfilePopup from './ProfilePopup';
import MessagesPopup from './MessagesPopup';
import CanvasEditor from './CanvasEditor';

interface LeftBarProps {
  accountHolder: string;
  userId?: string;
  platform?: 'instagram' | 'twitter' | 'facebook';
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const LeftBar: React.FC<LeftBarProps> = ({ accountHolder, userId, platform = 'instagram', onOpenChat }) => {
  const navigate = useNavigate();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showMessagesPopup, setShowMessagesPopup] = useState(false);
  const [showCanvasEditor, setShowCanvasEditor] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useEffect(() => {
    // Close any popups on route change
    return () => {
      setShowProfilePopup(false);
      setShowMessagesPopup(false);
      setShowCanvasEditor(false);
    };
  }, [navigate]);

  const menuItems = [
    { icon: 'chat', label: 'AI Chat', action: () => setShowMessagesPopup(true) },
    { icon: 'content', label: 'Content Hub', action: () => setShowCanvasEditor(true) },
    { icon: 'profile', label: 'Profile', action: () => setShowProfilePopup(true) }
  ];

  return (
    <motion.div
      className="left-bar"
      initial={{ x: -80 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        // 🔒 BULLETPROOF VIEWPORT LOCK - Ultimate override system
        position: 'fixed',
        top: '70px', // FIXED: Match TopBar height
        left: '0',
        zIndex: 999998, // FIXED: Just below TopBar but above everything else
        height: 'calc(100vh - 70px)', // FIXED: Match TopBar height
        width: '80px',
        overflow: 'visible',
        transform: 'translateZ(0)', // Hardware acceleration
        willChange: 'transform',
        // Anti-interference protection
        margin: '0',
        padding: '0',
        minWidth: '80px',
        maxWidth: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(26, 26, 46, 0.95)', // FIXED: More opaque for better visibility
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxSizing: 'border-box',
        // Additional bulletproof properties
        minHeight: 'calc(100vh - 70px)',
        maxHeight: 'calc(100vh - 70px)'
      }}
    >
      <div className="icon-container">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.icon}
            className="icon-button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              delay: index * 0.1, 
              duration: 0.2,
              ease: 'easeOut'
            }}
            onClick={item.action}
          >
            {item.icon === 'chat' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M21,15A2,2 0 0,1 19,17H7L4,20V5A2,2 0 0,1 6,3H19A2,2 0 0,1 21,5V15Z" />
              </svg>
            )}
            {item.icon === 'content' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V5H19V19Z M17,17H7V15H17V17Z M17,13H7V11H17V13Z M17,9H7V7H17V9Z" />
              </svg>
            )}
            {item.icon === 'profile' && (
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
              </svg>
            )}
            <span>{item.label}</span>
            {item.icon === 'chat' && hasNewMessages && (
              <div className="notification-dot"></div>
            )}
          </motion.button>
        ))}
      </div>
      
      {showMessagesPopup && (
        <MessagesPopup
          username={accountHolder}
          onClose={() => setShowMessagesPopup(false)}
          setHasNewMessages={setHasNewMessages}
          onOpenChat={onOpenChat}
          platform={platform}
        />
      )}
      
      {showProfilePopup && (
        <ProfilePopup 
          username={accountHolder} 
          onClose={() => setShowProfilePopup(false)} 
          platform={platform}
        />
      )}
      
      {showCanvasEditor && (
        <CanvasEditor 
          username={accountHolder} 
          userId={userId}
          platform={platform}
          onClose={() => setShowCanvasEditor(false)} 
        />
      )}
    </motion.div>
  );
};

export default LeftBar;