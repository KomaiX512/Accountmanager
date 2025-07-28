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

    // Use the new comprehensive JSON decoder with complete decoding configuration
    const decodedSections = decodeJSONToReactElements(strategyData, {
      customClassPrefix: 'strategy',
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      enableQuotes: true,
      enableEmphasis: true,
      preserveJSONStructure: true,
      smartParagraphDetection: true,
      maxNestingLevel: 6, // ✅ Increased to handle deeper nesting
      enableDebugLogging: false, // ✅ Debug logging for troubleshooting (disable in production)
      skipDecodingForElements: [
        'Module Type',
        'Platform', 
        'Primary Username',
        'Competitor',
        'Timestamp',
        'Intelligence Source'
        // ✅ REMOVED 'Data' - we want to decode the Data content, just skip the metadata
      ]
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
          onClick={() => data && setShowPopup(true)}
        >
          <span className="overlay-text">Our Strategies</span>
          {loading && (
            <div className="futuristic-loading">
              <span className="loading-text">Analyzing Strategies...</span>
              <div className="particle-effect" />
            </div>
          )}
          {error && (
            <div className="error-text">
              Failed to load strategies: {error}
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
                <p>No strategies available.</p>
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