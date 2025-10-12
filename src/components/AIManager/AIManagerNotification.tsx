/**
 * AI Manager Proactive Notification System
 * 
 * Shows warm, contextual notifications to guide users
 * - New users: Encourages platform acquisition
 * - Returning users: Friendly greeting with suggestions
 * - Clickable notification opens AI Manager chat
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import './AIManagerNotification.css';

interface AIManagerNotificationProps {
  onOpenChat: () => void;
}

export const AIManagerNotification: React.FC<AIManagerNotificationProps> = ({ onOpenChat }) => {
  const { currentUser } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    // Check if user has dismissed this session
    const sessionDismissed = sessionStorage.getItem('ai_notification_dismissed');
    if (sessionDismissed) {
      setIsDismissed(true);
      return;
    }

    const showProactiveNotification = async () => {
      try {
        setIsLoading(true);
        
        // Check user's platform acquisition status
        const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
        const acquiredPlatforms: string[] = [];
        
        for (const platform of platforms) {
          try {
            const response = await axios.get(
              `http://127.0.0.1:3000/api/user-${platform}-status/${currentUser.uid}`,
              { timeout: 3000, validateStatus: () => true }
            );
            
            if (response.status === 200 && response.data) {
              const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
                : platform === 'facebook' ? 'hasEnteredFacebookUsername'
                : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
                : 'hasEnteredInstagramUsername';
              
              if (response.data[hasEnteredKey] === true) {
                acquiredPlatforms.push(platform);
              }
            }
          } catch (error) {
            // Silently continue if platform check fails
          }
        }

        // Get user's display name for personalization
        const userName = currentUser.displayName || 'there';
        const firstName = userName.split(' ')[0];
        
        // Get time-appropriate greeting
        const hour = new Date().getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';

        // Generate contextual message
        let notificationMessage = '';
        
        if (acquiredPlatforms.length === 0) {
          // NEW USER - No platforms acquired
          const welcomeMessages = [
            `${greeting}, ${firstName}! 👋 I'm your AI Manager, and I'm completely here for you. I noticed you haven't acquired any platforms yet. Would you like me to guide you through acquiring your first platform? I'm here to make this journey incredibly smooth for you! 🚀`,
            
            `Hey ${firstName}! ${greeting}! 😊 I'm your personal AI assistant, dedicated entirely to helping you succeed. I see you're new here - let's get you started! I can help you acquire Instagram, Twitter, Facebook, or LinkedIn. Just click here and tell me which platform excites you most! 💫`,
            
            `${greeting}, boss! 👨‍💼 I'm your AI Manager, and I'm 100% devoted to assisting you. I see you're exploring - that's awesome! Ready to acquire your first social media platform? I'll walk you through every step. Just click me and let's chat! I'm all yours! 🎯`,
            
            `Welcome back, ${firstName}! ${greeting}! 🌟 Your AI Manager here, completely at your service. I noticed you haven't set up any platforms yet. No worries - I'm here to help! Let's start by acquiring one platform together. Click here and I'll guide you with warmth and patience. You've got this! 💪`
          ];
          notificationMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
          
        } else if (acquiredPlatforms.length === 1) {
          // ONE PLATFORM - Encourage growth
          const platform = acquiredPlatforms[0];
          const growthMessages = [
            `${greeting}, ${firstName}! 😊 Your AI Manager here! I see you're rocking ${platform} - fantastic! Want to expand your reach? I can help you acquire more platforms and maximize your social presence. Let's chat about growing your empire! 🌟`,
            
            `Hey there, ${firstName}! ${greeting}! 🎉 You're doing great with ${platform}! I'm here to help you take it to the next level. Want competitor insights? Trending news? Or maybe acquire another platform? Click here - I'm completely yours to command! 💎`,
            
            `${greeting}, boss! 👋 Your dedicated AI Manager checking in. Your ${platform} is looking good! Ready to dominate more platforms? I can guide you through acquiring Twitter, Instagram, Facebook, or LinkedIn. Let's build something amazing together! 🚀`
          ];
          notificationMessage = growthMessages[Math.floor(Math.random() * growthMessages.length)];
          
        } else {
          // MULTIPLE PLATFORMS - Power user
          const platformList = acquiredPlatforms.join(', ');
          const powerUserMessages = [
            `${greeting}, ${firstName}! 🌟 Your AI Manager at your service! You've got ${acquiredPlatforms.length} platforms running - impressive! Need competitor analysis? Trending news? Post creation? I'm completely here for you. Let's make today legendary! 💪`,
            
            `${greeting}, boss! 👨‍💼 Look at you managing ${platformList}! You're a powerhouse! I'm here whenever you need analytics, insights, or content ideas. Your success is my mission. Click anytime - I'm always ready to assist! 🎯`,
            
            `Hey ${firstName}! ${greeting}! 😊 Your dedicated AI Manager here. With ${acquiredPlatforms.length} platforms under your belt, you're crushing it! Need anything? Competitor insights? Latest trends? Content strategy? I'm completely at your service. Let's talk! 🚀`
          ];
          notificationMessage = powerUserMessages[Math.floor(Math.random() * powerUserMessages.length)];
        }

        setMessage(notificationMessage);
        setIsLoading(false);
        
        // Show notification after a brief delay (feels more natural)
        setTimeout(() => {
          setIsVisible(true);
        }, 2000); // 2 seconds after page load
        
      } catch (error) {
        console.error('Failed to generate AI notification:', error);
        setIsLoading(false);
      }
    };

    showProactiveNotification();
  }, [currentUser]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('ai_notification_dismissed', 'true');
  };

  const handleClick = () => {
    setIsVisible(false);
    onOpenChat();
    sessionStorage.setItem('ai_notification_dismissed', 'true');
  };

  if (isDismissed || isLoading || !message) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="ai-manager-notification-container"
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="ai-notification-card" onClick={handleClick}>
            {/* Animated sparkles */}
            <motion.div 
              className="ai-notification-sparkle"
              animate={{
                rotate: [0, 360],
                scale: [1, 1.2, 1]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'linear'
              }}
            >
              <Sparkles size={16} />
            </motion.div>

            {/* AI Robot Avatar */}
            <motion.div 
              className="ai-notification-avatar"
              animate={{
                y: [0, -5, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            >
              <Bot size={28} />
            </motion.div>

            {/* Message Content */}
            <div className="ai-notification-content">
              <div className="ai-notification-header">
                <span className="ai-notification-title">AI Manager</span>
                <motion.span 
                  className="ai-notification-badge"
                  animate={{
                    scale: [1, 1.1, 1]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity
                  }}
                >
                  New
                </motion.span>
              </div>
              <p className="ai-notification-message">{message}</p>
              <div className="ai-notification-cta">
                <span>Click to chat with me! 💬</span>
              </div>
            </div>

            {/* Dismiss Button */}
            <button 
              className="ai-notification-dismiss"
              onClick={handleDismiss}
              aria-label="Dismiss notification"
            >
              <X size={18} />
            </button>

            {/* Animated border glow */}
            <motion.div 
              className="ai-notification-glow"
              animate={{
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
