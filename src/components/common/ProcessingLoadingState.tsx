import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiTarget,
  FiClock,
  FiMessageCircle,
  FiZap,
  FiBarChart,
  FiTrendingUp,
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
import { FaInstagram, FaTwitter, FaFacebook } from 'react-icons/fa';
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
  platform: 'instagram' | 'twitter' | 'facebook';
  username: string;
  onComplete?: () => void;
  countdownMinutes?: number;
  remainingMinutes?: number;
}

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username: propUsername,
  onComplete,
  countdownMinutes = 15,
  remainingMinutes
}) => {
  const navigate = useNavigate();
  const { completeProcessing } = useProcessing();
  
  // Get platform configuration with fallback
  const platformConfig = PLATFORM_CONFIGS[platform] || DEFAULT_PLATFORM_CONFIG;

  // Get username from props or localStorage
  const username = propUsername || (() => {
    try {
      const processingInfo = localStorage.getItem(`${platform}_processing_info`);
      if (processingInfo) {
        const info = JSON.parse(processingInfo);
        return info.username || 'User';
      }
    } catch (error) {
      console.error('Error reading username from localStorage:', error);
    }
    return 'User';
  })();

  // Single countdown state - initialize from localStorage or props
  const [countdown, setCountdown] = useState(() => {
    try {
      const savedCountdown = localStorage.getItem(`${platform}_processing_countdown`);
      if (savedCountdown) {
        const endTime = parseInt(savedCountdown);
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        return Math.ceil(remaining / 1000);
      }
    } catch (error) {
      console.error('Error reading countdown from localStorage:', error);
    }
    return (remainingMinutes || countdownMinutes) * 60;
  });

  // Set localStorage only if it doesn't already exist (prevents restart on refresh)
  useEffect(() => {
    try {
      const existingCountdown = localStorage.getItem(`${platform}_processing_countdown`);
      if (!existingCountdown) {
        const endTime = Date.now() + (countdown * 1000);
        localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
        
        // Store processing info for verification
        localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
          platform,
          username,
          startTime: Date.now(),
          endTime,
          totalDuration: countdown
        }));
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [platform, username, countdown]);

  // Single timer effect
  useEffect(() => {
    if (countdown <= 0) {
      // Clean up localStorage when countdown reaches 0
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
      } catch (error) {
        console.error('Error clearing localStorage:', error);
      }
      
      // Call ProcessingContext completeProcessing
      completeProcessing();
      
      if (onComplete) onComplete();
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, onComplete, platform, completeProcessing]);

  // Handle completion on mount if countdown is already 0
  useEffect(() => {
    if (countdown <= 0 && onComplete) {
      completeProcessing();
      onComplete();
    }
  }, [countdown, onComplete, completeProcessing]);

  // Prevent navigation away during processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (countdown > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [countdown]);

  // Handle direct navigation attempts
  useEffect(() => {
    const handleNavigation = () => {
      if (countdown > 0) {
        safeNavigate(navigate, `/processing/${platform}`, { 
          state: { 
            platform, 
            username,
            remainingMinutes: Math.ceil(countdown / 60) 
          },
          replace: true
        }, 8);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [countdown, navigate, platform, username]);

  // Calculate total duration from localStorage or props
  const totalDuration = (() => {
    try {
      const processingInfo = localStorage.getItem(`${platform}_processing_info`);
      if (processingInfo) {
        const { totalDuration: savedDuration } = JSON.parse(processingInfo);
        return savedDuration || (countdownMinutes * 60);
      }
    } catch (error) {
      console.error('Error reading total duration from localStorage:', error);
    }
    return countdownMinutes * 60;
  })();

  const [currentStage, setCurrentStage] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [tipProgress, setTipProgress] = useState(0);

  // Reusable stage system - automatically splits time into 5 equal stages
  const processingStages: ProcessingStage[] = [
    {
      id: 1,
      name: 'Queue',
      description: 'Initializing AI analysis pipeline',
      status: 'Preparing secure data connection...',
      icon: <FiLayers size={20} />,
      percentage: 20
    },
    {
      id: 2,
      name: 'Extract',
      description: 'Collecting social media insights',
      status: 'Analyzing engagement patterns...',
      icon: <FiDatabase size={20} />,
      percentage: 40
    },
    {
      id: 3,
      name: 'Analyze',
      description: 'Processing competitive intelligence',
      status: 'Generating strategic insights...',
      icon: <FiCpu size={20} />,
      percentage: 60
    },
    {
      id: 4,
      name: 'Generate',
      description: 'Creating personalized strategies',
      status: 'Optimizing recommendations...',
      icon: <FiZap size={20} />,
      percentage: 80
    },
    {
      id: 5,
      name: 'Deploy',
      description: 'Finalizing dashboard setup',
      status: 'Ready for launch...',
      icon: <FiCheckCircle size={20} />,
      percentage: 100
    }
  ];

  // Update current stage based on time progress
  useEffect(() => {
    const progress = ((totalDuration - countdown) / totalDuration) * 100;
    const newStageIndex = processingStages.findIndex(stage => progress < stage.percentage);
    const stageIndex = newStageIndex === -1 ? processingStages.length - 1 : Math.max(0, newStageIndex - 1);
    
    if (stageIndex !== currentStage) {
      setCurrentStage(stageIndex);
    }
  }, [countdown, currentStage, totalDuration, processingStages]);

  const proTips: ProTip[] = [
    {
      id: 'goal-optimization',
      title: 'Master Goal Optimization for Maximum Growth',
      description: 'Transform your social media strategy with AI-powered goal campaigns that automatically increase engagement by 340%. Our system analyzes your historical data and personalizes content based on your specific goals. When you set a goal like "increase followers," our AI generates targeted campaigns, optimizes posting schedules, and creates activities that naturally attract your ideal audience. The automation keeps your channel consistently active with strategic posts that drive real results, turning your goals into measurable growth metrics.',
      icon: <FiTarget size={20} />
    },
    {
      id: 'safety-rules-dms',
      title: 'Ultimate DM Safety with Intelligent Rules Engine',
      description: 'Protect your account while maximizing engagement through our advanced safety rules system. Set up intelligent filters that automatically handle spam, inappropriate messages, and potential threats. Our AI analyzes message intent and sender behavior to categorize DMs, ensuring you only see valuable conversations. Configure custom rules for different scenarios - auto-archive promotional messages, flag suspicious accounts, or prioritize messages from verified users. This system processes thousands of DMs while maintaining your account\'s reputation and safety.',
      icon: <FiUsers size={20} />
    },
    {
      id: 'ai-reply-system',
      title: 'Revolutionary AI Reply for Comments & DMs',
      description: 'Experience the future of social media engagement with our GPT-powered AI reply system. Our AI understands context, maintains your brand voice, and responds authentically to comments and DMs. It recognizes sentiment, handles customer service inquiries, and even engages in meaningful conversations that build community. The system learns from your previous responses to craft replies that sound genuinely like you, increasing response rates by 280% while saving 12+ hours weekly on community management.',
      icon: <FiMessageCircle size={20} />
    },
    {
      id: 'auto-schedule-mastery',
      title: 'Intelligent Auto-Scheduling for Peak Performance',
      description: 'Unlock perfect timing with our neural network-powered scheduling system trained on 50M+ data points. Our AI analyzes your audience\'s behavior patterns, peak activity times, and engagement trends to automatically schedule posts when your followers are most active. The system adapts to seasonal changes, trending topics, and even your audience\'s evolving habits. This intelligent scheduling increases your post reach by 450% and ensures your content appears when it matters most for maximum impact.',
      icon: <FiClock size={20} />
    },
    {
      id: 'post-generation-ai',
      title: 'Viral Content Creation with AI Post Generation',
      description: 'Transform your content strategy with AI that creates viral-ready posts based on trending topics and competitor analysis. Our system monitors industry trends, analyzes successful posts in your niche, and generates engaging content that resonates with your audience. From captions to hashtag strategies, the AI crafts posts optimized for maximum engagement. It understands your brand voice, incorporates current events, and creates content that drives conversations, shares, and follower growth consistently.',
      icon: <FiZap size={20} />
    },
    {
      id: 'discussion-strategy',
      title: 'Discussion Mode: Your Strategic Growth Accelerator',
      description: 'Leverage Discussion Mode to unlock advanced strategic insights that competitors miss. This feature analyzes your performance data, identifies growth opportunities, and provides actionable recommendations for content optimization. Get personalized strategies for increasing engagement, expanding reach, and building authentic connections. The system evaluates your content performance, suggests timing improvements, and recommends trending topics relevant to your niche, helping you stay ahead of algorithm changes and market trends.',
      icon: <MdAnalytics size={20} />
    },
    {
      id: 'dual-insights-system',
      title: 'Dual Intelligence: Live API + Predictive Analytics',
      description: 'Access two powerful insight systems working together for comprehensive social media intelligence. Live API insights provide real-time data synchronized directly from platforms, showing current performance metrics and immediate trends. Our predictive analytics model uses scraped historical data to forecast future performance, identify optimal content strategies, and predict viral potential. This dual system gives you both current reality and future possibilities, enabling data-driven decisions that consistently outperform industry averages.',
      icon: <FiBarChart size={20} />
    },
    {
      id: 'competitor-analysis',
      title: 'Strategic Planning with Advanced Competitor Analysis',
      description: 'Shape your future campaigns using deep competitor intelligence that reveals winning strategies in your niche. Our system continuously monitors competitors\' performance, identifies their most successful content types, and analyzes their engagement patterns. Use these insights to plan upcoming goals, discover untapped opportunities, and stay ahead of industry trends. The analysis reveals content gaps, optimal posting strategies, and emerging trends, giving you the competitive edge needed to dominate your market segment.',
      icon: <FiTrendingUp size={20} />
    }
  ];

  // Auto-advance tips effect - 1 minute per tip for reading
  useEffect(() => {
    if (isAutoPlaying && countdown > 0) {
      const tipDuration = 60000; // 60 seconds
      const progressInterval = 100; // Update progress every 100ms
      let progressTimer = 0;

      const progressIntervalId = setInterval(() => {
        progressTimer += progressInterval;
        const progress = (progressTimer / tipDuration) * 100;
        setTipProgress(Math.min(progress, 100));

        if (progressTimer >= tipDuration) {
          setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
          progressTimer = 0;
          setTipProgress(0);
        }
      }, progressInterval);

      return () => clearInterval(progressIntervalId);
    } else {
      setTipProgress(0);
    }
  }, [isAutoPlaying, countdown, proTips.length, currentTipIndex]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const calculateProgress = () => {
    return ((totalDuration - countdown) / totalDuration) * 100;
  };

  const handleTipNavigation = (index: number) => {
    setCurrentTipIndex(index);
    setTipProgress(0);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
    setTipProgress(0);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + proTips.length) % proTips.length);
    setTipProgress(0);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  const toggleAutoPlay = () => {
    setIsAutoPlaying(!isAutoPlaying);
    if (isAutoPlaying) {
      setTipProgress(0);
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
          
          <p className="subtitle">
            Please wait while we prepare everything for
          </p>
          <p className="username">{username}</p>
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
                <span>{countdown > 0 ? formatTime(countdown) : 'Completing...'}</span>
              </div>
            </motion.div>
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
            <div className="reading-timer">
              <span className="timer-text">
                {currentTipIndex + 1}/{proTips.length} • 1 min read
              </span>
              <button 
                onClick={toggleAutoPlay} 
                className="auto-play-toggle"
                aria-label={isAutoPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
              >
                {isAutoPlaying ? '⏸️' : '▶️'}
              </button>
            </div>
          </div>

          <div className="tips-carousel">
            {/* Progress bar for current tip */}
            {isAutoPlaying && (
              <div className="tip-progress-bar">
                <motion.div
                  className="tip-progress-fill"
                  style={{ width: `${tipProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                className="tip-card"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5 }}
              >
                <div className="tip-icon">{proTips[currentTipIndex].icon}</div>
                <div className="tip-content">
                  <h4>{proTips[currentTipIndex].title}</h4>
                  <p>{proTips[currentTipIndex].description}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="tips-controls">
              <button onClick={prevTip} className="tip-nav">
                <FiChevronLeft size={16} />
              </button>
              
              <div className="tip-dots">
                {proTips.map((_, index) => (
                  <button
                    key={index}
                    className={`tip-dot ${index === currentTipIndex ? 'active' : ''}`}
                    onClick={() => handleTipNavigation(index)}
                  />
                ))}
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