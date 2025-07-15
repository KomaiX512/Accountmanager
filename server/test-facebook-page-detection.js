#!/usr/bin/env node

/**
 * Facebook Page Detection Test Script
 * Tests the enhanced page detection logic for Facebook Business Pages
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testPageDetection(userId) {
  console.log(`🔍 Testing Facebook page detection for userId: ${userId}`);
  
  try {
    const response = await axios.get(`${BASE_URL}/facebook-debug/${userId}`);
    
    if (response.status === 200) {
      const data = response.data;
      
      console.log('\n📊 Page Detection Analysis:');
      console.log('==========================');
      
      // Token data analysis
      console.log(`\n🔑 Token Data:`);
      console.log(`  - Page ID: ${data.tokenData.pageId}`);
      console.log(`  - Page Name: ${data.tokenData.pageName}`);
      console.log(`  - User ID: ${data.tokenData.userId}`);
      console.log(`  - Is Personal Account: ${data.tokenData.isPersonalAccount}`);
      console.log(`  - Detection Method: ${data.tokenData.pageDetectionMethod}`);
      
      // Page detection analysis
      if (data.pageDetectionAnalysis && !data.pageDetectionAnalysis.error) {
        const analysis = data.pageDetectionAnalysis.analysis;
        console.log(`\n🔍 Page Detection Analysis:`);
        console.log(`  - Is Page: ${analysis.isPage}`);
        console.log(`  - Has Pages List: ${analysis.hasPagesList}`);
        console.log(`  - Page Type: ${analysis.pageType}`);
        console.log(`  - Category: ${analysis.category}`);
        console.log(`  - Fan Count: ${analysis.fanCount}`);
        console.log(`  - Followers Count: ${analysis.followersCount}`);
        console.log(`  - Should Be Business Page: ${analysis.shouldBeBusinessPage}`);
        
        // Determine if detection is correct
        const isCorrectlyDetected = analysis.shouldBeBusinessPage === !data.tokenData.isPersonalAccount;
        
        console.log(`\n✅ Detection Result:`);
        if (isCorrectlyDetected) {
          console.log(`  🎉 CORRECTLY DETECTED!`);
          console.log(`  - Expected: ${analysis.shouldBeBusinessPage ? 'Business Page' : 'Personal Account'}`);
          console.log(`  - Actual: ${data.tokenData.isPersonalAccount ? 'Personal Account' : 'Business Page'}`);
        } else {
          console.log(`  ⚠️  INCORRECTLY DETECTED!`);
          console.log(`  - Expected: ${analysis.shouldBeBusinessPage ? 'Business Page' : 'Personal Account'}`);
          console.log(`  - Actual: ${data.tokenData.isPersonalAccount ? 'Personal Account' : 'Business Page'}`);
          console.log(`  - Issue: Page has business characteristics but was detected as personal account`);
        }
        
        return {
          success: true,
          correctlyDetected: isCorrectlyDetected,
          analysis: analysis,
          tokenData: data.tokenData
        };
      } else {
        console.log(`\n❌ Page Detection Analysis Failed:`);
        console.log(`  - Error: ${data.pageDetectionAnalysis?.error || 'Unknown error'}`);
        return {
          success: false,
          error: data.pageDetectionAnalysis?.error
        };
      }
    } else {
      console.log(`❌ Debug request failed: ${response.status}`);
      return { success: false, error: 'Debug request failed' };
    }
  } catch (error) {
    console.log(`❌ Test failed: ${error.response?.data || error.message}`);
    return { success: false, error: error.message };
  }
}

async function testMultipleUsers(userIds) {
  console.log('🚀 Starting Facebook page detection tests...\n');
  
  const results = [];
  
  for (const userId of userIds) {
    console.log(`\n📋 Testing user: ${userId}`);
    const result = await testPageDetection(userId);
    results.push({ userId, ...result });
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  const successfulTests = results.filter(r => r.success);
  const correctlyDetected = successfulTests.filter(r => r.correctlyDetected);
  
  results.forEach(result => {
    const status = result.success ? 
      (result.correctlyDetected ? '✅ CORRECT' : '⚠️  INCORRECT') : 
      '❌ FAILED';
    console.log(`${status} - User: ${result.userId}`);
  });
  
  console.log(`\n🎯 Overall Results:`);
  console.log(`  - Total Tests: ${results.length}`);
  console.log(`  - Successful: ${successfulTests.length}`);
  console.log(`  - Correctly Detected: ${correctlyDetected.length}`);
  console.log(`  - Accuracy: ${successfulTests.length > 0 ? Math.round((correctlyDetected.length / successfulTests.length) * 100) : 0}%`);
  
  return results;
}

// Test specific users (replace with actual user IDs)
const testUserIds = [
  '94THUToVmtdKGNcq4A5cTONerxI3', // Your user ID from the logs
  // Add more user IDs to test
];

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2]) {
    // Test specific user
    testPageDetection(process.argv[2]).then(result => {
      process.exit(result.success && result.correctlyDetected ? 0 : 1);
    });
  } else {
    // Test multiple users
    testMultipleUsers(testUserIds).then(results => {
      const allCorrect = results.every(r => r.success && r.correctlyDetected);
      process.exit(allCorrect ? 0 : 1);
    });
  }
}

export { testPageDetection, testMultipleUsers }; 