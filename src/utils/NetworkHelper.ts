/**
 * Network Helper Utility
 * Provides robust network request handling with retry logic and error recovery
 */

export interface NetworkConfig {
  timeout: number;
  maxRetries: number;
  backoffBase: number;
  maxBackoffDelay: number;
}

export interface NetworkError {
  type: 'timeout' | 'network' | 'server' | 'abort' | 'unknown';
  message: string;
  status?: number;
  retryable: boolean;
}

export class NetworkHelper {
  private static defaultConfig: NetworkConfig = {
    timeout: 30000,        // 30 seconds
    maxRetries: 3,         // 3 attempts
    backoffBase: 1000,     // 1 second base delay
    maxBackoffDelay: 10000 // 10 seconds max delay
  };

  /**
   * Classify network errors for better handling
   */
  private static classifyError(error: any): NetworkError {
    // AbortError from timeout
    if (error.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'Request timed out',
        retryable: true
      };
    }

    // TypeError usually indicates network issues
    if (error.name === 'TypeError') {
      return {
        type: 'network',
        message: 'Network connection error',
        retryable: true
      };
    }

    // Server errors
    if (error.message?.includes('HTTP')) {
      const statusMatch = error.message.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;
      
      return {
        type: 'server',
        message: error.message,
        status,
        retryable: status >= 500 // Only retry server errors (5xx)
      };
    }

    // Network-related errors
    if (error.message?.includes('NetworkError') || 
        error.message?.includes('fetch') ||
        error.message?.includes('ECONNREFUSED')) {
      return {
        type: 'network',
        message: error.message || 'Network error',
        retryable: true
      };
    }

    // Unknown errors
    return {
      type: 'unknown',
      message: error.message || 'Unknown error',
      retryable: false
    };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private static calculateRetryDelay(attempt: number, config: NetworkConfig): number {
    const delay = config.backoffBase * Math.pow(2, attempt - 1);
    return Math.min(delay, config.maxBackoffDelay);
  }

  /**
   * Robust fetch with timeout and retry logic
   */
  static async robustFetch(
    url: string, 
    options: RequestInit = {}, 
    config: Partial<NetworkConfig> = {}
  ): Promise<Response> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), finalConfig.timeout);
        
        // Merge abort signal with existing options
        const requestOptions: RequestInit = {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers
          },
          cache: 'no-store' // Prevent caching issues
        };

        console.log(`[NetworkHelper] Attempting fetch to ${url} (attempt ${attempt}/${finalConfig.maxRetries})`);
        
        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log(`[NetworkHelper] ✅ Successful fetch to ${url} on attempt ${attempt}`);
        return response;
        
      } catch (error: any) {
        const networkError = this.classifyError(error);
        
        console.error(`[NetworkHelper] ❌ Fetch failed (attempt ${attempt}/${finalConfig.maxRetries}):`, {
          url,
          error: networkError,
          attempt,
          maxRetries: finalConfig.maxRetries
        });
        
        // If this is the last attempt or error is not retryable, throw
        if (attempt === finalConfig.maxRetries || !networkError.retryable) {
          throw error;
        }
        
        // Calculate retry delay
        const retryDelay = this.calculateRetryDelay(attempt, finalConfig);
        console.log(`[NetworkHelper] 🔄 Retrying in ${retryDelay}ms...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Fetch with automatic JSON parsing and error handling
   */
  static async fetchJson<T = any>(
    url: string, 
    options: RequestInit = {}, 
    config: Partial<NetworkConfig> = {}
  ): Promise<T> {
    const response = await this.robustFetch(url, options, config);
    
    try {
      return await response.json();
    } catch (error) {
      console.error(`[NetworkHelper] ❌ JSON parsing failed for ${url}:`, error);
      throw new Error(`Invalid JSON response from ${url}`);
    }
  }

  /**
   * Check if error is network-related and retryable
   */
  static isNetworkError(error: any): boolean {
    const networkError = this.classifyError(error);
    return networkError.type === 'network' || networkError.type === 'timeout';
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error: any): string {
    const networkError = this.classifyError(error);
    
    switch (networkError.type) {
      case 'timeout':
        return 'Request timed out. Please check your connection and try again.';
      case 'network':
        return 'Network connection error. Please check your internet connection.';
      case 'server':
        return `Server error (${networkError.status}). Please try again later.`;
      default:
        return networkError.message || 'An unexpected error occurred.';
    }
  }
}
