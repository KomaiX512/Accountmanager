/**
 * DEBUG BYPASS STATE - Run in console AFTER clicking "Access Dashboard"
 * 
 * This will show exactly what's in localStorage and what guards see.
 */

(function() {
  console.log('\n🔍 ========== BYPASS STATE DEBUG ==========\n');
  
  // Get platform from URL
  const url = window.location.pathname;
  const platform = url.includes('twitter') ? 'twitter' :
                   url.includes('facebook') ? 'facebook' :
                   url.includes('linkedin') ? 'linkedin' : 'instagram';
  
  console.log(`Current URL: ${url}`);
  console.log(`Detected Platform: ${platform}`);
  
  // Get user ID
  const userId = localStorage.getItem('currentUserId');
  console.log(`User ID: ${userId}`);
  
  if (!userId) {
    console.error('❌ FATAL: No currentUserId found!');
    console.log('Looking for user ID in other keys...');
    const keys = Object.keys(localStorage);
    const userKeys = keys.filter(k => k.includes('_username_'));
    console.log('Found user keys:', userKeys);
    return;
  }
  
  // Check bypass flag
  const bypassKey = `${platform}_bypass_active_${userId}`;
  const bypassValue = localStorage.getItem(bypassKey);
  
  console.log(`\n📊 BYPASS FLAG CHECK:`);
  console.log(`  Key: ${bypassKey}`);
  console.log(`  Value: ${bypassValue}`);
  console.log(`  Is Active: ${bypassValue !== null}`);
  
  if (bypassValue) {
    const timestamp = parseInt(bypassValue, 10);
    const age = Date.now() - timestamp;
    console.log(`  Age: ${Math.floor(age / 1000)} seconds`);
  } else {
    console.error(`❌ BYPASS FLAG NOT SET!`);
  }
  
  // Check processing keys
  const processingCountdownKey = `${platform}_processing_countdown`;
  const processingInfoKey = `${platform}_processing_info`;
  const processingCountdown = localStorage.getItem(processingCountdownKey);
  const processingInfo = localStorage.getItem(processingInfoKey);
  
  console.log(`\n📊 PROCESSING KEYS:`);
  console.log(`  Countdown Key: ${processingCountdownKey}`);
  console.log(`  Countdown Value: ${processingCountdown}`);
  console.log(`  Info Key: ${processingInfoKey}`);
  console.log(`  Info Value: ${processingInfo ? 'SET' : 'null'}`);
  
  if (processingCountdown) {
    console.warn(`⚠️ WARNING: Processing countdown still exists!`);
    const endTime = parseInt(processingCountdown, 10);
    const remaining = endTime - Date.now();
    console.warn(`   Remaining: ${Math.ceil(remaining / 60000)} minutes`);
    console.warn(`   This will cause guards to redirect!`);
  } else {
    console.log(`✅ Processing countdown cleared`);
  }
  
  // Check timer data
  const timerKey = `${platform}_bypass_timer_${userId}`;
  const timerData = localStorage.getItem(timerKey);
  
  console.log(`\n📊 BYPASS TIMER:`);
  console.log(`  Key: ${timerKey}`);
  console.log(`  Value: ${timerData ? 'SET' : 'null'}`);
  
  if (timerData) {
    try {
      const parsed = JSON.parse(timerData);
      console.log(`  Data:`, parsed);
    } catch (e) {
      console.error(`  Parse error:`, e);
    }
  }
  
  // Test isBypassActive function (simulate)
  console.log(`\n🧪 SIMULATED BYPASS CHECK:`);
  const simulatedBypass = bypassValue !== null;
  console.log(`  isBypassActive() would return: ${simulatedBypass}`);
  
  if (!simulatedBypass) {
    console.error(`❌ BYPASS CHECK WILL FAIL!`);
    console.error(`   Guards will NOT skip validation`);
    console.error(`   Dashboard will NOT be accessible`);
  } else {
    console.log(`✅ BYPASS CHECK WILL PASS`);
    console.log(`   Guards should skip validation`);
    console.log(`   Dashboard should be accessible`);
  }
  
  // Check all localStorage keys for debugging
  console.log(`\n📊 ALL RELEVANT KEYS:`);
  const allKeys = Object.keys(localStorage);
  const relevantKeys = allKeys.filter(k => 
    k.includes(platform) || 
    k.includes('bypass') || 
    k.includes('processing') ||
    k.includes('currentUserId')
  );
  
  relevantKeys.forEach(key => {
    const value = localStorage.getItem(key);
    const displayValue = value && value.length > 100 ? value.substring(0, 100) + '...' : value;
    console.log(`  ${key}: ${displayValue}`);
  });
  
  // Final verdict
  console.log(`\n🎯 FINAL VERDICT:`);
  if (bypassValue !== null && processingCountdown === null) {
    console.log(`✅ Everything looks correct!`);
    console.log(`✅ Bypass flag is set`);
    console.log(`✅ Processing countdown is cleared`);
    console.log(`✅ Dashboard SHOULD be accessible`);
    console.log(`\nIf still not accessible, the problem is:`);
    console.log(`1. Frontend guards not calling isBypassActive()`);
    console.log(`2. Backend not respecting bypassActive flag`);
    console.log(`3. Another guard/redirect we haven't found`);
  } else {
    console.error(`❌ Configuration is WRONG!`);
    if (bypassValue === null) {
      console.error(`   - Bypass flag NOT set`);
      console.error(`   - Button click handler may not be working`);
    }
    if (processingCountdown !== null) {
      console.error(`   - Processing countdown NOT cleared`);
      console.error(`   - Guards will keep redirecting`);
    }
  }
  
  console.log(`\n🔍 ========== END DEBUG ==========\n`);
})();
