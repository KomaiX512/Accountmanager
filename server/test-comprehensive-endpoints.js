import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'yMHtLrsREFcQd5mjp3oafctloc72'; // From the frontend logs
const TEST_USERNAME = 'nike'; // From the frontend logs

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(name, success, details = '') {
  totalTests++;
  if (success) {
    passedTests++;
    log(`✅ ${name}`, colors.green);
  } else {
    failedTests++;
    log(`❌ ${name}`, colors.red);
    if (details) {
      log(`   Details: ${details}`, colors.yellow);
    }
  }
}

async function testEndpoint(method, path, expectedStatus = 200, data = null, description = '') {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    const success = response.status === expectedStatus;
    logTest(`${method} ${path} ${description}`, success, 
      success ? '' : `Expected ${expectedStatus}, got ${response.status}`);
    
    return { success, response };
  } catch (error) {
    logTest(`${method} ${path} ${description}`, false, error.message);
    return { success: false, error };
  }
}

async function runComprehensiveTests() {
  log('\n🚀 COMPREHENSIVE MODULAR SERVER ENDPOINT TEST SUITE', colors.bold + colors.blue);
  log('='.repeat(60), colors.blue);
  
  // Test 1: Health Check
  log('\n📊 1. HEALTH CHECK', colors.bold);
  await testEndpoint('GET', '/health', 200, null, 'Server health check');
  
  // Test 2: User Management Endpoints
  log('\n👤 2. USER MANAGEMENT ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/user/${TEST_USER_ID}`, 200, null, 'Get user data');
  await testEndpoint('PUT', `/api/user/${TEST_USER_ID}`, 200, { userType: 'freemium' }, 'Update user data');
  await testEndpoint('GET', `/api/user/${TEST_USER_ID}/usage`, 200, null, 'Get user usage');
  await testEndpoint('POST', `/api/access-check/${TEST_USER_ID}`, 200, { feature: 'posts' }, 'Check access');
  await testEndpoint('POST', `/api/usage/increment/${TEST_USER_ID}`, 200, { feature: 'posts' }, 'Increment usage');
  
  // Test 3: Username Availability (Critical from frontend logs)
  log('\n🔍 3. USERNAME AVAILABILITY ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/check-username-availability/${TEST_USERNAME}?platform=facebook`, 200, null, 'Check Facebook username availability');
  await testEndpoint('GET', `/api/check-username-availability/redbull?platform=facebook`, 200, null, 'Check another Facebook username');
  await testEndpoint('GET', `/api/check-username-availability/testuser?platform=instagram`, 200, null, 'Check Instagram username availability');
  
  // Test 4: Twitter Connection Endpoints (Critical from frontend logs)
  log('\n🐦 4. TWITTER CONNECTION ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/user-twitter-status/${TEST_USER_ID}`, 200, null, 'Get Twitter status');
  await testEndpoint('GET', `/api/twitter-connection/${TEST_USER_ID}`, 404, null, 'Get Twitter connection (should return 404 if not connected)');
  await testEndpoint('POST', `/api/twitter-connection/${TEST_USER_ID}`, 200, { 
    twitter_user_id: 'test_twitter_id', 
    username: 'test_twitter_user' 
  }, 'Store Twitter connection');
  
  // Test 5: Instagram Connection Endpoints (Critical from frontend logs)
  log('\n📷 5. INSTAGRAM CONNECTION ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/instagram-connection/${TEST_USER_ID}`, 404, null, 'Get Instagram connection (should return 404 if not connected)');
  await testEndpoint('POST', `/api/instagram-connection/${TEST_USER_ID}`, 200, {
    instagram_user_id: 'test_instagram_id',
    instagram_graph_id: 'test_graph_id',
    username: 'test_instagram_user'
  }, 'Store Instagram connection');
  
  // Test 6: Data Management Endpoints
  log('\n📊 6. DATA MANAGEMENT ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/profile-info/testuser`, 404, null, 'Get profile info (should return 404 if not found)');
  await testEndpoint('POST', `/api/save-account-info`, 400, { username: 'testuser' }, 'Save account info (should return 400 for incomplete data)');
  await testEndpoint('GET', `/api/retrieve-account-info/testuser`, 404, null, 'Retrieve account info (should return 404 if not found)');
  
  // Test 7: Social Media Endpoints
  log('\n📱 7. SOCIAL MEDIA ENDPOINTS', colors.bold);
  await testEndpoint('GET', `/api/posts/testuser`, 200, null, 'Get posts (should return empty array)');
  await testEndpoint('GET', `/api/rules/testuser`, 404, null, 'Get rules (should return 404 if not found)');
  await testEndpoint('GET', `/api/responses/testuser`, 200, null, 'Get responses (should return empty array)');
  
  // Test 8: Scheduler Endpoints
  log('\n⏰ 8. SCHEDULER ENDPOINTS', colors.bold);
  await testEndpoint('POST', `/api/schedule-post`, 400, { username: 'testuser' }, 'Schedule post (should return 400 for incomplete data)');
  
  // Test 9: Missing Endpoints (from missingEndpoints.js)
  log('\n🔧 9. MISSING ENDPOINTS', colors.bold);
  await testEndpoint('POST', `/api/rag-instant-reply/testuser`, 200, { message: 'test message' }, 'RAG instant reply');
  await testEndpoint('POST', `/api/mark-notification-handled/${TEST_USER_ID}`, 200, { notificationId: 'test_notification' }, 'Mark notification handled');
  await testEndpoint('POST', `/api/post-tweet-with-image/${TEST_USER_ID}`, 200, { text: 'test tweet' }, 'Post tweet with image');
  
  // Test 10: CORS and OPTIONS
  log('\n🌐 10. CORS AND OPTIONS', colors.bold);
  await testEndpoint('OPTIONS', `/api/user/${TEST_USER_ID}`, 204, null, 'CORS preflight for user endpoint');
  await testEndpoint('OPTIONS', `/api/instagram-connection/${TEST_USER_ID}`, 204, null, 'CORS preflight for Instagram endpoint');
  
  // Test 11: Error Handling
  log('\n⚠️ 11. ERROR HANDLING', colors.bold);
  await testEndpoint('GET', '/api/nonexistent-endpoint', 404, null, 'Non-existent endpoint should return 404');
  await testEndpoint('POST', `/api/user/invalid-user-id`, 500, null, 'Invalid user ID should handle gracefully');
  
  // Test 12: Image and Static Endpoints
  log('\n🖼️ 12. IMAGE AND STATIC ENDPOINTS', colors.bold);
  await testEndpoint('GET', '/placeholder.jpg', 200, null, 'Placeholder image endpoint');
  await testEndpoint('GET', '/fix-image-narsissist', 200, null, 'Special image handler');
  
  // Summary
  log('\n' + '='.repeat(60), colors.blue);
  log('📊 TEST SUMMARY', colors.bold + colors.blue);
  log(`Total Tests: ${totalTests}`, colors.blue);
  log(`✅ Passed: ${passedTests}`, colors.green);
  log(`❌ Failed: ${failedTests}`, colors.red);
  
  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  log(`📈 Success Rate: ${successRate}%`, colors.bold + (successRate >= 90 ? colors.green : colors.yellow));
  
  if (failedTests === 0) {
    log('\n🎉 ALL TESTS PASSED! The modular server is fully compatible!', colors.bold + colors.green);
  } else {
    log(`\n⚠️  ${failedTests} tests failed. Check the details above.`, colors.bold + colors.yellow);
  }
  
  log('\n' + '='.repeat(60), colors.blue);
}

// Run the tests
runComprehensiveTests().catch(error => {
  log(`\n💥 Test suite failed to run: ${error.message}`, colors.red);
  process.exit(1);
}); 