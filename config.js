// Production configuration to remove console logs
// Based on best practices from https://dev.to/kevinlien/the-simple-way-to-remove-js-console-logs-in-production-ene

// Disable console.log in production environment
if (process.env.NODE_ENV === 'production') {
  console.log = function () {};
  console.info = function () {};
  console.debug = function () {};
  // Keep console.warn and console.error for important issues
}

// Export configuration flags
export const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
export const VERBOSE_LOGGING = process.env.NODE_ENV === 'development' && process.env.VERBOSE === 'true';

// Console spam prevention for development
if (process.env.NODE_ENV === 'development') {
  const originalLog = console.log;
  const logBuffer = new Map();
  const LOG_THROTTLE_MS = 1000; // Prevent same message more than once per second
  
  console.log = function(...args) {
    const message = args.join(' ');
    const now = Date.now();
    
    if (logBuffer.has(message)) {
      const lastLog = logBuffer.get(message);
      if (now - lastLog < LOG_THROTTLE_MS) {
        return; // Throttle duplicate messages
      }
    }
    
    logBuffer.set(message, now);
    
    // Clean old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [msg, timestamp] of logBuffer.entries()) {
        if (now - timestamp > LOG_THROTTLE_MS * 10) {
          logBuffer.delete(msg);
        }
      }
    }
    
    originalLog.apply(console, args);
  };
} 