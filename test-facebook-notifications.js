const axios = require('axios');

async function testFacebookNotifications() {
  console.log('🧪 Testing Facebook Notifications...');
  
  try {
    // Test 1: Check Facebook connection
    console.log('\n📋 Test 1: Facebook Connection');
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    console.log('✅ Connection API response:', connectionResponse.data);
    
    if (!connectionResponse.data.facebook_page_id) {
      throw new Error('No Facebook page ID found in connection data');
    }
    
    const facebookPageId = connectionResponse.data.facebook_page_id;
    console.log(`📊 Facebook Page ID: ${facebookPageId}`);
    
    // Test 2: Fetch notifications with the Facebook page ID
    console.log('\n📋 Test 2: Notifications Fetch');
    const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    console.log(`✅ Notifications API response status: ${notificationsResponse.status}`);
    console.log(`📊 Notifications count: ${notificationsResponse.data.length}`);
    
    if (notificationsResponse.data.length > 0) {
      console.log('📝 Sample notification structure:');
      console.log(JSON.stringify(notificationsResponse.data[0], null, 2));
      
      // Test 3: Check if notifications have required fields
      const requiredFields = ['type', 'text', 'timestamp', 'platform'];
      const sampleNotification = notificationsResponse.data[0];
      
      const missingFields = requiredFields.filter(field => !sampleNotification.hasOwnProperty(field));
      if (missingFields.length > 0) {
        console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      } else {
        console.log('✅ All required fields present');
      }
    }
    
    // Test 4: Test the exact same call that PlatformDashboard makes
    console.log('\n📋 Test 4: PlatformDashboard Simulation');
    const dashboardResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    console.log(`✅ Dashboard simulation: ${dashboardResponse.data.length} notifications`);
    
    // Test 5: Check if there are any differences
    if (notificationsResponse.data.length === dashboardResponse.data.length) {
      console.log('✅ Both calls return the same number of notifications');
    } else {
      console.log('❌ Different notification counts between calls');
    }
    
    console.log('\n🎉 Facebook notification test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testFacebookNotifications(); 