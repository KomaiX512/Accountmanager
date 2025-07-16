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
      // Instagram/Facebook scheduling - ALWAYS send image blob if present
      formData.append('caption', caption);
      formData.append('scheduleDate', scheduleTime.toISOString());
      formData.append('platform', platform);
      
      // Extract image key from post key (optional, for backend reference)
      if (postKey) {
        let imageKey = '';
        if (postKey.includes('campaign_ready_post_') && postKey.endsWith('.json')) {
          const baseName = postKey.replace(/^.*\/(.+)\.json$/, '$1');
          imageKey = `${baseName}.jpg`;
        } else if (postKey.match(/ready_post_\d+\.json$/)) {
          const postIdMatch = postKey.match(/ready_post_(\d+)\.json$/);
          if (postIdMatch) {
            imageKey = `image_${postIdMatch[1]}.jpg`;
          }
        }
        if (imageKey) {
          formData.append('imageKey', imageKey);
        }
      }
      // --- CRITICAL FIX: Always send image as file if present ---
      if (imageBlob) {
        const filename = postKey ? `${platform}_post_${postKey}.jpg` : `${platform}_${Date.now()}.jpg`;
        formData.append('image', imageBlob, filename);
      }
      // ---------------------------------------------------------
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
    
    // SIMPLIFIED: Use the exact same approach as PostCooked - direct fetch
    const endpoint = `/api/r2-image/${username}/${imageKey}?platform=${platform}&t=${Date.now()}`;
    
    console.log(`[ScheduleHelper] 🎯 Fetching from: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'image/*,*/*',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const imageBlob = await response.blob();
    
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Empty image blob received');
    }
    
    console.log(`[ScheduleHelper] ✅ Image fetched successfully: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
    return imageBlob;
    
  } catch (error) {
    console.error(`[ScheduleHelper] ❌ Error fetching image ${imageKey}:`, error);
    return null;
  }
};

export const extractImageKey = (post: any): string => {
  let imageKey = '';
  
  // SIMPLIFIED: Extract image key exactly like PostCooked
  // Method 1: Extract from post key (most reliable)
  if (post.key) {
    // Campaign pattern: campaign_ready_post_1752000987874_9c14f1fd.json -> image_1752000987874_9c14f1fd.jpg
    if (post.key.includes('campaign_ready_post_') && post.key.endsWith('.json')) {
      const baseName = post.key.replace(/^.*\/([^\/]+)\.json$/, '$1');
      imageKey = `${baseName}.jpg`;
    }
    // Regular pattern: ready_post_1234567890.json -> image_1234567890.jpg
    else if (post.key.match(/ready_post_\d+\.json$/)) {
      const postIdMatch = post.key.match(/ready_post_(\d+)\.json$/);
      if (postIdMatch) {
        imageKey = `image_${postIdMatch[1]}.jpg`;
      }
    }
  }
  
  // Method 2: Extract from image URL if available
  if (!imageKey && post.data?.image_url) {
    const urlMatch = post.data.image_url.match(/(image_\d+\.jpg)/);
    if (urlMatch) {
      imageKey = urlMatch[1];
    }
  }
  
  console.log(`[ScheduleHelper] 🔑 Extracted imageKey: ${imageKey} from post key: ${post.key}`);
  return imageKey;
}; 