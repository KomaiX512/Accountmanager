const axios = require('axios');

async function testFacebookTokenDebug() {
  const userId = '681487244693083';
  
  console.log('Testing Facebook token debug...');
  console.log(`User ID: ${userId}`);

  try {
    // Test the token lookup endpoint
    const response = await axios.get(`http://localhost:3000/api/facebook-token-debug/${userId}`);
    console.log('✅ Token debug response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testFacebookTokenDebug(); 