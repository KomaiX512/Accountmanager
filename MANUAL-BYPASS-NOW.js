/**
 * MANUAL BYPASS - RUN THIS IN CONSOLE
 * 
 * If button not working, paste this entire script in browser console and press Enter.
 * It will manually trigger the bypass.
 */

(function() {
  console.log('\n🚨🚨🚨 MANUAL BYPASS STARTING 🚨🚨🚨\n');
  
  // Get current platform from URL
  const urlPlatform = window.location.pathname.includes('twitter') ? 'twitter' :
                     window.location.pathname.includes('facebook') ? 'facebook' :
                     window.location.pathname.includes('linkedin') ? 'linkedin' : 'instagram';
  
  console.log(`Platform detected: ${urlPlatform}`);
  
  // Get user ID
  let userId = localStorage.getItem('currentUserId');
  
  if (!userId) {
    console.warn('⚠️ currentUserId not found, searching for it...');
    const keys = Object.keys(localStorage);
    const userKey = keys.find(k => k.includes('_username_') || k.includes('_accessed_'));
    if (userKey) {
      const parts = userKey.split('_');
      userId = parts[parts.length - 1];
      localStorage.setItem('currentUserId', userId);
      console.log(`✅ Found and set userId: ${userId}`);
    } else {
      console.error('❌ FATAL: Cannot find user ID!');
      alert('Error: Cannot find user ID. Please login again.');
      return;
    }
  }
  
  console.log(`User ID: ${userId}`);
  
  // Set bypass flag
  const bypassKey = `${urlPlatform}_bypass_active_${userId}`;
  const bypassTimestamp = Date.now();
  localStorage.setItem(bypassKey, bypassTimestamp.toString());
  console.log(`✅ Bypass flag set: ${bypassKey}`);
  
  // Get timer data
  const processingCountdownKey = `${urlPlatform}_processing_countdown`;
  const processingInfoKey = `${urlPlatform}_processing_info`;
  const originalCountdown = localStorage.getItem(processingCountdownKey);
  const originalInfo = localStorage.getItem(processingInfoKey);
  
  let endTime = Date.now() + (15 * 60 * 1000);
  let startTime = Date.now();
  let username = 'user';
  
  if (originalCountdown) {
    endTime = parseInt(originalCountdown, 10);
    console.log(`✅ Found processing countdown: ${new Date(endTime)}`);
  }
  
  if (originalInfo) {
    try {
      const info = JSON.parse(originalInfo);
      startTime = info.startTime || Date.now();
      username = info.username || 'user';
      console.log(`✅ Found processing info - username: ${username}`);
    } catch (e) {
      console.warn('⚠️ Could not parse processing info');
    }
  }
  
  // Save timer data for TopBar
  const timerKey = `${urlPlatform}_bypass_timer_${userId}`;
  const timerData = {
    endTime,
    startTime,
    bypassedAt: bypassTimestamp,
    platform: urlPlatform,
    username
  };
  
  localStorage.setItem(timerKey, JSON.stringify(timerData));
  console.log(`✅ Timer data saved:`, timerData);
  
  // CRITICAL: Clear processing keys
  localStorage.removeItem(processingCountdownKey);
  localStorage.removeItem(processingInfoKey);
  console.log(`✅ Cleared processing countdown`);
  console.log(`✅ Cleared processing info`);
  
  // Verify state
  console.log('\n📊 FINAL STATE CHECK:');
  console.log(`  Bypass flag: ${localStorage.getItem(bypassKey)}`);
  console.log(`  Timer data: ${localStorage.getItem(timerKey) ? 'SET' : 'MISSING'}`);
  console.log(`  Processing countdown: ${localStorage.getItem(processingCountdownKey) || 'CLEARED ✅'}`);
  console.log(`  Processing info: ${localStorage.getItem(processingInfoKey) || 'CLEARED ✅'}`);
  
  // Navigate to dashboard
  const dashboardPath = urlPlatform === 'instagram' ? '/dashboard' :
                       urlPlatform === 'twitter' ? '/twitter-dashboard' :
                       urlPlatform === 'facebook' ? '/facebook-dashboard' :
                       '/linkedin-dashboard';
  
  console.log(`\n🚀 NAVIGATING TO: ${dashboardPath}`);
  console.log('🚀 Using window.location.href for hard navigation\n');
  
  // Wait 100ms then navigate
  setTimeout(() => {
    window.location.href = dashboardPath;
  }, 100);
  
  console.log('✅ Navigation scheduled in 100ms...');
  console.log('🚨🚨🚨 MANUAL BYPASS COMPLETE 🚨🚨🚨\n');
  
})();
