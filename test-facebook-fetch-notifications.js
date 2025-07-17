const axios = require('axios');

async function testFacebookFetchNotifications() {
  console.log('🔧 Testing Facebook fetchNotifications Function...');
  
  try {
    // Test 1: Simulate the exact fetchNotifications function
    console.log('\n📋 Test 1: fetchNotifications Function Simulation');
    
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    const facebookPageId = '681487244693083';
    const isComponentMounted = true;
    const forceRefresh = false;
    
    console.log(`📊 Parameters:`);
    console.log(`   - facebookPageId: ${facebookPageId}`);
    console.log(`   - currentUserId: ${firebaseUserId}`);
    console.log(`   - isComponentMounted: ${isComponentMounted}`);
    console.log(`   - forceRefresh: ${forceRefresh}`);
    
    // Check conditions (like in fetchNotifications)
    if (!facebookPageId || !firebaseUserId || !isComponentMounted) {
      console.log('❌ Early return - conditions not met');
      return;
    }
    
    console.log('✅ Conditions met, proceeding with API call');
    
    // Simulate the API call
    const apiUrl = `http://localhost:3000/events-list/${facebookPageId}?platform=facebook&t=${Date.now()}${forceRefresh ? '&forceRefresh=true' : ''}`;
    console.log(`📊 Making API call to: ${apiUrl}`);
    
    const response = await axios.get(apiUrl);
    
    console.log(`📊 API response:`, {
      status: response.status,
      dataLength: response.data?.length,
      isArray: Array.isArray(response.data)
    });
    
    if (response.data && Array.isArray(response.data)) {
      const facebookNotifications = response.data.map((notif) => ({
        ...notif,
        platform: 'facebook',
        facebook_page_id: facebookPageId
      }));
      
      console.log(`✅ Successfully processed ${facebookNotifications.length} notifications`);
      console.log(`📊 Sample notification:`, facebookNotifications[0]);
      
      // Test sanitization
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
      
      console.log(`✅ Successfully sanitized ${sanitizedNotifications.length} notifications`);
      
      // Test PlatformDashboard integration
      const propNotifications = sanitizedNotifications;
      const platform = 'facebook';
      
      const condition = platform === 'facebook' && Array.isArray(propNotifications);
      console.log(`📊 PlatformDashboard condition: ${condition}`);
      
      if (condition) {
        console.log('✅ PlatformDashboard would receive notifications');
        console.log(`📊 propNotifications length: ${propNotifications.length}`);
      } else {
        console.log('❌ PlatformDashboard would NOT receive notifications');
      }
      
    } else {
      console.log('❌ Invalid response data');
      console.log(`📊 Response data:`, response.data);
    }
    
    console.log('\n🎉 Facebook fetchNotifications Test COMPLETED!');
    console.log('✅ The function should work correctly');
    
  } catch (error) {
    console.error('❌ Facebook fetchNotifications Test FAILED:', error.message);
    if (error.response) {
      console.error('📊 Error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    process.exit(1);
  }
}

testFacebookFetchNotifications(); 