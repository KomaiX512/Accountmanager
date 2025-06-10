import React, { useState } from 'react';
import './NewsForYou.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface NewsForYouProps {
  accountHolder: string;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const NewsForYou: React.FC<NewsForYouProps> = ({ accountHolder, platform = 'instagram' }) => {
  const endpoint = `http://localhost:3000/news-for-you/${accountHolder}?platform=${platform}`;
  const { data, loading } = useR2Fetch<any[]>(endpoint);
  const [selectedNewsIndex, setSelectedNewsIndex] = useState<number | null>(null);

  const decodeNewsContent = (newsData: any): React.ReactNode => {
    if (!newsData || typeof newsData !== 'object') {
      return <p className="news-detail">No details available.</p>;
    }

    return Object.entries(newsData).map(([key, value], idx): React.ReactNode => {
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      if (key.toLowerCase().includes('image') && typeof value === 'string' && value.match(/\.(jpeg|jpg|png|gif)$/)) {
        return (
          <div key={idx} className="news-subsection">
            <h6 className="news-subheading">{formattedKey}</h6>
            <img src={value} alt={formattedKey} className="news-image" />
          </div>
        );
      } else if (key.toLowerCase().includes('link') && typeof value === 'string' && value.match(/^https?:\/\//)) {
        return (
          <p key={idx} className="news-detail">
            <span className="detail-label">{formattedKey}:</span>{' '}
            <a href={value} target="_blank" rel="noopener noreferrer" className="news-link">
              {value}
            </a>
          </p>
        );
      } else if (key.toLowerCase().includes('date') || key.toLowerCase().includes('pubdate')) {
        const date = new Date(value as string);
        const formattedDate = isNaN(date.getTime())
          ? 'Invalid Date'
          : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return (
          <p key={idx} className="news-detail">
            <span className="detail-label">{formattedKey}:</span> {formattedDate}
          </p>
        );
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return (
          <div key={idx} className="news-subsection">
            <h6 className="news-subheading">{formattedKey}</h6>
            {Object.entries(value).map(([subKey, subValue], subIdx) => {
              const formattedSubKey = subKey
                .replace(/([A-Z])/g, ' $1')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, char => char.toUpperCase());
              return (
                <p key={subIdx} className="news-detail">
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
          <div key={idx} className="news-subsection">
            <h6 className="news-subheading">{formattedKey}</h6>
            {value.length > 0 ? (
              value.map((item, itemIdx) => (
                <p key={itemIdx} className="news-detail">
                  - {typeof item === 'string' || typeof item === 'number' ? item : JSON.stringify(item)}
                </p>
              ))
            ) : (
              <p className="news-detail">None</p>
            )}
          </div>
        );
      } else {
        return (
          <p key={idx} className="news-detail">
            <span className="detail-label">{formattedKey}:</span> {value ?? 'N/A'}
          </p>
        );
      }
    });
  };

  const handleNextNews = () => {
    if (selectedNewsIndex !== null && selectedNewsIndex < (data?.length || 0) - 1) {
      setSelectedNewsIndex(selectedNewsIndex + 1);
    }
  };

  const handlePrevNews = () => {
    if (selectedNewsIndex !== null && selectedNewsIndex > 0) {
      setSelectedNewsIndex(selectedNewsIndex - 1);
    }
  };

  return (
    <ErrorBoundary>
      <motion.div
        className="news-for-you"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {loading ? (
          <div className="futuristic-loading">
            <span className="loading-text">Loading News...</span>
            <div className="particle-effect" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="no-news">No news articles available.</p>
        ) : (
          data.map((item, index) => (
            <motion.div
              key={item.key || index}
              className={`news-item ${data ? 'loaded' : ''}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.2, duration: 0.4 }}
              whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)' }}
              onClick={() => setSelectedNewsIndex(index)}
            >
              <span className="overlay-text">{item.data.title || `News ${index + 1}`}</span>
            </motion.div>
          ))
        )}

        {selectedNewsIndex !== null && data && (
          <motion.div
            className="popup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedNewsIndex(null)}
          >
            <motion.div
              className="popup-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="news-section">
                <h4>News Article</h4>
                <motion.div
                  key={selectedNewsIndex}
                  className="news-report"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h5>News {selectedNewsIndex + 1}</h5>
                  {decodeNewsContent(data[selectedNewsIndex].data)}
                  <div className="navigation-buttons">
                    <motion.button
                      className="nav-btn"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={handlePrevNews}
                      disabled={selectedNewsIndex === 0}
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
                      onClick={handleNextNews}
                      disabled={selectedNewsIndex === data.length - 1}
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
              </div>
              <motion.button
                className="close-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedNewsIndex(null)}
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

export default NewsForYou;