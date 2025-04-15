import React, { useState } from 'react';
import './OurStrategies.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface OurStrategiesProps {
  accountHolder: string;
}

const OurStrategies: React.FC<OurStrategiesProps> = ({ accountHolder }) => {
  const [showPopup, setShowPopup] = useState(false);

  // Normalize accountHolder
  const normalizedAccountHolder = 'maccosmetics';

  // Fetch strategies
  const { data, loading } = useR2Fetch<any[]>(
    `http://localhost:3000/retrieve-strategies/${normalizedAccountHolder}`
  );

  return (
    <ErrorBoundary>
      <motion.div
        className="strategies-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className={`strategy-sub-container ${data ? 'loaded' : ''}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)' }}
          onClick={() => data && setShowPopup(true)}
        >
          <span className="overlay-text">1. Strategies</span>
          {loading && (
            <div className="futuristic-loading">
              <span className="loading-text">Analyzing Strategies...</span>
              <div className="particle-effect" />
            </div>
          )}
        </motion.div>

        {showPopup && (
          <motion.div
            className="popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="popup-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div className="profile-section">
                <h3>{normalizedAccountHolder}</h3>
                <div className="stats">
                  <span>Followers: TBD</span>
                  <span>Following: TBD</span>
                </div>
              </div>
              <div className="strategy-section">
                <h4>Our Strategies</h4>
                {data?.length ? (
                  data.map((strategy, index) => (
                    <motion.div
                      key={index}
                      className="strategy-card"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <h5>Strategy {index + 1}</h5>
                      <pre>{JSON.stringify(strategy, null, 2)}</pre>
                    </motion.div>
                  ))
                ) : (
                  <p>No strategies available.</p>
                )}
              </div>
              <motion.button
                className="close-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowPopup(false)}
              >
                Close
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </ErrorBoundary>
  );
};

export default OurStrategies;