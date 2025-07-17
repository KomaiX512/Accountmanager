const axios = require('axios');

async function testFacebookApiResponse() {
  console.log('🔍 Testing Facebook API Response Debugging');
  
  try {
    // Test the exact API call that's failing
    const facebookPageId = '681487244693083';
    const apiUrl = `https://sentientm.com/events-list/${facebookPageId}?platform=facebook&t=${Date.now()}`;
    
    console.log(`📊 Making API call to: ${apiUrl}`);
    
    const response = await axios.get(apiUrl);
    
    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response headers:`, response.headers);
    
    // Log the raw response data
    console.log(`📊 Raw response data:`, JSON.stringify(response.data, null, 2));
    
    // Check if response.data is an array
    console.log(`📊 Response data type: ${typeof response.data}`);
    console.log(`📊 Response data is array: ${Array.isArray(response.data)}`);
    console.log(`📊 Response data length: ${response.data?.length}`);
    
    if (response.data && Array.isArray(response.data)) {
      console.log('✅ Response data is a valid array');
      console.log(`📊 Array length: ${response.data.length}`);
      
      if (response.data.length > 0) {
        console.log('📝 Sample notification:');
        console.log(JSON.stringify(response.data[0], null, 2));
      }
    } else {
      console.log('❌ Response data is NOT a valid array');
      console.log(`📊 Actual data:`, response.data);
    }
    
    // Test the frontend processing logic
    console.log('\n📋 Testing Frontend Processing Logic');
    
    if (response.data && Array.isArray(response.data)) {
      const facebookNotifications = response.data.map((notif) => ({
        ...notif,
        platform: 'facebook',
        facebook_page_id: facebookPageId
      }));
      
      console.log(`✅ Successfully processed ${facebookNotifications.length} notifications`);
      
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
      console.log('❌ Cannot process notifications - invalid response data');
    }
    
    console.log('\n🎉 Facebook API Response Test COMPLETED!');
    
  } catch (error) {
    console.error('❌ Error testing Facebook API response:', error.response?.data || error.message);
  }
}

// Run the test
testFacebookApiResponse().catch(console.error); 