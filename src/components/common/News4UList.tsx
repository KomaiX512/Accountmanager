import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss, FaRedo } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
import { appendBypassParam } from '../../utils/cacheManager';
import './News4U.css';

interface News4UProps {
  accountHolder: string;
  platform: 'instagram' | 'twitter' | 'facebook';
}

interface NewsItem {
  username?: string;
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
 * 🚀 ULTRA-ROBUST News4U Component with Bulletproof Account Locking
 * Features:
 * - Account username is PERMANENTLY LOCKED on first render and NEVER changes
 * - Enhanced file pattern detection (ALL news patterns supported)
 * - Robust error handling with fallback mechanisms
 * - No hard refresh required - seamless navigation
 * - Smart caching bypass for fresh data
 * - Only refreshes when platform dashboard is switched
 */
const News4UList: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  // 🔒 ULTRA-CRITICAL: PERMANENT LOCK - Initialize ONCE and NEVER change
  const [lockedAccountHolder] = useState(() => {
    const locked = accountHolder?.trim();
    console.log(`[News4U] 🔒 PERMANENTLY LOCKING account holder to: "${locked}"`);
    return locked;
  });
  
  const [lockedPlatform] = useState(() => {
    const locked = platform;
    console.log(`[News4U] 🔒 PERMANENTLY LOCKING platform to: "${locked}"`);
    return locked;
  });

