import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ChatModal.css';
import useFeatureTracking from '../../hooks/useFeatureTracking';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LinkedAccount {
  url: string;
  username: string;
}

export interface ChatModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage?: (message: string, model?: string) => void;
  username?: string;
  isProcessing?: boolean;
  linkedAccounts?: LinkedAccount[];
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  onClose,
  messages,
  onSendMessage,
  username = 'Chat',
  isProcessing = false,
  linkedAccounts = [],
  platform = 'instagram'
}) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [conversationTracked, setConversationTracked] = useState(false);
  const { trackRealDiscussion, canUseFeature } = useFeatureTracking();

  // Platform configuration
  const platformConfig = {
    instagram: {
      name: 'Instagram',
      baseUrl: 'https://instagram.com/',
      urlPattern: /https:\/\/instagram\.com\/([A-Za-z0-9_.-]+)/g,
      usernamePrefix: '@',
      displayName: 'Instagram Account'
    },
    twitter: {
      name: 'X (Twitter)',
      baseUrl: 'https://twitter.com/',
      urlPattern: /https:\/\/twitter\.com\/([A-Za-z0-9_.-]+)/g,
      usernamePrefix: '@',
      displayName: 'Twitter Account'
    },
    facebook: {
      name: 'Facebook',
      baseUrl: 'https://facebook.com/',
      urlPattern: /https:\/\/facebook\.com\/([A-Za-z0-9_.-]+)/g,
      usernamePrefix: '',
      displayName: 'Facebook Profile'
    }
  }[platform];

  // Preemptive questions based on platform and username
  const getPreemptiveQuestions = () => {
    const baseQuestions = [
      `Give me 10 trending hashtags for ${username}`,
      `Write 3 caption ideas with a strong hook`,
      `Best time to post this week and why?`,
      `Suggest a carousel content plan for tomorrow`,
      `How can we improve reach from our last post?`
    ];

    const platformSpecificQuestions = {
      instagram: [
        `What are the best Instagram Reels ideas for ${username}?`,
        `How can we increase Instagram engagement?`,
        `Suggest Instagram Story highlights for ${username}`
      ],
      twitter: [
        `What are trending Twitter topics for ${username}?`,
        `How can we increase Twitter engagement?`,
        `Suggest Twitter thread ideas for ${username}`
      ],
      facebook: [
        `What are trending Facebook topics for ${username}?`,
        `How can we increase Facebook engagement?`,
        `Suggest Facebook post ideas for ${username}`
      ]
    };

    return [...baseQuestions, ...platformSpecificQuestions[platform]];
  };

  const preemptiveQuestions = getPreemptiveQuestions();

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

  // Reset tracking state when modal closes so a new session can be tracked next time
  useEffect(() => {
    if (!open) {
      setConversationTracked(false);
    }
  }, [open]);

  // Unified send handler with access checks and one-time discussion tracking
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;

    // Pre-action access check
    const access = canUseFeature('discussions');
    if (!access.allowed) {
      alert(access.reason || 'Discussions feature is not available');
      return;
    }

    try {
      // Track only once per conversation session
      if (!conversationTracked) {
        const tracked = await trackRealDiscussion(platform, {
          messageCount: 1,
          type: 'chat'
        });
        if (!tracked) {
          // If tracking fails due to limits, do not send message
          return;
        }
        setConversationTracked(true);
      }
    } catch (err) {
      console.error('[Instagram ChatModal] Discussion tracking error:', err);
      // Continue to send message even if logging fails
    }

    if (onSendMessage) {
      onSendMessage(trimmed);
    }
    setNewMessage('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(newMessage);
  };

  const handlePreemptiveQuestion = (question: string) => {
    void sendMessage(question);
  };

  // Function to extract platform-specific accounts from a message
  const findPlatformAccounts = (content: string) => {
    const matches = content.match(platformConfig.urlPattern);
    if (matches?.length) {
      return matches.map(url => ({
        url,
        username: url.replace(platformConfig.baseUrl, '')
      }));
    }
    return [];
  };

  // Function to format message content with clickable links
  const formatMessageContent = (content: string) => {
    // Replace platform-specific URLs with clickable links
    let formattedContent = content.replace(
      platformConfig.urlPattern,
      '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>'
    );
    
    // Replace other URLs
    formattedContent = formattedContent.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    return formattedContent;
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
              <div className="chat-modal-title">
                <h2>AI Discussion with {username}</h2>
                <span className="platform-indicator">{platformConfig.name}</span>
              </div>
              <button className="chat-modal-close" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="chat-messages-container">
              {messages.length === 0 ? (
                <div className="chat-no-messages">
                  <div className="chat-start-section">
                    <div className="chat-start-icon">💬</div>
                    <h3>Start an AI Discussion</h3>
                    <p>Ask questions, get strategic insights, or discuss your {platformConfig.name.toLowerCase()} growth strategy.</p>
                    
                    {/* Preemptive Questions */}
                    <div className="preemptive-questions">
                      <h4>Suggested Questions:</h4>
                      <div className="questions-grid">
                        {preemptiveQuestions.map((question, index) => (
                          <button
                            key={index}
                            className="preemptive-question-btn"
                            onClick={() => handlePreemptiveQuestion(question)}
                            disabled={isProcessing}
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => {
                  // Check if this message contains platform-specific account links
                  const foundAccounts = findPlatformAccounts(message.content);
                  
                  return (
                    <motion.div
                      key={index}
                      className={`chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="message-bubble">
                        <div 
                          className="message-content"
                          dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                        />
                        
                        {message.role === 'assistant' && foundAccounts.length > 0 && (
                          <div className="message-linked-accounts">
                            <h4>Mentioned Accounts:</h4>
                            <ul>
                              {foundAccounts.map((account, idx) => (
                                <li key={idx}>
                                  <a href={account.url} target="_blank" rel="noopener noreferrer">
                                    {platformConfig.usernamePrefix}{account.username}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {linkedAccounts.length > 0 && (
              <div className="chat-linked-accounts">
                <h3>{platformConfig.name} Accounts:</h3>
                <div className="linked-accounts-list">
                  {linkedAccounts.map((account, idx) => (
                    <a 
                      key={idx}
                      href={account.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="linked-account-pill"
                    >
                      {platformConfig.usernamePrefix}{account.username}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {onSendMessage && (
              <form className="chat-input-form" onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  className="chat-input"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Message ${username}...`}
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
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