import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiTarget,
  FiClock,
  FiMessageCircle,
  FiZap,
  FiTrendingUp,
  FiCamera,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiStar,
  FiDatabase,
  FiCpu,
  FiLayers,
  FiCheckCircle
} from 'react-icons/fi';
import './ProcessingLoadingState.css';
import { useNavigate } from 'react-router-dom';
import { safeNavigate } from '../../utils/navigationGuard';
import { FaChartLine, FaFlag, FaInstagram, FaTwitter, FaFacebook } from 'react-icons/fa';
import { MdAnalytics } from 'react-icons/md';
import { BsLightningChargeFill } from 'react-icons/bs';
import { useProcessing } from '../../context/ProcessingContext';

interface ProcessingStage {
  id: number;
  name: string;
  description: string;
  status: string;
  icon: React.ReactNode;
  percentage: number;
}

interface ProTip {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

// Define platform configuration type
type PlatformConfigType = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  icon: React.ReactNode;
};

// Define platform configurations
const PLATFORM_CONFIGS: Record<string, PlatformConfigType> = {
  instagram: {
    name: 'Instagram',
    primaryColor: '#e4405f',
    secondaryColor: '#00ffcc',
    icon: <FaInstagram />
  },
  twitter: {
    name: 'X (Twitter)',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    icon: <FaTwitter />
  },
  facebook: {
    name: 'Facebook',
    primaryColor: '#1877f2',
    secondaryColor: '#42a5f5',
    icon: <FaFacebook />
  }
};

// Default platform config for fallback
const DEFAULT_PLATFORM_CONFIG: PlatformConfigType = {
  name: 'Platform',
  primaryColor: '#666666',
  secondaryColor: '#cccccc',
  icon: <BsLightningChargeFill />
};

