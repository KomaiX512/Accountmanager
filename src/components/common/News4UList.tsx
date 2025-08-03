import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaNewspaper } from 'react-icons/fa';
import axios from 'axios';
import './News4U.css';

interface News4UProps {
  accountHolder: string;
  platform: 'instagram' | 'twitter' | 'facebook';
}

interface NewsItem {
  username: string;
  breaking_news_summary: string;
  source_url: string;
  timestamp: string;
}

/**
 * Scroll-list version of the News-for-You widget.
 * It shows ALL news items in a vertically scrollable card – no prev/next buttons.
 */
const News4UList: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Helper – convert "\uXXXX" sequences to emojis/characters
  const decodeUnicode = (text?: string) =>
    text ? text.replace(/\\u[0-9A-F]{4}/gi, m => String.fromCodePoint(parseInt(m.replace('\\u', ''), 16))) : ''

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const hrs = Math.floor((now.getTime() - date.getTime()) / 3.6e6);
      if (hrs < 1) return 'Just now';
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return 'Recently';
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/news-for-you/${accountHolder}?platform=${platform}`);
        const raw: NewsItem[] = (res.data ?? []).map((r: any) => r.data).filter(Boolean);
        // Remove duplicate stories based on identical summary text
        const deduped: NewsItem[] = [];
        const seen = new Set<string>();
        raw.forEach(n => {
          const key = n.breaking_news_summary?.trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(n);
          }
        });
        setItems(deduped);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.status === 404 ? 'No news available yet' : 'Failed to load news');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [accountHolder, platform]);

  if (loading) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-loading">
          <div className="loading-spinner" />
          <span>Loading news...</span>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-error">
          <FaNewspaper className="error-icon" />
          <span>{error}</span>
        </div>
      </motion.div>
    );
  }

  if (!items.length) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-empty">
          <FaNewspaper className="empty-icon" />
          <span>No news available</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="news4u-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="news4u-title-bar">
        <FaNewspaper className="title-icon" />
        <span className="title-text">News 4U</span>
      </div>
      <div className="news4u-content">
        {items.map((item, idx) => {
          const isOpen = expanded.has(idx);
          return (
            <motion.div
              key={idx}
              className="news4u-item"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <div className="news4u-item-header">
                <FaClock className="timestamp-icon" />
                <span>{formatTimestamp(item.timestamp)}</span>
              </div>

              <div
                className={`news4u-summary ${isOpen ? 'expanded' : 'collapsed'}`}
                onClick={() => toggleExpand(idx)}
                title={isOpen ? 'Click to collapse' : 'Click to expand'}
              >
                {decodeUnicode(item.breaking_news_summary)}
                {!isOpen && (
                  <div className="expand-indicator">
                    <span>...</span>
                  </div>
                )}
              </div>

              {isOpen && item.source_url && (
                <div className="news4u-source">
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
                    <FaExternalLinkAlt className="link-icon" />
                    <span>Read more</span>
                  </a>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default News4UList;
