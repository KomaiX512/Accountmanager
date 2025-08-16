#!/usr/bin/env node

/**
 * 🔥 COMPREHENSIVE SYNCHRONIZATION TEST SCRIPT
 * 
 * This script tests the cross-device synchronization for:
 * 1. Platform loading state (Acquiring)
 * 2. Platform claimed status (Acquired/Not Acquired)
 * 3. Platform reset functionality
 * 
 * Run this script to verify your implementation works correctly.
 */

const fetch = require('node-fetch');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000', // Change this to your server URL
  userId: 'test-user-123', // Change this to a real user ID for testing
  platform: 'instagram',
  testDuration: 30000, // 30 seconds
  syncInterval: 1000, // Check sync every 1 second
};

// Test state
let testResults = {
  backendSync: { success: false, error: null },
  processingStatus: { success: false, error: null },
  platformAccess: { success: false, error: null },
  resetFunctionality: { success: false, error: null },
  crossDeviceSync: { success: false, error: null },
};

// Utility functions
const log = (message, type = 'INFO') => {
  const timestamp = new Date().toISOString();
  const emoji = type === 'ERROR' ? '❌' : type === 'SUCCESS' ? '✅' : type === 'WARNING' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${emoji} ${message}`);
};

const testEndpoint = async (endpoint, method = 'GET', body = null) => {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Test 1: Backend Sync Test
const testBackendSync = async () => {
  log('Testing backend synchronization endpoints...');
  
  try {
    // Test processing status endpoint
    const processingStatus = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}`);
    if (processingStatus.success) {
      log('Processing status endpoint working', 'SUCCESS');
    } else {
      log(`Processing status endpoint failed: ${processingStatus.error || processingStatus.status}`, 'ERROR');
      return false;
    }
    
    // Test platform access endpoint
    const platformAccess = await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}`);
    if (platformAccess.success) {
      log('Platform access endpoint working', 'SUCCESS');
    } else {
      log(`Platform access endpoint failed: ${platformAccess.error || platformAccess.status}`, 'ERROR');
      return false;
    }
    
    // Test platform reset endpoint
    const platformReset = await testEndpoint(`/api/platform-reset/${TEST_CONFIG.userId}`, 'DELETE', { platform: TEST_CONFIG.platform });
    if (platformReset.success) {
      log('Platform reset endpoint working', 'SUCCESS');
    } else {
      log(`Platform reset endpoint failed: ${platformReset.error || platformReset.status}`, 'ERROR');
      return false;
    }
    
    testResults.backendSync = { success: true, error: null };
    return true;
  } catch (error) {
    testResults.backendSync = { success: false, error: error.message };
    log(`Backend sync test failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Test 2: Processing Status Test
const testProcessingStatus = async () => {
  log('Testing processing status functionality...');
  
  try {
    // Start a processing timer
    const startTime = Date.now();
    const endTime = startTime + (5 * 60 * 1000); // 5 minutes
    
    const startResponse = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}`, 'POST', {
      platform: TEST_CONFIG.platform,
      startTime,
      endTime,
      totalDuration: 5 * 60 * 1000,
      username: 'testuser'
    });
    
    if (!startResponse.success) {
      log(`Failed to start processing: ${startResponse.error || startResponse.status}`, 'ERROR');
      return false;
    }
    
    log('Processing timer started successfully', 'SUCCESS');
    
    // Verify the timer is active
    const statusResponse = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    if (!statusResponse.success) {
      log(`Failed to get processing status: ${statusResponse.error || statusResponse.status}`, 'ERROR');
      return false;
    }
    
    if (statusResponse.data && statusResponse.data.endTime === endTime) {
      log('Processing status correctly saved and retrieved', 'SUCCESS');
    } else {
      log('Processing status mismatch', 'ERROR');
      return false;
    }
    
    // Clean up the test timer
    await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}`, 'DELETE', { platform: TEST_CONFIG.platform });
    log('Processing timer cleaned up', 'SUCCESS');
    
    testResults.processingStatus = { success: true, error: null };
    return true;
  } catch (error) {
    testResults.processingStatus = { success: false, error: error.message };
    log(`Processing status test failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Test 3: Platform Access Test
const testPlatformAccess = async () => {
  log('Testing platform access functionality...');
  
  try {
    // Set platform as claimed
    const claimResponse = await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}`, 'POST', {
      platform: TEST_CONFIG.platform,
      claimed: true,
      username: 'testuser'
    });
    
    if (!claimResponse.success) {
      log(`Failed to claim platform: ${claimResponse.error || claimResponse.status}`, 'ERROR');
      return false;
    }
    
    log('Platform claimed successfully', 'SUCCESS');
    
    // Verify the claim is active
    const statusResponse = await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    if (!statusResponse.success) {
      log(`Failed to get platform access status: ${statusResponse.error || statusResponse.status}`, 'ERROR');
      return false;
    }
    
    if (statusResponse.data && statusResponse.data.claimed === true) {
      log('Platform access status correctly saved and retrieved', 'SUCCESS');
    } else {
      log('Platform access status mismatch', 'ERROR');
      return false;
    }
    
    // Clean up the test claim
    await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}`, 'DELETE', { platform: TEST_CONFIG.platform });
    log('Platform access cleaned up', 'SUCCESS');
    
    testResults.platformAccess = { success: true, error: null };
    return true;
  } catch (error) {
    testResults.platformAccess = { success: false, error: error.message };
    log(`Platform access test failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Test 4: Reset Functionality Test
