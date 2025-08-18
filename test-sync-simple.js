#!/usr/bin/env node

// Simple Cross-Device Sync Test
import axios from 'axios';

const TEST_USER_ID = 'test-sync-user';
const TEST_PLATFORM = 'instagram';
const BACKEND_URL = 'http://localhost:3000';

async function testSync() {
  console.log('🔍 Testing Cross-Device Loading State Sync...\n');

  try {
    // 1. Clean up any existing state
    console.log('1. Cleaning up existing state...');
    try {
      await axios.delete(`${BACKEND_URL}/api/processing-status/${TEST_USER_ID}`, {
        data: { platform: TEST_PLATFORM }
      });
      console.log('   ✅ Cleanup successful');
    } catch (e) {
      console.log('   ℹ️ No existing state to clean');
    }

    // 2. Create a loading state (simulate Device A)
    console.log('\n2. Device A: Creating 15-minute loading state...');
    const startTime = Date.now();
    const endTime = startTime + (15 * 60 * 1000);
    
    const createResponse = await axios.post(`${BACKEND_URL}/api/processing-status/${TEST_USER_ID}`, {
      platform: TEST_PLATFORM,
      startTime,
      endTime,
      totalDuration: 15 * 60 * 1000,
      username: 'testuser'
    });

    if (createResponse.status === 200) {
      console.log('   ✅ Loading state created successfully');
      console.log(`   ⏰ Processing until: ${new Date(endTime).toLocaleTimeString()}`);
    } else {
      throw new Error(`Failed to create loading state: ${createResponse.status}`);
    }

    // 3. Test Device B dashboard access validation
    console.log('\n3. Device B: Testing dashboard access validation...');
    const validationResponse = await axios.post(`${BACKEND_URL}/api/validate-dashboard-access/${TEST_USER_ID}`, {
      platform: TEST_PLATFORM
    });

    console.log('   📋 Validation Response:', JSON.stringify(validationResponse.data, null, 2));

    if (validationResponse.data.success && validationResponse.data.accessAllowed === false) {
      console.log('   ✅ SUCCESS: Device B dashboard access correctly DENIED');
      console.log(`   🔄 Should redirect to: ${validationResponse.data.redirectTo}`);
      
      const remainingMin = validationResponse.data.processingData?.remainingMinutes;
      if (remainingMin) {
        console.log(`   ⏱️ Remaining time: ${remainingMin} minutes`);
      }
    } else if (validationResponse.data.accessAllowed === true) {
      console.log('   ❌ PROBLEM: Device B dashboard access ALLOWED (should be denied)');
      console.log('   🚨 This means Device B can skip the loading state!');
    } else {
      console.log('   ⚠️ UNEXPECTED: Validation response format unexpected');
    }

    // 4. Test processing status retrieval
    console.log('\n4. Device B: Testing processing status retrieval...');
    const statusResponse = await axios.get(`${BACKEND_URL}/api/processing-status/${TEST_USER_ID}?platform=${TEST_PLATFORM}`);

    if (statusResponse.status === 200 && statusResponse.data.data) {
      console.log('   ✅ SUCCESS: Device B can retrieve processing status from backend');
      const data = statusResponse.data.data;
      const now = Date.now();
      const remaining = Math.ceil((data.endTime - now) / 1000 / 60);
      console.log(`   ⏱️ Backend says: ${remaining} minutes remaining`);
    } else {
      console.log('   ❌ PROBLEM: Device B cannot retrieve processing status');
      console.log('   📋 Response:', statusResponse.status, statusResponse.data);
    }

    // 5. Final cleanup
    console.log('\n5. Cleaning up test state...');
    await axios.delete(`${BACKEND_URL}/api/processing-status/${TEST_USER_ID}`, {
      data: { platform: TEST_PLATFORM }
    });
    console.log('   ✅ Cleanup completed');

    console.log('\n📊 TEST SUMMARY:');
    console.log('================');
    
    if (validationResponse.data.accessAllowed === false) {
      console.log('🎉 SYNC WORKING: Device B correctly respects Device A\'s loading state');
    } else {
      console.log('💥 SYNC BROKEN: Device B can bypass Device A\'s loading state');
      console.log('\n🔧 DEBUGGING STEPS:');
      console.log('1. Check LoadingStateGuard.tsx - ensure it calls backend validation');
      console.log('2. Check AuthContext.tsx - ensure syncProcessingStatusFromBackend() works');
      console.log('3. Check Processing.tsx - ensure it syncs state to backend');
      console.log('4. Verify validate-dashboard-access endpoint in server/server.js');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.status, error.response.data);
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${BACKEND_URL}/health`);
    return true;
  } catch (error) {
    console.error('❌ Main server not running on port 3000');
    console.error('   Please start: npm run start');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  await testSync();
}

main().catch(console.error);
