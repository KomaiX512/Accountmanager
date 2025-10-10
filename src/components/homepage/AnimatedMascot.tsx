import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './AnimatedMascot.css';

interface AnimatedMascotProps {
  mousePosition: { x: number; y: number };
}

const AnimatedMascot: React.FC<AnimatedMascotProps> = ({ mousePosition }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [message, setMessage] = useState("Hey there! I'm your AI Manager");
  const mascotRef = useRef<HTMLDivElement>(null);
  
  const messages = [
    "Hey there! I'm your AI Manager",
    "Let me handle your social media 24/7",
    "I never sleep, never take breaks",
    "Join 50,000+ businesses growing with me",
    "Click below to acquire me as your manager",
    "I'll 10x your engagement, guaranteed!"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      setMessage(randomMessage);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Eye tracking logic
  const eyeStyle = {
    transform: `translate(${mousePosition.x * 10}px, ${mousePosition.y * 10}px)`
  };

  return (
    <div className="mascot-container">
      <motion.div 
        ref={mascotRef}
        className="ai-mascot"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: "spring",
          stiffness: 260,
          damping: 20,
          duration: 1.5 
        }}
        whileHover={{ scale: 1.1 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
      >
        {/* Robot Head */}
        <div className="robot-head">
          <div className="robot-antenna">
            <motion.div 
              className="antenna-light"
              animate={{ 
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.2, 0.8]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
          
          {/* Robot Face */}
          <div className="robot-face">
            {/* Eyes that follow mouse */}
            <div className="robot-eyes">
              <div className="robot-eye left">
                <div className="eye-pupil" style={eyeStyle} />
              </div>
              <div className="robot-eye right">
                <div className="eye-pupil" style={eyeStyle} />
              </div>
            </div>
            
            {/* Animated Mouth */}
            <motion.div 
              className="robot-mouth"
              animate={isHovered ? {
                height: ["8px", "25px", "8px"],
                borderRadius: ["50%", "20px", "50%"]
              } : {}}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        
        {/* Robot Body */}
        <div className="robot-body">
          <div className="robot-chest">
            <motion.div 
              className="chest-core"
              animate={{
                boxShadow: [
                  "0 0 20px rgba(0, 255, 204, 0.5)",
                  "0 0 40px rgba(0, 255, 204, 0.8)",
                  "0 0 20px rgba(0, 255, 204, 0.5)"
                ]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
          
          {/* Robot Arms */}
          <motion.div 
            className="robot-arm left"
            animate={{ 
              rotate: [0, 10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div 
            className="robot-arm right"
            animate={{ 
              rotate: [0, -10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />
        </div>
      </motion.div>
      
      {/* Speech Bubble */}
      <motion.div 
        className="speech-bubble"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        <motion.p
          key={message}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
        >
          {message}
        </motion.p>
        <div className="bubble-tail" />
      </motion.div>
      
      {/* Floating Particles Around Mascot */}
      <div className="particle-field">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="floating-particle"
            initial={{
              x: Math.random() * 400 - 200,
              y: Math.random() * 400 - 200,
            }}
            animate={{
              x: Math.random() * 400 - 200,
              y: Math.random() * 400 - 200,
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear"
            }}
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default AnimatedMascot;
