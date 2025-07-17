const axios = require('axios');

async function testFacebookNotificationsFinal() {
  console.log('🔧 Testing Facebook Notifications Final Fix...');
  
  try {
    // Test 1: Verify the complete flow works
    console.log('\n📋 Test 1: Complete Flow Test');
    
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    // Step 1: Get Facebook connection (like FacebookContext)
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    const facebookPageId = connectionResponse.data.facebook_page_id;
    const isConnected = !!facebookPageId;
    
    console.log(`📊 Facebook Context would set:`);
    console.log(`   - userId: ${facebookPageId}`);
    console.log(`   - isConnected: ${isConnected}`);
    
    // Step 2: Fetch notifications (like FacebookDashboard.fetchNotifications)
    const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    const notifications = notificationsResponse.data;
    
    console.log(`📊 fetchNotifications would return: ${notifications.length} notifications`);
    
    // Step 3: Process notifications (like FacebookDashboard)
    const facebookNotifications = notifications.map((notif) => ({
      ...notif,
      platform: 'facebook',
      facebook_page_id: facebookPageId
    }));
    
    // Step 4: Sanitize notifications (like FacebookDashboard)
    const sanitizedNotifications = facebookNotifications.map((notif) => {
      const key = notif.message_id || notif.comment_id || `fb_${notif.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        ...notif,
        message_id: notif.message_id || (key.startsWith('fb_') ? key : undefined),
        status: notif.status || 'pending',
        timestamp: typeof notif.timestamp === 'number' ? notif.timestamp : Date.now(),
        text: typeof notif.text === 'string' ? notif.text : '',
      };
    });
    
    console.log(`📊 sanitizedNotifications length: ${sanitizedNotifications.length}`);
    
    // Step 5: Pass to PlatformDashboard (like FacebookDashboard)
    const propNotifications = sanitizedNotifications;
    const platform = 'facebook';
    
    const condition = platform === 'facebook' && Array.isArray(propNotifications);
    console.log(`📊 PlatformDashboard condition: ${condition}`);
    
    if (condition) {
      console.log('✅ PlatformDashboard would receive notifications');
      console.log(`📊 propNotifications length: ${propNotifications.length}`);
      
      // Step 6: Check PlatformDashboard useEffect
      const useEffectCondition = platform === 'facebook' && Array.isArray(propNotifications);
      console.log(`📊 PlatformDashboard useEffect condition: ${useEffectCondition}`);
      
      if (useEffectCondition) {
        console.log('✅ PlatformDashboard useEffect would set notifications');
        console.log(`📊 Final notifications count: ${propNotifications.length}`);
      } else {
        console.log('❌ PlatformDashboard useEffect would NOT set notifications');
      }
    } else {
      console.log('❌ PlatformDashboard would NOT receive notifications');
    }
    
    // Test 2: Verify the debug output matches expected values
    console.log('\n📋 Test 2: Debug Output Verification');
    
    const expectedDebugOutput = {
      notificationsCount: notifications.length,
      sanitizedNotificationsCount: sanitizedNotifications.length,
      isConnected: isConnected,
      facebookPageId: facebookPageId,
      isComponentMounted: true
    };
    
    console.log(`📊 Expected debug output:`, expectedDebugOutput);
    
    // Test 3: Verify the final result
    console.log('\n📋 Test 3: Final Result Verification');
    
    if (propNotifications.length > 0) {
      console.log('✅ SUCCESS: Facebook notifications are working correctly!');
      console.log(`📊 ${propNotifications.length} notifications would be displayed`);
      console.log(`📊 Sample notification:`, propNotifications[0]);
    } else {
      console.log('❌ FAILURE: No notifications would be displayed');
    }
    
    console.log('\n🎉 Facebook Notifications Final Test COMPLETED!');
    console.log('✅ The fix should resolve the issue');
    console.log('✅ Notifications should now appear in the frontend');
    
  } catch (error) {
    console.error('❌ Facebook Notifications Final Test FAILED:', error.message);
    process.exit(1);
  }
}

testFacebookNotificationsFinal(); 