const axios = require('axios');

// Test Facebook webhook with sample data
async function testFacebookWebhook() {
  const webhookUrl = 'http://localhost:3000/webhook/facebook';
  
  // Test Facebook message webhook
  const messageWebhookData = {
    object: 'page',
    entry: [
      {
        id: '123456789', // This should be your Facebook page ID
        time: Date.now(),
        messaging: [
          {
            sender: {
              id: '987654321' // Customer sender ID
            },
            recipient: {
              id: '123456789' // Your page ID
            },
            timestamp: Date.now(),
            message: {
              mid: `test_message_${Date.now()}`,
              text: 'Hello! This is a test Facebook message from a customer.'
            }
          }
        ]
      }
    ]
  };

  // Test Facebook comment webhook
  const commentWebhookData = {
    object: 'page',
    entry: [
      {
        id: '123456789', // Your page ID
        time: Date.now(),
        changes: [
          {
            field: 'feed',
            value: {
              from: {
                id: '987654321',
                name: 'Test Customer'
              },
              post: {
                id: 'test_post_123'
              },
              comment_id: `test_comment_${Date.now()}`,
              message: 'This is a test comment on your Facebook post!',
              created_time: new Date().toISOString(),
              item: 'comment'
            }
          }
        ]
      }
    ]
  };

  try {
    console.log('Testing Facebook message webhook...');
    const messageResponse = await axios.post(webhookUrl, messageWebhookData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Message webhook response:', messageResponse.status);

    // Wait a moment before sending comment
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Testing Facebook comment webhook...');
    const commentResponse = await axios.post(webhookUrl, commentWebhookData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Comment webhook response:', commentResponse.status);

    console.log('Both webhook tests completed successfully!');
    console.log('Check your Facebook dashboard for real-time notifications.');
    
  } catch (error) {
    console.error('Webhook test failed:', error.response?.data || error.message);
  }
}

// Run the test
if (require.main === module) {
  testFacebookWebhook();
}

module.exports = { testFacebookWebhook }; 