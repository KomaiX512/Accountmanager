import { ScheduleItem } from '../types/schedule';

export interface PendingScheduleItem extends ScheduleItem {
  intervalHours: number;
  nextScheduleTime: Date;
  autoScheduleBatch: boolean;
  retryCount: number;
  maxRetries: number;
}

export class PersistentScheduler {
  private static instance: PersistentScheduler;
  private schedulerInterval: number | null = null;
  private isRunning = false;
  
  private constructor() {}
  
  static getInstance(): PersistentScheduler {
    if (!PersistentScheduler.instance) {
      PersistentScheduler.instance = new PersistentScheduler();
    }
    return PersistentScheduler.instance;
  }
  
  private getStorageKey(platform: string, username: string): string {
    return `persistent_schedule_${platform}_${username}`;
  }
  
  private getPendingSchedules(platform: string, username: string): PendingScheduleItem[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey(platform, username));
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      return parsed.map((item: any) => ({
        ...item,
        scheduledTime: new Date(item.scheduledTime),
        nextScheduleTime: new Date(item.nextScheduleTime),
        lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date()
      }));
    } catch (error) {
      console.error('[PersistentScheduler] Error loading pending schedules:', error);
      return [];
    }
  }
  
  private savePendingSchedules(platform: string, username: string, schedules: PendingScheduleItem[]): void {
    try {
      localStorage.setItem(this.getStorageKey(platform, username), JSON.stringify(schedules));
      console.log(`[PersistentScheduler] 💾 Saved ${schedules.length} pending schedules for ${platform}/${username}`);
    } catch (error) {
      console.error('[PersistentScheduler] Error saving pending schedules:', error);
    }
  }
  
  /**
   * Add posts to the persistent scheduling queue
   */
  addToScheduleQueue(
    posts: any[], 
    platform: string, 
    username: string, 
    intervalHours: number
  ): void {
    const existing = this.getPendingSchedules(platform, username);
    const existingKeys = new Set(existing.map(item => item.postKey));
    
    const newSchedules: PendingScheduleItem[] = posts
      .filter(post => !existingKeys.has(post.key))
      .map((post, index) => {
        const baseTime = Date.now() + 60 * 1000; // Start 1 minute from now
        const scheduledTime = new Date(baseTime + (index * intervalHours * 60 * 60 * 1000));
        
        return {
          id: `${platform}_${username}_${post.key}_${Date.now()}`,
          postKey: post.key,
          scheduledTime,
          nextScheduleTime: scheduledTime,
          status: 'pending' as const,
          platform,
          username,
          caption: post.data?.post?.caption || '',
          imageUrl: post.data?.image_url || post.data?.r2_image_url,
          postData: post.data,
          intervalHours,
          autoScheduleBatch: true,
          retryCount: 0,
          maxRetries: 3,
          lastUpdated: new Date()
        };
      });
    
    if (newSchedules.length > 0) {
      const allSchedules = [...existing, ...newSchedules];
      this.savePendingSchedules(platform, username, allSchedules);
      console.log(`[PersistentScheduler] ➕ Added ${newSchedules.length} posts to queue for ${platform}/${username}`);
    }
    
    this.startScheduler();
  }
  
  /**
   * Remove a schedule item from the queue
   */
  removeFromQueue(platform: string, username: string, postKey: string): void {
    const schedules = this.getPendingSchedules(platform, username);
    const filtered = schedules.filter(item => item.postKey !== postKey);
    this.savePendingSchedules(platform, username, filtered);
    console.log(`[PersistentScheduler] ➖ Removed ${postKey} from queue`);
  }
  
  /**
   * Mark a schedule item as completed
   */
  markAsCompleted(platform: string, username: string, postKey: string): void {
    const schedules = this.getPendingSchedules(platform, username);
    const updated = schedules.map(item => 
      item.postKey === postKey 
        ? { ...item, status: 'posted' as const, lastUpdated: new Date() }
        : item
    );
    this.savePendingSchedules(platform, username, updated);
    console.log(`[PersistentScheduler] ✅ Marked ${postKey} as completed`);
  }
  
  /**
   * Mark a schedule item as failed and handle retry logic
   */
  markAsFailed(platform: string, username: string, postKey: string, errorMessage: string): void {
    const schedules = this.getPendingSchedules(platform, username);
    const updated = schedules.map(item => {
      if (item.postKey === postKey) {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= item.maxRetries) {
          return { ...item, status: 'failed' as const, errorMessage, lastUpdated: new Date() };
        } else {
          // Schedule retry in 5 minutes
          const nextRetry = new Date(Date.now() + 5 * 60 * 1000);
          return { 
            ...item, 
            retryCount: newRetryCount, 
            nextScheduleTime: nextRetry,
            errorMessage,
            lastUpdated: new Date()
          };
        }
      }
      return item;
    });
    this.savePendingSchedules(platform, username, updated);
    const failedItem = schedules.find(s => s.postKey === postKey);
    console.log(`[PersistentScheduler] ❌ Marked ${postKey} as failed (retry ${(failedItem?.retryCount || 0) + 1})`);
  }
  
  /**
   * Get pending posts that are ready to be scheduled
   */
  getPendingPosts(platform: string, username: string): PendingScheduleItem[] {
    const schedules = this.getPendingSchedules(platform, username);
    const now = new Date();
    
    return schedules.filter(item => 
      item.status === 'pending' && 
      item.nextScheduleTime <= now
    );
  }
  
  /**
   * Start the persistent scheduler
   */
  startScheduler(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[PersistentScheduler] 🚀 Starting persistent scheduler');
    
    // Check every minute for pending posts
    this.schedulerInterval = window.setInterval(() => {
      this.processPendingSchedules();
    }, 60 * 1000);
    
    // Process immediately on start
    setTimeout(() => this.processPendingSchedules(), 1000);
  }
  
  /**
   * Stop the persistent scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      window.clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    console.log('[PersistentScheduler] 🛑 Stopped persistent scheduler');
  }
  
  private async processPendingSchedules(): Promise<void> {
    // Get all unique platform/username combinations
    const keys = Object.keys(localStorage).filter(key => key.startsWith('persistent_schedule_'));
    
    for (const key of keys) {
      try {
        const parts = key.replace('persistent_schedule_', '').split('_');
        if (parts.length < 2) continue;
        
        const platform = parts[0];
        const username = parts.slice(1).join('_');
        
        const pending = this.getPendingPosts(platform, username);
        
        if (pending.length > 0) {
          console.log(`[PersistentScheduler] 📋 Processing ${pending.length} pending posts for ${platform}/${username}`);
          await this.executeScheduledPosts(pending, platform, username);
        }
      } catch (error) {
        console.error('[PersistentScheduler] Error processing pending schedules:', error);
      }
    }
  }
  
  private async executeScheduledPosts(posts: PendingScheduleItem[], platform: string, username: string): Promise<void> {
    for (const post of posts) {
      try {
        console.log(`[PersistentScheduler] 📤 Executing scheduled post: ${post.postKey}`);
        
        // Dispatch custom event to trigger the actual posting
        const event = new CustomEvent('executeScheduledPost', {
          detail: {
            post,
            platform,
            username
          }
        });
        
        window.dispatchEvent(event);
        
        // Mark as completed (the event handler should handle the actual API call)
        this.markAsCompleted(platform, username, post.postKey);
        
      } catch (error) {
        console.error(`[PersistentScheduler] Error executing post ${post.postKey}:`, error);
        this.markAsFailed(platform, username, post.postKey, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }
  
  /**
   * Get queue status for UI display
   */
  getQueueStatus(platform: string, username: string): {
    total: number;
    pending: number;
    posted: number;
    failed: number;
    nextSchedule: Date | null;
  } {
    const schedules = this.getPendingSchedules(platform, username);
    const pending = schedules.filter(s => s.status === 'pending');
    const posted = schedules.filter(s => s.status === 'posted');
    const failed = schedules.filter(s => s.status === 'failed');
    
    const nextSchedule = pending.length > 0 
      ? new Date(Math.min(...pending.map(s => s.nextScheduleTime.getTime())))
      : null;
    
    return {
      total: schedules.length,
      pending: pending.length,
      posted: posted.length,
      failed: failed.length,
      nextSchedule
    };
  }
  
  /**
   * Clear all completed/failed schedules
   */
  clearCompletedSchedules(platform: string, username: string): void {
    const schedules = this.getPendingSchedules(platform, username);
    const active = schedules.filter(s => s.status === 'pending');
    this.savePendingSchedules(platform, username, active);
    console.log(`[PersistentScheduler] 🧹 Cleared completed schedules for ${platform}/${username}`);
  }
}

export const persistentScheduler = PersistentScheduler.getInstance();
