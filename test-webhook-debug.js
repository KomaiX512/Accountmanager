const fetch = require('node-fetch');

async function testWebhookDebug() {
  console.log('🚀 Testing webhook with debug statements...');
  
  const webhookPayload = {
    object: 'instagram',
    entry: [
      {
        id: '17841476072004748',
        time: Date.now(),
        messaging: [
          {
            sender: {
              id: '17841471786269325' // This should be u2023460 (from our tokens)
            },
            recipient: {
              id: '17841476072004748' // This is socialagent321
            },
            timestamp: Date.now(),
            message: {
              mid: `m_test_debug_${Date.now()}`,
              text: 'Test DM for debug tracing'
            }
          }
        ]
      }
    ]
  };
  
  try {
    const response = await fetch('http://localhost:3001/webhook/instagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=dummy_signature_for_test'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    console.log('✅ Webhook Response Status:', response.status);
    const responseText = await response.text();
    console.log('📋 Response:', responseText);
    
    console.log('\n🔍 Check server logs now for debug statements!');
    console.log('Look for:');
    console.log('- "📋 EXECUTION REACHED: About to start username fetch process..."');
    console.log('- "🔍 DEBUG: About to find sender username..."');
    console.log('- Username resolution debug statements');
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error);
  }
}

testWebhookDebug();
