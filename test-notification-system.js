const axios = require('axios');

async function testNotificationSystem() {
  const baseUrl = 'http://localhost:3000';
  const testUserId = '681487244693083'; // Facebook user ID from logs
  
  console.log('🧪 Testing new R2-first notification system...\n');
  
  try {
    // Test 1: Normal fetch (should use R2 first)
    console.log('📋 Test 1: Normal fetch (R2-first approach)');
    const response1 = await axios.get(`${baseUrl}/events-list/${testUserId}?platform=facebook`);
    console.log(`✅ Normal fetch successful: ${response1.data.length} notifications found`);
    console.log(`📊 Response:`, JSON.stringify(response1.data.slice(0, 2), null, 2));
    
    // Test 2: Force refresh (should try API if R2 is empty)
    console.log('\n📋 Test 2: Force refresh (API fallback)');
    const response2 = await axios.get(`${baseUrl}/events-list/${testUserId}?platform=facebook&forceRefresh=true`);
    console.log(`✅ Force refresh successful: ${response2.data.length} notifications found`);
    console.log(`📊 Response:`, JSON.stringify(response2.data.slice(0, 2), null, 2));
    
    // Test 3: Check if notifications are properly formatted
    console.log('\n📋 Test 3: Notification format validation');
    if (response1.data.length > 0) {
      const notification = response1.data[0];
      const requiredFields = ['type', 'platform', 'status'];
      const hasRequiredFields = requiredFields.every(field => notification.hasOwnProperty(field));
      console.log(`✅ Notification format valid: ${hasRequiredFields ? 'PASS' : 'FAIL'}`);
      console.log(`📊 Sample notification:`, JSON.stringify(notification, null, 2));
    } else {
      console.log('⚠️  No notifications found to validate format');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

// Run the test
testNotificationSystem(); 