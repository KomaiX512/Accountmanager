import React, { useState, useEffect } from 'react';
import './LeftBar.css';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ProfilePopup from './ProfilePopup';
import MessagesPopup from './MessagesPopup';
import CanvasEditor from './CanvasEditor';

interface LeftBarProps {
  accountHolder: string;
  userId?: string;
  platform?: 'instagram' | 'twitter' | 'facebook';
  onOpenChat?: (messageContent: string) => void;
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
    { icon: 'content', label: 'Content Hub', action: () => setShowCanvasEditor(true) },
    { icon: 'profile', label: 'Profile', action: () => setShowProfilePopup(true) },
    { 
      icon: 'ai-chat', 
      label: 'AI Manager', 
      action: () => setShowMessagesPopup(true),
      hasNotification: hasNewMessages,
    },
  ];

  return (
    <motion.div
      className="left-bar"
      initial={{ x: -80 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="icon-container">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.icon}
            className="icon-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.15 }}
            onClick={item.action}
          >
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
            {item.icon === 'ai-chat' && (
              <div className="icon-wrapper">
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  <circle cx="9" cy="12" r="1"/>
                  <circle cx="15" cy="12" r="1"/>
                  <circle cx="12" cy="8" r="1"/>
                </svg>
                {item.hasNotification && <span className="notification-dot"></span>}
              </div>
            )}
            <span>{item.label}</span>
          </motion.button>
        ))}
      </div>
      {showProfilePopup && (
        <ProfilePopup 
          username={accountHolder} 
          onClose={() => setShowProfilePopup(false)} 
          platform={platform}
        />
      )}
      {showMessagesPopup && (
        <MessagesPopup
          username={accountHolder}
          onClose={() => setShowMessagesPopup(false)}
          setHasNewMessages={setHasNewMessages}
          onOpenChat={onOpenChat}
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