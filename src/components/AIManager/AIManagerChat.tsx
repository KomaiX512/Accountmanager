/**
 * AI Manager Chat Interface
 * Universal floating chatbot accessible from anywhere
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Minimize2, Maximize2, Loader, Bot, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AIManagerRobot } from './AIManagerRobot';
import './AIManagerChat.css';
import { getGeminiService, AIMessage } from '../../services/AIManager/geminiService';
import { operationExecutor } from '../../services/AIManager/operationExecutor';
import { OperationContext } from '../../services/AIManager/operationRegistry';

interface AIManagerChatProps {
  initialContext?: Partial<OperationContext>;
}

export const AIManagerChat: React.FC<AIManagerChatProps> = ({ initialContext }) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [context, setContext] = useState<Partial<OperationContext>>(initialContext || {});
  const [showGreeting, setShowGreeting] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState('');
  const [robotName, setRobotName] = useState<string>('AI Manager');
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamically generate suggestions based on user context
  const suggestedPrompts = useMemo(() => {
    const userId = currentUser?.uid;
    
    // Check acquired platforms
    const acquiredPlatforms = [];
    if (userId) {
      if (localStorage.getItem(`twitter_accessed_${userId}`)) acquiredPlatforms.push('twitter');
      if (localStorage.getItem(`instagram_accessed_${userId}`)) acquiredPlatforms.push('instagram');
      if (localStorage.getItem(`facebook_accessed_${userId}`)) acquiredPlatforms.push('facebook');
      if (localStorage.getItem(`linkedin_accessed_${userId}`)) acquiredPlatforms.push('linkedin');
    }

    const hasNoPlatforms = acquiredPlatforms.length === 0;
    const primaryPlatform = acquiredPlatforms[0] || 'twitter';

    const suggestions = [];

    // NEW USER PROMPTS (no platforms acquired yet)
    if (hasNoPlatforms) {
      suggestions.push(
        { icon: '🚀', text: 'How do I get started?', category: 'onboarding' },
        { icon: '🎯', text: 'Acquire Twitter platform', category: 'acquire' },
        { icon: '📱', text: 'Acquire Instagram platform', category: 'acquire' },
        { icon: '💼', text: 'Acquire LinkedIn platform', category: 'acquire' },
        { icon: '👥', text: 'Acquire Facebook platform', category: 'acquire' },
        { icon: '💰', text: 'Show me pricing plans', category: 'navigation' },
        { icon: '📖', text: 'What can you do for me?', category: 'info' },
        { icon: '🎓', text: 'Explain platform features', category: 'info' },
        { icon: '✨', text: 'What is Sentient Marketing?', category: 'info' },
        { icon: '🔧', text: 'Help me connect social accounts', category: 'onboarding' }
      );
    } 
    // EXISTING USER PROMPTS (has platforms)
    else {
      // Status & Analytics
      suggestions.push(
        { icon: '📊', text: `Show my ${primaryPlatform} analytics`, category: 'analytics' },
        { icon: '📈', text: `Tell me my ${primaryPlatform} stats`, category: 'analytics' },
        { icon: '🎯', text: "What's my status across all platforms?", category: 'info' }
      );

      // News & Trending
      suggestions.push(
        { icon: '📰', text: `Show today's trending news for ${primaryPlatform}`, category: 'news' },
        { icon: '🔥', text: `What's trending on ${primaryPlatform} today?`, category: 'news' }
      );

      // Content Creation
      suggestions.push(
        { icon: '✨', text: `Create post from today's trending news`, category: 'create' },
        { icon: '🎨', text: `Create ${primaryPlatform} post about AI`, category: 'create' },
        { icon: '📝', text: `Generate post ideas for ${primaryPlatform}`, category: 'create' }
      );

      // Competitor Analysis
      suggestions.push(
        { icon: '🔍', text: `Analyze my ${primaryPlatform} competitors`, category: 'analysis' },
        { icon: '📊', text: `Show competitor insights for ${primaryPlatform}`, category: 'analysis' }
      );

      // Navigation & Multi-platform
      if (acquiredPlatforms.length > 1) {
        suggestions.push(
          { icon: '🔄', text: 'Compare all my platform analytics', category: 'analytics' }
        );
      }

      // Strategy
      suggestions.push(
        { icon: '💡', text: `Recommend ${primaryPlatform} strategies`, category: 'strategy' },
        { icon: '🎯', text: 'What should I post today?', category: 'recommendation' }
      );

      // Add more platforms if needed
      acquiredPlatforms.slice(1, 3).forEach(platform => {
        suggestions.push(
          { icon: '🐦', text: `Open ${platform} dashboard`, category: 'navigation' }
        );
      });
    }

    // Limit to 15 suggestions
    return suggestions.slice(0, 15);
  }, [currentUser?.uid, context.platform]);

  // Load robot name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('robot_mascot_name');
    if (savedName) {
      setRobotName(savedName);
      console.log('🤖 Robot name loaded:', savedName);
    }
  }, []);

  // Debug render
  console.log('🤖 AIManagerChat RENDERED', {
    isOpen,
    currentUser: !!currentUser,
    context,
    robotName
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Generate greeting message based on time and last visit
  useEffect(() => {
    const generateGreeting = () => {
      const now = new Date();
      const hour = now.getHours();
      
      // Greeting based on time of day
      let timeGreeting = '';
      if (hour >= 5 && hour < 12) {
        timeGreeting = 'Good morning';
      } else if (hour >= 12 && hour < 17) {
        timeGreeting = 'Good afternoon';
      } else if (hour >= 17 && hour < 22) {
        timeGreeting = 'Good evening';
      } else {
        timeGreeting = 'Good night';
      }
      
      // Calculate time since last visit
      const lastVisitKey = 'ai_manager_last_visit';
      const lastVisitStr = localStorage.getItem(lastVisitKey);
      let timeSinceVisit = '';
      
      if (lastVisitStr) {
        const lastVisit = new Date(lastVisitStr);
        const diffMs = now.getTime() - lastVisit.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) {
          timeSinceVisit = `You came after ${diffDays} ${diffDays === 1 ? 'day' : 'days'}! `;
        } else if (diffHours > 0) {
          timeSinceVisit = `You came after ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}! `;
        } else if (diffMinutes > 5) {
          timeSinceVisit = `You came after ${diffMinutes} minutes! `;
        } else {
          timeSinceVisit = 'Welcome back! ';
        }
      } else {
        timeSinceVisit = 'Welcome! ';
      }
      
      // Update last visit
      localStorage.setItem(lastVisitKey, now.toISOString());
      
      setGreetingMessage(`${timeGreeting}! ${timeSinceVisit}Order me boss to execute anything!!!`);
    };
    
    generateGreeting();
  }, []);

  // Initialize Gemini service with context awareness
  useEffect(() => {
    const initGemini = async () => {
      try {
        const { getGeminiService } = await import('../../services/AIManager/geminiService');
        const { contextService } = await import('../../services/AIManager/contextService');
        
        // Rely on Gemini service already initialized in App.tsx via /api/config/gemini-key
        const service = getGeminiService();
        
        if (!service) {
          console.warn('⚠️ [AIManager] Gemini service not initialized yet. Waiting for App.tsx initialization.');
          return;
        }
        
        // Initialize with user context
        const userId = currentUser?.uid || 'test-user';
        const userName = initialContext?.username || localStorage.getItem('accountHolder') || 'user';
        
        console.log('🔍 [AIManager] Initializing with:', { userId, userName, currentUser: !!currentUser });
        
        await service.initialize(userId);
        
        // Generate personalized greeting
        const userContext = await contextService.getUserContext(userId);
        userContext.username = userName; // Override with actual username
        const greeting = await contextService.generateGreeting(userContext);
        
        console.log('✅ [AIManager] Context loaded:', userContext);
        
        // Add initial greeting message
        setMessages([{
          role: 'assistant',
          content: greeting,
          timestamp: new Date()
        }]);
        
        console.log('🤖 AI Manager Gemini initialized with context');
      } catch (error) {
        console.error('Failed to initialize Gemini:', error);
      }
    };
    
    initGemini();
  }, [currentUser, initialContext?.username]);

  // Update context when location changes
  useEffect(() => {
    const updateContext = () => {
      const path = window.location.pathname;
      const platformMatch = path.match(/\/dashboard\/(\w+)/);
      
      if (platformMatch) {
        setContext(prev => ({
          ...prev,
          platform: platformMatch[1] as any,
          currentPage: path
        }));
      } else {
        setContext(prev => ({
          ...prev,
          currentPage: path
        }));
      }

      // Get username from localStorage
      const accountHolder = localStorage.getItem('accountHolder');
      if (accountHolder) {
        setContext(prev => ({
          ...prev,
          username: accountHolder
        }));
      }
    };

    updateContext();
    
    // Listen for navigation changes
    window.addEventListener('popstate', updateContext);
    return () => window.removeEventListener('popstate', updateContext);
  }, []);

  // Welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: AIMessage = {
        role: 'assistant',
        content: `👋 Hi! I'm ${robotName}, your smartest SMM! I can help you with:\n\n• **Status & Analytics** - Check your platform stats\n• **Navigation** - Open any dashboard\n• **Creating posts** - Generate engaging content\n• **Platform Management** - Connect and manage accounts\n\n💡 **Try clicking a suggestion below or ask me anything!**`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
      setShowSuggestions(true);
    }
  }, [isOpen, robotName]);

  const handleSuggestedPrompt = (promptText: string) => {
    setInput(promptText);
    setTimeout(() => handleSend(), 50);
  };

  const handleSend = async () => {
    const userMessage = input.trim();
    if (!userMessage || isProcessing) return;

    setInput('');
    setIsProcessing(true);
    setShowSuggestions(false); // Hide suggestions after first message

    try {
      const geminiService = getGeminiService();
      
      if (!geminiService) {
        throw new Error('AI service not initialized');
      }
      
      // Add user message to UI
      const userMsg: AIMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMsg]);

      // Get user ID
      const userId = currentUser?.uid || 'anonymous';

      // Process message with Gemini
      const assistantMessage = await geminiService.processMessage(
        userId,
        userMessage,
        {
          ...context,
          userId,
          username: context.username || localStorage.getItem('accountHolder') || undefined
        }
      );

      // Add assistant message to UI
      setMessages(prev => [...prev, assistantMessage]);

      // Execute any operations detected
      if (assistantMessage.operationCalls && assistantMessage.operationCalls.length > 0) {
        for (const operationCall of assistantMessage.operationCalls) {
          try {
            // Show detailed loading state based on operation type
            const operationName = operationCall.operationId.replace(/_/g, ' ');
            const platform = operationCall.parameters.platform || context.platform || 'instagram';
            const username = context.username || localStorage.getItem('accountHolder') || 'user';
            
            let loadingContent = '';
            if (operationCall.operationId === 'get_competitor_analysis') {
              loadingContent = `📂 Opening competitor analysis files...\n🔍 Reading: competitor_analysis/${platform}/${username}/\n⏳ Analyzing competitive landscape with AI...`;
            } else if (operationCall.operationId === 'get_news_summary') {
              loadingContent = `📂 Opening trending news files...\n🔍 Reading: news_for_you/${platform}/${username}/\n⏳ Generating AI-powered summary...`;
            } else if (operationCall.operationId === 'get_analytics') {
              loadingContent = `📂 Opening analytics files...\n🔍 Reading: UserInstagramStatus/${username}/status.json\n⏳ Calculating metrics...`;
            } else if (operationCall.operationId === 'create_post') {
              loadingContent = `📂 Preparing post generation...\n🎨 Calling RAG server with ChromaDB...\n⏳ Generating content and image (30s)...`;
            } else {
              loadingContent = `📂 Opening files and loading data for ${operationName}...`;
            }
            
            const loadingMessage: AIMessage = {
              role: 'assistant',
              content: loadingContent,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, loadingMessage]);

            const result = await operationExecutor.execute(
              operationCall.operationId,
              operationCall.parameters,
              {
                userId,
                platform: context.platform,
                username: context.username || localStorage.getItem('accountHolder') || undefined,
                currentPage: context.currentPage
              }
            );

            // Remove loading message and add result
            setMessages(prev => prev.filter(msg => msg !== loadingMessage));

            // Update operation result in conversation
            geminiService.updateOperationResult(
              userId,
              operationCall.operationId,
              result
            );

            // Add result message
            const resultMessage: AIMessage = {
              role: 'assistant',
              content: result.success 
                ? `${result.message}${result.nextSteps ? '\n\n**Next steps:**\n' + result.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') : ''}`
                : `⚠️ ${result.message}`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, resultMessage]);

          } catch (error: any) {
            const errorMessage: AIMessage = {
              role: 'assistant',
              content: `❌ Error executing operation: ${error.message}`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
          }
        }
      }

    } catch (error: any) {
      const errorMessage: AIMessage = {
        role: 'assistant',
        content: `❌ I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const clearChatHistory = () => {
    if (confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
      setMessages([]);
      console.log('🗑️ [AI Manager] Chat history cleared');
      
      // Clear conversation memory in Gemini service
      const service = getGeminiService();
      if (service && currentUser?.uid) {
        service.clearConversation();
        console.log('🗑️ [AI Manager] Gemini conversation memory cleared');
      }
    }
  };

  const formatMessage = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('• **') || line.match(/^\d+\./)) {
          return <li key={i} className="ai-message-list-item">{line.replace(/^[•\d.]\s*/, '')}</li>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <strong key={i} className="ai-message-bold">{line.slice(2, -2)}</strong>;
        }
        return <p key={i} className="ai-message-paragraph">{line}</p>;
      });
  };

  // Render using Portal to ensure it's outside App div and always on top
  const content = (
    <>
      {/* Floating Toggle Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="ai-manager-button-container"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            style={{ position: 'fixed', bottom: '30px', left: '30px', zIndex: 999999 }}
          >
            {/* 3D AI Robot Mascot */}
            <AIManagerRobot
              onHover={setShowGreeting}
              onClick={() => setIsOpen(true)}
            />
            
            {/* Greeting Bubble */}
            <AnimatePresence>
              {showGreeting && greetingMessage && (
                <motion.div
                  className="ai-manager-greeting-bubble"
                  initial={{ opacity: 0, x: 20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.8 }}
                  transition={{ type: 'spring', damping: 20 }}
                >
                  <div className="greeting-text typing-animation">
                    {greetingMessage}
                  </div>
                  <div className="greeting-arrow" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={`ai-manager-window ${isMinimized ? 'minimized' : ''}`}
            initial={{ scale: 0.8, opacity: 0, y: 100 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25 }}
          >
            {/* Header */}
            <div className="ai-manager-header">
              <div className="ai-manager-header-left">
                <div className="ai-manager-avatar">
                  <Bot size={20} />
                </div>
                <div className="ai-manager-title">
                  <h3>{robotName}</h3>
                  <span className="ai-manager-status">
                    {isProcessing ? 'Thinking...' : 'Online'}
                  </span>
                </div>
              </div>
              <div className="ai-manager-header-actions">
                <button
                  className="ai-manager-header-btn"
                  onClick={clearChatHistory}
                  title="Delete chat history"
                  disabled={messages.length === 0}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className="ai-manager-header-btn"
                  onClick={toggleMinimize}
                  title={isMinimized ? 'Maximize' : 'Minimize'}
                >
                  {isMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                </button>
                <button
                  className="ai-manager-header-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            {!isMinimized && (
              <>
                <div className="ai-manager-messages">
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      className={`ai-message ${msg.role}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="ai-message-content">
                        {formatMessage(msg.content)}
                      </div>
                      <div className="ai-message-timestamp">
                        {msg.timestamp.toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))}
                  {isProcessing && (
                    <motion.div
                      className="ai-message assistant"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="ai-message-loader">
                        <Loader className="spinner" size={16} />
                        <span>Processing...</span>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Suggested Prompts - Always Visible */}
                {showSuggestions && (
                  <div className="ai-manager-suggestions">
                    <div className="suggestions-label">
                      💡 Quick Actions
                      <button 
                        className="suggestions-toggle"
                        onClick={() => setShowSuggestions(false)}
                        title="Hide suggestions"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="suggestions-grid">
                      {suggestedPrompts.map((prompt, idx) => (
                        <button
                          key={idx}
                          className="suggestion-chip"
                          onClick={() => handleSuggestedPrompt(prompt.text)}
                          disabled={isProcessing}
                          title={prompt.text}
                        >
                          <span className="suggestion-icon">{prompt.icon}</span>
                          <span className="suggestion-text">{prompt.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Context Display */}
                {(context.platform || context.username) && (
                  <div className="ai-manager-context">
                    {context.platform && (
                      <span className="context-tag">
                        📱 {context.platform}
                      </span>
                    )}
                    {context.username && (
                      <span className="context-tag">
                        👤 @{context.username}
                      </span>
                    )}
                  </div>
                )}

                {/* Input */}
                <div className="ai-manager-input-container">
                  <input
                    ref={inputRef}
                    type="text"
                    className="ai-manager-input"
                    placeholder="Ask me to do anything..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isProcessing}
                  />
                  <button
                    className="ai-manager-send"
                    onClick={handleSend}
                    disabled={!input.trim() || isProcessing}
                  >
                    <Send size={20} />
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // Use Portal to render outside the App div, directly to body
  return createPortal(content, document.body);
};
