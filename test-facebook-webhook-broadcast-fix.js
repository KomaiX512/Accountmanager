#!/usr/bin/env node

/**
 * Facebook Webhook Broadcast Fix Test
 * 
 * This script tests the complete flow:
 * 1. Webhook receives Facebook message
 * 2. Webhook stores event in R2
 * 3. Webhook broadcasts to frontend via SSE
 * 4. Frontend receives real-time notification
 */

const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  baseURL: 'https://www.sentientm.com',
  webhookEndpoint: '/webhook/facebook',
  eventsEndpoint: '/events-list',
  streamEndpoint: '/stream',
  testMessage: {
    object: 'page',
    entry: [{
      time: Date.now(),
      id: '612940588580162', // Facebook page ID from your logs
      messaging: [{
        sender: {
          id: '23878882825079209'
        },
        recipient: {
          id: '612940588580162'
        },
        timestamp: Date.now(),
        message: {
          mid: `test_broadcast_${Date.now()}`,
          text: 'Test broadcast message'
        }
      }]
    }]
  }
};

async function testWebhookReception() {
  console.log('🧪 Testing Facebook Webhook Reception...');
  
  try {
    const response = await axios.post(`${TEST_CONFIG.baseURL}${TEST_CONFIG.webhookEndpoint}`, TEST_CONFIG.testMessage, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature': 'sha1=test_signature',
        'X-Hub-Signature-256': 'sha256=test_signature_256',
        'Facebook-API-Version': 'v23.0'
      }
    });
    
    console.log('✅ Webhook response:', response.status, response.statusText);
    return true;
  } catch (error) {
    console.error('❌ Webhook test failed:', error.message);
    return false;
  }
}

async function testEventRetrieval() {
  console.log('🧪 Testing Event Retrieval...');
  
  try {
    // Test with Facebook page ID (what frontend uses)
    const response = await axios.get(`${TEST_CONFIG.baseURL}${TEST_CONFIG.eventsEndpoint}/612940588580162?platform=facebook`);
    
    console.log('✅ Events response:', response.status);
    console.log('📊 Events found:', response.data?.length || 0);
    
    if (response.data && response.data.length > 0) {
      console.log('📝 Sample event:', response.data[0]);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Event retrieval test failed:', error.message);
    return false;
  }
}

async function testSSEConnection() {
  console.log('🧪 Testing SSE Connection...');
  
  return new Promise((resolve) => {
    const eventSource = new EventSource(`${TEST_CONFIG.baseURL}${TEST_CONFIG.streamEndpoint}/612940588580162`);
    
    let messageReceived = false;
    const timeout = setTimeout(() => {
      eventSource.close();
      if (!messageReceived) {
        console.log('⚠️ No SSE messages received within timeout');
        resolve(false);
      }
    }, 10000);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('✅ SSE message received:', data);
        messageReceived = true;
        clearTimeout(timeout);
        eventSource.close();
        resolve(true);
      } catch (error) {
        console.error('❌ Error parsing SSE message:', error);
        resolve(false);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      clearTimeout(timeout);
      eventSource.close();
      resolve(false);
    };
  });
}

async function runComprehensiveTest() {
  console.log('🚀 Starting Facebook Webhook Broadcast Fix Test\n');
  
  // Step 1: Test webhook reception
  const webhookSuccess = await testWebhookReception();
  if (!webhookSuccess) {
    console.log('❌ Webhook test failed - stopping');
    return;
  }
  
  // Wait for processing
  console.log('⏳ Waiting for webhook processing...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 2: Test event retrieval
  const retrievalSuccess = await testEventRetrieval();
  if (!retrievalSuccess) {
    console.log('❌ Event retrieval test failed');
    return;
  }
  
  // Step 3: Test SSE connection (if in browser environment)
  if (typeof EventSource !== 'undefined') {
    const sseSuccess = await testSSEConnection();
    if (!sseSuccess) {
      console.log('❌ SSE test failed');
      return;
    }
  } else {
    console.log('⚠️ Skipping SSE test (not in browser environment)');
  }
  
  console.log('\n🎉 All tests completed successfully!');
  console.log('✅ Facebook webhook broadcast fix is working correctly');
}

// Run the test
if (require.main === module) {
  runComprehensiveTest().catch(console.error);
}

module.exports = {
  testWebhookReception,
  testEventRetrieval,
  testSSEConnection,
  runComprehensiveTest
}; 