import React, { useState } from 'react';
import './Cs_Analysis.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface Cs_AnalysisProps {
  accountHolder: string;
  competitors: string[];
}

const Cs_Analysis: React.FC<Cs_AnalysisProps> = ({ competitors }) => {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  // Hardcode accountHolder
  const normalizedAccountHolder = 'maccosmetics';

  // Fixed Hooks for up to 5 competitors
  const fetch1 = useR2Fetch<any[]>(competitors[0] ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitors[0]}` : '');
  const fetch2 = useR2Fetch<any[]>(competitors[1] ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitors[1]}` : '');
  const fetch3 = useR2Fetch<any[]>(competitors[2] ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitors[2]}` : '');
  const fetch4 = useR2Fetch<any[]>(competitors[3] ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitors[3]}` : '');
  const fetch5 = useR2Fetch<any[]>(competitors[4] ? `http://localhost:3000/retrieve/${normalizedAccountHolder}/${competitors[4]}` : '');

  // Map competitors to fetch results
  const competitorData = [
    { competitor: competitors[0], fetch: fetch1 },
    { competitor: competitors[1], fetch: fetch2 },
    { competitor: competitors[2], fetch: fetch3 },
    { competitor: competitors[3], fetch: fetch4 },
    { competitor: competitors[4], fetch: fetch5 },
  ].filter(data => data.competitor); // Remove undefined competitors

  // Find selected competitor's data
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
            className={`competitor-sub-container ${fetch.data ? 'loaded' : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.2, duration: 0.4 }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)' }}
            onClick={() => fetch.data && setSelectedCompetitor(competitor)}
          >
            <span className="overlay-text">{competitor}</span>
            {fetch.loading && (
              <div className="futuristic-loading">
                <span className="loading-text">Analyzing {competitor}...</span>
                <div className="particle-effect" />
              </div>
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