import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import './FeatureShowcase.css';
import { 
  FaRobot, FaImage, FaChartBar, FaBullseye, FaRocket, FaUser,
  FaCog, FaSearch, FaLightbulb, FaPen, FaNewspaper, FaComments,
  FaCheckCircle, FaBrain, FaMicrochip, FaAtom
} from 'react-icons/fa';

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  details: string[];
}

const features: Feature[] = [
  {
    id: 'chatbot',
    title: 'AI Chatbot',
    description: 'Intelligent conversations that understand your brand voice',
    icon: <FaRobot />,
    color: '#00ffcc',
    details: [
      'Natural language processing',
      'Context-aware responses',
      'Multi-language support',
      'Learning from interactions'
    ]
  },
  {
    id: 'image-studio',
    title: 'Image Studio',
    description: 'Professional image editing and generation powered by AI',
    icon: <FaImage />,
    color: '#00ccff',
    details: [
      'AI image generation',
      'Background removal',
      'Smart cropping & resizing',
      'Brand template library'
    ]
  },
  {
    id: 'stats',
    title: 'Advanced Analytics',
    description: 'Real-time insights and performance metrics',
    icon: <FaChartBar />,
    color: '#0099ff',
    details: [
      'Engagement tracking',
      'Audience demographics',
      'Growth predictions',
      'Competitor benchmarking'
    ]
  },
  {
    id: 'goals',
    title: 'Goal Setting',
    description: 'Set and track your social media objectives',
    icon: <FaBullseye />,
    color: '#00ff88',
    details: [
      'Custom KPI tracking',
      'Milestone celebrations',
      'Progress visualization',
      'Automated recommendations'
    ]
  },
  {
    id: 'autopilot',
    title: 'Autopilot Mode',
    description: 'Fully automated content creation and posting',
    icon: <FaRocket />,
    color: '#ff00cc',
    details: [
      'Smart scheduling',
      'Content generation',
      'Optimal timing analysis',
      'Auto-engagement'
    ]
  },
  {
    id: 'profile',
    title: 'Profile Manager',
    description: 'Manage multiple accounts from one dashboard',
    icon: <FaUser />,
    color: '#ffcc00',
    details: [
      'Multi-platform support',
      'Unified inbox',
      'Cross-posting',
      'Account switching'
    ]
  },
  {
    id: 'rules',
    title: 'Manager Rules',
    description: 'Custom automation rules and workflows',
    icon: <FaCog />,
    color: '#cc00ff',
    details: [
      'If-then automation',
      'Content filters',
      'Approval workflows',
      'Custom triggers'
    ]
  },
  {
    id: 'competitor',
    title: 'Competitor Analysis',
    description: 'Track and learn from your competition',
    icon: <FaSearch />,
    color: '#ff6600',
    details: [
      'Competitor tracking',
      'Content analysis',
      'Strategy insights',
      'Market positioning'
    ]
  },
  {
    id: 'strategies',
    title: 'AI Strategies',
    description: 'Data-driven recommendations for growth',
    icon: <FaLightbulb />,
    color: '#00ffaa',
    details: [
      'Growth strategies',
      'Content suggestions',
      'Timing optimization',
      'Hashtag recommendations'
    ]
  },
  {
    id: 'post-creation',
    title: 'Post Creation',
    description: 'Create engaging content with AI assistance',
    icon: <FaPen />,
    color: '#ff0088',
    details: [
      'AI writing assistant',
      'Template library',
      'Media integration',
      'Preview & schedule'
    ]
  },
  {
    id: 'news-trends',
    title: 'News & Trends',
    description: 'Stay updated with real-time trending topics',
    icon: <FaNewspaper />,
    color: '#8800ff',
    details: [
      'Trending topics',
      'Industry news',
      'Viral content alerts',
      'Opportunity detection'
    ]
  },
  {
    id: 'dm-comments',
    title: 'DM & Comments',
    description: 'Unified inbox for all your social interactions',
    icon: <FaComments />,
    color: '#ff4400',
    details: [
      'Unified inbox',
      'AI-powered replies',
      'Sentiment analysis',
      'Priority filtering'
    ]
  }
];

