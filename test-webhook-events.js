const axios = require('axios');

const WEBHOOK_URL = 'https://www.sentientm.com/webhook/facebook';

// Test webhook events
const testEvents = [
  {
    name: 'Direct Message Event',
    payload: {
      object: 'page',
      entry: [
        {
          id: '681487244693083', // Your page ID
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: {
                id: '123456789'
              },
              recipient: {
                id: '681487244693083'
              },
              timestamp: Math.floor(Date.now() / 1000),
              message: {
                mid: 'test_message_id_' + Date.now(),
                text: 'Test message from webhook'
              }
            }
          ]
        }
      ]
    }
  },
  {
    name: 'Comment Event',
    payload: {
      object: 'page',
      entry: [
        {
          id: '681487244693083', // Your page ID
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              value: {
                item: 'comment',
                comment_id: 'test_comment_id_' + Date.now(),
                post_id: 'test_post_id',
                message: 'Test comment from webhook',
                from: {
                  id: '123456789'
                },
                created_time: Math.floor(Date.now() / 1000)
              }
            }
          ]
        }
      ]
    }
  }
];

async function testWebhookEvents() {
  console.log('🧪 Testing Facebook Webhook Events...\n');
  
  for (const testEvent of testEvents) {
    try {
      console.log(`📋 Testing: ${testEvent.name}`);
      console.log(`🌐 URL: ${WEBHOOK_URL}`);
      console.log(`📦 Payload: ${JSON.stringify(testEvent.payload, null, 2)}`);
      
      const response = await axios({
        method: 'POST',
        url: WEBHOOK_URL,
        data: testEvent.payload,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`📄 Response: ${response.data}`);
      console.log('🎉 SUCCESS: Webhook event processed!\n');
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${error.response.data}`);
      }
      console.log('');
    }
  }
  
  console.log('📊 Webhook Event Testing Summary:');
  console.log('==================================');
  console.log('✅ If events are processed, webhook is working');
  console.log('❌ If you get errors, check server logs');
  console.log('\n🔍 Check server logs for:');
  console.log('- "WEBHOOK ➜ Facebook payload received"');
  console.log('- "Storing Facebook DM event"');
  console.log('- "Storing Facebook comment event"');
}

testWebhookEvents().catch(console.error); 