// Facebook Session Manager
// Utility functions for managing Facebook connection session data

// Storage key prefixes
export const FB_USER_ID_KEY_PREFIX = 'facebook_user_id_';
export const FB_PAGE_ID_KEY_PREFIX = 'facebook_page_id_';
// ✅ CRITICAL FIX: Separate connected username from dashboard username
export const FB_CONNECTED_USERNAME_KEY_PREFIX = 'facebook_connected_username_';
export const FB_USERNAME_KEY_PREFIX = 'facebook_username_'; // Dashboard username - never overwrite
export const FB_TOKEN_KEY_PREFIX = 'facebook_token_';
export const FB_DISCONNECTED_KEY_PREFIX = 'facebook_disconnected_';

/**
 * Helper function to create user-specific storage keys
 * @param prefix The key prefix
 * @param authUserId The authenticated user ID
 * @returns User-specific storage key or null if invalid
 */
const getUserSpecificKey = (prefix: string, authUserId: string): string | null => {
  if (!authUserId || typeof authUserId !== 'string' || authUserId.trim() === '') {
    console.error('Invalid authUserId provided to getUserSpecificKey');
    return null;
  }
  return `${prefix}${authUserId}`;
};

/**
 * Stores Facebook connection data for a specific user
 * @param userId Facebook user ID
 * @param pageId Facebook page ID
 * @param username Facebook username/page name
 * @param authUserId The authenticated user ID to bind this connection to
 * @returns True if storage was successful, false otherwise
 */
