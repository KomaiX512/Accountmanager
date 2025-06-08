import axios from 'axios';

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
axios.defaults.timeout = 15000; // Reduced from 30 seconds to 15 seconds

// Extend axios config type to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      requestId: string;
      startTime: number;
    };
  }
}

// Add a request interceptor for better error handling
axios.interceptors.request.use(
  config => {
    // Log each request with a request ID to track infinite loops
    const requestId = Math.random().toString(36).substr(2, 9);
    config.metadata = { requestId, startTime: Date.now() };
    console.log(`[Axios][${requestId}] Sending ${config.method?.toUpperCase()} request to ${config.url}`);
    
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
    console.error('[Axios] Request error:', error);
    return Promise.reject(error);
  }
);

// Add a response interceptor for better error handling
axios.interceptors.response.use(
  response => {
    const requestId = response.config.metadata?.requestId || 'unknown';
    const duration = Date.now() - (response.config.metadata?.startTime || Date.now());
    console.log(`[Axios][${requestId}] Received ${response.status} response from ${response.config.url} (${duration}ms)`);
    return response;
  },
  error => {
    const requestId = error.config?.metadata?.requestId || 'unknown';
    const duration = Date.now() - (error.config?.metadata?.startTime || Date.now());
    
    if (error.code === 'ECONNABORTED') {
      console.error(`[Axios][${requestId}] Request timeout after ${duration}ms:`, error.message);
    } else if (error.code === 'ERR_NETWORK') {
      console.error(`[Axios][${requestId}] Network error after ${duration}ms:`, error.message);
    } else {
      console.error(`[Axios][${requestId}] Response error after ${duration}ms:`, error.message);
    }
    return Promise.reject(error);
  }
);

class RagService {
  // Accept both localhost and 127.0.0.1 to handle different browser security policies
  private static readonly MAIN_SERVER_URLS = [
    'http://127.0.0.1:3000',  // Use port 3000 for direct server access
    'http://localhost:3000'   // This is the main server with all endpoints
  ];
  
  private static readonly PROXY_SERVER_URLS = [
    'http://127.0.0.1:3000',
    'http://localhost:3000'
  ];
  
  /**
   * Try to send a request to one of the server URLs
   */
  private static async tryServerUrls<T>(
    endpoint: string, 
    requestFn: (url: string) => Promise<T>,
    serverUrlList: string[] = this.MAIN_SERVER_URLS
  ): Promise<T> {
    // Try each URL in order until one works
    let lastError: any = null;
    
    for (const baseUrl of serverUrlList) {
      try {
        const fullUrl = `${baseUrl}${endpoint}`;
        console.log(`[RagService] Attempting request to ${fullUrl}`);
        return await requestFn(fullUrl);
      } catch (error: any) {
        console.warn(`[RagService] Failed with ${baseUrl}, trying next URL:`, error.message);
        lastError = error;
      }
    }
    
    // If we get here, all URLs failed
    console.error('[RagService] All server URLs failed:', lastError);
    throw lastError;
  }
  
  /**
   * Sends a discussion query to the RAG server via the main server proxy
   */
  static async sendDiscussionQuery(
    username: string, 
    query: string, 
    previousMessages: ChatMessage[] = []
  ): Promise<{ response: string }> {
    try {
      console.log(`[RagService] Sending discussion query for ${username}: "${query}"`);
      
      return await this.tryServerUrls(`/api/rag-discussion/${username}`, (url) => 
        axios.post(url, {
          query,
          previousMessages
        }, {
          timeout: 30000, // 30 second timeout
          withCredentials: false, // Disable sending cookies
          headers: {
            'Content-Type': 'application/json'
          }
        })
      ).then(response => response.data);
      
    } catch (error: any) {
      console.error('[RagService] Discussion query error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to process discussion query');
    }
  }
  
