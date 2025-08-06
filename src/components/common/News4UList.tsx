import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
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
  // 🚫 Never switch to connected username – lock to dashboard username on first render
  const accountHolderRef = React.useRef(accountHolder);
  const normalizedAccountHolder = accountHolderRef.current;
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creatingPost, setCreatingPost] = useState<Set<number>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // Create infographic post from news item
  const createPostFromNews = async (newsItem: NewsItem, idx: number) => {
    setCreatingPost(prev => new Set([...prev, idx]));
    setToastMessage(null);

    try {
      // Create the prefixed prompt for post generation
      const prompt = `Create an engaging infographic post about this news: ${decodeUnicode(newsItem.breaking_news_summary)}`;
      
      console.log(`[News4U] 🚀 Creating infographic post for ${normalizedAccountHolder} on ${platform}:`, prompt);
      
      // Use the same RAG service as the dashboard creation bar
      const response = await RagService.sendPostQuery(
        normalizedAccountHolder,
        prompt,
        platform
      );
      
      if (response.success) {
        console.log(`[News4U] ✅ Post created successfully for ${normalizedAccountHolder} on ${platform}`);
        
        // Trigger post refresh event (same as dashboard)
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: {
            username: normalizedAccountHolder,
            platform: platform,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(newPostEvent);
        console.log(`[News4U] 🔄 Triggered PostCooked refresh event for ${platform}`);
        
        setToastMessage('Infographic post created successfully! Check the Cooked Posts section.');
        
        // Auto-hide toast after 4 seconds
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        console.error(`[News4U] ❌ Post creation failed for ${accountHolder} on ${platform}:`, response.error);
        setToastMessage(response.error || 'Failed to create infographic post. Please try again.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (error) {
      console.error(`[News4U] ❌ Error creating infographic post for ${accountHolder} on ${platform}:`, error);
      setToastMessage('Failed to create infographic post. Please try again.');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setCreatingPost(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/news-for-you/${normalizedAccountHolder}?platform=${platform}`);
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
  }, [platform]);

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
          <FaRss className="error-icon" />
          <span>{error}</span>
        </div>
      </motion.div>
    );
  }

  if (!items.length) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-empty">
          <FaRss className="empty-icon" />
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
      whileHover={{ scale: 1.01 }}
    >
      <div className="news4u-scrollable">
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

                {isOpen && (
                  <div className="news4u-actions">
                    <button
                      className="create-post-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        createPostFromNews(item, idx);
                      }}
                      disabled={creatingPost.has(idx)}
                      title="Create infographic post from this news"
                    >
                      {creatingPost.has(idx) ? (
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
                    {item.source_url && (
                      <div className="news4u-source">
                        <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
                          <FaExternalLinkAlt className="link-icon" />
                          <span>Read more</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {/* Toast Message */}
      {toastMessage && (
        <motion.div
          className="news4u-toast"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.3 }}
        >
          {toastMessage}
        </motion.div>
      )}
    </motion.div>
  );
};

export default News4UList;
