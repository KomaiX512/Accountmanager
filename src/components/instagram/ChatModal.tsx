import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import './ChatModal.css';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatModalProps {
  messages: ChatMessage[];
  onClose: () => void;
  onSendMessage: (message: string) => void;
  username: string;
  isProcessing: boolean;
}

const ChatModal: React.FC<ChatModalProps> = ({ 
  messages, 
  onClose, 
  onSendMessage, 
  username,
  isProcessing 
}) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !isProcessing) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-modal-header">
          <h2>Instagram Strategy Discussion: {username}</h2>
          <button className="chat-modal-close" onClick={onClose}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="chat-messages-container">
          {messages.length === 0 ? (
            <div className="chat-no-messages">
              <p>No messages yet. Start the conversation by asking a question.</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`chat-message ${
                  message.role === 'user' ? 'user-message' : 'assistant-message'
                }`}
              >
                <div className="message-bubble">
                  <div className="message-content">{message.content}</div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={isProcessing}
            className="chat-input"
          />
          <button 
            type="submit" 
            className={`chat-send-button ${isProcessing ? 'processing' : ''}`}
            disabled={!newMessage.trim() || isProcessing}
          >
            {isProcessing ? (
              <div className="chat-loading-spinner"></div>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ChatModal; 