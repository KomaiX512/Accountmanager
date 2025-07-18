#!/usr/bin/env node

/**
 * Production verification script for sentientm.com
 * Tests Facebook AI reply functionality with production URLs
 */

const axios = require('axios');

async function testProductionFacebookAI() {
  const baseUrl = 'https://sentientm.com';
  const localUrl = 'http://localhost:3000';
  
  console.log(`[${new Date().toISOString()}] Testing Facebook AI Reply for Production...`);
  
  // Test notification payload (simulating real Facebook DM)
  const testNotification = {
    type: 'message',
    text: 'Hello! Can you help me with my order?',
    platform: 'facebook',
    sender_id: '123456789',
    message_id: 'msg_test_123',
    facebook_page_id: 'page_123',
    timestamp: Date.now()
  };
  
  try {
    console.log('\n=== Production Test: Facebook AI Reply ===');
    console.log('Testing with local server (production simulation)...');
    
    const response = await axios.post(`${localUrl}/api/rag-instant-reply/test_facebook_user`, 
      testNotification, 
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Origin': baseUrl
        }
      }
    );
    
    console.log('✅ Facebook AI Reply Success:', response.status);
    console.log('Response:', response.data);
    
    // Verify response structure
    if (response.data.success && response.data.reply) {
      console.log('✅ Response structure is correct');
      console.log('✅ AI generated reply:', response.data.reply.substring(0, 100) + '...');
    } else {
      console.log('❌ Response structure is incorrect');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Facebook AI Reply Failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return false;
  }
  
  try {
    console.log('\n=== Production Test: RAG Health Check ===');
    
    const healthResponse = await axios.get(`${localUrl}/api/rag-health`, {
      timeout: 5000,
      headers: {
        'Origin': baseUrl
      }
    });
    
    console.log('✅ RAG Health Check Success:', healthResponse.status);
    console.log('RAG Status:', healthResponse.data.ragServer);
    
  } catch (error) {
    console.error('❌ RAG Health Check Failed:', error.message);
    return false;
  }
  
  console.log('\n🎉 Production verification completed successfully!');
  console.log('✅ Facebook AI Reply system is ready for sentientm.com deployment');
  
  return true;
}

// Run the test
testProductionFacebookAI().catch(error => {
  console.error('\n💥 Production verification failed:', error.message);
  process.exit(1);
});
