import axios from 'axios';

interface ChatMessage {
  role: string;
  content: string;
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
  private static readonly MAIN_SERVER_URL = 'http://127.0.0.1:3002';
  
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
      
      const response = await axios.post(`${this.MAIN_SERVER_URL}/rag-discussion/${username}`, {
        query,
        previousMessages
      }, {
        timeout: 30000, // 30 second timeout
        withCredentials: false, // Disable sending cookies
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error: any) {
      console.error('[RagService] Discussion query error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to process discussion query');
    }
  }
  
  /**
   * Sends a post generation query to the RAG server via the main server proxy
   */
  static async sendPostQuery(username: string, query: string): Promise<string> {
    try {
      console.log(`[RagService] Sending post query for ${username}: "${query}"`);
      
      const response = await axios.post(`${this.MAIN_SERVER_URL}/rag-post/${username}`, {
        query
      }, {
        timeout: 30000, // 30 second timeout
        withCredentials: false, // Disable sending cookies
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.data.response;
    } catch (error: any) {
      console.error('[RagService] Post query error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to process post query');
    }
  }
  
  /**
   * Loads the conversation history for a user via the main server proxy
   */
  static async loadConversations(username: string): Promise<ChatMessage[]> {
    try {
      const response = await axios.get(`${this.MAIN_SERVER_URL}/rag-conversations/${username}`, {
        timeout: 10000, // 10 second timeout
        withCredentials: false, // Disable sending cookies
      });
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
      await axios.post(`${this.MAIN_SERVER_URL}/rag-conversations/${username}`, {
        messages
      }, {
        timeout: 10000, // 10 second timeout
        withCredentials: false, // Disable sending cookies
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error: any) {
      console.error('[RagService] Failed to save conversation:', error.response?.data || error.message);
    }
  }
}

export default RagService; 