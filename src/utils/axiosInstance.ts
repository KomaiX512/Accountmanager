// 🚀 CENTRALIZED AXIOS INSTANCE - ELIMINATES 43 DUPLICATE IMPORTS
import axios from 'axios';

// Create a single axios instance with optimized defaults
const axiosInstance = axios.create({
  // Use relative URLs for better performance
  baseURL: '/api',
  timeout: 15000, // 15 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for performance optimization
axiosInstance.interceptors.request.use(
  (config: any) => {
    // Add timestamp for performance tracking
    config.metadata = { startTime: Date.now() };
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling and performance tracking
axiosInstance.interceptors.response.use(
  (response: any) => {
    // Log performance metrics for optimization
    const endTime = Date.now();
    const duration = endTime - (response.config.metadata?.startTime || endTime);
    if (duration > 5000) {
      console.warn(`Slow API call detected: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    // Enhanced error handling
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout:', error.config?.url);
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
