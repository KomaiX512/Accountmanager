import axios from 'axios';
import { getApiUrl } from '../config/api';

interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Post data structure returned from the RAG server
 */
interface PostData {
  caption: string;
  hashtags: string[];
  call_to_action: string;
  image_prompt: string;
  timestamp?: number;
  image_path?: string;
  generated_at?: string;
  image_url?: string;
  queryUsed?: string;
  status?: string;
}

/**
 * Response structure for post generation
 */
interface PostGenerationResponse {
  success: boolean;
  message: string;
  post?: PostData;
  error?: string;
  details?: string;
}

// Configure axios for CORS requests
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.timeout = 90000; // Increased to 90 seconds to handle request queuing

// Extend axios config type to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      requestId: string;
      startTime: number;
    };
  }
}

// Add a request interceptor for better error handling (NO LOGGING)
axios.interceptors.request.use(
  config => {
    // COMPLETELY DISABLED LOGGING to prevent console spam
    
    const requestId = Math.random().toString(36).substr(2, 9);
    config.metadata = { requestId, startTime: Date.now() };
    
    // Ensure content type is set for all POST requests
    if (config.method === 'post') {
      config.headers['Content-Type'] = 'application/json';
    }
    
    // Ensure CORS headers
    config.headers['Access-Control-Allow-Origin'] = '*';
    config.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    config.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    
    // Don't send credentials for cross-origin requests unless specifically needed
    if (!config.withCredentials) {
      config.withCredentials = false;
    }
    
    return config;
  },
  error => {
    // Only log actual errors
    console.error('[Axios] Request error:', error?.message || error);
    return Promise.reject(error);
  }
);

// Add a response interceptor for better error handling (NO LOGGING)
axios.interceptors.response.use(
  response => {
    // COMPLETELY DISABLED SUCCESS LOGGING to prevent console spam
    return response;
  },
  error => {
    // Only log critical errors (CORS, timeouts) once per request ID
    const requestId = error.config?.metadata?.requestId || 'unknown';
    
    if (error.code === 'ECONNABORTED') {
      console.error(`[Network] Request timeout: ${error.config?.url}`);
    } else if (error.code === 'ERR_NETWORK' && !error.config?.url?.includes('logged')) {
      // Only log network errors once to prevent spam
      console.error(`[Network] Connection failed: ${error.config?.url}`);
    }
    return Promise.reject(error);
  }
);

class RagService {
  // Enable/disable verbose logging (set to false to reduce console spam)
  private static readonly VERBOSE_LOGGING = false;
  
  /**
   * Process markdown formatting in RAG responses
   * Converts markdown syntax to HTML for display
   */
  private static processMarkdownFormatting(text: string): string {
    if (!text) return text;
    
    let processed = text;
    
    // Convert **bold** to <strong>bold</strong>
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* and _italic_ to <em>italic</em>
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Convert bullet points (lines starting with • or -)
    processed = processed.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
    
    // Wrap consecutive <li> items in <ul>
    processed = processed.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    
    // Convert line breaks to <br> tags
    processed = processed.replace(/\n/g, '<br>');
    
    return processed;
  }
  
  // Use relative URLs to go through vite proxy like post-generator
  private static readonly RAG_SERVER_URLS = [
    '',  // Use relative URLs to go through vite proxy
  ];
  
  private static readonly MAIN_SERVER_URLS = [
    '',  // Use relative URLs to go through vite proxy  
  ];
  
  private static readonly AI_REPLIES_URLS = [
    '',  // Use relative URLs to go through vite proxy
  ];
  
  // Request deduplication to prevent multiple identical requests
  private static readonly pendingRequests = new Map<string, Promise<any>>();
  private static readonly requestCache = new Map<string, { data: any; timestamp: number }>();
  private static readonly CACHE_DURATION = 30000; // 30 seconds cache
  
