const axios = require('axios');

// Test Facebook webhook event storage and retrieval
async function testFacebookWebhookStorage() {
  console.log('🧪 Testing Facebook Webhook Storage and Retrieval\n');

  // Test webhook payload (simulating a real Facebook DM)
  const webhookPayload = {
    object: 'page',
    entry: [
      {
        time: Date.now(),
        id: '612940588580162', // Facebook page ID from logs
        messaging: [
          {
            sender: {
              id: '23878882825079209'
            },
            recipient: {
              id: '612940588580162'
            },
            timestamp: Date.now(),
            message: {
              mid: `test_message_${Date.now()}`,
              text: 'Test webhook message storage',
              is_echo: false
            }
          }
        ]
      }
    ]
  };

  try {
    console.log('📤 Sending test webhook payload...');
    console.log('Payload:', JSON.stringify(webhookPayload, null, 2));
    
    const response = await axios.post('https://www.sentientm.com/webhook/facebook', webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'facebookexternalua'
      }
    });
    
    console.log('✅ Webhook response status:', response.status);
    
    // Wait a moment for processing
    console.log('⏳ Waiting for event processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test notification retrieval
    console.log('\n📥 Testing notification retrieval...');
    
    // Test with the Firebase user ID that should be used
    const testUserId = '612940588580162'; // This should be the Firebase user ID
    
    const notificationsResponse = await axios.get(`https://www.sentientm.com/events-list/${testUserId}?platform=facebook&forceRefresh=true`);
    
    console.log('✅ Notifications response status:', notificationsResponse.status);
    console.log('📊 Notifications data:', JSON.stringify(notificationsResponse.data, null, 2));
    
    // Check if the test message was stored and retrieved
    const notifications = notificationsResponse.data.notifications || [];
    const testMessage = notifications.find(n => n.text && n.text.includes('Test webhook message storage'));
    
    if (testMessage) {
      console.log('🎉 SUCCESS: Test message was stored and retrieved correctly!');
      console.log('Message details:', {
        text: testMessage.text,
        message_id: testMessage.message_id,
        timestamp: testMessage.timestamp,
        platform: testMessage.platform
      });
    } else {
      console.log('❌ FAILED: Test message was not found in notifications');
      console.log('Available notifications:', notifications.length);
      notifications.forEach((n, i) => {
        console.log(`  ${i + 1}. ${n.text} (${n.platform})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Test SSE connection for real-time updates
async function testSSEConnection() {
  console.log('\n🔌 Testing SSE Connection for Real-time Updates...');
  
  try {
    const testUserId = '612940588580162';
    const eventSource = new EventSource(`https://www.sentientm.com/events/${testUserId}`);
    
    console.log('📡 SSE connection established');
    
    eventSource.onmessage = function(event) {
      const data = JSON.parse(event.data);
      console.log('📨 Received SSE event:', data);
      
      if (data.type === 'facebook_message' || data.type === 'facebook_comment') {
        console.log('🎉 SUCCESS: Real-time Facebook event received via SSE!');
        console.log('Event details:', data);
      }
    };
    
    eventSource.onerror = function(error) {
      console.error('❌ SSE connection error:', error);
    };
    
    // Keep connection open for 10 seconds to test real-time updates
    setTimeout(() => {
      eventSource.close();
      console.log('🔌 SSE connection closed');
    }, 10000);
    
  } catch (error) {
    console.error('❌ Error testing SSE:', error.message);
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting Facebook Webhook Storage Tests\n');
  
  await testFacebookWebhookStorage();
  
  // Note: SSE test requires browser environment, so we'll skip it in Node.js
  console.log('\n📝 Note: SSE test requires browser environment');
  console.log('To test real-time updates, open browser console and run:');
  console.log('const eventSource = new EventSource("https://www.sentientm.com/events/612940588580162");');
  console.log('eventSource.onmessage = (event) => console.log("SSE:", JSON.parse(event.data));');
  
  console.log('\n✅ Tests completed!');
}

runTests().catch(console.error); 