const axios = require('axios');

async function testFacebookEndpointFix() {
  console.log('🔧 Testing Facebook Endpoint Fix...');
  
  const userId = '681487244693083';
  const testData = {
    sender_id: '23878882825079209',
    text: 'Test message from endpoint fix',
    message_id: 'test_endpoint_fix_' + Date.now(),
    platform: 'facebook'
  };
  
  try {
    // Test 1: Check if endpoint exists
    console.log('\n📋 Test 1: Checking endpoint availability...');
    try {
      const response = await axios.post(`http://localhost:3000/api/send-dm-reply/${userId}`, testData, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      console.log('✅ Endpoint responded:', response.status, response.data);
    } catch (error) {
      console.log('❌ Endpoint error:', {
        status: error.response?.status,
        message: error.response?.data?.error || error.message
      });
      
      if (error.response?.status === 404) {
        console.log('🔧 Endpoint not found - need to add Facebook handling');
      }
    }
    
    // Test 2: Check current endpoint structure
    console.log('\n📋 Test 2: Checking current endpoint structure...');
    try {
      const response = await axios.get('http://localhost:3000/api/facebook-connection/' + userId);
      console.log('✅ Facebook connection endpoint works');
    } catch (error) {
      console.log('❌ Facebook connection endpoint error:', error.response?.status);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFacebookEndpointFix(); 