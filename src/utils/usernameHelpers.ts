/**
 * Username Helpers - Distinguishes between Dashboard and Connected usernames
 * 
 * IMPORTANT: There are two distinct types of usernames in the system:
 * 
 * 1. Dashboard Username (accountHolder):
 *    - Entered during platform setup/entry
 *    - Used for AI content: strategies, posts, competitor analysis
 *    - Stored in: localStorage `${platform}_username_${uid}`
 * 
 * 2. Connected Platform Username:
 *    - Obtained when connecting actual social media accounts
 *    - Used for platform operations: DMs, scheduling, insights, notifications
 *    - Retrieved from context hooks: igUserId, twitterId, facebookPageId
 */

export type Platform = 'instagram' | 'twitter' | 'facebook' | 'linkedin';

/**
 * Gets the dashboard username (accountHolder) for AI content operations
 * Use this for: strategies, posts, competitor analysis
 */
export const getDashboardUsername = (platform: Platform, userId: string): string | null => {
  try {
    return localStorage.getItem(`${platform}_username_${userId}`) || null;
  } catch (error) {
    console.error(`[usernameHelpers] Error getting dashboard username for ${platform}:`, error);
    return null;
  }
};

/**
 * Gets the connected platform username for social media operations
 * Use this for: DMs, scheduling, insights, notifications
 * Note: This should be retrieved from the appropriate context hooks in components
 */
export const getConnectedUsernameFromContext = (
  platform: Platform,
  igUserId?: string,
  twitterId?: string,
  facebookPageId?: string
): string | null => {
  switch (platform) {
    case 'instagram':
      return igUserId || null;
    case 'twitter':
      return twitterId || null;
    case 'facebook':
      return facebookPageId || null;
    default:
      return null;
  }
};

/**
 * Validates that the correct username type is being used for the given operation
 */
export const validateUsernameForOperation = (
  operation: 'ai-content' | 'platform-operation',
  username: string | null,
  platform: Platform
): boolean => {
  if (!username) {
    console.warn(`[usernameHelpers] No username provided for ${operation} on ${platform}`);
    return false;
  }

  // For now, just log which type should be used
  const expectedType = operation === 'ai-content' ? 'Dashboard Username' : 'Connected Platform Username';
  console.log(`[usernameHelpers] Using ${expectedType} "${username}" for ${operation} on ${platform}`);
  
  return true;
};

/**
 * Helper to build API URLs with the correct username type
 */
export const buildAPIUrl = (
  operation: 'strategies' | 'posts' | 'competitor-analysis' | 'notifications' | 'scheduling' | 'insights',
  username: string,
  platform: Platform,
  additionalParams?: Record<string, string>
): string => {
  const baseParams = `platform=${platform}`;
  const extraParams = additionalParams 
    ? '&' + Object.entries(additionalParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '';

  const operationType = ['strategies', 'posts', 'competitor-analysis'].includes(operation) 
    ? 'ai-content' 
    : 'platform-operation';
    
  validateUsernameForOperation(operationType, username, platform);

  switch (operation) {
    case 'strategies':
      return `/api/retrieve-strategies/${username}?${baseParams}${extraParams}`;
    case 'posts':
      return `/api/posts/${username}?${baseParams}${extraParams}`;
    case 'competitor-analysis':
      return `/api/retrieve-multiple/${username}?${baseParams}${extraParams}`;
    case 'notifications':
      return `/events-list/${username}?${baseParams}${extraParams}`;
    case 'scheduling':
    case 'insights':
      return `/api/${operation}/${username}?${baseParams}${extraParams}`;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
};

/**
 * Migration helper to identify and fix username mismatches
 */
export const debugUsernameMismatch = (platform: Platform, userId: string): void => {
  const dashboardUsername = getDashboardUsername(platform, userId);
  
  console.group(`[usernameHelpers] Username Debug for ${platform}`);
  console.log(`Dashboard Username (for AI content): ${dashboardUsername}`);
  console.log(`Use Dashboard Username for: strategies, posts, competitor analysis`);
  console.log(`Use Connected Username for: DMs, scheduling, insights, notifications`);
  console.log(`Dashboard Username stored in: localStorage["${platform}_username_${userId}"]`);
  console.groupEnd();
};
