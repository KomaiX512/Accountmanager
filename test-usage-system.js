#!/usr/bin/env node

/**
 * Comprehensive Usage Tracking System Test
 * 
 * This script tests the complete usage tracking pipeline:
 * 1. API endpoint usage tracking (post-generator, discussion, ai-reply, goal submission)
 * 2. Backend userId synchronization 
 * 3. Cross-device usage persistence
 * 
 * Usage: node test-usage-system.js [username] [platform]
 */

import axios from 'axios';

// Configuration
const BASE_URL = 'http://127.0.0.1:3000'; // Use IPv4 explicitly
const TEST_PLATFORM = process.argv[3] || 'instagram';
const TEST_USERNAME = process.argv[2] || 'fentybeauty'; // Default test user

console.log(`🚀 Testing Usage Tracking System for ${TEST_PLATFORM}/${TEST_USERNAME}`);
console.log(`📡 Base URL: ${BASE_URL}`);
console.log('=' .repeat(80));

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEndpoint(endpoint, method = 'POST', data = {}) {
  try {
    console.log(`\n🎯 Testing ${method} ${endpoint}`);
    console.log(`📤 Payload:`, JSON.stringify(data, null, 2));
    
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (method === 'POST') {
      config.data = data;
    }
    
    const response = await axios(config);
    
    console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
    console.log(`📥 Response:`, JSON.stringify(response.data, null, 2));
    
    return { success: true, data: response.data };
    
  } catch (error) {
    console.error(`❌ ${method} ${endpoint} - Error:`, error.response?.status, error.response?.statusText);
    console.error(`📥 Error Response:`, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function getUserIdFromPlatformUser(platform, username) {
  try {
    console.log(`\n🔍 Finding userId for ${platform}/${username}`);
    const response = await axios.get(`${BASE_URL}/api/users`);
    
    if (response.data) {
      const users = response.data;
      const user = users.find(u => {
        const connections = u.connections || {};
        return connections[platform]?.username === username;
      });
      
      if (user) {
        console.log(`✅ Found userId: ${user.userId} for ${platform}/${username}`);
        return user.userId;
      } else {
        console.log(`⚠️ No userId found for ${platform}/${username}, will use fallback`);
        return `${platform}_${username}`;
      }
    }
  } catch (error) {
    console.error(`❌ Error finding userId:`, error.response?.data || error.message);
    return `${platform}_${username}`;
  }
}

async function getUsageStats(userId) {
  try {
    console.log(`\n📊 Getting usage stats for userId: ${userId}`);
    const response = await axios.get(`${BASE_URL}/api/user/${userId}/usage`);
    
    if (response.status === 200) {
      console.log(`✅ Usage stats retrieved:`, response.data);
      return response.data;
    }
  } catch (error) {
    console.log(`⚠️ No existing usage stats found for ${userId} (this is normal for new users)`);
    return {
      postsUsed: 0,
      discussionsUsed: 0,
      aiRepliesUsed: 0,
      campaignsUsed: 0,
      resetsUsed: 0
    };
  }
}

async function runUsageTests() {
  console.log(`\n🏁 Starting comprehensive usage tracking tests...`);
  
  // Step 1: Get userId for the test user
  const userId = await getUserIdFromPlatformUser(TEST_PLATFORM, TEST_USERNAME);
  
  // Step 2: Get initial usage stats
  const initialUsage = await getUsageStats(userId);
  console.log(`\n📊 Initial usage stats:`, initialUsage);
  
  // Step 3: Test each feature API endpoint
  const tests = [
    {
      name: 'Post Generator API',
      endpoint: '/api/post-generator',
      feature: 'posts',
      payload: {
        username: TEST_USERNAME,
        platform: TEST_PLATFORM,
        prompt: 'Test post generation for usage tracking',
        style: 'casual',
        includeImage: true
      }
    },
    {
      name: 'Discussion API', 
      endpoint: '/api/discussion',
      feature: 'discussions',
      payload: {
        username: TEST_USERNAME,
        platform: TEST_PLATFORM,
        message: 'Test discussion message for usage tracking'
      }
    },
    {
      name: 'AI Reply API',
      endpoint: `/api/ai-reply/${TEST_USERNAME}`,
      feature: 'aiReplies',
      payload: {
        platform: TEST_PLATFORM,
        notification: {
          text: 'Test message for AI reply usage tracking',
          platform: TEST_PLATFORM
        }
      }
    },
    {
      name: 'Goal Submission API',
      endpoint: `/api/save-goal/${TEST_USERNAME}?platform=${TEST_PLATFORM}`,
      feature: 'campaigns',
      payload: {
        persona: 'Test persona',
        timeline: 7,
        goal: 'Test goal for usage tracking',
        instruction: 'Test instruction for campaign'
      }
    }
  ];
  
  const results = [];
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n` + '='.repeat(60));
    console.log(`🧪 TEST ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`🎯 Feature: ${test.feature}`);
    console.log('='.repeat(60));
    
    // Get usage before API call
    const usageBefore = await getUsageStats(userId);
    const beforeCount = usageBefore[test.feature + 'Used'] || 0;
    console.log(`📊 ${test.feature} usage before: ${beforeCount}`);
    
    // Call the API endpoint
    const apiResult = await testEndpoint(test.endpoint, 'POST', test.payload);
    
    // Wait for usage tracking to complete
    console.log(`⏳ Waiting 3 seconds for usage tracking to complete...`);
    await delay(3000);
    
    // Get usage after API call
    const usageAfter = await getUsageStats(userId);
    const afterCount = usageAfter[test.feature + 'Used'] || 0;
    console.log(`📊 ${test.feature} usage after: ${afterCount}`);
    
    const usageIncremented = afterCount > beforeCount;
    
    const testResult = {
      test: test.name,
      feature: test.feature,
      apiSuccess: apiResult.success,
      usageBefore: beforeCount,
      usageAfter: afterCount,
      usageIncremented,
      expectedAfter: beforeCount + 1,
      success: apiResult.success && usageIncremented
    };
    
    results.push(testResult);
    
    if (testResult.success) {
      console.log(`✅ ${test.name} - PASSED`);
      console.log(`   ✓ API call successful`);
      console.log(`   ✓ Usage incremented: ${beforeCount} → ${afterCount}`);
    } else {
      console.log(`❌ ${test.name} - FAILED`);
      if (!apiResult.success) {
        console.log(`   ✗ API call failed`);
      }
      if (!usageIncremented) {
        console.log(`   ✗ Usage not incremented: ${beforeCount} → ${afterCount}`);
      }
    }
  }
  
  // Final results summary
  console.log(`\n` + '='.repeat(80));
  console.log(`📋 FINAL TEST RESULTS SUMMARY`);
  console.log('='.repeat(80));
  
  const passedTests = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  console.log(`📊 Overall: ${passedTests}/${totalTests} tests passed`);
  console.log(`👤 Test User: ${TEST_PLATFORM}/${TEST_USERNAME} (userId: ${userId})`);
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${index + 1}. ${result.test} - ${status}`);
    console.log(`      Feature: ${result.feature}`);
    console.log(`      Usage: ${result.usageBefore} → ${result.usageAfter} (expected: ${result.expectedAfter})`);
    if (!result.success) {
      if (!result.apiSuccess) console.log(`      Issue: API call failed`);
      if (!result.usageIncremented) console.log(`      Issue: Usage not tracked`);
    }
  });
  
  // Get final usage stats
  const finalUsage = await getUsageStats(userId);
  console.log(`\n📊 Final usage stats:`, finalUsage);
  
  if (passedTests === totalTests) {
    console.log(`\n🎉 ALL TESTS PASSED! Usage tracking system is working correctly.`);
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${totalTests - passedTests} tests failed. Usage tracking needs attention.`);
    process.exit(1);
  }
}

// Run the tests
runUsageTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
