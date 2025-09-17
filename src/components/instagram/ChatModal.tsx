import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';
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
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  onClearConversation?: () => void;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  onClose,
  messages,
  onSendMessage,
  username = 'Chat',
  isProcessing = false,
  linkedAccounts = [],
  platform = 'instagram',
  onClearConversation
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [thinkingTextIndex, setThinkingTextIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
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
  },
    linkedin: {
      name: 'LinkedIn',
      baseUrl: 'https://www.linkedin.com/in/',
      urlPattern: /https:\/\/www\.linkedin\.com\/(in|company)\/([A-Za-z0-9_.-]+)/g,
      usernamePrefix: '',
      displayName: 'LinkedIn Profile'
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
  ],
      linkedin: [
        `Draft a LinkedIn post for ${username} that positions us as thought leaders`,
        `What LinkedIn content would engage B2B audiences for ${username}?`,
        `Propose 3 ideas for a LinkedIn article for ${username}`
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

  // Lock background scroll when modal opens/closes
  useEffect(() => {
    const html = document.documentElement;
    if (open) {
      document.body.classList.add('modal-open');
      html.classList.add('modal-open');
      // Ensure overlay starts at top
      requestAnimationFrame(() => {
        if (overlayRef.current) {
          try {
            overlayRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
          } catch {
            overlayRef.current.scrollTop = 0;
            overlayRef.current.scrollLeft = 0;
          }
        }
      });
    } else {
      document.body.classList.remove('modal-open');
      html.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
      html.classList.remove('modal-open');
    };
  }, [open]);

  // Reset tracking state when modal closes so a new session can be tracked next time
  useEffect(() => {
    if (!open) {
      setConversationTracked(false);
    }
  }, [open]);

  // Thinking animation with elapsed seconds
  useEffect(() => {
    let intervalId: any = null;
    if (isProcessing) {
      const startedAt = Date.now();
      intervalId = setInterval(() => {
        setThinkingSeconds(Math.floor((Date.now() - startedAt) / 1000));
        setThinkingTextIndex(prev => (prev + 1) % 4);
      }, 1000);
    } else {
      setThinkingSeconds(0);
      setThinkingTextIndex(0);
      setLastSentMessage(null);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isProcessing]);

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
    setLastSentMessage(trimmed);
    setThinkingSeconds(0);
    setThinkingTextIndex(0);
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

  // Format message content with Markdown/JSON decoding and links
  const formatMessageContent = (content: string): string => {
    try {
      let clean = (content || '').trim();

      // JSON block
      if (clean.startsWith('{') || clean.startsWith('[')) {
        try {
          const parsed = JSON.parse(clean);
          return `<div style="background: rgba(0,0,0,0.35); padding: 12px; border-radius: 10px; overflow-x: auto; margin: 8px 0; border-left: 4px solid #00ffcc;">
            <div style="color: #00ffcc; font-size: 12px; font-weight: 600; margin-bottom: 6px;">JSON Response</div>
            <pre style="white-space: pre-wrap; font-family: 'SF Mono','Consolas',monospace; font-size: 13px; line-height: 1.4; margin: 0; color: #e8f0ff;">${JSON.stringify(parsed, null, 2)}</pre>
          </div>`;
        } catch {}
      }

      let out = clean;

      // Code blocks
      out = out.replace(/```([\s\S]*?)```/g, (_m, code) => {
        const escaped = String(code).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre style="background:#0f162a;border:1px solid rgba(0,255,204,0.15);padding:12px;border-radius:8px;overflow-x:auto;color:#eaeaff;">${escaped}</pre>`;
      });

      // Headings
      out = out.replace(/^\s*\*\*(.+?)\*\*\s*$/gm, '<div style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 8px 0;">$1</div>');
      out = out.replace(/^###\s+(.+)$/gm, '<div style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 6px 0;">$1</div>');
      out = out.replace(/^##\s+(.+)$/gm, '<div style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 8px 0;">$1</div>');
      out = out.replace(/^#\s+(.+)$/gm, '<div style="font-size: 16px; font-weight: 800; color: #ffffff; margin: 10px 0;">$1</div>');

      // Lists and links
      out = out.replace(/^\d+\.\s+(.+)$/gm, '<div style="margin:6px 0;padding-left:20px;position:relative;"><span style="position:absolute;left:0;color:#00ffcc;font-weight:600;">•</span>$1</div>');
      out = out.replace(/^[-*]\s+(.+)$/gm, '<div style="margin:6px 0;padding-left:20px;position:relative;"><span style="position:absolute;left:0;color:#00ffcc;font-weight:600;">•</span>$1</div>');
      
      // Platform URLs
      out = out.replace(platformConfig.urlPattern, '<a href="$&" target="_blank" rel="noopener noreferrer" style="color:#00ffcc;text-decoration:underline;">$&</a>');
      // Other URLs
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      out = out.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00ffcc;text-decoration:underline;">$1</a>');

      // Bold and italic
      out = out.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: #ffffff;">$1</strong>');
      out = out.replace(/(^|\s)\*(.*?)\*(?=\s|$)/g, '$1<span style="color: #00ffcc; font-weight: 500;">$2</span>');

      // Line breaks
      out = out.replace(/\n\n/g, '<br><br>');
      out = out.replace(/\n/g, '<br>');

      return out;
    } catch (error) {
      console.error('Error formatting message content:', error);
      return String(content || '').replace(/\n/g, '<br>');
    }
  };

  if (!open) return null;

  // Debug logging to verify modal rendering
  console.log('[ChatModal] Rendering modal - open:', open, 'portal target:', document.body);
  console.log('[ChatModal] Modal should be visible with classes: instagram-chat-overlay, instagram-chat-content');

  return (
    createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            className="instagram-chat-overlay"
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            
            <motion.div
              className="instagram-chat-content"
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="chat-clear-btn"
                  onClick={() => onClearConversation && onClearConversation()}
                  disabled={isProcessing}
                  title="Clear conversation"
                  style={{
                    padding: '6px 8px',
                    background: 'transparent',
                    color: '#ff7676',
                    border: '1px solid rgba(255, 118, 118, 0.4)',
                    borderRadius: 8,
                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              <button className="chat-modal-close" onClick={onClose}>
                ✕
              </button>
              </div>
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
              {/* Show pending user message while waiting */}
              {isProcessing && lastSentMessage && (
                <motion.div
                  className="chat-message user-message"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="message-bubble">
                    <div 
                      className="message-content"
                      dangerouslySetInnerHTML={{ __html: formatMessageContent(lastSentMessage) }}
                    />
                  </div>
                </motion.div>
              )}
              {/* AI thinking animation */}
              {isProcessing && (
                <motion.div
                  className="chat-message assistant-message processing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="message-bubble">
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <div style={{ fontSize: 12, color: '#a8b0cc', marginTop: 8 }}>
                        Thinking… {thinkingSeconds}s · {['Analyzing context', 'Searching insights', 'Formulating answer', 'Almost ready'][thinkingTextIndex]}
                      </div>
                    </div>
                  </div>
                </motion.div>
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
      </AnimatePresence>,
      document.body
    )
  );
};

export default ChatModal; 