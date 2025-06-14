import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ChatModal.css';
import useFeatureTracking from '../../hooks/useFeatureTracking';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LinkedAccount {
  username: string;
  platform: 'twitter' | 'instagram';
  addedAt: string;
}

interface ChatModalProps {
  open: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  username: string;
  onSendMessage: (message: string) => void;
  isProcessing?: boolean;
  linkedAccounts?: LinkedAccount[];
  platform?: string;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  messages,
  onClose,
  username,
  onSendMessage,
  isProcessing = false,
  linkedAccounts = [],
  platform = 'instagram'
}) => {
  const [message, setMessage] = useState('');
  const [showLinkedAccounts, setShowLinkedAccounts] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { trackRealDiscussion, canUseFeature } = useFeatureTracking();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isProcessing) return;

    // ✅ PRE-ACTION CHECK: Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      alert(discussionAccessCheck.reason || 'Discussions feature is not available');
      return;
    }

    const messageToSend = message.trim();
    setMessage('');

    console.log(`[ChatModal] 🚀 Sending discussion message for ${platform}: "${messageToSend.substring(0, 50)}..."`);

    // ✅ REAL USAGE TRACKING: Track actual discussion engagement BEFORE sending
    try {
      const trackingSuccess = await trackRealDiscussion(platform, {
        messageCount: messages.length + 1, // Include the new message
        type: 'chat'
      });
      
      if (!trackingSuccess) {
        console.warn(`[ChatModal] 🚫 Discussion blocked for ${platform} - limit reached, showing upgrade popup`);
        // Don't send the message if tracking failed due to limits
        return;
      }
      
      console.log(`[ChatModal] ✅ Discussion tracked: ${platform} chat message sent`);
    } catch (trackingError) {
      console.error(`[ChatModal] ❌ Discussion tracking error:`, trackingError);
      // Continue with message sending even if tracking fails due to technical error
    }

    // Send the message only if tracking was successful
    onSendMessage(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const toggleLinkedAccounts = () => {
    setShowLinkedAccounts(!showLinkedAccounts);
  };

  if (!open) return null;

  return (
    <motion.div
      className="chat-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="chat-modal-content"
        initial={{ scale: 0.9, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-modal-header">
          <div className="chat-header-info">
            <h3>AI Discussion with {username}</h3>
            <span className="platform-badge">{platform}</span>
          </div>
          <div className="chat-header-actions">
            {linkedAccounts.length > 0 && (
              <button
                className="linked-accounts-toggle"
                onClick={toggleLinkedAccounts}
                title={`${linkedAccounts.length} linked accounts`}
              >
                🔗 {linkedAccounts.length}
              </button>
            )}
            <button className="chat-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showLinkedAccounts && (
            <motion.div
              className="linked-accounts-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h4>Linked Accounts Discovered</h4>
              <div className="linked-accounts-list">
                {linkedAccounts.map((account, index) => (
                  <div key={index} className="linked-account-item">
                    <span className="account-platform">{account.platform}</span>
                    <span className="account-username">@{account.username}</span>
                    <span className="account-added-at">
                      {new Date(account.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="welcome-message">
              <h4>Start a new AI discussion</h4>
              <p>Ask questions, get strategic insights, or discuss your {platform} growth!</p>
              <div className="tracking-info">
                💡 Each message counts towards your discussion limit - make them count!
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <motion.div
                key={index}
                className={`message ${msg.role}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="message-content">
                  {msg.content}
                </div>
              </motion.div>
            ))
          )}
          {isProcessing && (
            <motion.div
              className="message assistant processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                AI is thinking...
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={handleSubmit}>
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Ask about ${platform} strategy, content ideas, or growth tips...`}
              className="chat-input"
              rows={2}
              disabled={isProcessing}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!message.trim() || isProcessing}
            >
              {isProcessing ? (
                <div className="btn-spinner"></div>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                </svg>
              )}
            </button>
          </div>
          <div className="chat-input-footer">
            <small>Press Enter to send, Shift+Enter for new line</small>
            <div className="real-time-tracking-indicator">
              🔄 Discussion tracking: Active
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ChatModal; 