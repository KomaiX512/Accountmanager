import React, { useState, useEffect } from 'react';
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
  FiCheckCircle
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import './ProcessingLoadingState.css';

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

interface ProcessingLoadingStateProps {
  platform: 'instagram' | 'twitter' | 'facebook';
  username: string;
  onComplete: () => void;
  countdownMinutes?: number; // Make countdown configurable
}

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username,
  onComplete,
  countdownMinutes = 7 // Default to 7 minutes
}) => {
  const { currentUser } = useAuth();
  const TOTAL_DURATION = countdownMinutes * 60; // Convert minutes to seconds
  const [timeLeft, setTimeLeft] = useState(TOTAL_DURATION);
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

  // Initialize countdown based on localStorage data
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const processingKey = `${platform}_processing_${currentUser.uid}`;
    const processingData = localStorage.getItem(processingKey);
    
    if (processingData) {
      const { startTime, duration } = JSON.parse(processingData);
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      
      if (remaining > 0) {
        setTimeLeft(remaining);
      } else {
        onComplete();
      }
    }
  }, [currentUser?.uid, platform, onComplete]);

  // Update current stage based on time progress - reusable for any countdown duration
  useEffect(() => {
    const progress = ((TOTAL_DURATION - timeLeft) / TOTAL_DURATION) * 100;
    const newStageIndex = processingStages.findIndex(stage => progress < stage.percentage);
    const stageIndex = newStageIndex === -1 ? processingStages.length - 1 : Math.max(0, newStageIndex - 1);
    
    if (stageIndex !== currentStage) {
      setCurrentStage(stageIndex);
    }
  }, [timeLeft, currentStage, TOTAL_DURATION]);

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

  // Countdown timer effect
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      onComplete();
    }
  }, [timeLeft, onComplete]);

  // Auto-advance tips effect
  useEffect(() => {
    if (isAutoPlaying && timeLeft > 0) {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
      }, 8000); // Change tip every 8 seconds for better pacing
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying, timeLeft, proTips.length]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateProgress = () => {
    return ((TOTAL_DURATION - timeLeft) / TOTAL_DURATION) * 100;
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

  const platformConfig = {
    instagram: { color: '#E4405F', name: 'Instagram', icon: <FiCamera size={24} /> },
    twitter: { color: '#1DA1F2', name: 'Twitter', icon: <FiTwitter size={24} /> },
    facebook: { color: '#1877F2', name: 'Facebook', icon: <FiUsers size={24} /> }
  };

  const config = platformConfig[platform];

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
          <div className="platform-badge" style={{ backgroundColor: `${config.color}15` }}>
            <div className="platform-icon" style={{ color: config.color }}>
              {config.icon}
            </div>
            <span className="platform-name">{config.name}</span>
          </div>
          
          <h1 className="main-title">
            AI Analysis in Progress
          </h1>
          
          <p className="subtitle">
            Processing <span className="username">@{username}</span> and competitive landscape
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
              style={{ backgroundColor: config.color }}
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
                <div className="stage-pulse" style={{ backgroundColor: config.color }} />
                <h3>{processingStages[currentStage].description}</h3>
              </div>
              <p className="stage-status">{processingStages[currentStage].status}</p>
              <div className="time-display">
                <FiClock size={14} />
                <span>{formatTime(timeLeft)}</span>
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