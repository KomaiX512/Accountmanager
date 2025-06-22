import { getApiUrl, API_CONFIG } from '../config/api';

export interface ScheduleOptions {
  platform: 'instagram' | 'twitter' | 'facebook';
  userId: string;
  imageBlob?: Blob;
  caption: string;
  scheduleTime: Date;
  postKey?: string;
}

export interface ScheduleResult {
  success: boolean;
  message: string;
  scheduleId?: string;
  error?: string;
}

export const schedulePost = async (options: ScheduleOptions): Promise<ScheduleResult> => {
  const { platform, userId, imageBlob, caption, scheduleTime, postKey } = options;
  
  // Validate inputs
  if (!userId) {
    return { success: false, message: 'User ID is required', error: 'Missing user ID' };
  }
  
  if (!scheduleTime) {
    return { success: false, message: 'Schedule time is required', error: 'Missing schedule time' };
  }
  
  // Validate schedule time is in future
  const now = new Date();
  const minSchedule = new Date(now.getTime() + 60 * 1000); // 1 minute minimum
  
  if (scheduleTime < minSchedule) {
    return { 
      success: false, 
      message: 'Schedule time must be at least 1 minute in the future',
      error: 'Invalid schedule time'
    };
  }
  
  try {
    const formData = new FormData();
    
    // Helper to resolve endpoint URLs consistently (handles optional BASE_URL)
    const resolveEndpoint = (endpointKey: keyof typeof API_CONFIG.ENDPOINTS, extra = ''): string => {
      const endpoint = API_CONFIG.ENDPOINTS[endpointKey] as string;
      return getApiUrl(endpoint, extra);
    };
    
    // Platform-specific handling
    if (platform === 'twitter') {
      // Twitter text validation
      if (caption.length > 280) {
        return { 
          success: false, 
          message: 'Tweet text exceeds 280 characters',
          error: 'Tweet too long'
        };
      }
      
      if (imageBlob) {
        // Twitter with image
        const filename = postKey ? `twitter_post_${postKey}.jpg` : `twitter_${Date.now()}.jpg`;
        formData.append('image', imageBlob, filename);
        formData.append('text', caption.trim());
        formData.append('scheduled_time', scheduleTime.toISOString());
        
        const response = await fetch(resolveEndpoint('SCHEDULE_TWEET_WITH_IMAGE', `/${userId}`), {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to schedule tweet with image');
        }
        
        const responseData = await response.json();
        return {
          success: true,
          message: 'Your tweet with image is scheduled!',
          scheduleId: responseData.schedule_id
        };
      } else {
        // Twitter text-only
        const response = await fetch(resolveEndpoint('SCHEDULE_TWEET', `/${userId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: caption.trim(),
            scheduled_time: scheduleTime.toISOString()
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to schedule tweet');
        }
        
        return {
          success: true,
          message: 'Your tweet is scheduled!'
        };
      }
    } else {
      // Instagram/Facebook scheduling
      formData.append('caption', caption);
      formData.append('scheduleDate', scheduleTime.toISOString());
      formData.append('platform', platform);
      
      if (imageBlob) {
        const filename = postKey ? `${platform}_post_${postKey}.jpg` : `${platform}_${Date.now()}.jpg`;
        formData.append('image', imageBlob, filename);
      }
      
      const response = await fetch(resolveEndpoint('SCHEDULE_POST', `/${userId}`), {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to schedule ${platform} post`);
      }
      
      const responseData = await response.json();
      return {
        success: true,
        message: `Your ${platform} post is scheduled!`,
        scheduleId: responseData.scheduleId
      };
    }
  } catch (error) {
    console.error(`[ScheduleHelper] Error scheduling ${platform} post:`, error);
    return {
      success: false,
      message: `Failed to schedule ${platform} post: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const fetchImageFromR2 = async (
  username: string, 
  imageKey: string, 
  platform: string = 'instagram'
): Promise<Blob | null> => {
  try {
    console.log(`[ScheduleHelper] 📤 Fetching image: ${imageKey} for platform: ${platform}`);
    
    // Try multiple endpoints with fallbacks (same approach as PostCooked.tsx)
    const endpoints = [
      // Primary: Direct R2 endpoint with cache busting
      `/api/r2-image/${username}/${imageKey}?platform=${platform}&t=${Date.now()}`,
      // Fallback 1: Fix-image endpoint
      `/fix-image/${username}/${imageKey}?platform=${platform}`,
      // Fallback 2: Direct R2 without cache busting
      `/api/r2-image/${username}/${imageKey}?platform=${platform}`
    ];
    
    let lastError: Error | null = null;
    
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      console.log(`[ScheduleHelper] 🎯 Trying endpoint ${i + 1}/${endpoints.length}: ${endpoint}`);
      
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Accept': 'image/*,*/*',
            'Cache-Control': 'no-cache'
          }
        });
        
        console.log(`[ScheduleHelper] 📊 Response ${i + 1}: Status ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
          // If we get HTML or text, log it for debugging but try next endpoint
          if (contentType.includes('text/html')) {
            const htmlContent = await response.text();
            console.warn(`[ScheduleHelper] ⚠️ Endpoint ${i + 1} returned HTML (probably error page): ${htmlContent.substring(0, 200)}...`);
            throw new Error(`Invalid content type: ${contentType} (HTML error page)`);
          }
          throw new Error(`Invalid content type: ${contentType}. Expected image data.`);
        }
        
        const imageBlob = await response.blob();
        
        // Validate image blob
        if (!imageBlob || imageBlob.size === 0) {
          throw new Error('Empty image blob received');
        }
        
        if (imageBlob.size < 100) {
          throw new Error(`Image too small: ${imageBlob.size} bytes (likely corrupted)`);
        }
        
        // Validate image type
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'].includes(imageBlob.type)) {
          console.warn(`[ScheduleHelper] ⚠️ Unusual blob type: ${imageBlob.type}, but proceeding`);
        }
        
        console.log(`[ScheduleHelper] ✅ Image fetched successfully from endpoint ${i + 1}: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
        return imageBlob;
        
      } catch (endpointError: any) {
        console.warn(`[ScheduleHelper] ⚠️ Endpoint ${i + 1} failed: ${endpointError.message}`);
        lastError = endpointError;
        continue;
      }
    }
    
    // All endpoints failed
    throw new Error(`All ${endpoints.length} endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
    
  } catch (error: any) {
    console.error(`[ScheduleHelper] ❌ Failed to fetch image ${imageKey}:`, error.message);
    return null;
  }
};

export const extractImageKey = (post: any): string => {
  let imageKey = '';
  
  // Method 1: Extract from image URL
  if (post.data?.image_url && post.data.image_url.includes('/ready_post/')) {
    const match = post.data.image_url.match(/ready_post\/[\w-]+\/(image_\d+\.jpg)/);
    if (match) imageKey = match[1];
  }
  
  // Method 2: Extract from post key
  if (!imageKey && post.key?.match(/ready_post_\d+\.json$/)) {
    const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
    if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
  }
  
  return imageKey;
}; 