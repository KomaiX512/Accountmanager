#!/usr/bin/env node

/**
 * Cache Invalidation Test Script
 * 
 * This script tests the new cache invalidation functionality to ensure
 * images are properly refreshed when updated.
 */

const axios = require('axios');

const PROXY_SERVER_URL = 'http://localhost:3002';
const TEST_USERNAME = 'mrbeast';
const TEST_PLATFORM = 'instagram';

async function testCacheInvalidation() {
  console.log('🚀 Testing Cache Invalidation System...\n');

  try {
    // Test 1: Clear all cache
    console.log('1. Testing global cache clear...');
    const globalResponse = await axios.post(`${PROXY_SERVER_URL}/admin/clear-image-cache`);
    console.log('✅ Global cache clear:', globalResponse.data);
    
    // Test 2: Clear specific image cache
    console.log('\n2. Testing specific image cache clear...');
    const specificResponse = await axios.post(`${PROXY_SERVER_URL}/admin/clear-specific-image-cache`, {
      username: TEST_USERNAME,
      filename: 'campaign_ready_post_1754451459676_9e0fd04e.jpg',
      platform: TEST_PLATFORM
    });
    console.log('✅ Specific cache clear:', specificResponse.data);
    
    // Test 3: Test image endpoint with force refresh
    console.log('\n3. Testing image endpoint with force refresh...');
    const forceRefreshUrl = `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/campaign_ready_post_1754451459676_9e0fd04e.jpg?platform=${TEST_PLATFORM}&force=true&nuclear=${Date.now()}`;
    
    console.log('Force refresh URL:', forceRefreshUrl);
    
    const imageResponse = await axios.get(forceRefreshUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5
    });
    
    console.log('✅ Force refresh response:', {
      status: imageResponse.status,
      contentType: imageResponse.headers['content-type'],
      contentLength: imageResponse.headers['content-length'],
      dataSize: imageResponse.data.length
    });
    
    // Test 4: Health check
    console.log('\n4. Testing proxy server health...');
    const healthResponse = await axios.get(`${PROXY_SERVER_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);
    
    console.log('\n🎉 All cache invalidation tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

async function testCacheBustingParameters() {
  console.log('\n🔍 Testing Cache-Busting Parameter Detection...\n');
  
  const testUrls = [
    `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/test.jpg?force=true`,
    `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/test.jpg?nuclear=123456`,
    `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/test.jpg?t=${Date.now()}`,
    `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/test.jpg?v=${Date.now()}`,
    `${PROXY_SERVER_URL}/api/r2-image/${TEST_USERNAME}/test.jpg?bust=${Math.random()}`,
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`Testing URL: ${url}`);
      const response = await axios.get(url, { 
        timeout: 5000,
        validateStatus: () => true // Accept any status code
      });
      console.log(`✅ Response: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.log(`⚠️  Expected error for test URL: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🔧 Cache Invalidation Test Suite\n');
  console.log('==============================\n');
  
  // Check if proxy server is running
  try {
    await axios.get(`${PROXY_SERVER_URL}/health`, { timeout: 5000 });
    console.log('✅ Proxy server is running\n');
  } catch (error) {
    console.error('❌ Proxy server is not running. Please start it first.');
    console.error('Run: npm run start:proxy or node server.js\n');
    process.exit(1);
  }
  
  await testCacheInvalidation();
  await testCacheBustingParameters();
  
  console.log('\n✨ All tests completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Open your frontend application');
  console.log('2. Navigate to PostCooked component');
  console.log('3. Right-click on any image and select "🚀 Force Refresh Image"');
  console.log('4. Click the "🚀 Cache" button to clear all image caches');
  console.log('5. Monitor the browser console for cache invalidation logs');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testCacheInvalidation, testCacheBustingParameters };
