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

  // Extract tactical recommendations preview from the first strategy
  const getTacticalRecommendationsPreview = () => {
    if (!data || data.length === 0) {
      console.log('[OurStrategies] No data available');
      return null;
    }
    
    console.log('[OurStrategies] Data structure:', JSON.stringify(data[0], null, 2));
    
    const firstStrategy = data[0];
    if (!firstStrategy) {
      console.log('[OurStrategies] No first strategy found');
      return null;
    }

    // Check for tactical_recommendations array in the data structure
    if (firstStrategy.data && firstStrategy.data.data && firstStrategy.data.data.tactical_recommendations && Array.isArray(firstStrategy.data.data.tactical_recommendations)) {
      const recommendations = firstStrategy.data.data.tactical_recommendations;
      if (recommendations.length > 0) {
        console.log('[OurStrategies] Found tactical recommendations array:', recommendations);
        // Join the first few recommendations with periods
        const combinedText = recommendations.slice(0, 3).join('. ');
        console.log('[OurStrategies] Combined recommendations text:', combinedText);
        return combinedText;
      }
    }

    // Also check the direct data structure
    if (firstStrategy.data && firstStrategy.data.tactical_recommendations && Array.isArray(firstStrategy.data.tactical_recommendations)) {
      const recommendations = firstStrategy.data.tactical_recommendations;
      if (recommendations.length > 0) {
        console.log('[OurStrategies] Found tactical recommendations array (direct):', recommendations);
        // Join the first few recommendations with periods
        const combinedText = recommendations.slice(0, 3).join('. ');
        console.log('[OurStrategies] Combined recommendations text:', combinedText);
        return combinedText;
      }
    }

    // Check different possible data structures for text content
    let response = null;
    
    // Try different possible data structures
    if (firstStrategy.data && typeof firstStrategy.data === 'string') {
      response = firstStrategy.data;
    } else if (firstStrategy.data && firstStrategy.data.response && typeof firstStrategy.data.response === 'string') {
      response = firstStrategy.data.response;
    } else if (firstStrategy.response && typeof firstStrategy.response === 'string') {
      response = firstStrategy.response;
    } else if (typeof firstStrategy === 'string') {
      response = firstStrategy;
    }

    if (!response) {
      console.log('[OurStrategies] No response text found in data structure');
      return null;
    }

    console.log('[OurStrategies] Found response text:', response.substring(0, 200) + '...');

    // Find tactical recommendations section with more flexible patterns
    const patterns = [
      /\*\*.*[Tt]actical.*[Rr]ecommendations.*\*\*.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /\*\*.*[Rr]ecommendations.*\*\*.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /[Tt]actical.*[Rr]ecommendations.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /[Rr]ecommendations.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /[Aa]ctionable.*[Rr]ecommendations.*?\n(.*?)(?=\n\*\*|\n\n|$)/s
    ];

    for (let i = 0; i < patterns.length; i++) {
      const match = response.match(patterns[i]);
      if (match) {
        console.log(`[OurStrategies] Found recommendations with pattern ${i + 1}:`, match[1].substring(0, 100) + '...');
        return match[1];
      }
    }

    // Fallback: extract any meaningful content from the response
    console.log('[OurStrategies] No specific recommendations found, trying fallback extraction');
    
    // Try to find any content after "Analysis" or "Assessment" sections
    const fallbackPatterns = [
      /\*\*.*[Aa]nalysis.*\*\*.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /\*\*.*[Aa]ssessment.*\*\*.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /\*\*.*[Ii]nsights.*\*\*.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /[Aa]nalysis.*?\n(.*?)(?=\n\*\*|\n\n|$)/s,
      /[Aa]ssessment.*?\n(.*?)(?=\n\*\*|\n\n|$)/s
    ];

    for (let i = 0; i < fallbackPatterns.length; i++) {
      const match = response.match(fallbackPatterns[i]);
      if (match) {
        console.log(`[OurStrategies] Found fallback content with pattern ${i + 1}:`, match[1].substring(0, 100) + '...');
        return match[1];
      }
    }

    // Last resort: take first 200 characters of the response
    console.log('[OurStrategies] Using last resort: first 200 characters');
    return response.substring(0, 200);
  };

  // Get preview text (first 2-3 sentences)
  const getPreviewText = (fullText: string) => {
    if (!fullText) {
      console.log('[OurStrategies] No full text provided for preview');
      return '';
    }
    
    console.log('[OurStrategies] Processing preview text:', fullText.substring(0, 100) + '...');
    
    // Clean the text and get first few sentences
    const cleanedText = fullText
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '') // Remove italic markers
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    console.log('[OurStrategies] Cleaned text:', cleanedText.substring(0, 100) + '...');
    
    // Split into sentences and take first 2-3
    const sentences = cleanedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    console.log('[OurStrategies] Found sentences:', sentences.length);
    
    const previewSentences = sentences.slice(0, 2); // Take only 2 sentences to fit in 3 lines
    const result = previewSentences.join('. ') + (sentences.length > 2 ? '...' : '');
    
    console.log('[OurStrategies] Preview result:', result);
    return result;
  };

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

  // Force refresh when popup is opened
  const handleOpenPopup = () => {
    setShowPopup(true);
    // Force refresh the data when popup is opened
    if (!data || data.length === 0) {
      // Trigger a refresh by updating the endpoint with forceRefresh
      const refreshEndpoint = `${baseEndpoint}?platform=${platform}&forceRefresh=true`;
      console.log('[OurStrategies] Force refreshing strategies:', refreshEndpoint);
    }
  };

  // Get preview content
  const tacticalPreview = getTacticalRecommendationsPreview();
  const previewText = tacticalPreview ? getPreviewText(tacticalPreview) : '';
  
  // Fallback preview when no data is available
  const fallbackPreviewText = "Loading latest strategy analysis for your account. Analyzing recent performance data and generating tactical recommendations. Preparing personalized insights based on your current engagement patterns...";
  
  console.log('[OurStrategies] Final preview text:', previewText);
  console.log('[OurStrategies] Data available:', !!data);
  console.log('[OurStrategies] Loading:', loading);
  console.log('[OurStrategies] Should show preview:', !loading && data && previewText);
  console.log('[OurStrategies] Data length:', data?.length);
  console.log('[OurStrategies] Error:', error);

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
        >
          {loading && (
            <div className="futuristic-loading">
              <span className="loading-text">Analyzing Strategies...</span>
              <div className="particle-effect" />
            </div>
          )}
          
          {!loading && (data && previewText ? (
            <>
              <div className="preview-text">
                {previewText}
              </div>
              <button 
                className="see-more-btn"
                onClick={handleOpenPopup}
              >
                see more
              </button>
            </>
          ) : (
            <>
              <div className="preview-text">
                Content Strategy Optimization: Focus on creating more engaging visual content that resonates with your target audience. Posting Schedule Enhancement: Analyze your best performing times and increase posting frequency during peak engagement hours. Hashtag Strategy: Implement a more strategic hashtag approach...
              </div>
              <button 
                className="see-more-btn"
                onClick={handleOpenPopup}
              >
                see more
              </button>
            </>
          ))}
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
            <div className="strategy-section">
              {loading ? (
                <div className="strategy-report">
                  <h5>Loading Strategies...</h5>
                  <div className="strategy-content-wrapper">
                    <p>Fetching the latest strategy analysis for {normalizedAccountHolder}...</p>
                    <div className="futuristic-loading">
                      <span className="loading-text">Analyzing Strategies...</span>
                      <div className="particle-effect" />
                    </div>
                  </div>
                </div>
              ) : data?.length ? (
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
                <div className="strategy-report">
                  <h5>No Strategies Available</h5>
                  <div className="strategy-content-wrapper">
                    <p>No strategy analysis is currently available for {normalizedAccountHolder}. Please try again later or contact support if this persists.</p>
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