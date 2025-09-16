// ✅ SMART BACKEND SELECTION: Use VPS only for specific cross-device features
function getBaseUrl(): string {
  // If we're on production domain, always use VPS backend
  if (typeof window !== 'undefined' && window.location.hostname.includes('sentientm.com')) {
    return 'https://sentientm.com';
  }
  // Default: use local backend for module data (recommendations, strategies, etc.)
  return '';
}

// ✅ VPS BACKEND: Only for specific cross-device sync features
function getVpsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    
    const urlParams = new URLSearchParams(window.location.search);
    const forceLocal = urlParams.get('localBackend') === 'true';
    
    if (isLocal && !forceLocal) {
      console.log('[API CONFIG] 🔗 Using VPS backend for cross-device sync features');
      return 'https://sentientm.com';
    }
    
    // If on production domain, use same domain
    if (hostname.includes('sentientm.com')) {
      return 'https://sentientm.com';
    }
  }
  
  return '';
}

// API Configuration for unified hosting
export const API_CONFIG = {
  // ✅ CROSS-DEVICE SYNC FIX: Use VPS backend for processing status to ensure cross-device synchronization
  BASE_URL: getBaseUrl(),
  // API endpoints
  ENDPOINTS: {
    // Main API routes (through reverse proxy /api/*)
    SAVE_ACCOUNT_INFO: '/api/save-account-info',
    USER_INSTAGRAM_STATUS: '/api/user-instagram-status',
    USER_TWITTER_STATUS: '/api/user-twitter-status', 
    USER_FACEBOOK_STATUS: '/api/user-facebook-status',
    CHECK_USERNAME_AVAILABILITY: '/api/check-username-availability',
    // Direct routes (through reverse proxy)
    EVENTS: '/events',
    WEBHOOK_FACEBOOK: '/webhook/facebook',
    WEBHOOK_TWITTER: '/webhook/twitter',
    // Profile and data routes
    PROFILE_INFO: '/api/profile-info',
    RETRIEVE_ACCOUNT_INFO: '/api/retrieve-account-info',
    RETRIEVE_STRATEGIES: '/api/retrieve-strategies',
    RETRIEVE_ENGAGEMENT_STRATEGIES: '/api/retrieve-engagement-strategies',
    POSTS: '/api/posts',
    RESPONSES: '/api/responses',
    // Social media connections
    INSTAGRAM_CONNECTION: '/api/instagram-connection',
    TWITTER_CONNECTION: '/api/twitter-connection',
    FACEBOOK_CONNECTION: '/api/facebook-connection',
    // Scheduling and posting
    SCHEDULE_TWEET: '/api/schedule-tweet',
    SCHEDULE_TWEET_WITH_IMAGE: '/api/schedule-tweet-with-image',
    SCHEDULE_POST: '/api/schedule-post',
    POST_FACEBOOK_NOW: '/api/post-facebook-now',
    POST_TWEET: '/api/post-tweet',
    POST_TWEET_WITH_IMAGE: '/api/post-tweet-with-image',
    // DMs and comments
    SEND_DM_REPLY: '/api/send-dm-reply',
    SEND_COMMENT_REPLY: '/api/send-comment-reply',
    // Other features
    FEEDBACK: '/api/feedback',
    RULES: '/api/rules',
    PROXY_IMAGE: '/api/proxy-image',
    R2_IMAGE: '/api/r2-image',
    RUN_STATUS: '/api/run-status', // Fixed: Use API route that goes through server, not direct R2 access
    // Events and SSE
    EVENTS_LIST: '/api/events-list',
  }
};

// Helper function to get full URL with enhanced error handling
export const getApiUrl = (endpoint: string, params?: string): string => {
  try {
    // ✅ SMART ROUTING: Use VPS backend only for specific cross-device sync features
    const isRunStatus = endpoint.startsWith(API_CONFIG.ENDPOINTS.RUN_STATUS);
    const isHealth = endpoint.startsWith('/api/health');
    const isProcessingStatus = endpoint.includes('/api/processing-status');
    const isPlatformConnection = endpoint.includes('-connection') || endpoint.includes('-status');
    
    // Use VPS backend for cross-device sync features, local for module data
    const useVpsBackend = isRunStatus || isHealth || isProcessingStatus || isPlatformConnection;
    const baseUrl = useVpsBackend ? getVpsBaseUrl() : '';
    
    const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${fullEndpoint}`;
    const finalUrl = params ? `${url}${params}` : url;
    
    // Validate the URL
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('/')) {
      console.error('[getApiUrl] Invalid URL generated:', finalUrl);
      return `/api${fullEndpoint}`;
    }
    
    // Log URL routing for debugging in development
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      const backend = useVpsBackend ? 'VPS' : 'LOCAL';
      console.log(`[getApiUrl] ${backend} backend: ${finalUrl}`);
    }
    
    return finalUrl;
  } catch (error) {
    console.error('[getApiUrl] Error generating URL:', error);
    const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `/api${fullEndpoint}`;
  }
};

// Legacy support - for quick migration
export const API_BASE_URL = ''; 