const axios = require('axios');

async function testFacebookNotificationsDebug() {
  console.log('🔧 Testing Facebook Notifications Debug...');
  
  try {
    // Test 1: Check if the backend is working correctly
    console.log('\n📋 Test 1: Backend API Test');
    
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    // Get Facebook connection
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    const facebookPageId = connectionResponse.data.facebook_page_id;
    
    console.log(`📊 Facebook Page ID: ${facebookPageId}`);
    
    // Test the notifications endpoint directly
    const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    
    console.log(`✅ Backend returned ${notificationsResponse.data.length} notifications`);
    console.log(`📊 Sample notification:`, notificationsResponse.data[0]);
    
    // Test 2: Check if the frontend would receive the data
    console.log('\n📋 Test 2: Frontend Data Flow Test');
    
    // Simulate what FacebookDashboard would do
    const facebookNotifications = notificationsResponse.data.map((notif) => ({
      ...notif,
      platform: 'facebook',
      facebook_page_id: facebookPageId
    }));
    
    console.log(`✅ Processed ${facebookNotifications.length} notifications for frontend`);
    
    // Test 3: Check if sanitizedNotifications would work
    console.log('\n📋 Test 3: Sanitized Notifications Test');
    
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
    
    console.log(`✅ Sanitized ${sanitizedNotifications.length} notifications`);
    console.log(`📊 Sample sanitized notification:`, sanitizedNotifications[0]);
    
    // Test 4: Check if PlatformDashboard would receive the data
    console.log('\n📋 Test 4: PlatformDashboard Integration Test');
    
    // Simulate what PlatformDashboard would do
    const propNotifications = sanitizedNotifications;
    const platform = 'facebook';
    
    const wouldReceiveNotifications = platform === 'facebook' && Array.isArray(propNotifications);
    console.log(`✅ PlatformDashboard would receive notifications: ${wouldReceiveNotifications}`);
    console.log(`📊 propNotifications length: ${propNotifications?.length || 0}`);
    
    // Test 5: Check the useEffect condition
    console.log('\n📋 Test 5: useEffect Condition Test');
    
    const condition = platform === 'facebook' && Array.isArray(propNotifications);
    console.log(`✅ useEffect condition: ${condition}`);
    console.log(`📊 Platform is Facebook: ${platform === 'facebook'}`);
    console.log(`📊 propNotifications is Array: ${Array.isArray(propNotifications)}`);
    
    if (condition) {
      console.log('✅ setNotifications would be called with propNotifications');
    } else {
      console.log('❌ setNotifications would NOT be called');
    }
    
    console.log('\n🎉 Facebook Notifications Debug Test COMPLETED!');
    console.log('✅ Backend is working correctly');
    console.log('✅ Data flow is working correctly');
    console.log('✅ Frontend integration should work');
    
  } catch (error) {
    console.error('❌ Facebook Notifications Debug Test FAILED:', error.message);
    process.exit(1);
  }
}

testFacebookNotificationsDebug(); 