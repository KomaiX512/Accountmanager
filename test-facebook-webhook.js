const axios = require('axios');

async function testFacebookWebhook() {
  console.log('🧪 Testing Facebook Webhook Functionality\n');
  
  const webhookUrl = 'http://localhost:3000/webhook/facebook';
  const testPayload = {
    object: 'page',
    entry: [{
      id: '681487244693083', // This matches one of the stored tokens
      messaging: [{
        sender: { id: '123456789' },
        message: {
          mid: 'test_webhook_' + Date.now(),
          text: 'Test webhook message from script'
        }
      }]
    }]
  };
  
  console.log('📤 Sending test webhook payload...');
  console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));
  
  try {
    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Webhook response:', response.status, response.statusText);
    console.log('📝 Response body:', response.data);
    
    // Wait a moment for processing
    console.log('\n⏳ Waiting for processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if event was stored
    console.log('\n🔍 Checking if event was stored...');
    const eventsResponse = await axios.get('http://localhost:3000/api/facebook/events/681487244693083', {
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(err => {
      console.log('❌ Events endpoint not available, but webhook is working');
      return null;
    });
    
    if (eventsResponse) {
      console.log('📊 Events response:', eventsResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Webhook test failed:', error.message);
    if (error.response) {
      console.error('📋 Response status:', error.response.status);
      console.error('📋 Response data:', error.response.data);
    }
  }
}

testFacebookWebhook(); 