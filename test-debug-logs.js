const axios = require('axios');

async function testDebugLogs() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Facebook notification retrieval with debug logs...\n');
  
  try {
    console.log('📋 Making request to: /events-list/612940588580162?platform=facebook');
    const response = await axios.get(`${baseUrl}/events-list/612940588580162?platform=facebook`);
    console.log(`✅ Response received: ${response.data.length} notifications`);
    
    if (response.data.length > 0) {
      console.log(`📊 First notification:`, JSON.stringify(response.data[0], null, 2));
    } else {
      console.log('📊 No notifications found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

// Run the test
testDebugLogs(); 