export const storeFacebookConnection = (
  userId: string,
  pageId: string,
  username: string | undefined,
  authUserId: string
): boolean => {
  if (!authUserId) return false;
  
  const userIdKey = getUserSpecificKey(FB_USER_ID_KEY_PREFIX, authUserId);
  const pageIdKey = getUserSpecificKey(FB_PAGE_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(FB_USERNAME_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(FB_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !pageIdKey || !usernameKey || !disconnectedKey) return false;
  
  try {
    // Store in both localStorage and sessionStorage for redundancy
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(pageIdKey, pageId);
    if (username) localStorage.setItem(usernameKey, username);
    
    // Clear the disconnected flag when we're actively connecting
    localStorage.removeItem(disconnectedKey);
    
    sessionStorage.setItem(userIdKey, userId);
    sessionStorage.setItem(pageIdKey, pageId);
    if (username) sessionStorage.setItem(usernameKey, username);
    sessionStorage.removeItem(disconnectedKey);
    
    console.log(`[${new Date().toISOString()}] Stored Facebook connection for auth user ${authUserId}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing Facebook connection:`, error);
    return false;
  }
};

/**
 * Retrieves Facebook connection data for a specific user
 * @param authUserId The authenticated user ID to get connection data for
 * @returns Connection data object or null if not found
 */
export const getFacebookConnection = (authUserId: string): { facebook_user_id: string; facebook_page_id: string; username?: string } | null => {
  if (!authUserId) return null;
  
  const userIdKey = getUserSpecificKey(FB_USER_ID_KEY_PREFIX, authUserId);
  const pageIdKey = getUserSpecificKey(FB_PAGE_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(FB_USERNAME_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(FB_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !pageIdKey || !usernameKey || !disconnectedKey) return null;
  
  try {
    // Check if the user has explicitly disconnected Facebook
    const isDisconnected = localStorage.getItem(disconnectedKey) === 'true' || 
                          sessionStorage.getItem(disconnectedKey) === 'true';
    
    if (isDisconnected) {
      console.log(`[${new Date().toISOString()}] User ${authUserId} has previously disconnected Facebook, not reconnecting automatically`);
      return null;
    }
    
    // Try sessionStorage first, then fallback to localStorage
    const userId = sessionStorage.getItem(userIdKey) || localStorage.getItem(userIdKey);
    const pageId = sessionStorage.getItem(pageIdKey) || localStorage.getItem(pageIdKey);
    const username = sessionStorage.getItem(usernameKey) || localStorage.getItem(usernameKey) || undefined;
    
    if (!userId || !pageId) return null;
    
    return { facebook_user_id: userId, facebook_page_id: pageId, username };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving Facebook connection:`, error);
    return null;
  }
};

/**
 * Clears Facebook connection data for a specific user
 * @param authUserId The authenticated user ID to clear connection data for
 */
export const clearFacebookConnection = (authUserId: string): void => {
  if (!authUserId) return;
  
  const userIdKey = getUserSpecificKey(FB_USER_ID_KEY_PREFIX, authUserId);
  const pageIdKey = getUserSpecificKey(FB_PAGE_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(FB_USERNAME_KEY_PREFIX, authUserId);
  const tokenKey = getUserSpecificKey(FB_TOKEN_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(FB_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !pageIdKey || !usernameKey || !tokenKey || !disconnectedKey) return;
  
  try {
    // Clear from both localStorage and sessionStorage
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(pageIdKey);
    localStorage.removeItem(usernameKey);
    localStorage.removeItem(tokenKey);
    
    // Set the disconnected flag to remember the user explicitly disconnected
    localStorage.setItem(disconnectedKey, 'true');
    
    sessionStorage.removeItem(userIdKey);
    sessionStorage.removeItem(pageIdKey);
    sessionStorage.removeItem(usernameKey);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.setItem(disconnectedKey, 'true');
    
    console.log(`[${new Date().toISOString()}] Cleared Facebook connection for auth user ${authUserId} and marked as disconnected`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error clearing Facebook connection:`, error);
  }
};

/**
 * Disconnects Facebook account from the backend
 * @param authUserId The authenticated user ID to disconnect
 */
export const disconnectFacebookAccount = async (authUserId: string): Promise<void> => {
  if (!authUserId) return;
  
  try {
    // First check if we have a connection to disconnect
    const connection = getFacebookConnection(authUserId);
    if (!connection) {
      console.log(`[${new Date().toISOString()}] No Facebook connection found for ${authUserId}, nothing to disconnect`);
      return;
    }
    
    // Call backend to remove the connection record
    const axios = (await import('axios')).default;
    await axios.delete(`/api/facebook-connection/${authUserId}`);
    
    // Then clear from local storage and mark as disconnected
    clearFacebookConnection(authUserId);
    
    console.log(`[${new Date().toISOString()}] Successfully disconnected Facebook account for ${authUserId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error disconnecting Facebook account:`, error);
    throw error;
  }
};

/**
 * Checks if a user has a Facebook account connected
 * @param userId The ID of the authenticated user
 * @returns True if the user has a connected Facebook account
 */
export const isFacebookConnected = (userId: string): boolean => {
  if (!userId) {
    console.log('Cannot check Facebook connection without a userId');
    return false;
  }

  try {
    // Check if we have a stored Facebook connection for this user
    const connection = getFacebookConnection(userId);
    return !!(connection && connection.facebook_user_id && connection.facebook_page_id);
  } catch (error) {
    console.error('Error checking Facebook connection:', error);
    return false;
  }
};

/**
 * Checks if a user has explicitly disconnected Facebook
 * @param userId The ID of the authenticated user
 * @returns True if the user has explicitly disconnected Facebook
 */
export const isFacebookDisconnected = (userId: string): boolean => {
  if (!userId) return false;
  
  const disconnectedKey = getUserSpecificKey(FB_DISCONNECTED_KEY_PREFIX, userId);
  if (!disconnectedKey) return false;
  
  return localStorage.getItem(disconnectedKey) === 'true' || 
         sessionStorage.getItem(disconnectedKey) === 'true';
};

/**
 * Reset the disconnected flag to allow reconnection
 * @param userId The ID of the authenticated user
 */
export const resetDisconnectedFlag = (userId: string): void => {
  if (!userId) return;
  
  const disconnectedKey = getUserSpecificKey(FB_DISCONNECTED_KEY_PREFIX, userId);
  if (!disconnectedKey) return;
  
  localStorage.removeItem(disconnectedKey);
  sessionStorage.removeItem(disconnectedKey);
  
  console.log(`[${new Date().toISOString()}] Reset disconnected flag for user ${userId}`);
}; 