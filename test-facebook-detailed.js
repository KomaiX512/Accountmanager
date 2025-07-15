const axios = require('axios');

async function testFacebookConnection() {
  const userId = '681487244693083';
  
  console.log('🔍 Testing Facebook connection and token data...');
  
  try {
    // Test 1: Check if we can get token data
    console.log('\n📋 Test 1: Getting Facebook token data...');
    const tokenResponse = await axios.get(`http://localhost:3000/api/facebook-debug/${userId}`);
    console.log('✅ Token data retrieved:', JSON.stringify(tokenResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Error getting token data:', error.response?.data || error.message);
  }
  
  try {
    // Test 2: Check Facebook connection status
    console.log('\n📋 Test 2: Checking Facebook connection status...');
    const statusResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${userId}`);
    console.log('✅ Connection status:', JSON.stringify(statusResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Error getting connection status:', error.response?.data || error.message);
  }
  
  try {
    // Test 3: Try to send a DM with detailed error handling
    console.log('\n📋 Test 3: Testing DM sending with detailed logging...');
    const dmResponse = await axios.post(`http://localhost:3000/api/send-dm-reply/${userId}`, {
      sender_id: '987654321',
      text: 'Test message from detailed test',
      message_id: 'test_detailed_' + Date.now(),
      platform: 'facebook'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log('✅ DM sent successfully:', dmResponse.data);
  } catch (error) {
    console.log('❌ DM sending failed:');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Headers:', error.response?.headers);
  }
}

testFacebookConnection(); 