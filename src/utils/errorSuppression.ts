/**
 * Centralized error suppression and logging system
 * Reduces console noise while maintaining error visibility for debugging
 */

// Track repeated errors to avoid spam
const errorCounts = new Map<string, { count: number; lastSeen: number }>();
const ERROR_COOLDOWN = 5000; // 5 seconds
const MAX_SAME_ERROR_LOGS = 3;

/**
 * Smart console.warn that suppresses repeated messages
 */
export function smartWarn(message: string, data?: any): void {
  const key = message + (data ? JSON.stringify(data).substring(0, 50) : '');
  const now = Date.now();
  const existing = errorCounts.get(key);
  
  if (!existing || now - existing.lastSeen > ERROR_COOLDOWN) {
    // Reset or new error
    errorCounts.set(key, { count: 1, lastSeen: now });
    console.warn(message, data);
  } else if (existing.count < MAX_SAME_ERROR_LOGS) {
    // Still within limit
    existing.count++;
    existing.lastSeen = now;
    console.warn(message, data);
  } else if (existing.count === MAX_SAME_ERROR_LOGS) {
    // Just hit limit, show suppression message
    existing.count++;
    existing.lastSeen = now;
    console.warn(`${message} (suppressing further identical warnings)`, data);
  }
  // Otherwise suppress
}

/**
 * Smart console.error that suppresses repeated messages
 */
export function smartError(message: string, data?: any): void {
  const key = message + (data ? JSON.stringify(data).substring(0, 50) : '');
  const now = Date.now();
  const existing = errorCounts.get(key);
  
  if (!existing || now - existing.lastSeen > ERROR_COOLDOWN) {
    errorCounts.set(key, { count: 1, lastSeen: now });
    console.error(message, data);
  } else if (existing.count < MAX_SAME_ERROR_LOGS) {
    existing.count++;
    existing.lastSeen = now;
    console.error(message, data);
  } else if (existing.count === MAX_SAME_ERROR_LOGS) {
    existing.count++;
    existing.lastSeen = now;
    console.error(`${message} (suppressing further identical errors)`, data);
  }
}

/**
 * Check if API response has expected structure without logging warnings
 */
export function hasValidArrayData(data: any): boolean {
  return Array.isArray(data) || 
         (data && typeof data === 'object' && (
           Array.isArray(data.recommendations) || 
           Array.isArray(data.items) || 
           Array.isArray(data.notifications)
         ));
}

/**
 * Extract array from API response or return empty array
 */
export function extractArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.recommendations)) return data.recommendations;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.notifications)) return data.notifications;
  }
  return [];
}

// Clean up old error tracking entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of errorCounts.entries()) {
    if (now - entry.lastSeen > ERROR_COOLDOWN * 3) {
      errorCounts.delete(key);
    }
  }
}, ERROR_COOLDOWN);
