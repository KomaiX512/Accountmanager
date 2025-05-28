import React, { useState } from 'react';
import './OurStrategies.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface OurStrategiesProps {
  accountHolder: string;
  accountType: 'branding' | 'non-branding';
  platform?: 'instagram' | 'twitter';
}

const OurStrategies: React.FC<OurStrategiesProps> = ({ accountHolder, accountType, platform = 'instagram' }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [currentStrategyIndex, setCurrentStrategyIndex] = useState(0);

  const normalizedAccountHolder = accountHolder;
  
  // Construct endpoint with platform parameter
  const baseEndpoint = accountType === 'branding'
    ? `http://localhost:3000/retrieve-strategies/${normalizedAccountHolder}`
    : `http://localhost:3000/retrieve-engagement-strategies/${normalizedAccountHolder}`;
  
  const endpoint = `${baseEndpoint}?platform=${platform}`;

  const { data, loading, error } = useR2Fetch<any[]>(endpoint);

  // Reusable function to decode raw content into a structured format
  const decodeRawContent = (rawText: string) => {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split('.').map(line => line.trim()).filter(line => line);
    const sections: { heading: string; content: React.ReactElement[] }[] = [];
    let currentSection: { heading: string; content: React.ReactElement[] } | null = null;

    lines.forEach((line, idx) => {
      // Handle headings (lines ending with a colon or standalone titles)
      if (line.match(/^[A-Za-z\s]+:$/) || (line.match(/^[A-Za-z\s]+/) && !line.includes(':'))) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = { heading: line.replace(':', '').trim(), content: [] };
      } else if (currentSection) {
        // Handle sub-items (lines starting with "*")
        if (line.startsWith('*')) {
          const subItems = line.split('*').filter(item => item.trim());
          subItems.forEach((subItem, subIdx) => {
            const [label, ...valueParts] = subItem.trim().split(':');
            const formattedLabel = label.trim().replace(/^\*\s*/, '');
            const value = valueParts.join(':').trim();

            if (value) {
              // Bold text between asterisks
              const formattedValue = value.split(/(\*[^*]+\*)/g).map((part, i) => {
                if (part.startsWith('*') && part.endsWith('*')) {
                  return <strong key={i}>{part.slice(1, -1)}</strong>;
                }
                return part;
              });

              currentSection?.content.push(
                <p key={`${idx}-${subIdx}`} className="strategy-detail">
                  <span className="detail-label">{formattedLabel}:</span> {formattedValue}
                </p>
              );
            } else {
              // Handle list items without a colon (e.g., "* item")
              const formattedItem = subItem.trim().replace(/^\*\s*/, '');
              const formattedText = formattedItem.split(/(\*[^*]+\*)/g).map((part, i) => {
                if (part.startsWith('*') && part.endsWith('*')) {
                  return <strong key={i}>{part.slice(1, -1)}</strong>;
                }
                return part;
              });

              currentSection?.content.push(
                <p key={`${idx}-${subIdx}`} className="strategy-detail">
                  - {formattedText}
                </p>
              );
            }
          });
        } else {
          // Handle plain text as a detail
          const formattedLine = line.split(/(\*[^*]+\*)/g).map((part, i) => {
            if (part.startsWith('*') && part.endsWith('*')) {
              return <strong key={i}>{part.slice(1, -1)}</strong>;
            }
            return part;
          });
          currentSection?.content.push(
            <p key={idx} className="strategy-detail">{formattedLine}</p>
          );
        }
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  const renderStrategyContent = (strategyData: any) => {
    if (!strategyData || typeof strategyData !== 'object') {
      return <p className="strategy-detail">No details available.</p>;
    }

    return Object.entries(strategyData).map(([key, value], idx) => {
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      // Check if the value is a raw string that needs decoding (e.g., Recommendations)
      if (typeof value === 'string' && value.includes(':')) {
        const decodedSections = decodeRawContent(value);
        return (
          <div key={idx} className="strategy-subsection">
            <h6 className="strategy-subheading">{formattedKey}</h6>
            {decodedSections.map((section, secIdx) => (
              <div key={secIdx} className="strategy-subsection">
                <h6 className="strategy-sub-subheading">{section.heading}</h6>
                {section.content}
              </div>
            ))}
          </div>
        );
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return (
          <div key={idx} className="strategy-subsection">
            <h6 className="strategy-subheading">{formattedKey}</h6>
            {Object.entries(value).map(([subKey, subValue], subIdx) => {
              const formattedSubKey = subKey
                .replace(/([A-Z])/g, ' $1')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, char => char.toUpperCase());
              return (
                <p key={subIdx} className="strategy-detail">
                  <span className="detail-label">{formattedSubKey}:</span>{' '}
                  {typeof subValue === 'string' || typeof subValue === 'number'
                    ? subValue
                    : JSON.stringify(subValue)}
                </p>
              );
            })}
          </div>
        );
      } else if (Array.isArray(value)) {
        return (
          <div key={idx} className="strategy-subsection">
            <h6 className="strategy-subheading">{formattedKey}</h6>
            {value.length > 0 ? (
              value.map((item, itemIdx) => (
                <p key={itemIdx} className="strategy-detail">
                  - {typeof item === 'string' || typeof item === 'number' ? item : JSON.stringify(item)}
                </p>
              ))
            ) : (
              <p className="strategy-detail">None</p>
            )}
          </div>
        );
      } else {
        return (
          <p key={idx} className="strategy-detail">
            <span className="detail-label">{formattedKey}:</span> {value ?? 'N/A'}
          </p>
        );
      }
    });
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
          {error && (
            <div className="error-text">
              Failed to load strategies: {error}
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
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
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
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
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