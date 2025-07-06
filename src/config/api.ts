// API Configuration for unified hosting
export const API_CONFIG = {
  // Use absolute URLs for production to ensure proper image loading
  // This ensures images load correctly from any domain
  BASE_URL: typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://sentientm.com',
  
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
    
    // Events and SSE
    EVENTS_LIST: '/api/events-list',
  }
};

// Helper function to get full URL
export const getApiUrl = (endpoint: string, params?: string): string => {
  const baseUrl = API_CONFIG.BASE_URL;
  const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${fullEndpoint}`;
  return params ? `${url}${params}` : url;
};

// Legacy support - for quick migration
export const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://sentientm.com'; 