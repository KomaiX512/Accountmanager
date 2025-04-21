import React from 'react';
import './NewsForYou.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';

interface NewsForYouProps {
  accountHolder: string;
}

const NewsForYou: React.FC<NewsForYouProps> = ({ accountHolder }) => {
  const { data, loading } = useR2Fetch<any[]>(`http://localhost:3000/news-for-you/${accountHolder}`);

  return (
    <ErrorBoundary>
      <motion.div
        className="news-for-you"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {loading ? (
          <div className="loading">Loading news...</div>
        ) : !data || data.length === 0 ? (
          <p className="no-news">No news articles available.</p>
        ) : (
          data.map((item, index) => (
            <motion.div
              key={item.key}
              className="news-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <h3 className="news-title">{item.data.title || `News ${index + 1}`}</h3>
              <p className="news-date">{new Date(item.data.timestamp || Date.now()).toLocaleDateString()}</p>
            </motion.div>
          ))
        )}
      </motion.div>
    </ErrorBoundary>
  );
};

export default NewsForYou;