const FeatureShowcase: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState<string>(features[0].id);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.8, 1, 1, 0.95]);
  const springY = useSpring(y, { stiffness: 100, damping: 30 });

  const currentFeature = features.find(f => f.id === activeFeature) || features[0];

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: (e.clientX - rect.left - rect.width / 2) / 20,
          y: (e.clientY - rect.top - rect.height / 2) / 20
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="feature-showcase-container" ref={containerRef}>
      <motion.div 
        className="showcase-header"
        style={{ opacity, scale }}
      >
        <motion.div
          className="header-floating-badge"
          animate={{
            y: [0, -10, 0],
            rotate: [0, 3, 0, -3, 0]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <FaBrain className="badge-icon" />
          <span>AI-Powered</span>
        </motion.div>
        <h2 className="showcase-title">
          Everything You Need in <span className="gradient-text">One Dashboard</span>
        </h2>
        <p className="showcase-subtitle">
          12+ powerful features working together to grow your social media presence
        </p>
      </motion.div>

      <motion.div className="showcase-content" style={{ y: springY }}>
        {/* Feature Grid */}
        <div className="feature-grid-showcase">
          {features.map((feature, index) => {
            const row = Math.floor(index / 2);
            const col = index % 2;
            
            return (
              <motion.div
                key={feature.id}
                className={`feature-item interactive-element ${activeFeature === feature.id ? 'active' : ''}`}
                initial={{ opacity: 0, y: 50, rotateX: -15 }}
                whileInView={{ 
                  opacity: 1, 
                  y: 0, 
                  rotateX: 0,
                  transition: {
                    delay: (row * 0.1) + (col * 0.05),
                    duration: 0.6,
                    ease: [0.25, 0.46, 0.45, 0.94]
                  }
                }}
                viewport={{ once: true, margin: "-100px" }}
                onClick={() => setActiveFeature(feature.id)}
                whileHover={{ 
                  scale: 1.03,
                  y: -8,
                  rotateY: col === 0 ? 5 : -5,
                  transition: { duration: 0.3, ease: "easeOut" }
                }}
                whileTap={{ scale: 0.97 }}
                style={{
                  transformStyle: 'preserve-3d',
                  perspective: 1000
                }}
              >
                <motion.div 
                  className="feature-item-glow"
                  style={{
                    background: `radial-gradient(circle, ${feature.color}44, transparent)`
                  }}
                  animate={activeFeature === feature.id ? {
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <div 
                  className="feature-item-icon"
                  style={{ 
                    background: `radial-gradient(circle, ${feature.color}33, transparent)`,
                    color: feature.color
                  }}
                >
                  {feature.icon}
                </div>
                <h4 className="feature-item-title">{feature.title}</h4>
                <motion.div 
                  className="feature-item-indicator"
                  initial={false}
                  animate={activeFeature === feature.id ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                  style={{ backgroundColor: feature.color }}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Feature Details Panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFeature}
            className="feature-details-panel"
            initial={{ opacity: 0, x: 50, rotateY: -15 }}
            animate={{ 
              opacity: 1, 
              x: 0, 
              rotateY: 0,
              transition: {
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94]
              }
            }}
            exit={{ opacity: 0, x: -50, rotateY: 15 }}
            style={{
              transformStyle: 'preserve-3d',
              transform: `translate3d(${mousePosition.x}px, ${mousePosition.y}px, 0)`
            }}
          >
            <div 
              className="feature-details-header"
              style={{ borderColor: currentFeature.color }}
            >
              <div 
                className="feature-details-icon"
                style={{ 
                  background: `radial-gradient(circle, ${currentFeature.color}44, transparent)`,
                  color: currentFeature.color
                }}
              >
                {currentFeature.icon}
              </div>
              <div>
                <h3 style={{ color: currentFeature.color }}>{currentFeature.title}</h3>
                <p>{currentFeature.description}</p>
              </div>
            </div>

            <div className="feature-details-list">
              {currentFeature.details.map((detail, i) => (
                <motion.div
                  key={i}
                  className="detail-item"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <FaCheckCircle style={{ color: currentFeature.color }} />
                  <span>{detail}</span>
                </motion.div>
              ))}
            </div>

            <motion.button
              className="feature-cta"
              style={{ 
                background: `linear-gradient(135deg, ${currentFeature.color}, ${currentFeature.color}aa)` 
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/account'}
            >
              Try {currentFeature.title} Now
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* AI Technology Section */}
      <motion.div 
        className="ai-technology-section"
        initial={{ opacity: 0, y: 100 }}
        whileInView={{ 
          opacity: 1, 
          y: 0,
          transition: { duration: 0.8, ease: "easeOut" }
        }}
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className="ai-tech-header">
          <motion.div
            className="ai-tech-badge"
            animate={{
              scale: [1, 1.05, 1],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            <FaMicrochip />
          </motion.div>
          <h3 className="ai-tech-title">
            Powered by <span className="gradient-text">Advanced AI</span>
          </h3>
          <p className="ai-tech-subtitle">
            State-of-the-art machine learning models working behind the scenes
          </p>
        </div>

        <div className="ai-tech-grid">
          {[
            {
              icon: <FaBrain />,
              title: "Neural networks",
              description: "Deep learning models that understand context and sentiment",
              color: "#00ffcc"
            },
            {
              icon: <FaAtom />,
              title: "Natural Language Processing",
              description: "Advanced NLP for human-like content generation",
              color: "#00ccff"
            },
            {
              icon: <FaMicrochip />,
              title: "Computer Vision",
              description: "AI-powered image analysis and generation",
              color: "#ff00cc"
            }
          ].map((tech, index) => (
            <motion.div
              key={index}
              className="ai-tech-card"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ 
                opacity: 1, 
                y: 0,
                transition: {
                  delay: index * 0.2,
                  duration: 0.6,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }
              }}
              whileHover={{
                y: -10,
                scale: 1.02,
                transition: { duration: 0.3 }
              }}
              viewport={{ once: true }}
            >
              <motion.div
                className="ai-tech-card-glow"
                style={{ background: `radial-gradient(circle, ${tech.color}44, transparent)` }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.2, 0.4, 0.2]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: index * 0.5
                }}
              />
              <div 
                className="ai-tech-card-icon"
                style={{ color: tech.color }}
              >
                {tech.icon}
              </div>
              <h4 className="ai-tech-card-title">{tech.title}</h4>
              <p className="ai-tech-card-description">{tech.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Dashboard Preview Image */}
      <motion.div 
        className="dashboard-preview"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="preview-wrapper">
          <img 
            src="/Logo/homepage_picture.jpeg" 
            alt="SentientM Dashboard Preview" 
            className="preview-image"
          />
          <div className="preview-overlay">
            <motion.div 
              className="preview-badge"
              animate={{ 
                y: [0, -10, 0],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <FaRocket /> Live Dashboard
            </motion.div>
          </div>
        </div>
        <p className="preview-caption">
          All features accessible from one beautiful, intuitive dashboard
        </p>
      </motion.div>
    </div>
  );
};

export default FeatureShowcase;
