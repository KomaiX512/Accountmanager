/**
 * Instagram Session Manager
 * 
 * Utilities for managing Instagram session persistence and user isolation
 */

import axios from 'axios';

// Storage key prefixes for Instagram data
export const IG_TOKEN_KEY_PREFIX = 'instagram_token_';
export const IG_USER_ID_KEY_PREFIX = 'instagram_user_id_';
export const IG_GRAPH_ID_KEY_PREFIX = 'instagram_graph_id_';
export const IG_USERNAME_KEY_PREFIX = 'instagram_username_';
export const IG_ACCOUNT_TYPE_KEY_PREFIX = 'instagram_account_type_';
export const IG_DISCONNECTED_KEY_PREFIX = 'instagram_disconnected_';

/**
 * Generates a user-specific key for storage
 * @param prefix The key prefix
 * @param userId The user ID to associate with this key
 */
const getUserSpecificKey = (prefix: string, userId: string): string | null => {
  if (!userId) {
    console.warn('Cannot generate user-specific key without userId');
    return null;
  }
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
  const disconnectedKey = getUserSpecificKey(IG_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey || !disconnectedKey) return false;
  
  try {
    // Store in both localStorage and sessionStorage for redundancy
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(graphIdKey, graphId);
    if (username) localStorage.setItem(usernameKey, username);
    
    // Clear the disconnected flag when we're actively connecting
    localStorage.removeItem(disconnectedKey);
    
    sessionStorage.setItem(userIdKey, userId);
    sessionStorage.setItem(graphIdKey, graphId);
    if (username) sessionStorage.setItem(usernameKey, username);
    sessionStorage.removeItem(disconnectedKey);
    
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
  const disconnectedKey = getUserSpecificKey(IG_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey || !disconnectedKey) return null;
  
  try {
    // Check if the user has explicitly disconnected Instagram
    const isDisconnected = localStorage.getItem(disconnectedKey) === 'true' || 
                          sessionStorage.getItem(disconnectedKey) === 'true';
    
    if (isDisconnected) {
      console.log(`[${new Date().toISOString()}] User ${authUserId} has previously disconnected Instagram, not reconnecting automatically`);
      return null;
    }
    
    // Try sessionStorage first, then fallback to localStorage
    const userId = sessionStorage.getItem(userIdKey) || localStorage.getItem(userIdKey);
    const graphId = sessionStorage.getItem(graphIdKey) || localStorage.getItem(graphIdKey);
    const username = sessionStorage.getItem(usernameKey) || localStorage.getItem(usernameKey) || undefined;
    
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
  const disconnectedKey = getUserSpecificKey(IG_DISCONNECTED_KEY_PREFIX, authUserId);
  
  if (!userIdKey || !graphIdKey || !usernameKey || !tokenKey || !disconnectedKey) return;
  
  try {
    // Clear from both localStorage and sessionStorage
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(graphIdKey);
    localStorage.removeItem(usernameKey);
    localStorage.removeItem(tokenKey);
    
    // Set the disconnected flag to remember the user explicitly disconnected
    localStorage.setItem(disconnectedKey, 'true');
    
    sessionStorage.removeItem(userIdKey);
    sessionStorage.removeItem(graphIdKey);
    sessionStorage.removeItem(usernameKey);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.setItem(disconnectedKey, 'true');
    
    console.log(`[${new Date().toISOString()}] Cleared Instagram connection for auth user ${authUserId} and marked as disconnected`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error clearing Instagram connection:`, error);
  }
};

/**
 * Disconnects Instagram account from the backend
 * @param authUserId The authenticated user ID to disconnect
 */
export const disconnectInstagramAccount = async (authUserId: string): Promise<void> => {
  if (!authUserId) return;
  
  try {
    // First check if we have a connection to disconnect
    const connection = getInstagramConnection(authUserId);
    if (!connection) {
      console.log(`[${new Date().toISOString()}] No Instagram connection found for ${authUserId}, nothing to disconnect`);
      return;
    }
    
    // Call backend to remove the connection record
    await axios.delete(`/api/instagram-connection/${authUserId}`);
    
    // Then clear from local storage and mark as disconnected
    clearInstagramConnection(authUserId);
    
    console.log(`[${new Date().toISOString()}] Successfully disconnected Instagram account for ${authUserId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error disconnecting Instagram account:`, error);
    throw error;
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
 * Checks if a user has explicitly disconnected Instagram
 * @param userId The ID of the authenticated user
 * @returns True if the user has explicitly disconnected Instagram
 */
export const isInstagramDisconnected = (userId: string): boolean => {
  if (!userId) return false;
  
  const disconnectedKey = getUserSpecificKey(IG_DISCONNECTED_KEY_PREFIX, userId);
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
  
  const disconnectedKey = getUserSpecificKey(IG_DISCONNECTED_KEY_PREFIX, userId);
  if (!disconnectedKey) return;
  
  localStorage.removeItem(disconnectedKey);
  sessionStorage.removeItem(disconnectedKey);
  
  console.log(`[${new Date().toISOString()}] Reset disconnected flag for user ${userId}`);
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

/**
 * Retrieves a user's Instagram profile information from the backend
 * @param authUserId The authenticated user ID
 * @returns The Instagram profile data or null if not found
 */
export const getInstagramProfileData = async (authUserId: string): Promise<{
  hasEnteredInstagramUsername: boolean;
  instagram_username?: string;
  accountType?: 'branding' | 'non-branding';
  competitors?: string[];
} | null> => {
  if (!authUserId) return null;
  
  try {
    const response = await axios.get(`/api/user-instagram-status/${authUserId}`);
    return response.data;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving Instagram profile data:`, error);
    return null;
  }
};

/**
 * Syncs Instagram connection between local storage and backend
 * @param authUserId The authenticated user ID to sync
 */
export const syncInstagramConnection = async (authUserId: string): Promise<void> => {
  if (!authUserId) return;
  
  try {
    // Check if user has explicitly disconnected Instagram
    if (isInstagramDisconnected(authUserId)) {
      console.log(`[${new Date().toISOString()}] User ${authUserId} has explicitly disconnected Instagram, skipping sync`);
      return;
    }
    
    // First check local storage
    const localConnection = getInstagramConnection(authUserId);
    
    // Then check backend connection metadata
    try {
      const response = await axios.get(`/api/instagram-connection/${authUserId}`);
      const backendConnection = response.data;
      
      if (!backendConnection || !backendConnection.instagram_user_id) {
        // If backend has no connection but we have a local one that's NOT disconnected, push to backend
        if (localConnection) {
          await axios.post(`/api/instagram-connection/${authUserId}`, {
            instagram_user_id: localConnection.instagram_user_id,
            instagram_graph_id: localConnection.instagram_graph_id,
            username: localConnection.username
          });
          console.log(`[${new Date().toISOString()}] Updated backend with local Instagram connection`);
        }
        return;
      }
      
      // If backend has connection but local is missing or different (and user hasn't disconnected), update local
      if (!localConnection || localConnection.instagram_user_id !== backendConnection.instagram_user_id) {
        // Only update local if user hasn't explicitly disconnected
        if (!isInstagramDisconnected(authUserId)) {
          storeInstagramConnection(
            backendConnection.instagram_user_id,
            backendConnection.instagram_graph_id,
            backendConnection.username,
            authUserId
          );
          console.log(`[${new Date().toISOString()}] Updated local storage with backend Instagram connection`);
        } else {
          console.log(`[${new Date().toISOString()}] User has disconnected Instagram, not updating local storage`);
        }
      }

      // Verify that the backend also has token data for API calls
      if (backendConnection.instagram_graph_id) {
        try {
          const tokenCheckResponse = await axios.get(`/instagram-token-check/${backendConnection.instagram_graph_id}`);
          if (tokenCheckResponse.status === 200) {
            console.log(`[${new Date().toISOString()}] Verified Instagram token exists for graph ID ${backendConnection.instagram_graph_id}`);
          }
        } catch (tokenError: any) {
          if (tokenError.response?.status === 404) {
            console.warn(`[${new Date().toISOString()}] Instagram connection exists but no token found for graph ID ${backendConnection.instagram_graph_id}. User may need to reconnect.`);
          } else {
            console.error(`[${new Date().toISOString()}] Error checking Instagram token:`, tokenError);
          }
        }
      }
      
    } catch (error: any) {
      // 404 is expected if no connection exists in backend
      if (error.response?.status !== 404) {
        console.error(`[${new Date().toISOString()}] Error fetching backend Instagram connection:`, error);
      }
      
      // If we have local data but backend returned 404 (no connection)
      if (localConnection && error.response?.status === 404) {
        try {
          await axios.post(`/api/instagram-connection/${authUserId}`, {
            instagram_user_id: localConnection.instagram_user_id,
            instagram_graph_id: localConnection.instagram_graph_id,
            username: localConnection.username
          });
          console.log(`[${new Date().toISOString()}] Pushed local Instagram connection to backend`);
        } catch (pushError) {
          console.error(`[${new Date().toISOString()}] Error pushing Instagram connection to backend:`, pushError);
        }
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error syncing Instagram connection:`, error);
  }
}; 