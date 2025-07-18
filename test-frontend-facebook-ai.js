#!/usr/bin/env node

/**
 * Test script to verify frontend-backend integration for Facebook AI replies
 * Simulates the exact call that the frontend makes
 */

const axios = require('axios');

async function testFrontendFacebookAI() {
  console.log(`[${new Date().toISOString()}] Testing Frontend Facebook AI Integration...`);
  
  // Simulate the exact notification structure the frontend sends
  const notification = {
    type: 'message',
    facebook_page_id: 'test_page_123',
    sender_id: 'test_sender_456',
    message_id: 'msg_test_789',
    text: 'Hi! Can you help me with my order?',
    timestamp: Date.now(),
    received_at: new Date().toISOString(),
    status: 'pending',
    platform: 'facebook'
  };
  
  try {
    console.log('Testing corrected frontend endpoint...');
    
    // Test the corrected endpoint that the frontend now uses
    const response = await axios.post('http://localhost:3000/api/rag-instant-reply/test_facebook_user', 
      notification, 
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );
    
    console.log('✅ Frontend Facebook AI Reply Success:', response.status);
    console.log('✅ Response:', response.data);
    
    // Verify the response structure matches what frontend expects
    if (response.data.success && response.data.reply) {
      console.log('✅ Frontend will receive correct response structure');
      console.log('✅ AI Reply:', response.data.reply.substring(0, 100) + '...');
    } else {
      console.log('❌ Response structure mismatch');
      return false;
    }
    
    console.log('\n🎉 Frontend Facebook AI integration verified successfully!');
    console.log('✅ The corrected RagService will now work with Facebook AI replies');
    
  } catch (error) {
    console.error('❌ Frontend Facebook AI test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return false;
  }
  
  return true;
}

// Run the test
testFrontendFacebookAI().catch(error => {
  console.error('\n💥 Frontend integration test failed:', error.message);
  process.exit(1);
});