interface ProcessingLoadingStateProps {
  platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  username: string;
  onComplete?: () => void;
  countdownMinutes?: number;
  remainingMinutes?: number;
  extensionMessage?: string;
  allowAutoComplete?: boolean;
}

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username: propUsername,
  onComplete,
  countdownMinutes = 15,
  remainingMinutes,
  extensionMessage,
  allowAutoComplete = true
}) => {
  const navigate = useNavigate();
  const { completeProcessing } = useProcessing();
  
  // Get platform configuration with fallback
  const platformConfig = PLATFORM_CONFIGS[platform] || DEFAULT_PLATFORM_CONFIG;

  // ✅ BULLETPROOF TIMER SYSTEM - Real-time calculation based approach
  
  // ✅ FIX: Proper username initialization to prevent lexical declaration error
  const getUsernameFromStorage = (platformId: string): string => {
    try {
      const processingInfo = localStorage.getItem(`${platformId}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        return info.username || 'User';
      }
    } catch (error) {
      console.error('Error reading username from localStorage:', error);
    }
    return 'User';
  };

  // Get username from props or localStorage (fixed lexical scoping)
  const username = propUsername || getUsernameFromStorage(platform);

  // State to trigger re-renders for real-time updates
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
  const [timerCompleted, setTimerCompleted] = useState(false);

  // Get timer data from localStorage with bulletproof error handling
  const getTimerData = () => {
    try {
      const endTimeRaw = localStorage.getItem(`${platform}_processing_countdown`);
      const processingInfoRaw = localStorage.getItem(`${platform}_processing_info`);
      
      if (!endTimeRaw || !processingInfoRaw) {
        return null;
      }
      
      const endTime = parseInt(endTimeRaw);
      const processingInfo = JSON.parse(processingInfoRaw);
      
      if (Number.isNaN(endTime) || !processingInfo.startTime) {
        return null;
      }
      
      return {
        endTime,
        startTime: processingInfo.startTime,
        totalDuration: processingInfo.totalDuration || (countdownMinutes * 60 * 1000),
        username: processingInfo.username || username
      };
    } catch (error) {
      console.error('Error reading timer data:', error);
      return null;
    }
  };

  // Initialize timer data if not exists (first time setup)
  useEffect(() => {
    // If the timer has already completed, do NOT create a new one
    if (timerCompleted) {
      return;
    }

    const existingTimer = getTimerData();
    
    if (!existingTimer) {
      // First time setup - create new timer
      const now = Date.now();
      const durationMs = (remainingMinutes || countdownMinutes) * 60 * 1000;
      const endTime = now + durationMs;
      
      localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
      localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
        platform,
        username,
        startTime: now,
        endTime,
        totalDuration: durationMs
      }));
      
      console.log(`🔥 BULLETPROOF TIMER: Initialized ${platform} timer for ${Math.ceil(durationMs / 1000 / 60)} minutes`);
    } else {
      console.log(`🔥 BULLETPROOF TIMER: Resumed existing ${platform} timer`);
    }
  // Added timerCompleted to dependencies to ensure effect re-runs correctly only when necessary
  }, [platform, username, countdownMinutes, remainingMinutes, timerCompleted]);

  // Real-time calculation functions
  const getRemainingMs = (): number => {
    const timerData = getTimerData();
    if (!timerData) return 0;
    
    const remaining = Math.max(0, timerData.endTime - currentTime);
    return remaining;
  };

  const getRemainingSeconds = (): number => {
    return Math.ceil(getRemainingMs() / 1000);
  };

  const getProgressPercentage = (): number => {
    const timerData = getTimerData();
    if (!timerData) return 100;
    
    const elapsed = currentTime - timerData.startTime;
    const progress = Math.min(100, Math.max(0, (elapsed / timerData.totalDuration) * 100));
    return progress;
  };

  // ✅ BULLETPROOF REAL-TIME TIMER - Updates based on actual time, not intervals
  useEffect(() => {
    if (timerCompleted) return;
    
    const updateTimer = () => {
      const now = Date.now();
      setCurrentTime(now);
      
      const remaining = getRemainingMs();
      
      if (remaining <= 0 && !timerCompleted) {
        if (allowAutoComplete) {
          setTimerCompleted(true);
          // Clean up localStorage only when auto-completing
          try {
            localStorage.removeItem(`${platform}_processing_countdown`);
            localStorage.removeItem(`${platform}_processing_info`);
            
            // Mark platform as completed
            const completedPlatforms = localStorage.getItem('completedPlatforms');
            const completed = completedPlatforms ? JSON.parse(completedPlatforms) : [];
            if (!completed.includes(platform)) {
              completed.push(platform);
              localStorage.setItem('completedPlatforms', JSON.stringify(completed));
            }
            
            console.log(`🔥 BULLETPROOF TIMER: Completed ${platform} processing`);
          } catch (error) {
            console.error('Error cleaning up timer:', error);
          }
        } else {
          // Do not mark as completed; parent may extend time and continue updates
          // Keep interval running so UI can reflect extended endTime written by parent
        }
      }
    };
    
    // Update immediately
    updateTimer();
    
    // Use different intervals based on tab visibility for optimal performance
    const interval = setInterval(updateTimer, isTabVisible ? 100 : 1000);
    
    return () => clearInterval(interval);
  }, [platform, currentTime, isTabVisible, timerCompleted]);

  // ✅ PAGE VISIBILITY API - Perfect tab switching synchronization
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsTabVisible(isVisible);
      
      if (isVisible) {
        // Tab became visible - force immediate time sync
        const now = Date.now();
        setCurrentTime(now);
        console.log(`🔥 BULLETPROOF TIMER: Tab visible - synced time for ${platform}`);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [platform]);

  // ✅ STORAGE SYNC - Sync across multiple tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `${platform}_processing_countdown` || e.key === `${platform}_processing_info`) {
        // Timer data changed in another tab - force sync
        const now = Date.now();
        setCurrentTime(now);
        console.log(`🔥 BULLETPROOF TIMER: Cross-tab sync for ${platform}`);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [platform]);

  // Current values for display
  const countdown = getRemainingSeconds();

  const handleContinue = () => {
    // Call ProcessingContext completeProcessing
    completeProcessing();
    
    if (onComplete) onComplete();
  };

  // Handle completion on mount if countdown is already 0
  useEffect(() => {
    if (timerCompleted && onComplete && allowAutoComplete) {
      completeProcessing();
      onComplete();
    }
  }, [timerCompleted, onComplete, completeProcessing, allowAutoComplete]);

  // ✅ SELECTIVE NAVIGATION BLOCKING - Only block the specific platform being processed
  // This allows users to explore other parts of the app while timer runs
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (countdown > 0) {
        e.preventDefault();
        e.returnValue = 'Your dashboard setup is still in progress. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [countdown]);

  // Handle direct navigation attempts - but ONLY for this specific platform
  useEffect(() => {
    const handleNavigation = () => {
      if (countdown > 0) {
        // Only redirect if they try to access THIS platform's dashboard
        const currentPath = window.location.pathname;
        const isPlatformDashboard = (
          (platform === 'instagram' && currentPath.includes('/dashboard') && !currentPath.includes('twitter') && !currentPath.includes('facebook') && !currentPath.includes('linkedin')) ||
          (platform === 'twitter' && currentPath.includes('/twitter-dashboard')) ||
          (platform === 'facebook' && currentPath.includes('/facebook-dashboard')) ||
          (platform === 'linkedin' && currentPath.includes('/linkedin-dashboard'))
        );
        
        if (isPlatformDashboard) {
          safeNavigate(navigate, `/processing/${platform}`, { 
            state: { 
              platform, 
              username,
              remainingMinutes: Math.ceil(countdown / 60) 
            },
            replace: true
          }, 8);
        }
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [countdown, navigate, platform, username]);

  const [currentStage, setCurrentStage] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [tipProgress, setTipProgress] = useState(0);

  // Reusable stage system - automatically splits time into 5 equal stages
  const processingStages: ProcessingStage[] = [
    {
      id: 1,
      name: 'Initialize',
      description: 'Setting up your secure AI workspace',
      status: 'Establishing encrypted connections and preparing your personalized environment...',
      icon: <FiLayers size={20} />,
      percentage: 20
    },
    {
      id: 2,
      name: 'Analyze',
      description: 'Scanning your social media presence',
      status: 'Analyzing your content history, engagement patterns, and audience insights...',
      icon: <FiDatabase size={20} />,
      percentage: 40
    },
    {
      id: 3,
      name: 'Intelligence',
      description: 'Building competitive intelligence engine',
      status: 'Processing market data, competitor analysis, and trend predictions...',
      icon: <FiCpu size={20} />,
      percentage: 60
    },
    {
      id: 4,
      name: 'Optimize',
      description: 'Creating your personalized strategy',
      status: 'Generating AI-powered recommendations and automation workflows...',
      icon: <FiZap size={20} />,
      percentage: 80
    },
    {
      id: 5,
      name: 'Launch',
      description: 'Finalizing your dashboard experience',
      status: 'Almost ready! Preparing your complete social media command center...',
      icon: <FiCheckCircle size={20} />,
      percentage: 100
    }
  ];

  // Update current stage based on time progress - BULLETPROOF real-time calculation
  useEffect(() => {
    const progress = getProgressPercentage();
    const newStageIndex = processingStages.findIndex(stage => progress < stage.percentage);
    const stageIndex = newStageIndex === -1 ? processingStages.length - 1 : Math.max(0, newStageIndex - 1);
    
    if (stageIndex !== currentStage) {
      setCurrentStage(stageIndex);
    }
  }, [currentTime, currentStage, processingStages]);

  const calculateProgress = (): number => {
    return getProgressPercentage();
  };

  const proTips: ProTip[] = [
    {
      id: 'goal-optimization',
      title: '🎯 Master Goal Optimization for Maximum Engagement',
      description: 'Transform your social strategy with intelligent goal optimization. Set specific targets like increasing followers, boosting engagement, or driving conversions, and watch our AI analyze your past performance to create personalized campaigns. The system studies your audience behavior, optimal posting times, and content preferences from our vast database of successful campaigns. Based on your unique goals, it automatically generates content, schedules posts, and adjusts strategies in real-time to maximize your reach and engagement.',
      icon: <FiTarget size={20} />
    },
    {
      id: 'dm-rules-safety',
      title: '🛡️ Smart DM Rules & Safety Automation',
      description: 'Protect your account while maximizing opportunities with intelligent DM management. Create custom rules to automatically filter spam, identify genuine business inquiries, and route important messages to your attention. Our AI learns from millions of conversations to detect potentially harmful content, promotional spam, and genuine engagement. Set up automated responses for common inquiries while maintaining authentic interactions that build real relationships with your audience.',
      icon: <FiMessageCircle size={20} />
    },
    {
      id: 'ai-reply-system',
      title: '🤖 Revolutionary AI Reply for Comments & DMs',
      description: 'Experience the future of social media management with context-aware AI responses. Our advanced GPT models understand your brand voice, analyze conversation context, and generate replies that feel authentically human. The system learns from your previous interactions, maintains conversation flow, and adapts responses based on user sentiment and intent. Perfect for handling customer support, engagement, and building meaningful connections at scale.',
      icon: <FiZap size={20} />
    },
    {
      id: 'auto-scheduling',
      title: '⏰ Intelligent Auto-Scheduling That Never Sleeps',
      description: 'Revolutionize your content strategy with AI-powered scheduling that analyzes over 50 million data points to predict peak engagement times. Our algorithm considers your audience timezone, historical engagement patterns, platform-specific optimal windows, and real-time trending topics. Schedule weeks or months of content in advance while maintaining the flexibility to adapt to breaking news, viral trends, or unexpected opportunities.',
      icon: <FiClock size={20} />
    },
    {
      id: 'post-generation',
      title: '✨ Next-Level Post Generation & Content Creation',
      description: 'Create viral-ready content that resonates with your audience using our advanced AI content engine. Input your brand guidelines, target audience, and campaign goals, and watch as our system generates engaging captions, selects optimal hashtags, and even suggests visual themes. The AI analyzes trending topics, competitor content, and successful posts in your niche to create content that drives engagement and growth.',
      icon: <FiCamera size={20} />
    },
    {
      id: 'discussion-mode',
      title: '💬 Strategic Discussion Mode for Optimal Planning',
      description: 'Unlock powerful strategic insights with our discussion mode feature. Collaborate with AI to brainstorm content ideas, analyze campaign performance, and develop winning strategies. The system provides data-driven recommendations, identifies growth opportunities, and helps you navigate complex social media challenges. Perfect for planning seasonal campaigns, product launches, or pivoting your strategy based on market changes.',
      icon: <FiUsers size={20} />
    },
    {
      id: 'live-insights',
      title: '📊 Real-Time API Insights & Live Analytics',
      description: 'Access live, synchronized data directly from platform APIs to make informed decisions instantly. Monitor follower growth, engagement rates, reach metrics, and audience demographics in real-time. Our system connects directly to Instagram, Twitter, and Facebook APIs to provide the most accurate, up-to-date information about your account performance, helping you spot trends and opportunities as they happen.',
      icon: <MdAnalytics size={20} />
    },
    {
      id: 'estimation-insights',
      title: '🧠 Advanced Estimation Model & Predictive Analytics',
      description: 'Leverage our proprietary estimation model built from millions of scraped data points to predict future performance and identify growth opportunities. Our AI analyzes patterns from successful accounts in your niche, predicting optimal content types, posting frequency, and engagement strategies. This predictive intelligence helps you stay ahead of trends and make data-driven decisions for sustained growth.',
      icon: <FiTrendingUp size={20} />
    },
    {
      id: 'goal-planning',
      title: '🎯 Strategic Goal Planning & Future Roadmapping',
      description: 'Plan your social media success with comprehensive goal-setting tools that align with your business objectives. Our system helps you set realistic yet ambitious targets, break them down into actionable milestones, and track progress over time. Whether you\'re aiming for 10K followers, launching a product, or building brand awareness, our strategic planning tools guide you every step of the way.',
      icon: <FaFlag size={20} />
    },
    {
      id: 'competitor-analysis',
      title: '🔍 Deep Competitor Analysis & Market Intelligence',
      description: 'Gain the competitive edge with comprehensive competitor analysis that reveals winning strategies in your niche. Our AI monitors competitor content, engagement patterns, growth tactics, and audience interactions to identify what works and what doesn\'t. Use these insights to refine your strategy, discover content gaps, and capitalize on opportunities your competitors might be missing.',
      icon: <FaChartLine size={20} />
    },
    {
      id: 'channel-automation',
      title: '🚀 Complete Channel Automation & Growth Engine',
      description: 'Transform your social presence into a self-sustaining growth machine with complete channel automation. Our system handles everything from content creation and scheduling to engagement and community management. Based on your goals and target audience, it continuously optimizes your strategy, adapts to algorithm changes, and scales your presence while maintaining authentic engagement and brand consistency.',
      icon: <BsLightningChargeFill size={20} />
    }
  ];

  // Auto-advance tips effect - 1 minute per tip for comprehensive reading
  useEffect(() => {
    if (isAutoPlaying && !timerCompleted) {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
        setTipProgress(0); // Reset progress when moving to next tip
      }, 60000); // 60 seconds per tip for thorough reading
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying, timerCompleted, proTips.length]);

  // Tip progress tracking
  useEffect(() => {
    if (isAutoPlaying && !timerCompleted) {
      const progressInterval = setInterval(() => {
        setTipProgress((prev) => {
          const newProgress = prev + (100 / 60); // 60 seconds = 100%
          return newProgress >= 100 ? 0 : newProgress;
        });
      }, 1000); // Update every second
      return () => clearInterval(progressInterval);
    }
  }, [isAutoPlaying, timerCompleted, currentTipIndex]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleTipNavigation = (index: number) => {
    setCurrentTipIndex(index);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes to allow for thorough reading
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + proTips.length) % proTips.length);
    setIsAutoPlaying(false);
    setTipProgress(0);
    // Resume auto-playing after 2 minutes
    setTimeout(() => setIsAutoPlaying(true), 120000);
  };

  // Keyboard navigation for tips
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!timerCompleted) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault();
            prevTip();
            break;
          case 'ArrowRight':
            event.preventDefault();
            nextTip();
            break;
          case ' ':
            event.preventDefault();
            setIsAutoPlaying(prev => !prev);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timerCompleted]);

  // Touch/swipe support for mobile
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && countdown > 0) {
      nextTip();
    }
    if (isRightSwipe && countdown > 0) {
      prevTip();
    }
  };

  return (
    <div className="processing-container">
      <div className="processing-backdrop" />
      
      <motion.div
        className="processing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Header */}
        <motion.div
          className="processing-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div 
            className="platform-badge" 
            style={{ 
              backgroundColor: platformConfig.primaryColor,
              color: platformConfig.secondaryColor 
            }}
          >
            <span className="platform-icon">
              {platformConfig.icon}
            </span>
            <span className="platform-name">{platformConfig.name}</span>
          </div>
          
          <h1 className="main-title">
            Setting Up Your {platformConfig.name} Dashboard
          </h1>
          
          <div className="setup-message">
            <div className="one-time-badge">
              <FiCheckCircle size={14} />
              <span>One-Time Setup</span>
            </div>
            <p className="subtitle">
              We're preparing your personalized dashboard with AI-powered insights.
            </p>
            <p className="setup-description">
              This 15-minute initialization creates your custom analytics engine, 
              competitor analysis, and automation tools. You'll never have to wait again!
            </p>
          </div>
          
          <p className="username-welcome">
            Welcome, <span className="username-highlight">{username}</span>
          </p>
        </motion.div>

        {/* Progress Section */}
        <motion.div
          className="progress-section"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          {/* Stage Indicators */}
          <div className="stage-indicators">
            {processingStages.map((stage, index) => (
              <motion.div
                key={stage.id}
                className={`stage-indicator ${index <= currentStage ? 'active' : ''} ${index === currentStage ? 'current' : ''}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + index * 0.1 }}
              >
                <div className="stage-icon">{stage.icon}</div>
                <span className="stage-name">{stage.name}</span>
              </motion.div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="progress-track">
            <motion.div
              className="progress-fill"
              style={{ backgroundColor: platformConfig.primaryColor }}
              initial={{ width: 0 }}
              animate={{ width: `${calculateProgress()}%` }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>

          {/* Current Stage Info */}
          <AnimatePresence mode="wait">
            {allowAutoComplete && timerCompleted ? (
              <motion.div
                className="completion-stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="completion-header">
                  <div className="completion-check">
                    <FiCheckCircle size={24} />
                  </div>
                  <h3>🎉 Your Dashboard is Ready!</h3>
                </div>
                <p className="completion-message">
                  Congratulations! Your personalized {platformConfig.name} command center is now fully configured 
                  with AI-powered insights, automation tools, and competitive intelligence.
                </p>
                <motion.button
                  className="continue-button"
                  style={{ backgroundColor: platformConfig.primaryColor }}
                  onClick={handleContinue}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <span>Continue to Dashboard</span>
                  <FiChevronRight size={18} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key={currentStage}
                className="current-stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <div className="stage-header">
                  <div className="stage-pulse" style={{ backgroundColor: platformConfig.primaryColor }} />
                  <h3>{processingStages[currentStage].description}</h3>
                </div>
                <p className="stage-status">{processingStages[currentStage].status}</p>
                <div className="time-display">
                  <FiClock size={14} />
                  <span>{formatTime(countdown)}</span>
                </div>
                <div className="remaining-setup-info">
                  <span className="setup-note">
                    {extensionMessage || '⚡ This one-time setup ensures lightning-fast performance forever'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Pro Tips */}
        <motion.div
          className="tips-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <div className="tips-header">
            <FiStar size={16} />
            <span>Pro Insights</span>
            <div className="reading-time">
              <span>~1 min read</span>
            </div>
            <div className="navigation-hint">
              <span>← → keys or swipe to navigate</span>
            </div>
          </div>

          <div className="tips-carousel">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                className="tip-card"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5 }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="tip-icon">{proTips[currentTipIndex].icon}</div>
                <div className="tip-content">
                  <h4>{proTips[currentTipIndex].title}</h4>
                  <p>{proTips[currentTipIndex].description}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Tip Progress Bar */}
            {isAutoPlaying && (
              <div className="tip-progress-track">
                <motion.div
                  className="tip-progress-fill"
                  style={{ 
                    backgroundColor: platformConfig.primaryColor,
                    width: `${tipProgress}%`
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${tipProgress}%` }}
                  transition={{ duration: 0.2, ease: "linear" }}
                />
              </div>
            )}

            <div className="tips-controls">
              <button onClick={prevTip} className="tip-nav">
                <FiChevronLeft size={16} />
              </button>
              
              <div className="tip-indicators">
                <div className="tip-slider-track">
                  <motion.div
                    className="tip-slider-fill"
                    style={{ backgroundColor: platformConfig.primaryColor }}
                    initial={{ x: 0 }}
                    animate={{ x: `${(currentTipIndex / (proTips.length - 1)) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  />
                </div>
                <div className="tip-dots">
                  {proTips.map((_, index) => (
                    <button
                      key={index}
                      className={`tip-dot ${index === currentTipIndex ? 'active' : ''}`}
                      onClick={() => handleTipNavigation(index)}
                      style={{
                        backgroundColor: index === currentTipIndex 
                          ? platformConfig.primaryColor 
                          : 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                  ))}
                </div>
                <div className="tip-counter">
                  <span>{currentTipIndex + 1} / {proTips.length}</span>
                </div>
              </div>
              
              <button onClick={nextTip} className="tip-nav">
                <FiChevronRight size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ProcessingLoadingState; 