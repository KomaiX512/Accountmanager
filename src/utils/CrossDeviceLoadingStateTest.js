/**
 * Cross-Device Loading State Test Utility
 * 
 * This utility helps test and debug the cross-device loading state synchronization.
 * Add this to your browser console on any device to test the system.
 */

class CrossDeviceLoadingStateTest {
  constructor() {
    this.userId = null;
    this.platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    this.logPrefix = '[CROSS-DEVICE TEST]';
  }

  async init() {
    // Try to get current user ID from auth context
    try {
      const authState = JSON.parse(localStorage.getItem('firebase:authUser:AIzaSyDyMgWjFGKDr_sPhYYF_SL_jI_eQnZtxuk:[DEFAULT]') || '{}');
      this.userId = authState.uid;
      if (this.userId) {
        console.log(`${this.logPrefix} 🔍 Initialized for user: ${this.userId}`);
        return true;
      }
    } catch (e) {
      console.warn(`${this.logPrefix} Could not get user ID from localStorage`);
    }
    
    console.error(`${this.logPrefix} ❌ No authenticated user found. Please log in first.`);
    return false;
  }

  async checkBackendProcessingStatus(platform = null) {
    if (!this.userId) {
      console.error(`${this.logPrefix} No user ID available`);
      return null;
    }

    const url = platform 
      ? `/api/processing-status/${this.userId}?platform=${platform}`
      : `/api/processing-status/${this.userId}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`${this.logPrefix} 🔍 Backend processing status${platform ? ` for ${platform}` : ''}:`, data);
      return data;
    } catch (error) {
      console.error(`${this.logPrefix} ❌ Error checking backend status:`, error);
      return null;
    }
  }

  checkLocalProcessingStatus(platform = null) {
    const platforms = platform ? [platform] : this.platforms;
    const results = {};

    platforms.forEach(p => {
      const countdown = localStorage.getItem(`${p}_processing_countdown`);
      const info = localStorage.getItem(`${p}_processing_info`);
      
      if (countdown && info) {
        try {
          const endTime = parseInt(countdown);
          const infoData = JSON.parse(info);
          const now = Date.now();
          const remainingMs = endTime - now;
          const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
          
          results[p] = {
            active: remainingMs > 0,
            remainingMinutes: remainingMs > 0 ? remainingMinutes : 0,
            endTime,
            infoData,
            expired: remainingMs <= 0
          };
        } catch (e) {
          results[p] = { error: 'Invalid data format' };
        }
      } else {
        results[p] = { active: false, reason: 'No local data' };
      }
    });

    console.log(`${this.logPrefix} 📱 Local processing status:`, results);
    return results;
  }

  async compareStates(platform = null) {
    console.log(`${this.logPrefix} 🔄 Comparing local vs backend states...`);
    
    const local = this.checkLocalProcessingStatus(platform);
    const backend = await this.checkBackendProcessingStatus(platform);
    
    const comparison = {
      local,
      backend: backend?.data || null,
      discrepancies: []
    };

    // Check for discrepancies
    const platforms = platform ? [platform] : this.platforms;
    
    platforms.forEach(p => {
      const localState = local[p];
      const backendState = backend?.data?.[p];
      
      if (localState?.active && !backendState) {
        comparison.discrepancies.push(`${p}: Local active but no backend state`);
      } else if (!localState?.active && backendState) {
        comparison.discrepancies.push(`${p}: Backend active but no local state`);
      } else if (localState?.active && backendState) {
        const localEnd = localState.endTime;
        const backendEnd = backendState.endTime;
        if (Math.abs(localEnd - backendEnd) > 5000) { // More than 5 second difference
          comparison.discrepancies.push(`${p}: Timer mismatch - Local: ${new Date(localEnd).toISOString()}, Backend: ${new Date(backendEnd).toISOString()}`);
        }
      }
    });

    if (comparison.discrepancies.length === 0) {
      console.log(`${this.logPrefix} ✅ All states synchronized correctly`);
    } else {
      console.warn(`${this.logPrefix} ⚠️ Found discrepancies:`, comparison.discrepancies);
    }

    return comparison;
  }

  async simulateLoadingState(platform, durationMinutes = 2) { // Reduced from 15 to 2 minutes for testing
    if (!this.platforms.includes(platform)) {
      console.error(`${this.logPrefix} Invalid platform: ${platform}`);
      return false;
    }

    console.log(`${this.logPrefix} 🚀 Simulating ${durationMinutes}min loading state for ${platform}...`);

    const now = Date.now();
    const endTime = now + (durationMinutes * 60 * 1000);
    
    // Set local state
    localStorage.setItem(`${platform}_processing_countdown`, endTime.toString());
    localStorage.setItem(`${platform}_processing_info`, JSON.stringify({
      platform,
      username: 'testuser',
      startTime: now,
      endTime,
      totalDuration: durationMinutes * 60 * 1000,
      testSimulation: true
    }));

    // Sync to backend
    try {
      const response = await fetch(`/api/processing-status/${this.userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          startTime: now,
          endTime,
          totalDuration: durationMinutes * 60 * 1000,
          username: 'testuser'
        })
      });

      if (response.ok) {
        console.log(`${this.logPrefix} ✅ Loading state simulated successfully for ${platform}`);
        console.log(`${this.logPrefix} 📋 Test this by:
1. Opening this same app in another browser/device
2. Try to access /${platform}-dashboard or /dashboard
3. You should be redirected to /processing/${platform}
4. Both devices should show the same countdown timer`);
        return true;
      } else {
        console.error(`${this.logPrefix} ❌ Failed to sync to backend`);
        return false;
      }
    } catch (error) {
      console.error(`${this.logPrefix} ❌ Error syncing to backend:`, error);
      return false;
    }
  }

  async clearLoadingState(platform) {
    if (!this.platforms.includes(platform)) {
      console.error(`${this.logPrefix} Invalid platform: ${platform}`);
      return false;
    }

    console.log(`${this.logPrefix} 🧹 Clearing loading state for ${platform}...`);

    // Clear local state
    localStorage.removeItem(`${platform}_processing_countdown`);
    localStorage.removeItem(`${platform}_processing_info`);

    // Clear backend state
    try {
      const response = await fetch(`/api/processing-status/${this.userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });

      if (response.ok) {
        console.log(`${this.logPrefix} ✅ Loading state cleared for ${platform}`);
        return true;
      } else {
        console.error(`${this.logPrefix} ❌ Failed to clear backend state`);
        return false;
      }
    } catch (error) {
      console.error(`${this.logPrefix} ❌ Error clearing backend state:`, error);
      return false;
    }
  }

  async testCrossDeviceSync(platform, durationMinutes = 2) {
    console.log(`${this.logPrefix} 🧪 Starting cross-device sync test for ${platform}...`);
    
    // Step 1: Create loading state
    await this.simulateLoadingState(platform, durationMinutes);
    
    // Step 2: Wait a bit and check sync
    setTimeout(async () => {
      console.log(`${this.logPrefix} 🔍 Checking sync after 3 seconds...`);
      await this.compareStates(platform);
      
      console.log(`${this.logPrefix} 📋 Instructions:
1. Open this app in another browser/device/tab
2. Try to navigate to any platform dashboard
3. You should be redirected to the processing page
4. Run 'testUtil.compareStates("${platform}")' on both devices
5. Both should show identical timer values

To clean up: testUtil.clearLoadingState("${platform}")`);
    }, 3000);
  }

  printHelp() {
    console.log(`${this.logPrefix} 📚 Available commands:

// Check current states
testUtil.checkLocalProcessingStatus()          // Check local storage
testUtil.checkBackendProcessingStatus()        // Check backend status
testUtil.compareStates()                       // Compare local vs backend

// Simulate loading states for testing
testUtil.simulateLoadingState('instagram', 2) // Create 2min loading state (reduced from 15)
testUtil.clearLoadingState('instagram')        // Clear loading state

// Full cross-device test
testUtil.testCrossDeviceSync('instagram', 2)   // 2-minute test

// Platform-specific checks
testUtil.compareStates('instagram')            // Check specific platform
testUtil.checkBackendProcessingStatus('twitter') // Check specific platform backend

Platforms: ${this.platforms.join(', ')}`);
  }
}

// Initialize the test utility
window.testUtil = new CrossDeviceLoadingStateTest();
testUtil.init().then(success => {
  if (success) {
    console.log(`✅ Cross-Device Loading State Test Utility ready!`);
    console.log(`Run 'testUtil.printHelp()' for available commands.`);
    console.log(`Quick test: testUtil.testCrossDeviceSync('instagram', 2)`);
  }
});

export default CrossDeviceLoadingStateTest;
