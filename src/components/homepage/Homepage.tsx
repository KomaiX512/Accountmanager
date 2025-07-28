import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaBrain, FaRocket, FaChartLine, FaUsers, FaInstagram, FaFacebook, FaTwitter, FaLinkedin, FaTiktok, FaYoutube, FaClock, FaCrosshairs, FaShieldAlt, FaLightbulb, FaChartBar, FaUserCheck, FaMagic, FaRobot, FaCrown } from 'react-icons/fa';
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
                    Get your SMM AI Agent
                  </button>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* What We Do Section */}
          <motion.section 
            className="what-we-do-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="section-header">
                <h2>What Does Our AI Actually Do?</h2>
                <p>Think of it as your personal social media expert that never sleeps</p>
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
                    <FaMagic />
                  </div>
                  <h3>Creates Your Content</h3>
                  <p>Tell our AI about your brand, and it writes engaging posts, creates captions, and generates hashtags that actually work. No more staring at blank screens.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaClock />
                  </div>
                  <h3>Schedules Smart Posts</h3>
                  <p>Our AI knows when your audience is most active and posts your content at the perfect time. Set it up once, and it handles everything automatically.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaCrosshairs />
                  </div>
                  <h3>Targets Your Audience</h3>
                  <p>Automatically finds and engages with people who care about your niche. Grows your following with real, interested people, not fake accounts.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card feature-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  viewport={{ once: true }}
                >
                  <div className="feature-icon">
                    <FaChartBar />
                  </div>
                  <h3>Analyzes Performance</h3>
                  <p>Shows you exactly what's working and what's not. Our AI learns from every post to make your content better and better over time.</p>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* Who Needs This Section */}
          <motion.section 
            className="who-needs-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="section-header">
                <h2>Who Needs This?</h2>
                <p>If you're struggling with any of these, our AI is your solution</p>
              </div>
              
              <div className="user-types-grid">
                <motion.div 
                  className="glassy-card user-type-card"
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="user-type-icon">
                    <FaCrown />
                  </div>
                  <h3>Business Owners</h3>
                  <p>You're great at your business but social media feels like a time-suck. Our AI handles your social media while you focus on what you do best.</p>
                  <ul>
                    <li>Save 10+ hours per week</li>
                    <li>Professional brand presence</li>
                    <li>Generate leads automatically</li>
                  </ul>
                </motion.div>

                <motion.div 
                  className="glassy-card user-type-card"
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <div className="user-type-icon">
                    <FaUserCheck />
                  </div>
                  <h3>Content Creators</h3>
                  <p>You love creating content but hate the repetitive posting and scheduling. Our AI handles the boring stuff so you can focus on creativity.</p>
                  <ul>
                    <li>Consistent posting schedule</li>
                    <li>Grow your audience faster</li>
                    <li>Focus on your best content</li>
                  </ul>
                </motion.div>

                <motion.div 
                  className="glassy-card user-type-card"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <div className="user-type-icon">
                    <FaRocket />
                  </div>
                  <h3>Startups & Entrepreneurs</h3>
                  <p>You need to build a brand quickly but don't have the budget for a full marketing team. Our AI gives you enterprise-level social media presence.</p>
                  <ul>
                    <li>Professional brand building</li>
                    <li>Cost-effective marketing</li>
                    <li>Scale as you grow</li>
                  </ul>
                </motion.div>
              </div>
            </div>
          </motion.section>

          {/* How It Works Section */}
          <motion.section 
            id="how-it-works"
            className="how-it-works-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="section-header">
                <h2>How It Works</h2>
                <p>Get started in 3 simple steps</p>
              </div>
              
              <div className="steps-grid">
                <motion.div 
                  className="glassy-card step-card"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="step-number">1</div>
                  <div className="step-icon">
                    <FaShieldAlt />
                  </div>
                  <h3>Connect Your Accounts</h3>
                  <p>Securely connect your Instagram, Facebook, Twitter, LinkedIn, TikTok, or YouTube accounts. We use bank-level security to protect your data.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card step-card"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <div className="step-number">2</div>
                  <div className="step-icon">
                    <FaLightbulb />
                  </div>
                  <h3>Tell AI About Your Brand</h3>
                  <p>Share your brand story, target audience, and goals. Our AI learns your voice and creates content that sounds like you wrote it.</p>
                </motion.div>

                <motion.div 
                  className="glassy-card step-card"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <div className="step-number">3</div>
                  <div className="step-icon">
                    <FaRobot />
                  </div>
                  <h3>Watch Your Brand Grow</h3>
                  <p>Our AI starts creating and posting content immediately. You'll see your engagement and followers grow while you focus on your business.</p>
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
                <h2>Advanced AI Features</h2>
                <p>Powered by cutting-edge artificial intelligence that learns and adapts</p>
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

          {/* CTA Section */}
          <motion.section 
            className="cta-section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            <div className="container">
              <div className="glassy-cta">
                <motion.h2
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  Ready to Transform Your Social Media?
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  viewport={{ once: true }}
                >
                  Join thousands of businesses and creators who are already growing their audience with AI. Start your free trial today and see the difference in just 7 days.
                </motion.p>
                <motion.div 
                  className="cta-buttons"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                  viewport={{ once: true }}
                >
                  <button 
                    className="glassy-button btn-primary large"
                    onClick={() => window.location.href = '/account'}
                  >
                    Start Free Trial
                  </button>
                  <button 
                    className="glassy-button btn-secondary large"
                    onClick={() => window.location.href = '/pricing'}
                  >
                    View Pricing
                  </button>
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