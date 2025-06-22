import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiZap,
  FiDatabase,
  FiCpu,
  FiLayers,
  FiCheckCircle,
  FiInstagram,
  FiTwitter,
  FiFacebook,
} from 'react-icons/fi';
import { useProcessing } from '../../context/ProcessingContext';
import './ProcessingLoadingState.css';

interface ProcessingStage {
  name: string;
  icon: React.ReactNode;
}

const STAGES: ProcessingStage[] = [
  { name: 'Connecting to API...', icon: <FiLayers size={22} /> },
  { name: 'Extracting public data...', icon: <FiDatabase size={22} /> },
  { name: 'Analyzing with AI...', icon: <FiCpu size={22} /> },
  { name: 'Generating insights...', icon: <FiZap size={22} /> },
  { name: 'Finalizing dashboard...', icon: <FiCheckCircle size={22} /> },
];

const PLATFORM_CONFIG = {
  instagram: {
    color: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
    icon: <FiInstagram size={36} />,
    name: 'Instagram'
  },
  twitter: {
    color: 'linear-gradient(45deg, #1DA1F2, #1A91DA)',
    icon: <FiTwitter size={36} />,
    name: 'X (Twitter)'
  },
  facebook: {
    color: 'linear-gradient(45deg, #1877F2, #166FE5)',
    icon: <FiFacebook size={36} />,
    name: 'Facebook'
  },
};

const ProcessingLoadingState: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { processingState } = useProcessing();
  const { platform, username, startTime, duration } = processingState;

  const [timeLeft, setTimeLeft] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  useEffect(() => {
    if (startTime && duration) {
      const elapsedMs = Date.now() - startTime;
      const remainingMs = Math.max(0, duration - elapsedMs);
      setTimeLeft(Math.ceil(remainingMs / 1000));
    }
  }, [startTime, duration]);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, onComplete]);

  const progress = useMemo(() => {
    if (!duration) return 0;
    const elapsedSeconds = (duration / 1000) - timeLeft;
    return Math.min(100, (elapsedSeconds / (duration / 1000)) * 100);
  }, [duration, timeLeft]);

  useEffect(() => {
    const stagePercentage = 100 / STAGES.length;
    const newStageIndex = Math.min(
      Math.floor(progress / stagePercentage),
      STAGES.length - 1
    );
    setCurrentStageIndex(newStageIndex);
  }, [progress]);
  
  if (!platform || !username) return null;

  const config = PLATFORM_CONFIG[platform];

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="processing-container">
      <motion.div
        className="processing-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="processing-header">
          <motion.div
            className="platform-icon"
            style={{ background: config.color }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
          >
            {config.icon}
          </motion.div>
          <h2>AI Analysis in Progress</h2>
          <p>
            Crunching data for <span className="username-highlight">@{username}</span> on {config.name}
          </p>
        </div>

        <div className="progress-bar-container">
          <motion.div
            className="progress-bar-fill"
            style={{ background: config.color }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          />
        </div>
        
        <div className="status-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStageIndex}
              className="status-stage"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              {STAGES[currentStageIndex].icon}
              <span>{STAGES[currentStageIndex].name}</span>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="timer">
          <span>Time Remaining:</span>
          <strong>{formatTime(timeLeft)}</strong>
        </div>

        <div className="footer-note">
          Please keep this window open. You will be redirected automatically.
        </div>
      </motion.div>
    </div>
  );
};

export default ProcessingLoadingState; 