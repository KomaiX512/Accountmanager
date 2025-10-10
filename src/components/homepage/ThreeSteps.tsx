import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaUserPlus, FaRobot, FaChartLine } from 'react-icons/fa';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface Step {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Sign Up",
    description: "Create your account in 30 seconds. No credit card required for trial.",
    icon: <FaUserPlus />,
    color: "#00ffcc"
  },
  {
    number: "02", 
    title: "Connect & Learn",
    description: "Enter your social media username. Our AI analyzes your brand instantly.",
    icon: <FaRobot />,
    color: "#00ccff"
  },
  {
    number: "03",
    title: "Watch It Grow",
    description: "Sit back as AI creates, posts, and engages automatically 24/7.",
    icon: <FaChartLine />,
    color: "#0099ff"
  }
];

const ThreeSteps: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const path = pathRef.current;
    if (!container || !path) return;

    const pathLength = path.getTotalLength();
    
    // Set initial state
    gsap.set(path, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength
    });

    // Create timeline
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 1,
      }
    });

    // Animate path drawing
    tl.to(path, {
      strokeDashoffset: 0,
      duration: 2,
      ease: 'none'
    });

    // Animate step cards
    const stepCards = container.querySelectorAll('.step-card');
    stepCards.forEach((card, index) => {
      tl.from(card, {
        scale: 0,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(1.7)'
      }, index * 0.3);
    });

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);

  return (
    <div ref={containerRef} className="three-steps-container">
      <motion.div
        className="three-steps-header"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <h2 className="three-steps-title">
          Get Started in <span className="gradient-text">3 Simple Steps</span>
        </h2>
        <p className="three-steps-subtitle">
          From sign up to growth in under 5 minutes
        </p>
      </motion.div>

      <div className="steps-wrapper">
        {/* Animated connecting line */}
        <svg className="steps-connector" viewBox="0 0 1000 200">
          <path
            ref={pathRef}
            d="M 50 100 Q 250 50 500 100 T 950 100"
            fill="none"
            stroke="url(#step-gradient)"
            strokeWidth="3"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="step-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00ffcc" />
              <stop offset="50%" stopColor="#00ccff" />
              <stop offset="100%" stopColor="#0099ff" />
            </linearGradient>
          </defs>
        </svg>

        <div className="steps-grid">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              className="step-card"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              viewport={{ once: true }}
              whileHover={{ 
                y: -10,
                transition: { duration: 0.3 }
              }}
            >
              <motion.div 
                className="step-number"
                style={{ 
                  background: `linear-gradient(135deg, ${step.color}22, ${step.color}44)`,
                  border: `2px solid ${step.color}`
                }}
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                {step.number}
              </motion.div>
              
              <motion.div 
                className="step-icon"
                style={{ color: step.color }}
                whileHover={{ scale: 1.2, rotate: -5 }}
              >
                {step.icon}
              </motion.div>
              
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
              
              {index < steps.length - 1 && (
                <motion.div 
                  className="step-arrow"
                  initial={{ x: 0 }}
                  animate={{ x: [0, 10, 0] }}
                  transition={{ 
                    repeat: Infinity,
                    duration: 2,
                    ease: "easeInOut"
                  }}
                >
                  →
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div 
          className="steps-cta"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          viewport={{ once: true }}
        >
          <motion.button
            className="steps-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.href = '/account'}
          >
            Start Your Free Trial Now
            <motion.span
              className="button-arrow"
              animate={{ x: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              →
            </motion.span>
          </motion.button>
          <p className="steps-note">No credit card required • 7-day free trial</p>
        </motion.div>
      </div>
    </div>
  );
};

export default ThreeSteps;
