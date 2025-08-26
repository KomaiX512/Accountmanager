/**
 * 🎯 PRODUCTION-READY NEWS4U R2 BUCKET WATCHDOG SYSTEM
 * 
 * Efficient detection system that monitors R2 bucket for new News4U items
 * without constant polling. Uses smart timestamp comparison and 4-5 hour intervals.
 * 
 * Features:
 * - R2 bucket LastModified timestamp detection
 * - 4-5 hour interval checking (production scalable)
 * - Smart comparison to detect actual new items
 * - Automatic frontend refresh when new items found
 * - Memory efficient with minimal API calls
 * - Cross-platform support (Instagram, Twitter, Facebook)
 */

import axios from 'axios';

interface WatchdogConfig {
  accountHolder: string;
  platform: 'instagram' | 'twitter' | 'facebook';
  intervalHours: number; // 4-5 hours
  onNewItemsDetected: (newItems: any[]) => void;
  onError?: (error: string) => void;
}

interface R2BucketItem {
  key: string;
  lastModified: string;
  data?: any;
}

interface WatchdogState {
  isActive: boolean;
  lastCheckTime: number;
  latestKnownTimestamp: string | null;
  intervalId: NodeJS.Timeout | null;
  config: WatchdogConfig;
}

class News4UWatchdog {
  private watchdogs: Map<string, WatchdogState> = new Map();
  private readonly STORAGE_KEY_PREFIX = 'news4u_watchdog_';

  /**
   * Start watchdog for a specific account/platform combination
   */
  startWatchdog(config: WatchdogConfig): string {
    const watchdogId = `${config.platform}_${config.accountHolder}`;
    
    // Stop existing watchdog if running
    this.stopWatchdog(watchdogId);
    
    console.log(`[News4U Watchdog] 🚀 Starting watchdog for ${config.accountHolder} on ${config.platform}`);
    console.log(`[News4U Watchdog] 🚀 Check interval: ${config.intervalHours} hours`);
    
    // Load previous state from localStorage
    const savedState = this.loadWatchdogState(watchdogId);
    
    const state: WatchdogState = {
      isActive: true,
      lastCheckTime: savedState?.lastCheckTime || Date.now(),
      latestKnownTimestamp: savedState?.latestKnownTimestamp || null,
      intervalId: null,
      config
    };
    
    // Perform initial check immediately (but don't trigger refresh)
    this.performInitialCheck(state, watchdogId);
    
    // Set up interval for regular checks
    const intervalMs = config.intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
    state.intervalId = setInterval(() => {
      this.performWatchdogCheck(state, watchdogId);
    }, intervalMs);
    
    this.watchdogs.set(watchdogId, state);
    this.saveWatchdogState(watchdogId, state);
    
    console.log(`[News4U Watchdog] ✅ Watchdog started for ${watchdogId}, next check in ${config.intervalHours} hours`);
    return watchdogId;
  }

  /**
   * Stop watchdog for specific account/platform
   */
  stopWatchdog(watchdogId: string): void {
    const state = this.watchdogs.get(watchdogId);
    if (state?.intervalId) {
      clearInterval(state.intervalId);
      console.log(`[News4U Watchdog] 🛑 Stopped watchdog for ${watchdogId}`);
    }
    this.watchdogs.delete(watchdogId);
  }

  /**
   * Stop all active watchdogs
   */
  stopAllWatchdogs(): void {
    console.log(`[News4U Watchdog] 🛑 Stopping all ${this.watchdogs.size} active watchdogs`);
    for (const [watchdogId] of this.watchdogs) {
      this.stopWatchdog(watchdogId);
    }
  }

  /**
   * Get status of all active watchdogs
   */
  getWatchdogStatus(): Array<{id: string, config: WatchdogConfig, lastCheck: number, latestTimestamp: string | null}> {
    return Array.from(this.watchdogs.entries()).map(([id, state]) => ({
      id,
      config: state.config,
      lastCheck: state.lastCheckTime,
      latestTimestamp: state.latestKnownTimestamp
    }));
  }

