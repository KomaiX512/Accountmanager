#!/usr/bin/env node

/**
 * Facebook AI Auto-Reply Fix Test
 * 
 * This script tests the Facebook AI auto-reply functionality to ensure it works
 * correctly in both development and production environments.
 */

const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  // Test different environments
  environments: [
    {
      name: 'Production (VPS)',
      baseURL: 'https://www.sentientm.com',
      description: 'Testing against production VPS'
    },
    {
      name: 'Local Development',
      baseURL: 'http://localhost:5173',
      description: 'Testing against local development server'
    }
  ],
  
  // Test data for Facebook AI reply
  testData: {
    username: 'testuser',
    notification: {
      type: 'message',
      platform: 'facebook',
      sender_id: '123456789',
      message_id: `test_ai_reply_${Date.now()}`,
      text: 'Hello! Can you help me with my question?',
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      status: 'pending'
    }
  }
};

/**
 * Test the /api/instant-reply endpoint
 */
async function testInstantReplyEndpoint(environment) {
  console.log(`\n🧪 Testing ${environment.name}`);
  console.log(`📍 Base URL: ${environment.baseURL}`);
  console.log(`📝 Description: ${environment.description}`);
  
  try {
    console.log('\n📤 Sending test request to /api/instant-reply...');
    
    const response = await axios.post(
      `${environment.baseURL}/api/instant-reply`,
      TEST_CONFIG.testData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('\n✅ SUCCESS! Response received:');
    console.log('📄 Status:', response.status);
    console.log('📄 Data:', JSON.stringify(response.data, null, 2));
    
    // Validate response structure
    if (response.data && response.data.reply) {
      console.log('✅ AI reply generated successfully');
      console.log('💬 Reply preview:', response.data.reply.substring(0, 100) + '...');
    } else {
      console.log('⚠️ Response missing AI reply');
    }
    
    return true;
    
  } catch (error) {
    console.error('\n❌ ERROR:');
    console.error('🔍 Error details:', error.response?.data || error.message);
    console.error('📊 Status code:', error.response?.status);
    
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - DNS resolution failed');
      console.error('   - Check if the domain is correct');
      console.error('   - Verify network connectivity');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Connection refused');
      console.error('   - Check if the server is running');
      console.error('   - Verify the port is correct');
    } else if (error.response?.status === 404) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Endpoint not found');
      console.error('   - Check if the route is configured correctly');
      console.error('   - Verify nginx proxy configuration');
    }
    
    return false;
  }
}

/**
 * Test the RAG server directly
 */
async function testRAGServerDirect() {
  console.log('\n🧪 Testing RAG Server Direct Connection...\n');
  
  try {
    console.log('📤 Sending test request directly to RAG server...');
    
    const response = await axios.post('http://localhost:3001/api/instant-reply', TEST_CONFIG.testData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ SUCCESS! RAG Server Response:');
    console.log('📄 Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ ERROR in RAG Server Test:');
    console.error('🔍 Error details:', error.response?.data || error.message);
    console.error('📊 Status code:', error.response?.status);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Make sure the RAG server is running on port 3001');
      console.error('   - Check if rag-server.js is started');
    }
  }
}

/**
 * Test the main server endpoint
 */
async function testMainServerEndpoint() {
  console.log('\n🧪 Testing Main Server Endpoint...\n');
  
  try {
    console.log('📤 Sending test request to main server...');
    
    const response = await axios.post('http://localhost:3000/api/instant-reply', TEST_CONFIG.testData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ SUCCESS! Main Server Response:');
    console.log('📄 Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ ERROR in Main Server Test:');
    console.error('🔍 Error details:', error.response?.data || error.message);
    console.error('📊 Status code:', error.response?.status);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Make sure the main server is running on port 3000');
      console.error('   - Check if OldServer.js is started');
    }
  }
}

/**
 * Test URL resolution
 */
async function testURLResolution() {
  console.log('\n🧪 Testing URL Resolution...\n');
  
  const testUrls = [
    'https://www.sentientm.com/api/instant-reply',
    'http://localhost:5173/api/instant-reply',
    'http://localhost:3000/api/instant-reply',
    'http://localhost:3001/api/instant-reply'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`📤 Testing URL: ${url}`);
      
      const response = await axios.post(url, TEST_CONFIG.testData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ SUCCESS: ${url} (Status: ${response.status})`);
      
    } catch (error) {
      console.log(`❌ FAILED: ${url} - ${error.message}`);
    }
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Facebook AI Auto-Reply Fix Test');
  console.log('=====================================');
  console.log(`⏰ Test started at: ${new Date().toISOString()}`);
  console.log(`📋 Test data: ${JSON.stringify(TEST_CONFIG.testData, null, 2)}`);
  
  let successCount = 0;
  let totalTests = 0;
  
  // Test each environment
  for (const environment of TEST_CONFIG.environments) {
    totalTests++;
    const success = await testInstantReplyEndpoint(environment);
    if (success) successCount++;
  }
  
  // Test direct server connections
  console.log('\n🔧 Testing Direct Server Connections...');
  
  totalTests++;
  try {
    await testRAGServerDirect();
    successCount++;
  } catch (error) {
    console.error('RAG server test failed');
  }
  
  totalTests++;
  try {
    await testMainServerEndpoint();
    successCount++;
  } catch (error) {
    console.error('Main server test failed');
  }
  
  // Test URL resolution
  await testURLResolution();
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  console.log(`✅ Successful tests: ${successCount}/${totalTests}`);
  console.log(`❌ Failed tests: ${totalTests - successCount}/${totalTests}`);
  
  if (successCount === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Facebook AI auto-reply should work correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the error messages above for troubleshooting.');
  }
  
  console.log(`\n⏰ Test completed at: ${new Date().toISOString()}`);
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testInstantReplyEndpoint,
  testRAGServerDirect,
  testMainServerEndpoint,
  testURLResolution
}; 