import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './VideoShowcase.css';
import { FaPlay, FaPause, FaExpand, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';

const VideoShowcase: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="video-showcase-container">
      <motion.div 
        className="video-showcase-header"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="video-showcase-title">
          See <span className="gradient-text">SentientM</span> In Action
        </h2>
        <p className="video-showcase-subtitle">
          Watch how our AI transforms social media management in real-time
        </p>
      </motion.div>

      <motion.div 
        className="video-wrapper"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {/* Animated Border */}
        <div className="video-border-animation">
          <div className="border-glow border-glow-1" />
          <div className="border-glow border-glow-2" />
          <div className="border-glow border-glow-3" />
          <div className="border-glow border-glow-4" />
        </div>

        {/* Video Container */}
        <div className="video-container interactive-element">
          <video
            ref={videoRef}
            className="showcase-video"
            loop
            muted={isMuted}
            playsInline
            onClick={togglePlay}
          >
            <source src="/WhatsApp Video 2025-08-24 at 04.27.19_931e54eb.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>

          {/* Play Overlay */}
          {!isPlaying && (
            <motion.div 
              className="play-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={togglePlay}
            >
              <motion.div 
                className="play-button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(0, 255, 204, 0.3)',
                    '0 0 40px rgba(0, 255, 204, 0.6)',
                    '0 0 20px rgba(0, 255, 204, 0.3)'
                  ]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <FaPlay />
              </motion.div>
            </motion.div>
          )}

          {/* Custom Controls */}
          <motion.div 
            className="video-controls"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: showControls || !isPlaying ? 1 : 0, y: showControls || !isPlaying ? 0 : 20 }}
            transition={{ duration: 0.3 }}
          >
            <button className="control-btn" onClick={togglePlay}>
              {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            
            <button className="control-btn" onClick={toggleMute}>
              {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            
            <button className="control-btn" onClick={toggleFullscreen}>
              <FaExpand />
            </button>
          </motion.div>

          {/* Corner Decorations */}
          <div className="corner-decoration corner-tl" />
          <div className="corner-decoration corner-tr" />
          <div className="corner-decoration corner-bl" />
          <div className="corner-decoration corner-br" />
        </div>

        {/* Floating Particles Around Video */}
        <div className="video-particles">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="video-particle"
              animate={{
                x: [
                  Math.cos(i * 30 * Math.PI / 180) * 300,
                  Math.cos((i * 30 + 180) * Math.PI / 180) * 300,
                  Math.cos(i * 30 * Math.PI / 180) * 300
                ],
                y: [
                  Math.sin(i * 30 * Math.PI / 180) * 200,
                  Math.sin((i * 30 + 180) * Math.PI / 180) * 200,
                  Math.sin(i * 30 * Math.PI / 180) * 200
                ],
                opacity: [0.3, 0.8, 0.3]
              }}
              transition={{
                duration: 8 + i,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Video Features */}
      <motion.div 
        className="video-features"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <div className="video-feature-item">
          <div className="feature-number">01</div>
          <h4>Real Dashboard</h4>
          <p>Actual footage of our platform in action</p>
        </div>
        <div className="video-feature-item">
          <div className="feature-number">02</div>
          <h4>Live Features</h4>
          <p>See AI content generation in real-time</p>
        </div>
        <div className="video-feature-item">
          <div className="feature-number">03</div>
          <h4>User Experience</h4>
          <p>Intuitive interface designed for results</p>
        </div>
      </motion.div>
    </div>
  );
};

export default VideoShowcase;
