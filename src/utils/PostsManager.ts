/**
 * Post Manager Utility
 * 
 * Handles persistence for rejected and scheduled posts to ensure they
 * remain hidden even after page refresh or new data fetches.
 */

import axios from 'axios';

const REJECTED_POSTS_KEY_PREFIX = 'rejected_posts_';
const SCHEDULED_POSTS_KEY_PREFIX = 'scheduled_posts_';

/**
 * Get a user-specific key for localStorage
 * @param prefix The key prefix
 * @param username The Instagram username
 * @returns The user-specific key
 */
const getUserSpecificKey = (prefix: string, username: string): string => {
  if (!username) return '';
  return `${prefix}${username.toLowerCase().trim()}`;
};

/**
 * Synchronize local post status with server (for persistence across devices)
 * @param username The Instagram username
 * @param postKeys Array of post keys
 * @param status Status to set (rejected or scheduled)
 * @param scheduledTimes Optional array of scheduled times (for scheduled posts)
 */
const syncWithServer = async (
  username: string,
  postKeys: string[],
  status: 'rejected' | 'scheduled',
  scheduledTimes?: number[]
): Promise<void> => {
  if (!username || !postKeys.length) return;

  try {
    await axios.post(`http://localhost:3000/post-status/${username}`, {
      postKeys,
      status,
      scheduledTimes
    });
    console.log(`[${new Date().toISOString()}] Synced ${status} posts with server for ${username}: ${postKeys.length} posts`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to sync ${status} posts with server:`, error);
    // We continue even if server sync fails - local storage will still work
  }
};

/**
 * Store a rejected post permanently
 * @param username The Instagram username
 * @param postKey The post key to mark as rejected
 */
export const storeRejectedPost = (username: string, postKey: string): void => {
  if (!username || !postKey) return;
  
  const storageKey = getUserSpecificKey(REJECTED_POSTS_KEY_PREFIX, username);
  
  try {
    // Get existing rejected posts
    const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Add new post if not already in the list
    if (!existingPosts.includes(postKey)) {
      existingPosts.push(postKey);
      localStorage.setItem(storageKey, JSON.stringify(existingPosts));
      console.log(`[${new Date().toISOString()}] Stored rejected post ${postKey} for user ${username}`);
      
      // Sync with server
      syncWithServer(username, [postKey], 'rejected');
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing rejected post:`, error);
  }
};

/**
 * Load post status from server and update local storage
 * @param username The Instagram username
 */
export const syncPostStatusFromServer = async (username: string): Promise<void> => {
  if (!username) return;
  
  try {
    const response = await axios.get(`http://localhost:3000/post-status/${username}`);
    const data = response.data;
    
    // Update rejected posts in localStorage
    if (data.rejected && Array.isArray(data.rejected)) {
      const rejectedKey = getUserSpecificKey(REJECTED_POSTS_KEY_PREFIX, username);
      const localRejected = JSON.parse(localStorage.getItem(rejectedKey) || '[]');
      
      // Merge server and local rejected posts
      const mergedRejected = [...new Set([...localRejected, ...data.rejected])];
      localStorage.setItem(rejectedKey, JSON.stringify(mergedRejected));
    }
    
    // Update scheduled posts in localStorage
    if (data.scheduled && typeof data.scheduled === 'object') {
      const scheduledKey = getUserSpecificKey(SCHEDULED_POSTS_KEY_PREFIX, username);
      const localScheduled = JSON.parse(localStorage.getItem(scheduledKey) || '{}');
      
      // Merge server and local scheduled posts
      const mergedScheduled = { ...localScheduled, ...data.scheduled };
      localStorage.setItem(scheduledKey, JSON.stringify(mergedScheduled));
    }
    
    console.log(`[${new Date().toISOString()}] Synced post status from server for ${username}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error syncing post status from server:`, error);
    // Continue with local data if server sync fails
  }
};

/**
 * Get all rejected posts for a user
 * @param username The Instagram username
 * @returns Array of rejected post keys
 */
export const getRejectedPosts = (username: string): string[] => {
  if (!username) return [];
  
  const storageKey = getUserSpecificKey(REJECTED_POSTS_KEY_PREFIX, username);
  
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving rejected posts:`, error);
    return [];
  }
};

/**
 * Check if a post is rejected
 * @param username The Instagram username
 * @param postKey The post key to check
 * @returns True if the post is rejected
 */
export const isPostRejected = (username: string, postKey: string): boolean => {
  const rejectedPosts = getRejectedPosts(username);
  return rejectedPosts.includes(postKey);
};

/**
 * Store a scheduled post permanently
 * @param username The Instagram username 
 * @param postKey The post key to mark as scheduled
 * @param scheduleTime Optional timestamp when the post is scheduled
 */
export const storeScheduledPost = (
  username: string, 
  postKey: string, 
  scheduleTime?: number
): void => {
  if (!username || !postKey) return;
  
  const storageKey = getUserSpecificKey(SCHEDULED_POSTS_KEY_PREFIX, username);
  const timestamp = scheduleTime || Date.now();
  
  try {
    // Get existing scheduled posts
    const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    // Add new post if not already in the list
    if (!existingPosts[postKey]) {
      existingPosts[postKey] = {
        scheduledAt: timestamp,
        postKey
      };
      localStorage.setItem(storageKey, JSON.stringify(existingPosts));
      console.log(`[${new Date().toISOString()}] Stored scheduled post ${postKey} for user ${username}`);
      
      // Sync with server
      syncWithServer(username, [postKey], 'scheduled', [timestamp]);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing scheduled post:`, error);
  }
};

