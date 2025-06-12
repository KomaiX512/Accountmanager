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
        
        const response = await fetch(`http://localhost:3000/schedule-tweet-with-image/${userId}`, {
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
        const response = await fetch(`http://localhost:3000/schedule-tweet/${userId}`, {
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
      
      const response = await fetch(`http://localhost:3000/schedule-post/${userId}`, {
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
    // Use direct R2 endpoint (proven to work)
    const directImageUrl = `http://localhost:3000/api/r2-image/${username}/${imageKey}?platform=${platform}`;
    console.log(`[ScheduleHelper] Fetching image from R2: ${directImageUrl}`);
    
    const response = await fetch(directImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const imageBlob = await response.blob();
    console.log(`[ScheduleHelper] Image fetched successfully (${imageBlob.size} bytes, type: ${imageBlob.type})`);
    
    // Validate image type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageBlob.type)) {
      throw new Error(`Invalid image type: ${imageBlob.type}`);
    }
    
    return imageBlob;
  } catch (error) {
    console.error(`[ScheduleHelper] Failed to fetch image ${imageKey}:`, error);
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