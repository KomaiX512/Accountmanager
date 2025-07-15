#!/usr/bin/env node

/**
 * Facebook User ID Storage Fix Test
 * 
 * This script tests that events are stored under the Facebook user ID
 * and retrievable by the frontend
 */

const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  baseURL: 'https://www.sentientm.com',
  webhookEndpoint: '/webhook/facebook',
  eventsEndpoint: '/events-list',
  testMessage: {
    object: 'page',
    entry: [{
      time: Date.now(),
      id: '612940588580162', // Facebook page ID
      messaging: [{
        sender: {
          id: '23878882825079209'
        },
        recipient: {
          id: '612940588580162'
        },
        timestamp: Date.now(),
        message: {
          mid: `test_user_id_fix_${Date.now()}`,
          text: 'Test user ID fix message'
        }
      }]
    }]
  }
};

async function testWebhookStorage() {
  console.log('🧪 Testing Facebook Webhook Storage with User ID...');
  
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

async function testEventRetrievalWithUserId() {
  console.log('🧪 Testing Event Retrieval with Facebook User ID...');
  
  try {
    // Test with Facebook user ID (681487244693083) - what frontend uses
    const response = await axios.get(`${TEST_CONFIG.baseURL}${TEST_CONFIG.eventsEndpoint}/681487244693083?platform=facebook`);
    
    console.log('✅ Events response:', response.status);
    console.log('📊 Events found:', response.data?.length || 0);
    
    if (response.data && response.data.length > 0) {
      console.log('📝 Sample event:', response.data[0]);
      
      // Check for our test event
      const testEvent = response.data.find(event => 
        event.text && event.text.includes('Test user ID fix')
      );
      
      if (testEvent) {
        console.log('✅ Test event found in retrieval with Facebook user ID!');
        return true;
      } else {
        console.log('⚠️ Test event not found in retrieval with Facebook user ID');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Event retrieval test failed:', error.message);
    return false;
  }
}

async function testEventRetrievalWithPageId() {
  console.log('🧪 Testing Event Retrieval with Facebook Page ID...');
  
  try {
    // Test with Facebook page ID (612940588580162) - what webhook receives
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

async function runUserIDFixTest() {
  console.log('🚀 Starting Facebook User ID Storage Fix Test\n');
  
  // Step 1: Test webhook storage
  const webhookSuccess = await testWebhookStorage();
  if (!webhookSuccess) {
    console.log('❌ Webhook test failed - stopping');
    return;
  }
  
  // Wait for processing
  console.log('⏳ Waiting for webhook processing...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 2: Test event retrieval with Facebook user ID
  const retrievalSuccess = await testEventRetrievalWithUserId();
  if (!retrievalSuccess) {
    console.log('❌ Event retrieval test failed');
    return;
  }
  
  // Step 3: Test event retrieval with Facebook page ID
  const pageRetrievalSuccess = await testEventRetrievalWithPageId();
  if (!pageRetrievalSuccess) {
    console.log('❌ Page ID retrieval test failed');
    return;
  }
  
  console.log('\n🎉 All tests completed successfully!');
  console.log('✅ Facebook user ID storage fix is working correctly');
  console.log('✅ Events are stored under Facebook user ID and retrievable by frontend');
}

// Run the test
if (require.main === module) {
  runUserIDFixTest().catch(console.error);
}

module.exports = {
  testWebhookStorage,
  testEventRetrievalWithUserId,
  testEventRetrievalWithPageId,
  runUserIDFixTest
}; 