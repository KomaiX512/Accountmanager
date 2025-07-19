import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Image, Send, X } from 'lucide-react';
import './ChatModal.css';
import useFeatureTracking from '../../hooks/useFeatureTracking';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LinkedAccount {
  platform: string;
  username: string;
  url: string;
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
  mode?: 'discussion' | 'post';
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  messages,
  onClose,
  username,
  onSendMessage,
  isProcessing = false,
  linkedAccounts = [],
  platform = 'instagram',
  mode = 'discussion'
}) => {
  const [message, setMessage] = useState('');
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

    // Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      alert(discussionAccessCheck.reason || 'Discussions feature is not available');
      return;
    }

    const messageToSend = message.trim();
    setMessage('');

    // Track actual discussion engagement
    try {
      const trackingSuccess = await trackRealDiscussion(platform, {
        messageCount: messages.length + 1,
        type: 'chat'
      });
      
      if (!trackingSuccess) {
        return;
      }
    } catch (trackingError) {
      console.error(`[ChatModal] Discussion tracking error:`, trackingError);
    }

    onSendMessage(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Format message content for better display
  const formatMessageContent = (content: string) => {
    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const formattedContent = content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Convert line breaks to proper HTML
    return formattedContent.replace(/\n/g, '<br>');
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
            <div className="chat-mode-indicator">
              {mode === 'discussion' ? (
                <MessageCircle size={20} className="mode-icon discussion-icon" />
              ) : (
                <Image size={20} className="mode-icon post-icon" />
              )}
              <h3>
                {mode === 'discussion' ? 'AI Discussion' : 'Post Creation'} with {username}
              </h3>
            </div>
            <span className="platform-badge">{platform}</span>
          </div>
          <button className="chat-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="welcome-message">
              <div className="welcome-icon">
                {mode === 'discussion' ? (
                  <MessageCircle size={32} className="mode-icon-large" />
                ) : (
                  <Image size={32} className="mode-icon-large" />
                )}
              </div>
              <h4>
                {mode === 'discussion' 
                  ? 'Start an AI Discussion' 
                  : 'Create AI-Powered Content'}
              </h4>
              <p>
                {mode === 'discussion'
                  ? `Ask questions, get strategic insights, or discuss your ${platform} growth strategy!`
                  : `Generate engaging posts with AI assistance for your ${platform} account!`}
              </p>
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
                <div 
                  className="message-content"
                  dangerouslySetInnerHTML={{ __html: formatMessageContent(msg.content) }}
                />
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
                <Send size={18} />
              )}
            </button>
          </div>
          <div className="chat-input-footer">
            <small>Press Enter to send, Shift+Enter for new line</small>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ChatModal; 