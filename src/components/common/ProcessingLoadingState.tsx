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

const ProcessingLoadingState: React.FC<ProcessingLoadingStateProps> = ({
  platform,
  username,
  onComplete
}) => {
  const { currentUser } = useAuth();
  const [timeLeft, setTimeLeft] = useState(60); // Default to 60 seconds
  const [totalDuration, setTotalDuration] = useState(60); // Track original duration
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Initialize countdown based on localStorage data
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const processingKey = `${platform}_processing_${currentUser.uid}`;
    const processingData = localStorage.getItem(processingKey);
    
    if (processingData) {
      const { startTime, duration } = JSON.parse(processingData);
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      const originalDuration = Math.ceil(duration / 1000);
      
      setTotalDuration(originalDuration);
      
      if (remaining > 0) {
        setTimeLeft(remaining);
      } else {
        // Time has already expired, complete immediately
        onComplete();
      }
    }
  }, [currentUser?.uid, platform, onComplete]);

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

        {/* Countdown Timer */}
        <motion.div
          className="countdown-section"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="countdown-circle">
            <svg className="countdown-svg" viewBox="0 0 100 100">
              <circle
                className="countdown-bg"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="8"
              />
              <circle
                className="countdown-progress"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={platformColors[platform]}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - timeLeft / totalDuration)}`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="countdown-text">
              <span className="countdown-time">{formatTime(timeLeft)}</span>
              <span className="countdown-label">remaining</span>
            </div>
          </div>
          <p className="countdown-description">
            Deep analysis in progress... Please wait while we optimize your strategy
          </p>
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

        {/* Processing Animation */}
        <motion.div
          className="processing-animation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="processing-dots">
            <motion.div
              className="processing-dot"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              style={{ backgroundColor: platformColors[platform] }}
            />
            <motion.div
              className="processing-dot"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              style={{ backgroundColor: platformColors[platform] }}
            />
            <motion.div
              className="processing-dot"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              style={{ backgroundColor: platformColors[platform] }}
            />
          </div>
          <p className="processing-status">
            {timeLeft > 48 && "Analyzing competitor strategies..."}
            {timeLeft <= 48 && timeLeft > 36 && "Processing your content patterns..."}
            {timeLeft <= 36 && timeLeft > 24 && "Optimizing engagement strategies..."}
            {timeLeft <= 24 && timeLeft > 12 && "Generating personalized recommendations..."}
            {timeLeft <= 12 && "Finalizing your AI-powered dashboard..."}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ProcessingLoadingState; 