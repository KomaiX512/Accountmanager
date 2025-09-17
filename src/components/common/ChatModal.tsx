import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X, Loader2, Trash2 } from 'lucide-react';
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
  onSendMessage: (message: string, model?: string) => void;
  isProcessing?: boolean;
  platform?: string;
  suggestedQuestions?: string[];
  onClearConversation?: () => void;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  messages,
  onClose,
  username,
  onSendMessage,
  isProcessing = false,
  platform = 'instagram',
  suggestedQuestions,
  onClearConversation
}) => {
  const [message, setMessage] = useState('');
  const [conversationTracked, setConversationTracked] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [thinkingTextIndex, setThinkingTextIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { trackRealDiscussion, canUseFeature } = useFeatureTracking();

  // Gemini model configuration removed – single default model is now used.

  // Derive 5 context-aware defaults if not provided by parent
  const defaultSuggestions = useMemo(() => {
    const lower = (platform || 'instagram').toLowerCase();
    const who = username || 'manager';
    if (lower.includes('instagram')) {
      return [
        `Give me 10 trending hashtags for ${who}`,
        'Write 3 caption ideas with a strong hook',
        'Best time to post this week and why?',
        'Suggest a carousel content plan for tomorrow',
        'How can we improve reach from our last post?'
      ];
    }
    if (lower.includes('twitter')) {
      return [
        'Draft 3 engaging tweets on our latest update',
        'What are trending topics to join today?',
        'Create a 5-tweet thread outline',
        'Propose 10 high-relevance hashtags',
        'What is the best posting schedule this week?'
      ];
    }
    return [
      'Summarize key insights from recent comments',
      'Suggest 3 post ideas for higher engagement',
      'What\'s a good CTA that fits our brand?',
      'Create a short copy for a product spotlight',
      'How to increase saves and shares fast?'
    ];
  }, [platform, username]);
  const quickQuestions = (suggestedQuestions && suggestedQuestions.length > 0)
    ? suggestedQuestions.slice(0, 5)
    : defaultSuggestions;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;

    console.log(`[ChatModal] 🚀 SUBMIT STARTED: platform=${platform}, model=default, message="${trimmed.substring(0, 50)}..."`);

    const discussionAccessCheck = canUseFeature('discussions');
    if (!discussionAccessCheck.allowed) {
      console.warn(`[ChatModal] 🚫 DISCUSSION BLOCKED:`, discussionAccessCheck.reason);
      alert(discussionAccessCheck.reason || 'Discussions feature is not available');
      return;
    }

    // Clear input immediately for snappy UX
    setMessage('');
    setLastSentMessage(trimmed);
    setThinkingSeconds(0);
    setThinkingTextIndex(0);

    try {
      // ✅ TRACK ONLY ONCE PER CONVERSATION: Prevent multiple discussion increments for same chat session
      const sessionId = Math.random().toString(36).substr(2, 9);
      console.log(`[ChatModal] 🔍 TRACKING CHECK [${sessionId}]: conversationTracked=${conversationTracked}, platform=${platform}`);
      
      if (!conversationTracked) {
        console.log(`[ChatModal] 🚀 STARTING DISCUSSION TRACKING [${sessionId}] for platform: ${platform}`);
        const trackingSuccess = await trackRealDiscussion(platform, {
          messageCount: 1, // Always count as 1 discussion, not per message
          type: 'chat'
        });
        if (!trackingSuccess) {
          console.warn(`[ChatModal] 🚫 Tracking failed [${sessionId}], aborting message send`);
          return;
        }
        setConversationTracked(true);
        console.log(`[ChatModal] ✅ Discussion tracked once [${sessionId}] for this conversation session`);
      } else {
        console.log(`[ChatModal] ℹ️ Conversation already tracked [${sessionId}], continuing without additional tracking`);
      }
    } catch (trackingError) {
      console.error(`[ChatModal] ❌ Discussion tracking error:`, trackingError);
      // continue anyway
    }

    // Send message
    onSendMessage(trimmed);
  }, [canUseFeature, isProcessing, messages.length, onSendMessage, platform, trackRealDiscussion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Model toggle removed

  // Format message content for better display and JSON/Markdown handling
  const formatMessageContent = (content: string): string => {
    try {
      let cleanContent = (content || '').trim();

      // Try to detect and format full JSON responses
      if (cleanContent.startsWith('{') || cleanContent.startsWith('[')) {
        try {
          const parsed = JSON.parse(cleanContent);
          return `<div style="background: rgba(0,0,0,0.4); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 8px 0; border-left: 4px solid #00ffcc;">
            <div style="color: #00ffcc; font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">JSON Response</div>
            <pre style="white-space: pre-wrap; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; font-size: 13px; line-height: 1.4; margin: 0; color: #e8e8ff;">${JSON.stringify(parsed, null, 2)}</pre>
          </div>`;
        } catch (e) {
          // Not valid JSON; continue to Markdown formatting
        }
      }

      let formattedContent = cleanContent;

      // Code blocks ``` ```
      formattedContent = formattedContent.replace(/```([\s\S]*?)```/g, (_m, code) => {
        const escaped = String(code)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<pre style="background: #0f162a; border: 1px solid rgba(0,255,204,0.15); padding: 12px; border-radius: 8px; overflow-x: auto; color: #eaeaff;">${escaped}</pre>`;
      });

      // Headings
      formattedContent = formattedContent.replace(/^\s*\*\*(.+?)\*\*\s*$/gm, '<div style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 8px 0;">$1</div>');
      formattedContent = formattedContent.replace(/^###\s+(.+)$/gm, '<div style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 6px 0;">$1</div>');
      formattedContent = formattedContent.replace(/^##\s+(.+)$/gm, '<div style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 8px 0;">$1</div>');
      formattedContent = formattedContent.replace(/^#\s+(.+)$/gm, '<div style="font-size: 16px; font-weight: 800; color: #ffffff; margin: 10px 0;">$1</div>');

      // Numbered and bullet lists
      formattedContent = formattedContent.replace(/^\d+\.\s+(.+)$/gm, '<div style="margin: 6px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #00ffcc; font-weight: 600;">•</span>$1</div>');
      formattedContent = formattedContent.replace(/^[-*]\s+(.+)$/gm, '<div style="margin: 6px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #00ffcc; font-weight: 600;">•</span>$1</div>');

      // URLs to clickable links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      formattedContent = formattedContent.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #00ffcc; text-decoration: underline; font-weight: 500;">$1<\/a>');

      // Bold and italic
      formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: #ffffff;">$1<\/strong>');
      formattedContent = formattedContent.replace(/(^|\s)\*(.*?)\*(?=\s|$)/g, '$1<span style="color: #00ffcc; font-weight: 500;">$2<\/span>');

      // Line breaks
      formattedContent = formattedContent.replace(/\n\n/g, '<br><br>');
      formattedContent = formattedContent.replace(/\n/g, '<br>');

      return formattedContent;
    } catch (error) {
      console.error('Error formatting message content:', error);
      return String(content || '').replace(/\n/g, '<br>');
    }
  };

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

  // Lock background scroll when modal opens
  useEffect(() => {
    const html = document.documentElement;
    if (open) {
      document.body.classList.add('modal-open');
      html.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
      html.classList.remove('modal-open');
    }
    
    return () => {
      document.body.classList.remove('modal-open');
      html.classList.remove('modal-open');
    };
  }, [open]);

  // Model variables removed

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="chat-modal-overlay"
          ref={overlayRef}
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
            {/* ENHANCED HEADER WITH MODEL SWITCHER */}
            <div className="chat-modal-header">
              <div className="chat-header-info">
                <div className="chat-mode-indicator">
                  <MessageCircle size={16} className="mode-icon discussion-icon" />
                  <h3>AI Discussion with {username}</h3>
                </div>
                <div className="header-controls">
                  <span className="platform-badge">{platform}</span>
                  {/* Clear conversation button */}
                  <button
                    type="button"
                    className="chat-clear-btn"
                    onClick={() => onClearConversation && onClearConversation()}
                    disabled={!!isProcessing}
                    aria-label="Clear conversation"
                    title="Clear conversation"
                    style={{
                      marginLeft: 8,
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
                </div>
              </div>
              <button 
                className="chat-close-btn" 
                onClick={onClose}
                aria-label="Close chat"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* Model status bar removed */}

            {/* MAXIMIZED MESSAGES AREA */}
            <div className="chat-messages">
              {messages.length === 0 ? (
                <motion.div 
                  className="welcome-message"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="welcome-icon" style={{display:'none'}}>
                    <MessageCircle size={32} className="mode-icon-large" />
                  </div>
                  <h4 style={{textAlign:'left', marginBottom: 4}}>Start an AI Discussion</h4>
                  <p style={{textAlign:'left'}}>Ask questions, get strategic insights, or discuss your {platform} growth strategy.</p>
                  {/* Model capability hint removed */}
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
              {/* Show pending user message while waiting */}
              {isProcessing && lastSentMessage && (
                <motion.div
                  className="message user"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{ __html: formatMessageContent(lastSentMessage) }}
                  />
                </motion.div>
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
                    <div style={{ fontSize: 12, color: '#a8b0cc' }}>
                      Thinking… {thinkingSeconds}s · {['Analyzing context', 'Searching insights', 'Formulating answer', 'Almost ready'][thinkingTextIndex]}
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick question chips */}
            <div className="quick-questions" aria-hidden={!!message.trim()}>
              {!message.trim() && quickQuestions.map((q, i) => (
                <button
                  key={`${i}-${q}`}
                  type="button"
                  className="quick-question-chip"
                  disabled={isProcessing}
                  onClick={() => sendMessage(q)}
                  title={q}
                >
                  {q}
                </button>
              ))}
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
    </AnimatePresence>,
    document.body
  );

};

export default ChatModal;