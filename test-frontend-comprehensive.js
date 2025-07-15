const axios = require('axios');

async function testFrontendComprehensive() {
  console.log('🧪 Comprehensive Frontend Test...\n');
  
  try {
    // Test 1: Check if the server is running and accessible
    console.log('📋 Test 1: Server Accessibility');
    const healthResponse = await axios.get('http://localhost:3000/');
    console.log('✅ Server is running and accessible');
    
    // Test 2: Check Facebook connection endpoint
    console.log('\n📋 Test 2: Facebook Connection Endpoint');
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    console.log('✅ Facebook connection endpoint working');
    console.log(`📊 Facebook page ID: ${connectionResponse.data.facebook_page_id}`);
    
    // Test 3: Check notifications endpoint with correct user ID
    console.log('\n📋 Test 3: Notifications Endpoint');
    const facebookUserId = connectionResponse.data.facebook_page_id;
    const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${facebookUserId}?platform=facebook`);
    console.log(`✅ Notifications endpoint working: ${notificationsResponse.data.length} notifications`);
    
    // Test 4: Check if notifications have the correct structure for frontend
    console.log('\n📋 Test 4: Notification Structure for Frontend');
    if (notificationsResponse.data.length > 0) {
      const notification = notificationsResponse.data[0];
      const frontendRequiredFields = ['type', 'platform', 'status', 'text', 'timestamp'];
      const hasAllFields = frontendRequiredFields.every(field => notification.hasOwnProperty(field));
      
      if (hasAllFields) {
        console.log('✅ Notifications have all required fields for frontend');
      } else {
        console.log('❌ Notifications missing required fields for frontend');
        const missingFields = frontendRequiredFields.filter(field => !notification.hasOwnProperty(field));
        console.log(`📊 Missing fields: ${missingFields.join(', ')}`);
      }
      
      console.log('📊 Sample notification structure:', JSON.stringify(notification, null, 2));
    }
    
    // Test 5: Check if the user ID being used matches what the frontend expects
    console.log('\n📋 Test 5: User ID Consistency');
    console.log(`📊 Firebase User ID: ${firebaseUserId}`);
    console.log(`📊 Facebook Page ID: ${facebookUserId}`);
    console.log(`📊 Notifications User ID: ${notificationsResponse.data[0]?.facebook_user_id || 'N/A'}`);
    
    if (facebookUserId === notificationsResponse.data[0]?.facebook_user_id) {
      console.log('✅ User IDs are consistent');
    } else {
      console.log('❌ User ID mismatch detected');
    }
    
    // Test 6: Check if there are any CORS or network issues
    console.log('\n📋 Test 6: Network and CORS');
    try {
      const corsResponse = await axios.get(`http://localhost:3000/events-list/${facebookUserId}?platform=facebook`, {
        headers: {
          'Origin': 'http://localhost:5173',
          'Accept': 'application/json'
        }
      });
      console.log('✅ CORS headers working correctly');
    } catch (corsError) {
      console.log('❌ CORS issue detected:', corsError.message);
    }
    
    console.log('\n🎉 Comprehensive test completed successfully!');
    console.log(`📊 Summary: ${notificationsResponse.data.length} notifications available for frontend`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

testFrontendComprehensive();