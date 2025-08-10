// API Configuration for unified hosting
export const API_CONFIG = {
  // Use relative base URL for all environments
  BASE_URL: '',
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
    RUN_STATUS: '/api/run-status',
    // Events and SSE
    EVENTS_LIST: '/api/events-list',
  }
};

// Helper function to get full URL with enhanced error handling
export const getApiUrl = (endpoint: string, params?: string): string => {
  try {
    const baseUrl = API_CONFIG.BASE_URL;
    const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${fullEndpoint}`;
    const finalUrl = params ? `${url}${params}` : url;
    // Validate the URL
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('/')) {
      console.error('[getApiUrl] Invalid URL generated:', finalUrl);
      // Fallback to production URL
      return `/api${fullEndpoint}`;
    }
    // Log URL for debugging in development
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log(`[getApiUrl] Generated URL: ${finalUrl}`);
    }
    return finalUrl;
  } catch (error) {
    console.error('[getApiUrl] Error generating URL:', error);
    // Fallback to production URL
    const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `/api${fullEndpoint}`;
  }
};

// Legacy support - for quick migration
export const API_BASE_URL = ''; 