  /**
   * Sends a post generation query to the RAG server via the main server proxy
   */
  static async sendPostQuery(username: string, query: string): Promise<PostGenerationResponse> {
    let lastError: any = null;
    
    try {
      console.log(`[RagService] Starting post generation for ${username}: "${query}"`);
      
      // Update UI with initial status
      console.log(`[RagService] Step 1/4: Initiating request to RAG server`);
      
      const response = await this.tryServerUrls(`/api/rag-post/${username}`, (url) => 
        axios.post(url, {
          query
        }, {
          timeout: 60000, // 60 second timeout for image generation
          withCredentials: false, // Disable sending cookies
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );
      
      // Process the result
      console.log(`[RagService] Post generation completed successfully`);
      
      // Format the response for easier use by the UI
      const postData: PostData = {
        ...response.data.post,
        status: 'ready',
        generatedAt: new Date().toISOString(),
        queryUsed: query
      };
      
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
        console.log('[RagService] Network error occurred, but the server may still be processing the request');
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
   * Loads the conversation history for a user via the main server proxy
   */
  static async loadConversations(username: string): Promise<ChatMessage[]> {
    try {
      const response = await this.tryServerUrls(`/api/rag-conversations/${username}`, (url) => 
        axios.get(url, {
          timeout: 10000, // 10 second timeout
          withCredentials: false, // Disable sending cookies
        })
      );
      return response.data.messages || [];
    } catch (error: any) {
      console.error('[RagService] Failed to load conversations:', error.response?.data || error.message);
      return [];
    }
  }
  
  /**
   * Saves the conversation history for a user via the main server proxy
   */
  static async saveConversation(username: string, messages: ChatMessage[]): Promise<void> {
    try {
      await this.tryServerUrls(`/api/rag-conversations/${username}`, (url) => 
        axios.post(url, {
          messages
        }, {
          timeout: 10000, // 10 second timeout
          withCredentials: false, // Disable sending cookies
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );
    } catch (error: any) {
      console.error('[RagService] Failed to save conversation:', error.response?.data || error.message);
    }
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
    }
  ): Promise<any> {
    const urls = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    let lastError = null;

    // Validate sender_id if provided
    if (options?.sender_id) {
      // Instagram IDs are typically numeric
      if (!/^[0-9]+$/.test(options.sender_id)) {
        console.warn(`[RagService] Invalid sender_id format: ${options.sender_id}`);
        // Don't throw, just log warning - we can still generate the response
      }
    }

    // Format the request as a notification object that the server expects
    const userMessage = conversation && conversation.length > 0 ? conversation[0].content : '';
    const notification = {
      type: 'message',
      instagram_user_id: userId,
      sender_id: options?.sender_id,
      message_id: options?.message_id,
      text: userMessage,
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      status: 'pending'
    };

    for (const baseUrl of urls) {
      try {
        console.log(`[RagService] Trying to send instant AI reply via ${baseUrl}/api/rag-instant-reply/${username}`);
        
        // Add validation headers to ensure the request is properly handled
        const response = await axios.post(
          `${baseUrl}/api/rag-instant-reply/${username}`,
          notification,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            withCredentials: false, // Important for CORS
            timeout: 30000, // 30 second timeout
          }
        );

        if (!response.data) {
          throw new Error('No data returned from RAG service');
        }

        // Log successful response
        console.log(`[RagService] Successfully received response from ${baseUrl}`);
        return response.data;
      } catch (error: any) {
        console.error(`[RagService] Failed with ${baseUrl}, trying next URL:`, error.message || 'Unknown error');
        
        // Check if this is a CORS error
        if (error.message?.includes('CORS') || error.message?.includes('Network Error')) {
          console.error('[RagService] Possible CORS issue detected');
        }
        
        // Check if this is a specific error about sender_id format
        if (error.response?.data?.error?.includes('sender_id')) {
          const errorMessage = error.response.data.error || 'Invalid sender ID format';
          console.error(`[RagService] Sender ID validation error:`, errorMessage);
          throw new Error(errorMessage); // Don't try other URLs, this is a data validation issue
        }
        
        lastError = error;
      }
    }

    // If we got here, all URLs failed
    throw lastError || new Error('Failed to connect to any RAG service endpoint');
  }
}

export default RagService; 