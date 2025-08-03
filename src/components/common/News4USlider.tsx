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

const News4USlider: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // --- helpers --------------------------------------------------------------
  const decodeUnicode = (text?: string) =>
    text ? text.replace(/\\u[0-9A-F]{4}/gi, m => String.fromCodePoint(parseInt(m.replace('\\u', ''), 16))) : '';

  const formatTimestamp = (ts?: string) => {
    try {
      if (!ts) return 'Recently';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Recently';
      const diffHrs = Math.floor((Date.now() - d.getTime()) / 3.6e6);
      if (diffHrs < 1) return 'Just now';
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return `${Math.floor(diffHrs / 24)}d ago`;
    } catch {
      return 'Recently';
    }
  };

  // --- data fetch -----------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/news-for-you/${accountHolder}?platform=${platform}`);
        const raw = res.data ?? [];
        const list: NewsItem[] = raw.map((r:any)=> r?.data ?? r).filter((x:any)=>x && x.breaking_news_summary);
        setItems(list);
        setCurrent(0);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.status === 404 ? 'No news available yet' : 'Failed to load news');
      } finally {
        setLoading(false);
      }
    })();
  }, [accountHolder, platform]);

  // --- early states ---------------------------------------------------------
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

  // --- slider handlers ------------------------------------------------------
  const next = () => {
    if (current < items.length - 1) {
      setCurrent(c => c + 1);
      setExpanded(false);
    }
  };
  const prev = () => {
    if (current > 0) {
      setCurrent(c => c - 1);
      setExpanded(false);
    }
  };

  const item = items[current];

  return (
    <motion.div
      className="news4u-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="news4u-header">
        <FaClock className="timestamp-icon" />
        <span>{formatTimestamp(item.timestamp)}</span>
        {items.length > 1 && (
          <span className="news-count-indicator">{current + 1} / {items.length}</span>
        )}
      </div>

      <div
        className={`news4u-summary ${expanded ? 'expanded' : 'collapsed'}`}
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Click to collapse' : 'Click to expand'}
      >
        {decodeUnicode(item.breaking_news_summary)}
        {!expanded && (
          <div className="expand-indicator"><span>...</span></div>
        )}
      </div>

      {expanded && item.source_url && (
        <div className="news4u-source">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
            <FaExternalLinkAlt className="link-icon" />
            <span>Read more</span>
          </a>
        </div>
      )}

      {/* --- nav buttons --- */}
      <div className="news4u-navigation">
        <motion.button className="nav-btn" onClick={prev} disabled={current === 0} whileTap={{ scale: 0.96 }}>
          Prev
        </motion.button>
        <motion.button className="nav-btn" onClick={next} disabled={current === items.length - 1} whileTap={{ scale: 0.96 }}>
          Next
        </motion.button>
      </div>
    </motion.div>
  );
};

export default News4USlider;
