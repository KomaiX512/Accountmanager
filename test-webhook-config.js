const axios = require('axios');

const BASE_URL = 'https://www.sentientm.com';
const LOCAL_URL = 'http://localhost:3000';

const testCases = [
  {
    name: 'Facebook Webhook Verification (Production)',
    url: `${BASE_URL}/webhook/facebook?hub.mode=subscribe&hub.verify_token=myFacebookWebhook2025&hub.challenge=test_challenge`,
    method: 'GET'
  },
  {
    name: 'Facebook Webhook Verification (API Route)',
    url: `${BASE_URL}/api/webhook/facebook?hub.mode=subscribe&hub.verify_token=myFacebookWebhook2025&hub.challenge=test_challenge`,
    method: 'GET'
  },
  {
    name: 'Facebook Webhook Verification (Local)',
    url: `${LOCAL_URL}/webhook/facebook?hub.mode=subscribe&hub.verify_token=myFacebookWebhook2025&hub.challenge=test_challenge`,
    method: 'GET'
  },
  {
    name: 'Instagram Webhook Verification (Production)',
    url: `${BASE_URL}/webhook/instagram?hub.mode=subscribe&hub.verify_token=myInstagramWebhook2025&hub.challenge=test_challenge`,
    method: 'GET'
  },
  {
    name: 'Instagram Webhook Verification (Local)',
    url: `${LOCAL_URL}/webhook/instagram?hub.mode=subscribe&hub.verify_token=myInstagramWebhook2025&hub.challenge=test_challenge`,
    method: 'GET'
  }
];

async function testWebhookEndpoints() {
  console.log('🔍 Testing Webhook Configuration...\n');
  
  for (const testCase of testCases) {
    try {
      console.log(`📋 Testing: ${testCase.name}`);
      console.log(`🌐 URL: ${testCase.url}`);
      
      const response = await axios({
        method: testCase.method,
        url: testCase.url,
        timeout: 10000
      });
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`📄 Response: ${response.data}`);
      
      if (response.data === 'test_challenge') {
        console.log('🎉 SUCCESS: Webhook verification working correctly!\n');
      } else {
        console.log('⚠️  WARNING: Unexpected response format\n');
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${error.response.data}`);
      }
      console.log('');
    }
  }
  
  console.log('📊 Webhook Configuration Summary:');
  console.log('====================================');
  console.log('✅ If you see "test_challenge" responses, webhooks are working');
  console.log('❌ If you see HTML responses, nginx routing needs to be fixed');
  console.log('❌ If you see connection errors, server may not be running');
  console.log('\n🔧 Next Steps:');
  console.log('1. If webhooks are not working, reload nginx: sudo systemctl reload nginx');
  console.log('2. Check Facebook App webhook URL configuration');
  console.log('3. Verify webhook subscriptions in Facebook App');
}

testWebhookEndpoints().catch(console.error); 