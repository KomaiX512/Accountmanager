/**
 * BYPASS FEATURE - CONSOLE TEST SCRIPT
 * 
 * Copy and paste this entire script into browser console to test the bypass feature.
 * This will check if all components are working correctly.
 */

(function() {
  console.log('\n🧪 ========== BYPASS FEATURE TEST SUITE ==========\n');
  
  const platform = 'instagram'; // Change to test different platforms
  const uid = localStorage.getItem('currentUserId') || 'test-uid';
  
  // CRITICAL: Verify userId is available
  if (!localStorage.getItem('currentUserId')) {
    console.warn('⚠️  WARNING: currentUserId not found in localStorage');
    console.warn('   This may cause bypass to fail');
    console.warn('   Trying to find userId from other sources...');
    
    // Try to find userId from other keys
    const keys = Object.keys(localStorage);
    const userKeys = keys.filter(k => k.includes('_username_') || k.includes('_accessed_'));
    if (userKeys.length > 0) {
      const sample = userKeys[0];
      const parts = sample.split('_');
      const possibleUid = parts[parts.length - 1];
      console.warn(`   Found possible UID: ${possibleUid}`);
      console.warn(`   Setting currentUserId...`);
      localStorage.setItem('currentUserId', possibleUid);
    }
  }
  
  let passCount = 0;
  let failCount = 0;
  
  function pass(test) {
    console.log(`✅ PASS: ${test}`);
    passCount++;
  }
  
  function fail(test, reason) {
    console.error(`❌ FAIL: ${test}`);
    console.error(`   Reason: ${reason}`);
    failCount++;
  }
  
  function info(message) {
    console.log(`ℹ️  ${message}`);
  }
  
  // TEST 1: Check if bypass button exists on page
  info('Test 1: Checking for bypass button...');
  const bypassButton = document.querySelector('.bypass-button');
  if (bypassButton) {
    pass('Bypass button found in DOM');
  } else {
    fail('Bypass button not found', 'Are you on the processing page?');
  }
  
  // TEST 2: Check localStorage structure
  info('Test 2: Checking localStorage keys...');
  const bypassKey = `${platform}_bypass_active_${uid}`;
  const timerKey = `${platform}_bypass_timer_${uid}`;
  const processingCountdown = `${platform}_processing_countdown`;
  const processingInfo = `${platform}_processing_info`;
  
  const hasBypass = localStorage.getItem(bypassKey) !== null;
  const hasTimer = localStorage.getItem(timerKey) !== null;
  const hasCountdown = localStorage.getItem(processingCountdown) !== null;
  const hasInfo = localStorage.getItem(processingInfo) !== null;
  
  if (hasBypass || hasTimer) {
    info('Bypass is currently ACTIVE');
    console.log('   Bypass flag:', localStorage.getItem(bypassKey));
    console.log('   Timer data:', localStorage.getItem(timerKey));
    pass('Bypass flags detected');
  } else {
    info('Bypass is NOT active (this is OK if not bypassed yet)');
  }
  
  if (hasCountdown && hasInfo) {
    pass('Processing state detected');
    const countdown = localStorage.getItem(processingCountdown);
    const info = JSON.parse(localStorage.getItem(processingInfo));
    const remaining = Math.ceil((parseInt(countdown) - Date.now()) / 60000);
    console.log(`   Remaining: ${remaining} minutes`);
    console.log('   Username:', info.username);
  } else {
    fail('Processing state not found', 'Have you started processing yet?');
  }
  
  // TEST 3: Check TopBar timer element
  info('Test 3: Checking TopBar timer element...');
  const platformTimer = document.querySelector('.platform-timer');
  if (platformTimer) {
    pass('TopBar timer element found');
    console.log('   Timer text:', platformTimer.textContent);
  } else {
    info('TopBar timer not found (OK if bypass not active)');
  }
  
  // TEST 4: Validate timer data structure
  info('Test 4: Validating timer data structure...');
  if (hasTimer) {
    try {
      const timerData = JSON.parse(localStorage.getItem(timerKey));
      const required = ['endTime', 'startTime', 'bypassedAt', 'platform'];
      const hasAll = required.every(key => timerData.hasOwnProperty(key));
      
      if (hasAll) {
        pass('Timer data structure valid');
        console.log('   Timer data:', timerData);
        
        // Check if times are reasonable
        const now = Date.now();
        const remaining = timerData.endTime - now;
        const elapsed = now - timerData.bypassedAt;
        
        if (remaining > 0 && remaining < 20 * 60 * 1000) {
          pass('Timer remaining time is reasonable');
          console.log(`   Remaining: ${Math.ceil(remaining/60000)} minutes`);
        } else {
          fail('Timer remaining time seems wrong', `Remaining: ${remaining}ms`);
        }
        
        if (elapsed >= 0 && elapsed < 20 * 60 * 1000) {
          pass('Bypass elapsed time is reasonable');
          console.log(`   Bypassed ${Math.floor(elapsed/60000)} minutes ago`);
        } else {
          fail('Bypass elapsed time seems wrong', `Elapsed: ${elapsed}ms`);
        }
      } else {
        fail('Timer data structure incomplete', `Missing: ${required.filter(k => !timerData.hasOwnProperty(k)).join(', ')}`);
      }
    } catch (e) {
      fail('Timer data parsing failed', e.message);
    }
  }
  
  // TEST 5: Check CSS classes
  info('Test 5: Checking CSS classes...');
  const bypassSection = document.querySelector('.bypass-section');
  if (bypassSection) {
    pass('Bypass section found');
  } else {
    info('Bypass section not found (OK if not on processing page)');
  }
  
  const platformWrapper = document.querySelector('.platform-button-wrapper');
  if (platformWrapper) {
    pass('Platform button wrapper found');
  } else {
    info('Platform button wrapper not found (OK if not on dashboard)');
  }
  
  // TEST 6: Simulate bypass (if on processing page)
  info('Test 6: Bypass simulation check...');
  if (bypassButton && !hasBypass) {
    console.log('   To test bypass, click the "Access Dashboard" button');
    console.log('   Then run this script again to verify');
    info('Manual test required');
  } else if (hasBypass) {
    pass('Bypass already active (good for testing)');
  }
  
  // TEST 7: Check for console errors
  info('Test 7: Checking for errors in console...');
  // This is manual - ask user to check
  console.log('   Please check console for any red error messages');
  info('Manual verification required');
  
  // TEST 8: Performance check
  info('Test 8: Checking update intervals...');
  console.log('   TopBar should poll every 1000ms (1 second)');
  console.log('   Watch console for "⏱️ TOPBAR TIMER" logs');
  
  let timerLogs = 0;
  const originalLog = console.log;
  console.log = function(...args) {
    if (args[0] && args[0].includes('TOPBAR TIMER')) {
      timerLogs++;
      if (timerLogs === 1) {
        console.log = originalLog;
        pass('TopBar polling detected');
      }
    }
    originalLog.apply(console, args);
  };
  
  setTimeout(() => {
    console.log = originalLog;
    if (timerLogs === 0) {
      info('No TopBar polling detected (may not be on dashboard)');
    }
  }, 2000);
  
  // SUMMARY
  setTimeout(() => {
    console.log('\n📊 ========== TEST SUMMARY ==========\n');
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    
    const total = passCount + failCount;
    const percentage = total > 0 ? Math.round((passCount / total) * 100) : 0;
    
    console.log(`📈 Success Rate: ${percentage}%`);
    
    if (percentage >= 80) {
      console.log('\n🎉 IMPLEMENTATION LOOKS GOOD!\n');
    } else if (percentage >= 50) {
      console.log('\n⚠️  SOME ISSUES DETECTED - Check failures above\n');
    } else {
      console.log('\n🚨 CRITICAL ISSUES - Review implementation\n');
    }
    
    console.log('====================================\n');
  }, 2500);
  
  // HELPER FUNCTIONS
  console.log('\n🔧 Helper functions loaded:');
  console.log('   - testBypass()     : Trigger bypass programmatically');
  console.log('   - checkTimers()    : Show all timer data');
  console.log('   - clearBypass()    : Remove bypass flags');
  console.log('   - mockFastTimer()  : Set timer to expire in 1 minute\n');
  
  window.testBypass = function() {
    const btn = document.querySelector('.bypass-button');
    if (btn) {
      console.log('🚀 Triggering bypass...');
      btn.click();
    } else {
      console.error('❌ Bypass button not found');
    }
  };
  
  window.checkTimers = function() {
    console.log('\n⏱️  ========== TIMER DATA ==========');
    ['instagram', 'twitter', 'facebook', 'linkedin'].forEach(p => {
      const bypass = localStorage.getItem(`${p}_bypass_active_${uid}`);
      const timer = localStorage.getItem(`${p}_bypass_timer_${uid}`);
      
      if (bypass || timer) {
        console.log(`\n${p.toUpperCase()}:`);
        if (bypass) console.log('  Bypass active:', new Date(parseInt(bypass)));
        if (timer) {
          try {
            const data = JSON.parse(timer);
            const remaining = Math.ceil((data.endTime - Date.now()) / 60000);
            console.log('  Timer data:', data);
            console.log(`  Remaining: ${remaining} minutes`);
          } catch (e) {
            console.error('  Timer data corrupted:', e);
          }
        }
      }
    });
    console.log('==================================\n');
  };
  
  window.clearBypass = function() {
    console.log('🧹 Clearing all bypass flags...');
    ['instagram', 'twitter', 'facebook', 'linkedin'].forEach(p => {
      localStorage.removeItem(`${p}_bypass_active_${uid}`);
      localStorage.removeItem(`${p}_bypass_timer_${uid}`);
    });
    console.log('✅ Bypass flags cleared');
  };
  
  window.mockFastTimer = function(minutes = 1) {
    const now = Date.now();
    const duration = minutes * 60 * 1000;
    
    // Update processing timer
    localStorage.setItem(`${platform}_processing_countdown`, (now + duration).toString());
    
    const info = JSON.parse(localStorage.getItem(`${platform}_processing_info`) || '{}');
    info.endTime = now + duration;
    info.totalDuration = duration;
    localStorage.setItem(`${platform}_processing_info`, JSON.stringify(info));
    
    // Update bypass timer
    const bypass = JSON.parse(localStorage.getItem(`${platform}_bypass_timer_${uid}`) || '{}');
    bypass.endTime = now + duration;
    localStorage.setItem(`${platform}_bypass_timer_${uid}`, JSON.stringify(bypass));
    
    console.log(`✅ Timer set to expire in ${minutes} minute(s)`);
  };
  
})();
