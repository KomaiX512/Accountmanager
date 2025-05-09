import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ChatModal.css';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;
  username?: string;
  isProcessing?: boolean;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  onClose,
  messages,
  onSendMessage,
  username = 'Instagram Chat',
  isProcessing = false
}) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && onSendMessage && !isProcessing) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="chat-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="chat-modal-content"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-modal-header">
              <h2>{username}</h2>
              <button className="chat-modal-close" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="chat-messages-container">
              {messages.length === 0 ? (
                <div className="chat-no-messages">
                  No chat history yet. Start a conversation!
                </div>
              ) : (
                messages.map((message, index) => (
                  <motion.div
                    key={index}
                    className={`chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="message-bubble">
                      <div className="message-content">{message.content}</div>
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {onSendMessage && (
              <form className="chat-input-form" onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  className="chat-input"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isProcessing}
                />
                <button
                  type="submit"
                  className={`chat-send-button ${isProcessing ? 'processing' : ''}`}
                  disabled={!newMessage.trim() || isProcessing}
                >
                  {isProcessing ? (
                    <div className="chat-loading-spinner" />
                  ) : (
                    '→'
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatModal; 