const testResetFunctionality = async () => {
  log('Testing platform reset functionality...');
  
  try {
    // First, set up a platform with both processing status and access status
    const startTime = Date.now();
    const endTime = startTime + (5 * 60 * 1000);
    
    // Start processing
    await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}`, 'POST', {
      platform: TEST_CONFIG.platform,
      startTime,
      endTime,
      totalDuration: 5 * 60 * 1000,
      username: 'testuser'
    });
    
    // Claim platform
    await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}`, 'POST', {
      platform: TEST_CONFIG.platform,
      claimed: true,
      username: 'testuser'
    });
    
    log('Test platform setup completed', 'SUCCESS');
    
    // Now test the reset
    const resetResponse = await testEndpoint(`/api/platform-reset/${TEST_CONFIG.userId}`, 'DELETE', {
      platform: TEST_CONFIG.platform
    });
    
    if (!resetResponse.success) {
      log(`Platform reset failed: ${resetResponse.error || resetResponse.status}`, 'ERROR');
      return false;
    }
    
    log('Platform reset completed', 'SUCCESS');
    
    // Verify both statuses are cleared
    const processingStatus = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    const platformAccess = await testEndpoint(`/api/platform-access/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    
    if (processingStatus.data === null && platformAccess.data === null) {
      log('Platform reset successfully cleared all statuses', 'SUCCESS');
      testResults.resetFunctionality = { success: true, error: null };
      return true;
    } else {
      log('Platform reset did not clear all statuses', 'ERROR');
      return false;
    }
  } catch (error) {
    testResults.resetFunctionality = { success: false, error: error.message };
    log(`Reset functionality test failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Test 5: Cross-Device Sync Simulation
const testCrossDeviceSync = async () => {
  log('Testing cross-device synchronization...');
  
  try {
    // Simulate device 1 starting a process
    const startTime = Date.now();
    const endTime = startTime + (3 * 60 * 1000); // 3 minutes
    
    await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}`, 'POST', {
      platform: TEST_CONFIG.platform,
      startTime,
      endTime,
      totalDuration: 3 * 60 * 1000,
      username: 'testuser'
    });
    
    log('Device 1 started processing', 'SUCCESS');
    
    // Simulate device 2 checking the status
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const device2Status = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    
    if (device2Status.success && device2Status.data && device2Status.data.endTime === endTime) {
      log('Device 2 correctly sees the processing status', 'SUCCESS');
    } else {
      log('Device 2 failed to see processing status', 'ERROR');
      return false;
    }
    
    // Simulate device 1 resetting the platform
    await testEndpoint(`/api/platform-reset/${TEST_CONFIG.userId}`, 'DELETE', {
      platform: TEST_CONFIG.platform
    });
    
    log('Device 1 reset the platform', 'SUCCESS');
    
    // Simulate device 2 checking again
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const device2StatusAfterReset = await testEndpoint(`/api/processing-status/${TEST_CONFIG.userId}?platform=${TEST_CONFIG.platform}`);
    
    if (device2StatusAfterReset.success && device2StatusAfterReset.data === null) {
      log('Device 2 correctly sees the reset status', 'SUCCESS');
      testResults.crossDeviceSync = { success: true, error: null };
      return true;
    } else {
      log('Device 2 failed to see reset status', 'ERROR');
      return false;
    }
  } catch (error) {
    testResults.crossDeviceSync = { success: false, error: error.message };
    log(`Cross-device sync test failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Main test runner
const runTests = async () => {
  log('🚀 Starting comprehensive synchronization tests...', 'INFO');
  log(`Testing with user ID: ${TEST_CONFIG.userId}`, 'INFO');
  log(`Testing platform: ${TEST_CONFIG.platform}`, 'INFO');
  log(`Server URL: ${TEST_CONFIG.baseUrl}`, 'INFO');
  
  const startTime = Date.now();
  
  try {
    // Run all tests
    const backendSyncResult = await testBackendSync();
    const processingStatusResult = await testProcessingStatus();
    const platformAccessResult = await testPlatformAccess();
    const resetFunctionalityResult = await testResetFunctionality();
    const crossDeviceSyncResult = await testCrossDeviceSync();
    
    // Calculate results
    const totalTests = 5;
    const passedTests = [backendSyncResult, processingStatusResult, platformAccessResult, resetFunctionalityResult, crossDeviceSyncResult].filter(Boolean).length;
    
    const duration = Date.now() - startTime;
    
    // Print summary
    log('📊 Test Results Summary:', 'INFO');
    log(`Duration: ${duration}ms`, 'INFO');
    log(`Tests Passed: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'SUCCESS' : 'WARNING');
    
    Object.entries(testResults).forEach(([testName, result]) => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      const error = result.error ? ` (${result.error})` : '';
      log(`${testName}: ${status}${error}`, result.success ? 'SUCCESS' : 'ERROR');
    });
    
    if (passedTests === totalTests) {
      log('🎉 All tests passed! Your synchronization is working correctly.', 'SUCCESS');
      log('💡 You can now test with real devices using the same user ID.', 'INFO');
    } else {
      log('⚠️ Some tests failed. Check the errors above and fix the issues.', 'WARNING');
    }
    
  } catch (error) {
    log(`Test runner failed: ${error.message}`, 'ERROR');
  }
};

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testResults };
