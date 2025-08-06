import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardUsername } from '../../utils/usernameHelpers';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner } from 'react-icons/fa';
import RagService from '../../services/RagService';
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
  const initialAccountHolderRef = React.useRef(accountHolder);
  
  const { currentUser } = useAuth();
  const [dashboardUsername, setDashboardUsername] = useState<string>(initialAccountHolderRef.current);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const stored = getDashboardUsername(platform, currentUser.uid);
    if (stored && stored !== dashboardUsername) {
      setDashboardUsername(stored);
    }
  }, [currentUser?.uid, platform]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
        const res = await axios.get(`/api/news-for-you/${dashboardUsername}?platform=${platform}`);
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
  }, [dashboardUsername, platform]);

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
          
          <span>{error}</span>
        </div>
      </motion.div>
    );
  }

  if (!items.length) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-empty">
          
          <span>No news available</span>
        </div>
      </motion.div>
    );
  }

  // --- create infographic post ---------------------------------------------
  const createPostFromNews = async () => {
    if (creatingPost) return;
    setCreatingPost(true);
    setToastMessage(null);
    const newsItem = items[current];
    try {
      const prompt = `Create an engaging infographic post about this news: ${decodeUnicode(newsItem.breaking_news_summary)}`;
      const response = await RagService.sendPostQuery(dashboardUsername, prompt, platform);
      if (response.success) {
        const evt = new CustomEvent('newPostCreated', { detail: { username: dashboardUsername, platform, timestamp: Date.now() } });
        window.dispatchEvent(evt);
        setToastMessage('Infographic post created! Check Cooked Posts.');
      } else {
        setToastMessage(response.error || 'Failed to create infographic post.');
      }
    } catch (e) {
      console.error(e);
      setToastMessage('Failed to create infographic post.');
    } finally {
      setCreatingPost(false);
      setTimeout(()=>setToastMessage(null),4000);
    }
  };

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

      {expanded && (
        <div className="news4u-actions">
          {item.source_url && (
            <div>
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
                <FaExternalLinkAlt />
                <span>Read more</span>
              </a>
            </div>
          )}
          <button
            className="create-post-btn"
            onClick={createPostFromNews}
            disabled={creatingPost}
            title="Create infographic post from this news"
          >
            {creatingPost ? (
              <>
                <FaSpinner className="btn-icon spinning" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <FaPlus className="btn-icon" />
                <span>Create Infographic Post</span>
              </>
            )}
          </button>
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
      {toastMessage && (
        <motion.div
          className="news4u-toast"
          initial={{ opacity:0, y:50 }}
          animate={{ opacity:1, y:0 }}
          exit={{ opacity:0, y:50 }}
          transition={{ duration:0.3 }}
        >{toastMessage}</motion.div>
      )}
    </motion.div>
  );
};

export default News4USlider;
