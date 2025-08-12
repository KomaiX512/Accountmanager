import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
import { appendBypassParam } from '../../utils/cacheManager';
import './News4U.css';

interface News4UProps {
  accountHolder: string;
  platform: 'instagram' | 'twitter' | 'facebook';
}

interface NewsItem {
  title: string;
  description: string;
  image_url: string;
  source_url: string;
  timestamp: string;
  source?: string;
  id?: string;
  fetched_at?: string;
  iteration?: number;
}

const News4USlider: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  const accountHolderRef = React.useRef(accountHolder);
  const normalizedAccountHolder = accountHolderRef.current;

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [creatingPost, setCreatingPost] = useState<Set<number>>(new Set());
  const [customInputByIndex, setCustomInputByIndex] = useState<Record<number, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Portal root for dropdown menu
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let node = document.getElementById('news4u-portal-root') as HTMLElement | null;
    if (!node) {
      node = document.createElement('div');
      node.id = 'news4u-portal-root';
      document.body.appendChild(node);
    }
    portalRootRef.current = node;
  }, []);

  const updateMenuPosition = () => {
    const anchor = menuAnchorRef.current;
    if (!anchor) {
      setMenuPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
    setMenuPosition({ top, left });
  };

  useEffect(() => {
    if (openMenuIndex !== null) {
      updateMenuPosition();
      const handle = () => updateMenuPosition();
      const outside = (e: MouseEvent) => {
        const anchor = menuAnchorRef.current;
        const portalEl = document.getElementById('news4u-dropdown-portal');
        if (portalEl && (portalEl.contains(e.target as Node) || (anchor && anchor.contains(e.target as Node)))) return;
        setOpenMenuIndex(null);
      };
      window.addEventListener('resize', handle, { passive: true } as any);
      window.addEventListener('scroll', handle, { passive: true } as any);
      document.addEventListener('mousedown', outside, true);
      return () => {
        window.removeEventListener('resize', handle);
        window.removeEventListener('scroll', handle);
        document.removeEventListener('mousedown', outside, true);
      };
    }
  }, [openMenuIndex]);

  const decodeUnicode = (text?: string) =>
    text ? text.replace(/\\u[0-9A-F]{4}/gi, m => String.fromCodePoint(parseInt(m.replace('\\u', ''), 16))) : '';

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  };

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
    const title = decodeUnicode(newsItem.title).trim();
    const description = decodeUnicode(newsItem.description).trim();
    const newsContent = `${title} - ${description}`;

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

    const prompt = [
      `NEWS_TITLE: ${title}`,
      `NEWS_DESCRIPTION: ${description}`,
      `FULL_NEWS_CONTENT: ${newsContent}`,
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

  const createPostFromNews = async (newsItem: NewsItem, idx: number, style: PostStyle, customInstruction?: string) => {
    setCreatingPost(prev => new Set([...prev, idx]));
    setToastMessage(null);
    try {
      const prompt = buildPrompt(newsItem, style, customInstruction);
      const response = await RagService.sendPostQuery(
        normalizedAccountHolder,
        prompt,
        platform
      );
      if (response.success) {
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: { username: normalizedAccountHolder, platform, timestamp: Date.now() }
        });
        window.dispatchEvent(newPostEvent);
        setToastMessage(`${styleLabel[style]} post created successfully! Check the Cooked Posts section.`);
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        setToastMessage(response.error || `Failed to create ${styleLabel[style]} post. Please try again.`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (error) {
      setToastMessage(`Failed to create ${styleLabel[style]} post. Please try again.`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setCreatingPost(prev => { const next = new Set(prev); next.delete(idx); return next; });
      setOpenMenuIndex(null);
    }
  };

  const handleToggleMenu = (anchorEl: HTMLElement, idx: number) => {
    if (openMenuIndex === idx) { setOpenMenuIndex(null); return; }
    menuAnchorRef.current = anchorEl;
    setOpenMenuIndex(idx);
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        // Force fresh news every time - no caching
        const baseUrl = `/api/news-for-you/${normalizedAccountHolder}?platform=${platform}`;
        const url = `${baseUrl}&forceRefresh=true&_cb=${Date.now()}`;
        const res = await axios.get(url);
        const itemsOrArrays: any[] = (res.data ?? [])
          .map((r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r))
          .filter(Boolean);

        const rawItems: any[] = [];
        for (const entry of itemsOrArrays) {
          if (!entry) continue;
          if (Array.isArray(entry)) {
            rawItems.push(...entry);
          } else if (Array.isArray(entry.items)) {
            rawItems.push(...entry.items);
          } else if (Array.isArray(entry.articles)) {
            rawItems.push(...entry.articles);
          } else {
            rawItems.push(entry);
          }
        }

        // EXPAND: if news_data is an array, split into separate entries
        const expanded: any[] = [];
        for (const it of rawItems) {
          if (it && Array.isArray(it.news_data)) {
            for (const nd of it.news_data) {
              expanded.push({ ...it, news_data: nd });
            }
          } else {
            expanded.push(it);
          }
        }

        const normalized: NewsItem[] = expanded.map((n: any) => {
          const base = n && typeof n === 'object' && n.news_data ? n.news_data : n;
          const title: string = base.title || base.headline || '';
          const description: string = base.description || base.summary || base.breaking_news_summary || '';
          const image_url: string = base.image_url || base.image || base.thumbnail || '';
          const source_url: string = base.source_url || base.url || base.link || '';
          const timestamp: string = base.timestamp || base.fetched_at || base.published_at || n?.export_timestamp || new Date().toISOString();
          const source: string | undefined = base.source || base.publisher || undefined;
          const iteration: number | undefined = n?.iteration || base?.export_iteration;
          const fetched_at: string | undefined = base.fetched_at;
          const id: string | undefined = n?.export_metadata?.export_path || n?.key || (source_url && fetched_at ? `${source_url}::${fetched_at}` : undefined) || (source_url && timestamp ? `${source_url}::${timestamp}` : undefined) || (title ? `${title}::${timestamp}` : undefined);
          return { id, title, description, image_url, source_url, timestamp, source, fetched_at, iteration };
        });

        const deduped: NewsItem[] = [];
        const seen = new Set<string>();
        normalized.forEach(n => {
          const key = (n.id || `${n.source_url || ''}::${n.fetched_at || n.timestamp || ''}` || `${n.title || ''}::${n.timestamp || ''}`).toLowerCase();
          if (key && !seen.has(key)) { seen.add(key); deduped.push(n); }
        });

        setItems(deduped);
        setCurrent(0);
      } catch (err: any) {
        setError(err.response?.status === 404 ? 'No news available yet' : 'Failed to load news');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [platform]);

  const prev = () => setCurrent(c => (items.length ? (c - 1 + items.length) % items.length : 0));
  const next = () => setCurrent(c => (items.length ? (c + 1) % items.length : 0));

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

  const item = items[current];

  return (
    <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="news4u-content" style={{ gap: 0 }}>
        <div className="news4u-item" onClick={() => {}}>
          <div className="news4u-item-header">
            <FaClock className="timestamp-icon" />
            <span>{formatTimestamp(item.timestamp)}</span>
          </div>

          <div className="news4u-item-content">
            {item.image_url && (
              <div className="news4u-image">
                <img src={item.image_url} alt={item.title} onError={handleImageError} loading="lazy" />
              </div>
            )}
            <div className="news4u-text-content">
              <div className="news4u-title">{decodeUnicode(item.title)}</div>
              <div className="news4u-description expanded">{decodeUnicode(item.description)}</div>

              <div className="news4u-actions" onClick={(e) => e.stopPropagation()}>
                <div className="news4u-post-menu">
                  <button
                    className="create-post-btn"
                    onClick={(e) => handleToggleMenu(e.currentTarget as HTMLElement, current)}
                    disabled={creatingPost.has(current)}
                    title="Create post from this news"
                  >
                    {creatingPost.has(current) ? (
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
                </div>

                {portalRootRef.current && menuPosition && openMenuIndex === current && createPortal(
                  <div
                    id="news4u-dropdown-portal"
                    className="news4u-dropdown news4u-dropdown-portal"
                    role="menu"
                    style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left }}
                  >
                    <button className="dropdown-item" onClick={() => createPostFromNews(item, current, 'infographic', customInputByIndex[current])} disabled={creatingPost.has(current)}>Infographic</button>
                    <button className="dropdown-item" onClick={() => createPostFromNews(item, current, 'typographic', customInputByIndex[current])} disabled={creatingPost.has(current)}>Typographical</button>
                    <button className="dropdown-item" onClick={() => createPostFromNews(item, current, 'single_image', customInputByIndex[current])} disabled={creatingPost.has(current)}>Single Image</button>
                    <button className="dropdown-item" onClick={() => createPostFromNews(item, current, 'meme', customInputByIndex[current])} disabled={creatingPost.has(current)}>Meme</button>
                    <div className="dropdown-separator" />
                    <div className="dropdown-custom">
                      <input
                        type="text"
                        className="dropdown-input"
                        placeholder="Optional custom theme/instruction..."
                        value={customInputByIndex[current] || ''}
                        onChange={(e) => setCustomInputByIndex(prev => ({ ...prev, [current]: e.target.value }))}
                      />
                      <button
                        className="dropdown-apply"
                        onClick={() => createPostFromNews(item, current, 'infographic', customInputByIndex[current])}
                        disabled={creatingPost.has(current)}
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
            </div>
          </div>
        </div>

        {items.length > 1 && (
          <div className="news4u-navigation" style={{ marginTop: 8 }}>
            <button className="nav-btn" onClick={prev} title="Previous"><FaChevronLeft /> Prev</button>
            <div className="news-counter">{current + 1} / {items.length}</div>
            <button className="nav-btn" onClick={next} title="Next">Next <FaChevronRight /></button>
          </div>
        )}
      </div>

      {toastMessage && (
        <motion.div className="news4u-toast" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} transition={{ duration: 0.3 }}>
          {toastMessage}
        </motion.div>
      )}
    </motion.div>
  );
};

export default News4USlider;


 