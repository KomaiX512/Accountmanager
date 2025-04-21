import React, { useState } from 'react';
import './Cs_Analysis.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface Cs_AnalysisProps {
  accountHolder: string;
  competitors: string[];
}

const Cs_Analysis: React.FC<Cs_AnalysisProps> = ({ accountHolder, competitors }) => {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  const normalizedAccountHolder = accountHolder;

  // Dynamic fetch hooks for competitors
  const fetches = competitors.map(competitor =>
    useR2Fetch<any[]>(competitor ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitor}` : '')
  );

  const competitorData = competitors
    .map((competitor, index) => ({
      competitor,
      fetch: fetches[index],
    }))
    .filter(data => data.competitor);

  const selectedData = selectedCompetitor
    ? competitorData.find(data => data.competitor === selectedCompetitor)?.fetch.data
    : null;

  return (
    <ErrorBoundary>
      <motion.div
        className="cs-analysis-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {competitorData.map(({ competitor, fetch }, index) => (
          <motion.div
            key={competitor}
            className={`competitor-sub-container ${fetch.data !== undefined ? 'loaded' : ''} ${fetch.data?.length === 0 ? 'no-data' : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.2, duration: 0.4 }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)' }}
            onClick={() => fetch.data !== undefined && setSelectedCompetitor(competitor)}
          >
            <span className="overlay-text">{competitor}</span>
            {fetch.loading && (
              <div className="futuristic-loading">
                <span className="loading-text">Analyzing {competitor}...</span>
                <div className="particle-effect" />
              </div>
            )}
            {fetch.data?.length === 0 && !fetch.loading && (
              <span className="no-data-text">No data available</span>
            )}
          </motion.div>
        ))}

        {selectedCompetitor && (
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
                <h3>{selectedCompetitor}</h3>
                <div className="stats">
                  <span>Followers: TBD</span>
                  <span>Following: TBD</span>
                </div>
              </div>
              <div className="analysis-section">
                <h4>Competitor Analysis</h4>
                {selectedData?.length ? (
                  selectedData.map((analysis, index) => (
                    <motion.div
                      key={index}
                      className="analysis-card"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <h5>Analysis {index + 1}</h5>
                      <pre>{JSON.stringify(analysis, null, 2)}</pre>
                    </motion.div>
                  ))
                ) : (
                  <p>No analysis available.</p>
                )}
              </div>
              <motion.button
                className="close-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedCompetitor(null)}
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

export default Cs_Analysis;