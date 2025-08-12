import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './ManualGuidance.css';
import { 
  FiBookOpen, 
  FiTarget, 
  FiUsers, 
  FiEdit, 
  FiFileText, 
  FiBell, 
  FiFlag, 
  FiPlay, 
  FiZap, 
  FiBarChart, 
  FiRefreshCw, 
  FiImage, 
  FiMessageCircle,
  FiX
} from 'react-icons/fi';

interface ManualGuidanceProps {
  onClose: () => void;
}

interface TopicItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const ManualGuidance: React.FC<ManualGuidanceProps> = ({ onClose }) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('strategies'); // Default to first topic

  const topics: TopicItem[] = [
    {
      id: 'strategies',
      icon: <FiTarget className="topic-icon" />,
      title: 'Strategies',
      description: 'The Strategies Module collects your recent activities, trending hashtags, and personalized recommendations. Updated daily or every two days, it provides seasonal and targeted suggestions to guide your growth — backed by real data, not guesswork.',
      color: '#FF6B6B'
    },
    {
      id: 'competitor-analysis',
      icon: <FiUsers className="topic-icon" />,
      title: 'Competitor Analysis',
      description: 'The Competitor Analysis Module studies your competitors\' recent activities, strategies, and engagement patterns. AI processes their profile data to identify their strengths and give you actionable ways to outperform them.',
      color: '#4ECDC4'
    },
    {
      id: 'cooked-post',
      icon: <FiEdit className="topic-icon" />,
      title: 'Cooked Post',
      description: 'The Cooked Post Module generates trend-aligned, AI-tailored post suggestions for your account\'s theme. Each post includes carefully chosen hashtags for maximum reach. You can edit or schedule them after connecting your platform.',
      color: '#45B7D1'
    },
    {
      id: 'news4u',
      icon: <FiFileText className="topic-icon" />,
      title: 'News4U',
      description: 'The News4U Module curates trending news relevant to your niche. You can turn these into posts, memes, or commentaries to keep your audience updated and engaged.',
      color: '#96CEB4'
    },
    {
      id: 'notifications',
      icon: <FiBell className="topic-icon" />,
      title: 'Notifications',
      description: 'The Notifications Module manages all incoming DMs and comments once your platform is connected via API. You can reply manually or let your AI Manager respond following your tone, personalization, and rules — without breaking your communication style.',
      color: '#FFEAA7'
    },
    {
      id: 'goal',
      icon: <FiFlag className="topic-icon" />,
      title: 'Goal',
      description: 'The Goal Module lets you set a target, such as increasing followers, boosting reach, building awareness, or launching a content series. Simply describe your goal and the AI will plan the number of posts, style, and schedule required to achieve it organically.',
      color: '#DDA0DD'
    },
    {
      id: 'campaign',
      icon: <FiPlay className="topic-icon" />,
      title: 'Campaign',
      description: 'The Campaign Module works with your goals. It explains why certain posts were suggested, the theme they follow, and the expected outcomes. All campaign-generated posts appear in your Cooked Post Module for review or scheduling.',
      color: '#98D8C8'
    },
    {
      id: 'autopilot',
      icon: <FiZap className="topic-icon" />,
      title: 'Autopilot',
      description: 'The Autopilot Module turns your account into a fully automated, hyper-personalized bot that acts exactly like you. It schedules posts at optimal times, manages DMs, and keeps your account constantly active to outperform competitors.',
      color: '#F7DC6F'
    },
    {
      id: 'insights',
      icon: <FiBarChart className="topic-icon" />,
      title: 'Insights',
      description: 'The Insights Module delivers statistical analyses of your account — including posting patterns, engagement trends, active times, and seasonal activity. It uses AI-driven time series forecasting to help you post at the most effective times.',
      color: '#BB8FCE'
    },
    {
      id: 'reset',
      icon: <FiRefreshCw className="topic-icon" />,
      title: 'Reset',
      description: 'The Reset Button clears your dashboard completely. Once reset, you cannot access it again without re-entering and setting up your username. Ideal if you want to manage a different account or remove your current one.',
      color: '#F1948A'
    },
    {
      id: 'image-editor',
      icon: <FiImage className="topic-icon" />,
      title: 'Image Editor',
      description: 'The Image Editor is a built-in mini design tool. Upload images from your device or edit existing Cooked Post images. Add branding, text, icons, filters, watermarks, or crop and resize. You can apply your brand kit to multiple images in one click and schedule them directly from the editor.',
      color: '#85C1E9'
    },
    {
      id: 'ai-chat',
      icon: <FiMessageCircle className="topic-icon" />,
      title: 'AI Chat Bar',
      description: 'The AI Chat Bar is your personal manager. You can ask about your profile performance, audience mood, trending hashtags, or even optimize your strategies. It knows your profile data inside out and can help you plan, analyze, and improve — all through simple conversation.',
      color: '#82E0AA'
    }
  ];

  const selectedTopicData = topics.find(topic => topic.id === selectedTopic);

  return (
    <motion.div
      className="manual-guidance-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="manual-guidance-popup"
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 50 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="manual-header">
          <div className="manual-title">
            <FiBookOpen className="manual-icon" />
            <h2>Dashboard Manual</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {/* Content - Two Column Layout */}
        <div className="manual-content">
          {/* Left Column - Topics List */}
          <div className="topics-sidebar">
            <h3 className="sidebar-title">Topics</h3>
            <div className="topics-list">
              {topics.map((topic) => (
                <motion.div
                  key={topic.id}
                  className={`topic-item ${selectedTopic === topic.id ? 'active' : ''}`}
                  style={{ '--topic-color': topic.color } as React.CSSProperties}
                  whileHover={{ 
                    x: 5,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedTopic(topic.id)}
                >
                  <div className="topic-item-icon" style={{ backgroundColor: topic.color }}>
                    {topic.icon}
                  </div>
                  <span className="topic-item-title">{topic.title}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right Column - Content Display */}
          <div className="content-panel">
            <div className="content-header">
              <div className="content-logo">
                <FiBookOpen />
              </div>
              <h2 className="content-title">{selectedTopicData?.title}</h2>
            </div>
            <div className="content-body">
              <p className="content-description">{selectedTopicData?.description}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ManualGuidance;
