const axios = require('axios');

async function testFacebookUserIdDebug() {
  console.log('🔍 Debugging Facebook User ID Issue...\n');
  
  try {
    // Test 1: Check what user ID is stored in the connection
    console.log('📋 Test 1: Checking Facebook connection data');
    
    // We need to check what the actual Firebase user ID is first
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3'; // From previous logs
    
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    console.log('📊 Facebook connection data:', JSON.stringify(connectionResponse.data, null, 2));
    
    if (connectionResponse.data.facebook_page_id) {
      console.log(`✅ Facebook page ID found: ${connectionResponse.data.facebook_page_id}`);
      
      // Test 2: Check if this page ID matches the one in notifications
      const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${connectionResponse.data.facebook_page_id}?platform=facebook`);
      console.log(`📊 Notifications for page ID: ${notificationsResponse.data.length} found`);
      
      // Test 3: Check if the original user ID (681487244693083) has notifications
      const originalUserId = '681487244693083';
      const originalResponse = await axios.get(`http://localhost:3000/events-list/${originalUserId}?platform=facebook`);
      console.log(`📊 Notifications for original user ID: ${originalResponse.data.length} found`);
      
      // Test 4: Compare the two
      if (notificationsResponse.data.length === originalResponse.data.length) {
        console.log('✅ Both user IDs return the same number of notifications');
      } else {
        console.log('❌ Different notification counts between user IDs');
        console.log(`   Page ID (${connectionResponse.data.facebook_page_id}): ${notificationsResponse.data.length}`);
        console.log(`   Original ID (${originalUserId}): ${originalResponse.data.length}`);
      }
      
    } else {
      console.log('❌ No Facebook page ID found in connection data');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

testFacebookUserIdDebug(); 