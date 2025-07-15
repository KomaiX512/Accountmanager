const axios = require('axios');

async function testFacebookDebug() {
  const userId = '681487244693083'; // The problematic user ID
  
  try {
    console.log(`Testing Facebook debug for userId: ${userId}`);
    
    const response = await axios.get(`http://localhost:3000/api/facebook-debug/${userId}`);
    
    console.log('Facebook Debug Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.error) {
      console.log('❌ Error found:', response.data.error);
    } else {
      console.log('✅ Debug data retrieved successfully');
      
      if (response.data.tokenData) {
        console.log('Token Data:', response.data.tokenData);
      }
      
      if (response.data.apiTest) {
        console.log('API Test:', response.data.apiTest.success ? '✅' : '❌');
        if (!response.data.apiTest.success) {
          console.log('API Error:', response.data.apiTest.error);
        }
      }
      
      if (response.data.conversationsTest) {
        console.log('Conversations Test:', response.data.conversationsTest.success ? '✅' : '❌');
        if (!response.data.conversationsTest.success) {
          console.log('Conversations Error:', response.data.conversationsTest.error);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testFacebookDebug(); 