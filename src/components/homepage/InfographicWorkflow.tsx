import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import './InfographicWorkflow.css';
import { FaDatabase, FaShieldAlt, FaBrain, FaRocket, FaArrowRight } from 'react-icons/fa';

interface WorkflowStep {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  details: string[];
}

const workflowSteps: WorkflowStep[] = [
  {
    id: 1,
    title: "Data Extraction",
    subtitle: "Account Intelligence",
    description: "We connect to your social media accounts through official APIs and extract comprehensive profile data",
    icon: <FaDatabase />,
    color: "#00ffcc",
    details: [
      "Profile information & metadata",
      "Historical posts & engagement",
      "Audience demographics",
      "Content performance metrics"
    ]
  },
  {
    id: 2,
    title: "R2 Secure Storage",
    subtitle: "Cloudflare Infrastructure",
    description: "Your data is encrypted end-to-end and stored in Cloudflare R2 buckets with military-grade security",
    icon: <FaShieldAlt />,
    color: "#00ccff",
    details: [
      "AES-256 encryption at rest",
      "TLS 1.3 in transit",
      "GDPR & SOC 2 compliant",
      "99.99% uptime SLA"
    ]
  },
  {
    id: 3,
    title: "RAG Processing",
    subtitle: "Fine-tuned AI Model",
    description: "Advanced Retrieval-Augmented Generation analyzes your brand voice and creates personalized strategies",
    icon: <FaBrain />,
    color: "#0099ff",
    details: [
      "Brand voice analysis",
      "Context-aware generation",
      "Sentiment optimization",
      "A/B testing predictions"
    ]
  },
  {
    id: 4,
    title: "Exponential Growth",
    subtitle: "Automated Excellence",
    description: "AI-powered posting, engagement, and analytics drive measurable business results 24/7",
    icon: <FaRocket />,
    color: "#00ff88",
    details: [
      "300% engagement increase",
      "10x ROI improvement",
      "24/7 automated posting",
      "Real-time optimization"
    ]
  }
];

const InfographicWorkflow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [ref, inView] = useInView({
    threshold: 0.3,
    triggerOnce: false
  });

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.8, 1, 1, 0.8]);

  useEffect(() => {
    if (!inView) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % workflowSteps.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [inView]);

  return (
    <div ref={containerRef} className="infographic-workflow-container">
      <motion.div 
        ref={ref}
        className="workflow-wrapper"
        style={{ opacity, scale }}
      >
        {/* Sticky Header */}
        <div className="workflow-header sticky-header">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            Our <span className="gradient-text-workflow">Sentient AI Architecture</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="workflow-subtitle"
          >
            How we transform your social media into an autonomous growth engine
          </motion.p>
        </div>

        {/* Workflow Steps with Zoom In Effect */}
        <div className="workflow-steps-container">
          {workflowSteps.map((step, index) => (
            <motion.div
              key={step.id}
              className={`workflow-step interactive-element ${activeStep === index ? 'active' : ''}`}
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ 
                duration: 0.6, 
                delay: index * 0.2,
                type: "spring",
                stiffness: 100
              }}
              onMouseEnter={() => setActiveStep(index)}
            >
              {/* Step Number Badge */}
              <motion.div 
                className="step-number"
                style={{ borderColor: step.color }}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {step.id}
              </motion.div>

              {/* Icon Container with Glow */}
              <motion.div 
                className="step-icon-container"
                style={{ 
                  background: `radial-gradient(circle, ${step.color}22, transparent)`,
                  borderColor: step.color
                }}
                animate={activeStep === index ? {
                  boxShadow: [
                    `0 0 20px ${step.color}44`,
                    `0 0 40px ${step.color}88`,
                    `0 0 20px ${step.color}44`
                  ]
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="step-icon" style={{ color: step.color }}>
                  {step.icon}
                </div>
              </motion.div>

              {/* Step Content */}
              <div className="step-content">
                <motion.h3 
                  className="step-title"
                  style={{ color: step.color }}
                >
                  {step.title}
                </motion.h3>
                <p className="step-subtitle">{step.subtitle}</p>
                <p className="step-description">{step.description}</p>

                {/* Expandable Details */}
                <motion.div 
                  className="step-details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={activeStep === index ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <ul>
                    {step.details.map((detail, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={activeStep === index ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <span className="detail-bullet" style={{ background: step.color }} />
                        {detail}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </div>

              {/* Connection Line */}
              {index < workflowSteps.length - 1 && (
                <motion.div 
                  className="connection-line"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: index * 0.2 + 0.4 }}
                >
                  <motion.div 
                    className="connection-arrow"
                    animate={{ x: [0, 10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <FaArrowRight />
                  </motion.div>
                  
                  {/* Animated Data Particles */}
                  <motion.div
                    className="data-particle"
                    animate={{
                      x: ['0%', '100%'],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                  />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom Stats */}
        <motion.div 
          className="workflow-stats"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="stat-card interactive-element">
            <h4>99.9%</h4>
            <p>Uptime Guarantee</p>
          </div>
          <div className="stat-card interactive-element">
            <h4>256-bit</h4>
            <p>AES Encryption</p>
          </div>
          <div className="stat-card interactive-element">
            <h4>&lt;100ms</h4>
            <p>API Response Time</p>
          </div>
          <div className="stat-card interactive-element">
            <h4>50K+</h4>
            <p>Active Users</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default InfographicWorkflow;
