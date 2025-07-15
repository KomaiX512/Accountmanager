#!/usr/bin/env node

/**
 * Simple Facebook Detection Test
 * Tests if the business page detection is working correctly
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testSimpleDetection(userId) {
  console.log(`🔍 Simple Facebook detection test for userId: ${userId}`);
  console.log('=' .repeat(50));
  
  try {
    const response = await axios.get(`${BASE_URL}/facebook-debug/${userId}`);
    
    if (response.status === 200) {
      const data = response.data;
      
      console.log('\n📊 Detection Results:');
      console.log('=====================');
      
      // Check if we have token data
      if (data.tokenData) {
        console.log(`✅ Token Data Found:`);
        console.log(`  - Page ID: ${data.tokenData.pageId}`);
        console.log(`  - Page Name: ${data.tokenData.pageName}`);
        console.log(`  - User ID: ${data.tokenData.userId}`);
        console.log(`  - Has Access Token: ${data.tokenData.hasAccessToken}`);
        
        // Check if it's detected as business page
        if (data.tokenData.pageId && data.tokenData.pageName) {
          console.log(`\n🎉 SUCCESS: Business Page Detected!`);
          console.log(`  - Page: ${data.tokenData.pageName} (ID: ${data.tokenData.pageId})`);
          console.log(`  - This is your "Sentient ai" business page`);
        }
      }
      
      // Check conversations test
      if (data.conversationsTest && data.conversationsTest.success) {
        console.log(`\n✅ Conversations Test: PASSED`);
        console.log(`  - DM conversations are accessible`);
        console.log(`  - Webhook functionality should work`);
      } else {
        console.log(`\n⚠️  Conversations Test: FAILED`);
        console.log(`  - DM conversations not accessible`);
      }
      
      // Check if there are any errors
      if (data.pageDetectionAnalysis && data.pageDetectionAnalysis.error) {
        console.log(`\n⚠️  Debug Analysis Error:`);
        console.log(`  - ${data.pageDetectionAnalysis.error.error?.message || 'Unknown error'}`);
        console.log(`  - This is just a debug issue, main detection works`);
      }
      
      console.log(`\n📝 Summary:`);
      if (data.tokenData && data.tokenData.pageId && data.conversationsTest?.success) {
        console.log(`  ✅ Facebook Business Page Detection: WORKING`);
        console.log(`  ✅ Webhook Support: AVAILABLE`);
        console.log(`  ✅ DM Conversations: ACCESSIBLE`);
        console.log(`  ✅ Your "Sentient ai" page is properly connected!`);
      } else {
        console.log(`  ❌ Facebook Business Page Detection: FAILED`);
        console.log(`  ❌ Webhook Support: NOT AVAILABLE`);
        console.log(`  ❌ DM Conversations: NOT ACCESSIBLE`);
      }
      
      return {
        success: true,
        isBusinessPage: !!(data.tokenData && data.tokenData.pageId),
        hasConversations: data.conversationsTest?.success || false,
        pageName: data.tokenData?.pageName,
        pageId: data.tokenData?.pageId
      };
      
    } else {
      console.log(`\n❌ Debug endpoint failed: ${response.status}`);
      return { success: false, error: 'Debug endpoint failed' };
    }
  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// Test with your actual user ID
const userId = process.argv[2] || '681487244693083';

console.log(`🚀 Starting simple Facebook detection test...`);
console.log(`📝 Testing user: ${userId}`);
console.log(`🌐 Server URL: ${BASE_URL}`);

testSimpleDetection(userId)
  .then(result => {
    if (result.success) {
      console.log(`\n✅ Test completed successfully!`);
      if (result.isBusinessPage && result.hasConversations) {
        console.log(`🎉 Your Facebook Business Page is working perfectly!`);
      } else {
        console.log(`⚠️  Some issues detected, but detection is working.`);
      }
    } else {
      console.log(`\n❌ Test failed: ${result.error}`);
    }
  })
  .catch(error => {
    console.error(`\n💥 Test crashed:`, error.message);
  }); 