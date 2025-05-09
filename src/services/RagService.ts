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
axios.defaults.timeout = 30000; // 30 second default timeout

// Add a request interceptor for better error handling
axios.interceptors.request.use(
  config => {
    // Log each request
    console.log(`[Axios] Sending ${config.method?.toUpperCase()} request to ${config.url}`);
    
    // Ensure content type is set for all POST requests
    if (config.method === 'post') {
      config.headers['Content-Type'] = 'application/json';
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
    console.log(`[Axios] Received ${response.status} response from ${response.config.url}`);
    return response;
  },
  error => {
    if (error.code === 'ECONNABORTED') {
      console.error('[Axios] Request timeout:', error.message);
    } else if (error.code === 'ERR_NETWORK') {
      console.error('[Axios] Network error:', error.message);
    } else {
      console.error('[Axios] Response error:', error.message);
    }
    return Promise.reject(error);
  }
);

class RagService {
  // Accept both localhost and 127.0.0.1 to handle different browser security policies
  private static readonly MAIN_SERVER_URLS = [
    'http://127.0.0.1:3002',
    'http://localhost:3002'
  ];
  
  /**
   * Try to send a request to one of the server URLs
   */
  private static async tryServerUrls<T>(
    endpoint: string, 
    requestFn: (url: string) => Promise<T>
  ): Promise<T> {
    // Try each URL in order until one works
    let lastError: any = null;
    
    for (const baseUrl of this.MAIN_SERVER_URLS) {
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
      
      return await this.tryServerUrls(`/rag-discussion/${username}`, (url) => 
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
      
      const response = await this.tryServerUrls(`/rag-post/${username}`, (url) => 
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
      const response = await this.tryServerUrls(`/rag-conversations/${username}`, (url) => 
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
      await this.tryServerUrls(`/rag-conversations/${username}`, (url) => 
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
}

export default RagService; 