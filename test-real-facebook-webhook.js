#!/usr/bin/env node

const https = require('https');
const http = require('http');

console.log('🧪 TESTING REAL FACEBOOK WEBHOOK EVENT');
console.log('=======================================\n');

// Simulate a real Facebook webhook event
const realWebhookEvent = {
  object: 'page',
  entry: [{
    id: '681487244693083', // This is the Facebook user ID from your logs
    time: Date.now(),
    messaging: [{
      sender: {
        id: '123456789012345' // Random sender ID
      },
      recipient: {
        id: '681487244693083' // Your page ID
      },
      timestamp: Date.now(),
      message: {
        mid: 'm_' + Date.now(),
        text: 'Hello from real Facebook webhook test!',
        seq: 1
      }
    }]
  }]
};

console.log('📤 Sending real webhook event:');
console.log(JSON.stringify(realWebhookEvent, null, 2));
console.log('\n');

// Send the webhook event
async function sendWebhookEvent() {
  try {
    const response = await makeRequest('https://www.sentientm.com/webhook/facebook', 'POST', realWebhookEvent);
    
    console.log('📥 Response received:');
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${response.data}`);
    
    if (response.status === 200) {
      console.log('✅ Webhook event processed successfully');
    } else {
      console.log('❌ Webhook event failed');
    }
  } catch (error) {
    console.error('❌ Error sending webhook event:', error.message);
  }
}

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
        'User-Agent': 'Facebook-Webhook-Test/1.0'
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

// Run the test
sendWebhookEvent().then(() => {
  console.log('\n🔍 DEBUGGING INFORMATION:');
  console.log('==========================');
  console.log('1. Check server logs for: "WEBHOOK ➜ Facebook payload received"');
  console.log('2. Look for: "Processing entry for Webhook Page ID: 681487244693083"');
  console.log('3. Check for: "Available Facebook tokens for webhook lookup"');
  console.log('4. Look for: "Found matching Facebook token" or "No matching Facebook token found"');
  console.log('5. Check for: "Storing Facebook DM event" or "Skipping Facebook DM storage"');
  console.log('\n📋 NEXT STEPS:');
  console.log('===============');
  console.log('1. Check server logs for token matching results');
  console.log('2. Verify if the token is found for page ID: 681487244693083');
  console.log('3. Check if the event is stored or skipped');
  console.log('4. If skipped, the issue is token matching');
  console.log('5. If stored, check if it appears in the dashboard');
}); 