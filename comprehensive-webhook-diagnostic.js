#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');

console.log('🔍 COMPREHENSIVE WEBHOOK DIAGNOSTIC');
console.log('=====================================\n');

// Configuration
const WEBHOOK_URL = 'https://www.sentientm.com/webhook/facebook';
const VERIFY_TOKEN = 'myFacebookWebhook2025';
const FB_APP_ID = '581584257679639';

// Test scenarios
const tests = [
  {
    name: '1. Server Health Check',
    test: async () => {
      try {
        const response = await makeRequest('https://www.sentientm.com/health', 'GET');
        return response.status === 200;
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '2. Webhook Verification Endpoint',
    test: async () => {
      try {
        const url = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test123`;
        const response = await makeRequest(url, 'GET');
        return response.status === 200 && response.data === 'test123';
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '3. Webhook POST Endpoint',
    test: async () => {
      try {
        const testPayload = {
          object: 'page',
          entry: [{
            id: '681487244693083',
            messaging: [{
              sender: { id: '123456789' },
              message: {
                mid: 'test_message_id',
                text: 'Test webhook message'
              },
              timestamp: Date.now()
            }]
          }]
        };
        
        const response = await makeRequest(WEBHOOK_URL, 'POST', testPayload);
        return response.status === 200;
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '4. Facebook App Webhook Configuration',
    test: async () => {
      try {
        // This would require Facebook Graph API access to check app settings
        // For now, we'll provide manual verification steps
        console.log('   📋 Manual verification required:');
        console.log('   - Go to: https://developers.facebook.com/apps/581584257679639/');
        console.log('   - Check if webhook URL is set to: https://www.sentientm.com/webhook/facebook');
        console.log('   - Verify token should be: myFacebookWebhook2025');
        console.log('   - Check if events are subscribed: messages, comments, feed');
        return 'MANUAL_CHECK_REQUIRED';
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '5. Page Access Token Validation',
    test: async () => {
      try {
        // This would require valid page access token to test
        console.log('   📋 Manual verification required:');
        console.log('   - Check if page access token is valid');
        console.log('   - Verify page has required permissions');
        console.log('   - Ensure page is published and active');
        return 'MANUAL_CHECK_REQUIRED';
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '6. Nginx Configuration Check',
    test: async () => {
      try {
        const response = await makeRequest('https://www.sentientm.com/webhook/facebook', 'GET');
        return response.status !== 404; // Should not return 404
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '7. Server Log Analysis',
    test: async () => {
      try {
        console.log('   📋 Check server logs for webhook events:');
        console.log('   - Look for: "WEBHOOK ➜ Facebook payload received"');
        console.log('   - Check for: "Processing entry for Webhook Page ID"');
        console.log('   - Verify: "Storing Facebook DM event"');
        return 'LOG_CHECK_REQUIRED';
      } catch (error) {
        return false;
      }
    }
  },
  {
    name: '8. Real Event Test',
    test: async () => {
      try {
        console.log('   📋 Manual test required:');
        console.log('   - Send a real DM to your Facebook page');
        console.log('   - Check server logs for webhook event');
        console.log('   - Verify event appears in dashboard');
        return 'MANUAL_TEST_REQUIRED';
      } catch (error) {
        return false;
      }
    }
  }
];

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Webhook-Diagnostic/1.0'
      }
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Run all tests
async function runDiagnostics() {
  console.log('🚀 Starting comprehensive webhook diagnostic...\n');
  
  const results = [];
  
  for (const test of tests) {
    console.log(`🔍 Running: ${test.name}`);
    try {
      const result = await test.test();
      results.push({ name: test.name, result });
      
      if (result === true) {
        console.log('   ✅ PASSED\n');
      } else if (result === false) {
        console.log('   ❌ FAILED\n');
      } else {
        console.log('   ⚠️  MANUAL CHECK REQUIRED\n');
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      results.push({ name: test.name, result: false, error: error.message });
    }
  }
  
  // Summary
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('======================');
  
  const passed = results.filter(r => r.result === true).length;
  const failed = results.filter(r => r.result === false).length;
  const manual = results.filter(r => typeof r.result === 'string').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Manual Check: ${manual}`);
  
  console.log('\n🎯 RECOMMENDATIONS:');
  console.log('===================');
  
  if (failed > 0) {
    console.log('❌ Critical issues found:');
    results.filter(r => r.result === false).forEach(r => {
      console.log(`   - ${r.name}`);
    });
  }
  
  if (manual > 0) {
    console.log('⚠️  Manual verification required:');
    results.filter(r => typeof r.result === 'string').forEach(r => {
      console.log(`   - ${r.name}`);
    });
  }
  
  if (passed === tests.length) {
    console.log('🎉 All automated tests passed! Check manual verification steps.');
  }
  
  console.log('\n🔧 NEXT STEPS:');
  console.log('==============');
  console.log('1. Verify Facebook App webhook configuration');
  console.log('2. Check page access token validity');
  console.log('3. Test with real Facebook events');
  console.log('4. Monitor server logs for webhook events');
  console.log('5. Verify event subscriptions in Facebook App');
}

// Run the diagnostic
runDiagnostics().catch(console.error); 