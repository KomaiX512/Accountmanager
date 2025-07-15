const axios = require('axios');

async function fixFacebookConnection() {
  const userId = '681487244693083';
  
  console.log('🔧 Fixing Facebook connection for user:', userId);
  
  try {
    // Step 1: Get the debug data to understand current state
    console.log('\n📋 Step 1: Getting current Facebook debug data...');
    const debugResponse = await axios.get(`http://localhost:3000/api/facebook-debug/${userId}`);
    const debugData = debugResponse.data;
    
    console.log('✅ Debug data retrieved');
    console.log('Token data:', {
      hasAccessToken: debugData.tokenData?.hasAccessToken,
      pageId: debugData.tokenData?.pageId,
      isPersonalAccount: debugData.tokenData?.isPersonalAccount
    });
    
    // Step 2: Sync Facebook tokens with connection (this will get the real token)
    console.log('\n📋 Step 2: Syncing Facebook tokens with connection...');
    const syncResponse = await axios.post(`http://localhost:3000/api/sync-facebook-tokens/${userId}`);
    console.log('✅ Sync response:', syncResponse.data);
    
    // Step 3: Verify the connection was updated with real token
    console.log('\n📋 Step 3: Verifying connection was updated...');
    const verifyResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${userId}`);
    console.log('✅ Connection verification:', {
      ...verifyResponse.data,
      access_token: verifyResponse.data.access_token ? 
        verifyResponse.data.access_token.substring(0, 20) + '...' : 'No token'
    });
    
    // Step 4: Test DM sending with real token
    console.log('\n📋 Step 4: Testing DM sending with real token...');
    const dmResponse = await axios.post(`http://localhost:3000/api/send-dm-reply/${userId}`, {
      sender_id: '987654321',
      text: 'Test message after token sync',
      message_id: 'test_synced_' + Date.now(),
      platform: 'facebook'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ DM sent successfully after sync:', dmResponse.data);
    
  } catch (error) {
    console.log('❌ Error during fix:', error.response?.data || error.message);
    
    if (error.response?.data) {
      console.log('Error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

fixFacebookConnection(); 