import fetch from 'node-fetch';

async function testWebhookFix() {
  console.log('🧪 TESTING WEBHOOK FIX');
  console.log('========================');
  
  const webhookUrl = 'http://localhost:3000/webhook/facebook';
  const testPayload = {
    object: 'page',
    entry: [
      {
        id: '681487244693083', // Your Facebook page ID
        messaging: [
          {
            sender: {
              id: '123456789'
            },
            message: {
              mid: 'test_message_' + Date.now(),
              text: 'Test webhook fix message'
            },
            timestamp: Date.now()
          }
        ]
      }
    ]
  };
  
  console.log('📤 Sending test webhook payload...');
  console.log('Payload:', JSON.stringify(testPayload, null, 2));
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`📥 Response Status: ${response.status}`);
    console.log(`📥 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      console.log('✅ Webhook test successful!');
      console.log('Check server logs for token matching and event storage.');
    } else {
      const errorText = await response.text();
      console.log('❌ Webhook test failed:', errorText);
    }
  } catch (error) {
    console.error('❌ Webhook test error:', error.message);
  }
}

// Run the test
testWebhookFix().then(() => {
  console.log('\n🏁 Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 