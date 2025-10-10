import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import UltraRobotMascot from './UltraRobotMascot';
import InfographicWorkflow from './InfographicWorkflow';
import FeatureShowcase from './FeatureShowcase';
import VideoShowcase from './VideoShowcase';
import './HomepageUltra.css';
import './InfographicWorkflow.css';
import './FeatureShowcase.css';
import './VideoShowcase.css';
import { 
  FaRocket, FaStar, FaPlay, FaTrophy,
  FaChartLine, FaBrain, FaShieldAlt, FaClock,
  FaArrowRight, FaQuoteLeft
} from 'react-icons/fa';

// Animated Background Gradient
const AnimatedBackground: React.FC = () => {
  return (
    <div className="animated-background">
      <div className="gradient-orb gradient-1" />
      <div className="gradient-orb gradient-2" />
      <div className="gradient-orb gradient-3" />
      <div className="gradient-orb gradient-4" />
      <div className="mesh-gradient" />
    </div>
  );
};

// Stats removed for minimalist Jony Ive approach

// Multi-Row Testimonial Carousel with Horizontal Scrolling
const TestimonialCarousel: React.FC = () => {
  const testimonials = [
    // Row 1 - Left to Right
    [
      { name: "Sarah Johnson", role: "E-commerce Owner", text: "SentientM transformed our social media! We went from 500 to 50K followers in 3 months.", avatar: "👩‍💼", growth: "+10,000%" },
      { name: "Mike Chen", role: "Startup Founder", text: "The AI understands our brand perfectly. Our engagement increased by 400%!", avatar: "👨‍💻", growth: "+400%" },
      { name: "Emma Davis", role: "Fashion Blogger", text: "I save 20 hours per week. The AI creates better content than I ever could!", avatar: "💄", growth: "20hrs saved" },
      { name: "John Smith", role: "Marketing Director", text: "Best investment we made! ROI increased by 10x in just 2 months.", avatar: "👨‍💼", growth: "10x ROI" }
    ],
    // Row 2 - Right to Left
    [
      { name: "Lisa Wang", role: "Influencer", text: "My engagement skyrocketed! The AI knows exactly what my audience wants.", avatar: "👩‍🎤", growth: "+500%" },
      { name: "David Brown", role: "Agency Owner", text: "Managing 50+ clients is now effortless. This AI is a game changer!", avatar: "👨‍💻", growth: "50+ clients" },
      { name: "Maria Garcia", role: "Restaurant Owner", text: "Our bookings doubled! The AI creates mouth-watering content daily.", avatar: "👩‍🍳", growth: "2x bookings" },
      { name: "Tom Wilson", role: "Fitness Coach", text: "Client acquisition increased 300%. The AI handles everything!", avatar: "💪", growth: "+300%" }
    ],
    // Row 3 - Left to Right
    [
      { name: "Anna Lee", role: "Beauty Brand", text: "Sales through social media tripled! The AI is incredibly smart.", avatar: "💅", growth: "3x sales" },
      { name: "Chris Taylor", role: "Tech Startup", text: "We went viral 3 times in one month. This AI understands trends!", avatar: "🚀", growth: "3 viral posts" },
      { name: "Sophie Martin", role: "Fashion Designer", text: "My brand visibility increased 400%. The AI is my secret weapon!", avatar: "👗", growth: "+400%" },
      { name: "Alex Kim", role: "Real Estate", text: "Property inquiries up 250%! Best marketing tool I've ever used.", avatar: "🏠", growth: "+250%" }
    ]
  ];

  return (
    <div className="testimonial-container-multi">
      {testimonials.map((row, rowIndex) => (
        <div 
          key={rowIndex} 
          className={`testimonial-row testimonial-row-${rowIndex % 2 === 0 ? 'ltr' : 'rtl'}`}
        >
          <div className="testimonial-track">
            {/* Duplicate for seamless loop */}
            {[...row, ...row].map((testimonial, index) => (
              <div key={index} className="testimonial-card-mini">
                <FaQuoteLeft className="quote-icon-mini" />
                <p className="testimonial-text-mini">{testimonial.text}</p>
                <div className="testimonial-author-mini">
                  <span className="avatar-mini">{testimonial.avatar}</span>
                  <div>
                    <h5>{testimonial.name}</h5>
                    <p>{testimonial.role}</p>
                  </div>
                  <span className="growth-badge-mini">{testimonial.growth}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const HomepageUltra: React.FC = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="homepage-ultra">
      <AnimatedBackground />
      
      {/* Hero Section with AI Mascot */}
      <section className="hero-ultra">
        <div className="hero-content-wrapper">
          <div className="hero-left interactive-element">
            <motion.div 
              className="hero-badge"
              initial={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <FaTrophy /> #1 AI Platform
            </motion.div>
            
            <motion.div 
              className="hero-title-container"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <h1 className="hero-title-ultra">
                Your <span className="gradient-text">AI Marketing Manager</span><br />
                That Never Sleeps
              </h1>
            </motion.div>
            
            <motion.p 
              className="hero-subtitle-ultra"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Transform your social media with sentient AI technology
            </motion.p>
            
            <motion.div 
              className="hero-cta-wrapper"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
            >
              <motion.button 
                className="cta-primary-ultra interactive-element"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => window.location.href = '/account'}
              >
                <FaRocket /> Start Free Trial
              </motion.button>
              <motion.button 
                className="cta-secondary-ultra interactive-element"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaPlay /> Watch Demo
              </motion.button>
            </motion.div>
            
            <div className="social-proof">
              <div className="avatars">
                {['👨‍💼', '👩‍💻', '👨‍🎨', '👩‍🚀', '👨‍🏫'].map((emoji, i) => (
                  <span key={i} className="avatar-item" style={{ zIndex: 5 - i }}>
                    {emoji}
                  </span>
                ))}
              </div>
              <div className="proof-text">
                <strong>50,000+</strong> happy users
                <div className="star-rating">
                  {[...Array(5)].map((_, i) => <FaStar key={i} />)}
                </div>
              </div>
            </div>
          </div>
          
          <div className="hero-right">
            <UltraRobotMascot mousePosition={mousePosition} />
          </div>
        </div>
      </section>

      {/* Architecture Visualization with Infographic Workflow */}
      <section className="architecture-section">
        <InfographicWorkflow />
      </section>

      {/* Video Introduction Showcase */}
      <section className="video-showcase-section">
        <VideoShowcase />
      </section>

      {/* Comprehensive Feature Showcase */}
      <section className="feature-showcase-section">
        <FeatureShowcase />
      </section>

      {/* Features Grid */}
      <section className="features-ultra">
        <motion.h2 
          className="section-title"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Powered by <span className="gradient-text">Advanced AI</span>
        </motion.h2>
        
        <div className="features-grid-ultra">
          {[
            { icon: <FaBrain />, title: "AI Content Creation", desc: "Generates viral content in your brand voice" },
            { icon: <FaClock />, title: "24/7 Automation", desc: "Never miss an opportunity to engage" },
            { icon: <FaChartLine />, title: "Predictive Analytics", desc: "Know what works before you post" },
            { icon: <FaShieldAlt />, title: "Bank-Level Security", desc: "Your data is encrypted and protected" }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              className="feature-card-ultra"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -10 }}
            >
              <div className="feature-icon-ultra">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section">
        <motion.h2 
          className="section-title"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Join <span className="gradient-text">50,000+ Businesses</span> Growing With AI
        </motion.h2>
        <TestimonialCarousel />
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <motion.div 
          className="cta-content"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <h2>Ready to <span className="gradient-text">10x Your Social Media?</span></h2>
          <p>Join thousands growing with AI. No credit card required.</p>
          <motion.button 
            className="cta-final-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Acquire Your AI Manager
            <FaArrowRight />
          </motion.button>
        </motion.div>
      </section>
    </div>
  );
};

export default HomepageUltra;
