const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  backendUrl: 'http://localhost:3000',
  ragServerUrl: 'http://localhost:3001',
  facebookUserId: '681487244693083',
  facebookPageId: '612940588580162',
  testMessage: 'Hello, I have a question about your products.',
  accessToken: 'EAAIQ8qMWARcBPAkgDU11Ru1bw2IVHQgdMMZByZAdhf3k2tNe7EhHJuBY1hOPBszkhx0iVbJUrj2NPwKwYlUqE8LM6ZC9vT3ue8MY2MCYAtq3ZAHP9qhekSN1O1KITs3NBEUDlwUAFEqHqA76X7NIJPINwncV2eXWgR3quVhOalZA6ZCxj67hMPJHt6NHlDXfKsaOZC2PA7NW9jfYb2SVyzRjDxW'
};

// Test data
const testNotification = {
  type: 'message',
  facebook_user_id: TEST_CONFIG.facebookPageId,
  sender_id: '123456789',
  message_id: `test_msg_${Date.now()}`,
  text: TEST_CONFIG.testMessage,
  timestamp: Date.now(),
  received_at: new Date().toISOString(),
  status: 'pending',
  platform: 'facebook'
};

async function sendFacebookReply(pageId, message, accessToken) {
  // This will post a comment to the page feed as the page itself (for testing)
  // In real use, you would reply to a message or comment using the correct Graph API endpoint
  try {
    const url = `https://graph.facebook.com/${pageId}/feed`;
    const response = await axios.post(url, {
      message,
      access_token: accessToken
    });
    console.log('✅ Facebook Graph API reply sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Facebook Graph API reply failed:', error.response?.data || error.message);
    return null;
  }
}

async function testFullPipeline() {
  console.log('\n🔍 Testing Full Facebook AI Reply Pipeline...');
  try {
    // Step 1: Generate AI reply via backend
    const aiReplyResponse = await axios.post(`${TEST_CONFIG.backendUrl}/api/instant-reply`, {
      username: TEST_CONFIG.facebookUserId,
      notification: testNotification
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    const aiReply = aiReplyResponse.data?.reply;
    if (!aiReply) {
      console.error('❌ AI reply was not generated.');
      return;
    }
    console.log('✅ AI reply generated:', aiReply.substring(0, 100) + '...');

    // Step 2: Send the AI reply to Facebook using the provided access token
    const fbResult = await sendFacebookReply(TEST_CONFIG.facebookPageId, aiReply, TEST_CONFIG.accessToken);
    if (fbResult && fbResult.id) {
      console.log('🎉 Full pipeline test successful! Facebook post ID:', fbResult.id);
    } else {
      console.error('❌ Failed to post AI reply to Facebook.');
    }
  } catch (error) {
    console.error('❌ Full pipeline test failed:', error.response?.data || error.message);
  }
}

// Run the full pipeline test
if (require.main === module) {
  testFullPipeline().catch(console.error);
}

module.exports = {
  testFullPipeline
}; 