/**
 * Store multiple scheduled posts at once
 * @param username The Instagram username
 * @param posts Array of {postKey, scheduleTime} objects
 */
export const storeMultipleScheduledPosts = (
  username: string,
  posts: Array<{ postKey: string, scheduleTime?: number }>
): void => {
  if (!username || !posts.length) return;
  
  const storageKey = getUserSpecificKey(SCHEDULED_POSTS_KEY_PREFIX, username);
  
  try {
    // Get existing scheduled posts
    const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    // Track which posts need to be synced with server
    const serverSyncKeys: string[] = [];
    const serverSyncTimes: number[] = [];
    
    // Add new posts if not already in the list
    posts.forEach(({ postKey, scheduleTime }) => {
      if (!existingPosts[postKey]) {
        const timestamp = scheduleTime || Date.now();
        existingPosts[postKey] = {
          scheduledAt: timestamp,
          postKey
        };
        
        // Add to server sync arrays
        serverSyncKeys.push(postKey);
        serverSyncTimes.push(timestamp);
      }
    });
    
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(existingPosts));
    console.log(`[${new Date().toISOString()}] Stored ${serverSyncKeys.length} scheduled posts for user ${username}`);
    
    // Sync with server if we have new posts
    if (serverSyncKeys.length > 0) {
      syncWithServer(username, serverSyncKeys, 'scheduled', serverSyncTimes);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing multiple scheduled posts:`, error);
  }
};

/**
 * Get all scheduled posts for a user
 * @param username The Instagram username
 * @returns Object of scheduled post details
 */
export const getScheduledPosts = (username: string): Record<string, {scheduledAt: number, postKey: string}> => {
  if (!username) return {};
  
  const storageKey = getUserSpecificKey(SCHEDULED_POSTS_KEY_PREFIX, username);
  
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving scheduled posts:`, error);
    return {};
  }
};

/**
 * Check if a post is scheduled or already posted
 * @param username The Instagram username
 * @param postKey The post key to check
 * @returns True if the post is scheduled or posted
 */
export const isPostScheduled = (username: string, postKey: string): boolean => {
  const scheduledPosts = getScheduledPosts(username);
  return !!scheduledPosts[postKey];
};

/**
 * Filter out rejected and already scheduled posts
 * @param username The Instagram username
 * @param posts The array of posts to filter
 * @returns Filtered array of posts
 */
export const filterProcessedPosts = (
  username: string,
  posts: Array<{ key: string, data: any }>
): Array<{ key: string, data: any }> => {
  if (!username || !posts?.length) return [];
  
  // Get lists of rejected and scheduled posts
  const rejectedPosts = getRejectedPosts(username);
  const scheduledPosts = getScheduledPosts(username);
  
  // Filter out posts that have been rejected or scheduled
  return posts.filter(post => {
    const isRejected = rejectedPosts.includes(post.key);
    const isScheduled = !!scheduledPosts[post.key];
    return !isRejected && !isScheduled;
  });
};

/**
 * Clean up posts that were scheduled and should now be posted
 * This should be called periodically to remove posts from the scheduled list
 * that have already been posted (scheduled time has passed)
 * @param username The Instagram username
 */
export const cleanupPostedContent = (username: string): void => {
  if (!username) return;
  
  const storageKey = getUserSpecificKey(SCHEDULED_POSTS_KEY_PREFIX, username);
  
  try {
    const scheduledPosts = getScheduledPosts(username);
    const now = Date.now();
    let hasChanges = false;
    
    // Filter out posts where the scheduled time has passed
    Object.keys(scheduledPosts).forEach(postKey => {
      const post = scheduledPosts[postKey];
      if (post.scheduledAt < now) {
        // This post should be posted by now, remove it from scheduled
        delete scheduledPosts[postKey];
        hasChanges = true;
      }
    });
    
    // Save changes if any
    if (hasChanges) {
      localStorage.setItem(storageKey, JSON.stringify(scheduledPosts));
      console.log(`[${new Date().toISOString()}] Cleaned up posted content for user ${username}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error cleaning up posted content:`, error);
  }
}; 