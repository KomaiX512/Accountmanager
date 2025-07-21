import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaBrain, FaRocket, FaChartLine, FaUsers, FaInstagram, FaFacebook, FaTwitter, FaLinkedin, FaTiktok, FaYoutube } from 'react-icons/fa';
import './Homepage.css';
import NeuralNetwork from './NeuralNetwork';

// Feature flag to control neural network rendering
const ENABLE_NEURAL_NETWORK = false;

const Homepage: React.FC = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Only add mouse tracking if neural network is enabled
    if (!ENABLE_NEURAL_NETWORK) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse position to -1 to 1 range
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePosition({ x: x * 5, y: y * 5 });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <>
      {/* Neural Network or Static Background */}
      {ENABLE_NEURAL_NETWORK ? (
        <NeuralNetwork mouseX={mousePosition.x} mouseY={mousePosition.y} />
      ) : (
        <div className="static-background" />
      )}
      
      {/* Scrollable Content Layer */}
      <div className="homepage">
        <div className="content-overlay">
          {/* Hero Section */}
          <motion.section 
            className="hero-section"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <div className="container">
              <div className="glassy-hero">
                <motion.h1 
                  className="hero-title"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1.2, delay: 0.3 }}
                >
                  <span className="title-intro">Welcome to the Future of</span>
                  <span className="gradient-text">Sentient Marketing</span>
                  <span className="title-sub">AI-Powered Social Media Mastery</span>
                </motion.h1>
                
                <motion.p 
                  className="hero-description"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1, delay: 0.6 }}
                >
                  Transform your social media presence with cutting-edge AI that thinks, learns, and grows your brand across all platforms with unprecedented intelligence and precision.
                </motion.p>
                
                <motion.div 
                  className="hero-buttons"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1, delay: 0.9 }}
                >
                  <button 
                    className="glassy-button btn-primary large"
                    onClick={() => window.location.href = '/account'}
                  >
                    Get your AI SMM Agent
                  </button>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* Features Section */}
          <motion.section 
            className="features-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="section-header">
                <h2>Revolutionary AI Capabilities</h2>
                <p>Experience the next generation of social media management with our sentient AI technology</p>
              </div>
              
              <div className="features-grid">
                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaBrain />
                  </div>
                  <h3>Neural Content Creation</h3>
                  <p>Our AI brain generates viral-worthy content that resonates with your audience across Instagram, Facebook, Twitter, LinkedIn, TikTok, and YouTube.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaRocket />
                  </div>
                  <h3>Autonomous Growth Engine</h3>
                  <p>Self-optimizing algorithms that learn from every interaction to exponentially grow your follower base and engagement rates.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaChartLine />
                  </div>
                  <h3>Predictive Analytics</h3>
                  <p>Advanced forecasting models that predict viral trends and optimal posting times with 97% accuracy across all platforms.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaUsers />
                  </div>
                  <h3>Multi-Platform Synergy</h3>
                  <p>Seamlessly coordinate campaigns across Instagram, Facebook, Twitter, LinkedIn, TikTok, and YouTube with platform-specific optimization.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaInstagram />
                  </div>
                  <h3>Platform Intelligence</h3>
                  <p>Deep understanding of each platform's unique algorithm and user behavior patterns for maximum reach and engagement.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaYoutube />
                  </div>
                  <h3>Video AI Creation</h3>
                  <p>Generate compelling video content for TikTok, YouTube, and Instagram Reels with our advanced video AI engine.</p>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* Platform Icons Section */}
          <motion.section 
            className="stats-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="section-header">
                <h2>Supported Platforms</h2>
                <p>Master every major social media platform with our unified AI approach</p>
              </div>
              
              <div className="stats-grid">
                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <FaInstagram className="social-icon" />
                  <div className="stat-label">Instagram</div>
                </motion.div>

                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <FaFacebook className="social-icon" />
                  <div className="stat-label">Facebook</div>
                </motion.div>

                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <FaTwitter className="social-icon" />
                  <div className="stat-label">Twitter</div>
                </motion.div>

                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  viewport={{ once: true }}
                >
                  <FaLinkedin className="social-icon" />
                  <div className="stat-label">LinkedIn</div>
                </motion.div>

                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  viewport={{ once: true }}
                >
                  <FaTiktok className="social-icon" />
                  <div className="stat-label">TikTok</div>
                </motion.div>

                <motion.div 
                  className="glassy-stat social-platform"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                  viewport={{ once: true }}
                >
                  <FaYoutube className="social-icon" />
                  <div className="stat-label">YouTube</div>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* Footer Section */}
          <motion.footer 
            className="footer-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <motion.div 
                className="footer-content"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <div className="footer-links">
                  <motion.a 
                    href="/privacy" 
                    className="footer-link"
                    whileHover={{ scale: 1.05, color: '#00ffcc' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Privacy Policy
                  </motion.a>
                  <motion.a 
                    href="/pricing" 
                    className="footer-link"
                    whileHover={{ scale: 1.05, color: '#00ccff' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Pricing
                  </motion.a>
                </div>
                <p className="footer-copyright">
                  &copy; {new Date().getFullYear()} Sentient AI. All rights reserved.
                </p>
              </motion.div>
            </div>
          </motion.footer>
        </div>
      </div>
    </>
  );
};

export default Homepage; 