  /**
   * Perform initial check to establish baseline without triggering refresh
   */
  private async performInitialCheck(state: WatchdogState, watchdogId: string): Promise<void> {
    try {
      console.log(`[News4U Watchdog] 🔍 Performing initial check for ${watchdogId}`);
      
      const bucketData = await this.fetchR2BucketData(state.config);
      if (bucketData.length > 0) {
        // Get the most recent item timestamp
        const latestItem = bucketData[0]; // Backend sorts by LastModified desc
        const latestTimestamp = latestItem.lastModified;
        
        // Update baseline without triggering refresh
        state.latestKnownTimestamp = latestTimestamp;
        state.lastCheckTime = Date.now();
        
        console.log(`[News4U Watchdog] 📊 Baseline established for ${watchdogId}:`);
        console.log(`[News4U Watchdog] 📊 Latest known timestamp: ${latestTimestamp}`);
        console.log(`[News4U Watchdog] 📊 Items in bucket: ${bucketData.length}`);
        
        this.saveWatchdogState(watchdogId, state);
      }
    } catch (error: any) {
      console.warn(`[News4U Watchdog] ⚠️ Initial check failed for ${watchdogId}:`, error.message);
      state.config.onError?.(`Initial check failed: ${error.message}`);
    }
  }

  /**
   * Perform regular watchdog check for new items
   */
  private async performWatchdogCheck(state: WatchdogState, watchdogId: string): Promise<void> {
    if (!state.isActive) return;

    try {
      console.log(`[News4U Watchdog] 🔍 Performing scheduled check for ${watchdogId}`);
      console.log(`[News4U Watchdog] 🔍 Last known timestamp: ${state.latestKnownTimestamp}`);
      
      const bucketData = await this.fetchR2BucketData(state.config);
      
      if (bucketData.length === 0) {
        console.log(`[News4U Watchdog] 📭 No items found in bucket for ${watchdogId}`);
        state.lastCheckTime = Date.now();
        this.saveWatchdogState(watchdogId, state);
        return;
      }

      // Get the most recent item from R2 bucket
      const latestItem = bucketData[0]; // Backend sorts by LastModified desc
      const currentLatestTimestamp = latestItem.lastModified;
      
      console.log(`[News4U Watchdog] 📊 Current latest timestamp: ${currentLatestTimestamp}`);
      console.log(`[News4U Watchdog] 📊 Previous latest timestamp: ${state.latestKnownTimestamp}`);

      // Check if we have new items
      const hasNewItems = this.hasNewItems(state.latestKnownTimestamp, currentLatestTimestamp);
      
      if (hasNewItems) {
        console.log(`[News4U Watchdog] 🎉 NEW ITEMS DETECTED for ${watchdogId}!`);
        console.log(`[News4U Watchdog] 🎉 Triggering frontend refresh...`);
        
        // Extract actual news items from bucket data
        const newItems = this.extractNewsItems(bucketData);
        
        // Update our known timestamp
        state.latestKnownTimestamp = currentLatestTimestamp;
        state.lastCheckTime = Date.now();
        
        // Trigger frontend refresh with new items
        state.config.onNewItemsDetected(newItems);
        
        console.log(`[News4U Watchdog] ✅ Frontend refresh triggered for ${watchdogId}`);
      } else {
        console.log(`[News4U Watchdog] 📋 No new items for ${watchdogId}, skipping refresh`);
      }
      
      state.lastCheckTime = Date.now();
      this.saveWatchdogState(watchdogId, state);
      
    } catch (error: any) {
      console.error(`[News4U Watchdog] ❌ Check failed for ${watchdogId}:`, error.message);
      state.config.onError?.(`Watchdog check failed: ${error.message}`);
    }
  }