  /**
   * Deduplicated request handler to prevent multiple identical requests
   */
  private static async deduplicatedRequest<T>(
    cacheKey: string,
    requestFn: () => Promise<T>,
    useCache: boolean = true
  ): Promise<T> {
    // Check cache first if enabled
    if (useCache && this.requestCache.has(cacheKey)) {
      const { data, timestamp } = this.requestCache.get(cacheKey)!;
      if (Date.now() - timestamp < this.CACHE_DURATION) {
        if (this.VERBOSE_LOGGING) {
          console.log(`[RagService] Using cached response for ${cacheKey}`);
        }
        return data;
      }
      this.requestCache.delete(cacheKey);
    }
    
    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      if (this.VERBOSE_LOGGING) {
        console.log(`[RagService] Waiting for pending request: ${cacheKey}`);
      }
      return await this.pendingRequests.get(cacheKey)!;
    }
    
    // Create new request
    const requestPromise = (async () => {
      try {
        const result = await requestFn();
        
        // Cache the result if enabled
        if (useCache) {
          this.requestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
        }
        
        return result;
      } finally {
        // Clean up pending request
        this.pendingRequests.delete(cacheKey);
      }
    })();
    
    // Store pending request
    this.pendingRequests.set(cacheKey, requestPromise);
    
    return await requestPromise;
  }
  
  /**
   * Try to send a request to one of the server URLs with exponential backoff
   */
  private static async tryServerUrls<T>(
    endpoint: string, 
    requestFn: (url: string) => Promise<T>,
    serverUrlList: string[] = this.MAIN_SERVER_URLS,
    retries: number = 2
  ): Promise<T> {
    let lastError: any = null;
    
    for (const baseUrl of serverUrlList) {
      for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const fullUrl = `${baseUrl}${endpoint}`;
          // Completely silent operation - no logging
          
        return await requestFn(fullUrl);
      } catch (error: any) {
        lastError = error;
          
          // Check if this is a network/CORS error that should trigger immediate retry
          const isNetworkError = error.code === 'ERR_NETWORK' || 
                                 error.message?.includes('Network Error') ||
                                 error.message?.includes('CORS');
          
          if (isNetworkError && attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Cap at 5 seconds
            // Silent retry - no logging to prevent spam
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // Silent failure - only log if verbose logging is enabled
          if (this.VERBOSE_LOGGING && attempt === retries) {
            console.warn(`[RagService] Failed ${endpoint} after ${retries + 1} attempts:`, error.message);
          }
          break; // Try next URL
        }
      }
    }
    
    // If we get here, all URLs failed - only log if verbose logging is enabled
    if (this.VERBOSE_LOGGING) {
      console.error('[RagService] All servers failed for:', endpoint, lastError?.message);
    }
    throw lastError;
  }
  
  /**
   * Sends a discussion query to the RAG server directly with enhanced platform session handling
   */
  static async sendDiscussionQuery(
    username: string, 
    query: string, 
    previousMessages: ChatMessage[] = [],
    platform: string = 'instagram',
    model: string = 'gemini-2.5-flash'
  ): Promise<{ 
    response: string; 
    usedFallback?: boolean; 
    usingFallbackProfile?: boolean;
    enhancedContext?: boolean;
    quotaInfo?: { 
      exhausted: boolean; 
      resetTime?: string; 
      message: string; 
    } 
  }> {
    const cacheKey = `discussion_${username}_${platform}_${query.slice(0, 50)}`;
    
    return this.deduplicatedRequest(cacheKey, async () => {
      if (this.VERBOSE_LOGGING) {
        console.log(`[RagService] 🚀 Processing discussion query for ${platform}/${username}:`, {
          query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
          messageCount: previousMessages.length,
          platform
        });
      }

      return this.tryServerUrls(
        '/api/rag/discussion',
        async (serverUrl) => {
          try {
            const requestData = {
              username,
              query,
              previousMessages: previousMessages.map(msg => ({
                role: msg.role,
                content: msg.content
              })),
              platform,
              model
            };

            if (this.VERBOSE_LOGGING) {
              console.log(`[RagService] 📤 Sending to ${serverUrl || '/api/rag/discussion'}`);
            }

            // Use getApiUrl for proper URL construction instead of empty baseUrl
            const url = serverUrl || getApiUrl('/api/rag/discussion');
            const response = await axios.post(url, requestData, {
              timeout: 120000, // 2 minute timeout for complex queries
              headers: {
                'Content-Type': 'application/json'
              }
            });

            const result = response.data;
            
            // 🔍 Enhanced logging for debugging RAG quality
            if (result.enhancedContext) {
              console.log(`[RagService] ✅ Enhanced ChromaDB context used for ${platform}/${username}`);
            } else {
              console.log(`[RagService] 📋 Traditional RAG fallback used for ${platform}/${username}`);
            }
            
            if (result.usedFallback) {
              console.log(`[RagService] ⚠️ Fallback response used for ${platform}/${username}:`, result.quotaInfo?.message);
            }

            // Validate response quality
            if (!result.response || result.response.trim().length < 20) {
              console.warn(`[RagService] ⚠️ Short response received for ${platform}/${username}: ${result.response?.substring(0, 50)}`);
            }

            return {
              response: result.response || 'Unable to generate response at this time.',
              usedFallback: result.usedFallback || false,
              usingFallbackProfile: result.usingFallbackProfile || false,
              enhancedContext: result.enhancedContext || false,
              quotaInfo: result.quotaInfo || null
            };

          } catch (error: any) {
            console.error(`[RagService] 🚨 Error calling ${serverUrl}:`, {
              error: error.message,
              status: error.response?.status,
              data: error.response?.data
            });
            
            // Enhanced error reporting for debugging
            if (error.response?.status === 500) {
              console.error(`[RagService] 💥 Server error details:`, error.response.data);
            }
            
            throw error;
          }
        },
        this.RAG_SERVER_URLS,
        2 // Retry twice
      );
    }, true);
  }
  
  /**
   * Detects if the response contains enhanced context from ChromaDB
   */
  private static detectEnhancedContext(response: string): boolean {
    if (!response || response.length < 50) return false;
    
    // Look for indicators of enhanced context
    const enhancedIndicators = [
      'based on your profile data',
      'according to your posts',
      'from your content analysis',
      'based on your engagement',
      'from your account insights',
      'based on your posting patterns',
      'from your audience data',
      'based on your content themes',
      'from your performance metrics',
      'based on your social media strategy',
      'from your account analytics',
      'based on your content performance',
      'from your engagement metrics',
      'based on your audience insights',
      'from your posting history'
    ];
    
    const lowerResponse = response.toLowerCase();
    const hasEnhancedIndicators = enhancedIndicators.some(indicator => 
      lowerResponse.includes(indicator.toLowerCase())
    );
    
    // Also check for specific data references
    const hasDataReferences = /\d+ (followers|posts|engagement|likes|comments|shares)/i.test(response);
    
    // Check for platform-specific insights
    const hasPlatformInsights = /(instagram|twitter|facebook|social media) (strategy|insights|analysis|performance)/i.test(response);
    
    return hasEnhancedIndicators || hasDataReferences || hasPlatformInsights;
  }
  
  /**
   * Sends a post generation query to the RAG server directly
   */
  static async sendPostQuery(
    username: string, 
    query: string, 
    platform: string = 'instagram'
  ): Promise<PostGenerationResponse> {
    let lastError: any = null;
    
    try {
      if (this.VERBOSE_LOGGING) {
      console.log(`[RagService] Starting post generation for ${platform}/${username}: "${query}"`);
      console.log(`[RagService] Step 1/4: Initiating request to RAG server`);
      }
      
      const response = await this.tryServerUrls(`/api/rag/post-generator`, (url) => 
        axios.post(url, {
          username,
          query,
          platform
        }, {
          timeout: 180000, // 3 minute timeout for image generation + queueing
          withCredentials: false, // Disable sending cookies
          headers: {
            'Content-Type': 'application/json'
          }
        }), this.RAG_SERVER_URLS
      );
      
      // Process the result
      if (this.VERBOSE_LOGGING) {
      console.log(`[RagService] Post generation completed successfully`);
      }
      
      // ✅ INCREMENT USAGE: Only count when image generator API is actually called
      try {
        const usageResponse = await fetch(`/api/usage/increment/${platform}/${username}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'posts', count: 1 })
        });
        
        if (usageResponse.ok) {
          console.log(`[RagService] ✅ Usage incremented for ${platform}/${username} - post generation`);
        } else {
          console.warn(`[RagService] ⚠️ Failed to increment usage:`, await usageResponse.text());
        }
      } catch (usageError) {
        console.warn(`[RagService] ⚠️ Usage tracking failed:`, usageError);
      }
      
      // Format the response for easier use by the UI
      const postData: PostData = {
        ...response.data.post,
        status: 'ready',
        generatedAt: new Date().toISOString(),
        queryUsed: query
      };
      
      // EMIT EVENT: Notify PostCooked component to refresh
      try {
        const newPostEvent = new CustomEvent('newPostCreated', {
          detail: {
            username,
            platform,
            timestamp: postData.timestamp || Date.now(),
            success: true
          }
        });
        window.dispatchEvent(newPostEvent);
        if (this.VERBOSE_LOGGING) {
        console.log(`[RagService] Emitted newPostCreated event for ${platform}/${username}`);
        }
      } catch (eventError) {
        console.warn('[RagService] Failed to emit newPostCreated event:', eventError);
      }
      
      return {
        success: true,
        message: 'Post generated successfully',
        post: postData
      };
    } catch (error: any) {
      lastError = error;
      console.error('[RagService] Post generation error:', error.response?.data || error.message);
      
      // Check if the error is a "connection closed" or "network error" type 
      // that happens after the server has started processing our request
      const isNetworkErrorAfterProcessingStarted = 
        error.code === 'ERR_NETWORK' && 
        error.message === 'Network Error' &&
        error.response === undefined;
        
      // If this is a network error that might happen after the server already started
      // generating the image, we can provide a more optimistic message
      if (isNetworkErrorAfterProcessingStarted) {
        if (this.VERBOSE_LOGGING) {
        console.log('[RagService] Network error occurred, but the server may still be processing the request');
        }
        return {
          success: false,
          error: 'Connection interrupted, but the post may still be processing. Please check the Posts section.',
          message: 'Connection interrupted during generation',
          details: error.message
        };
      }
      
      // Provide more specific error messaging based on where the failure occurred
      let errorMessage = 'Failed to generate post';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Post generation timed out. Please try again.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to generate post',
        details: error.message
      };
    }
  }
  
  /**
   * Loads the conversation history for a user from the RAG server directly
   */
  static async loadConversations(
    username: string, 
    platform: string = 'instagram'
  ): Promise<ChatMessage[]> {
    try {
      const response = await this.tryServerUrls(`/api/rag/conversations/${username}?platform=${platform}`, (url) => 
        axios.get(url, {
          timeout: 10000, // 10 second timeout
          withCredentials: false, // Disable sending cookies
        }), this.RAG_SERVER_URLS
      );
      return response.data.messages || [];
    } catch (error: any) {
      console.error('[RagService] Failed to load conversations:', error.response?.data || error.message);
      return [];
    }
  }
  
  /**
   * Saves the conversation history for a user to the RAG server directly
   */
  static async saveConversation(
    username: string, 
    messages: ChatMessage[], 
    platform: string = 'instagram'
  ): Promise<void> {
    try {
      await this.tryServerUrls(`/api/rag/conversations/${username}`, (url) => 
        axios.post(url, {
          messages,
          platform
        }, {
          timeout: 10000, // 10 second timeout
          withCredentials: false, // Disable sending cookies
          headers: {
            'Content-Type': 'application/json'
          }
        }), this.RAG_SERVER_URLS
      );
    } catch (error: any) {
      console.error('[RagService] Failed to save conversation:', error.response?.data || error.message);
    }
  }
  
  /**
   * Fetches AI replies for a user from the main server
   */
  static async fetchAIReplies(
    username: string,
    platform: string = 'instagram'
  ): Promise<any[]> {
    const cacheKey = `ai_replies_${platform}_${username}`;
    
    // Add validation for username
    if (!username || typeof username !== 'string' || username.trim() === '') {
      console.error(`[RagService] Invalid username provided to fetchAIReplies: "${username}"`);
      return [];
    }
    
    return await this.deduplicatedRequest(
      cacheKey,
      async () => {
        try {
          console.log(`[RagService] Fetching AI replies for ${platform}/${username}`);
          
          return await this.tryServerUrls(`/ai-replies/${username}?platform=${platform}`, (url) => {
            console.log(`[RagService] Trying URL: ${url}`);
            return axios.get(url, {
              timeout: 10000,
              withCredentials: false,
              headers: {
                'Accept': 'application/json'
              }
            });
          }, this.AI_REPLIES_URLS
          ).then(response => {
            console.log(`[RagService] Retrieved ${response.data.replies?.length || 0} AI replies for ${platform}/${username}`);
            return response.data.replies || [];
          });
          
        } catch (error: any) {
          console.error('[RagService] Failed to fetch AI replies:', error.response?.data || error.message);
          return [];
        }
      },
      true // Use cache for AI replies
    );
  }

  /**
   * Sends an instant AI reply request directly to the main server
   * This bypasses the proxy server to reduce CORS issues
   */
  static async sendInstantAIReply(
    userId: string, 
    username: string,
    conversation: { role: string; content: string }[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      sender_id?: string;
      message_id?: string;
      platform?: string;
    }
  ): Promise<any> {
    const platform = options?.platform || 'instagram';

    // Validate sender_id if provided
    if (options?.sender_id) {
      // Instagram IDs are typically numeric, Twitter IDs can be alphanumeric
      if (platform === 'instagram' && !/^[0-9]+$/.test(options.sender_id)) {
        console.warn(`[RagService] Invalid Instagram sender_id format: ${options.sender_id}`);
      } else if (platform === 'twitter' && !/^[a-zA-Z0-9_]+$/.test(options.sender_id)) {
        console.warn(`[RagService] Invalid Twitter sender_id format: ${options.sender_id}`);
      }
    }

    // Format the request as a notification object that the server expects
    const userMessage = conversation && conversation.length > 0 ? conversation[0].content : '';
    const notification = {
      type: 'message',
      instagram_user_id: platform === 'instagram' ? userId : undefined,
      twitter_user_id: platform === 'twitter' ? userId : undefined,
      facebook_user_id: platform === 'facebook' ? userId : undefined,
      sender_id: options?.sender_id,
      message_id: options?.message_id,
      text: userMessage,
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      status: 'pending',
      platform
    };

    try {
      if (this.VERBOSE_LOGGING) {
        console.log(`[RagService] Trying to send instant ${platform} AI reply via /api/instant-reply`);
      }
      
      // Use relative URL to avoid DNS resolution issues
      const timestamp = Date.now();
      const response = await axios.post(
        getApiUrl('/api/instant-reply'),
        {
          username,
          notification
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          withCredentials: false, // Important for CORS
          timeout: 30000, // 30 second timeout
        }
      );

      if (!response.data) {
        throw new Error('No data returned from RAG service');
      }

      // Log successful response
      if (this.VERBOSE_LOGGING) {
        console.log(`[RagService] Successfully received ${platform} response from RAG server`);
      }
      return response.data;
    } catch (error: any) {
      console.error(`[RagService] Failed to send instant ${platform} AI reply:`, error.message || 'Unknown error');
      
      // Check if this is a CORS error
      if (error.message?.includes('CORS') || error.message?.includes('Network Error')) {
        console.error('[RagService] Possible CORS issue detected');
      }
      
      // Check if this is a specific error about sender_id format
      if (error.response?.data?.error?.includes('sender_id')) {
        const errorMessage = error.response.data.error || 'Invalid sender ID format';
        console.error(`[RagService] Sender ID validation error:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      throw error;
    }
  }
}

export default RagService; 