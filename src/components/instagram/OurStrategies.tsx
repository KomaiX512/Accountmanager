import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './OurStrategies.css';
import '../../utils/jsonDecoder.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';
import { decodeJSONToReactElements } from '../../utils/jsonDecoder';
import { registerComponent, unregisterComponent } from '../../utils/componentRegistry';

interface OurStrategiesProps {
  accountHolder: string;
  accountType: 'branding' | 'non-branding';
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const OurStrategies: React.FC<OurStrategiesProps> = ({ accountHolder, accountType: _accountType, platform = 'instagram' }) => {
  // NOTE: _accountType temporarily ignored - using strategies endpoint for all accounts until engagement strategies data is available
  const [showPopup, setShowPopup] = useState(false);
  const [currentStrategyIndex, setCurrentStrategyIndex] = useState(0);

  // Debug logging to track component instances
  const componentId = React.useRef(Math.random().toString(36).substr(2, 9));
  
  // Register component on mount
  React.useEffect(() => {
    registerComponent('OurStrategies', platform, componentId.current);
    
    return () => {
      unregisterComponent('OurStrategies', componentId.current);
    };
  }, [platform]);
  
  console.log(`[OurStrategies] Component ${componentId.current} mounted for ${platform}/${accountHolder}`);

  const normalizedAccountHolder = accountHolder;
  
  // Construct endpoint - ALWAYS use strategies endpoint for now since that's where data exists
  // This is a temporary fix until we have proper engagement strategies data
  const baseEndpoint = `/api/retrieve-strategies/${normalizedAccountHolder}`;
  const endpoint = `${baseEndpoint}?platform=${platform}`;

  // Debug the endpoint being called
  console.log(`[OurStrategies] ${componentId.current} calling endpoint: ${endpoint} (forced to strategies)`);

  const { data, loading, error } = useR2Fetch<any[]>(endpoint, platform);

  const renderStrategyContent = (strategyData: any) => {
    if (!strategyData || typeof strategyData !== 'object') {
      return <p className="strategy-detail">No details available.</p>;
    }

    // Use the new comprehensive JSON decoder
    const decodedSections = decodeJSONToReactElements(strategyData, {
      customClassPrefix: 'strategy',
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      maxNestingLevel: 4
    });

    return decodedSections.map((section, idx) => (
      <div key={idx} className="strategy-subsection">
        <h6 className="strategy-subheading">{section.heading}</h6>
        <div className="strategy-content-wrapper">
          {section.content}
        </div>
      </div>
    ));
  };

  const handleNextStrategy = () => {
    if (currentStrategyIndex < (data?.length || 0) - 1) {
      setCurrentStrategyIndex(currentStrategyIndex + 1);
    }
  };

  const handlePrevStrategy = () => {
    if (currentStrategyIndex > 0) {
      setCurrentStrategyIndex(currentStrategyIndex - 1);
    }
  };

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
          transition={{ duration: 0.2 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => setShowPopup(true)}
        >
          <span className="overlay-text">Our Strategies</span>
          {loading && (
            <div className="futuristic-loading">
              <span className="loading-text">Analyzing Strategies...</span>
              <div className="particle-effect" />
            </div>
          )}
        </motion.div>
      </motion.div>
      
      {/* Render popup using React Portal for absolute screen positioning */}
      {showPopup && createPortal(
        <motion.div
          className="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setShowPopup(false)}
        >
          <motion.div
            className="popup-content"
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 50 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-section">
              <h3>{normalizedAccountHolder}</h3>
              <div className="stats">
                <span>Followers: TBD</span>
                <span>Following: TBD</span>
              </div>
            </div>
            <div className="strategy-section">
              <h4>Strategy Report</h4>
              {data?.length ? (
                <motion.div
                  key={currentStrategyIndex}
                  className="strategy-report"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h5>Strategy {currentStrategyIndex + 1}</h5>
                  {renderStrategyContent(data[currentStrategyIndex].data)}
                  <div className="navigation-buttons">
                    <motion.button
                      className="nav-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handlePrevStrategy}
                      disabled={currentStrategyIndex === 0}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                      Previous
                    </motion.button>
                    <motion.button
                      className="nav-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleNextStrategy}
                      disabled={currentStrategyIndex === data.length - 1}
                    >
                      Next
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <div className="no-analysis-explanation">
                  <div className="explanation-header">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="24" 
                      height="24" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="#ffa500" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <h4>Strategy Analysis Not Available</h4>
                  </div>
                  
                  <div className="explanation-content">
                    <p>We cannot access the strategy analysis for <strong>{normalizedAccountHolder}</strong>. This could be due to several reasons:</p>
                    
                    <div className="reason-list">
                      <div className="reason-item">
                        <span className="reason-icon">❌</span>
                        <div className="reason-text">
                          <strong>Incorrect Username:</strong> The account username might be misspelled or doesn't exist on {platform}
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">🔒</span>
                        <div className="reason-text">
                          <strong>Private Account:</strong> The account profile is private and cannot be analyzed for strategies
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">🆕</span>
                        <div className="reason-text">
                          <strong>New Account:</strong> Recently added account - strategy analysis is still processing (can take up to 15 minutes)
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">📊</span>
                        <div className="reason-text">
                          <strong>Insufficient Data:</strong> The account doesn't have enough public content to generate meaningful strategies
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">⚠️</span>
                        <div className="reason-text">
                          <strong>Technical Issue:</strong> Temporary server issues or rate limiting from {platform}
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">🚫</span>
                        <div className="reason-text">
                          <strong>Data Scraping Blocker:</strong> Anti-bot protection or rate limiting prevented data collection from {platform}
                        </div>
                      </div>
                    </div>
                    
                    <div className="suggested-actions">
                      <h5>🛠️ Suggested Actions:</h5>
                      <ul>
                        <li><strong>Verify Username:</strong> Double-check the {platform} username for typos</li>
                        <li><strong>Check Profile:</strong> Ensure the account profile is public and accessible</li>
                        <li><strong>Wait for Processing:</strong> If recently added, wait 10-15 minutes for analysis to complete</li>
                        <li><strong>Add More Content:</strong> Ensure the account has sufficient public posts for strategy generation</li>
                        <li><strong>Try Again:</strong> Refresh the page and check if strategies become available</li>
                        <li><strong>Check Account Type:</strong> Verify the account type (branding/non-branding) is correctly set</li>
                        <li><strong>Wait for Rate Limit:</strong> If blocked by anti-bot protection, wait 15-30 minutes before retrying</li>
                      </ul>
                    </div>
                    
                    <div className="action-buttons">
                      <motion.button
                        className="modal-btn refresh-btn-modal"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowPopup(false);
                          // Force a refresh by triggering a re-render
                          window.location.reload();
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#00ffcc"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M23 4v6h-6"/>
                          <path d="M1 20v-6h6"/>
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        Refresh Page
                      </motion.button>
                      
                      <motion.button
                        className="modal-btn close-btn-modal"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowPopup(false)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#e0e0ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Close
                      </motion.button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <motion.button
              className="close-btn"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowPopup(false)}
            >
              Close
            </motion.button>
          </motion.div>
        </motion.div>,
        document.body
      )}
    </ErrorBoundary>
  );
};

export default OurStrategies;