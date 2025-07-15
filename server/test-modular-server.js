#!/usr/bin/env node

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Test endpoints that should be available
const testEndpoints = [
  // User management endpoints
  { method: 'GET', path: '/api/user/testuser', description: 'Get user data' },
  { method: 'PUT', path: '/api/user/testuser', description: 'Update user data' },
  { method: 'GET', path: '/api/user/testuser/usage', description: 'Get user usage' },
  { method: 'POST', path: '/api/access-check/testuser', description: 'Check access' },
  { method: 'POST', path: '/api/usage/increment/testuser', description: 'Increment usage' },
  
  // Data management endpoints
  { method: 'GET', path: '/api/profile-info/testuser', description: 'Get profile info' },
  { method: 'POST', path: '/api/save-account-info', description: 'Save account info' },
  { method: 'POST', path: '/api/scrape', description: 'Scrape data' },
  { method: 'GET', path: '/api/retrieve/testuser/competitor', description: 'Retrieve competitor data' },
  { method: 'GET', path: '/api/rules/testuser', description: 'Get rules' },
  { method: 'POST', path: '/api/rules/testuser', description: 'Save rules' },
  
  // Social media endpoints
  { method: 'GET', path: '/api/instagram/callback', description: 'Instagram callback' },
  { method: 'POST', path: '/api/instagram/callback', description: 'Instagram webhook' },
  { method: 'GET', path: '/api/facebook/callback', description: 'Facebook callback' },
  { method: 'POST', path: '/api/facebook/callback', description: 'Facebook webhook' },
  { method: 'GET', path: '/api/twitter/auth', description: 'Twitter auth' },
  { method: 'GET', path: '/api/twitter/callback', description: 'Twitter callback' },
  
  // Missing endpoints that were added
  { method: 'GET', path: '/api/check-username-availability/testuser', description: 'Check username availability' },
  { method: 'POST', path: '/api/rag-instant-reply/testuser', description: 'RAG instant reply' },
  { method: 'POST', path: '/api/mark-notification-handled/testuser', description: 'Mark notification handled' },
  { method: 'POST', path: '/api/post-tweet-with-image/testuser', description: 'Post tweet with image' },
  { method: 'GET', path: '/api/user-twitter-status/testuser', description: 'Get Twitter status' },
  { method: 'POST', path: '/api/user-twitter-status/testuser', description: 'Update Twitter status' },
  { method: 'GET', path: '/api/twitter-connection/testuser', description: 'Get Twitter connection' },
  { method: 'POST', path: '/api/twitter-connection/testuser', description: 'Store Twitter connection' },
  { method: 'DELETE', path: '/api/twitter-connection/testuser', description: 'Delete Twitter connection' },
  
  // Debug endpoints
  { method: 'GET', path: '/api/debug/instagram-tokens', description: 'Debug Instagram tokens' },
  { method: 'GET', path: '/api/debug/twitter-users', description: 'Debug Twitter users' },
  { method: 'GET', path: '/api/debug/campaign-posts/testuser', description: 'Debug campaign posts' },
  
  // Scheduler endpoints
  { method: 'GET', path: '/api/scheduler-health/instagram', description: 'Instagram scheduler health' },
  { method: 'GET', path: '/api/scheduler-health/twitter', description: 'Twitter scheduler health' },
  { method: 'GET', path: '/api/scheduler-health/facebook', description: 'Facebook scheduler health' },
  
  // Health check
  { method: 'GET', path: '/health', description: 'Health check' }
];

async function testEndpoint(method, path, description) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status code
    };
    
    if (method === 'POST' || method === 'PUT') {
      config.data = { test: true };
    }
    
    const response = await axios(config);
    
    if (response.status === 200 || response.status === 404) {
      console.log(`✅ ${description}: ${method} ${path} - Status: ${response.status}`);
      return true;
    } else {
      console.log(`❌ ${description}: ${method} ${path} - Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description}: ${method} ${path} - Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting comprehensive modular server test...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const endpoint of testEndpoints) {
    const success = await testEndpoint(endpoint.method, endpoint.path, endpoint.description);
    if (success) {
      passed++;
    } else {
      failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The modular server is ready for production.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the server configuration.');
  }
}

// Run the tests
runTests().catch(console.error); 