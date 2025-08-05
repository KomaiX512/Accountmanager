import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X, Loader2 } from 'lucide-react';
import './ChatModal.css';
import useFeatureTracking from '../../hooks/useFeatureTracking';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatModalProps {
  open: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  username: string;
  onSendMessage: (message: string) => void;
  isProcessing?: boolean;
  platform?: string;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  messages,
  onClose,
  username,
  onSendMessage,
  isProcessing = false,
  platform = 'instagram'
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

    console.log(`[ChatModal] 🚀 SUBMIT STARTED: platform=${platform}, message="${message.trim().substring(0, 50)}..."`);

    // Verify discussion limits before proceeding
    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      console.warn(`[ChatModal] 🚫 DISCUSSION BLOCKED:`, discussionAccessCheck.reason);
      alert(discussionAccessCheck.reason || 'Discussions feature is not available');
      return;
    }

    const messageToSend = message.trim();
    setMessage('');

    // Track actual discussion engagement
    try {
      console.log(`[ChatModal] 🎯 Calling trackRealDiscussion for ${platform}...`);
      const trackingSuccess = await trackRealDiscussion(platform, {
        messageCount: messages.length + 1,
        type: 'chat'
      });
      
      console.log(`[ChatModal] 📊 Tracking result: ${trackingSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      if (!trackingSuccess) {
        console.warn(`[ChatModal] 🚫 Tracking failed, aborting message send`);
        return;
      }
      
      console.log(`[ChatModal] ✅ Tracking successful, proceeding with message send`);
    } catch (trackingError) {
      console.error(`[ChatModal] ❌ Discussion tracking error:`, trackingError);
      // Continue with sending message even if tracking fails
    }

    console.log(`[ChatModal] 📤 Sending message to parent component...`);
    onSendMessage(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Format message content for better display and JSON handling
  const formatMessageContent = (content: string) => {
    try {
      // Clean the content first
      let cleanContent = content.trim();
      
      // Try to detect and format JSON responses
      if (cleanContent.startsWith('{') || cleanContent.startsWith('[')) {
        try {
          const parsed = JSON.parse(cleanContent);
          return `<div style="background: rgba(0,0,0,0.4); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 8px 0; border-left: 4px solid #00ffcc;">
            <div style="color: #00ffcc; font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">JSON Response</div>
            <pre style="white-space: pre-wrap; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; font-size: 13px; line-height: 1.4; margin: 0; color: #e8e8ff;">${JSON.stringify(parsed, null, 2)}</pre>
          </div>`;
        } catch {
          // If not valid JSON, continue with normal formatting
        }
      }
      
      // Format lists and bullet points
      let formattedContent = cleanContent;
      
      // Convert numbered lists
      formattedContent = formattedContent.replace(/^\d+\.\s+(.+)$/gm, '<div style="margin: 6px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #00ffcc; font-weight: 600;">•</span>$1</div>');
      
      // Convert bullet points
      formattedContent = formattedContent.replace(/^[-*]\s+(.+)$/gm, '<div style="margin: 6px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #00ffcc; font-weight: 600;">•</span>$1</div>');
      
      // Convert URLs to clickable links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      formattedContent = formattedContent.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #00ffcc; text-decoration: underline; font-weight: 500;">$1</a>');
      
      // Convert **bold** text
      formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600; color: #ffffff;">$1</strong>');
      
      // Convert *italic* text (but use emphasis color instead of italic)
      formattedContent = formattedContent.replace(/\*(.*?)\*/g, '<span style="color: #00ffcc; font-weight: 500;">$1</span>');
      
      // Convert line breaks to proper HTML
      formattedContent = formattedContent.replace(/\n\n/g, '<br><br>');
      formattedContent = formattedContent.replace(/\n/g, '<br>');
      
      return formattedContent;
    } catch (error) {
      console.error('Error formatting message content:', error);
      return content.replace(/\n/g, '<br>');
    }
  };

  if (!open) return null;

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="chat-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="chat-modal-content"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* COMPACT HEADER */}
            <div className="chat-modal-header">
              <div className="chat-header-info">
                <div className="chat-mode-indicator">
                  <MessageCircle size={16} className="mode-icon discussion-icon" />
                  <h3>AI Discussion with {username}</h3>
                </div>
                <span className="platform-badge">{platform}</span>
              </div>
              <button 
                className="chat-close-btn" 
                onClick={onClose}
                aria-label="Close chat"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* MAXIMIZED MESSAGES AREA */}
            <div className="chat-messages">
              {messages.length === 0 ? (
                <motion.div 
                  className="welcome-message"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="welcome-icon">
                    <MessageCircle size={32} className="mode-icon-large" />
                  </div>
                  <h4>Start an AI Discussion</h4>
                  <p>Ask questions, get strategic insights, or discuss your {platform} growth strategy!</p>
                </motion.div>
              ) : (
                messages.map((msg, index) => (
                  <motion.div
                    key={index}
                    className={`message ${msg.role}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ 
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                      delay: index === 0 ? 0.1 : 0.05
                    }}
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* REDESIGNED INPUT AREA - COMPACT AND ALIGNED */}
            <div className="chat-input-container">
              <form onSubmit={handleSubmit} className="chat-input-form">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder={`Message ${username}...`}
                  disabled={isProcessing}
                  rows={1}
                  aria-label="Type your message"
                />
                <button 
                  type="submit" 
                  className="send-button"
                  disabled={!message.trim() || isProcessing}
                  aria-label={isProcessing ? 'Sending...' : 'Send message'}
                >
                  {isProcessing ? (
                    <Loader2 className="btn-spinner" size={14} strokeWidth={2.5} />
                  ) : (
                    <Send size={16} strokeWidth={2} />
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatModal; 