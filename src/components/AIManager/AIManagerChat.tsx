/**
 * AI Manager Chat Interface
 * Universal floating chatbot accessible from anywhere
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, Bot } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AIManagerRobot } from './AIManagerRobot';
import { AIManagerNotification } from './AIManagerNotification';
import './AIManagerChat.css';
import { getGeminiService, AIMessage } from '../../services/AIManager/geminiService';
import { operationExecutor } from '../../services/AIManager/operationExecutor';
import { OperationContext } from '../../services/AIManager/operationRegistry';
import axios from 'axios';
import { getApiUrl } from '../../config/api';

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
  const chatWindowRef = useRef<HTMLDivElement>(null);

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
        { icon: 'fas fa-rocket', text: 'How do I get started?', category: 'onboarding' },
        { icon: 'fab fa-twitter', text: 'Acquire Twitter platform', category: 'acquire' },
        { icon: 'fab fa-instagram', text: 'Acquire Instagram platform', category: 'acquire' },
        { icon: 'fab fa-linkedin', text: 'Acquire LinkedIn platform', category: 'acquire' },
        { icon: 'fab fa-facebook', text: 'Acquire Facebook platform', category: 'acquire' },
        { icon: 'fas fa-dollar-sign', text: 'Show me pricing plans', category: 'navigation' },
        { icon: 'fas fa-book-open', text: 'What can you do for me?', category: 'info' },
        { icon: 'fas fa-graduation-cap', text: 'Explain platform features', category: 'info' },
        { icon: 'fas fa-magic', text: 'What is Sentient Marketing?', category: 'info' },
        { icon: 'fas fa-cogs', text: 'Help me connect social accounts', category: 'onboarding' }
      );
    } 
    // EXISTING USER PROMPTS (has platforms)
    else {
      // Status & Analytics
      suggestions.push(
        { icon: 'fas fa-chart-bar', text: `Show my ${primaryPlatform} analytics`, category: 'analytics' },
        { icon: 'fas fa-chart-line', text: `Tell me my ${primaryPlatform} stats`, category: 'analytics' },
        { icon: 'fas fa-crosshairs', text: "What's my status across all platforms?", category: 'info' }
      );

      // News & Trending
      suggestions.push(
        { icon: 'fas fa-newspaper', text: `Show today's trending news for ${primaryPlatform}`, category: 'news' },
        { icon: 'fas fa-fire', text: `What's trending on ${primaryPlatform} today?`, category: 'news' }
      );

      // Content Creation
      suggestions.push(
        { icon: 'fas fa-magic', text: `Create post from today's trending news`, category: 'create' },
        { icon: 'fas fa-palette', text: `Create ${primaryPlatform} post about AI`, category: 'create' },
        { icon: 'fas fa-edit', text: `Generate post ideas for ${primaryPlatform}`, category: 'create' }
      );

      // Competitor Analysis
      suggestions.push(
        { icon: 'fas fa-search', text: `Analyze my ${primaryPlatform} competitors`, category: 'analysis' },
        { icon: 'fas fa-chart-pie', text: `Show competitor insights for ${primaryPlatform}`, category: 'analysis' }
      );

      // Navigation & Multi-platform
      if (acquiredPlatforms.length > 1) {
        suggestions.push(
          { icon: 'fas fa-sync-alt', text: 'Compare all my platform analytics', category: 'analytics' }
        );
      }

      // Strategy
      suggestions.push(
        { icon: 'fas fa-lightbulb', text: `Recommend ${primaryPlatform} strategies`, category: 'strategy' },
        { icon: 'fas fa-bullseye', text: 'What should I post today?', category: 'recommendation' }
      );

      // Add more platforms if needed
      acquiredPlatforms.slice(1, 3).forEach(platform => {
        const platformIcon = platform === 'twitter' ? 'fab fa-twitter' :
                           platform === 'instagram' ? 'fab fa-instagram' :
                           platform === 'facebook' ? 'fab fa-facebook' :
                           platform === 'linkedin' ? 'fab fa-linkedin' : 'fas fa-share-alt';
        suggestions.push(
          { icon: platformIcon, text: `Open ${platform} dashboard`, category: 'navigation' }
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

  // CRITICAL: Force AI Manager to be viewport-fixed regardless of parent CSS
  useEffect(() => {
    const styleId = 'ai-manager-viewport-fix';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        /* ULTRA-ROBUST: Force AI Manager viewport positioning */
        .ai-manager-button-container,
        .ai-manager-window,
        .ai-manager-greeting-bubble {
          position: fixed !important;
          transform: translateZ(0) !important;
          isolation: isolate !important;
          contain: none !important;
          z-index: 2147483647 !important;
          backface-visibility: visible !important;
          perspective: none !important;
          transform-style: flat !important;
        }
        
        /* SPECIFIC CHAT WINDOW FIXES */
        .ai-manager-window {
          position: fixed !important;
          bottom: 30px !important;
          left: 30px !important;
          top: auto !important;
          right: auto !important;
          margin: 0 !important;
          transform: translateZ(0) !important;
          isolation: isolate !important;
          contain: none !important;
          z-index: 2147483647 !important;
          backface-visibility: visible !important;
          perspective: none !important;
          transform-style: flat !important;
        }
        
        /* MAXIMUM SPECIFICITY FOR CHAT WINDOW */
        html body .ai-manager-window,
        body .ai-manager-window,
        .ai-manager-window {
          position: fixed !important;
          bottom: 30px !important;
          left: 30px !important;
          top: auto !important;
          right: auto !important;
          margin: 0 !important;
          transform: translateZ(0) !important;
          isolation: isolate !important;
          contain: none !important;
          z-index: 2147483647 !important;
        }
        
        /* Neutralize any parent transforms */
        html:has(.ai-manager-button-container),
        body:has(.ai-manager-button-container),
        #root:has(.ai-manager-button-container),
        .pricing-page:has(.ai-manager-button-container),
        .privacy-policy-page:has(.ai-manager-button-container),
        .dashboard-page:has(.ai-manager-button-container),
        .homepage:has(.ai-manager-button-container) {
          transform: none !important;
          perspective: none !important;
          contain: none !important;
        }
        
        /* CRITICAL: Override any page-specific positioning that might affect chat window */
        .pricing-page .ai-manager-window,
        .privacy-policy-page .ai-manager-window,
        .dashboard-page .ai-manager-window,
        .homepage .ai-manager-window {
          position: fixed !important;
          bottom: 30px !important;
          left: 30px !important;
          top: auto !important;
          right: auto !important;
          margin: 0 !important;
          transform: translateZ(0) !important;
          isolation: isolate !important;
          contain: none !important;
          z-index: 2147483647 !important;
        }
      `;
      document.head.appendChild(styleElement);
      console.log('🔧 [AI Manager] Viewport positioning fix applied');
      
      // Debug: Log current positioning info
      const debugInfo = () => {
        const container = document.querySelector('.ai-manager-button-container');
        const chatWindow = document.querySelector('.ai-manager-window');
        
        if (container) {
          const computedStyle = window.getComputedStyle(container);
          console.log('🔍 [AI Manager] Button container positioning:', {
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            transform: computedStyle.transform,
            isolation: computedStyle.isolation,
            contain: computedStyle.contain,
            isViewportFixed: computedStyle.position === 'fixed'
          });
        }
        
        if (chatWindow) {
          const computedStyle = window.getComputedStyle(chatWindow);
          console.log('🔍 [AI Manager] Chat window positioning:', {
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            transform: computedStyle.transform,
            isolation: computedStyle.isolation,
            contain: computedStyle.contain,
            isViewportFixed: computedStyle.position === 'fixed',
            bottom: computedStyle.bottom,
            left: computedStyle.left,
            top: computedStyle.top,
            right: computedStyle.right
          });
        }
      };
      
      // Debug after a short delay to ensure styles are applied
      setTimeout(debugInfo, 100);
      
      // ULTRA-ROBUST: Monitor for chat window creation and force positioning
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.classList?.contains('ai-manager-window') || 
                  element.querySelector?.('.ai-manager-window')) {
                setTimeout(() => {
                  const chatWindow = element.classList?.contains('ai-manager-window') 
                    ? element as HTMLElement 
                    : element.querySelector('.ai-manager-window') as HTMLElement;
                  
                  if (chatWindow) {
                    // Remove any existing inline styles first
                    chatWindow.removeAttribute('style');
                    chatWindow.style.cssText = `
                      position: fixed !important;
                      bottom: 30px !important;
                      left: 30px !important;
                      top: auto !important;
                      right: auto !important;
                      margin: 0 !important;
                      transform: translateZ(0) !important;
                      isolation: isolate !important;
                      contain: none !important;
                      z-index: 2147483647 !important;
                      backface-visibility: visible !important;
                      perspective: none !important;
                      transform-style: flat !important;
                    `;
                    console.log('🔧 [AI Manager] Chat window positioning forced via MutationObserver (Framer Motion override)');
                  }
                }, 10);
              }
            }
          });
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Store observer for cleanup
      (window as any).aiManagerObserver = observer;
    }

    return () => {
      // Clean up when component unmounts
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
        console.log('🔧 [AI Manager] Viewport positioning fix removed');
      }
      
      // Clean up MutationObserver
      if ((window as any).aiManagerObserver) {
        (window as any).aiManagerObserver.disconnect();
        delete (window as any).aiManagerObserver;
        console.log('🔧 [AI Manager] MutationObserver cleaned up');
      }
    };
  }, []);

  // AI Manager render status (minimal logging)
  console.log('🤖 AI Manager active on:', window.location.pathname);
  
  // AI Manager is working correctly - debug logging removed

  // Auto-scroll to bottom
  useEffect(() => {
    const container = document.querySelector('.ai-manager-messages') as HTMLDivElement | null;
    if (container) {
      try {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } catch {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      const el = inputRef.current;
      if (el) {
        try {
          (el as any).focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body as HTMLBodyElement & { dataset: { aiScrollY?: string } };
    if (isOpen) {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.dataset.aiScrollY = String(scrollY);
      html.classList.add('ai-manager-open');
      body.classList.add('ai-manager-open');
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    } else {
      const y = parseInt(body.dataset.aiScrollY || '0', 10);
      html.classList.remove('ai-manager-open');
      body.classList.remove('ai-manager-open');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      if (!Number.isNaN(y)) {
        window.scrollTo(0, y);
      }
      delete body.dataset.aiScrollY;
    }

    return () => {
      const y = parseInt(document.body.dataset.aiScrollY || '0', 10);
      document.documentElement.classList.remove('ai-manager-open');
      document.body.classList.remove('ai-manager-open');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      if (!Number.isNaN(y)) {
        window.scrollTo(0, y);
      }
      delete (document.body as any).dataset.aiScrollY;
    };
  }, [isOpen]);

  // CRITICAL: Force chat window to be viewport-fixed when opened
  useEffect(() => {
    if (isOpen) {
      const forceChatWindowPosition = () => {
        const chatWindow = document.querySelector('.ai-manager-window');
        if (chatWindow) {
          // Apply inline styles to override any CSS conflicts and Framer Motion transforms
          (chatWindow as HTMLElement).style.cssText = `
            position: fixed !important;
            bottom: 30px !important;
            left: 30px !important;
            top: auto !important;
            right: auto !important;
            margin: 0 !important;
            transform: translateZ(0) !important;
            isolation: isolate !important;
            contain: none !important;
            z-index: 2147483647 !important;
            backface-visibility: visible !important;
            perspective: none !important;
            transform-style: flat !important;
          `;
          
          // Also override any Framer Motion inline styles
          (chatWindow as HTMLElement).removeAttribute('style');
          (chatWindow as HTMLElement).style.cssText = `
            position: fixed !important;
            bottom: 30px !important;
            left: 30px !important;
            top: auto !important;
            right: auto !important;
            margin: 0 !important;
            transform: translateZ(0) !important;
            isolation: isolate !important;
            contain: none !important;
            z-index: 2147483647 !important;
            backface-visibility: visible !important;
            perspective: none !important;
            transform-style: flat !important;
          `;
          
          console.log('🔧 [AI Manager] Chat window positioning forced via inline styles (Framer Motion override)');
        }
      };

      // Apply immediately and after multiple delays to catch Framer Motion
      forceChatWindowPosition();
      setTimeout(forceChatWindowPosition, 10);
      setTimeout(forceChatWindowPosition, 50);
      setTimeout(forceChatWindowPosition, 100);
      setTimeout(forceChatWindowPosition, 200);
      setTimeout(forceChatWindowPosition, 500);
    }
  }, [isOpen]);

  // ULTRA-AGGRESSIVE: Continuous monitoring and fixing of chat window positioning
  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        const chatWindow = document.querySelector('.ai-manager-window');
        if (chatWindow) {
          const computedStyle = window.getComputedStyle(chatWindow);
          if (computedStyle.position !== 'fixed') {
            console.log('🚨 [AI Manager] Chat window lost fixed positioning, forcing fix...');
            (chatWindow as HTMLElement).removeAttribute('style');
            (chatWindow as HTMLElement).style.cssText = `
              position: fixed !important;
              bottom: 30px !important;
              left: 30px !important;
              top: auto !important;
              right: auto !important;
              margin: 0 !important;
              transform: translateZ(0) !important;
              isolation: isolate !important;
              contain: none !important;
              z-index: 2147483647 !important;
              backface-visibility: visible !important;
              perspective: none !important;
              transform-style: flat !important;
            `;
          }
        }
      }, 100); // Check every 100ms

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Click outside to close chat manager
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (chatWindowRef.current && !chatWindowRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        console.log('🔒 [AI Manager] Closed by clicking outside');
      }
    };

    // Add listener with a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
        const realName = currentUser?.displayName || 'user';
        
        console.log('🔍 [AIManager] Initializing with:', { userId, realName, currentUser: !!currentUser });
        
        // CRITICAL: Pass real name from Firebase to service
        await service.initialize(userId, realName);
        
        // Generate personalized greeting
        const userContext = await contextService.getUserContext(userId, realName);
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

      // Do not derive username from localStorage; backend is source of truth
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

      // Get user ID and real name
      const userId = currentUser?.uid || 'anonymous';
      const realName = currentUser?.displayName || undefined;

      // Process message with Gemini (pass real name, NOT platform username)
      const assistantMessage = await geminiService.processMessage(
        userId,
        userMessage,
        {
          ...context,
          userId,
          realName // Pass real name from Firebase for AI to address user correctly
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
            // Resolve accurate platform-specific username from backend R2 status
            const resolvePlatformUsername = async (plat: string, uid?: string) => {
              if (!uid) return null;
              try {
                const resp = await axios.get(
                  getApiUrl(`/api/user-${plat}-status/${uid}`),
                  { timeout: 5000, validateStatus: () => true }
                );
                if (resp.status >= 200 && resp.status < 300) {
                  return resp.data?.[`${plat}_username`] || null;
                }
              } catch {}
              return null;
            };
            const username = await resolvePlatformUsername(platform, userId) || context.username || undefined;
            
            let loadingContent = '';
            if (operationCall.operationId === 'get_competitor_analysis') {
              const userPath = username ? `${platform}/${username}` : `${platform}`;
              loadingContent = `📂 Opening competitor analysis files...\n🔍 Reading: competitor_analysis/${userPath}/\n⏳ Analyzing competitive landscape with AI...`;
            } else if (operationCall.operationId === 'get_news_summary') {
              const userPath = username ? `${platform}/${username}` : `${platform}`;
              loadingContent = `📂 Opening trending news files...\n🔍 Reading: news_for_you/${userPath}/\n⏳ Generating AI-powered summary...`;
            } else if (operationCall.operationId === 'get_analytics') {
              loadingContent = `📂 Opening analytics files...\n⏳ Calculating metrics...`;
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
                username: context.username || undefined,
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
    // Direct deletion without confirmation popup
    setMessages([]);
    console.log('🗑️ [AI Manager] Chat history cleared');
    
    // Clear conversation memory in Gemini service
    const service = getGeminiService();
    if (service && currentUser?.uid) {
      service.clearConversation();
      console.log('🗑️ [AI Manager] Gemini conversation memory cleared');
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
      {/* Proactive AI Manager Notification */}
      <AIManagerNotification onOpenChat={() => setIsOpen(true)} />
      
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
          <div
            ref={chatWindowRef}
            className={`ai-manager-window ${isMinimized ? 'minimized' : ''}`}
            style={{ 
              position: 'fixed', 
              bottom: '30px', 
              left: '30px', 
              zIndex: 2147483647,
              transform: 'translateZ(0)',
              isolation: 'isolate',
              contain: 'none'
            }}
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
                  <i className="fas fa-trash-alt" style={{ fontSize: '18px' }}></i>
                </button>
                <button
                  className="ai-manager-header-btn"
                  onClick={toggleMinimize}
                  title={isMinimized ? 'Maximize' : 'Minimize'}
                >
                  {isMinimized ? <i className="fas fa-expand-alt" style={{ fontSize: '18px' }}></i> : <i className="fas fa-compress-alt" style={{ fontSize: '18px' }}></i>}
                </button>
                <button
                  className="ai-manager-header-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                >
                  <i className="fas fa-times" style={{ fontSize: '18px' }}></i>
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
                          <i className={`suggestion-icon ${prompt.icon}`}></i>
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
                    <i className="fas fa-paper-plane" style={{ fontSize: '20px' }}></i>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </AnimatePresence>
    </>
  );

  // Use Portal to render outside the App div, directly to body
  return createPortal(content, document.body);
};
