import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './LeftBar.css';
import { useNavigate } from 'react-router-dom';
import ProfilePopup from './ProfilePopup';
import CanvasEditor from './CanvasEditor';
import ChatModal from './ChatModal';
import ManualGuidance from './ManualGuidance';
import RagService from '../../services/RagService';

interface LeftBarProps {
  accountHolder: string;
  userId?: string;
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  onOpenChat?: (messageContent: string, platform?: string) => void;
}

const LeftBar: React.FC<LeftBarProps> = ({ accountHolder, userId, platform = 'instagram' }) => {
  const navigate = useNavigate();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showCanvasEditor, setShowCanvasEditor] = useState(false);
  const [showManualGuidance, setShowManualGuidance] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Close any popups on route change
    return () => {
      setShowProfilePopup(false);
      setShowChatModal(false);
      setShowCanvasEditor(false);
      setShowManualGuidance(false);
    };
  }, [navigate]);

  const menuItems = [
    { icon: 'chat', label: 'AI Chat', action: () => setShowChatModal(true) },
    { icon: 'studio', label: 'Image Studio', action: () => setShowCanvasEditor(true) },
    { icon: 'profile', label: 'Profile', action: () => setShowProfilePopup(true) },
    { icon: 'manual', label: 'Manual', action: () => setShowManualGuidance(true) }
  ];

  const handleSendMessage = async (message: string, model?: string) => {
    if (isProcessing) return; // Prevent double submits
    setIsProcessing(true);
    // Add user message to chat
    const userMessage = { role: 'user' as const, content: message };
    // Compute nextMessages to avoid using stale state when calling the API
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    
    // Call actual RAG API instead of placeholder response
    try {
      if (!accountHolder) {
        console.error('[LeftBar] No account holder available for discussion');
        const errorResponse = { role: 'assistant' as const, content: 'Please select an account to start a discussion.' };
        setChatMessages(prev => [...prev, errorResponse]);
        return;
      }

      // Pass the latest messages (including the one we just added) with selected model
      const response = await RagService.sendDiscussionQuery(
        accountHolder,
        message,
        nextMessages,
        platform || 'instagram',
        model || 'gemini-2.5-flash'
      );
      const assistantResponse = { role: 'assistant' as const, content: response.response };
      // Avoid duplicate consecutive assistant messages
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content.trim() === assistantResponse.content.trim()) {
          return prev; // skip duplicate
        }
        return [...prev, assistantResponse];
      });
    } catch (error) {
      console.error('[LeftBar] Error getting AI response:', error);
      const errorResponse = { role: 'assistant' as const, content: 'Sorry, I encountered an error. Please try again.' };
      setChatMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
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
          bottom: '0', // FIXED: Extend to bottom of screen
          zIndex: 999998, // FIXED: Just below TopBar but above everything else
          overflow: 'visible',
          transform: 'translateZ(0)', // Hardware acceleration
          willChange: 'transform',
          // Anti-interference protection
          margin: '0',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(26, 26, 46, 0.95)', // FIXED: More opaque for better visibility
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxSizing: 'border-box'
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
                  {/* Premium AI Chat Icon - Modern speech bubble with AI elements */}
                  <path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H6L4,18V4H20V16Z" />
                  <circle cx="7" cy="9" r="1" />
                  <circle cx="11" cy="9" r="1" />
                  <circle cx="15" cy="9" r="1" />
                  <path d="M7,12H17V14H7V12Z" />
                </svg>
              )}
              {item.icon === 'studio' && (
                <svg className="icon" viewBox="0 0 24 24">
                  {/* Premium Image Studio Icon - Camera with artistic elements */}
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z" />
                  <path d="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z" />
                </svg>
              )}
              {item.icon === 'profile' && (
                <svg className="icon" viewBox="0 0 24 24">
                  {/* Premium Profile Icon - Modern user silhouette */}
                  <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
                  <path d="M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6M12,16C14.33,16 16,16.67 16,18V19H8V18C8,16.67 9.67,16 12,16Z" />
                </svg>
              )}
              {item.icon === 'manual' && (
                <svg className="icon" viewBox="0 0 24 24">
                  {/* Premium Manual Icon - Open book with guide elements */}
                  <path d="M19,2H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,2M19,19H5V5H19V19Z" />
                  <path d="M7,7H17V9H7V7Z" />
                  <path d="M7,11H17V13H7V11Z" />
                  <path d="M7,15H13V17H7V15Z" />
                  <path d="M15,15H17V17H15V15Z" />
                  <path d="M15,11H17V13H15V11Z" />
                  <path d="M15,7H17V9H15V7Z" />
                </svg>
              )}
              <span>{item.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Popups rendered outside the left bar container */}
      {showChatModal && (
        <ChatModal
          open={showChatModal}
          messages={chatMessages}
          onClose={() => setShowChatModal(false)}
          username={accountHolder}
          onSendMessage={handleSendMessage}
          platform={platform}
          isProcessing={isProcessing}
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
      
      {showManualGuidance && (
        <ManualGuidance 
          onClose={() => setShowManualGuidance(false)} 
        />
      )}
    </>
  );
};

export default LeftBar;