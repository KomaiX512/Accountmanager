import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  FiCpu, 
  FiZap, 
  FiBarChart, 
  FiClock, 
  FiMessageCircle, 
  FiTarget 
} from 'react-icons/fi';
import './Homepage.css';

const Homepage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { scrollY } = useScroll();
  
  // Parallax transforms
  const y1 = useTransform(scrollY, [0, 300], [0, -50]);
  const y2 = useTransform(scrollY, [0, 300], [0, -100]);
  const y3 = useTransform(scrollY, [0, 300], [0, -150]);
  const opacity = useTransform(scrollY, [0, 200], [1, 0]);
  
  // Smooth spring animations
  const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      const xPos = (clientX / innerWidth - 0.5) * 20;
      const yPos = (clientY / innerHeight - 0.5) * 20;
      x.set(xPos);
      y.set(yPos);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [x, y]);

  const handleGetStarted = () => {
    if (currentUser) {
      navigate('/account');
    } else {
      navigate('/login');
    }
  };

  const handleGoToDashboard = () => {
    navigate('/account');
  };

  const features = [
    {
      icon: <FiCpu size={48} />,
      title: 'AI-Powered Intelligence',
      description: 'Advanced machine learning algorithms analyze your audience and optimize content for maximum engagement.'
    },
    {
      icon: <FiZap size={48} />,
      title: 'Multi-Platform Management',
      description: 'Seamlessly manage Instagram, Twitter, Facebook, and LinkedIn from one unified dashboard.'
    },
    {
      icon: <FiBarChart size={48} />,
      title: 'Real-Time Analytics',
      description: 'Get instant insights into your performance with comprehensive analytics and reporting.'
    },
    {
      icon: <FiClock size={48} />,
      title: 'Automated Scheduling',
      description: 'Smart scheduling that posts at optimal times for your audience across all platforms.'
    },
    {
      icon: <FiMessageCircle size={48} />,
      title: 'Intelligent Conversations',
      description: 'AI-powered chat system that understands context and provides strategic recommendations.'
    },
    {
      icon: <FiTarget size={48} />,
      title: 'Competitor Analysis',
      description: 'Stay ahead with deep competitor insights and market trend analysis.'
    }
  ];

  return (
    <div className="homepage">
      {/* Hero Section */}
      <motion.section 
        className="hero-section"
        style={{ y: y1, opacity }}
      >
        <div className="hero-background">
          <motion.div 
            className="floating-element element-1"
            style={{ x, y }}
          />
          <motion.div 
            className="floating-element element-2"
            style={{ x: useTransform(x, (value) => value * -0.5), y: useTransform(y, (value) => value * -0.5) }}
          />
          <motion.div 
            className="floating-element element-3"
            style={{ x: useTransform(x, (value) => value * 0.3), y: useTransform(y, (value) => value * 0.3) }}
          />
        </div>
        
        <div className="hero-content">
          <motion.div
            className="hero-logo"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 1, type: "spring", stiffness: 100 }}
          >
            <img src="/Logo/logo.png" alt="Sentient AI" />
          </motion.div>
          
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <motion.span 
              className="title-intro"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Introducing
            </motion.span>
            <span className="title-main">Sentient AI</span>
            <span className="title-sub">Social Media Intelligence</span>
          </motion.h1>
          
          <motion.p
            className="hero-description"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Revolutionize your social media presence with our AI-powered platform. 
            Intelligent automation, strategic insights, and seamless management across all platforms.
          </motion.p>
          
          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            {currentUser ? (
              <motion.button
                className="btn-primary large"
                onClick={handleGoToDashboard}
                whileHover={{ scale: 1.05, boxShadow: "0 10px 30px rgba(0, 255, 204, 0.4)" }}
                whileTap={{ scale: 0.95 }}
              >
                Go to Dashboard
              </motion.button>
            ) : (
              <motion.button
                className="btn-primary large"
                onClick={handleGetStarted}
                whileHover={{ scale: 1.05, boxShadow: "0 10px 30px rgba(0, 255, 204, 0.4)" }}
                whileTap={{ scale: 0.95 }}
              >
                Get Started Free
              </motion.button>
            )}
          </motion.div>
        </div>
        
        <motion.div
          className="scroll-indicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <motion.div
            className="scroll-arrow"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ↓
          </motion.div>
          <span>Discover More</span>
        </motion.div>
      </motion.section>

      {/* Features Section */}
      <motion.section 
        className="features-section"
        style={{ y: y2 }}
      >
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2>Intelligent Features</h2>
            <p>Powered by advanced AI to transform your social media strategy</p>
          </motion.div>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="feature-card"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ 
                  scale: 1.05, 
                  boxShadow: "0 20px 40px rgba(0, 255, 204, 0.2)",
                  y: -10
                }}
                viewport={{ once: true }}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Stats Section */}
      <motion.section 
        className="stats-section"
        style={{ y: y3 }}
      >
        <div className="container">
          <motion.div
            className="stats-grid"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <motion.div 
              className="stat-item"
              whileHover={{ scale: 1.1 }}
            >
              <div className="stat-number">10K+</div>
              <div className="stat-label">Active Users</div>
            </motion.div>
            <motion.div 
              className="stat-item"
              whileHover={{ scale: 1.1 }}
            >
              <div className="stat-number">1M+</div>
              <div className="stat-label">Posts Managed</div>
            </motion.div>
            <motion.div 
              className="stat-item"
              whileHover={{ scale: 1.1 }}
            >
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Uptime</div>
            </motion.div>
            <motion.div 
              className="stat-item"
              whileHover={{ scale: 1.1 }}
            >
              <div className="stat-number">24/7</div>
              <div className="stat-label">AI Support</div>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section 
        className="cta-section"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 1 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ scale: 0.8 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2>Ready to Transform Your Social Media?</h2>
            <p>Join thousands of businesses already using Sentient AI to grow their online presence.</p>
            
            <motion.div
              className="cta-buttons"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
            >
              {currentUser ? (
                <motion.button
                  className="btn-primary large"
                  onClick={handleGoToDashboard}
                  whileHover={{ scale: 1.05, boxShadow: "0 15px 35px rgba(0, 255, 204, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  Access Your Dashboard
                </motion.button>
              ) : (
                <motion.button
                  className="btn-primary large"
                  onClick={handleGetStarted}
                  whileHover={{ scale: 1.05, boxShadow: "0 15px 35px rgba(0, 255, 204, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  Start Your Free Trial
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
};

export default Homepage; 