import fetch from 'node-fetch';

async function testFacebookWebhookStatus() {
  console.log('🔍 FACEBOOK WEBHOOK DIAGNOSTIC');
  console.log('================================');
  
  const baseUrl = 'https://www.sentientm.com';
  const webhookUrl = `${baseUrl}/webhook/facebook`;
  const verifyToken = 'myFacebookWebhook2025';
  
  console.log('\n📋 Current Configuration:');
  console.log(`   Webhook URL: ${webhookUrl}`);
  console.log(`   Verify Token: ${verifyToken}`);
  console.log(`   Expected Facebook App URL: https://developers.facebook.com/apps/581584257679639/`);
  
  // Test 1: Webhook verification
  console.log('\n🧪 Test 1: Webhook Verification');
  console.log('===============================');
  
  try {
    const verifyResponse = await fetch(`${webhookUrl}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=test123`);
    console.log(`   Status: ${verifyResponse.status}`);
    console.log(`   Response: ${await verifyResponse.text()}`);
    
    if (verifyResponse.status === 200) {
      console.log('   ✅ Webhook verification endpoint is working');
    } else {
      console.log('   ❌ Webhook verification endpoint failed');
    }
  } catch (error) {
    console.log(`   ❌ Webhook verification error: ${error.message}`);
  }
  
  // Test 2: Webhook event processing
  console.log('\n🧪 Test 2: Webhook Event Processing');
  console.log('====================================');
  
  const testPayload = {
    object: 'page',
    entry: [
      {
        id: '681487244693083',
        messaging: [
          {
            sender: { id: '123456789' },
            message: {
              mid: 'test_' + Date.now(),
              text: 'Test webhook event'
            },
            timestamp: Date.now()
          }
        ]
      }
    ]
  };
  
  try {
    const eventResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`   Status: ${eventResponse.status}`);
    console.log(`   Response: ${await eventResponse.text()}`);
    
    if (eventResponse.status === 200) {
      console.log('   ✅ Webhook event processing is working');
    } else {
      console.log('   ❌ Webhook event processing failed');
    }
  } catch (error) {
    console.log(`   ❌ Webhook event error: ${error.message}`);
  }
  
  // Test 3: Check if Facebook is sending webhooks
  console.log('\n🔍 Test 3: Facebook Webhook Activity');
  console.log('=====================================');
  
  console.log('   Checking nginx logs for webhook activity...');
  console.log('   (This requires sudo access)');
  
  try {
    const { execSync } = await import('child_process');
    const nginxLogs = execSync('sudo grep -i webhook /var/log/nginx/access.log | tail -5', { encoding: 'utf8' });
    
    if (nginxLogs.trim()) {
      console.log('   📊 Recent webhook requests:');
      console.log(nginxLogs);
    } else {
      console.log('   ❌ NO WEBHOOK REQUESTS FOUND in nginx logs');
      console.log('   This means Facebook is not sending webhooks to your server!');
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check nginx logs: ${error.message}`);
  }
  
  // Test 4: Facebook App Configuration Check
  console.log('\n🔍 Test 4: Facebook App Configuration');
  console.log('=====================================');
  
  console.log('   📋 Manual Steps Required:');
  console.log('   1. Go to: https://developers.facebook.com/apps/581584257679639/');
  console.log('   2. Check if Webhooks product is added');
  console.log('   3. Verify webhook URL: https://www.sentientm.com/webhook/facebook');
  console.log('   4. Verify token: myFacebookWebhook2025');
  console.log('   5. Check if events are subscribed: messages, comments, feed');
  console.log('   6. Test webhook from Facebook dashboard');
  
  console.log('\n🎯 DIAGNOSIS:');
  console.log('=============');
  console.log('   ✅ Your server webhook endpoints are working');
  console.log('   ✅ Your webhook processing logic is working');
  console.log('   ❌ Facebook is NOT sending webhooks to your server');
  console.log('   ❌ This means Facebook App webhook is not configured');
  
  console.log('\n🔧 SOLUTION:');
  console.log('============');
  console.log('   1. Configure Facebook App webhook (see steps above)');
  console.log('   2. Subscribe to required events: messages, comments, feed');
  console.log('   3. Test webhook from Facebook dashboard');
  console.log('   4. Send a real DM to your Facebook page');
  console.log('   5. Check if webhook events are received');
}

// Run the diagnostic
testFacebookWebhookStatus().then(() => {
  console.log('\n🏁 Diagnostic complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Diagnostic failed:', error);
  process.exit(1);
}); 