#!/usr/bin/env node

/**
 * FACEBOOK AI REPLY DIAGNOSIS TEST
 * 
 * This script tests the complete Facebook AI reply pipeline:
 * 1. Frontend → Backend Proxy → RAG Server
 * 2. Token validation and Facebook API integration
 * 3. Complete end-to-end DM reply functionality
 */

const axios = require('axios');
const fs = require('fs');

// Test Configuration
const TEST_CONFIG = {
  backendUrl: 'http://localhost:3000',
  ragServerUrl: 'http://localhost:3001',
  facebookUserId: '612940588580162', // Test Facebook Page ID
  testUsername: 'Sentient ai', // Updated to match actual Facebook connection username
  testNotification: {
    type: 'message',
    text: 'Hi! Can you help me with my Facebook marketing strategy?',
    sender_id: '123456789',
    message_id: `test_${Date.now()}`,
    timestamp: Date.now(),
    received_at: new Date().toISOString(),
    status: 'pending',
    platform: 'facebook',
    facebook_page_id: '612940588580162',
    facebook_user_id: '612940588580162'
  }
};

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

/**
 * Test 1: Check if backend server is running
 */
async function testBackendServer() {
  logSection('TEST 1: Backend Server Health Check');
  
  try {
    const response = await axios.get(`${TEST_CONFIG.backendUrl}/health`, {
      timeout: 5000
    });
    
    log('✅ Backend server is running', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'blue');
    return true;
  } catch (error) {
    log('❌ Backend server is not accessible', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 2: Check if RAG server is running
 */
async function testRagServer() {
  logSection('TEST 2: RAG Server Health Check');
  
  try {
    const response = await axios.get(`${TEST_CONFIG.ragServerUrl}/health`, {
      timeout: 5000
    });
    
    log('✅ RAG server is running', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'blue');
    return true;
  } catch (error) {
    log('❌ RAG server is not accessible', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 3: Check Facebook token data
 */
async function testFacebookTokenData() {
  logSection('TEST 3: Facebook Token Data Check');
  
  try {
    const response = await axios.get(
      `${TEST_CONFIG.backendUrl}/facebook-connection/${TEST_CONFIG.facebookUserId}`,
      { timeout: 10000 }
    );
    
    log('✅ Facebook connection data retrieved', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Has Access Token: ${!!response.data.access_token}`, 'blue');
    log(`   Page ID: ${response.data.facebook_page_id}`, 'blue');
    log(`   User ID: ${response.data.facebook_user_id}`, 'blue');
    log(`   Is Personal Account: ${response.data.is_personal_account}`, 'blue');
    
    if (!response.data.access_token) {
      log('⚠️  No access token found', 'yellow');
      return false;
    }
    
    return true;
  } catch (error) {
    log('❌ Failed to retrieve Facebook connection data', 'red');
    log(`   Error: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

/**
 * Test 4: Test direct RAG server API call
 */
async function testDirectRagAPI() {
  logSection('TEST 4: Direct RAG Server API Call');
  
  try {
    log('📤 Sending test request to RAG server...', 'blue');
    
    const response = await axios.post(`${TEST_CONFIG.ragServerUrl}/api/instant-reply`, {
      username: TEST_CONFIG.testUsername,
      notification: TEST_CONFIG.testNotification
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    log('✅ RAG server responded successfully', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Success: ${response.data.success}`, 'blue');
    log(`   Reply Length: ${response.data.reply?.length || 0} characters`, 'blue');
    log(`   Reply Preview: ${response.data.reply?.substring(0, 100)}...`, 'blue');
    
    return response.data;
  } catch (error) {
    log('❌ RAG server API call failed', 'red');
    log(`   Error: ${error.response?.data?.error || error.message}`, 'red');
    if (error.response?.data) {
      log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return null;
  }
}

/**
 * Test 5: Test backend proxy endpoint
 */
async function testBackendProxy() {
  logSection('TEST 5: Backend Proxy Endpoint Test');
  
  try {
    log('📤 Sending test request to backend proxy...', 'blue');
    
    const response = await axios.post(`${TEST_CONFIG.backendUrl}/api/instant-reply`, {
      username: TEST_CONFIG.testUsername,
      notification: TEST_CONFIG.testNotification
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    log('✅ Backend proxy responded successfully', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Success: ${response.data.success}`, 'blue');
    log(`   AI Reply Length: ${response.data.aiReply?.length || 0} characters`, 'blue');
    log(`   AI Reply Preview: ${response.data.aiReply?.substring(0, 100)}...`, 'blue');
    
    return response.data;
  } catch (error) {
    log('❌ Backend proxy call failed', 'red');
    log(`   Error: ${error.response?.data?.error || error.message}`, 'red');
    if (error.response?.data) {
      log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return null;
  }
}

/**
 * Test 6: Test complete RAG instant reply endpoint
 */
async function testCompleteRagInstantReply() {
  logSection('TEST 6: Complete RAG Instant Reply Endpoint');
  
  try {
    log('📤 Sending test request to complete RAG instant reply endpoint...', 'blue');
    
    const response = await axios.post(
      `${TEST_CONFIG.backendUrl}/api/rag-instant-reply/${TEST_CONFIG.testUsername}`,
      TEST_CONFIG.testNotification,
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    log('✅ Complete RAG instant reply responded successfully', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Success: ${response.data.success}`, 'blue');
    log(`   Reply Length: ${response.data.reply?.length || 0} characters`, 'blue');
    log(`   Reply Preview: ${response.data.reply?.substring(0, 100)}...`, 'blue');
    log(`   Message: ${response.data.message}`, 'blue');
    
    return response.data;
  } catch (error) {
    log('❌ Complete RAG instant reply call failed', 'red');
    log(`   Error: ${error.response?.data?.error || error.message}`, 'red');
    if (error.response?.data) {
      log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return null;
  }
}

/**
 * Test 7: Simulate frontend RagService call
 */
async function testFrontendRagService() {
  logSection('TEST 7: Simulate Frontend RagService Call');
  
  try {
    log('📤 Simulating frontend RagService.sendInstantAIReply call...', 'blue');
    
    const conversation = [{
      role: "user", 
      content: TEST_CONFIG.testNotification.text
    }];
    
    const response = await axios.post(`${TEST_CONFIG.backendUrl}/api/instant-reply`, {
      username: TEST_CONFIG.testUsername,
      notification: {
        ...TEST_CONFIG.testNotification,
        platform: 'facebook'
      }
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      withCredentials: false
    });
    
    log('✅ Frontend simulation responded successfully', 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Success: ${response.data.success}`, 'blue');
    log(`   AI Reply Length: ${response.data.aiReply?.length || 0} characters`, 'blue');
    log(`   AI Reply Preview: ${response.data.aiReply?.substring(0, 100)}...`, 'blue');
    
    return response.data;
  } catch (error) {
    log('❌ Frontend simulation call failed', 'red');
    log(`   Error: ${error.response?.data?.error || error.message}`, 'red');
    if (error.response?.data) {
      log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return null;
  }
}

/**
 * Main test runner
 */
async function runDiagnosisTests() {
  log('🔍 FACEBOOK AI REPLY DIAGNOSIS TEST SUITE', 'bright');
  log('Testing complete pipeline from frontend to RAG server to Facebook API', 'blue');
  
  const results = {
    backendServer: false,
    ragServer: false,
    facebookToken: false,
    directRag: false,
    backendProxy: false,
    completeRag: false,
    frontendSim: false
  };
  
  // Run all tests
  results.backendServer = await testBackendServer();
  results.ragServer = await testRagServer();
  results.facebookToken = await testFacebookTokenData();
  results.directRag = !!(await testDirectRagAPI());
  results.backendProxy = !!(await testBackendProxy());
  results.completeRag = !!(await testCompleteRagInstantReply());
  results.frontendSim = !!(await testFrontendRagService());
  
  // Summary
  logSection('DIAGNOSIS SUMMARY');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${test.padEnd(20)} ${status}`, color);
  });
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  log(`\nOverall: ${passedTests}/${totalTests} tests passed`, passedTests === totalTests ? 'green' : 'yellow');
  
  // Specific diagnosis
  if (!results.backendServer) {
    log('\n🔧 ISSUE: Backend server is not running. Start with: npm run dev', 'red');
  }
  
  if (!results.ragServer) {
    log('\n🔧 ISSUE: RAG server is not running. Start with: node rag-server.js', 'red');
  }
  
  if (!results.facebookToken) {
    log('\n🔧 ISSUE: Facebook token not found or invalid. Reconnect Facebook account.', 'red');
  }
  
  if (!results.directRag && results.ragServer) {
    log('\n🔧 ISSUE: RAG server API endpoint not responding correctly.', 'red');
  }
  
  if (!results.backendProxy && results.backendServer && results.ragServer) {
    log('\n🔧 ISSUE: Backend proxy to RAG server not working correctly.', 'red');
  }
  
  if (!results.completeRag && results.backendServer && results.ragServer) {
    log('\n🔧 ISSUE: Complete RAG instant reply pipeline not working.', 'red');
  }
  
  if (!results.frontendSim && results.backendServer) {
    log('\n🔧 ISSUE: Frontend simulation failed - check CORS or request format.', 'red');
  }
  
  if (passedTests === totalTests) {
    log('\n🎉 ALL TESTS PASSED! Facebook AI reply system is working correctly.', 'green');
  }
  
  return results;
}

// Save test results
async function saveTestResults(results) {
  const timestamp = new Date().toISOString();
  const testReport = {
    timestamp,
    testSuite: 'Facebook AI Reply Diagnosis',
    results,
    configuration: TEST_CONFIG
  };
  
  try {
    fs.writeFileSync('facebook-ai-reply-diagnosis-report.json', JSON.stringify(testReport, null, 2));
    log('\n📄 Test report saved to facebook-ai-reply-diagnosis-report.json', 'blue');
  } catch (error) {
    log(`\n⚠️  Failed to save test report: ${error.message}`, 'yellow');
  }
}

// Run the tests
if (require.main === module) {
  runDiagnosisTests()
    .then(saveTestResults)
    .catch(error => {
      log(`\n💥 Test suite failed: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { runDiagnosisTests, TEST_CONFIG };
