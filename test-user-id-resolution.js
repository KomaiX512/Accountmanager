const axios = require('axios');

async function testUserIdResolution() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Facebook user ID resolution...\n');
  
  try {
    // Test 1: Using page ID (should resolve to user ID)
    console.log('📋 Test 1: Using page ID (612940588580162)');
    const response1 = await axios.get(`${baseUrl}/events-list/612940588580162?platform=facebook`);
    console.log(`✅ Page ID request successful: ${response1.data.length} notifications found`);
    
    if (response1.data.length > 0) {
      console.log(`📊 First notification:`, JSON.stringify(response1.data[0], null, 2));
    }
    
    // Test 2: Using user ID directly (should work directly)
    console.log('\n📋 Test 2: Using user ID directly (681487244693083)');
    const response2 = await axios.get(`${baseUrl}/events-list/681487244693083?platform=facebook`);
    console.log(`✅ User ID request successful: ${response2.data.length} notifications found`);
    
    if (response2.data.length > 0) {
      console.log(`📊 First notification:`, JSON.stringify(response2.data[0], null, 2));
    }
    
    // Test 3: Compare results
    console.log('\n📋 Test 3: Comparing results');
    const pageIdCount = response1.data.length;
    const userIdCount = response2.data.length;
    
    if (pageIdCount === userIdCount) {
      console.log(`✅ SUCCESS: Both requests returned ${pageIdCount} notifications`);
      console.log(`✅ User ID resolution is working correctly!`);
    } else {
      console.log(`❌ FAILURE: Page ID returned ${pageIdCount}, User ID returned ${userIdCount}`);
      console.log(`❌ User ID resolution is not working correctly`);
    }
    
    console.log('\n🎉 Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

// Run the test
testUserIdResolution(); 