/**
 * Instagram Session Manager
 * 
 * Utilities for managing Instagram session persistence and user isolation
 */

// Storage key prefixes for Instagram data
export const IG_TOKEN_KEY_PREFIX = 'instagram_token_';
export const IG_USER_ID_KEY_PREFIX = 'instagram_user_id_';
export const IG_GRAPH_ID_KEY_PREFIX = 'instagram_graph_id_';
export const IG_USERNAME_KEY_PREFIX = 'instagram_username_';
export const IG_ACCOUNT_TYPE_KEY_PREFIX = 'instagram_account_type_';

/**
 * Generates a user-specific storage key
 * @param prefix The prefix for the key
 * @param userId The user ID to associate with the key
 * @returns The user-specific key or null if userId is not provided
 */
export const getUserSpecificKey = (prefix: string, userId?: string): string | null => {
  if (!userId) return null;
  return `${prefix}${userId}`;
};

/**
 * Stores Instagram connection data for a specific user
 * @param userId Instagram user ID
 * @param graphId Instagram graph ID
 * @param username Instagram username (optional)
 * @param authUserId The authenticated user ID to bind this connection to
 * @returns True if storage was successful, false otherwise
 */
export const storeInstagramConnection = (
  userId: string,
  graphId: string,
  username: string | undefined,
  authUserId: string
): boolean => {
  if (!authUserId) return false;
  
  const userIdKey = getUserSpecificKey(IG_USER_ID_KEY_PREFIX, authUserId);
  const graphIdKey = getUserSpecificKey(IG_GRAPH_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(IG_USERNAME_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey) return false;
  
  try {
    // Store in both localStorage and sessionStorage for redundancy
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(graphIdKey, graphId);
    if (username) localStorage.setItem(usernameKey, username);
    
    sessionStorage.setItem(userIdKey, userId);
    sessionStorage.setItem(graphIdKey, graphId);
    if (username) sessionStorage.setItem(usernameKey, username);
    
    console.log(`[${new Date().toISOString()}] Stored Instagram connection for auth user ${authUserId}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing Instagram connection:`, error);
    return false;
  }
};

/**
 * Retrieves Instagram connection data for a specific user
 * @param authUserId The authenticated user ID to get connection data for
 * @returns Connection data object or null if not found
 */
export const getInstagramConnection = (authUserId: string): { instagram_user_id: string; instagram_graph_id: string; username?: string } | null => {
  if (!authUserId) return null;
  
  const userIdKey = getUserSpecificKey(IG_USER_ID_KEY_PREFIX, authUserId);
  const graphIdKey = getUserSpecificKey(IG_GRAPH_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(IG_USERNAME_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey) return null;
  
  try {
    // Try sessionStorage first, then fallback to localStorage
    let userId = sessionStorage.getItem(userIdKey) || localStorage.getItem(userIdKey);
    let graphId = sessionStorage.getItem(graphIdKey) || localStorage.getItem(graphIdKey);
    let username = sessionStorage.getItem(usernameKey) || localStorage.getItem(usernameKey) || undefined;
    
    if (!userId || !graphId) return null;
    
    return { instagram_user_id: userId, instagram_graph_id: graphId, username };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving Instagram connection:`, error);
    return null;
  }
};

/**
 * Clears Instagram connection data for a specific user
 * @param authUserId The authenticated user ID to clear connection data for
 */
export const clearInstagramConnection = (authUserId: string): void => {
  if (!authUserId) return;
  
  const userIdKey = getUserSpecificKey(IG_USER_ID_KEY_PREFIX, authUserId);
  const graphIdKey = getUserSpecificKey(IG_GRAPH_ID_KEY_PREFIX, authUserId);
  const usernameKey = getUserSpecificKey(IG_USERNAME_KEY_PREFIX, authUserId);
  const tokenKey = getUserSpecificKey(IG_TOKEN_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey || !tokenKey) return;
  
  try {
    // Clear from both localStorage and sessionStorage
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(graphIdKey);
    localStorage.removeItem(usernameKey);
    localStorage.removeItem(tokenKey);
    
    sessionStorage.removeItem(userIdKey);
    sessionStorage.removeItem(graphIdKey);
    sessionStorage.removeItem(usernameKey);
    sessionStorage.removeItem(tokenKey);
    
    console.log(`[${new Date().toISOString()}] Cleared Instagram connection for auth user ${authUserId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error clearing Instagram connection:`, error);
  }
};

/**
 * Disconnects an Instagram account from backend and clears local storage
 * @param authUserId The authenticated user ID to disconnect
 * @returns Promise that resolves when disconnection is complete
 */
export const disconnectInstagramAccount = async (authUserId: string): Promise<void> => {
  if (!authUserId) {
    console.error(`[${new Date().toISOString()}] Cannot disconnect Instagram: No authenticated user ID provided`);
    return;
  }
  
  // Clear local storage first
  clearInstagramConnection(authUserId);
  
  // Then try to remove from backend
  try {
    await fetch(`http://localhost:3000/instagram-connection/${authUserId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`[${new Date().toISOString()}] Successfully removed Instagram connection from backend for user ${authUserId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to remove Instagram connection from backend:`, error);
  }
};

/**
 * Checks if a user has an Instagram account connected
 * @param userId The ID of the authenticated user
 * @returns True if the user has a connected Instagram account
 */
export const isInstagramConnected = (userId: string): boolean => {
  if (!userId) {
    console.log('Cannot check Instagram connection without a userId');
    return false;
  }

  try {
    // Check if we have a stored Instagram connection for this user
    const connection = getInstagramConnection(userId);
    return !!(connection && connection.instagram_user_id && connection.instagram_graph_id);
  } catch (error) {
    console.error('Error checking Instagram connection:', error);
    return false;
  }
};

/**
 * Stores the Instagram account type for a specific user
 * @param authUserId The authenticated user ID
 * @param accountType The account type ('branding' or 'non-branding')
 * @returns True if storage was successful, false otherwise
 */
export const storeAccountType = (
  authUserId: string,
  accountType: 'branding' | 'non-branding'
): boolean => {
  if (!authUserId) return false;
  
  const accountTypeKey = getUserSpecificKey(IG_ACCOUNT_TYPE_KEY_PREFIX, authUserId);
  
  if (!accountTypeKey) return false;
  
  try {
    // Store in both localStorage and sessionStorage for redundancy
    localStorage.setItem(accountTypeKey, accountType);
    sessionStorage.setItem(accountTypeKey, accountType);
    
    console.log(`[${new Date().toISOString()}] Stored account type ${accountType} for auth user ${authUserId}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing account type:`, error);
    return false;
  }
};

/**
 * Retrieves the Instagram account type for a specific user
 * @param authUserId The authenticated user ID
 * @returns The account type ('branding' or 'non-branding') or null if not found
 */
export const getAccountType = (authUserId: string): 'branding' | 'non-branding' | null => {
  if (!authUserId) return null;
  
  const accountTypeKey = getUserSpecificKey(IG_ACCOUNT_TYPE_KEY_PREFIX, authUserId);
  
  if (!accountTypeKey) return null;
  
  try {
    // Try sessionStorage first, then fallback to localStorage
    const accountType = sessionStorage.getItem(accountTypeKey) || localStorage.getItem(accountTypeKey);
    
    if (!accountType) return null;
    
    return accountType as 'branding' | 'non-branding';
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving account type:`, error);
    return null;
  }
}; 