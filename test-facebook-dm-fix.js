const axios = require('axios');

async function testFacebookDMReply() {
  const userId = '681487244693083'; // The user ID from the logs
  const senderId = '987654321'; // The sender ID from the logs
  const testMessage = 'Test message from fixed implementation';
  const messageId = 'test_message_' + Date.now();

  console.log('Testing Facebook DM reply fix...');
  console.log(`User ID: ${userId}`);
  console.log(`Sender ID: ${senderId}`);
  console.log(`Message: ${testMessage}`);

  try {
    const response = await axios.post(`http://localhost:3000/api/send-dm-reply/${userId}`, {
      sender_id: senderId,
      text: testMessage,
      message_id: messageId,
      platform: 'facebook'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success! Response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      console.log('Error details:', JSON.stringify(error.response.data.error, null, 2));
    }
  }
}

// Run the test
testFacebookDMReply(); 