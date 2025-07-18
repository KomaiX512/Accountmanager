#!/usr/bin/env node

/**
 * Simple test script to verify RAG server connection
 * Usage: node test-rag-connection.js
 */

const axios = require('axios');

async function testRagConnection() {
  console.log(`[${new Date().toISOString()}] Testing RAG server connection...`);
  
  try {
    // Test 1: Health check
    console.log('\n=== Test 1: RAG Health Check ===');
    const healthResponse = await axios.get('http://localhost:3001/health', {
      timeout: 5000
    });
    console.log('✅ RAG Health Check:', healthResponse.status, healthResponse.data);
  } catch (error) {
    console.error('❌ RAG Health Check Failed:', error.code, error.message);
    return false;
  }
  
  try {
    // Test 2: Instant reply endpoint
    console.log('\n=== Test 2: RAG Instant Reply ===');
    const testNotification = {
      type: 'message',
      text: 'Hello, this is a test message',
      platform: 'facebook',
      sender_id: 'test_sender',
      message_id: 'test_message_123'
    };
    
    const replyResponse = await axios.post('http://localhost:3001/api/instant-reply', {
      username: 'test_user',
      notification: testNotification
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ RAG Instant Reply:', replyResponse.status);
    console.log('Response:', replyResponse.data);
  } catch (error) {
    console.error('❌ RAG Instant Reply Failed:', error.code, error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
    return false;
  }
  
  try {
    // Test 3: Main server RAG health endpoint
    console.log('\n=== Test 3: Main Server RAG Health ===');
    const mainHealthResponse = await axios.get('http://localhost:3000/api/rag-health', {
      timeout: 5000
    });
    console.log('✅ Main Server RAG Health:', mainHealthResponse.status, mainHealthResponse.data);
  } catch (error) {
    console.error('❌ Main Server RAG Health Failed:', error.code, error.message);
    return false;
  }
  
  console.log('\n🎉 All tests passed! RAG server connection is working properly.');
  return true;
}

// Run the test
testRagConnection().catch(error => {
  console.error('\n💥 Test suite failed:', error.message);
  process.exit(1);
});
