import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FaClock, FaExternalLinkAlt, FaPlus, FaSpinner, FaRss, FaRedo } from 'react-icons/fa';
import axios from 'axios';
import RagService from '../../services/RagService';
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
 * 🚀 ULTRA-ROBUST News4U Component with Bulletproof Account Locking & Auto-Retry
 * Features:
 * - Account username is PERMANENTLY LOCKED on first render and NEVER changes
 * - Automatic retry when "no news available" appears with exponential backoff
 * - Enhanced file pattern detection (ALL news patterns supported)
 * - Robust error handling with fallback mechanisms
 * - No hard refresh required - seamless navigation
 * - Smart caching bypass for fresh data
 */
const News4UList: React.FC<News4UProps> = ({ accountHolder, platform }) => {
  // 🔒 ULTRA-CRITICAL: PERMANENT LOCK - Use useRef for bulletproof locking
  const lockedAccountHolderRef = useRef<string>('');
  const lockedPlatformRef = useRef<string>('');
  
  // Initialize locks only once
  if (!lockedAccountHolderRef.current && accountHolder) {
    lockedAccountHolderRef.current = accountHolder.trim();
    console.log(`[News4U] 🔒 PERMANENTLY LOCKING account holder to: "${lockedAccountHolderRef.current}"`);
  }
  
  if (!lockedPlatformRef.current && platform) {
    lockedPlatformRef.current = platform;
    console.log(`[News4U] 🔒 PERMANENTLY LOCKING platform to: "${lockedPlatformRef.current}"`);
  }

  // 🛡️ SAFETY CHECK: Validate locked values
  const lockedAccountHolder = lockedAccountHolderRef.current;
  const lockedPlatform = lockedPlatformRef.current;

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creatingPost, setCreatingPost] = useState<Set<number>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [customInputByIndex, setCustomInputByIndex] = useState<Record<number, string>>({});
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [forceRefreshKey, setForceRefreshKey] = useState(0);
  
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);
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

  // 🚀 ROBUST: Toggle expand with smooth animation
  const toggleExpand = useCallback((idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

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
    const img = e.currentTarget;
    img.style.display = 'none';
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

  // 🚀 ROBUST: Menu toggle with proper positioning
  const handleToggleMenu = useCallback((anchorEl: HTMLElement, idx: number) => {
    if (openMenuIndex === idx) {
      setOpenMenuIndex(null);
      return;
    }
    menuAnchorRef.current = anchorEl;
    setOpenMenuIndex(idx);
  }, [openMenuIndex]);

  // 🚀 ULTRA-ROBUST: Enhanced news fetching with bulletproof retry logic
  const fetchNews = useCallback(async (isRetry = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // 🛡️ SECURITY: Always use locked values - NEVER use props directly
      if (!lockedAccountHolder || !lockedPlatform) {
        throw new Error('Account holder or platform not properly locked');
      }
      
      // Force fresh news every time - no caching
      const baseUrl = `/api/news-for-you/${lockedAccountHolder}?platform=${lockedPlatform}`;
      const url = `${baseUrl}&forceRefresh=true&_cb=${Date.now()}&_key=${forceRefreshKey}`;
      
      console.log(`[News4U] 🔍 Fetching news for ${lockedAccountHolder} on ${lockedPlatform} (retry: ${isRetry}, key: ${forceRefreshKey})`);
      console.log(`[News4U] 🔍 API URL: ${url}`);
      
      const res = await axios.get(url);
      console.log(`[News4U] Raw response status:`, res.status);
      console.log(`[News4U] Raw response headers:`, res.headers);
      console.log(`[News4U] Raw response data:`, res.data);
      console.log(`[News4U] Raw response data type:`, typeof res.data);
      console.log(`[News4U] Raw response data length:`, Array.isArray(res.data) ? res.data.length : 'Not an array');
      
      // 🚀 TEST: Check if we have any data at all
      if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
        console.warn(`[News4U] ⚠️ API returned empty data for ${lockedAccountHolder} on ${lockedPlatform}`);
        setError('API returned empty data - no news files found');
        setLoading(false);
        return;
      }
      
      // Support both shapes: [{ key, lastModified, data: {...} }] and legacy: [{...}]
      const itemsOrArrays: any[] = (res.data ?? [])
        .map((r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r))
        .filter(Boolean);
      
      console.log(`[News4U] Items after unwrapping:`, itemsOrArrays);
      console.log(`[News4U] Items count after unwrapping:`, itemsOrArrays.length);

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
        } else if (Array.isArray(entry.news_items)) {
          // 🚀 FIXED: Handle the actual API response structure
          rawItems.push(...entry.news_items);
        } else {
          rawItems.push(entry);
        }
      }
      
      console.log(`[News4U] Raw items after flattening:`, rawItems);
      console.log(`[News4U] Raw items count after flattening:`, rawItems.length);

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

      console.log(`[News4U] Expanded items:`, expanded);
      console.log(`[News4U] Expanded items count:`, expanded.length);

      // 🚀 ENHANCED: More flexible data extraction for different news formats
      const normalized: NewsItem[] = expanded.map((n: any, index: number) => {
        console.log(`[News4U] Processing item ${index}:`, n);
        
        // Try multiple possible data structures
        let base = n;
        if (n && typeof n === 'object' && n.news_data) {
          base = n.news_data;
        } else if (n && typeof n === 'object' && n.data) {
          base = n.data;
        } else if (n && typeof n === 'object' && n.content) {
          base = n.content;
        }
        
        // Extract fields with multiple fallbacks - handle the actual API structure
        const title: string = base?.title || base?.headline || base?.name || base?.subject || '';
        const description: string = base?.description || base?.summary || base?.breaking_news_summary || base?.body || base?.text || '';
        const image_url: string = base?.image_url || base?.image || base?.thumbnail || base?.picture || '';
        const source_url: string = base?.source_url || base?.url || base?.link || base?.source || '';
        const timestamp: string = base?.timestamp || base?.fetched_at || base?.published_at || base?.created_at || n?.export_timestamp || new Date().toISOString();
        const source: string | undefined = base?.source || base?.publisher || base?.author || undefined;
        const iteration: number | undefined = n?.iteration || base?.export_iteration;
        const fetched_at: string | undefined = base?.fetched_at || base?.created_at;
        const id: string | undefined = n?.export_metadata?.export_path || n?.key || (source_url && fetched_at ? `${source_url}::${fetched_at}` : undefined) || (source_url && timestamp ? `${source_url}::${timestamp}` : undefined) || (title ? `${title}::${timestamp}` : undefined);
        
        const item: NewsItem = { id, title, description, image_url, source_url, timestamp, source, fetched_at, iteration };
        console.log(`[News4U] Normalized item ${index}:`, item);
        return item;
      });

      console.log(`[News4U] Normalized items:`, normalized);
      console.log(`[News4U] Normalized items count:`, normalized.length);

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

      console.log(`[News4U] Deduped items:`, deduped);
      console.log(`[News4U] Deduped items count:`, deduped.length);

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

      console.log(`[News4U] Final items before validation:`, finalItems);
      console.log(`[News4U] Valid items after validation:`, validItems);
      console.log(`[News4U] Final items count:`, finalItems.length);
      console.log(`[News4U] Valid items count:`, validItems.length);

      if (validItems.length === 0 && finalItems.length > 0) {
        console.warn(`[News4U] ⚠️ Filtered out items with empty content, using original items`);
        setItems(finalItems);
      } else {
        setItems(validItems);
      }
      
      console.log(`[News4U] Final processed items:`, validItems);
      console.log(`[News4U] Total items processed: ${deduped.length}, Selected: ${validItems.length}, Platform: ${lockedPlatform}`);
      
      // Reset retry count on successful fetch
      setRetryCount(0);
      setLastFetchTime(Date.now());

    } catch (err: any) {
      console.error(`[News4U] ❌ Error fetching news:`, err);
      console.error(`[News4U] ❌ Error details:`, err.response?.data || err.message);
      console.error(`[News4U] ❌ Error status:`, err.response?.status);
      
      if (err.response?.status === 404) {
        const errorMsg = 'No news available yet';
        setError(errorMsg);
        
        // 🚀 ENHANCED AUTOMATIC RETRY: Exponential backoff with max retries
        if (!isRetry && retryCount < 3) {
          const delayMs = Math.min(2000 * Math.pow(2, retryCount), 10000); // 2s, 4s, 8s, max 10s
          console.log(`[News4U] 🔄 No news available for ${lockedAccountHolder}, attempting automatic retry ${retryCount + 1}/3 in ${delayMs}ms`);
          setRetryCount(prev => prev + 1);
          
          // Wait before retry with exponential backoff
          fetchTimeoutRef.current = setTimeout(() => {
            fetchNews(true);
          }, delayMs);
        } else if (retryCount >= 3) {
          console.warn(`[News4U] ⚠️ Max retries (3) reached for ${lockedAccountHolder} on ${lockedPlatform}. News may not be available yet.`);
        }
      } else {
        setError('Failed to load news');
      }
    } finally {
      setLoading(false);
    }
  }, [lockedAccountHolder, lockedPlatform, retryCount, forceRefreshKey]);

  // 🚀 ROBUST: Initial fetch and cleanup
  useEffect(() => {
    fetchNews();
    
    return () => {
      // Cleanup timeout on unmount
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [fetchNews]);

  // 🚀 ROBUST: Manual refresh function
  const handleManualRefresh = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    setRetryCount(0);
    setForceRefreshKey(prev => prev + 1); // Force new fetch
    fetchNews();
  }, [fetchNews]);

  // 🚀 ROBUST: Auto-refresh when navigating back to dashboard
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastFetchTime > 30000) { // 30 seconds
        console.log(`[News4U] 🔄 Page became visible, refreshing news if stale`);
        handleManualRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastFetchTime, handleManualRefresh]);

  // 🚀 ROBUST: Force refresh when platform changes (navigation)
  useEffect(() => {
    // If platform changes, force refresh
    if (platform !== lockedPlatform) {
      console.log(`[News4U] 🔄 Platform changed from ${lockedPlatform} to ${platform}, forcing refresh`);
      setForceRefreshKey(prev => prev + 1);
    }
  }, [platform, lockedPlatform]);

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
          {retryCount > 0 && (
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
          )}
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
              border: 'none',
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
          
          {/* 🚀 DEBUG: Show raw data for troubleshooting */}
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: 'rgba(255, 255, 255, 0.05)', 
            borderRadius: '8px',
            fontSize: '0.7rem',
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'left',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#00ffcc' }}>
              🔍 Debug Info:
            </div>
            <div>Account: <strong>{lockedAccountHolder}</strong></div>
            <div>Platform: <strong>{lockedPlatform}</strong></div>
            <div>Retry Count: <strong>{retryCount}</strong></div>
            <div>Last Fetch: <strong>{lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString() : 'Never'}</strong></div>
            
            {/* 🚀 TEST: Manual API test button */}
            <button 
              onClick={async () => {
                try {
                  console.log(`[News4U] 🧪 Manual API test for ${lockedAccountHolder} on ${lockedPlatform}`);
                  const testUrl = `/api/news-for-you/${lockedAccountHolder}?platform=${lockedPlatform}&forceRefresh=true&_cb=${Date.now()}`;
                  console.log(`[News4U] 🧪 Test URL:`, testUrl);
                  
                  const testRes = await axios.get(testUrl);
                  console.log(`[News4U] 🧪 Test response:`, testRes);
                  
                  // Show test results in alert for quick debugging
                  const dataSummary = {
                    status: testRes.status,
                    dataType: typeof testRes.data,
                    dataLength: Array.isArray(testRes.data) ? testRes.data.length : 'Not array',
                    sampleData: testRes.data ? JSON.stringify(testRes.data).substring(0, 500) + '...' : 'No data'
                  };
                  
                  alert(`API Test Results:\nStatus: ${dataSummary.status}\nData Type: ${dataSummary.dataType}\nData Length: ${dataSummary.dataLength}\nSample: ${dataSummary.sampleData}\n\nCheck console for full details.`);
                  
                } catch (testErr: any) {
                  console.error(`[News4U] 🧪 Test failed:`, testErr);
                  alert(`API Test Failed:\n${testErr.message}\n\nCheck console for details.`);
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #00ffcc, #00d4aa)',
                border: 'none',
                color: '#000',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.65rem',
                cursor: 'pointer',
                marginTop: '8px',
                fontWeight: '600'
              }}
            >
              🧪 Test API Endpoint
            </button>
            
            <div style={{ marginTop: '8px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
              Check browser console for detailed data processing logs
            </div>
          </div>
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
