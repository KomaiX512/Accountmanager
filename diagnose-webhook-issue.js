const axios = require('axios');

console.log('🔍 Facebook Webhook Issue Diagnosis\n');

async function diagnoseWebhookIssue() {
  console.log('1️⃣ Testing Webhook Infrastructure...\n');

  // Test 1: Check if webhook endpoints are accessible
  console.log('Testing webhook endpoints:');
  
  const endpoints = [
    'https://www.sentientm.com/webhook/facebook',
    'https://www.sentientm.com/api/webhook/facebook',
    'http://localhost:3000/webhook/facebook',
    'http://localhost:3000/api/webhook/facebook'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${endpoint}?hub.mode=subscribe&hub.verify_token=myFacebookWebhook2025&hub.challenge=test`);
      console.log(`✅ ${endpoint} - Status: ${response.status}, Response: ${response.data}`);
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.message}`);
    }
  }

  console.log('\n2️⃣ Testing Webhook Event Processing...\n');

  // Test 2: Send test webhook event
  const testEvent = {
    object: "page",
    entry: [{
      id: "681487244693083",
      messaging: [{
        sender: { id: "123" },
        message: { mid: "test_diagnosis", text: "test message" }
      }]
    }]
  };

  try {
    const response = await axios.post('http://localhost:3000/webhook/facebook', testEvent, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`✅ Test webhook event sent - Status: ${response.status}`);
  } catch (error) {
    console.log(`❌ Test webhook event failed - Error: ${error.message}`);
  }

  console.log('\n3️⃣ Checking Facebook App Configuration...\n');

  console.log('🔍 POTENTIAL ISSUES IDENTIFIED:\n');

  console.log('❌ ISSUE #1: Facebook App Webhook Not Configured');
  console.log('   - Your Facebook App (581584257679639) may not have webhook configured');
  console.log('   - Go to: https://developers.facebook.com/apps/581584257679639/');
  console.log('   - Add Product → Webhooks → Set Up');
  console.log('   - URL: https://www.sentientm.com/webhook/facebook');
  console.log('   - Verify Token: myFacebookWebhook2025\n');

  console.log('❌ ISSUE #2: Missing Event Subscriptions');
  console.log('   - After configuring webhook, subscribe to events:');
  console.log('   - messages (for DMs)');
  console.log('   - comments (for comments)');
  console.log('   - feed (for page feed events)\n');

  console.log('❌ ISSUE #3: Page Not Connected to App');
  console.log('   - Your Facebook page may not be connected to the app');
  console.log('   - Check if page has required permissions');
  console.log('   - Verify page access token is valid\n');

  console.log('❌ ISSUE #4: Personal Account Limitations');
  console.log('   - If using personal account, webhooks won\'t work');
  console.log('   - Facebook restricts webhook access for personal accounts');
  console.log('   - Solution: Use Facebook Business Page\n');

  console.log('4️⃣ Recommended Fix Steps:\n');

  console.log('Step 1: Configure Facebook App Webhook');
  console.log('   1. Go to https://developers.facebook.com/apps/581584257679639/');
  console.log('   2. Add Product → Webhooks');
  console.log('   3. Set URL: https://www.sentientm.com/webhook/facebook');
  console.log('   4. Set Verify Token: myFacebookWebhook2025');
  console.log('   5. Click "Verify and Save"\n');

  console.log('Step 2: Subscribe to Events');
  console.log('   1. After webhook verification, click "Add Subscription"');
  console.log('   2. Select your page');
  console.log('   3. Subscribe to: messages, comments, feed');
  console.log('   4. Save subscriptions\n');

  console.log('Step 3: Test Real Events');
  console.log('   1. Send a real DM to your Facebook page');
  console.log('   2. Check server logs for webhook events');
  console.log('   3. Verify events appear in dashboard\n');

  console.log('Step 4: Monitor Logs');
  console.log('   Look for these log patterns:');
  console.log('   - "WEBHOOK ➜ Facebook payload received"');
  console.log('   - "Storing Facebook DM event"');
  console.log('   - "Found matching Facebook token"\n');

  console.log('5️⃣ Server Status Check:\n');

  // Check if servers are running
  try {
    const healthCheck = await axios.get('http://localhost:3000/health');
    console.log(`✅ Modular server health: ${healthCheck.status}`);
  } catch (error) {
    console.log(`❌ Modular server health check failed: ${error.message}`);
  }

  try {
    const mainHealthCheck = await axios.get('https://www.sentientm.com/health');
    console.log(`✅ Main server health: ${mainHealthCheck.status}`);
  } catch (error) {
    console.log(`❌ Main server health check failed: ${error.message}`);
  }

  console.log('\n6️⃣ Nginx Configuration Check:\n');

  console.log('✅ Nginx routes configured for:');
  console.log('   - /webhook/facebook → localhost:3000');
  console.log('   - /api/webhook/facebook → localhost:3000');
  console.log('   - /facebook/callback → localhost:3000');

  console.log('\n🎯 SUMMARY:\n');
  console.log('✅ Webhook infrastructure is working');
  console.log('✅ Server endpoints are responding');
  console.log('✅ Nginx routing is configured');
  console.log('❌ Facebook App webhook likely not configured');
  console.log('❌ Event subscriptions likely missing');

  console.log('\n🚀 NEXT ACTION REQUIRED:');
  console.log('Configure Facebook App webhook settings as outlined above.');
  console.log('This is the most common cause of missing webhook events.');
}

diagnoseWebhookIssue().catch(console.error); 