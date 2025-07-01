import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiTarget,
  FiClock,
  FiMessageCircle,
  FiZap,
  FiBarChart,
  FiTrendingUp,
  FiCamera,
  FiTwitter,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiStar,
  FiDatabase,
  FiCpu,
  FiLayers,
  FiCheckCircle,
  FiPlay,
  FiPause,
  FiRotateCcw
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import './ProcessingLoadingState.css';
import { useNavigate } from 'react-router-dom';
import { safeNavigate } from '../../utils/navigationGuard';
import { FaChartLine, FaCalendarAlt, FaFlag, FaBullhorn, FaInstagram, FaTwitter, FaFacebook } from 'react-icons/fa';
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
  const { currentUser } = useAuth();
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
      id: 'goal-button',
      title: 'AI-Powered Goal Campaigns',
      description: 'Create autonomous campaigns that adapt to market trends and competitor movements in real-time.',
      icon: <FiTarget size={20} />
    },
    {
      id: 'auto-schedule',
      title: 'Intelligent Scheduling',
      description: 'Our neural networks predict optimal posting times based on 50M+ data points.',
      icon: <FiClock size={20} />
    },
    {
      id: 'auto-reply',
      title: 'Contextual Auto-Replies',
      description: 'GPT-powered responses that maintain your brand voice across all interactions.',
      icon: <FiMessageCircle size={20} />
    },
    {
      id: 'content-creation',
      title: 'Dynamic Content Generation',
      description: 'AI creates viral-ready content based on trending topics and competitor analysis.',
      icon: <FiZap size={20} />
    },
    {
      id: 'profit-analysis',
      title: 'Revenue Intelligence',
      description: 'Track ROI with precision analytics that connect social metrics to business outcomes.',
      icon: <FiBarChart size={20} />
    },
    {
      id: 'organic-campaigns',
      title: 'Organic Growth Engine',
      description: 'Automated campaigns that scale organically without compromising authenticity.',
      icon: <FiTrendingUp size={20} />
    }
  ];

  // Auto-advance tips effect
  useEffect(() => {
    if (isAutoPlaying && countdown > 0) {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
      }, 8000); // Change tip every 8 seconds for better pacing
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying, countdown, proTips.length]);

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
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + proTips.length) % proTips.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
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
                <span>{formatTime(countdown)}</span>
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