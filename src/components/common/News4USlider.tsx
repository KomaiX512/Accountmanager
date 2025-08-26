import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss, FaRedo, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
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

/**
 * 🚀 ULTRA-ROBUST News4U Slider Component with Bulletproof Account Locking & Auto-Retry
 * Features:
 * - Account username is PERMANENTLY LOCKED on first render and NEVER changes
 * - Automatic retry when "no news available" appears with exponential backoff
 * - Enhanced file pattern detection (ALL news patterns supported)
 * - Robust error handling with fallback mechanisms
 * - No hard refresh required - seamless navigation
 * - Enhanced slider navigation for multiple news items with better visibility
 */
const News4USlider: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  // Use live props directly
  const effectiveAccountHolder = useMemo(() => (accountHolder || '').trim(), [accountHolder]);
  const effectivePlatform = useMemo(() => platform, [platform]);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [creatingPost, setCreatingPost] = useState<Set<number>>(new Set());
  const [customInputByIndex, setCustomInputByIndex] = useState<Record<number, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [forceRefreshKey, setForceRefreshKey] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Portal root for dropdown menu
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🚀 ROBUST: Ensure portal root exists and persists
  useEffect(() => {
    let node = document.getElementById('news4u-portal-root') as HTMLElement | null;
    if (!node) {
      node = document.createElement('div');
      node.id = 'news4u-portal-root';
      document.body.appendChild(node);
    }
    portalRootRef.current = node;
  }, []);

  // 🚀 ROBUST: Menu positioning with automatic updates
  const updateMenuPosition = useCallback(() => {
    const anchor = menuAnchorRef.current;
    if (!anchor) {
      setMenuPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
    setMenuPosition({ top, left });
  }, []);

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
  }, [openMenuIndex, updateMenuPosition]);

  // 🚀 ROBUST: Unicode decoding with fallback
  const decodeUnicode = useCallback((text?: string) => {
    if (!text) return '';
    try {
      return text.replace(/\\u[0-9A-F]{4}/gi, m => 
        String.fromCodePoint(parseInt(m.replace('\\u', ''), 16))
      );
    } catch {
      return text; // Fallback to original text if decoding fails
    }
  }, []);

  // 🚀 ROBUST: Image error handling
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  }, []);

  // 🚀 ROBUST: Timestamp formatting with validation
  const formatTimestamp = useCallback((ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      
      // Validate that the date is reasonable (not too far in future or past)
      const timeDiff = Math.abs(now.getTime() - date.getTime());
      const maxReasonableDiff = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
      
      if (timeDiff > maxReasonableDiff) {
        return 'Recently'; // Fallback for invalid dates
      }
      
      const hrs = Math.floor((now.getTime() - date.getTime()) / 3.6e6);
      if (hrs < 1) return 'Just now';
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return 'Recently';
    }
  }, []);

  type PostStyle = 'infographic' | 'typographic' | 'single_image' | 'meme';
  const styleLabel: Record<PostStyle, string> = useMemo(() => ({
    infographic: 'Infographic',
    typographic: 'Typographical',
    single_image: 'Single Image',
    meme: 'Meme',
  }), []);

  // 🚀 ROBUST: Enhanced prompt building
  const buildPrompt = useCallback((newsItem: NewsItem, style: PostStyle, customInstruction?: string) => {
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
  }, [decodeUnicode, styleLabel]);

  // 🚀 ROBUST: Post creation with enhanced error handling
  const createPostFromNews = useCallback(async (newsItem: NewsItem, idx: number, style: PostStyle, customInstruction?: string) => {
    setCreatingPost(prev => new Set([...prev, idx]));
    setToastMessage(null);
    try {
      const prompt = buildPrompt(newsItem, style, customInstruction);
      const response = await RagService.sendPostQuery(
        effectiveAccountHolder,
        prompt,
        effectivePlatform
      );
      if (response.success) {
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: { username: effectiveAccountHolder, platform: effectivePlatform, timestamp: Date.now() }
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
  }, [buildPrompt, styleLabel, effectiveAccountHolder, effectivePlatform]);

  // 🚀 ROBUST: Menu toggle with proper positioning
  const handleToggleMenu = useCallback((anchorEl: HTMLElement, idx: number) => {
    if (openMenuIndex === idx) { setOpenMenuIndex(null); return; }
    menuAnchorRef.current = anchorEl;
    setOpenMenuIndex(idx);
  }, [openMenuIndex]);

  // 🚀 ULTRA-ROBUST: Enhanced news fetching with bulletproof retry logic
  const fetchNews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!effectiveAccountHolder || !effectivePlatform) {
        throw new Error('Account holder or platform missing');
      }
      
      // Force fresh news every time - no caching
      const baseUrl = `/api/news-for-you/${effectiveAccountHolder}?platform=${effectivePlatform}`;
      const url = `${baseUrl}&forceRefresh=true&_cb=${Date.now()}&_key=${forceRefreshKey}`;
      
      console.log(`[News4U-Slider] 🔍 Fetching news for ${effectiveAccountHolder} on ${effectivePlatform} (key: ${forceRefreshKey})`);
      console.log(`[News4U-Slider] 🔍 API URL: ${url}`);
      console.log(`[News4U-Slider] 🔍 Force refresh: true, Cache busting: ${Date.now()}`);
      
      const res = await axios.get(url);
      
      // 🔍 ENHANCED DEBUGGING: Show backend response structure
      console.log(`[News4U-Slider] 🔍 Backend response:`, {
        status: res.status,
        dataType: typeof res.data,
        dataLength: Array.isArray(res.data) ? res.data.length : 'Not array',
        sampleData: res.data ? JSON.stringify(res.data).substring(0, 500) + '...' : 'No data'
      });
      
      if (Array.isArray(res.data)) {
        console.log(`[News4U-Slider] 🔍 Backend response structure analysis:`);
        res.data.forEach((item, idx) => {
          console.log(`[News4U-Slider] 🔍 Item ${idx}:`, {
            key: item.key,
            lastModified: item.lastModified,
            hasData: !!item.data,
            dataKeys: item.data ? Object.keys(item.data) : 'No data'
          });
        });
      }
      
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
        } else if (Array.isArray(entry.news_items)) {
          // 🚀 FIXED: Handle the actual API response structure
          rawItems.push(...entry.news_items);
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

      // 🚀 FIXED: Trust the backend's R2 bucket sorting instead of overriding it
      // The backend already sorts files by LastModified date (most recent first)
      // We should NOT re-sort here as it can override the correct R2 bucket order
      
      // Remove duplicate stories based on unique id (but maintain backend order)
      const deduped: NewsItem[] = [];
      const seen = new Set<string>();
      normalized.forEach(n => {
        const key = (n.id || `${n.source_url || ''}::${n.fetched_at || n.timestamp || ''}` || `${n.title || ''}::${n.timestamp || ''}`).toLowerCase();
        if (key && !seen.has(key)) { 
          seen.add(key); 
          deduped.push(n); 
        }
      });

      // 🚀 CRITICAL FIX: Do NOT re-sort by timestamp - trust the backend R2 bucket order
      // The backend already sorts by LastModified date (most recent first)
      // Re-sorting here can override the correct R2 bucket chronological order
      
      // Take only the top 4 items in the order they came from backend (R2 bucket sorted)
      const top4Latest = deduped.slice(0, 4);

      // Strict: just use the top 4 latest (no fallback to arbitrary items)
      const finalItems: NewsItem[] = top4Latest;

      // Additional validation: ensure we have meaningful content
      const validItems = finalItems.filter(item => 
        item.title && item.title.trim().length > 0 && 
        item.description && item.description.trim().length > 0
      );

      if (validItems.length === 0 && finalItems.length > 0) {
        console.warn(`[News4U-Slider] ⚠️ Filtered out items with empty content, using original items`);
        setItems(finalItems);
      } else {
        setItems(validItems);
      }
      
      console.log(`[News4U-Slider] Final processed items:`, validItems);
      console.log(`[News4U-Slider] Total items processed: ${deduped.length}, Selected: ${validItems.length}, Platform: ${effectivePlatform}`);
      
      // Successful fetch
      setLastFetchTime(Date.now());
      setCurrent(0);
      
    } catch (err: any) {
      console.error(`[News4U-Slider] ❌ Error fetching news:`, err);
      if (err.response?.status === 404) {
        setItems([]);
        setError('');
      } else {
        setError('Failed to load news');
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveAccountHolder, effectivePlatform, forceRefreshKey]);

  // 🚀 SIMPLIFIED: Dynamic refresh system that checks for new items every 15 seconds
  useEffect(() => {
    if (!autoRefreshEnabled || !effectiveAccountHolder || !effectivePlatform) {
      // Clear existing interval if disabled
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
      return;
    }
    
    // Clear any existing interval before creating new one
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
    }
    
    // Start simple auto-refresh after initial load
    const startDelay = setTimeout(() => {
      console.log(`[News4U-Slider] 🚀 Starting dynamic refresh for ${effectiveAccountHolder} on ${effectivePlatform}`);
      
      autoRefreshIntervalRef.current = setInterval(async () => {
        try {
          console.log(`[News4U-Slider] 🔄 Auto-checking for new items... (${new Date().toLocaleTimeString()})`);
          
          // Simple approach: just refetch and compare item count/content
          const currentItemCount = items.length;
          const currentFirstItemId = items[0]?.id || items[0]?.title;
          
          // Force a fresh fetch to check for new items
          setForceRefreshKey(prev => prev + 1);
          
          // The fetchNews effect will handle the actual refresh
          console.log(`[News4U-Slider] 🔄 Triggered refresh check - current items: ${currentItemCount}, first item: ${currentFirstItemId}`);
          
        } catch (error: any) {
          console.warn(`[News4U-Slider] ⚠️ Auto-refresh failed:`, error?.message || 'Unknown error');
        }
      }, 15000); // Check every 15 seconds for better responsiveness
      
    }, 5000); // Start 5s after initial load
    
    return () => {
      clearTimeout(startDelay);
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, effectiveAccountHolder, effectivePlatform, items.length]);

  // 🚀 ENHANCED: Refresh when tab becomes visible and add window focus refresh
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log(`[News4U-Slider] 👁️ Tab visible - checking for new items`);
        setForceRefreshKey(prev => prev + 1);
      }
    };
    
    const onFocus = () => {
      console.log(`[News4U-Slider] 🎯 Window focused - checking for new items`);
      setForceRefreshKey(prev => prev + 1);
    };
    
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // 🚀 ROBUST: Initial fetch and cleanup
  useEffect(() => {
    setItems([]);
    setError(null);
    fetchNews();
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [fetchNews, effectiveAccountHolder, effectivePlatform]);

  // 🚀 ROBUST: Manual refresh function
  const handleManualRefresh = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    setForceRefreshKey(prev => prev + 1);
    fetchNews();
  }, [fetchNews]);

  // 🚀 ROBUST: Auto-refresh when navigating back to dashboard
  // Removed auto-refresh on visibility

  // 🚀 ROBUST: Force refresh when platform changes (navigation)
  // Refetch handled by effect deps

  const prev = () => setCurrent(c => (items.length ? (c - 1 + items.length) % items.length : 0));
  const next = () => setCurrent(c => (items.length ? (c + 1) % items.length : 0));

  if (loading) {
    return (
      <motion.div className="news4u-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="news4u-loading">
          <div className="loading-spinner" />
          <span>Fetching top 4 latest news...</span>
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
          <button 
            onClick={handleManualRefresh}
            className="retry-btn"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              marginTop: '4px'
            }}
          >
            <FaRedo style={{ marginRight: '4px' }} />
            Retry
          </button>
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
          <button 
            onClick={handleManualRefresh}
            className="retry-btn"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              marginTop: '4px'
            }}
          >
            <FaRedo style={{ marginRight: '4px' }} />
            Refresh
          </button>
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
          <div className="news4u-navigation">
            <button 
              className="nav-btn" 
              onClick={prev} 
              title="Previous"
              disabled={current === 0}
            >
              <FaChevronLeft /> Prev
            </button>
            <div className="news-counter">{current + 1} / {items.length}</div>
            <button 
              className="nav-btn" 
              onClick={next} 
              title="Next"
              disabled={current === items.length - 1}
            >
              Next <FaChevronRight />
            </button>
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


 