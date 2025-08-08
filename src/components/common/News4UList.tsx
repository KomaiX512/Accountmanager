import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
import CacheManager, { appendBypassParam } from '../../utils/cacheManager';
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
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [customInputByIndex, setCustomInputByIndex] = useState<Record<number, string>>({});
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);

  // Ensure a portal root exists
  useEffect(() => {
    let node = document.getElementById('news4u-portal-root') as HTMLElement | null;
    if (!node) {
      node = document.createElement('div');
      node.id = 'news4u-portal-root';
      document.body.appendChild(node);
    }
    portalRootRef.current = node;
    return () => {
      // keep node persistent for page lifetime; do not remove on unmount
    };
  }, []);

  const updateMenuPosition = () => {
    const anchor = menuAnchorRef.current;
    if (!anchor) {
      setMenuPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8; // small gap below button
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280)); // keep inside viewport
    setMenuPosition({ top, left });
  };

  useEffect(() => {
    if (openMenuIndex !== null) {
      updateMenuPosition();
      const handleWindow = () => updateMenuPosition();
      const handleOutside = (e: MouseEvent) => {
        const anchor = menuAnchorRef.current;
        const portalEl = document.getElementById('news4u-dropdown-portal');
        if (portalEl && (portalEl.contains(e.target as Node) || (anchor && anchor.contains(e.target as Node)))) {
          return;
        }
        setOpenMenuIndex(null);
      };
      window.addEventListener('resize', handleWindow, { passive: true });
      window.addEventListener('scroll', handleWindow, { passive: true });
      document.addEventListener('mousedown', handleOutside, true);
      return () => {
        window.removeEventListener('resize', handleWindow);
        window.removeEventListener('scroll', handleWindow);
        document.removeEventListener('mousedown', handleOutside, true);
      };
    }
  }, [openMenuIndex]);

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

  type PostStyle = 'infographic' | 'typographic' | 'single_image' | 'meme';

  const styleLabel: Record<PostStyle, string> = useMemo(() => ({
    infographic: 'Infographic',
    typographic: 'Typographical',
    single_image: 'Single Image',
    meme: 'Meme',
  }), []);

  const buildPrompt = (newsItem: NewsItem, style: PostStyle, customInstruction?: string) => {
    const summary = decodeUnicode(newsItem.breaking_news_summary).trim();

    const VISUAL_GUIDELINES: Record<PostStyle, string[]> = {
      infographic: [
        'Data‑rich infographic with clear hierarchy: bold headline, concise sub‑points, supportive icons',
        'Use clean grid layout, generous spacing, and accessible color contrast',
        'Include simple charts/diagrams when relevant (bars, pie, timeline) with clear labels',
        'Brand‑friendly modern style; avoid clutter; ensure instant legibility on mobile',
      ],
      typographic: [
        'Bold headline‑driven typography as the hero; minimal background',
        'High contrast palette; premium editorial look; precise alignment and spacing',
        'Use hierarchy (H1/H2/eyebrow) and subtle accents; no complex imagery',
        'Keep message punchy and elegant; ensure crisp anti‑aliased text rendering',
      ],
      single_image: [
        'Single striking image/illustration that directly represents the news subject',
        'Cinematic composition; clear focal subject; shallow depth‑of‑field feel',
        'Cohesive color grading; minimal overlay; tasteful brand accent only',
        'Avoid busy collages; keep it story‑centric and emotionally resonant',
      ],
      meme: [
        'Meme format with witty top/bottom text or trending template that fits the news',
        'Use readable bold font (e.g., Impact‑style), white text with subtle black stroke',
        'Humorous but safe tone; no offensive or sensitive content; keep brand tiny',
        'High contrast framing; clear facial/subject expressions for comedic effect',
      ],
    };

    const guidelines = VISUAL_GUIDELINES[style]
      .map((g, i) => `${i + 1}. ${g}`)
      .join('\n');

    const custom = (customInstruction || '').trim();

    // Enrich the query with explicit, style‑aligned guidance so backend can craft a very specific image prompt
    const prompt = [
      `NEWS: ${summary}`,
      `REQUESTED_POST_STYLE: ${styleLabel[style]}`,
      'VISUAL_STYLE_GUIDELINES:',
      guidelines,
      custom ? `ADDITIONAL_CREATIVE_DIRECTION: ${custom}` : null,
      'DELIVERABLES: Create a compelling caption, relevant high‑performing hashtags, a persuasive call‑to‑action,',
      'and a highly specific Visual Description for the image that strictly follows the requested style and direction.',
      'The Visual Description must include composition, color palette, lighting, typography/overlay (if any),',
      'layout/arrangement, and mood, with strong, concrete details (no generic phrasing).'
    ].filter(Boolean).join('\n');

    return prompt;
  };

  // Create post from news item with selected style and optional custom instruction
  const createPostFromNews = async (newsItem: NewsItem, idx: number, style: PostStyle, customInstruction?: string) => {
    setCreatingPost(prev => new Set([...prev, idx]));
    setToastMessage(null);

    try {
      const prompt = buildPrompt(newsItem, style, customInstruction);
      
      console.log(`[News4U] 🚀 Creating ${styleLabel[style]} post for ${normalizedAccountHolder} on ${platform}`);
      
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
        
        setToastMessage(`${styleLabel[style]} post created successfully! Check the Cooked Posts section.`);
        
        // Auto-hide toast after 4 seconds
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        console.error(`[News4U] ❌ Post creation failed for ${accountHolder} on ${platform}:`, response.error);
        setToastMessage(response.error || `Failed to create ${styleLabel[style]} post. Please try again.`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (error) {
      console.error(`[News4U] ❌ Error creating ${styleLabel[style]} post for ${accountHolder} on ${platform}:`, error);
      setToastMessage(`Failed to create ${styleLabel[style]} post. Please try again.`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setCreatingPost(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
      setOpenMenuIndex(null);
    }
  };

  const handleToggleMenu = (anchorEl: HTMLElement, idx: number) => {
    if (openMenuIndex === idx) {
      setOpenMenuIndex(null);
      return;
    }
    menuAnchorRef.current = anchorEl;
    setOpenMenuIndex(idx);
    // position will be updated by effect
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const baseUrl = `/api/news-for-you/${normalizedAccountHolder}?platform=${platform}`;
        const url = appendBypassParam(baseUrl, platform, normalizedAccountHolder, 'news');
        const res = await axios.get(url);
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
                  <div className="news4u-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="news4u-post-menu">
                      <button
                        className="create-post-btn"
                        onClick={(e) => handleToggleMenu(e.currentTarget as HTMLElement, idx)}
                        disabled={creatingPost.has(idx)}
                        title="Create post from this news"
                      >
                        {creatingPost.has(idx) ? (
                          <>
                            <FaSpinner className="btn-icon spinning" />
                            <span>Creating...</span>
                          </>
                        ) : (
                          <>
                            <FaPlus className="btn-icon" />
                            <span>Create Post</span>
                          </>
                        )}
                      </button>

                      {null}
                    </div>

                    {openMenuIndex === idx && portalRootRef.current && menuPosition && createPortal(
                      <div
                        id="news4u-dropdown-portal"
                        className="news4u-dropdown news4u-dropdown-portal"
                        role="menu"
                        style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left }}
                      >
                        <button
                          className="dropdown-item"
                          onClick={() => createPostFromNews(item, idx, 'infographic', customInputByIndex[idx])}
                          disabled={creatingPost.has(idx)}
                        >Infographic</button>
                        <button
                          className="dropdown-item"
                          onClick={() => createPostFromNews(item, idx, 'typographic', customInputByIndex[idx])}
                          disabled={creatingPost.has(idx)}
                        >Typographical</button>
                        <button
                          className="dropdown-item"
                          onClick={() => createPostFromNews(item, idx, 'single_image', customInputByIndex[idx])}
                          disabled={creatingPost.has(idx)}
                        >Single Image</button>
                        <button
                          className="dropdown-item"
                          onClick={() => createPostFromNews(item, idx, 'meme', customInputByIndex[idx])}
                          disabled={creatingPost.has(idx)}
                        >Meme</button>
                        <div className="dropdown-separator" />
                        <div className="dropdown-custom">
                          <input
                            type="text"
                            className="dropdown-input"
                            placeholder="Optional custom theme/instruction..."
                            value={customInputByIndex[idx] || ''}
                            onChange={(e) => setCustomInputByIndex(prev => ({ ...prev, [idx]: e.target.value }))}
                          />
                          <button
                            className="dropdown-apply"
                            onClick={() => {
                              createPostFromNews(item, idx, 'infographic', customInputByIndex[idx]);
                            }}
                            disabled={creatingPost.has(idx)}
                          >Create with Custom</button>
                        </div>
                      </div>,
                      portalRootRef.current
                    )}

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
