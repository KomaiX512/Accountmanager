import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, X } from 'lucide-react';
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
              <MessageCircle size={20} className="mode-icon discussion-icon" />
              <h3>
                AI Discussion with {username}
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
                <MessageCircle size={32} className="mode-icon-large" />
              </div>
              <h4>
                Start an AI Discussion
              </h4>
              <p>
                Ask questions, get strategic insights, or discuss your {platform} growth strategy!
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