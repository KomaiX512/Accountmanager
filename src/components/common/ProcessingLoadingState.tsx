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
  FiStar
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import './ProcessingLoadingState.css';

interface ProcessingStage {
  id: number;
  name: string;
  description: string;
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
}

const TOTAL_DURATION = 600; // 10 minutes in seconds

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username,
  onComplete
}) => {
  const { currentUser } = useAuth();
  const [timeLeft, setTimeLeft] = useState(TOTAL_DURATION);
  const [currentStage, setCurrentStage] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const processingStages: ProcessingStage[] = [
    {
      id: 1,
      name: 'Queuing',
      description: 'Preparing your account data for processing...',
      percentage: 20
    },
    {
      id: 2,
      name: 'Data Extraction',
      description: 'Extracting insights from your social media activity...',
      percentage: 40
    },
    {
      id: 3,
      name: 'Analysis',
      description: 'Analyzing patterns and generating strategies...',
      percentage: 60
    },
    {
      id: 4,
      name: 'Generation',
      description: 'Creating personalized recommendations...',
      percentage: 80
    },
    {
      id: 5,
      name: 'Final Processing',
      description: 'Preparing your dashboard...',
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

  // Update current stage based on time progress
  useEffect(() => {
    const progress = ((TOTAL_DURATION - timeLeft) / TOTAL_DURATION) * 100;
    const newStage = processingStages.findIndex(stage => progress <= stage.percentage);
    if (newStage !== -1 && newStage !== currentStage) {
      setCurrentStage(newStage);
    }
  }, [timeLeft, currentStage]);

  const proTips: ProTip[] = [
    {
      id: 'goal-button',
      title: 'Goal Button Power',
      description: 'The Goal button creates AI-powered organic campaigns that automatically optimize your content strategy based on your competitors and audience engagement patterns.',
      icon: <FiTarget size={24} />
    },
    {
      id: 'auto-schedule',
      title: 'Smart Auto-Scheduling',
      description: 'Our AI analyzes your audience activity patterns and competitor posting times to schedule your content when engagement rates are highest for maximum reach.',
      icon: <FiClock size={24} />
    },
    {
      id: 'auto-reply',
      title: 'Intelligent Auto-Replies',
      description: 'AI monitors your comments and DMs, providing contextual responses that match your brand voice while maintaining authentic engagement with your audience.',
      icon: <FiMessageCircle size={24} />
    },
    {
      id: 'content-creation',
      title: 'AI Content Generation',
      description: 'Advanced models analyze trending topics, your posting style, and competitor strategies to create engaging posts that resonate with your target audience.',
      icon: <FiZap size={24} />
    },
    {
      id: 'profit-analysis',
      title: 'Profit Analytics',
      description: 'Real-time ROI tracking analyzes engagement rates, follower growth, and conversion metrics to optimize your social media investment and maximize returns.',
      icon: <FiBarChart size={24} />
    },
    {
      id: 'organic-campaigns',
      title: 'Organic Campaign Automation',
      description: 'Goal-driven campaigns automatically adjust content themes, posting frequency, and engagement strategies to achieve your specific business objectives organically.',
      icon: <FiTrendingUp size={24} />
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
      }, 15000); // Change tip every 15 seconds
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
    // Resume auto-play after 30 seconds of manual navigation
    setTimeout(() => setIsAutoPlaying(true), 30000);
  };

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % proTips.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 30000);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + proTips.length) % proTips.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 30000);
  };

  const platformColors = {
    instagram: '#E4405F',
    twitter: '#1DA1F2',
    facebook: '#1877F2'
  };

  const platformName = {
    instagram: 'Instagram',
    twitter: 'Twitter',
    facebook: 'Facebook'
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'instagram':
        return <FiCamera size={32} />;
      case 'twitter':
        return <FiTwitter size={32} />;
      case 'facebook':
        return <FiUsers size={32} />;
      default:
        return <FiCamera size={32} />;
    }
  };

  return (
    <motion.div
      className="processing-loading-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="processing-content">
        {/* Header Section */}
        <motion.div
          className="processing-header"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="platform-icon" style={{ color: platformColors[platform] }}>
            {getPlatformIcon()}
          </div>
          <h1 className="processing-title">
            Analyzing Your {platformName[platform]} Account
          </h1>
          <p className="processing-subtitle">
            Our AI is processing <strong>@{username}</strong> and your competitors to create your personalized strategy
          </p>
        </motion.div>

        {/* Processing Stages */}
        <motion.div
          className="processing-stages"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="stages-progress">
            <div 
              className="progress-bar"
              style={{ 
                width: `${calculateProgress()}%`,
                backgroundColor: platformColors[platform]
              }}
            />
            <div className="stage-markers">
              {processingStages.map((stage, index) => (
                <div
                  key={stage.id}
                  className={`stage-marker ${index <= currentStage ? 'active' : ''}`}
                  style={{
                    left: `${stage.percentage}%`,
                    backgroundColor: index <= currentStage ? platformColors[platform] : 'rgba(255, 255, 255, 0.3)'
                  }}
                >
                  <span className="stage-label">{stage.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="current-stage-info">
            <h3>{processingStages[currentStage].name}</h3>
            <p>{processingStages[currentStage].description}</p>
            <div className="time-remaining">
              <FiClock size={16} />
              <span>{formatTime(timeLeft)} remaining</span>
            </div>
          </div>
        </motion.div>

        {/* Pro Tips Carousel */}
        <motion.div
          className="protips-section"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="protips-title"><FiStar size={20} /> Pro Tips</h2>
          <p className="protips-subtitle">Learn how to maximize your AI-powered social media management</p>

          <div className="protips-carousel">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                className="protip-card"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="protip-icon">{proTips[currentTipIndex].icon}</div>
                <h3 className="protip-title">{proTips[currentTipIndex].title}</h3>
                <p className="protip-description">{proTips[currentTipIndex].description}</p>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Controls */}
            <div className="protips-controls">
              <button
                className="protip-nav-btn prev"
                onClick={prevTip}
                disabled={timeLeft === 0}
              >
                <FiChevronLeft size={20} />
              </button>
              
              <div className="protips-indicators">
                {proTips.map((_, index) => (
                  <button
                    key={index}
                    className={`protip-indicator ${index === currentTipIndex ? 'active' : ''}`}
                    onClick={() => handleTipNavigation(index)}
                    style={{ 
                      backgroundColor: index === currentTipIndex ? platformColors[platform] : 'rgba(255, 255, 255, 0.3)' 
                    }}
                  />
                ))}
              </div>

              <button
                className="protip-nav-btn next"
                onClick={nextTip}
                disabled={timeLeft === 0}
              >
                <FiChevronRight size={20} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Processing Animation - Updated */}
        <motion.div
          className="processing-animation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="processing-pulse">
            <motion.div
              className="pulse-ring"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{ borderColor: platformColors[platform] }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ProcessingLoadingState; 