  /**
   * Fetch R2 bucket data with LastModified timestamps
   */
  private async fetchR2BucketData(config: WatchdogConfig): Promise<R2BucketItem[]> {
    const url = `/api/news-for-you/${config.accountHolder}?platform=${config.platform}&includeMetadata=true&_cb=${Date.now()}`;
    
    console.log(`[News4U Watchdog] 🌐 Fetching R2 bucket data: ${url}`);
    
    const response = await axios.get(url);
    
    // Expect array of {key, lastModified, data} objects
    if (!Array.isArray(response.data)) {
      throw new Error('Invalid R2 bucket response format');
    }
    
    console.log(`[News4U Watchdog] 📦 Fetched ${response.data.length} items from R2 bucket`);
    return response.data;
  }

  /**
   * Check if we have new items based on timestamps
   */
  private hasNewItems(previousTimestamp: string | null, currentTimestamp: string): boolean {
    if (!previousTimestamp) {
      // First time check - don't consider as "new"
      return false;
    }
    
    try {
      const prevTime = new Date(previousTimestamp).getTime();
      const currTime = new Date(currentTimestamp).getTime();
      
      // New items if current timestamp is newer than previous
      return currTime > prevTime;
    } catch (error) {
      console.warn('[News4U Watchdog] ⚠️ Timestamp comparison failed, assuming no new items');
      return false;
    }
  }

  /**
   * Extract actual news items from R2 bucket data
   */
  private extractNewsItems(bucketData: R2BucketItem[]): any[] {
    const items: any[] = [];
    
    for (const bucketItem of bucketData) {
      if (!bucketItem.data) continue;
      
      // Handle different data structures
      const data = bucketItem.data;
      
      if (Array.isArray(data)) {
        items.push(...data);
      } else if (Array.isArray(data.items)) {
        items.push(...data.items);
      } else if (Array.isArray(data.articles)) {
        items.push(...data.articles);
      } else if (Array.isArray(data.news_items)) {
        items.push(...data.news_items);
      } else if (data.news_item) {
        items.push(data.news_item);
      } else if (data.title || data.headline) {
        // Single news item
        items.push(data);
      }
    }
    
    console.log(`[News4U Watchdog] 📰 Extracted ${items.length} news items from bucket data`);
    return items;
  }

  /**
   * Save watchdog state to localStorage
   */
  private saveWatchdogState(watchdogId: string, state: WatchdogState): void {
    try {
      const stateToSave = {
        lastCheckTime: state.lastCheckTime,
        latestKnownTimestamp: state.latestKnownTimestamp,
        accountHolder: state.config.accountHolder,
        platform: state.config.platform
      };
      
      localStorage.setItem(
        `${this.STORAGE_KEY_PREFIX}${watchdogId}`,
        JSON.stringify(stateToSave)
      );
    } catch (error) {
      console.warn(`[News4U Watchdog] ⚠️ Failed to save state for ${watchdogId}:`, error);
    }
  }

  /**
   * Load watchdog state from localStorage
   */
  private loadWatchdogState(watchdogId: string): {lastCheckTime: number, latestKnownTimestamp: string | null} | null {
    try {
      const saved = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${watchdogId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          lastCheckTime: parsed.lastCheckTime || Date.now(),
          latestKnownTimestamp: parsed.latestKnownTimestamp || null
        };
      }
    } catch (error) {
      console.warn(`[News4U Watchdog] ⚠️ Failed to load state for ${watchdogId}:`, error);
    }
    return null;
  }

  /**
   * Manual trigger check (for testing/debugging)
   */
  async triggerManualCheck(watchdogId: string): Promise<void> {
    const state = this.watchdogs.get(watchdogId);
    if (!state) {
      throw new Error(`Watchdog ${watchdogId} not found`);
    }
    
    console.log(`[News4U Watchdog] 🔧 Manual check triggered for ${watchdogId}`);
    await this.performWatchdogCheck(state, watchdogId);
  }
}

// Singleton instance
export const news4uWatchdog = new News4UWatchdog();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    news4uWatchdog.stopAllWatchdogs();
  });
}

export default News4UWatchdog;