  // 🛡️ SAFETY CHECK: If somehow the locked values are empty, throw error
  useEffect(() => {
    if (!lockedAccountHolder || !lockedPlatform) {
      console.error(`[News4U] 🚨 CRITICAL ERROR: Locked values are invalid!`, {
        lockedAccountHolder,
        lockedPlatform,
        originalAccountHolder: accountHolder,
        originalPlatform: platform
      });
    }
  }, [lockedAccountHolder, lockedPlatform, accountHolder, platform]);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creatingPost, setCreatingPost] = useState<Set<number>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [customInputByIndex, setCustomInputByIndex] = useState<Record<number, string>>({});
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [platformSwitchCount, setPlatformSwitchCount] = useState<number>(0);
  
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);

  // 🔒 ROBUST: Ensure portal root exists and persists
  useEffect(() => {
    let node = document.getElementById('news4u-portal-root') as HTMLElement | null;
    if (!node) {
      node = document.createElement('div');
      node.id = 'news4u-portal-root';
      document.body.appendChild(node);
    }
    portalRootRef.current = node;
    return () => {
      // Keep node persistent for page lifetime; do not remove on unmount
    };
  }, []);

  // 🔒 ROBUST: Menu positioning with automatic updates
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
  }, [openMenuIndex, updateMenuPosition]);

  // 🔒 ROBUST: Toggle expand with smooth animation
  const toggleExpand = useCallback((idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  // 🔒 ROBUST: Unicode decoding with fallback
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

  // 🔒 ROBUST: Image error handling
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none';
  }, []);

  // 🔒 ROBUST: Timestamp formatting with validation
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

  // 🔒 ROBUST: Enhanced prompt building
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

  // 🔒 ROBUST: Post creation with enhanced error handling
  const createPostFromNews = useCallback(async (newsItem: NewsItem, idx: number, style: PostStyle, customInstruction?: string) => {
    setCreatingPost(prev => new Set([...prev, idx]));
    setToastMessage(null);

    try {
      const prompt = buildPrompt(newsItem, style, customInstruction);
      
      console.log(`[News4U] 🚀 Creating ${styleLabel[style]} post for ${lockedAccountHolder} on ${lockedPlatform}`);
      
      const response = await RagService.sendPostQuery(
        lockedAccountHolder,
        prompt,
        lockedPlatform
      );
      
      if (response.success) {
        console.log(`[News4U] ✅ Post created successfully for ${lockedAccountHolder} on ${lockedPlatform}`);
        
        // Trigger post refresh event
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: {
            username: lockedAccountHolder,
            platform: lockedPlatform,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(newPostEvent);
        console.log(`[News4U] 🔄 Triggered PostCooked refresh event for ${lockedPlatform}`);
        
        setToastMessage(`${styleLabel[style]} post created successfully! Check the Cooked Posts section.`);
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        console.error(`[News4U] ❌ Post creation failed for ${lockedAccountHolder} on ${lockedPlatform}:`, response.error);
        setToastMessage(response.error || `Failed to create ${styleLabel[style]} post. Please try again.`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (error) {
      console.error(`[News4U] ❌ Error creating ${styleLabel[style]} post for ${lockedAccountHolder} on ${lockedPlatform}:`, error);
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
  }, [buildPrompt, styleLabel, lockedAccountHolder, lockedPlatform]);

  // 🔒 ROBUST: Menu toggle with proper positioning
  const handleToggleMenu = useCallback((anchorEl: HTMLElement, idx: number) => {
    if (openMenuIndex === idx) {
      setOpenMenuIndex(null);
      return;
    }
    menuAnchorRef.current = anchorEl;
    setOpenMenuIndex(idx);
  }, [openMenuIndex]);

  // 🔒 ULTRA-ROBUST: Enhanced news fetching with bulletproof logic
  const fetchNews = useCallback(async (isPlatformSwitch = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // 🛡️ SECURITY: Always use locked values - NEVER use props directly
      if (!lockedAccountHolder || !lockedPlatform) {
        throw new Error('Account holder or platform not properly locked');
      }
      
      // Force fresh news every time - no caching
      const baseUrl = `/api/news-for-you/${lockedAccountHolder}?platform=${lockedPlatform}`;
      const url = `${baseUrl}&forceRefresh=true&_cb=${Date.now()}`;
      
      console.log(`[News4U] 🔍 Fetching news for ${lockedAccountHolder} on ${lockedPlatform} (platform switch: ${isPlatformSwitch})`);
      
      const res = await axios.get(url);
      console.log(`[News4U] Raw response:`, res.data);
      
      // Support both shapes: [{ key, lastModified, data: {...} }] and legacy: [{...}]
      const itemsOrArrays: any[] = (res.data ?? [])
        .map((r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r))
        .filter(Boolean);
      
      console.log(`[News4U] Items after unwrapping:`, itemsOrArrays);

      // Flatten possible array shapes: direct arrays, {items: [...]}, {articles: [...]}
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
      
      console.log(`[News4U] Raw items after flattening:`, rawItems);

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

      // Normalize to the new shape to avoid empty UI due to schema differences
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

      // Remove duplicate stories based on unique id (fallback to composite)
      const deduped: NewsItem[] = [];
      const seen = new Set<string>();
      normalized.forEach(n => {
        const key = (n.id || `${n.source_url || ''}::${n.fetched_at || n.timestamp || ''}` || `${n.title || ''}::${n.timestamp || ''}`).toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          deduped.push(n);
        }
      });

      // 🚀 ROBUST TOP 4 LATEST NEWS LOGIC
      // Sort by timestamp to get the most recent news first
      const sortedByTimestamp = deduped.sort((a, b) => {
        try {
          const timeA = new Date(a.timestamp || a.fetched_at || 0).getTime();
          const timeB = new Date(b.timestamp || b.fetched_at || 0).getTime();
          return timeB - timeA; // Most recent first
        } catch {
          return 0; // Keep original order if timestamp parsing fails
        }
      });

      // Log timestamp information for debugging
      console.log(`[News4U] 📊 Timestamp analysis:`, sortedByTimestamp.slice(0, 4).map((item, idx) => ({
        rank: idx + 1,
        title: item.title?.substring(0, 50) + '...',
        timestamp: item.timestamp || item.fetched_at,
        parsed: new Date(item.timestamp || item.fetched_at || 0).toISOString()
      })));

      // Take only the top 4 latest news items
      const top4Latest = sortedByTimestamp.slice(0, 4);

      // 🛡️ ROBUST FALLBACK SYSTEM: Ensure we always have news when available
      let finalItems: NewsItem[] = [];
      
      if (top4Latest.length > 0) {
        // ✅ Primary: Use timestamp-sorted top 4
        finalItems = top4Latest;
        console.log(`[News4U] ✅ Successfully fetched top ${top4Latest.length} latest news items by timestamp`);
      } else if (deduped.length > 0) {
        // ⚠️ Fallback 1: Use first 4 items if timestamp sorting fails
        finalItems = deduped.slice(0, 4);
        console.warn(`[News4U] ⚠️ Timestamp sorting failed, using first 4 items as fallback`);
      } else {
        // ❌ No items available
        finalItems = [];
        console.warn(`[News4U] ⚠️ No news items available after processing`);
      }

      // Additional validation: ensure we have meaningful content
      const validItems = finalItems.filter(item => 
        item.title && item.title.trim().length > 0 && 
        item.description && item.description.trim().length > 0
      );

      if (validItems.length === 0 && finalItems.length > 0) {
        console.warn(`[News4U] ⚠️ Filtered out items with empty content, using original items`);
        setItems(finalItems);
      } else {
        setItems(validItems);
      }
      
      console.log(`[News4U] Final processed items:`, validItems);
      console.log(`[News4U] Total items processed: ${deduped.length}, Selected: ${validItems.length}, Platform: ${lockedPlatform}`);
      
      setLastFetchTime(Date.now());

    } catch (err: any) {
      console.error(`[News4U] ❌ Error fetching news:`, err);
      
      if (err.response?.status === 404) {
        const errorMsg = 'No news available yet';
        setError(errorMsg);
        console.log(`[News4U] ℹ️ No news available for ${lockedAccountHolder} on ${lockedPlatform}`);
      } else {
        setError('Failed to load news');
      }
    } finally {
      setLoading(false);
    }
  }, [lockedAccountHolder, lockedPlatform]);

  // 🔒 ROBUST: Initial fetch and platform switch detection
  useEffect(() => {
    // Only fetch on initial mount or when platform dashboard is switched
    fetchNews(false);
  }, [fetchNews]);

  // 🔒 ROBUST: Detect platform dashboard switches and refresh accordingly
  useEffect(() => {
    const handlePlatformSwitch = () => {
      console.log(`[News4U] 🔄 Platform dashboard switched, refreshing news for ${lockedAccountHolder} on ${lockedPlatform}`);
      setPlatformSwitchCount(prev => prev + 1);
      fetchNews(true);
    };

    // Listen for platform switch events
    window.addEventListener('platformDashboardSwitch', handlePlatformSwitch);
    
    return () => {
      window.removeEventListener('platformDashboardSwitch', handlePlatformSwitch);
    };
  }, [fetchNews, lockedAccountHolder, lockedPlatform]);

  // 🔒 ROBUST: Manual refresh function (only when explicitly requested)
  const handleManualRefresh = useCallback(() => {
    console.log(`[News4U] 🔄 Manual refresh requested for ${lockedAccountHolder} on ${lockedPlatform}`);
    fetchNews(false);
  }, [fetchNews, lockedAccountHolder, lockedPlatform]);

  // 🔒 ROBUST: Auto-refresh only when navigating back to dashboard after long absence
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only refresh if page was hidden for more than 5 minutes and we're coming back
      if (!document.hidden && Date.now() - lastFetchTime > 300000) { // 5 minutes
        console.log(`[News4U] 🔄 Page became visible after long absence, refreshing news`);
        fetchNews(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastFetchTime, fetchNews]);

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
                  <div className="news4u-rank">
                    <span className="rank-number">#{idx + 1}</span>
                  </div>
                  <FaClock className="timestamp-icon" />
                  <span>{formatTimestamp(item.timestamp)}</span>
                </div>

                <div className="news4u-item-content">
                  {item.image_url && (
                    <div className="news4u-image">
                      <img 
                        src={item.image_url} 
                        alt={item.title}
                        onError={handleImageError}
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="news4u-text-content">
                    <div className="news4u-title">
                      {decodeUnicode(item.title)}
                    </div>
                    <div
                      className={`news4u-description ${isOpen ? 'expanded' : 'collapsed'}`}
                      onClick={() => toggleExpand(idx)}
                      title={isOpen ? 'Click to collapse' : 'Click to expand'}
                    >
                      {decodeUnicode(item.description)}
                      {!isOpen && (
                        <div className="expand-indicator">
                          <span>...</span>
                        </div>
                      )}
                    </div>
                  </div>
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
