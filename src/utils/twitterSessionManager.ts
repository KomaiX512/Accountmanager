// Twitter Session Manager
// Utility functions for managing Twitter connection session data

// Storage key prefixes
export const TWITTER_USER_ID_KEY_PREFIX = 'twitter_user_id_';
export const TWITTER_USERNAME_KEY_PREFIX = 'twitter_username_';
export const TWITTER_TOKEN_KEY_PREFIX = 'twitter_token_';
export const TWITTER_DISCONNECTED_KEY_PREFIX = 'twitter_disconnected_';

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
 * Stores Twitter connection data for a specific user
 * @param userId Twitter user ID
 * @param username Twitter username
 * @param authUserId The authenticated user ID to bind this connection to
 * @returns True if storage was successful, false otherwise
 */
export const storeTwitterConnection = (
  userId: string,
  username: string | undefined,
  authUserId: string
): boolean => {
  if (!authUserId) return false;
  
  const userIdKey = getUserSpecificKey(TWITTER_USER_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(TWITTER_USERNAME_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(TWITTER_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !usernameKey || !disconnectedKey) return false;
  
  try {
    // Store in both localStorage and sessionStorage for redundancy
    localStorage.setItem(userIdKey, userId);
    if (username) localStorage.setItem(usernameKey, username);
    
    // Clear the disconnected flag when we're actively connecting
    localStorage.removeItem(disconnectedKey);
    
    sessionStorage.setItem(userIdKey, userId);
    if (username) sessionStorage.setItem(usernameKey, username);
    sessionStorage.removeItem(disconnectedKey);
    
    console.log(`[${new Date().toISOString()}] Stored Twitter connection for auth user ${authUserId}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing Twitter connection:`, error);
    return false;
  }
};

/**
 * Retrieves Twitter connection data for a specific user
 * @param authUserId The authenticated user ID to get connection data for
 * @returns Connection data object or null if not found
 */
export const getTwitterConnection = (authUserId: string): { twitter_user_id: string; username?: string } | null => {
  if (!authUserId) return null;
  
  const userIdKey = getUserSpecificKey(TWITTER_USER_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(TWITTER_USERNAME_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(TWITTER_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !usernameKey || !disconnectedKey) return null;
  
  try {
    // Check if the user has explicitly disconnected Twitter
    const isDisconnected = localStorage.getItem(disconnectedKey) === 'true' || 
                          sessionStorage.getItem(disconnectedKey) === 'true';
    
    if (isDisconnected) {
      console.log(`[${new Date().toISOString()}] User ${authUserId} has previously disconnected Twitter, not reconnecting automatically`);
      return null;
    }
    
    // Try sessionStorage first, then fallback to localStorage
    const userId = sessionStorage.getItem(userIdKey) || localStorage.getItem(userIdKey);
    const username = sessionStorage.getItem(usernameKey) || localStorage.getItem(usernameKey) || undefined;
    
    if (!userId) return null;
    
    return { twitter_user_id: userId, username };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving Twitter connection:`, error);
    return null;
  }
};

/**
 * Clears Twitter connection data for a specific user
 * @param authUserId The authenticated user ID to clear connection data for
 */
export const clearTwitterConnection = (authUserId: string): void => {
  if (!authUserId) return;
  
  const userIdKey = getUserSpecificKey(TWITTER_USER_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(TWITTER_USERNAME_KEY_PREFIX, authUserId);
  const tokenKey = getUserSpecificKey(TWITTER_TOKEN_KEY_PREFIX, authUserId);
  const disconnectedKey = getUserSpecificKey(TWITTER_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !usernameKey || !tokenKey || !disconnectedKey) return;
  
  try {
    // Clear from both localStorage and sessionStorage
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(usernameKey);
    localStorage.removeItem(tokenKey);
    
    // Set the disconnected flag to remember the user explicitly disconnected
    localStorage.setItem(disconnectedKey, 'true');
    
    sessionStorage.removeItem(userIdKey);
    sessionStorage.removeItem(usernameKey);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.setItem(disconnectedKey, 'true');
    
    console.log(`[${new Date().toISOString()}] Cleared Twitter connection for auth user ${authUserId} and marked as disconnected`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error clearing Twitter connection:`, error);
  }
};

/**
 * Disconnects Twitter account from the backend
 * @param authUserId The authenticated user ID to disconnect
 */
export const disconnectTwitterAccount = async (authUserId: string): Promise<void> => {
  if (!authUserId) return;
  
  try {
    // First check if we have a connection to disconnect
    const connection = getTwitterConnection(authUserId);
    if (!connection) {
      console.log(`[${new Date().toISOString()}] No Twitter connection found for ${authUserId}, nothing to disconnect`);
      return;
    }
    
    // Call backend to remove the connection record
    const axios = (await import('axios')).default;
    await axios.delete(`http://localhost:3000/twitter-connection/${authUserId}`);
    
    // Then clear from local storage and mark as disconnected
    clearTwitterConnection(authUserId);
    
    console.log(`[${new Date().toISOString()}] Successfully disconnected Twitter account for ${authUserId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error disconnecting Twitter account:`, error);
    throw error;
  }
};

/**
 * Checks if a user has a Twitter account connected
 * @param userId The ID of the authenticated user
 * @returns True if the user has a connected Twitter account
 */
export const isTwitterConnected = (userId: string): boolean => {
  if (!userId) {
    console.log('Cannot check Twitter connection without a userId');
    return false;
  }

  try {
    // Check if we have a stored Twitter connection for this user
    const connection = getTwitterConnection(userId);
    return !!(connection && connection.twitter_user_id);
  } catch (error) {
    console.error('Error checking Twitter connection:', error);
    return false;
  }
};

/**
 * Checks if a user has explicitly disconnected Twitter
 * @param userId The ID of the authenticated user
 * @returns True if the user has explicitly disconnected Twitter
 */
export const isTwitterDisconnected = (userId: string): boolean => {
  if (!userId) return false;
  
  const disconnectedKey = getUserSpecificKey(TWITTER_DISCONNECTED_KEY_PREFIX, userId);
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
  
  const disconnectedKey = getUserSpecificKey(TWITTER_DISCONNECTED_KEY_PREFIX, userId);
  if (!disconnectedKey) return;
  
  localStorage.removeItem(disconnectedKey);
  sessionStorage.removeItem(disconnectedKey);
  
  console.log(`[${new Date().toISOString()}] Reset disconnected flag for user ${userId}`);
}; 